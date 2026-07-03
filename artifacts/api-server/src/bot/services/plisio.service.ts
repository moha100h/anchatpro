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

// ─── Webhook signature verification (JSON mode, since we send ?json=true) ──────
// Per Plisio docs: when callback_url has `json=true`, the hash is
// HMAC-SHA1( JSON.stringify(payload minus verify_hash) , SECRET_KEY ) — NOT PHP serialize.
// https://plisio.net/documentation/endpoints/create-an-invoice#verification-example

function verifyPlisioHash(payload: Record<string, unknown>, secretKey: string): boolean {
  const verifyHash = payload["verify_hash"] as string | undefined;
  if (!verifyHash || !secretKey) return false;

  const ordered = { ...payload };
  delete ordered["verify_hash"];

  const serialized = JSON.stringify(ordered);
  const computed = createHmac("sha1", secretKey).update(serialized).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(computed, "utf8"), Buffer.from(verifyHash, "utf8"));
  } catch {
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
      // Plisio can return errors as: data.message (string), data (flat {field:msg}), or message (string/object)
      let errMsg: string;
      if (typeof errData === "object" && errData !== null && "message" in errData) {
        errMsg = String(errData["message"]);
      } else if (typeof errData === "object" && errData !== null) {
        // flat field-error object e.g. {"amount":"Invalid minimal amount..."}
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
  /** Extra context for the review-group notification on success */
  orderNumber?: string;
  txnId?: string;
  amountUsd?: string;
  cryptoCurrency?: string;
}

export async function handlePlisioCallback(
  payload: Record<string, unknown>
): Promise<PlisioVerifyResult> {
  const apiKey = await getSetting("plisio_api_key");
  if (!apiKey) return { success: false, error: "Plisio API key not configured" };

  const isValid = verifyPlisioHash(payload, apiKey);
  if (!isValid) {
    logger.warn(
      { orderNumber: payload["order_number"], status: payload["status"] },
      "plisio webhook: signature verification failed"
    );
    return { success: false, error: "Invalid signature" };
  }

  const status      = String(payload["status"]       ?? "");
  const orderNumber = String(payload["order_number"] ?? "");
  const txnId       = String(payload["txn_id"]       ?? "");

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
    await db.update(plisioTransactionsTable)
      .set({ status: mapped, txnId: txnId || undefined })
      .where(eq(plisioTransactionsTable.id, tx.id));
    // Always return userId so the webhook route can notify the user
    return {
      success: false,
      userId: tx.userId,
      paymentStatus: mapped,
      error: `Payment status: ${status}`,
    };
  }

  // Payment completed — credit coins.
  //
  // IMPORTANT (idempotency/anti-fraud): Plisio can deliver the same webhook
  // more than once (retries, network duplicates), and two deliveries could
  // arrive close enough together to both pass the `tx.callbackVerified`
  // check above before either one's UPDATE commits (classic check-then-act
  // race). To make this airtight, the UPDATE below is itself the guard: it
  // only flips the row from "not yet verified" to "completed" when it is
  // still "not yet verified" at the moment the UPDATE executes (atomic,
  // single statement, enforced by Postgres row locking). If two requests
  // race, only one UPDATE can match+return a row; the other gets nothing
  // back and safely no-ops. Coins are only ever credited by the branch that
  // won this update.
  const [claimedTx] = await db
    .update(plisioTransactionsTable)
    .set({
      status: "completed",
      callbackVerified: true,
      txnId: txnId || undefined,
      verifiedAt: new Date(),
    })
    .where(
      and(
        eq(plisioTransactionsTable.id, tx.id),
        eq(plisioTransactionsTable.callbackVerified, false)
      )
    )
    .returning();

  if (!claimedTx) {
    // Another concurrent webhook delivery already claimed this transaction.
    logger.warn({ orderNumber, txnId }, "plisio webhook: duplicate completed callback ignored (already claimed)");
    return { success: true, alreadyVerified: true };
  }

  // Same atomic pattern for the payment row: only the request that flips
  // status "pending" → "approved" is allowed to call addCoins(). A second
  // concurrent attempt (e.g. a retried webhook that somehow got this far)
  // finds status already "approved" and the conditional UPDATE matches
  // nothing, so no double crediting can occur.
  const [claimedPayment] = await db
    .update(paymentsTable)
    .set({
      status: "approved",
      processedAt: new Date(),
    })
    .where(and(eq(paymentsTable.id, tx.paymentId), eq(paymentsTable.status, "pending")))
    .returning();

  if (claimedPayment) {
    await addCoins(tx.userId, claimedPayment.coins, "payment", `Plisio crypto purchase — txn: ${txnId}`);
    return {
      success: true,
      coins: claimedPayment.coins,
      userId: tx.userId,
      orderNumber: tx.orderNumber,
      txnId: txnId || tx.txnId || undefined,
      amountUsd: tx.amountUsd,
      cryptoCurrency: tx.currency ?? undefined,
    };
  }

  logger.warn(
    { orderNumber, paymentId: tx.paymentId },
    "plisio webhook: transaction claimed but payment row was not in pending state — coins not re-credited"
  );
  return { success: true, userId: tx.userId };
}
