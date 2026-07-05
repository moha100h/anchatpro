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
  skipped:  Record<string, number>;
  errors:   string[];
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
 *
 * Performance: uses bulk INSERT with chunks of CHUNK_SIZE rows per statement
 * instead of one INSERT per row. Falls back to row-by-row only when a chunk
 * fails (e.g. due to a single bad row in the batch).
 *
 * @param onProgress  Optional async callback called after each table completes.
 *                    Receives a short status string for display.
 */
export async function restoreFromBackup(
  data: any,
  onProgress?: (msg: string) => Promise<void>
): Promise<RestoreResult> {
  const restored: Record<string, number> = {};
  const skipped:  Record<string, number> = {};
  const errors:   string[] = [];

  const CHUNK = 500;

  /**
   * Insert `rows` in batches of CHUNK_SIZE.
   * `prepareRow` converts a raw backup row to a Drizzle-compatible values object.
   * `bulkInsert` receives the prepared values array and returns a Promise.
   *
   * Strategy:
   *  1. Try bulk insert for the whole chunk first.
   *  2. On failure, fall back to individual inserts for that chunk.
   *     This means a single bad row never blocks the whole table.
   */
  async function upsertBulk<T>(
    tableName: string,
    rawRows: any[],
    prepareRow: (r: any) => T,
    bulkInsert: (rows: T[]) => Promise<void>
  ): Promise<void> {
    if (!rawRows?.length) {
      restored[tableName] = 0;
      skipped[tableName]  = 0;
      return;
    }

    let ok   = 0;
    let skip = 0;

    for (let i = 0; i < rawRows.length; i += CHUNK) {
      const chunk = rawRows.slice(i, i + CHUNK);
      let prepared: T[];
      try {
        prepared = chunk.map(prepareRow);
      } catch (e: any) {
        // Preparation failed for the whole chunk — try row-by-row
        for (const r of chunk) {
          try {
            await bulkInsert([prepareRow(r)]);
            ok++;
          } catch (e2: any) {
            skip++;
            if (errors.length < 30)
              errors.push(`${tableName}: ${String(e2?.message ?? e2).slice(0, 120)}`);
          }
        }
        continue;
      }

      try {
        await bulkInsert(prepared);
        ok += prepared.length;
      } catch {
        // Bulk failed — fall back to individual inserts for this chunk
        for (const row of prepared) {
          try {
            await bulkInsert([row]);
            ok++;
          } catch (e2: any) {
            skip++;
            if (errors.length < 30)
              errors.push(`${tableName}: ${String(e2?.message ?? e2).slice(0, 120)}`);
          }
        }
      }
    }

    restored[tableName] = ok;
    skipped[tableName]  = skip;

    if (onProgress) {
      const label = skip > 0
        ? `✅ ${tableName}: ${ok.toLocaleString()} (⚠️ ${skip} رد شد)`
        : `✅ ${tableName}: ${ok.toLocaleString()}`;
      await onProgress(label).catch(() => {});
    }
  }

  const d = (v: any): Date | null  => (v ? new Date(v) : null);
  const dn = (v: any): Date        => (v ? new Date(v) : new Date());
  const n  = (v: any, def = 0): number => Number(v ?? def);
  const s  = (v: any, def = ""): string => String(v ?? def);
  const b  = (v: any, def = true): boolean => (v !== undefined && v !== null ? Boolean(v) : def);

  // ── 1: app_settings ──────────────────────────────────────────────────────────
  await upsertBulk(
    "settings", data.app_settings ?? [],
    (r) => ({ key: s(r.key), value: s(r.value) }),
    (rows) => db.insert(adminSettingsTable)
      .values(rows as any)
      .onConflictDoUpdate({ target: adminSettingsTable.key, set: { value: (rows as any)[0].value } })
      .then(() => {}) as Promise<void>
  );
  // settings upsert with DO UPDATE doesn't work for bulk properly — redo row-by-row for settings only
  // (settings table is tiny, so it's fine)
  restored["settings"] = 0;
  skipped["settings"]  = 0;
  for (const r of data.app_settings ?? []) {
    try {
      await db.insert(adminSettingsTable)
        .values({ key: s(r.key), value: s(r.value ?? "") })
        .onConflictDoUpdate({ target: adminSettingsTable.key, set: { value: s(r.value ?? "") } });
      restored["settings"]++;
    } catch (e: any) {
      skipped["settings"]++;
      if (errors.length < 30) errors.push(`settings: ${String(e?.message ?? e).slice(0, 120)}`);
    }
  }
  if (onProgress && (data.app_settings ?? []).length > 0) {
    await onProgress(`✅ settings: ${restored["settings"]}`).catch(() => {});
  }

  // ── 2: users ─────────────────────────────────────────────────────────────────
  await upsertBulk(
    "users", data.users ?? [],
    (r) => ({
      telegramId:   n(r.telegramId ?? r.telegram_id),
      referralCode: s(r.referralCode ?? r.referral_code),
      firstName:    s(r.firstName ?? r.first_name),
      lastName:     r.lastName ?? r.last_name ?? null,
      language:     r.language ?? "fa",
      gender:       r.gender   ?? null,
      age:          r.age      != null ? n(r.age) : null,
      city:         r.city     ?? null,
      coins:        n(r.coins),
      reportCount:  n(r.reportCount ?? r.report_count),
      createdAt:    dn(r.createdAt),
    }),
    async (rows) => {
      await (db.insert(usersTable) as any)
        .values(rows)
        .onConflictDoUpdate({
          target: usersTable.telegramId,
          set: {
            firstName:    rows[0].firstName,
            lastName:     rows[0].lastName,
            language:     rows[0].language,
            gender:       rows[0].gender,
            age:          rows[0].age,
            city:         rows[0].city,
            coins:        rows[0].coins,
            reportCount:  rows[0].reportCount,
            referralCode: rows[0].referralCode,
          },
        });
    }
  );

  // ── 3: referrals ─────────────────────────────────────────────────────────────
  await upsertBulk(
    "referrals", data.referrals ?? [],
    (r) => ({
      referrerId: n(r.referrerId ?? r.inviter_id),
      referredId: n(r.referredId ?? r.invitee_id),
      rewarded:   n(r.rewarded),
      createdAt:  dn(r.createdAt),
    }),
    (rows) => (db.insert(referralsTable) as any).values(rows).onConflictDoNothing() as Promise<void>
  );

  // ── 4: admin_permissions ─────────────────────────────────────────────────────
  await upsertBulk(
    "admin_permissions", data.admin_permissions ?? [],
    (r) => ({
      telegramId: n(r.telegramId),
      addedBy:    n(r.addedBy),
      username:   r.username ?? null,
      level:      r.level ?? "moderator",
      createdAt:  dn(r.createdAt),
    }),
    (rows) => (db.insert(adminPermissionsTable) as any).values(rows).onConflictDoNothing() as Promise<void>
  );

  // ── 5: payment_packages ──────────────────────────────────────────────────────
  await upsertBulk(
    "payment_packages", data.payment_packages ?? [],
    (r) => ({
      coins:           n(r.coins),
      price:           n(r.price),
      currency:        r.currency ?? "IRT",
      label:           r.label ?? null,
      discountPercent: n(r.discountPercent),
      originalPrice:   r.originalPrice ?? null,
      cardPrice:       r.cardPrice ?? null,
      cryptoPrice:     r.cryptoPrice ?? null,
      tetrapayPrice:   r.tetrapayPrice ?? null,
      plisioPrice:     r.plisioPrice ?? null,
      isActive:        b(r.isActive),
      gateway:         r.gateway ?? null,
      createdAt:       dn(r.createdAt),
    }),
    (rows) => (db.insert(paymentPackagesTable) as any).values(rows).onConflictDoNothing() as Promise<void>
  );

  // ── 6: discount_codes ────────────────────────────────────────────────────────
  await upsertBulk(
    "discount_codes", data.discount_codes ?? [],
    (r) => ({
      code:            s(r.code),
      discountPercent: n(r.discountPercent),
      maxUses:         r.maxUses ?? null,
      usedCount:       n(r.usedCount),
      isActive:        b(r.isActive),
      expiresAt:       d(r.expiresAt),
      createdAt:       dn(r.createdAt),
    }),
    (rows) => (db.insert(discountCodesTable) as any).values(rows).onConflictDoNothing() as Promise<void>
  );

  // ── 7: gift_codes ────────────────────────────────────────────────────────────
  await upsertBulk(
    "gift_codes", data.gift_codes ?? [],
    (r) => ({
      code:      s(r.code),
      coins:     n(r.coins),
      maxUsage:  n(r.maxUsage ?? r.max_usage, 1),
      usedCount: n(r.usedCount),
      isActive:  b(r.isActive),
      expiresAt: d(r.expiresAt),
      createdAt: dn(r.createdAt),
    }),
    (rows) => (db.insert(giftCodesTable) as any).values(rows).onConflictDoNothing() as Promise<void>
  );

  // ── 8: gift_code_redemptions ─────────────────────────────────────────────────
  await upsertBulk(
    "gift_code_redemptions", data.gift_code_redemptions ?? [],
    (r) => ({
      giftCodeId: n(r.giftCodeId ?? r.gift_code_id),
      userId:     n(r.userId ?? r.user_id),
      createdAt:  dn(r.createdAt),
    }),
    (rows) => (db.insert(giftCodeRedemptionsTable) as any).values(rows).onConflictDoNothing() as Promise<void>
  );

  // ── 9: payments ──────────────────────────────────────────────────────────────
  await upsertBulk(
    "payments", data.payments ?? [],
    (r) => ({
      userId:         n(r.userId ?? r.user_id),
      packageId:      r.packageId ?? r.package_id ?? null,
      coins:          n(r.coins),
      price:          n(r.price),
      currency:       r.currency ?? "IRT",
      method:         r.method ?? "card",
      status:         r.status ?? "pending",
      receiptFileId:  r.receiptFileId ?? null,
      adminMessageId: r.adminMessageId ?? null,
      adminChatId:    r.adminChatId ?? null,
      approvedBy:     r.approvedBy ?? null,
      discountCodeId: r.discountCodeId ?? null,
      discountPercent: n(r.discountPercent),
      processedAt:    d(r.processedAt),
      createdAt:      dn(r.createdAt),
      updatedAt:      d(r.updatedAt),
    }),
    (rows) => (db.insert(paymentsTable) as any).values(rows).onConflictDoNothing() as Promise<void>
  );

  // ── 10: coin_transactions ────────────────────────────────────────────────────
  await upsertBulk(
    "coin_transactions", data.coin_transactions ?? [],
    (r) => ({
      userId:      n(r.userId ?? r.user_id),
      amount:      n(r.amount),
      type:        r.type ?? "payment",
      description: r.description ?? null,
      createdAt:   dn(r.createdAt),
    }),
    (rows) => (db.insert(coinTransactionsTable) as any).values(rows).onConflictDoNothing() as Promise<void>
  );

  // ── 11: group_chats ──────────────────────────────────────────────────────────
  await upsertBulk(
    "group_chats", data.group_chats ?? [],
    (r) => ({
      ...r,
      createdAt: dn(r.createdAt),
    }),
    (rows) => (db.insert(groupChatsTable) as any).values(rows).onConflictDoNothing() as Promise<void>
  );

  // ── 12: group_members ────────────────────────────────────────────────────────
  await upsertBulk(
    "group_members", data.group_members ?? [],
    (r) => ({
      ...r,
      joinedAt: dn(r.joinedAt),
    }),
    (rows) => (db.insert(groupMembersTable) as any).values(rows).onConflictDoNothing() as Promise<void>
  );

  // ── 13: anonymous_messages ───────────────────────────────────────────────────
  await upsertBulk(
    "anonymous_messages", data.anonymous_messages ?? [],
    (r) => ({
      ...r,
      createdAt: dn(r.createdAt),
    }),
    (rows) => (db.insert(anonymousMessagesTable) as any).values(rows).onConflictDoNothing() as Promise<void>
  );

  // ── 14: bottle_messages ──────────────────────────────────────────────────────
  await upsertBulk(
    "bottle_messages", data.bottle_messages ?? [],
    (r) => ({
      ...r,
      createdAt: dn(r.createdAt),
    }),
    (rows) => (db.insert(bottleMessagesTable) as any).values(rows).onConflictDoNothing() as Promise<void>
  );

  // ── 15: chains ───────────────────────────────────────────────────────────────
  await upsertBulk(
    "chains", data.chains ?? [],
    (r) => ({ ...r, createdAt: dn(r.createdAt) }),
    (rows) => (db.insert(chainsTable) as any).values(rows).onConflictDoNothing() as Promise<void>
  );

  // ── 16: chain_links ──────────────────────────────────────────────────────────
  await upsertBulk(
    "chain_links", data.chain_links ?? [],
    (r) => ({ ...r, createdAt: dn(r.createdAt) }),
    (rows) => (db.insert(chainLinksTable) as any).values(rows).onConflictDoNothing() as Promise<void>
  );

  // ── 17: future_letters ───────────────────────────────────────────────────────
  await upsertBulk(
    "future_letters", data.future_letters ?? [],
    (r) => ({ ...r, createdAt: dn(r.createdAt) }),
    (rows) => (db.insert(futureLettersTable) as any).values(rows).onConflictDoNothing() as Promise<void>
  );

  // ── 18: reports ──────────────────────────────────────────────────────────────
  await upsertBulk(
    "reports", data.reports ?? [],
    (r) => ({ ...r, createdAt: dn(r.createdAt) }),
    (rows) => (db.insert(reportsTable) as any).values(rows).onConflictDoNothing() as Promise<void>
  );

  // ── 19: blocks ───────────────────────────────────────────────────────────────
  await upsertBulk(
    "blocks", data.blocks ?? [],
    (r) => ({ ...r, createdAt: dn(r.createdAt) }),
    (rows) => (db.insert(blocksTable) as any).values(rows).onConflictDoNothing() as Promise<void>
  );

  // ── 20: warnings ─────────────────────────────────────────────────────────────
  await upsertBulk(
    "warnings", data.warnings ?? [],
    (r) => ({ ...r, createdAt: dn(r.createdAt) }),
    (rows) => (db.insert(warningsTable) as any).values(rows).onConflictDoNothing() as Promise<void>
  );

  // ── 21: bad_words ────────────────────────────────────────────────────────────
  await upsertBulk(
    "bad_words", data.bad_words ?? [],
    (r) => ({ word: s(r.word), addedAt: dn(r.addedAt) }),
    (rows) => (db.insert(badWordsTable) as any).values(rows).onConflictDoNothing() as Promise<void>
  );

  // ── 22: timed_anon_links ─────────────────────────────────────────────────────
  await upsertBulk(
    "timed_anon_links", data.timed_anon_links ?? [],
    (r) => ({
      ...r,
      createdAt: dn(r.createdAt),
      expiresAt: d(r.expiresAt),
    }),
    (rows) => (db.insert(timedAnonLinksTable) as any).values(rows).onConflictDoNothing() as Promise<void>
  );

  // ── 23: pro_anon_links ───────────────────────────────────────────────────────
  await upsertBulk(
    "pro_anon_links", data.pro_anon_links ?? [],
    (r) => ({ ...r, createdAt: dn(r.createdAt) }),
    (rows) => (db.insert(proAnonLinksTable) as any).values(rows).onConflictDoNothing() as Promise<void>
  );

  // ── 24: tetrapay_transactions ────────────────────────────────────────────────
  await upsertBulk(
    "tetrapay_transactions", data.tetrapay_transactions ?? [],
    (r) => ({
      paymentId:        n(r.paymentId ?? r.payment_id),
      userId:           n(r.userId ?? r.user_id),
      orderNumber:      s(r.orderNumber ?? r.order_number),
      txnId:            r.txnId ?? r.txn_id ?? null,
      invoiceUrl:       r.invoiceUrl ?? r.invoice_url ?? null,
      amountIrt:        n(r.amountIrt ?? r.amount_irt),
      status:           r.status ?? "pending",
      callbackVerified: b(r.callbackVerified ?? r.callback_verified, false),
      verifiedAt:       d(r.verifiedAt ?? r.verified_at),
      errorMessage:     r.errorMessage ?? r.error_message ?? null,
      createdAt:        dn(r.createdAt),
    }),
    (rows) => (db.insert(tetraPayTransactionsTable) as any).values(rows).onConflictDoNothing() as Promise<void>
  );

  // ── 25: plisio_transactions ──────────────────────────────────────────────────
  await upsertBulk(
    "plisio_transactions", data.plisio_transactions ?? [],
    (r) => ({
      paymentId:        n(r.paymentId ?? r.payment_id),
      userId:           n(r.userId ?? r.user_id),
      orderNumber:      s(r.orderNumber ?? r.order_number),
      txnId:            r.txnId ?? r.txn_id ?? null,
      invoiceUrl:       r.invoiceUrl ?? r.invoice_url ?? null,
      amountUsd:        r.amountUsd ?? r.amount_usd ?? null,
      currency:         r.currency ?? null,
      status:           r.status ?? "pending",
      callbackVerified: b(r.callbackVerified ?? r.callback_verified, false),
      verifiedAt:       d(r.verifiedAt ?? r.verified_at),
      errorMessage:     r.errorMessage ?? r.error_message ?? null,
      createdAt:        dn(r.createdAt),
    }),
    (rows) => (db.insert(plisioTransactionsTable) as any).values(rows).onConflictDoNothing() as Promise<void>
  );

  return {
    success: errors.length === 0,
    restored,
    skipped,
    errors,
  };
}
