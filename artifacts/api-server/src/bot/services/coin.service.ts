import { db } from "@workspace/db";
import { usersTable, coinTransactionsTable, referralsTable, adminSettingsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import type { User } from "@workspace/db";

type TxType = "referral_reward" | "chat_cost" | "group_cost" | "admin_add" | "admin_remove" | "payment" | "refund" | "magic_spend";

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

/** Returns reward info so the caller can notify both parties. Returns null if no pending referral. */
export async function processReferralReward(
  referredId: number
): Promise<{ referrerId: number; inviterCoins: number; inviteeCoins: number } | null> {
  const [referral] = await db
    .select()
    .from(referralsTable)
    .where(and(eq(referralsTable.referredId, referredId), eq(referralsTable.rewarded, 0)))
    .limit(1);
  if (!referral) return null;

  const [inviterSetting] = await db
    .select({ value: adminSettingsTable.value })
    .from(adminSettingsTable)
    .where(eq(adminSettingsTable.key, "referral_reward_inviter"))
    .limit(1);
  const [inviteeSetting] = await db
    .select({ value: adminSettingsTable.value })
    .from(adminSettingsTable)
    .where(eq(adminSettingsTable.key, "referral_reward_invitee"))
    .limit(1);

  const inviterCoins = inviterSetting?.value ? parseInt(inviterSetting.value, 10) : 5;
  const inviteeCoins = inviteeSetting?.value ? parseInt(inviteeSetting.value, 10) : 0;

  if (inviterCoins > 0) {
    await addCoins(referral.referrerId, inviterCoins, "referral_reward", `Referral reward for inviting user ${referredId}`);
  }
  if (inviteeCoins > 0) {
    await addCoins(referredId, inviteeCoins, "referral_reward", `Welcome bonus for joining via referral`);
  }
  await db
    .update(referralsTable)
    .set({ rewarded: inviterCoins + inviteeCoins })
    .where(eq(referralsTable.id, referral.id));

  return { referrerId: referral.referrerId, inviterCoins, inviteeCoins };
}

export async function getReferralStats(telegramId: number): Promise<{ total: number; coinsEarned: number }> {
  const referrals = await db.select().from(referralsTable).where(eq(referralsTable.referrerId, telegramId));
  const coinsEarned = referrals.reduce((s, r) => s + (r.rewarded ?? 0), 0);
  return { total: referrals.length, coinsEarned };
}
