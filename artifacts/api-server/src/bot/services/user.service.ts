import { db } from "@workspace/db";
import { usersTable, referralsTable, coinTransactionsTable, anonymousMessagesTable } from "@workspace/db";
import { eq, gte, desc, count, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { User } from "@workspace/db";

export async function getOrCreateUser(telegramId: number, firstName?: string, username?: string, referralCode?: string): Promise<User> {
  const existing = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).limit(1);
  if (existing[0]) {
    await db.update(usersTable).set({
      lastSeen: new Date(),
      firstName: firstName ?? existing[0].firstName,
      username: username ?? existing[0].username,
      updatedAt: new Date(),
    }).where(eq(usersTable.telegramId, telegramId));
    return { ...existing[0], lastSeen: new Date() };
  }

  const newReferralCode = nanoid(10);
  const anonToken = nanoid(8);  // Short 8-char token for concise anonymous links

  const [user] = await db.insert(usersTable).values({
    telegramId,
    firstName: firstName ?? "",
    username,
    referralCode: newReferralCode,
    anonymousToken: anonToken,
    coins: 0,
    status: "active",
    warningCount: 0,
    isInQueue: false,
    isInChat: false,
    isInGroup: false,
    language: "fa",
    lastSeen: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  if (referralCode) {
    // Support both r_ and ref_ formats
    const cleanCode = referralCode.startsWith("r_") ? referralCode.slice(2) : referralCode;
    const referrer = await db.select().from(usersTable).where(eq(usersTable.referralCode, cleanCode)).limit(1);
    if (referrer[0] && referrer[0].telegramId !== telegramId) {
      await db.insert(referralsTable).values({
        referrerId: referrer[0].telegramId,
        referredId: telegramId,
        rewarded: 0,
        createdAt: new Date(),
      }).onConflictDoNothing();
    }
  }

  return user;
}

export async function getUserByTelegramId(telegramId: number): Promise<User | null> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).limit(1);
  return user ?? null;
}

export async function getUserByReferralCode(code: string): Promise<User | null> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.referralCode, code)).limit(1);
  return user ?? null;
}

export async function getUserReferral(telegramId: number): Promise<{ referrerId: number } | null> {
  const [referral] = await db
    .select({ referrerId: referralsTable.referrerId })
    .from(referralsTable)
    .where(eq(referralsTable.referredId, telegramId))
    .limit(1);
  return referral ?? null;
}

export async function getUserByAnonToken(token: string): Promise<User | null> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.anonymousToken, token)).limit(1);
  return user ?? null;
}

/**
 * Ensures the user's anonymousToken is short (≤12 chars).
 * Existing 32-char tokens (legacy) are regenerated to 8 chars on first use.
 */
export async function refreshAnonToken(telegramId: number): Promise<string> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).limit(1);
  if (user?.anonymousToken && user.anonymousToken.length <= 12) {
    return user.anonymousToken;
  }
  const shortToken = nanoid(8);
  await db.update(usersTable).set({ anonymousToken: shortToken, updatedAt: new Date() }).where(eq(usersTable.telegramId, telegramId));
  return shortToken;
}

export async function updateUser(telegramId: number, data: Partial<Omit<User, "telegramId">>): Promise<void> {
  await db.update(usersTable).set({ ...data, updatedAt: new Date() }).where(eq(usersTable.telegramId, telegramId));
}

export async function setAnonLinkEnabled(telegramId: number, enabled: boolean): Promise<void> {
  await db.update(usersTable).set({ anonLinkEnabled: enabled, updatedAt: new Date() }).where(eq(usersTable.telegramId, telegramId));
}

export async function setAnonLinkPaid(telegramId: number): Promise<void> {
  await db.update(usersTable).set({ anonLinkPaid: true, updatedAt: new Date() }).where(eq(usersTable.telegramId, telegramId));
}

export async function setUserLanguage(telegramId: number, lang: "fa" | "en"): Promise<void> {
  await db.update(usersTable).set({ language: lang, updatedAt: new Date() }).where(eq(usersTable.telegramId, telegramId));
}

/**
 * Set or CLEAR the setupStep for a user.
 * Pass null to clear (sets the column to NULL in the database).
 * IMPORTANT: Do NOT pass undefined — Drizzle skips undefined fields entirely.
 */
export async function setUserSetupStep(telegramId: number, step: string | null): Promise<void> {
  await db.update(usersTable)
    .set({ setupStep: step, updatedAt: new Date() })
    .where(eq(usersTable.telegramId, telegramId));
}

export async function isUserBanned(telegramId: number): Promise<boolean> {
  const [user] = await db.select({ status: usersTable.status }).from(usersTable).where(eq(usersTable.telegramId, telegramId)).limit(1);
  return user?.status === "banned";
}

export async function isUserRestricted(telegramId: number): Promise<boolean> {
  const [user] = await db
    .select({ status: usersTable.status, restrictedUntil: usersTable.restrictedUntil })
    .from(usersTable)
    .where(eq(usersTable.telegramId, telegramId))
    .limit(1);
  if (!user) return false;
  if (user.status === "banned") return true;
  if (user.status === "restricted" && user.restrictedUntil && new Date() < user.restrictedUntil) return true;
  if (user.status === "restricted" && (!user.restrictedUntil || new Date() >= user.restrictedUntil)) {
    await db.update(usersTable).set({ status: "active", restrictedUntil: null, updatedAt: new Date() }).where(eq(usersTable.telegramId, telegramId));
  }
  return false;
}

export async function getAllUsers(): Promise<User[]> {
  return db.select().from(usersTable);
}

export async function getActiveUsers(days = 7): Promise<User[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return db.select().from(usersTable).where(gte(usersTable.lastSeen, since));
}

export async function searchUser(id: number): Promise<User | null> {
  return getUserByTelegramId(id);
}

export async function getReferralTree(userId: number, depth = 3): Promise<Array<{ level: number; user: User }>> {
  const result: Array<{ level: number; user: User }> = [];
  const visited = new Set<number>();

  async function traverse(uid: number, currentDepth: number) {
    if (currentDepth <= 0 || visited.has(uid)) return;
    visited.add(uid);
    const referrals = await db.select().from(referralsTable).where(eq(referralsTable.referrerId, uid));
    for (const ref of referrals) {
      const refUser = await getUserByTelegramId(ref.referredId);
      if (refUser) {
        result.push({ level: depth - currentDepth + 1, user: refUser });
        await traverse(ref.referredId, currentDepth - 1);
      }
    }
  }

  await traverse(userId, depth);
  return result;
}

/**
 * Returns all users who have at least one unread anonymous message.
 * Used by the midnight cron to send daily inbox reminders.
 */
export async function getUsersWithUnreadAnonMessages(): Promise<Array<{ receiverId: number; unreadCount: number }>> {
  const rows = await db
    .select({ receiverId: anonymousMessagesTable.receiverId, cnt: count() })
    .from(anonymousMessagesTable)
    .where(and(
      eq(anonymousMessagesTable.isRead, false),
    ))
    .groupBy(anonymousMessagesTable.receiverId);

  return rows
    .filter((r) => r.receiverId !== null)
    .map((r) => ({ receiverId: r.receiverId as number, unreadCount: Number(r.cnt) }));
}

export async function getTotalStats() {
  const [totalUsers] = await db.select({ count: count() }).from(usersTable);
  const week = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [activeUsers] = await db.select({ count: count() }).from(usersTable).where(gte(usersTable.lastSeen, week));
  const [totalTransactions] = await db.select({ count: count() }).from(coinTransactionsTable);
  return {
    totalUsers: totalUsers.count,
    activeUsers: activeUsers.count,
    totalTransactions: totalTransactions.count,
  };
}
