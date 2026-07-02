import { db, usersTable, coinTransactionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { getSetting } from "../bot/services/payment.service.js";

export type CallType     = "voice" | "video";
export type GenderFilter = "male" | "female" | "random";

const COST_DEFAULTS: Record<string, number> = {
  call_cost_voice_random: 3,
  call_cost_voice_gender: 5,
  call_cost_video_random: 6,
  call_cost_video_gender: 10,
};

export async function getCallCost(callType: CallType, genderFilter: GenderFilter): Promise<number> {
  const key =
    callType === "voice"
      ? genderFilter === "random" ? "call_cost_voice_random" : "call_cost_voice_gender"
      : genderFilter === "random" ? "call_cost_video_random" : "call_cost_video_gender";
  const val = await getSetting(key);
  return val ? Math.max(0, parseInt(val, 10)) : COST_DEFAULTS[key]!;
}

export async function getUserCoins(userId: number): Promise<number> {
  const [user] = await db
    .select({ coins: usersTable.coins })
    .from(usersTable)
    .where(eq(usersTable.telegramId, userId))
    .limit(1);
  return user?.coins ?? 0;
}

/**
 * Atomically deducts coins from BOTH users in one transaction.
 * Row-level locking in consistent ID order prevents deadlocks.
 * Records a `call_cost` transaction entry for each user.
 */
export async function deductCallCoinsFromBoth(
  callerUserId:   number,
  callerAmount:   number,
  receiverUserId: number,
  receiverAmount: number,
): Promise<
  | { success: true;  callerBalance: number; receiverBalance: number }
  | { success: false; reason: string; who: "caller" | "receiver" | "both" }
> {
  return await db.transaction(async (tx) => {
    const rows = await tx
      .select({ telegramId: usersTable.telegramId, coins: usersTable.coins })
      .from(usersTable)
      .where(sql`${usersTable.telegramId} = ANY(ARRAY[${callerUserId}::bigint, ${receiverUserId}::bigint])`)
      .orderBy(usersTable.telegramId)
      .for("update");

    const callerRow   = rows.find(r => r.telegramId === callerUserId);
    const receiverRow = rows.find(r => r.telegramId === receiverUserId);

    const callerOk   = callerRow   && callerRow.coins   >= callerAmount;
    const receiverOk = receiverRow && receiverRow.coins >= receiverAmount;

    if (!callerOk && !receiverOk) return { success: false as const, reason: "insufficient_coins", who: "both"     as const };
    if (!callerOk)                 return { success: false as const, reason: "insufficient_coins", who: "caller"   as const };
    if (!receiverOk)               return { success: false as const, reason: "insufficient_coins", who: "receiver" as const };

    const [c] = await tx
      .update(usersTable)
      .set({ coins: sql`${usersTable.coins} - ${callerAmount}`, updatedAt: new Date() })
      .where(eq(usersTable.telegramId, callerUserId))
      .returning({ coins: usersTable.coins });

    const [r] = await tx
      .update(usersTable)
      .set({ coins: sql`${usersTable.coins} - ${receiverAmount}`, updatedAt: new Date() })
      .where(eq(usersTable.telegramId, receiverUserId))
      .returning({ coins: usersTable.coins });

    // Record transaction history for both users
    await tx.insert(coinTransactionsTable).values([
      {
        userId:        callerUserId,
        amount:        -callerAmount,
        type:          "call_cost",
        description:   "تماس ناشناس",
        balanceBefore: callerRow!.coins,
        balanceAfter:  c!.coins,
      },
      {
        userId:        receiverUserId,
        amount:        -receiverAmount,
        type:          "call_cost",
        description:   "تماس ناشناس",
        balanceBefore: receiverRow!.coins,
        balanceAfter:  r!.coins,
      },
    ]);

    return { success: true as const, callerBalance: c!.coins, receiverBalance: r!.coins };
  });
}
