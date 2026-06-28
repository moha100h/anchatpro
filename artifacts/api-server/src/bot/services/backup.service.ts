import { db } from "@workspace/db";
import {
  backupConfigTable,
  usersTable,
  coinTransactionsTable,
  paymentsTable,
  groupChatsTable,
  groupMembersTable,
  adminPermissionsTable,
  giftCodesTable,
  referralsTable,
  adminSettingsTable,
  anonymousMessagesTable,
  bottleMessagesTable,
  chainsTable,
  chainLinksTable,
  futureLettersTable,
  reportsTable,
  blocksTable,
  giftCodeRedemptionsTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
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
    await db.update(backupConfigTable)
      .set({ verificationCode: code, isVerified: false })
      .where(eq(backupConfigTable.id, existing.id));
  } else {
    await db.insert(backupConfigTable).values({
      verificationCode: code,
      isVerified: false,
      scheduleHours: 24,
      createdAt: new Date(),
    });
  }
  return code;
}

export async function verifyBackupGroup(chatId: number, code: string): Promise<boolean> {
  const [config] = await db
    .select()
    .from(backupConfigTable)
    .where(eq(backupConfigTable.verificationCode, code))
    .limit(1);
  if (!config) return false;
  await db.update(backupConfigTable)
    .set({ chatId, isVerified: true })
    .where(eq(backupConfigTable.id, config.id));
  return true;
}

export async function setBackupSchedule(hours: number): Promise<void> {
  const config = await getBackupConfig();
  if (config) {
    await db.update(backupConfigTable)
      .set({ scheduleHours: hours })
      .where(eq(backupConfigTable.id, config.id));
  }
}

// ─── Full Database Backup (4 chunked JSON files) ──────────────────────────────

export async function sendBackup(bot: Bot<BotContext>): Promise<boolean> {
  try {
    const config = await getBackupConfig();
    if (!config?.chatId || !config.isVerified) return false;

    const { InputFile } = await import("grammy");
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const chatId = config.chatId;

    // ── 1: Users / Referrals / Admins / Settings ──────────────────────────────
    const [users, referrals, admins, settings] = await Promise.all([
      db.select().from(usersTable),
      db.select().from(referralsTable),
      db.select().from(adminPermissionsTable).catch(() => [] as any[]),
      db.select().from(adminSettingsTable).catch(() => [] as any[]),
    ]);

    // ── 2: Financial ──────────────────────────────────────────────────────────
    const [transactions, payments, giftCodes, redemptions] = await Promise.all([
      db.select().from(coinTransactionsTable).orderBy(desc(coinTransactionsTable.createdAt)),
      db.select().from(paymentsTable).orderBy(desc(paymentsTable.createdAt)),
      db.select().from(giftCodesTable).catch(() => [] as any[]),
      db.select().from(giftCodeRedemptionsTable).catch(() => [] as any[]),
    ]);

    // ── 3: Groups + Anon messages ─────────────────────────────────────────────
    const [groups, groupMembers, anonMsgs] = await Promise.all([
      db.select().from(groupChatsTable),
      db.select().from(groupMembersTable),
      db.select()
        .from(anonymousMessagesTable)
        .orderBy(desc(anonymousMessagesTable.createdAt))
        .limit(5000),
    ]);

    // ── 4: Magic + Reports + Blocks ───────────────────────────────────────────
    const [bottles, chains, chainLinks, letters, reports, blocks] = await Promise.all([
      db.select().from(bottleMessagesTable),
      db.select().from(chainsTable),
      db.select().from(chainLinksTable),
      db.select().from(futureLettersTable),
      db.select().from(reportsTable).orderBy(desc(reportsTable.createdAt)).limit(2000),
      db.select().from(blocksTable),
    ]);

    // ── Summary message ────────────────────────────────────────────────────────
    await bot.api.sendMessage(
      chatId,
      `📦 *بکاپ کامل سیستم*\n\n` +
      `🕐 زمان: \`${new Date().toLocaleString("fa-IR")}\`\n\n` +
      `📊 آمار:\n` +
      `• 👥 کاربران: *${users.length}*\n` +
      `• 💰 تراکنش‌ها: *${transactions.length}*\n` +
      `• 💳 پرداخت‌ها: *${payments.length}*\n` +
      `• 👥 گروه‌ها: *${groups.length}* (اعضا: ${groupMembers.length})\n` +
      `• 📩 پیام‌های ناشناس: *${anonMsgs.length}* (آخرین ۵۰۰۰)\n` +
      `• 🚨 گزارش‌ها: *${reports.length}*\n` +
      `• 🍾 بطری: *${bottles.length}*  ✉️ نامه: *${letters.length}*\n\n` +
      `_ارسال ۴ فایل JSON..._`,
      { parse_mode: "Markdown" }
    );

    // ── File 1: Users ──────────────────────────────────────────────────────────
    await bot.api.sendDocument(
      chatId,
      new InputFile(
        Buffer.from(JSON.stringify({
          _meta: { backupVersion: "4.0", timestamp: new Date().toISOString(), file: "1/4" },
          users,
          referrals,
          admin_permissions: admins,
          app_settings: settings,
        }, null, 2), "utf-8"),
        `backup_${ts}_1_users.json`
      ),
      { caption: `📁 فایل ۱/۴ — کاربران (${users.length})، رفرال‌ها (${referrals.length})، ادمین‌ها، تنظیمات` }
    );

    // ── File 2: Financial ──────────────────────────────────────────────────────
    await bot.api.sendDocument(
      chatId,
      new InputFile(
        Buffer.from(JSON.stringify({
          _meta: { backupVersion: "4.0", timestamp: new Date().toISOString(), file: "2/4" },
          coin_transactions: transactions,
          payments,
          gift_codes: giftCodes,
          gift_code_redemptions: redemptions,
        }, null, 2), "utf-8"),
        `backup_${ts}_2_financial.json`
      ),
      { caption: `📁 فایل ۲/۴ — تراکنش‌ها (${transactions.length})، پرداخت‌ها (${payments.length})، کدهای هدیه` }
    );

    // ── File 3: Groups + Anon messages ────────────────────────────────────────
    await bot.api.sendDocument(
      chatId,
      new InputFile(
        Buffer.from(JSON.stringify({
          _meta: { backupVersion: "4.0", timestamp: new Date().toISOString(), file: "3/4", note: "anon_messages: latest 5000" },
          group_chats: groups,
          group_members: groupMembers,
          anonymous_messages: anonMsgs,
        }, null, 2), "utf-8"),
        `backup_${ts}_3_groups.json`
      ),
      { caption: `📁 فایل ۳/۴ — گروه‌ها (${groups.length})، اعضا (${groupMembers.length})، پیام‌ها (${anonMsgs.length})` }
    );

    // ── File 4: Magic + Moderation ────────────────────────────────────────────
    await bot.api.sendDocument(
      chatId,
      new InputFile(
        Buffer.from(JSON.stringify({
          _meta: { backupVersion: "4.0", timestamp: new Date().toISOString(), file: "4/4" },
          bottle_messages: bottles,
          chains,
          chain_links: chainLinks,
          future_letters: letters,
          reports,
          blocks,
        }, null, 2), "utf-8"),
        `backup_${ts}_4_magic_moderation.json`
      ),
      { caption: `📁 فایل ۴/۴ — بطری‌ها (${bottles.length})، زنجیرها، نامه‌ها (${letters.length})، گزارش‌ها (${reports.length})` }
    );

    await bot.api.sendMessage(
      chatId,
      `✅ *بکاپ کامل ارسال شد!*\n\n` +
      `📋 *راهنمای بازیابی:*\n` +
      `۱. هر ۴ فایل JSON را دانلود کنید\n` +
      `۲. محیط PostgreSQL جدید آماده کنید\n` +
      `۳. با \`drizzle-kit push\` جداول بسازید\n` +
      `۴. داده‌ها را از JSON وارد کنید (کلید: \`telegram_id\`)\n\n` +
      `⚠️ *ترتیب import:*\n` +
      `users → referrals → groups → members → transactions → payments`,
      { parse_mode: "Markdown" }
    );

    await db.update(backupConfigTable)
      .set({ lastBackupAt: new Date() })
      .where(eq(backupConfigTable.id, config.id));

    return true;
  } catch (err) {
    console.error("Backup failed:", err);
    return false;
  }
}
