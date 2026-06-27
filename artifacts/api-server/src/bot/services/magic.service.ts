/**
 * Magic features service — اقیانوس احساس
 * Handles: پیام در بطری | زنجیر احساس | نامه به آینده | فرکانس ناشناس
 */

import { db } from "@workspace/db";
import {
  bottleMessagesTable, chainsTable, chainLinksTable,
  futureLettersTable, frequencyQueueTable, magicUsageTable,
} from "@workspace/db";
import { eq, and, ne, notInArray, sql, lt, isNull, asc } from "drizzle-orm";
import { getSetting } from "./payment.service.js";
import { deductCoins, getBalance } from "./coin.service.js";

// ─── Feature settings (from admin_settings) ───────────────────────────────────

const DEFAULTS = {
  bottle:    { cost: 2, daily: 3 },
  chain:     { cost: 1, daily: 5 },
  letter:    { cost: 1, daily: 2 },
  frequency: { cost: 1, daily: 5 },
} as const;

export type MagicFeature = keyof typeof DEFAULTS;

export interface FeatureConfig {
  enabled: boolean;
  cost: number;
  dailyLimit: number;
}

export async function getFeatureConfig(feature: MagicFeature): Promise<FeatureConfig> {
  const [enabled, cost, daily] = await Promise.all([
    getSetting(`magic_${feature}_enabled`),
    getSetting(`magic_${feature}_cost`),
    getSetting(`magic_${feature}_daily`),
  ]);
  return {
    enabled: (enabled ?? "true") !== "false",
    cost: parseInt(cost ?? String(DEFAULTS[feature].cost), 10),
    dailyLimit: parseInt(daily ?? String(DEFAULTS[feature].daily), 10),
  };
}

// ─── Daily usage tracking ─────────────────────────────────────────────────────

/** Returns how many times user used this feature today (Iran midnight reset) */
export async function getDailyUsageCount(userId: number, feature: MagicFeature): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const rows = await db
    .select({ id: magicUsageTable.id })
    .from(magicUsageTable)
    .where(
      and(
        eq(magicUsageTable.userId, userId),
        eq(magicUsageTable.feature, feature),
        sql`${magicUsageTable.usedAt} >= ${start}`,
      )
    );
  return rows.length;
}

export async function recordUsage(userId: number, feature: MagicFeature): Promise<void> {
  await db.insert(magicUsageTable).values({ userId, feature });
}

/** Check coins + daily limit. Deducts coins if ok. Returns error string or null. */
export async function consumeFeature(
  userId: number,
  feature: MagicFeature,
): Promise<{ ok: true } | { ok: false; reason: "disabled" | "limit" | "coins" }> {
  const cfg = await getFeatureConfig(feature);
  if (!cfg.enabled) return { ok: false, reason: "disabled" };

  const used = await getDailyUsageCount(userId, feature);
  if (used >= cfg.dailyLimit) return { ok: false, reason: "limit" };

  const balance = await getBalance(userId);
  if (balance < cfg.cost) return { ok: false, reason: "coins" };

  if (cfg.cost > 0) {
    await deductCoins(userId, cfg.cost, "magic_spend", `Magic: ${feature}`);
  }
  await recordUsage(userId, feature);
  return { ok: true };
}

// ─── پیام در بطری ─────────────────────────────────────────────────────────────

/** Store a new bottle message and try to deliver it to a random active user */
export async function sendBottle(senderId: number, message: string): Promise<number> {
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
  const [row] = await db
    .insert(bottleMessagesTable)
    .values({ senderId, message, expiresAt: expiry })
    .returning({ id: bottleMessagesTable.id });
  return row!.id;
}

/** Find a floating bottle to deliver to this user (not their own) */
export async function findBottleForUser(userId: number): Promise<typeof bottleMessagesTable.$inferSelect | null> {
  const [bottle] = await db
    .select()
    .from(bottleMessagesTable)
    .where(
      and(
        eq(bottleMessagesTable.status, "floating"),
        ne(bottleMessagesTable.senderId, userId),
        isNull(bottleMessagesTable.recipientId),
      )
    )
    .orderBy(asc(bottleMessagesTable.createdAt))
    .limit(1);
  return bottle ?? null;
}

export async function deliverBottle(bottleId: number, recipientId: number): Promise<void> {
  await db
    .update(bottleMessagesTable)
    .set({ status: "delivered", recipientId, deliveredAt: new Date() })
    .where(eq(bottleMessagesTable.id, bottleId));
}

export async function updateBottleStatus(
  bottleId: number,
  status: "replied" | "expired" | "ignored",
): Promise<void> {
  await db
    .update(bottleMessagesTable)
    .set({ status })
    .where(eq(bottleMessagesTable.id, bottleId));
}

/** Cron: expire bottles older than 24h still undelivered */
export async function expireOldBottles(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db
    .update(bottleMessagesTable)
    .set({ status: "expired" })
    .where(
      and(
        eq(bottleMessagesTable.status, "floating"),
        lt(bottleMessagesTable.createdAt, cutoff),
      )
    )
    .returning({ senderId: bottleMessagesTable.senderId });
  return rows.length;
}

/** Cron: expire delivered but unanswered bottles after 24h */
export async function expireDeliveredBottles(): Promise<Array<{ senderId: number }>> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return db
    .update(bottleMessagesTable)
    .set({ status: "expired" })
    .where(
      and(
        eq(bottleMessagesTable.status, "delivered"),
        lt(bottleMessagesTable.deliveredAt!, cutoff),
      )
    )
    .returning({ senderId: bottleMessagesTable.senderId });
}

// ─── زنجیر احساس ──────────────────────────────────────────────────────────────

/** Start a new chain or join the oldest active one waiting for next writer */
export async function joinOrCreateChain(
  userId: number,
  message: string,
  maxSteps: number = 10,
): Promise<{ chainId: number; step: number; isComplete: boolean; participantIds: number[] }> {
  // Find an active chain waiting for this user (not already a participant)
  const participatedChainIds = (
    await db
      .select({ chainId: chainLinksTable.chainId })
      .from(chainLinksTable)
      .where(eq(chainLinksTable.userId, userId))
  ).map((r) => r.chainId);

  let targetChain: typeof chainsTable.$inferSelect | null = null;

  if (participatedChainIds.length < 100) {
    const query = db
      .select()
      .from(chainsTable)
      .where(
        and(
          eq(chainsTable.status, "active"),
          eq(chainsTable.currentHolder, userId),
        )
      )
      .limit(1);
    const [waiting] = await query;
    if (waiting) targetChain = waiting;
  }

  if (!targetChain) {
    // No chain waiting for us — create new one
    const [newChain] = await db
      .insert(chainsTable)
      .values({ maxSteps, currentStep: 1, currentHolder: userId })
      .returning();
    targetChain = newChain!;
  }

  const step = targetChain.currentStep;

  // Add this user's link
  await db.insert(chainLinksTable).values({
    chainId: targetChain.id,
    userId,
    step,
    message,
  });

  const isComplete = step >= targetChain.maxSteps;
  let participantIds: number[] = [];

  if (isComplete) {
    await db
      .update(chainsTable)
      .set({ status: "completed", completedAt: new Date(), currentHolder: null })
      .where(eq(chainsTable.id, targetChain.id));

    const links = await db
      .select({ userId: chainLinksTable.userId })
      .from(chainLinksTable)
      .where(eq(chainLinksTable.chainId, targetChain.id));
    participantIds = [...new Set(links.map((l) => l.userId))];
  } else {
    // Move chain to next step, assign to a new random user later
    await db
      .update(chainsTable)
      .set({ currentStep: step + 1, currentHolder: null })
      .where(eq(chainsTable.id, targetChain.id));
  }

  return { chainId: targetChain.id, step, isComplete, participantIds };
}

/** Get a chain waiting for next contributor — assign it to this user */
export async function claimChainForUser(userId: number): Promise<typeof chainsTable.$inferSelect | null> {
  const participated = (
    await db
      .select({ chainId: chainLinksTable.chainId })
      .from(chainLinksTable)
      .where(eq(chainLinksTable.userId, userId))
  ).map((r) => r.chainId);

  const candidates = await db
    .select()
    .from(chainsTable)
    .where(
      and(
        eq(chainsTable.status, "active"),
        isNull(chainsTable.currentHolder),
        participated.length > 0 ? notInArray(chainsTable.id, participated) : sql`1=1`,
      )
    )
    .limit(1);

  if (!candidates[0]) return null;

  await db
    .update(chainsTable)
    .set({ currentHolder: userId })
    .where(eq(chainsTable.id, candidates[0].id));
  return candidates[0];
}

export async function getChainLinks(chainId: number): Promise<Array<typeof chainLinksTable.$inferSelect>> {
  return db
    .select()
    .from(chainLinksTable)
    .where(eq(chainLinksTable.chainId, chainId))
    .orderBy(asc(chainLinksTable.step));
}

// ─── نامه به آینده ────────────────────────────────────────────────────────────

export async function createFutureLetter(
  userId: number,
  message: string,
  deliverAt: Date,
): Promise<number> {
  const [row] = await db
    .insert(futureLettersTable)
    .values({ userId, message, deliverAt })
    .returning({ id: futureLettersTable.id });
  return row!.id;
}

/** Cron: return letters ready to deliver */
export async function getDueLetters(): Promise<Array<typeof futureLettersTable.$inferSelect>> {
  return db
    .select()
    .from(futureLettersTable)
    .where(
      and(
        eq(futureLettersTable.delivered, false),
        lt(futureLettersTable.deliverAt, new Date()),
      )
    );
}

export async function markLetterDelivered(id: number): Promise<void> {
  await db
    .update(futureLettersTable)
    .set({ delivered: true })
    .where(eq(futureLettersTable.id, id));
}

// ─── فرکانس ناشناس ────────────────────────────────────────────────────────────

export const MOODS = ["happy", "sad", "lovesick", "angry", "curious"] as const;
export type Mood = (typeof MOODS)[number];

export const MOOD_LABELS: Record<Mood, string> = {
  happy:    "😊 خوشحال",
  sad:      "😢 دلتنگ",
  lovesick: "😍 عاشق",
  angry:    "😤 عصبانی",
  curious:  "🤔 کنجکاو",
};

/** Try to find a match. Returns partnerId if found, null if added to queue. */
export async function joinFrequency(
  userId: number,
  mood: Mood,
): Promise<number | null> {
  // Remove any existing queue entry for this user
  await db.delete(frequencyQueueTable).where(eq(frequencyQueueTable.userId, userId));

  // Find someone with same mood waiting
  const [match] = await db
    .select()
    .from(frequencyQueueTable)
    .where(and(eq(frequencyQueueTable.mood, mood), ne(frequencyQueueTable.userId, userId)))
    .orderBy(asc(frequencyQueueTable.joinedAt))
    .limit(1);

  if (match) {
    await db.delete(frequencyQueueTable).where(eq(frequencyQueueTable.userId, match.userId));
    return match.userId;
  }

  // No match — add to queue
  await db.insert(frequencyQueueTable).values({ userId, mood });
  return null;
}

export async function leaveFrequencyQueue(userId: number): Promise<void> {
  await db.delete(frequencyQueueTable).where(eq(frequencyQueueTable.userId, userId));
}

/** Cron: clean stale frequency entries older than 10 minutes */
export async function cleanStaleFrequency(): Promise<number> {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000);
  const rows = await db
    .delete(frequencyQueueTable)
    .where(lt(frequencyQueueTable.joinedAt, cutoff))
    .returning({ userId: frequencyQueueTable.userId });
  return rows.length;
}
