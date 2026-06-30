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

import { createHmac } from "crypto";
import { db } from "@workspace/db";
import { plisioTransactionsTable, paymentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { addCoins } from "./coin.service.js";
import { getSetting } from "./payment.service.js";
import { nanoid } from "nanoid";

const PLISIO_BASE_URL = "https://api.plisio.net/api/v1";

// ─── PHP serialize (for webhook signature verification) ────────────────────────
// Plisio uses hash_hmac('sha1', serialize(ksorted_params), secret_key)

function phpSerializeValue(value: unknown): string {
  if (value === null || value === undefined) return "N;";
  if (typeof value === "boolean") return `b:${value ? 1 : 0};`;
  if (typeof value === "number") {
    if (Number.isInteger(value)) return `i:${value};`;
    return `d:${value};`;
  }
  if (typeof value === "string") {
    const len = Buffer.byteLength(value, "utf8");
    return `s:${len}:"${value}";`;
  }
  if (Array.isArray(value)) {
    let inner = "";
    value.forEach((v, i) => { inner += `i:${i};${phpSerializeValue(v)}`; });
    return `a:${value.length}:{${inner}}`;
  }
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    let inner = "";
    keys.forEach(k => {
      inner += `s:${Buffer.byteLength(k, "utf8")}:"${k}";${phpSerializeValue(obj[k])}`;
    });
    return `a:${keys.length}:{${inner}}`;
  }
  return "N;";
}

function phpSerializeObject(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort();
  let inner = "";
  keys.forEach(k => {
    inner += `s:${Buffer.byteLength(k, "utf8")}:"${k}";${phpSerializeValue(obj[k])}`;
  });
  return `a:${keys.length}:{${inner}}`;
}

function verifyPlisioHash(payload: Record<string, unknown>, secretKey: string): boolean {
  const verifyHash = payload["verify_hash"] as string | undefined;
  if (!verifyHash || !secretKey) return false;

  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (k === "verify_hash") continue;
    // Plisio docs: expire_utc must be cast to string
    if (k === "expire_utc" && typeof v === "number") {
      data[k] = String(v);
    } else {
      data[k] = v;
    }
  }

  const serialized = phpSerializeObject(data);
  const computed = createHmac("sha1", secretKey).update(serialized).digest("hex");
  return computed === verifyHash;
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

  const callbackUrl = await getSetting("plisio_callback_url");
  if (!callbackUrl) return { success: false, error: "Plisio callback URL not configured" };

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
  error?: string;
}

export async function handlePlisioCallback(
  payload: Record<string, unknown>
): Promise<PlisioVerifyResult> {
  const apiKey = await getSetting("plisio_api_key");
  if (!apiKey) return { success: false, error: "Plisio API key not configured" };

  const isValid = verifyPlisioHash(payload, apiKey);
  if (!isValid) return { success: false, error: "Invalid signature" };

  const status      = String(payload["status"]       ?? "");
  const orderNumber = String(payload["order_number"] ?? "");
  const txnId       = String(payload["txn_id"]       ?? "");

  const [tx] = await db
    .select()
    .from(plisioTransactionsTable)
    .where(eq(plisioTransactionsTable.orderNumber, orderNumber))
    .limit(1);

  if (!tx) return { success: false, error: "Transaction not found" };

  if (tx.callbackVerified || tx.status === "completed") {
    return { success: true, alreadyVerified: true };
  }

  if (status !== "completed") {
    const validStatuses = ["expired", "failed", "cancelled", "mismatch", "error", "pending"];
    const mapped = validStatuses.includes(status) ? status : "pending";
    await db.update(plisioTransactionsTable)
      .set({ status: mapped as any, txnId: txnId || undefined })
      .where(eq(plisioTransactionsTable.id, tx.id));
    return { success: false, error: `Payment status: ${status}` };
  }

  // Payment completed — credit coins
  await db.update(plisioTransactionsTable).set({
    status: "completed",
    callbackVerified: true,
    txnId: txnId || undefined,
    verifiedAt: new Date(),
  }).where(eq(plisioTransactionsTable.id, tx.id));

  const [payment] = await db
    .select()
    .from(paymentsTable)
    .where(and(eq(paymentsTable.id, tx.paymentId), eq(paymentsTable.status, "pending")))
    .limit(1);

  if (payment) {
    await db.update(paymentsTable).set({
      status: "approved",
      processedAt: new Date(),
    }).where(eq(paymentsTable.id, payment.id));
    await addCoins(tx.userId, payment.coins, "payment", `Plisio crypto purchase — txn: ${txnId}`);
    return { success: true, coins: payment.coins, userId: tx.userId };
  }

  return { success: true, userId: tx.userId };
}
