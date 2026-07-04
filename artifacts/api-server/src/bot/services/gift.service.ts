import { db, giftCodesTable, giftCodeRedemptionsTable, referralsTable, usersTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { addCoins } from "./coin.service.js";

export type GiftRedeemResult =
  | { success: true; coins: number }
  | { success: false; error: "invalid" | "expired" | "already_used" | "inactive" };

export interface TopReferrer {
  telegramId: number;
  firstName: string;
  username: string | null;
  referralCount: number;
  coinsEarned: number;
}

// ─── 5-minute in-memory leaderboard cache ─────────────────────────────────────
let _lbCache: { data: TopReferrer[]; expiresAt: number } | null = null;
let _lbLastUpdated = 0;
const LB_TTL = 5 * 60 * 1000; // 5 minutes

export function getLeaderboardLastUpdated(): number { return _lbLastUpdated; }

// ─── Redeem a gift code ────────────────────────────────────────────────────────
export async function redeemGiftCode(userId: number, rawCode: string): Promise<GiftRedeemResult> {
  const code = rawCode.trim().toUpperCase().replace(/\s+/g, "");

  const [giftCode] = await db
    .select()
    .from(giftCodesTable)
    .where(eq(giftCodesTable.code, code))
    .limit(1);

  if (!giftCode)                              return { success: false, error: "invalid" };
  if (!giftCode.isActive)                     return { success: false, error: "inactive" };
  if (giftCode.usedCount >= giftCode.maxUsage) return { success: false, error: "expired" };

  // Anti-fraud: one redemption per user per code
  const [existing] = await db
    .select({ id: giftCodeRedemptionsTable.id })
    .from(giftCodeRedemptionsTable)
    .where(
      and(
        eq(giftCodeRedemptionsTable.codeId, giftCode.id),
        eq(giftCodeRedemptionsTable.userId, userId)
      )
    )
    .limit(1);

  if (existing) return { success: false, error: "already_used" };

  // Atomic-ish: insert redemption then increment count
  await db.insert(giftCodeRedemptionsTable).values({
    codeId:     giftCode.id,
    userId,
    redeemedAt: new Date(),
  });

  await db
    .update(giftCodesTable)
    .set({ usedCount: giftCode.usedCount + 1 })
    .where(eq(giftCodesTable.id, giftCode.id));

  await addCoins(userId, giftCode.coins, "referral_reward", `Gift code: ${code}`);

  return { success: true, coins: giftCode.coins };
}

// ─── Create a gift code (admin) ────────────────────────────────────────────────
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I, O
const DIGITS  = "23456789";                  // no 0, 1

export async function createGiftCode(coins: number, maxUsage: number, createdBy: number): Promise<string> {
  let code = "";
  for (let attempt = 0; attempt < 60; attempt++) {
    const p1 = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join("");
    const p2 = Array.from({ length: 4 }, () => DIGITS[Math.floor(Math.random() * DIGITS.length)]).join("");
    code = `${p1}-${p2}`;
    const [clash] = await db.select({ id: giftCodesTable.id }).from(giftCodesTable).where(eq(giftCodesTable.code, code)).limit(1);
    if (!clash) break;
  }

  await db.insert(giftCodesTable).values({ code, coins, maxUsage, usedCount: 0, isActive: true, createdBy, createdAt: new Date() });
  return code;
}

// ─── List all gift codes (admin) ───────────────────────────────────────────────
export async function listGiftCodes() {
  return db.select().from(giftCodesTable).orderBy(desc(giftCodesTable.createdAt));
}

// ─── Deactivate a code (admin) ────────────────────────────────────────────────
export async function deactivateGiftCode(codeId: number): Promise<void> {
  await db.update(giftCodesTable).set({ isActive: false }).where(eq(giftCodesTable.id, codeId));
}

// ─── Top referrers leaderboard — cached 3h ────────────────────────────────────
export async function getTopReferrers(limit = 20, forceRefresh = false): Promise<TopReferrer[]> {
  const now = Date.now();
  if (!forceRefresh && _lbCache && _lbCache.expiresAt > now) return _lbCache.data;

  const rows = await db
    .select({
      telegramId:    usersTable.telegramId,
      firstName:     usersTable.firstName,
      username:      usersTable.username,
      referralCount: sql<number>`cast(count(${referralsTable.id}) as int)`,
      coinsEarned:   sql<number>`cast(coalesce(sum(${referralsTable.rewarded}), 0) as int)`,
    })
    .from(referralsTable)
    .innerJoin(usersTable, eq(referralsTable.referrerId, usersTable.telegramId))
    .where(sql`${referralsTable.rewarded} > 0`)
    .groupBy(usersTable.telegramId, usersTable.firstName, usersTable.username)
    .orderBy(desc(sql`count(${referralsTable.id})`))
    .limit(limit);

  _lbLastUpdated = now;
  const data: TopReferrer[] = rows.map(r => ({
    telegramId:    r.telegramId,
    firstName:     r.firstName ?? "ناشناس",
    username:      r.username ?? null,
    referralCount: r.referralCount,
    coinsEarned:   r.coinsEarned,
  }));

  _lbCache = { data, expiresAt: now + LB_TTL };
  return data;
}

export function invalidateLeaderboardCache(): void {
  _lbCache = null;
}

// ─── Get a user's referral rank (live query, no cache) ────────────────────────
export async function getReferralRank(
  userId: number
): Promise<{ rank: number; count: number } | null> {
  const result = await db.execute(sql`
    WITH counts AS (
      SELECT referrer_id, count(*)::int AS cnt
      FROM referrals
      WHERE rewarded > 0
      GROUP BY referrer_id
    ),
    my AS (
      SELECT cnt FROM counts WHERE referrer_id = ${userId}
    )
    SELECT
      my.cnt                                              AS count,
      (SELECT count(*)::int FROM counts WHERE cnt > my.cnt) + 1 AS rank
    FROM my
    LIMIT 1
  `);

  const row = (result as unknown as { rows?: { count: string | number; rank: string | number }[] }).rows?.[0];
  if (!row) return null;
  const count = parseInt(String(row.count), 10);
  if (!count || count === 0) return null;
  return { rank: parseInt(String(row.rank), 10), count };
}
