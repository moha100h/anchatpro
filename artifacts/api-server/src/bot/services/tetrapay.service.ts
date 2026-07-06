/**
 * TetraPay Gateway Integration
 * Docs: https://tetra98.com/api
 *
 * Flow:
 *  1. createOrder() → get Authority + payment URL
 *  2. User pays via bot/web URL
 *  3. TetraPay POSTs callback to /webhook/tetrapay
 *  4. verifyPayment(authority) → confirm and credit coins
 */

import { db } from "@workspace/db";
import { tetraPayTransactionsTable, paymentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { addCoins } from "./coin.service.js";
import { getSetting } from "./payment.service.js";
import { nanoid } from "nanoid";

const TETRAPAY_CREATE_URL = "https://tetra98.com/api/create_order";
const TETRAPAY_VERIFY_URL = "https://tetra98.com/api/verify";

// ─── Create Order ─────────────────────────────────────────────────────────────

export interface TetraPayOrderResult {
  success: boolean;
  authority?: string;
  paymentUrlBot?: string;
  paymentUrlWeb?: string;
  trackingId?: string;
  error?: string;
}

export async function createTetraPayOrder(
  paymentId: number,
  userId: number,
  amountRial: number,
  description: string
): Promise<TetraPayOrderResult> {
  const apiKey = await getSetting("tetrapay_api_key");
  if (!apiKey) return { success: false, error: "TetraPay API key not configured" };

  const callbackUrl = await getSetting("tetrapay_callback_url");
  if (!callbackUrl) return { success: false, error: "TetraPay callback URL not configured" };

  const hashId = `inv_${paymentId}_${nanoid(8)}`;

  const body = {
    ApiKey: apiKey,
    Hash_id: hashId,
    Amount: amountRial,
    Description: description,
    Email: "",
    Mobile: "",
    CallbackURL: callbackUrl,
  };

  try {
    const res = await fetch(TETRAPAY_CREATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json() as Record<string, unknown>;

    if (data["status"] !== "100" && data["status"] !== 100) {
      const errMsg = String(data["message"] ?? data["error"] ?? "Unknown error");
      // Log failure in DB (no authority yet)
      await db.insert(tetraPayTransactionsTable).values({
        paymentId,
        userId,
        hashId,
        amountRial,
        status: "failed",
        errorMessage: errMsg,
        createdAt: new Date(),
      }).onConflictDoNothing();
      return { success: false, error: errMsg };
    }

    const authority = String(data["Authority"] ?? "");
    const trackingId = String(data["tracking_id"] ?? "");
    const paymentUrlBot = String(data["payment_url_bot"] ?? "");
    const paymentUrlWeb = String(data["payment_url_web"] ?? "");

    await db.insert(tetraPayTransactionsTable).values({
      paymentId,
      userId,
      hashId,
      authority,
      trackingId,
      paymentUrlBot,
      paymentUrlWeb,
      amountRial,
      status: "pending",
      createdAt: new Date(),
    }).onConflictDoNothing();

    return { success: true, authority, paymentUrlBot, paymentUrlWeb, trackingId };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Network error";
    await db.insert(tetraPayTransactionsTable).values({
      paymentId,
      userId,
      hashId,
      amountRial,
      status: "failed",
      errorMessage: errMsg,
      createdAt: new Date(),
    }).onConflictDoNothing();
    return { success: false, error: errMsg };
  }
}

// ─── Verify Payment ───────────────────────────────────────────────────────────

export interface TetraPayVerifyResult {
  success: boolean;
  alreadyVerified?: boolean;
  coins?: number;
  userId?: number;
  error?: string;
}

export async function verifyTetraPayment(authority: string): Promise<TetraPayVerifyResult> {
  const apiKey = await getSetting("tetrapay_api_key");
  if (!apiKey) return { success: false, error: "API key not configured" };

  // Find the transaction
  const [tx] = await db
    .select()
    .from(tetraPayTransactionsTable)
    .where(eq(tetraPayTransactionsTable.authority, authority))
    .limit(1);

  if (!tx) return { success: false, error: "Transaction not found" };

  // Prevent duplicate verification
  if (tx.callbackVerified || tx.status === "paid") {
    return { success: true, alreadyVerified: true };
  }

  try {
    const res = await fetch(TETRAPAY_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authority, ApiKey: apiKey }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json() as Record<string, unknown>;
    const statusCode = Number(data["status"] ?? data["Status"] ?? 0);

    if (statusCode !== 100) {
      await db.update(tetraPayTransactionsTable).set({
        status: "failed",
        errorMessage: String(data["message"] ?? "Verification failed"),
      }).where(eq(tetraPayTransactionsTable.id, tx.id));
      // Return userId so the webhook route can notify the user of the failure.
      return { success: false, userId: tx.userId, error: String(data["message"] ?? "Verification failed") };
    }

    // Mark as verified + paid
    await db.update(tetraPayTransactionsTable).set({
      status: "paid",
      callbackVerified: true,
      verifiedAt: new Date(),
    }).where(eq(tetraPayTransactionsTable.id, tx.id));

    // Approve the linked payment and credit coins
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
      await addCoins(tx.userId, payment.coins, "payment", `TetraPay purchase — authority: ${authority}`);
      return { success: true, coins: payment.coins, userId: tx.userId };
    }

    return { success: true, userId: tx.userId };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Network error";
    await db.update(tetraPayTransactionsTable).set({
      status: "failed",
      errorMessage: errMsg,
    }).where(eq(tetraPayTransactionsTable.id, tx.id));
    // Return userId so the webhook route can notify the user even on network errors.
    return { success: false, userId: tx.userId, error: errMsg };
  }
}

// ─── Handle Callback Payload ──────────────────────────────────────────────────

/** Called from the Express webhook route */
export async function handleTetraPayCallback(payload: {
  status: number | string | unknown;
  hash_id?: string;
  authority?: string;
}): Promise<TetraPayVerifyResult & { userId?: number }> {
  const statusCode = Number(payload.status);

  // TetraPay sends status=100 on success. Any other value means failure/cancel.
  if (statusCode !== 100) {
    // Try to look up the userId via hash_id so the webhook route can notify the user.
    let userId: number | undefined;
    if (payload.hash_id) {
      try {
        const [tx] = await db
          .select({ userId: tetraPayTransactionsTable.userId })
          .from(tetraPayTransactionsTable)
          .where(eq(tetraPayTransactionsTable.hashId, payload.hash_id))
          .limit(1);
        userId = tx?.userId;
      } catch { /* ignore */ }
    }
    return { success: false, userId, error: `Payment failed or cancelled (status: ${statusCode})` };
  }

  if (!payload.authority) {
    return { success: false, error: "Missing authority in callback — check TetraPay API field casing" };
  }

  return verifyTetraPayment(payload.authority);
}
