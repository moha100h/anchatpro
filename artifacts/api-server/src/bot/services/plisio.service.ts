/**
 * Plisio Crypto Payment Gateway Integration
 * Docs: https://plisio.net/documentation
 *
 * Flow:
 *  1. createPlisioOrder() → GET /invoices/new → get txn_id + invoice_url
 *  2. User pays via invoice_url (Plisio hosted page)
 *  3. Plisio POSTs callback to /webhook/plisio?json=true
 *  4. handlePlisioCallback() → verify hash → credit coins
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

// ─── Webhook signature verification (JSON mode) ────────────────────────────────
//
// Plisio docs (json=true mode):
//   hash = HMAC-SHA1( json_encode(payload_without_verify_hash), api_key )
//   where json_encode preserves the insertion order of keys as received.
//
// IMPORTANT: We MUST verify against the RAW body string, not a re-serialised
// JavaScript object. JSON.stringify() on a re-parsed object is NOT guaranteed
// to reproduce the exact same byte sequence as the original (e.g. numbers like
// 1e-8 vs 0.00000001, or if a future Node version changes key-ordering
// semantics). We parse the raw body ourselves, strip verify_hash while keeping
// all other keys in their original order, then re-serialise — giving us the
// same byte sequence Plisio signed.
//
// Returns the verify_hash extracted from the payload (so the caller doesn't
// need to parse the raw body again), or null if the signature is invalid.
function verifyPlisioHash(rawBody: string, secretKey: string): boolean {
  if (!rawBody || !secretKey) return false;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    logger.warn("plisio: failed to JSON.parse raw webhook body during hash verification");
    return false;
  }

  const verifyHash = parsed["verify_hash"];
  if (typeof verifyHash !== "string" || !verifyHash) {
    logger.warn("plisio: verify_hash missing or not a string in webhook payload");
    return false;
  }

  // Build the to-sign object: all keys except verify_hash, preserving insertion order.
  const toSign: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (k !== "verify_hash") toSign[k] = v;
  }

  const serialized = JSON.stringify(toSign);
  const computed   = createHmac("sha1", secretKey).update(serialized).digest("hex");

  // timingSafeEqual requires equal-length Buffers. Both are lowercase hex strings
  // of the same length (40 chars for SHA-1), but guard defensively.
  try {
    const a = Buffer.from(computed,    "utf8");
    const b = Buffer.from(verifyHash,  "utf8");
    if (a.length !== b.length) {
      logger.warn(
        { computedLen: a.length, receivedLen: b.length },
        "plisio: verify_hash length mismatch — possible algorithm mismatch"
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
  const callbackUrl = rawCallbackUrl.split("?")[0].trim();

  const allowedCurrencies = (await getSetting("plisio_currencies")) ?? "ETH,LTC,BNB,USDT_TRX,TRX";
  const orderNumber = `inv_${paymentId}_${nanoid(8)}`;
  const description = `Purchase ${coinsCount} coins`;

  const params = new URLSearchParams({
    api_key:           apiKey,
    source_currency:   "USD",
    source_amount:     String(amountUsd),
    order_number:      orderNumber,
    order_name:        description,
    callback_url:      `${callbackUrl}?json=true`,
    allowed_psys_cids: allowedCurrencies,
    expire_min:        "30",
  });

  // Success/fail redirects go through our own server first (not straight to
  // the bot). That landing page looks up this exact order_number, confirms
  // the *real* status recorded from the signed webhook, and only then
  // forwards the user into the bot with an order-bound token. This closes
  // the fraud hole where anyone who found a generic "?start=plisio_ok" link
  // could trigger a fake success screen without ever paying.
  const returnBaseUrl = getBaseUrl();
  params.set("success_callback_url", `${returnBaseUrl}/webhook/plisio/return?r=ok&order=${orderNumber}`);
  params.set("fail_callback_url",    `${returnBaseUrl}/webhook/plisio/return?r=fail&order=${orderNumber}`);

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

    await db.insert(plisioTransactionsTable).values({
      paymentId, userId, orderNumber, txnId, invoiceUrl,
      amountUsd: String(amountUsd),
      status: "pending",
      createdAt: new Date(),
    }).onConflictDoNothing();

    return { success: true, txnId, invoiceUrl, orderNumber };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Network error";
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
  /** Extra context for the review-group notification on success/mismatch */
  orderNumber?: string;
  txnId?: string;
  amountUsd?: string;
  cryptoCurrency?: string;
  /** Actual crypto amount reported by Plisio (invoice amount) */
  cryptoAmount?: string;
  /** For mismatch/partial payments: amount still pending (crypto) */
  pendingAmount?: string;
  /** Number of coins in the underlying package (for mismatch context) */
  coinsExpected?: number;
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

  // Log incoming callback for debugging (redact verify_hash value)
  const debugPayload = { ...payload };
  if (debugPayload["verify_hash"]) debugPayload["verify_hash"] = "[redacted]";
  logger.info(
    { payload: debugPayload, rawBodyLen: rawBody.length },
    "plisio webhook: incoming callback"
  );

  // Verify using the RAW body — not a re-serialised object.
  // Empty rawBody means the body parser failed (wrong Content-Type etc.).
  if (!rawBody) {
    logger.error("plisio webhook: rawBody is empty — body parser may have failed. Check Content-Type header from Plisio.");
    return { success: false, error: "Empty raw body — cannot verify signature" };
  }

  const isValid = verifyPlisioHash(rawBody, apiKey);
  if (!isValid) {
    logger.warn(
      { orderNumber: payload["order_number"], status: payload["status"], rawBodyLen: rawBody.length },
      "plisio webhook: HMAC-SHA1 signature verification FAILED — possible causes: wrong API key in settings, callback URL missing ?json=true, or Plisio sent non-JSON body"
    );
    return { success: false, error: "Invalid signature" };
  }

  const status      = String(payload["status"]       ?? "");
  const orderNumber = String(payload["order_number"] ?? "");
  const txnId       = String(payload["txn_id"]       ?? "");
  // Actual crypto fields reported by Plisio (present on most callbacks).
  const cryptoCurrency = payload["currency"]       != null ? String(payload["currency"])       : undefined;
  const cryptoAmount   = payload["amount"]         != null ? String(payload["amount"])         : undefined;
  const pendingAmount  = payload["pending_amount"] != null ? String(payload["pending_amount"]) : undefined;

  logger.info({ orderNumber, status, txnId, cryptoCurrency }, "plisio webhook: signature OK — processing");

  const [tx] = await db
    .select()
    .from(plisioTransactionsTable)
    .where(eq(plisioTransactionsTable.orderNumber, orderNumber))
    .limit(1);

  if (!tx) {
    logger.warn({ orderNumber, status }, "plisio webhook: transaction not found for order");
    return { success: false, error: "Transaction not found" };
  }

  // Already fully processed — never re-credit (fraud/replay protection).
  if (tx.callbackVerified || tx.status === "completed") {
    logger.info({ orderNumber, txnId }, "plisio webhook: already verified — skipping (idempotency)");
    return { success: true, alreadyVerified: true };
  }

  if (status !== "completed") {
    // Plisio non-final/duplicate statuses map onto our narrower enum.
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

    // Only update if the status actually changed — avoids unnecessary DB writes
    // for repeated "pending"/"new" callbacks on the same order.
    if (tx.status !== mapped) {
      await db.update(plisioTransactionsTable)
        .set({
          status: mapped,
          // Keep existing txnId if the new payload doesn't carry one yet.
          txnId: txnId || tx.txnId || null,
        })
        .where(eq(plisioTransactionsTable.id, tx.id));
    }

    logger.info({ orderNumber, status, mapped, userId: tx.userId }, "plisio webhook: non-completed status recorded");

    // Look up the coins the user was trying to buy (for mismatch context).
    let coinsExpected: number | undefined;
    if (mapped === "mismatch") {
      const [pmt] = await db
        .select({ coins: paymentsTable.coins })
        .from(paymentsTable)
        .where(eq(paymentsTable.id, tx.paymentId))
        .limit(1);
      coinsExpected = pmt?.coins;
    }

    // Always return userId + context so the webhook route can notify the user
    // (and the review group, for mismatch/partial payments) on terminal statuses.
    return {
      success: false,
      userId: tx.userId,
      paymentStatus: mapped,
      error: `Payment status: ${status}`,
      orderNumber: tx.orderNumber,
      txnId: txnId || tx.txnId || undefined,
      amountUsd: tx.amountUsd,
      cryptoCurrency,
      cryptoAmount,
      pendingAmount,
      coinsExpected,
    };
  }

  // ── Payment completed — credit coins ──────────────────────────────────────
  //
  // ANTI-FRAUD / IDEMPOTENCY (two-phase atomic guard):
  //
  // Phase 1: Atomically flip plisioTransactionsTable.callbackVerified false→true.
  //   UPDATE ... WHERE id=? AND callbackVerified=false RETURNING *
  //   If two concurrent webhook deliveries race here, only ONE UPDATE can match
  //   the row while callbackVerified is still false. The other gets no rows back
  //   and exits early. This is enforced by Postgres row-level locking.
  //
  // Phase 2: Atomically flip paymentsTable.status pending→approved.
  //   Same pattern — only the request that won Phase 1 reaches here, but we
  //   add a second guard to protect against any future code path reaching
  //   addCoins() without going through Phase 1.
  const [claimedTx] = await db
    .update(plisioTransactionsTable)
    .set({
      status:           "completed",
      callbackVerified: true,
      txnId:            txnId || null,
      // Persist the actual crypto currency Plisio reported (e.g. "ETH", "TRX").
      currency:         cryptoCurrency ?? tx.currency ?? null,
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
    logger.warn({ orderNumber, txnId }, "plisio webhook: duplicate completed callback ignored (already claimed by concurrent request)");
    return { success: true, alreadyVerified: true };
  }

  // Phase 2: claim the payment row atomically.
  const [claimedPayment] = await db
    .update(paymentsTable)
    .set({
      status:      "approved",
      processedAt: new Date(),
    })
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
      cryptoCurrency: cryptoCurrency ?? tx.currency ?? undefined,
      cryptoAmount,
    };
  }

  // Transaction was claimed but payment was already in a non-pending state.
  // This can happen if the payment row was manually updated by an admin.
  // Coins should NOT be re-credited.
  logger.warn(
    { orderNumber, paymentId: tx.paymentId },
    "plisio webhook: transaction claimed but payment row was not in pending state — coins not re-credited"
  );
  return { success: true, userId: tx.userId };
}
