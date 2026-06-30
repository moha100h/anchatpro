import { db } from "@workspace/db";
import { usersTable, reportsTable, blocksTable, warningsTable, rateLimitsTable, badWordsTable } from "@workspace/db";
import { eq, and, gte, gt, sql, lt } from "drizzle-orm";

// In-memory rate limiter (fallback for fast checks)
const rateLimitCache = new Map<string, { count: number; resetAt: number }>();

/** Owner IDs: users who can NEVER be banned (loaded from ADMIN_IDS env — first entry) */
let OWNER_IDS = new Set<number>();

export function setOwnerIds(ids: number[]): void {
  OWNER_IDS = new Set(ids);
}

export function isOwner(userId: number): boolean {
  return OWNER_IDS.has(userId);
}

export async function checkRateLimit(userId: number, action: string, maxCount: number, windowSeconds: number): Promise<boolean> {
  const key = `${userId}:${action}`;
  const now = Date.now();
  const entry = rateLimitCache.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitCache.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return true;
  }

  if (entry.count >= maxCount) return false;
  entry.count++;
  return true;
}

export async function containsBadWord(text: string): Promise<boolean> {
  const words = await db.select().from(badWordsTable);
  const lower = text.toLowerCase();
  return words.some(w => lower.includes(w.word.toLowerCase()));
}

export async function addBadWord(word: string, language = "all"): Promise<void> {
  await db.insert(badWordsTable).values({ word, language, createdAt: new Date() }).onConflictDoNothing();
}

/**
 * Bulk-insert an array of words. Returns { added, skipped } counts.
 */
export async function addBadWordsBulk(
  rawWords: string[],
  language = "all"
): Promise<{ added: number; skipped: number }> {
  const now = new Date();
  const unique = [...new Set(rawWords.map((w) => w.trim().toLowerCase()).filter((w) => w.length > 0))];
  if (unique.length === 0) return { added: 0, skipped: 0 };

  // Fetch existing words to know what's new
  const existing = await db.select({ word: badWordsTable.word }).from(badWordsTable);
  const existingSet = new Set(existing.map((r) => r.word.toLowerCase()));

  const toInsert = unique.filter((w) => !existingSet.has(w));
  const skipped  = unique.length - toInsert.length;

  if (toInsert.length > 0) {
    // Insert in chunks of 100 to avoid query size limits
    for (let i = 0; i < toInsert.length; i += 100) {
      const chunk = toInsert.slice(i, i + 100);
      await db
        .insert(badWordsTable)
        .values(chunk.map((word) => ({ word, language, createdAt: now })))
        .onConflictDoNothing();
    }
  }

  return { added: toInsert.length, skipped };
}

export async function issueWarning(userId: number, reason: string, issuedBy?: number): Promise<number> {
  await db.insert(warningsTable).values({ userId, issuedBy: issuedBy ?? null, reason, createdAt: new Date() });
  const [user] = await db.select({ warningCount: usersTable.warningCount }).from(usersTable).where(eq(usersTable.telegramId, userId)).limit(1);
  const newCount = (user?.warningCount ?? 0) + 1;
  await db.update(usersTable).set({ warningCount: newCount, updatedAt: new Date() }).where(eq(usersTable.telegramId, userId));

  if (newCount >= 3) {
    const until = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.update(usersTable).set({ status: "restricted", restrictedUntil: until, updatedAt: new Date() }).where(eq(usersTable.telegramId, userId));
  }

  return newCount;
}

/** Ban a user. Owners can NEVER be banned. */
export async function banUser(userId: number, requestedBy?: number): Promise<{ success: boolean; reason?: string }> {
  if (isOwner(userId)) {
    return { success: false, reason: "Cannot ban the owner" };
  }
  await db.update(usersTable).set({ status: "banned", updatedAt: new Date() }).where(eq(usersTable.telegramId, userId));
  return { success: true };
}

export async function unbanUser(userId: number): Promise<void> {
  await db.update(usersTable).set({ status: "active", warningCount: 0, restrictedUntil: null, updatedAt: new Date() }).where(eq(usersTable.telegramId, userId));
}

export interface ReportResult {
  /** Total reports against this user in the last 24 hours (including this one) */
  recentCount: number;
  /** Whether a 3-hour restriction was just applied */
  restricted: boolean;
  /** If restricted: until when */
  restrictedUntil?: Date;
}

export async function reportUser(
  reporterId: number,
  reportedId: number,
  reason: string,
  sessionId?: number
): Promise<ReportResult> {
  const now = new Date();

  await db.insert(reportsTable).values({
    reporterId,
    reportedId,
    reason,
    sessionId: sessionId ?? null,
    status: "pending",
    createdAt: now,
  });

  // Increment cumulative report count (kept for admin visibility)
  await db
    .update(usersTable)
    .set({ reportCount: sql`${usersTable.reportCount} + 1`, updatedAt: now })
    .where(eq(usersTable.telegramId, reportedId));

  // Count how many reports this user has received in the last 24 hours
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [countRow] = await db
    .select({ cnt: sql<number>`cast(count(*) as int)` })
    .from(reportsTable)
    .where(
      and(
        eq(reportsTable.reportedId, reportedId),
        gte(reportsTable.createdAt, since24h)
      )
    );

  const recentCount = countRow?.cnt ?? 1;

  // Every 3 reports within 24 hours → restrict for 3 hours
  if (recentCount > 0 && recentCount % 3 === 0) {
    const until = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    await db
      .update(usersTable)
      .set({ status: "restricted", restrictedUntil: until, updatedAt: now })
      .where(eq(usersTable.telegramId, reportedId));
    return { recentCount, restricted: true, restrictedUntil: until };
  }

  return { recentCount, restricted: false };
}

export async function blockUser(blockerId: number, blockedId: number, context?: string): Promise<boolean> {
  const existing = await db.select().from(blocksTable).where(
    and(eq(blocksTable.blockerId, blockerId), eq(blocksTable.blockedId, blockedId))
  ).limit(1);
  if (existing.length > 0) return false;
  await db.insert(blocksTable).values({ blockerId, blockedId, context: context ?? null, createdAt: new Date() });
  return true;
}

export async function isBlocked(blockerId: number, blockedId: number): Promise<boolean> {
  const [block] = await db.select().from(blocksTable).where(
    and(eq(blocksTable.blockerId, blockerId), eq(blocksTable.blockedId, blockedId))
  ).limit(1);
  return !!block;
}

export async function getPendingReportsCount(): Promise<number> {
  const [row] = await db
    .select({ cnt: sql<number>`cast(count(*) as int)` })
    .from(reportsTable)
    .where(eq(reportsTable.status, "pending"));
  return row?.cnt ?? 0;
}

export interface PendingReport {
  id: number;
  reporterId: number;
  reportedId: number;
  reason: string;
  description: string | null;
  createdAt: Date;
}

export async function getPendingReports(limit = 10): Promise<PendingReport[]> {
  return db
    .select({
      id:          reportsTable.id,
      reporterId:  reportsTable.reporterId,
      reportedId:  reportsTable.reportedId,
      reason:      reportsTable.reason,
      description: reportsTable.description,
      createdAt:   reportsTable.createdAt,
    })
    .from(reportsTable)
    .where(eq(reportsTable.status, "pending"))
    .orderBy(reportsTable.createdAt)
    .limit(limit);
}

export async function dismissReport(reportId: number, reviewedBy: number): Promise<void> {
  await db
    .update(reportsTable)
    .set({ status: "dismissed", reviewedAt: new Date(), reviewedBy })
    .where(eq(reportsTable.id, reportId));
}

export async function markReportReviewed(reportId: number, reviewedBy: number): Promise<void> {
  await db
    .update(reportsTable)
    .set({ status: "reviewed", reviewedAt: new Date(), reviewedBy })
    .where(eq(reportsTable.id, reportId));
}

export async function initDefaultBadWords(): Promise<void> {
  const existing = await db.select().from(badWordsTable).limit(1);
  if (existing.length > 0) return;
  const defaultWords = [
    // ─── فارسی ───
    "کص","کصمادر","کصکش","کسکش","کیر","کیری","کیرم","کیرت","کیرش","کیرخر",
    "کیرخور","کیرمال","کیرکش","جنده","جندگ","جنده‌زاده","مادرجنده","مادر قحبه",
    "مادرقحبه","قحبه","جاکش","مادرخراب","سگ‌پدر","سگ‌مادر","حرومزاده","حرامزاده",
    "ولدزنا","بی‌ناموس","بیناموس","بی ناموس","بی‌شرف","بیشرف","بی شرف",
    "بی‌غیرت","بیغیرت","کونی","کونکش","کون‌خور","کونده","کون‌کش","کون‌نشور",
    "خایه","خایه‌مال","تخم","تخم‌سگ","تخمات","گه‌خور","گهخور",
    // ─── فینگلیش ───
    "kos","koss","koos","kosmador","koskesh","kas kesh","kir","keer","kiir","kiri",
    "kirm","kiret","kiresh","kir khor","kirmal","kir kesh","jende","jendeh","jandeg",
    "madarjende","madar ghabhe","ghabhe","jakesh","haroomzade","haramzade",
    "valad zena","binamoos","bi namoos","bisharaf","bi sharaf","bighayrat","bi gheyrat",
    "kuni","koni","kon kesh","khaye","khayemal","gayidam","gaidam","gayidan","gaidan",
    "gayeed","begam","begayid","ridam","shash","shashidam",
    // ─── انگلیسی ───
    "shit","fuck","fucking","fucked","fucker","motherfucker","son of a bitch","bitch",
    "bastard","asshole","ass","assfuck","dick","dickhead","dickless","cock","cocksucker",
    "cunt","pussy","whore","slut","hoe","jerkoff","jackass","dumbass","suck my dick",
    "suck my cock","blowjob","blow job","cum","cumshot","semen","horny","gangbang",
    "rape","rapist",
  ];
  // Bulk insert in a single chunked operation
  const now = new Date();
  for (let i = 0; i < defaultWords.length; i += 100) {
    const chunk = defaultWords.slice(i, i + 100);
    await db
      .insert(badWordsTable)
      .values(chunk.map((word) => ({ word, language: "all", createdAt: now })))
      .onConflictDoNothing();
  }
}
