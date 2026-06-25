import { db } from "@workspace/db";
import { broadcastJobsTable, usersTable } from "@workspace/db";
import { eq, gte } from "drizzle-orm";
import type { Bot } from "grammy";
import type { BotContext } from "../context.js";

export async function broadcastMessage(
  bot: Bot<BotContext>,
  createdBy: number,
  message: string,
  target: "all" | "active" | "selected" = "all",
  mediaFileId?: string,
  mediaType?: string
): Promise<{ sent: number; failed: number }> {
  let users = await db.select({ telegramId: usersTable.telegramId, status: usersTable.status, lastSeen: usersTable.lastSeen })
    .from(usersTable)
    .where(eq(usersTable.status, "active"));

  if (target === "active") {
    const week = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    users = users.filter(u => u.lastSeen && new Date(u.lastSeen) > week);
  }

  const [job] = await db.insert(broadcastJobsTable).values({
    message,
    mediaFileId: mediaFileId ?? null,
    mediaType: mediaType ?? null,
    target,
    status: "running",
    totalCount: users.length,
    sentCount: 0,
    failedCount: 0,
    createdBy,
    createdAt: new Date(),
  }).returning();

  let sent = 0;
  let failed = 0;

  for (const user of users) {
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
      await new Promise(r => setTimeout(r, 50)); // Rate limit
    } catch {
      failed++;
    }
  }

  await db.update(broadcastJobsTable).set({
    status: "completed",
    sentCount: sent,
    failedCount: failed,
    completedAt: new Date(),
  }).where(eq(broadcastJobsTable.id, job.id));

  return { sent, failed };
}
