import { db } from "@workspace/db";
import { broadcastJobsTable, usersTable } from "@workspace/db";
import { eq, gte } from "drizzle-orm";
import type { Bot } from "grammy";
import type { BotContext } from "../context.js";

export interface BroadcastFilter {
  gender?: "male" | "female" | null;
  ageMin?: number;
  ageMax?: number;
  limit?: number;
}

export async function broadcastMessage(
  bot: Bot<BotContext>,
  createdBy: number,
  message: string,
  target: "all" | "active" = "all",
  filter?: BroadcastFilter,
  mediaFileId?: string,
  mediaType?: string
): Promise<{ sent: number; failed: number; total: number }> {
  let allUsers = await db
    .select({
      telegramId: usersTable.telegramId,
      status:     usersTable.status,
      lastSeen:   usersTable.lastSeen,
      gender:     usersTable.gender,
      age:        usersTable.age,
    })
    .from(usersTable)
    .where(eq(usersTable.status, "active"));

  // ── Active-only filter ─────────────────────────────────────────────────────
  if (target === "active") {
    const week = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    allUsers = allUsers.filter(u => u.lastSeen && new Date(u.lastSeen) > week);
  }

  // ── Gender filter ──────────────────────────────────────────────────────────
  if (filter?.gender) {
    allUsers = allUsers.filter(u => u.gender === filter.gender);
  }

  // ── Age range filter ───────────────────────────────────────────────────────
  if (filter?.ageMin !== undefined) {
    allUsers = allUsers.filter(u => u.age !== null && u.age! >= filter.ageMin!);
  }
  if (filter?.ageMax !== undefined) {
    allUsers = allUsers.filter(u => u.age !== null && u.age! <= filter.ageMax!);
  }

  // ── Count limit ────────────────────────────────────────────────────────────
  if (filter?.limit && filter.limit > 0) {
    allUsers = allUsers.slice(0, filter.limit);
  }

  const [job] = await db.insert(broadcastJobsTable).values({
    message,
    mediaFileId:  mediaFileId ?? null,
    mediaType:    mediaType   ?? null,
    target,
    status:       "running",
    totalCount:   allUsers.length,
    sentCount:    0,
    failedCount:  0,
    createdBy,
    createdAt:    new Date(),
  }).returning();

  let sent   = 0;
  let failed = 0;

  for (const user of allUsers) {
    try {
      if (mediaFileId && mediaType) {
        if (mediaType === "photo") {
          await bot.api.sendPhoto(user.telegramId, mediaFileId, { caption: message });
        } else if (mediaType === "video") {
          await bot.api.sendVideo(user.telegramId, mediaFileId, { caption: message });
        } else {
          await bot.api.sendDocument(user.telegramId, mediaFileId, { caption: message });
        }
      } else {
        await bot.api.sendMessage(user.telegramId, message, { parse_mode: "Markdown" });
      }
      sent++;
      await new Promise(r => setTimeout(r, 50));
    } catch {
      failed++;
    }
  }

  await db.update(broadcastJobsTable).set({
    status:      "completed",
    sentCount:   sent,
    failedCount: failed,
    completedAt: new Date(),
  }).where(eq(broadcastJobsTable.id, job!.id));

  return { sent, failed, total: allUsers.length };
}
