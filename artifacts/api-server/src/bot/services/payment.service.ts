import { db } from "@workspace/db";
import { paymentsTable, paymentPackagesTable, adminSettingsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { addCoins } from "./coin.service.js";

export async function getPackages(): Promise<typeof paymentPackagesTable.$inferSelect[]> {
  return db.select().from(paymentPackagesTable).where(eq(paymentPackagesTable.isActive, true));
}

export async function getPackageById(id: number): Promise<typeof paymentPackagesTable.$inferSelect | null> {
  const [pkg] = await db.select().from(paymentPackagesTable).where(eq(paymentPackagesTable.id, id)).limit(1);
  return pkg ?? null;
}

export async function createPayment(userId: number, packageId: number, method: "card" | "crypto" | "gateway"): Promise<typeof paymentsTable.$inferSelect> {
  const pkg = await getPackageById(packageId);
  if (!pkg) throw new Error("Package not found");

  const [payment] = await db.insert(paymentsTable).values({
    userId,
    packageId,
    coins: pkg.coins,
    price: pkg.price,
    currency: pkg.currency,
    method,
    status: "pending",
    createdAt: new Date(),
  }).returning();
  return payment;
}

export async function submitReceipt(paymentId: number, receiptFileId: string): Promise<void> {
  await db.update(paymentsTable).set({ receiptFileId }).where(eq(paymentsTable.id, paymentId));
}

export async function setAdminMessageId(paymentId: number, messageId: number, groupId: number): Promise<void> {
  await db.update(paymentsTable).set({ adminMessageId: messageId, adminGroupId: groupId }).where(eq(paymentsTable.id, paymentId));
}

export async function approvePayment(paymentId: number, adminId: number): Promise<typeof paymentsTable.$inferSelect | null> {
  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, paymentId)).limit(1);
  if (!payment || payment.status !== "pending") return null;
  await db.update(paymentsTable).set({ status: "approved", processedBy: adminId, processedAt: new Date() }).where(eq(paymentsTable.id, paymentId));
  await addCoins(payment.userId, payment.coins, "payment", `Purchase of ${payment.coins} coins`);
  return payment;
}

export async function rejectPayment(paymentId: number, adminId: number, reason?: string): Promise<typeof paymentsTable.$inferSelect | null> {
  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.id, paymentId)).limit(1);
  if (!payment || payment.status !== "pending") return null;
  await db.update(paymentsTable).set({ status: "rejected", processedBy: adminId, processedAt: new Date(), rejectionReason: reason ?? null }).where(eq(paymentsTable.id, paymentId));
  return payment;
}

export async function getPendingPayment(userId: number): Promise<typeof paymentsTable.$inferSelect | null> {
  const [payment] = await db.select().from(paymentsTable).where(
    and(eq(paymentsTable.userId, userId), eq(paymentsTable.status, "pending"))
  ).orderBy(desc(paymentsTable.createdAt)).limit(1);
  return payment ?? null;
}

export async function getSetting(key: string): Promise<string | null> {
  const [setting] = await db.select().from(adminSettingsTable).where(eq(adminSettingsTable.key, key)).limit(1);
  return setting?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.insert(adminSettingsTable).values({ key, value, updatedAt: new Date() }).onConflictDoUpdate({
    target: adminSettingsTable.key,
    set: { value, updatedAt: new Date() },
  });
}

export async function isMethodEnabled(method: "card" | "crypto" | "gateway"): Promise<boolean> {
  const val = await getSetting(`payment_method_${method}`);
  return val !== "disabled";
}

export async function ensureDefaultPackages(): Promise<void> {
  const existing = await db.select().from(paymentPackagesTable).limit(1);
  if (existing.length > 0) return;
  await db.insert(paymentPackagesTable).values([
    { coins: 10, price: 10000, currency: "IRT", label: "10 سکه", isActive: true, createdAt: new Date() },
    { coins: 25, price: 22000, currency: "IRT", label: "25 سکه", isActive: true, createdAt: new Date() },
    { coins: 50, price: 40000, currency: "IRT", label: "50 سکه", isActive: true, createdAt: new Date() },
    { coins: 100, price: 70000, currency: "IRT", label: "100 سکه", isActive: true, createdAt: new Date() },
  ]);
}
