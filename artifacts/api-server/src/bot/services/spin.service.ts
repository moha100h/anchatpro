import { db } from "@workspace/db";
import { usersTable, coinTransactionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getSetting } from "./payment.service.js";

/** Returns today's date string "YYYY-MM-DD" in Tehran timezone */
function getTehranDate(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tehran" });
}

/**
 * Weighted random coin picker:
 * 70% of the time → low range [min, mid]
 * 30% of the time → high range [mid+1, max]
 */
function pickSpinAmount(min: number, max: number): number {
  const mid = Math.floor((min + max) / 2);
  const isHighTier = Math.random() < 0.30;

  if (isHighTier) {
    const highMin = mid + 1;
    if (highMin > max) return max;
    return highMin + Math.floor(Math.random() * (max - mid));
  } else {
    return min + Math.floor(Math.random() * (mid - min + 1));
  }
}

export type SpinResult =
  | { success: true;  coins: number; newBalance: number; tier: "low" | "high" }
  | { success: false; reason: "already_spun" }
  | { success: false; reason: "user_not_found" };

export async function spinWheel(userId: number): Promise<SpinResult> {
  const today = getTehranDate();

  const [minStr, maxStr] = await Promise.all([
    getSetting("spin_min_coins"),
    getSetting("spin_max_coins"),
  ]);
  const min = Math.max(1, parseInt(minStr ?? "1", 10));
  const max = Math.max(min + 1, parseInt(maxStr ?? "10", 10));
  const mid = Math.floor((min + max) / 2);

  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ coins: usersTable.coins, lastSpinDate: usersTable.lastSpinDate })
      .from(usersTable)
      .where(eq(usersTable.telegramId, userId))
      .for("update");

    if (!user) return { success: false as const, reason: "user_not_found" as const };
    if (user.lastSpinDate === today) return { success: false as const, reason: "already_spun" as const };

    const coins = pickSpinAmount(min, max);
    const tier: "low" | "high" = coins <= mid ? "low" : "high";
    const newBalance = user.coins + coins;

    await tx
      .update(usersTable)
      .set({ coins: newBalance, lastSpinDate: today, updatedAt: new Date() })
      .where(eq(usersTable.telegramId, userId));

    await tx.insert(coinTransactionsTable).values({
      userId,
      amount: coins,
      type: "daily_spin",
      description: "Daily spin wheel reward",
      balanceBefore: user.coins,
      balanceAfter: newBalance,
    });

    return { success: true as const, coins, newBalance, tier };
  });
}

/** Check if user has spun today (read-only) */
export async function hasSpunToday(userId: number): Promise<boolean> {
  const today = getTehranDate();
  const [user] = await db
    .select({ lastSpinDate: usersTable.lastSpinDate })
    .from(usersTable)
    .where(eq(usersTable.telegramId, userId));
  return user?.lastSpinDate === today;
}
