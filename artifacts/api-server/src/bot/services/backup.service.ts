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
  paymentPackagesTable,
  discountCodesTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { gzipSync, gunzipSync } from "node:zlib";
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

// ─── Full single-file backup (gzip JSON) ──────────────────────────────────────

export async function sendBackup(bot: Bot<BotContext>): Promise<boolean> {
  try {
    const config = await getBackupConfig();
    if (!config?.chatId || !config.isVerified) return false;

    const { InputFile } = await import("grammy");
    const chatId = config.chatId;

    // ── Fetch all data in parallel ─────────────────────────────────────────────
    const [
      users,
      referrals,
      admins,
      settings,
      transactions,
      payments,
      giftCodes,
      redemptions,
      groups,
      groupMembers,
      anonMsgs,
      bottles,
      chains,
      chainLinks,
      letters,
      reports,
      blocks,
      packages,
      discountCodes,
    ] = await Promise.all([
      db.select().from(usersTable),
      db.select().from(referralsTable),
      db.select().from(adminPermissionsTable).catch(() => [] as any[]),
      db.select().from(adminSettingsTable).catch(() => [] as any[]),
      db.select().from(coinTransactionsTable)
        .orderBy(desc(coinTransactionsTable.createdAt))
        .limit(100_000),
      db.select().from(paymentsTable)
        .orderBy(desc(paymentsTable.createdAt)),
      db.select().from(giftCodesTable).catch(() => [] as any[]),
      db.select().from(giftCodeRedemptionsTable).catch(() => [] as any[]),
      db.select().from(groupChatsTable),
      db.select().from(groupMembersTable),
      db.select().from(anonymousMessagesTable)
        .orderBy(desc(anonymousMessagesTable.createdAt))
        .limit(20_000),
      db.select().from(bottleMessagesTable),
      db.select().from(chainsTable),
      db.select().from(chainLinksTable),
      db.select().from(futureLettersTable),
      db.select().from(reportsTable)
        .orderBy(desc(reportsTable.createdAt))
        .limit(5_000),
      db.select().from(blocksTable),
      db.select().from(paymentPackagesTable).catch(() => [] as any[]),
      db.select().from(discountCodesTable).catch(() => [] as any[]),
    ]);

    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const meta = {
      backupVersion: "5.0",
      timestamp: new Date().toISOString(),
      generator: "anymschat_bot",
      stats: {
        users: users.length,
        referrals: referrals.length,
        transactions: transactions.length,
        payments: payments.length,
        groups: groups.length,
        groupMembers: groupMembers.length,
        anonMessages: anonMsgs.length,
        bottles: bottles.length,
        letters: letters.length,
        reports: reports.length,
        blocks: blocks.length,
        packages: packages.length,
        discountCodes: discountCodes.length,
      },
    };

    const backupData = {
      _meta: meta,
      users,
      referrals,
      admin_permissions: admins,
      app_settings: settings,
      payment_packages: packages,
      discount_codes: discountCodes,
      coin_transactions: transactions,
      payments,
      gift_codes: giftCodes,
      gift_code_redemptions: redemptions,
      group_chats: groups,
      group_members: groupMembers,
      anonymous_messages: anonMsgs,
      bottle_messages: bottles,
      chains,
      chain_links: chainLinks,
      future_letters: letters,
      reports,
      blocks,
    };

    // ── Compress and send single file ──────────────────────────────────────────
    const jsonBuf   = Buffer.from(JSON.stringify(backupData), "utf-8");
    const gzipBuf   = gzipSync(jsonBuf, { level: 6 });
    const sizeMB    = (gzipBuf.length / 1_048_576).toFixed(1);
    const rawSizeMB = (jsonBuf.length / 1_048_576).toFixed(1);

    // Send summary first
    await bot.api.sendMessage(
      chatId,
      `📦 *بکاپ کامل سیستم*\n\n` +
      `🕐 زمان: \`${new Date().toLocaleString("fa-IR")}\`\n` +
      `📊 *آمار:*\n` +
      `• 👥 کاربران: *${users.length.toLocaleString()}*\n` +
      `• 💰 تراکنش‌ها: *${transactions.length.toLocaleString()}*\n` +
      `• 💳 پرداخت‌ها: *${payments.length.toLocaleString()}*\n` +
      `• 👥 گروه‌ها: *${groups.length}* (اعضا: ${groupMembers.length})\n` +
      `• 📩 پیام‌های ناشناس: *${anonMsgs.length.toLocaleString()}*\n` +
      `• 🍾 بطری: *${bottles.length}*  ✉️ نامه: *${letters.length}*\n` +
      `• 🚨 گزارش‌ها: *${reports.length}*\n\n` +
      `📦 حجم فایل: *${sizeMB} MB* (فشرده) / ${rawSizeMB} MB خام\n` +
      `_در حال ارسال فایل..._`,
      { parse_mode: "Markdown" }
    );

    // Send single gzipped file
    await bot.api.sendDocument(
      chatId,
      new InputFile(gzipBuf, `backup_${ts}.json.gz`),
      {
        caption:
          `✅ *بکاپ کامل — ${users.length.toLocaleString()} کاربر*\n` +
          `📅 \`${new Date().toISOString()}\`\n\n` +
          `🔄 *بازیابی:* این فایل را در پنل ادمین بات ارسال کنید.`,
        parse_mode: "Markdown",
      }
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

// ─── Restore from backup JSON ──────────────────────────────────────────────────

export interface RestoreResult {
  success: boolean;
  restored: Record<string, number>;
  skipped: Record<string, number>;
  errors: string[];
}

/**
 * Parse a backup buffer (JSON or gzip JSON) → return the backup object.
 * Throws if the buffer is not a valid backup.
 */
export function parseBackupBuffer(buf: Buffer): any {
  let raw: string;
  try {
    // Try gunzip first
    raw = gunzipSync(buf).toString("utf-8");
  } catch {
    // Try plain JSON
    raw = buf.toString("utf-8");
  }
  const data = JSON.parse(raw);
  if (!data?._meta?.backupVersion) throw new Error("NOT_A_BACKUP");
  return data;
}

/**
 * Restore database from a parsed backup object.
 * Uses upsert (INSERT … ON CONFLICT DO UPDATE) for idempotency.
 */
export async function restoreFromBackup(data: any): Promise<RestoreResult> {
  const restored: Record<string, number> = {};
  const skipped:  Record<string, number> = {};
  const errors:   string[] = [];

  // All backup rows come from JSON → typed as any
  async function upsertBatch(
    tableName: string,
    rows: any[],
    insertFn: (row: any) => Promise<void>
  ) {
    if (!rows?.length) return;
    let ok = 0;
    let skip = 0;
    for (const row of rows) {
      try {
        await insertFn(row);
        ok++;
      } catch (e: any) {
        skip++;
        if (errors.length < 20) errors.push(`${tableName}: ${String(e?.message ?? e)}`);
      }
    }
    restored[tableName] = ok;
    skipped[tableName]  = skip;
  }

  // ── 1: app_settings (key-value, upsert by key) ────────────────────────────
  await upsertBatch("settings", data.app_settings ?? [], async (r: any) => {
    await db.insert(adminSettingsTable)
      .values({ key: r.key as string, value: r.value as string })
      .onConflictDoUpdate({ target: adminSettingsTable.key, set: { value: r.value as string } });
  });

  // ── 2: users (upsert by telegramId) ──────────────────────────────────────
  await upsertBatch("users", data.users ?? [], async (r: any) => {
    const tgId        = Number(r.telegramId ?? r.telegram_id);
    const refCode     = String(r.referralCode ?? r.referral_code ?? "");
    const firstName   = String(r.firstName ?? r.first_name ?? "");
    const lastName    = r.lastName ?? r.last_name ?? null;
    const coins       = Number(r.coins ?? 0);
    const reportCount = Number(r.reportCount ?? r.report_count ?? 0);
    await db.insert(usersTable)
      .values({
        telegramId:   tgId,
        referralCode: refCode,
        firstName,
        lastName,
        language:     r.language ?? "fa",
        gender:       r.gender   ?? null,
        age:          r.age      ?? null,
        city:         r.city     ?? null,
        coins,
        reportCount,
        createdAt:    r.createdAt ? new Date(r.createdAt) : new Date(),
      } as any)
      .onConflictDoUpdate({
        target: usersTable.telegramId,
        set: { firstName, lastName, language: r.language ?? "fa", gender: r.gender ?? null,
               age: r.age ?? null, city: r.city ?? null, coins, reportCount,
               referralCode: refCode },
      });
  });

  // ── 3: referrals ──────────────────────────────────────────────────────────
  await upsertBatch("referrals", data.referrals ?? [], async (r: any) => {
    await (db.insert(referralsTable) as any)
      .values({ referrerId: Number(r.referrerId ?? r.inviter_id), referredId: Number(r.referredId ?? r.invitee_id), createdAt: r.createdAt ? new Date(r.createdAt) : new Date(), rewarded: r.rewarded ?? 0 })
      .onConflictDoNothing();
  });

  // ── 4: admin_permissions ──────────────────────────────────────────────────
  await upsertBatch("admin_permissions", data.admin_permissions ?? [], async (r: any) => {
    await (db.insert(adminPermissionsTable) as any)
      .values({ telegramId: Number(r.telegramId), addedBy: Number(r.addedBy ?? 0), username: r.username ?? null, level: r.level ?? "moderator", createdAt: r.createdAt ? new Date(r.createdAt) : new Date() })
      .onConflictDoNothing();
  });

  // ── 5: payment_packages ───────────────────────────────────────────────────
  await upsertBatch("payment_packages", data.payment_packages ?? [], async (r: any) => {
    await (db.insert(paymentPackagesTable) as any)
      .values({ coins: Number(r.coins), price: Number(r.price), currency: r.currency ?? "IRT", label: r.label ?? null, discountPercent: r.discountPercent ?? 0, originalPrice: r.originalPrice ?? null, cardPrice: r.cardPrice ?? null, cryptoPrice: r.cryptoPrice ?? null, tetrapayPrice: r.tetrapayPrice ?? null, isActive: r.isActive ?? true, createdAt: r.createdAt ? new Date(r.createdAt) : new Date() })
      .onConflictDoNothing();
  });

  // ── 6: discount_codes ─────────────────────────────────────────────────────
  await upsertBatch("discount_codes", data.discount_codes ?? [], async (r: any) => {
    await (db.insert(discountCodesTable) as any)
      .values({ code: String(r.code), discountPercent: Number(r.discountPercent), maxUses: r.maxUses ?? null, usedCount: r.usedCount ?? 0, isActive: r.isActive ?? true, expiresAt: r.expiresAt ? new Date(r.expiresAt) : null, createdAt: r.createdAt ? new Date(r.createdAt) : new Date() })
      .onConflictDoNothing();
  });

  // ── 7: gift_codes ─────────────────────────────────────────────────────────
  await upsertBatch("gift_codes", data.gift_codes ?? [], async (r: any) => {
    await (db.insert(giftCodesTable) as any)
      .values({ code: String(r.code), coins: Number(r.coins), maxUsage: Number(r.maxUsage ?? r.max_usage ?? 1), usedCount: r.usedCount ?? 0, isActive: r.isActive ?? true, expiresAt: r.expiresAt ? new Date(r.expiresAt) : null, createdAt: r.createdAt ? new Date(r.createdAt) : new Date() })
      .onConflictDoNothing();
  });

  // ── 8: gift_code_redemptions ──────────────────────────────────────────────
  await upsertBatch("gift_code_redemptions", data.gift_code_redemptions ?? [], async (r: any) => {
    await (db.insert(giftCodeRedemptionsTable) as any)
      .values({ giftCodeId: Number(r.giftCodeId ?? r.gift_code_id), userId: Number(r.userId ?? r.user_id), createdAt: r.createdAt ? new Date(r.createdAt) : new Date() })
      .onConflictDoNothing();
  });

  // ── 9: payments ───────────────────────────────────────────────────────────
  await upsertBatch("payments", data.payments ?? [], async (r: any) => {
    await (db.insert(paymentsTable) as any)
      .values({ userId: Number(r.userId ?? r.user_id), packageId: r.packageId ?? r.package_id ?? null, coins: Number(r.coins), price: Number(r.price), currency: r.currency ?? "IRT", method: r.method ?? "card", status: r.status ?? "pending", receiptFileId: r.receiptFileId ?? null, adminMessageId: r.adminMessageId ?? null, adminChatId: r.adminChatId ?? null, approvedBy: r.approvedBy ?? null, discountCodeId: r.discountCodeId ?? null, discountPercent: r.discountPercent ?? 0, createdAt: r.createdAt ? new Date(r.createdAt) : new Date(), updatedAt: r.updatedAt ? new Date(r.updatedAt) : null })
      .onConflictDoNothing();
  });

  // ── 10: coin_transactions ─────────────────────────────────────────────────
  await upsertBatch("coin_transactions", data.coin_transactions ?? [], async (rows) => {
    for (const row of rows) {
      await db.insert(coinTransactionsTable)
        .values({ ...row })
        .onConflictDoNothing();
    }
  });

  // ── 11: group_chats ───────────────────────────────────────────────────────
  await upsertBatch("group_chats", data.group_chats ?? [], async (rows) => {
    for (const row of rows) {
      await db.insert(groupChatsTable)
        .values({ ...row })
        .onConflictDoNothing();
    }
  });

  // ── 12: group_members ─────────────────────────────────────────────────────
  await upsertBatch("group_members", data.group_members ?? [], async (rows) => {
    for (const row of rows) {
      await db.insert(groupMembersTable)
        .values({ ...row })
        .onConflictDoNothing();
    }
  });

  // ── 13: anonymous_messages ────────────────────────────────────────────────
  await upsertBatch("anonymous_messages", data.anonymous_messages ?? [], async (rows) => {
    for (const row of rows) {
      await db.insert(anonymousMessagesTable)
        .values({ ...row })
        .onConflictDoNothing();
    }
  });

  // ── 14: bottle_messages ───────────────────────────────────────────────────
  await upsertBatch("bottle_messages", data.bottle_messages ?? [], async (rows) => {
    for (const row of rows) {
      await db.insert(bottleMessagesTable)
        .values({ ...row })
        .onConflictDoNothing();
    }
  });

  // ── 15: chains + chain_links ──────────────────────────────────────────────
  await upsertBatch("chains", data.chains ?? [], async (rows) => {
    for (const row of rows) {
      await db.insert(chainsTable).values({ ...row }).onConflictDoNothing();
    }
  });

  await upsertBatch("chain_links", data.chain_links ?? [], async (rows) => {
    for (const row of rows) {
      await db.insert(chainLinksTable).values({ ...row }).onConflictDoNothing();
    }
  });

  // ── 16: future_letters ────────────────────────────────────────────────────
  await upsertBatch("future_letters", data.future_letters ?? [], async (rows) => {
    for (const row of rows) {
      await db.insert(futureLettersTable).values({ ...row }).onConflictDoNothing();
    }
  });

  // ── 17: reports + blocks ──────────────────────────────────────────────────
  await upsertBatch("reports", data.reports ?? [], async (rows) => {
    for (const row of rows) {
      await db.insert(reportsTable).values({ ...row }).onConflictDoNothing();
    }
  });

  await upsertBatch("blocks", data.blocks ?? [], async (rows) => {
    for (const row of rows) {
      await db.insert(blocksTable).values({ ...row }).onConflictDoNothing();
    }
  });

  return {
    success: errors.length === 0,
    restored,
    skipped,
    errors,
  };
}
