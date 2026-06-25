import { db } from "@workspace/db";
import { backupConfigTable, usersTable, coinTransactionsTable, paymentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { Bot } from "grammy";
import type { BotContext } from "../context.js";

export async function getBackupConfig(): Promise<typeof backupConfigTable.$inferSelect | null> {
  const [config] = await db.select().from(backupConfigTable).limit(1);
  return config ?? null;
}

export async function generateVerificationCode(): Promise<string> {
  const code = nanoid(12);
  const existing = await getBackupConfig();
  if (existing) {
    await db.update(backupConfigTable).set({ verificationCode: code, isVerified: false }).where(eq(backupConfigTable.id, existing.id));
  } else {
    await db.insert(backupConfigTable).values({ verificationCode: code, isVerified: false, scheduleHours: 24, createdAt: new Date() });
  }
  return code;
}

export async function verifyBackupGroup(chatId: number, code: string): Promise<boolean> {
  const [config] = await db.select().from(backupConfigTable).where(eq(backupConfigTable.verificationCode, code)).limit(1);
  if (!config) return false;
  await db.update(backupConfigTable).set({ chatId, isVerified: true }).where(eq(backupConfigTable.id, config.id));
  return true;
}

export async function setBackupSchedule(hours: number): Promise<void> {
  const config = await getBackupConfig();
  if (config) {
    await db.update(backupConfigTable).set({ scheduleHours: hours }).where(eq(backupConfigTable.id, config.id));
  }
}

export async function sendBackup(bot: Bot<BotContext>): Promise<boolean> {
  try {
    const config = await getBackupConfig();
    if (!config?.chatId || !config.isVerified) return false;

    const users = await db.select().from(usersTable);
    const transactions = await db.select().from(coinTransactionsTable).limit(1000);
    const payments = await db.select().from(paymentsTable).limit(500);

    const backupData = JSON.stringify({
      timestamp: new Date().toISOString(),
      users: users.length,
      transactions: transactions.length,
      payments: payments.length,
      sample_users: users.slice(0, 10).map(u => ({ id: u.telegramId, coins: u.coins, status: u.status })),
    }, null, 2);

    const buffer = Buffer.from(backupData, "utf-8");

    const { InputFile } = await import("grammy");
    const inputFile = new InputFile(buffer, `backup_${Date.now()}.json`);
    await bot.api.sendDocument(config.chatId, inputFile, {
      caption: `📦 Backup — ${new Date().toISOString()}\n👥 Users: ${users.length}\n💰 Transactions: ${transactions.length}`,
    });

    await db.update(backupConfigTable).set({ lastBackupAt: new Date() }).where(eq(backupConfigTable.id, config.id));
    return true;
  } catch (err) {
    console.error("Backup failed:", err);
    return false;
  }
}
