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
  timedAnonLinksTable,
  proAnonLinksTable,
  warningsTable,
  badWordsTable,
  tetraPayTransactionsTable,
  plisioTransactionsTable,
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
      scheduleMinutes: 60,
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

/** Set backup interval in minutes */
export async function setBackupSchedule(minutes: number): Promise<void> {
  const config = await getBackupConfig();
  if (config) {
    await db.update(backupConfigTable)
      .set({ scheduleMinutes: minutes })
      .where(eq(backupConfigTable.id, config.id));
  } else {
    // Create config if missing
    await db.insert(backupConfigTable).values({
      scheduleMinutes: minutes,
      isVerified: false,
      createdAt: new Date(),
    });
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
      timedLinks,
      proLinks,
      warnings,
      badWords,
      tetraPayTxns,
      plisioTxns,
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
      db.select().from(timedAnonLinksTable).catch(() => [] as any[]),
      db.select().from(proAnonLinksTable).catch(() => [] as any[]),
      db.select().from(warningsTable).catch(() => [] as any[]),
      db.select().from(badWordsTable).catch(() => [] as any[]),
      db.select().from(tetraPayTransactionsTable).catch(() => [] as any[]),
      db.select().from(plisioTransactionsTable).catch(() => [] as any[]),
    ]);

    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const meta = {
      backupVersion: "6.0",
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
        warnings: warnings.length,
        badWords: badWords.length,
        timedLinks: timedLinks.length,
        proLinks: proLinks.length,
        tetraPayTxns: tetraPayTxns.length,
        plisioTxns: plisioTxns.length,
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
      timed_anon_links: timedLinks,
      pro_anon_links: proLinks,
      warnings,
      bad_words: badWords,
      tetrapay_transactions: tetraPayTxns,
      plisio_transactions: plisioTxns,
    };

    // ── Compress in-memory and send ─────────────────────────────────────────────
    let jsonBuf: Buffer | null = Buffer.from(JSON.stringify(backupData), "utf-8");
    let gzipBuf: Buffer | null = gzipSync(jsonBuf, { level: 6 });
    const sizeMB    = (gzipBuf.length / 1_048_576).toFixed(1);
    const rawSizeMB = (jsonBuf.length / 1_048_576).toFixed(1);

    // Send summary first
    await bot.api.sendMessage(
      chatId,
      `📦 *بکاپ کامل سیستم — نسخه 6.0*\n\n` +
      `🕐 زمان: \`${new Date().toLocaleString("fa-IR")}\`\n` +
      `📊 *آمار:*\n` +
      `• 👥 کاربران: *${users.length.toLocaleString()}*\n` +
      `• 💰 تراکنش‌ها: *${transactions.length.toLocaleString()}*\n` +
      `• 💳 پرداخت‌ها: *${payments.length.toLocaleString()}*\n` +
      `• 👥 گروه‌ها: *${groups.length}* (اعضا: ${groupMembers.length})\n` +
      `• 📩 پیام‌های ناشناس: *${anonMsgs.length.toLocaleString()}*\n` +
      `• 🍾 بطری: *${bottles.length}*  ✉️ نامه: *${letters.length}*\n` +
      `• 🚨 گزارش‌ها: *${reports.length}*  ⚠️ هشدارها: *${warnings.length}*\n` +
      `• 🔗 لینک ناشناس: ${timedLinks.length} مدت‌دار + ${proLinks.length} پرو\n` +
      `• 🔑 کلمات بد: *${badWords.length}*\n\n` +
      `📦 حجم: *${sizeMB} MB* فشرده / ${rawSizeMB} MB خام\n` +
      `_در حال ارسال فایل..._`,
      { parse_mode: "Markdown" }
    );

    // Send the file
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

    // ── Update lastBackupAt ─────────────────────────────────────────────────────
    await db.update(backupConfigTable)
      .set({ lastBackupAt: new Date() })
      .where(eq(backupConfigTable.id, config.id));

    // ── Free memory (large buffers) ─────────────────────────────────────────────
    jsonBuf = null;
    gzipBuf = null;

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
    raw = gunzipSync(buf).toString("utf-8");
  } catch {
    raw = buf.toString("utf-8");
  }
  const data = JSON.parse(raw);
  if (!data?._meta?.backupVersion) throw new Error("NOT_A_BACKUP");
  return data;
}

/**
 * Restore database from a parsed backup object.
 * Uses upsert (INSERT … ON CONFLICT DO NOTHING/UPDATE) for idempotency.
 */
export async function restoreFromBackup(data: any): Promise<RestoreResult> {
  const restored: Record<string, number> = {};
  const skipped:  Record<string, number> = {};
  const errors:   string[] = [];

  /**
   * For each row in the array, call insertFn(singleRow).
   * NOTE: insertFn receives ONE row at a time, not the whole array.
   */
  async function upsertBatch(
    tableName: string,
    rows: any[],
    insertFn: (row: any) => Promise<void>
  ) {
    if (!rows?.length) { restored[tableName] = 0; return; }
    let ok = 0;
    let skip = 0;
    for (const row of rows) {
      try {
        await insertFn(row);
        ok++;
      } catch (e: any) {
        skip++;
        if (errors.length < 30) errors.push(`${tableName}: ${String(e?.message ?? e).slice(0, 120)}`);
      }
    }
    restored[tableName] = ok;
    skipped[tableName]  = skip;
  }

  // ── 1: app_settings ────────────────────────────────────────────────────────
  await upsertBatch("settings", data.app_settings ?? [], async (r) => {
    await db.insert(adminSettingsTable)
      .values({ key: String(r.key), value: String(r.value ?? "") })
      .onConflictDoUpdate({ target: adminSettingsTable.key, set: { value: String(r.value ?? "") } });
  });

  // ── 2: users ───────────────────────────────────────────────────────────────
  await upsertBatch("users", data.users ?? [], async (r) => {
    const tgId = Number(r.telegramId ?? r.telegram_id);
    await db.insert(usersTable)
      .values({
        telegramId:   tgId,
        referralCode: String(r.referralCode ?? r.referral_code ?? ""),
        firstName:    String(r.firstName ?? r.first_name ?? ""),
        lastName:     r.lastName ?? r.last_name ?? null,
        language:     r.language ?? "fa",
        gender:       r.gender   ?? null,
        age:          r.age      ?? null,
        city:         r.city     ?? null,
        coins:        Number(r.coins ?? 0),
        reportCount:  Number(r.reportCount ?? r.report_count ?? 0),
        createdAt:    r.createdAt ? new Date(r.createdAt) : new Date(),
      } as any)
      .onConflictDoUpdate({
        target: usersTable.telegramId,
        set: {
          firstName:   String(r.firstName ?? r.first_name ?? ""),
          lastName:    r.lastName ?? r.last_name ?? null,
          language:    r.language ?? "fa",
          gender:      r.gender   ?? null,
          age:         r.age      ?? null,
          city:        r.city     ?? null,
          coins:       Number(r.coins ?? 0),
          reportCount: Number(r.reportCount ?? r.report_count ?? 0),
          referralCode: String(r.referralCode ?? r.referral_code ?? ""),
        },
      });
  });

  // ── 3: referrals ───────────────────────────────────────────────────────────
  await upsertBatch("referrals", data.referrals ?? [], async (r) => {
    await (db.insert(referralsTable) as any)
      .values({
        referrerId: Number(r.referrerId ?? r.inviter_id),
        referredId: Number(r.referredId ?? r.invitee_id),
        rewarded: r.rewarded ?? 0,
        createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
      })
      .onConflictDoNothing();
  });

  // ── 4: admin_permissions ───────────────────────────────────────────────────
  await upsertBatch("admin_permissions", data.admin_permissions ?? [], async (r) => {
    await (db.insert(adminPermissionsTable) as any)
      .values({
        telegramId: Number(r.telegramId),
        addedBy: Number(r.addedBy ?? 0),
        username: r.username ?? null,
        level: r.level ?? "moderator",
        createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
      })
      .onConflictDoNothing();
  });

  // ── 5: payment_packages ────────────────────────────────────────────────────
  await upsertBatch("payment_packages", data.payment_packages ?? [], async (r) => {
    await (db.insert(paymentPackagesTable) as any)
      .values({
        coins: Number(r.coins), price: Number(r.price),
        currency: r.currency ?? "IRT", label: r.label ?? null,
        discountPercent: r.discountPercent ?? 0, originalPrice: r.originalPrice ?? null,
        cardPrice: r.cardPrice ?? null, cryptoPrice: r.cryptoPrice ?? null,
        tetrapayPrice: r.tetrapayPrice ?? null, isActive: r.isActive ?? true,
        createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
      })
      .onConflictDoNothing();
  });

  // ── 6: discount_codes ──────────────────────────────────────────────────────
  await upsertBatch("discount_codes", data.discount_codes ?? [], async (r) => {
    await (db.insert(discountCodesTable) as any)
      .values({
        code: String(r.code), discountPercent: Number(r.discountPercent),
        maxUses: r.maxUses ?? null, usedCount: r.usedCount ?? 0,
        isActive: r.isActive ?? true,
        expiresAt: r.expiresAt ? new Date(r.expiresAt) : null,
        createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
      })
      .onConflictDoNothing();
  });

  // ── 7: gift_codes ──────────────────────────────────────────────────────────
  await upsertBatch("gift_codes", data.gift_codes ?? [], async (r) => {
    await (db.insert(giftCodesTable) as any)
      .values({
        code: String(r.code), coins: Number(r.coins),
        maxUsage: Number(r.maxUsage ?? r.max_usage ?? 1),
        usedCount: r.usedCount ?? 0, isActive: r.isActive ?? true,
        expiresAt: r.expiresAt ? new Date(r.expiresAt) : null,
        createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
      })
      .onConflictDoNothing();
  });

  // ── 8: gift_code_redemptions ───────────────────────────────────────────────
  await upsertBatch("gift_code_redemptions", data.gift_code_redemptions ?? [], async (r) => {
    await (db.insert(giftCodeRedemptionsTable) as any)
      .values({
        giftCodeId: Number(r.giftCodeId ?? r.gift_code_id),
        userId: Number(r.userId ?? r.user_id),
        createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
      })
      .onConflictDoNothing();
  });

  // ── 9: payments ────────────────────────────────────────────────────────────
  await upsertBatch("payments", data.payments ?? [], async (r) => {
    await (db.insert(paymentsTable) as any)
      .values({
        userId: Number(r.userId ?? r.user_id),
        packageId: r.packageId ?? r.package_id ?? null,
        coins: Number(r.coins), price: Number(r.price),
        currency: r.currency ?? "IRT", method: r.method ?? "card",
        status: r.status ?? "pending",
        receiptFileId: r.receiptFileId ?? null,
        adminMessageId: r.adminMessageId ?? null,
        adminChatId: r.adminChatId ?? null,
        approvedBy: r.approvedBy ?? null,
        discountCodeId: r.discountCodeId ?? null,
        discountPercent: r.discountPercent ?? 0,
        createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
        updatedAt: r.updatedAt ? new Date(r.updatedAt) : null,
      })
      .onConflictDoNothing();
  });

  // ── 10: coin_transactions ──────────────────────────────────────────────────
  await upsertBatch("coin_transactions", data.coin_transactions ?? [], async (r) => {
    await db.insert(coinTransactionsTable)
      .values({ ...r, createdAt: r.createdAt ? new Date(r.createdAt) : new Date() } as any)
      .onConflictDoNothing();
  });

  // ── 11: group_chats ────────────────────────────────────────────────────────
  await upsertBatch("group_chats", data.group_chats ?? [], async (r) => {
    await db.insert(groupChatsTable)
      .values({ ...r, createdAt: r.createdAt ? new Date(r.createdAt) : new Date() } as any)
      .onConflictDoNothing();
  });

  // ── 12: group_members ──────────────────────────────────────────────────────
  await upsertBatch("group_members", data.group_members ?? [], async (r) => {
    await db.insert(groupMembersTable)
      .values({ ...r, joinedAt: r.joinedAt ? new Date(r.joinedAt) : new Date() } as any)
      .onConflictDoNothing();
  });

  // ── 13: anonymous_messages ─────────────────────────────────────────────────
  await upsertBatch("anonymous_messages", data.anonymous_messages ?? [], async (r) => {
    await db.insert(anonymousMessagesTable)
      .values({ ...r, createdAt: r.createdAt ? new Date(r.createdAt) : new Date() } as any)
      .onConflictDoNothing();
  });

  // ── 14: bottle_messages ────────────────────────────────────────────────────
  await upsertBatch("bottle_messages", data.bottle_messages ?? [], async (r) => {
    await db.insert(bottleMessagesTable)
      .values({ ...r, createdAt: r.createdAt ? new Date(r.createdAt) : new Date() } as any)
      .onConflictDoNothing();
  });

  // ── 15: chains ────────────────────────────────────────────────────────────
  await upsertBatch("chains", data.chains ?? [], async (r) => {
    await db.insert(chainsTable)
      .values({ ...r, createdAt: r.createdAt ? new Date(r.createdAt) : new Date() } as any)
      .onConflictDoNothing();
  });

  // ── 16: chain_links ───────────────────────────────────────────────────────
  await upsertBatch("chain_links", data.chain_links ?? [], async (r) => {
    await db.insert(chainLinksTable)
      .values({ ...r, createdAt: r.createdAt ? new Date(r.createdAt) : new Date() } as any)
      .onConflictDoNothing();
  });

  // ── 17: future_letters ────────────────────────────────────────────────────
  await upsertBatch("future_letters", data.future_letters ?? [], async (r) => {
    await db.insert(futureLettersTable)
      .values({ ...r, createdAt: r.createdAt ? new Date(r.createdAt) : new Date() } as any)
      .onConflictDoNothing();
  });

  // ── 18: reports ───────────────────────────────────────────────────────────
  await upsertBatch("reports", data.reports ?? [], async (r) => {
    await db.insert(reportsTable)
      .values({ ...r, createdAt: r.createdAt ? new Date(r.createdAt) : new Date() } as any)
      .onConflictDoNothing();
  });

  // ── 19: blocks ────────────────────────────────────────────────────────────
  await upsertBatch("blocks", data.blocks ?? [], async (r) => {
    await db.insert(blocksTable)
      .values({ ...r, createdAt: r.createdAt ? new Date(r.createdAt) : new Date() } as any)
      .onConflictDoNothing();
  });

  // ── 20: warnings ──────────────────────────────────────────────────────────
  await upsertBatch("warnings", data.warnings ?? [], async (r) => {
    await (db.insert(warningsTable) as any)
      .values({ ...r, createdAt: r.createdAt ? new Date(r.createdAt) : new Date() })
      .onConflictDoNothing();
  });

  // ── 21: bad_words ─────────────────────────────────────────────────────────
  await upsertBatch("bad_words", data.bad_words ?? [], async (r) => {
    await (db.insert(badWordsTable) as any)
      .values({ word: String(r.word), addedAt: r.addedAt ? new Date(r.addedAt) : new Date() })
      .onConflictDoNothing();
  });

  // ── 22: timed_anon_links ──────────────────────────────────────────────────
  await upsertBatch("timed_anon_links", data.timed_anon_links ?? [], async (r) => {
    await (db.insert(timedAnonLinksTable) as any)
      .values({ ...r, createdAt: r.createdAt ? new Date(r.createdAt) : new Date(), expiresAt: r.expiresAt ? new Date(r.expiresAt) : null })
      .onConflictDoNothing();
  });

  // ── 23: pro_anon_links ────────────────────────────────────────────────────
  await upsertBatch("pro_anon_links", data.pro_anon_links ?? [], async (r) => {
    await (db.insert(proAnonLinksTable) as any)
      .values({ ...r, createdAt: r.createdAt ? new Date(r.createdAt) : new Date() })
      .onConflictDoNothing();
  });

  return {
    success: errors.length === 0,
    restored,
    skipped,
    errors,
  };
}
