import { db } from "@workspace/db";
import {
  paymentsTable,
  paymentPackagesTable,
  adminSettingsTable,
  discountCodesTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { addCoins } from "./coin.service.js";

// ─── Package helpers ───────────────────────────────────────────────────────────

export async function getPackages(): Promise<typeof paymentPackagesTable.$inferSelect[]> {
  return db
    .select()
    .from(paymentPackagesTable)
    .where(eq(paymentPackagesTable.isActive, true))
    .orderBy(paymentPackagesTable.coins);
}

export async function getAllPackages(): Promise<typeof paymentPackagesTable.$inferSelect[]> {
  return db.select().from(paymentPackagesTable).orderBy(paymentPackagesTable.coins);
}

export async function getPackageById(id: number): Promise<typeof paymentPackagesTable.$inferSelect | null> {
  const [pkg] = await db.select().from(paymentPackagesTable).where(eq(paymentPackagesTable.id, id)).limit(1);
  return pkg ?? null;
}

export async function createPackage(data: {
  coins: number;
  price: number;
  originalPrice?: number;
  discountPercent?: number;
  label?: string;
}) {
  const [pkg] = await db
    .insert(paymentPackagesTable)
    .values({
      coins: data.coins,
      price: data.price,
      originalPrice: data.originalPrice ?? null,
      discountPercent: data.discountPercent ?? 0,
      currency: "IRT",
      label: data.label ?? null,
      isActive: true,
      createdAt: new Date(),
    })
    .returning();
  return pkg;
}

export async function updatePackage(
  id: number,
  data: {
    coins?: number;
    price?: number;
    originalPrice?: number | null;
    discountPercent?: number;
    label?: string | null;
    isActive?: boolean;
  }
) {
  await db.update(paymentPackagesTable).set(data).where(eq(paymentPackagesTable.id, id));
}

export async function deletePackage(id: number) {
  await db.update(paymentPackagesTable).set({ isActive: false }).where(eq(paymentPackagesTable.id, id));
}

// ─── Payment creation ─────────────────────────────────────────────────────────

export async function createPayment(
  userId: number,
  packageId: number,
  method: "card" | "crypto" | "gateway",
  options?: { discountPercent?: number; discountCodeId?: number }
): Promise<typeof paymentsTable.$inferSelect> {
  const pkg = await getPackageById(packageId);
  if (!pkg) throw new Error("Package not found");

  const discountPct = options?.discountPercent ?? 0;
  const finalPrice = discountPct > 0
    ? Math.round(pkg.price * (100 - discountPct) / 100)
    : pkg.price;

  const [payment] = await db
    .insert(paymentsTable)
    .values({
      userId,
      packageId,
      coins: pkg.coins,
      price: finalPrice,
      currency: pkg.currency,
      method,
      status: "pending",
      createdAt: new Date(),
    })
    .returning();
  return payment;
}

export async function cancelPayment(paymentId: number): Promise<void> {
  await db
    .update(paymentsTable)
    .set({ status: "rejected", rejectionReason: "Cancelled by user" })
    .where(and(eq(paymentsTable.id, paymentId), eq(paymentsTable.status, "pending")));
}

export async function submitReceipt(paymentId: number, receiptFileId: string): Promise<void> {
  await db.update(paymentsTable).set({ receiptFileId }).where(eq(paymentsTable.id, paymentId));
}

export async function setAdminMessageId(
  paymentId: number,
  messageId: number,
  groupId: number
): Promise<void> {
  await db
    .update(paymentsTable)
    .set({ adminMessageId: messageId, adminGroupId: groupId })
    .where(eq(paymentsTable.id, paymentId));
}

export async function approvePayment(
  paymentId: number,
  adminId: number
): Promise<typeof paymentsTable.$inferSelect | null> {
  const [payment] = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.id, paymentId))
    .limit(1);
  if (!payment || payment.status !== "pending") return null;
  await db
    .update(paymentsTable)
    .set({ status: "approved", processedBy: adminId, processedAt: new Date() })
    .where(eq(paymentsTable.id, paymentId));
  await addCoins(payment.userId, payment.coins, "payment", `خرید ${payment.coins} سکه`);
  return payment;
}

export async function rejectPayment(
  paymentId: number,
  adminId: number,
  reason?: string
): Promise<typeof paymentsTable.$inferSelect | null> {
  const [payment] = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.id, paymentId))
    .limit(1);
  if (!payment || payment.status !== "pending") return null;
  await db
    .update(paymentsTable)
    .set({
      status: "rejected",
      processedBy: adminId,
      processedAt: new Date(),
      rejectionReason: reason ?? null,
    })
    .where(eq(paymentsTable.id, paymentId));
  return payment;
}

export async function getPendingPayment(
  userId: number
): Promise<typeof paymentsTable.$inferSelect | null> {
  const [payment] = await db
    .select()
    .from(paymentsTable)
    .where(and(eq(paymentsTable.userId, userId), eq(paymentsTable.status, "pending")))
    .orderBy(desc(paymentsTable.createdAt))
    .limit(1);
  return payment ?? null;
}

// ─── Admin settings ──────────────────────────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  const [setting] = await db
    .select()
    .from(adminSettingsTable)
    .where(eq(adminSettingsTable.key, key))
    .limit(1);
  return setting?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(adminSettingsTable)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: adminSettingsTable.key,
      set: { value, updatedAt: new Date() },
    });
}

export async function isMethodEnabled(method: "card" | "crypto" | "gateway"): Promise<boolean> {
  const val = await getSetting(`payment_method_${method}`);
  return val !== "disabled";
}

// ─── Default packages ─────────────────────────────────────────────────────────

export async function ensureDefaultPackages(): Promise<void> {
  const existing = await db.select().from(paymentPackagesTable).limit(1);
  if (existing.length > 0) return;
  await db.insert(paymentPackagesTable).values([
    { coins: 10,  price: 10000, discountPercent: 0, currency: "IRT", label: "10 سکه",  isActive: true, createdAt: new Date() },
    { coins: 25,  price: 22000, discountPercent: 0, currency: "IRT", label: "25 سکه",  isActive: true, createdAt: new Date() },
    { coins: 50,  price: 40000, discountPercent: 0, currency: "IRT", label: "50 سکه",  isActive: true, createdAt: new Date() },
    { coins: 100, price: 70000, discountPercent: 0, currency: "IRT", label: "100 سکه", isActive: true, createdAt: new Date() },
  ]);
}

// ─── Discount codes ───────────────────────────────────────────────────────────

export async function validateDiscountCode(code: string): Promise<{
  valid: boolean;
  discountPercent: number;
  codeId?: number;
  error?: string;
}> {
  const [dc] = await db
    .select()
    .from(discountCodesTable)
    .where(eq(discountCodesTable.code, code.toUpperCase().trim()))
    .limit(1);

  if (!dc || !dc.isActive) return { valid: false, discountPercent: 0, error: "invalid" };
  if (dc.expiresAt && dc.expiresAt < new Date())
    return { valid: false, discountPercent: 0, error: "expired" };
  if (dc.maxUses !== null && dc.usedCount >= dc.maxUses)
    return { valid: false, discountPercent: 0, error: "used_up" };

  return { valid: true, discountPercent: dc.discountPercent, codeId: dc.id };
}

export async function useDiscountCode(codeId: number): Promise<void> {
  const [dc] = await db
    .select({ usedCount: discountCodesTable.usedCount })
    .from(discountCodesTable)
    .where(eq(discountCodesTable.id, codeId))
    .limit(1);
  if (!dc) return;
  await db
    .update(discountCodesTable)
    .set({ usedCount: dc.usedCount + 1 })
    .where(eq(discountCodesTable.id, codeId));
}

export async function createDiscountCode(data: {
  code: string;
  discountPercent: number;
  maxUses?: number;
  expiresAt?: Date;
}) {
  const [dc] = await db
    .insert(discountCodesTable)
    .values({
      code: data.code.toUpperCase().trim(),
      discountPercent: data.discountPercent,
      maxUses: data.maxUses ?? null,
      usedCount: 0,
      expiresAt: data.expiresAt ?? null,
      isActive: true,
      createdAt: new Date(),
    })
    .returning();
  return dc;
}

export async function listDiscountCodes(): Promise<typeof discountCodesTable.$inferSelect[]> {
  return db.select().from(discountCodesTable).orderBy(desc(discountCodesTable.createdAt));
}

export async function toggleDiscountCode(id: number, active: boolean): Promise<void> {
  await db.update(discountCodesTable).set({ isActive: active }).where(eq(discountCodesTable.id, id));
}

// ─── Crypto currencies (stored as JSON in admin_settings) ────────────────────

export interface CryptoCurrency {
  symbol: string;
  name: string;
  address: string;
  network: string;
  coinGeckoId?: string;
}

export async function getCryptoCurrencies(): Promise<CryptoCurrency[]> {
  const val = await getSetting("crypto_currencies");
  if (!val) return [];
  try {
    return JSON.parse(val) as CryptoCurrency[];
  } catch {
    return [];
  }
}

export async function saveCryptoCurrencies(currencies: CryptoCurrency[]): Promise<void> {
  await setSetting("crypto_currencies", JSON.stringify(currencies));
}

/** Fetch live IRT price of a coin from CoinGecko free API (returns Toman) */
export async function fetchCryptoPrice(coinGeckoId: string): Promise<number | null> {
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coinGeckoId)}&vs_currencies=irt`;
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: { "Accept": "application/json" },
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as Record<string, { irt?: number }>;
    return data[coinGeckoId]?.irt ?? null;
  } catch {
    return null;
  }
}

/** Fetch live USD price and calculate IRT using a local USD/IRT rate if CoinGecko direct IRT fails */
export async function fetchCryptoPriceWithFallback(
  coinGeckoId: string,
  fallbackUsdToIrt?: number
): Promise<number | null> {
  const irtPrice = await fetchCryptoPrice(coinGeckoId);
  if (irtPrice) return irtPrice;

  // Fallback: use manual USD/IRT exchange rate from settings
  const usdRate = fallbackUsdToIrt ?? parseInt((await getSetting("usd_to_irt")) ?? "0", 10);
  if (!usdRate) return null;

  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coinGeckoId)}&vs_currencies=usd`;
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: { "Accept": "application/json" },
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as Record<string, { usd?: number }>;
    const usd = data[coinGeckoId]?.usd;
    if (!usd) return null;
    return Math.round(usd * usdRate);
  } catch {
    return null;
  }
}
