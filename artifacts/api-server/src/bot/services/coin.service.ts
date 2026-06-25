import { db } from "@workspace/db";
import { usersTable, coinTransactionsTable, referralsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import type { User } from "@workspace/db";

type TxType = "referral_reward" | "chat_cost" | "group_cost" | "admin_add" | "admin_remove" | "payment" | "refund";

export async function getBalance(telegramId: number): Promise<number> {
  const [user] = await db.select({ coins: usersTable.coins }).from(usersTable).where(eq(usersTable.telegramId, telegramId)).limit(1);
  return user?.coins ?? 0;
}

export async function addCoins(telegramId: number, amount: number, type: TxType, description?: string): Promise<number> {
  const balance = await getBalance(telegramId);
  const newBalance = balance + amount;
  await db.update(usersTable).set({ coins: newBalance, updatedAt: new Date() }).where(eq(usersTable.telegramId, telegramId));
  await db.insert(coinTransactionsTable).values({
    userId: telegramId,
    amount,
    type,
    description: description ?? null,
    balanceBefore: balance,
    balanceAfter: newBalance,
    createdAt: new Date(),
  });
  return newBalance;
}

export async function deductCoins(telegramId: number, amount: number, type: TxType, description?: string): Promise<{ success: boolean; newBalance: number }> {
  const balance = await getBalance(telegramId);
  if (balance < amount) return { success: false, newBalance: balance };
  const newBalance = balance - amount;
  await db.update(usersTable).set({ coins: newBalance, updatedAt: new Date() }).where(eq(usersTable.telegramId, telegramId));
  await db.insert(coinTransactionsTable).values({
    userId: telegramId,
    amount: -amount,
    type,
    description: description ?? null,
    balanceBefore: balance,
    balanceAfter: newBalance,
    createdAt: new Date(),
  });
  return { success: true, newBalance };
}

export async function getCoinHistory(telegramId: number, limit = 10): Promise<typeof coinTransactionsTable.$inferSelect[]> {
  return db.select().from(coinTransactionsTable).where(eq(coinTransactionsTable.userId, telegramId)).orderBy(desc(coinTransactionsTable.createdAt)).limit(limit);
}

export async function processReferralReward(referredId: number): Promise<void> {
  const [referral] = await db.select().from(referralsTable).where(and(eq(referralsTable.referredId, referredId), eq(referralsTable.rewarded, 0))).limit(1);
  if (!referral) return;
  await addCoins(referral.referrerId, 5, "referral_reward", `Referral reward for user ${referredId}`);
  await db.update(referralsTable).set({ rewarded: 5 }).where(eq(referralsTable.id, referral.id));
}

export async function getReferralStats(telegramId: number): Promise<{ total: number; coinsEarned: number }> {
  const referrals = await db.select().from(referralsTable).where(eq(referralsTable.referrerId, telegramId));
  const coinsEarned = referrals.reduce((s, r) => s + (r.rewarded ?? 0), 0);
  return { total: referrals.length, coinsEarned };
}
