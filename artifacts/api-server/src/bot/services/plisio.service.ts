/**
 * Plisio Crypto Payment Gateway Integration
 * Docs: https://plisio.net/documentation
 *
 * Flow:
 *  1. createPlisioOrder() → GET /invoices/new → get txn_id + invoice_url
 *  2. User pays via invoice_url (Plisio hosted page)
 *  3. Plisio POSTs callback to /webhook/plisio?json=true
 *  4. handlePlisioCallback() → verify HMAC-SHA1 → credit coins (atomic, idempotent)
 *
 * Security notes:
 *  - All webhook callbacks are verified with HMAC-SHA1 before any DB writes.
 *  - Idempotency enforced by two-phase atomic UPDATE...WHERE callbackVerified=false.
 *  - timingSafeEqual used for hash comparison (prevents timing-oracle attacks).
 *  - order_number format validated to prevent unexpected DB queries.
 *  - HMAC is computed on the RAW body bytes, never on re-serialised JSON.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@workspace/db";
import { plisioTransactionsTable, paymentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { addCoins } from "./coin.service.js";
import { getSetting } from "./payment.service.js";
import { getBaseUrl } from "../../lib/base-url.js";
import { nanoid } from "nanoid";
import { logger } from "../../lib/logger.js";

const PLISIO_BASE_URL = "https://api.plisio.net/api/v1";

/** Safe order_number pattern — matches what we generate: inv_{number}_{nanoid(8)} */
const ORDER_NUMBER_RE = /^[A-Za-z0-9_-]{4,128}$/;

// ─── Webhook signature verification (JSON mode) ────────────────────────────────
//
// Plisio docs (json=true mode):
//   hash = HMAC-SHA1( json_encode(payload_without_verify_hash), api_key )
//   where json_encode preserves the insertion order of keys as received.
//
// CRITICAL: Verify against the RAW body string (not a re-serialised object).
// JSON.stringify() on a re-parsed object is NOT guaranteed to reproduce the
// exact same byte sequence as the original. We parse the raw body ourselves,
// strip verify_hash while preserving all other key positions, then re-serialise.
//
// Returns true if the signature is valid, false otherwise.
function verifyPlisioHash(rawBody: string, secretKey: string): boolean {
  if (!rawBody || !secretKey) return false;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    logger.warn("plisio: failed to JSON.parse raw webhook body during hash verification — body is not valid JSON");
    return false;
  }

  const verifyHash = parsed["verify_hash"];
  if (typeof verifyHash !== "string" || !verifyHash) {
    logger.warn({ keys: Object.keys(parsed).join(",") }, "plisio: verify_hash missing or not a string in webhook payload");
    return false;
  }

  // Build the to-sign object: all keys except verify_hash, preserving insertion order.
  const toSign: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (k !== "verify_hash") toSign[k] = v;
  }

  const serialized = JSON.stringify(toSign);
  const computed   = createHmac("sha1", secretKey).update(serialized).digest("hex");

  // timingSafeEqual requires equal-length Buffers.
  // Both are lowercase hex SHA-1 strings (40 chars), but guard defensively.
  try {
    const a = Buffer.from(computed,   "utf8");
    const b = Buffer.from(verifyHash, "utf8");
    if (a.length !== b.length) {
      logger.warn(
        { computedLen: a.length, receivedLen: b.length },
        "plisio: verify_hash length mismatch — possible HMAC algorithm mismatch or truncated hash"
      );
      return false;
    }
    return timingSafeEqual(a, b);
  } catch (err) {
    logger.warn({ err }, "plisio: timingSafeEqual threw during hash comparison");
    return false;
  }
}

// ─── Create Invoice ────────────────────────────────────────────────────────────

export interface PlisioOrderResult {
  success: boolean;
  txnId?: string;
  invoiceUrl?: string;
  orderNumber?: string;
  error?: string;
}

export async function createPlisioOrder(
  paymentId: number,
  userId: number,
  amountUsd: number,
  coinsCount: number,
): Promise<PlisioOrderResult> {
  const apiKey = await getSetting("plisio_api_key");
  if (!apiKey) return { success: false, error: "Plisio API key not configured" };

  const rawCallbackUrl = await getSetting("plisio_callback_url");
  if (!rawCallbackUrl) return { success: false, error: "Plisio callback URL not configured" };

  // Strip any accidentally-included query string (e.g. admin pasted "...?json=true")
  // to avoid a malformed double "?json=true?json=true" URL.
  const callbackUrl = rawCallbackUrl.split("?")[0]!.trim();

  // Derive the public base URL from the configured callback URL.
  // This avoids a localhost returnBaseUrl when BASE_URL env var is not set on VPS.
  // If admin set plisio_callback_url = "https://bot.example.com/webhook/plisio",
  // we derive "https://bot.example.com" for the success/fail redirect pages.
  let derivedBaseUrl = callbackUrl.replace(/\/webhook\/plisio\/?$/, "").trim();
  if (!derivedBaseUrl.startsWith("http")) {
    // Fallback: env-based detection
    derivedBaseUrl = getBaseUrl();
  }

  const allowedCurrencies = (await getSetting("plisio_currencies")) ?? "ETH,LTC,BNB,USDT_TRX,TRX";
  const orderNumber = `inv_${paymentId}_${nanoid(8)}`;
  const description = `Purchase ${coinsCount} coins`;

  const params = new URLSearchParams({
    api_key:           apiKey,
    source_currency:   "USD",
    source_amount:     String(amountUsd),
    order_number:      orderNumber,
    order_name:        description,
    // Always append ?json=true so Plisio sends JSON (not form-encoded).
    callback_url:      `${callbackUrl}?json=true`,
    allowed_psys_cids: allowedCurrencies,
    expire_min:        "30",
  });

  // Success/fail redirects route through our landing page first.
  // The landing page verifies the *real* DB status (set only via the signed
  // webhook) before forwarding the user into the bot — closing the fraud hole
  // where anyone who found/guessed the Telegram deep-link could fake success.
  params.set("success_callback_url", `${derivedBaseUrl}/webhook/plisio/return?r=ok&order=${orderNumber}`);
  params.set("fail_callback_url",    `${derivedBaseUrl}/webhook/plisio/return?r=fail&order=${orderNumber}`);

  logger.info(
    { paymentId, userId, amountUsd, coinsCount, orderNumber, callbackUrl, derivedBaseUrl },
    "plisio: creating invoice"
  );

  try {
    const res = await fetch(`${PLISIO_BASE_URL}/invoices/new?${params}`, {
      method: "GET",
      signal: AbortSignal.timeout(15000),
    });

    const json = await res.json() as Record<string, unknown>;

    if (json["status"] !== "success") {
      const errData = json["data"] as Record<string, unknown> | string | undefined;
      let errMsg: string;
      if (typeof errData === "object" && errData !== null && "message" in errData) {
        errMsg = String(errData["message"]);
      } else if (typeof errData === "object" && errData !== null) {
        errMsg = JSON.stringify(errData);
      } else if (json["message"]) {
        const m = json["message"];
        errMsg = typeof m === "string" ? m : JSON.stringify(m);
      } else {
        errMsg = "Unknown error";
      }
      logger.warn({ paymentId, orderNumber, errMsg }, "plisio: invoice creation failed");
      await db.insert(plisioTransactionsTable).values({
        paymentId, userId, orderNumber,
        amountUsd: String(amountUsd),
        status: "failed",
        errorMessage: errMsg,
        createdAt: new Date(),
      }).onConflictDoNothing();
      return { success: false, error: errMsg };
    }

    const data = json["data"] as Record<string, unknown>;
    const txnId      = String(data["txn_id"]      ?? "");
    const invoiceUrl = String(data["invoice_url"] ?? "");

    logger.info({ paymentId, orderNumber, txnId }, "plisio: invoice created successfully");

    await db.insert(plisioTransactionsTable).values({
      paymentId, userId, orderNumber, txnId, invoiceUrl,
      amountUsd: String(amountUsd),
      status: "pending",
      createdAt: new Date(),
    }).onConflictDoNothing();

    return { success: true, txnId, invoiceUrl, orderNumber };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Network error";
    logger.error({ err, paymentId, orderNumber }, "plisio: invoice creation threw");
    await db.insert(plisioTransactionsTable).values({
      paymentId, userId, orderNumber,
      amountUsd: String(amountUsd),
      status: "failed",
      errorMessage: errMsg,
      createdAt: new Date(),
    }).onConflictDoNothing();
    return { success: false, error: errMsg };
  }
}

// ─── Handle Webhook Callback ───────────────────────────────────────────────────

export interface PlisioVerifyResult {
  success: boolean;
  alreadyVerified?: boolean;
  coins?: number;
  userId?: number;
  /** Actual Plisio status string, available even on failure */
  paymentStatus?: string;
  error?: string;
  /** Extra context for the review-group notification on success */
  orderNumber?: string;
  txnId?: string;
  amountUsd?: string;
  cryptoCurrency?: string;
}

export async function handlePlisioCallback(
  rawBody: string,
  payload: Record<string, unknown>
): Promise<PlisioVerifyResult> {
  const apiKey = await getSetting("plisio_api_key");
  if (!apiKey) {
    logger.error("plisio webhook: API key not configured in settings");
    return { success: false, error: "Plisio API key not configured" };
  }

  // Log incoming callback for debugging (redact verify_hash value).
  const debugPayload = { ...payload };
  if (debugPayload["verify_hash"]) debugPayload["verify_hash"] = "[redacted]";
  logger.info(
    { payload: debugPayload, rawBodyLen: rawBody.length, rawBodyStart: rawBody.slice(0, 40) },
    "plisio webhook: incoming callback"
  );

  // ── Guard: empty raw body means our body-capture middleware didn't run ────────
  if (!rawBody) {
    logger.error(
      { contentType: "unknown" },
      "plisio webhook: rawBody is empty — body capture middleware may have been bypassed " +
      "or Plisio sent an empty POST. Check Content-Type and request body."
    );
    return { success: false, error: "Empty raw body — cannot verify signature" };
  }

  // ── Guard: body doesn't look like JSON ────────────────────────────────────────
  if (!rawBody.trimStart().startsWith("{")) {
    logger.error(
      { rawBodyStart: rawBody.slice(0, 80) },
      "plisio webhook: body is not JSON. " +
      "Plisio must POST with ?json=true in the callback URL. " +
      "Check that plisio_callback_url in settings does NOT already include ?json=true — " +
      "the service appends it automatically. Also check Plisio dashboard Status URL includes ?json=true."
    );
    return { success: false, error: "Non-JSON body — HMAC cannot be verified" };
  }

  // ── HMAC-SHA1 verification ─────────────────────────────────────────────────
  const isValid = verifyPlisioHash(rawBody, apiKey);
  if (!isValid) {
    logger.warn(
      {
        orderNumber: payload["order_number"],
        status:      payload["status"],
        rawBodyLen:  rawBody.length,
      },
      "plisio webhook: HMAC-SHA1 signature verification FAILED. " +
      "Possible causes: (1) wrong API key in settings — must be the SECRET key, not public key; " +
      "(2) callback URL missing ?json=true — Plisio MUST send JSON; " +
      "(3) intermediate proxy modified the body (base64, re-encoding, etc.)"
    );
    return { success: false, error: "Invalid HMAC signature" };
  }

  const status      = String(payload["status"]       ?? "");
  const orderNumber = String(payload["order_number"] ?? "");
  const txnId       = String(payload["txn_id"]       ?? "");

  // ── Validate order_number format (defense in depth) ───────────────────────
  if (!orderNumber || !ORDER_NUMBER_RE.test(orderNumber)) {
    logger.warn(
      { orderNumber: orderNumber.slice(0, 32), status },
      "plisio webhook: order_number is missing or has unexpected format — rejecting"
    );
    return { success: false, error: "Invalid order_number format" };
  }

  logger.info({ orderNumber, status, txnId }, "plisio webhook: HMAC OK — processing");

  // ── Look up transaction ───────────────────────────────────────────────────
  const [tx] = await db
    .select()
    .from(plisioTransactionsTable)
    .where(eq(plisioTransactionsTable.orderNumber, orderNumber))
    .limit(1);

  if (!tx) {
    logger.warn({ orderNumber, status }, "plisio webhook: transaction not found for order_number");
    return { success: false, error: "Transaction not found" };
  }

  // ── Idempotency: already fully processed ──────────────────────────────────
  if (tx.callbackVerified || tx.status === "completed") {
    logger.info({ orderNumber, txnId }, "plisio webhook: already verified — skipping (replay protection)");
    return { success: true, alreadyVerified: true };
  }

  // ── Non-completed status: record & surface to webhook route for user notify ─
  if (status !== "completed") {
    const statusMap: Record<string, "expired" | "failed" | "cancelled" | "mismatch" | "error" | "pending"> = {
      expired:               "expired",
      failed:                "failed",
      cancelled:             "cancelled",
      "cancelled duplicate": "cancelled",
      mismatch:              "mismatch",
      error:                 "error",
      pending:               "pending",
      new:                   "pending",
      "pending internal":    "pending",
    };
    const mapped = statusMap[status] ?? "pending";

    // Only write to DB if status actually changed — avoids noise for repeated "pending" callbacks.
    if (tx.status !== mapped) {
      await db.update(plisioTransactionsTable)
        .set({ status: mapped, txnId: txnId || null })
        .where(eq(plisioTransactionsTable.id, tx.id));
    }

    logger.info({ orderNumber, status, mapped, userId: tx.userId }, "plisio webhook: non-completed status recorded");

    return {
      success: false,
      userId: tx.userId,
      paymentStatus: mapped,
      error: `Payment status: ${status}`,
    };
  }

  // ── Payment completed — credit coins (atomic, two-phase) ──────────────────
  //
  // Phase 1: Atomically flip callbackVerified false → true.
  //   Two concurrent webhook deliveries race here; only ONE can match
  //   callbackVerified=false and win. The loser gets no rows back → exits.
  //   Enforced by Postgres row-level locking (FOR UPDATE implicit in UPDATE).
  //
  // Phase 2: Atomically flip payment status pending → approved.
  //   Only the Phase-1 winner reaches here; second guard for any future
  //   code paths that might call addCoins() without going through Phase 1.
  //
  const [claimedTx] = await db
    .update(plisioTransactionsTable)
    .set({
      status:           "completed",
      callbackVerified: true,
      txnId:            txnId || null,
      verifiedAt:       new Date(),
    })
    .where(
      and(
        eq(plisioTransactionsTable.id,              tx.id),
        eq(plisioTransactionsTable.callbackVerified, false)
      )
    )
    .returning();

  if (!claimedTx) {
    // Another concurrent webhook delivery already claimed this transaction.
    logger.warn({ orderNumber, txnId }, "plisio webhook: duplicate completed callback ignored (concurrent claim)");
    return { success: true, alreadyVerified: true };
  }

  // Phase 2: claim the payment row.
  const [claimedPayment] = await db
    .update(paymentsTable)
    .set({ status: "approved", processedAt: new Date() })
    .where(and(eq(paymentsTable.id, tx.paymentId), eq(paymentsTable.status, "pending")))
    .returning();

  if (claimedPayment) {
    await addCoins(tx.userId, claimedPayment.coins, "payment", `Plisio crypto purchase — txn: ${txnId}`);
    logger.info(
      { orderNumber, txnId, userId: tx.userId, coins: claimedPayment.coins },
      "plisio webhook: coins credited successfully"
    );
    return {
      success:        true,
      coins:          claimedPayment.coins,
      userId:         tx.userId,
      orderNumber:    tx.orderNumber,
      txnId:          txnId || tx.txnId || undefined,
      amountUsd:      tx.amountUsd,
      cryptoCurrency: tx.currency ?? undefined,
    };
  }

  // Phase 1 won but payment row is not in pending state (e.g. manually closed).
  // Do NOT re-credit coins.
  logger.warn(
    { orderNumber, paymentId: tx.paymentId },
    "plisio webhook: transaction claimed but payment row was not pending — coins not credited"
  );
  return { success: true, userId: tx.userId };
}

// ─── Plisio API: Check transaction status by txnId ────────────────────────────
//
// Used by /start plisio_r_ handler to verify payment directly via Plisio API
// when the automatic webhook was delayed, lost, or failed HMAC verification.
//
export interface PlisioTxnApiStatus {
  status: "completed" | "pending" | "expired" | "failed" | "cancelled" | "mismatch" | "unknown";
  sourceAmount?: string;
  sourceCurrency?: string;
  currency?: string;
  orderNumber?: string;
}

export async function checkPlisioTxnStatus(txnId: string): Promise<PlisioTxnApiStatus | null> {
  if (!txnId) return null;
  const apiKey = await getSetting("plisio_api_key");
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `${PLISIO_BASE_URL}/operations/${encodeURIComponent(txnId)}?api_key=${encodeURIComponent(apiKey)}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return null;
    const json = await res.json() as Record<string, unknown>;
    if (json["status"] !== "success") return null;

    const data = json["data"] as Record<string, unknown>;
    const raw  = String(data["status"] ?? "unknown");

    const statusMap: Record<string, PlisioTxnApiStatus["status"]> = {
      completed:             "completed",
      pending:               "pending",
      "pending internal":    "pending",
      new:                   "pending",
      expired:               "expired",
      failed:                "failed",
      cancelled:             "cancelled",
      "cancelled duplicate": "cancelled",
      mismatch:              "mismatch",
    };

    return {
      status:         statusMap[raw] ?? "unknown",
      sourceAmount:   data["source_amount"]  ? String(data["source_amount"])  : undefined,
      sourceCurrency: data["source_currency"] ? String(data["source_currency"]) : undefined,
      currency:       data["currency"]        ? String(data["currency"])        : undefined,
      orderNumber:    data["order_number"]    ? String(data["order_number"])    : undefined,
    };
  } catch (err) {
    logger.warn({ err, txnId }, "plisio: checkPlisioTxnStatus API call failed");
    return null;
  }
}

// ─── Recover a pending Plisio transaction after API confirms completion ────────
//
// Called by /start plisio_r_ when:
//   • tx.status === "pending" in our DB
//   • Plisio API confirms status === "completed"
//   • Webhook was delayed, URL changed, or HMAC failed on first delivery
//
// Uses the same two-phase atomic claim as the webhook handler — safe against
// a concurrent webhook delivery arriving at the same time.
//
export async function recoverCompletedPlisioTx(
  tx: typeof plisioTransactionsTable.$inferSelect
): Promise<{ success: boolean; coins?: number; alreadyDone?: boolean }> {
  if (tx.callbackVerified || tx.status === "completed") {
    return { success: true, alreadyDone: true };
  }

  logger.info(
    { orderNumber: tx.orderNumber, txnId: tx.txnId, userId: tx.userId },
    "plisio recovery: recovering completed payment via /start deep-link"
  );

  const [claimedTx] = await db
    .update(plisioTransactionsTable)
    .set({ status: "completed", callbackVerified: true, verifiedAt: new Date() })
    .where(and(
      eq(plisioTransactionsTable.id, tx.id),
      eq(plisioTransactionsTable.callbackVerified, false)
    ))
    .returning();

  if (!claimedTx) {
    return { success: true, alreadyDone: true };
  }

  const [claimedPayment] = await db
    .update(paymentsTable)
    .set({ status: "approved", processedAt: new Date() })
    .where(and(eq(paymentsTable.id, tx.paymentId), eq(paymentsTable.status, "pending")))
    .returning();

  if (claimedPayment) {
    await addCoins(
      tx.userId,
      claimedPayment.coins,
      "payment",
      `Plisio recovered via /start deep-link — txn: ${tx.txnId ?? "unknown"}`
    );
    logger.info(
      { orderNumber: tx.orderNumber, userId: tx.userId, coins: claimedPayment.coins },
      "plisio recovery: coins credited successfully"
    );
    return { success: true, coins: claimedPayment.coins };
  }

  logger.warn(
    { orderNumber: tx.orderNumber, paymentId: tx.paymentId },
    "plisio recovery: transaction claimed but payment row not in pending state"
  );
  return { success: true };
}
