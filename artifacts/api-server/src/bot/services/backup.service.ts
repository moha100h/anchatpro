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
import { eq, desc, sql } from "drizzle-orm";
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

    const [
      users, referrals, admins, settings, transactions, payments,
      giftCodes, redemptions, groups, groupMembers, anonMsgs, bottles,
      chains, chainLinks, letters, reports, blocks, packages,
      discountCodes, timedLinks, proLinks, warnings, badWords,
      tetraPayTxns, plisioTxns,
    ] = await Promise.all([
      db.select().from(usersTable),
      db.select().from(referralsTable),
      db.select().from(adminPermissionsTable).catch(() => [] as any[]),
      db.select().from(adminSettingsTable).catch(() => [] as any[]),
      db.select().from(coinTransactionsTable).orderBy(desc(coinTransactionsTable.createdAt)),
      db.select().from(paymentsTable).orderBy(desc(paymentsTable.createdAt)),
      db.select().from(giftCodesTable).catch(() => [] as any[]),
      db.select().from(giftCodeRedemptionsTable).catch(() => [] as any[]),
      db.select().from(groupChatsTable),
      db.select().from(groupMembersTable),
      db.select().from(anonymousMessagesTable).orderBy(desc(anonymousMessagesTable.createdAt)),
      db.select().from(bottleMessagesTable),
      db.select().from(chainsTable),
      db.select().from(chainLinksTable),
      db.select().from(futureLettersTable),
      db.select().from(reportsTable).orderBy(desc(reportsTable.createdAt)),
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
    const backupData = {
      _meta: {
        backupVersion: "6.0",
        timestamp: new Date().toISOString(),
        generator: "anymschat_bot",
        stats: {
          users: users.length, referrals: referrals.length,
          transactions: transactions.length, payments: payments.length,
          groups: groups.length, groupMembers: groupMembers.length,
          anonMessages: anonMsgs.length, bottles: bottles.length,
          letters: letters.length, reports: reports.length,
          blocks: blocks.length, packages: packages.length,
          discountCodes: discountCodes.length, warnings: warnings.length,
          badWords: badWords.length, timedLinks: timedLinks.length,
          proLinks: proLinks.length, tetraPayTxns: tetraPayTxns.length,
          plisioTxns: plisioTxns.length,
        },
      },
      users, referrals, admin_permissions: admins, app_settings: settings,
      payment_packages: packages, discount_codes: discountCodes,
      coin_transactions: transactions, payments, gift_codes: giftCodes,
      gift_code_redemptions: redemptions, group_chats: groups,
      group_members: groupMembers, anonymous_messages: anonMsgs,
      bottle_messages: bottles, chains, chain_links: chainLinks,
      future_letters: letters, reports, blocks, timed_anon_links: timedLinks,
      pro_anon_links: proLinks, warnings, bad_words: badWords,
      tetrapay_transactions: tetraPayTxns, plisio_transactions: plisioTxns,
    };

    let jsonBuf: Buffer | null = Buffer.from(JSON.stringify(backupData), "utf-8");
    let gzipBuf: Buffer | null = gzipSync(jsonBuf, { level: 6 });
    const sizeMB    = (gzipBuf.length / 1_048_576).toFixed(1);
    const rawSizeMB = (jsonBuf.length / 1_048_576).toFixed(1);

    await bot.api.sendMessage(chatId,
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
      `📦 حجم: *${sizeMB} MB* فشرده / ${rawSizeMB} MB خام\n_در حال ارسال فایل..._`,
      { parse_mode: "Markdown" }
    );

    await bot.api.sendDocument(chatId,
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
  success:  boolean;
  restored: Record<string, number>;
  skipped:  Record<string, number>;
  errors:   string[];
}

/** Human-readable Persian labels for real-time restore progress reporting. */
export const TABLE_LABELS: Record<string, string> = {
  settings:               "⚙️ تنظیمات",
  users:                  "👥 کاربران",
  referrals:              "🎁 دعوت‌ها",
  admin_permissions:      "🛡️ ادمین‌ها",
  payment_packages:       "📦 پکیج‌ها",
  discount_codes:         "🏷️ کدهای تخفیف",
  gift_codes:             "🎉 کدهای هدیه",
  gift_code_redemptions:  "🎟️ استفاده از کد هدیه",
  payments:               "💳 پرداخت‌ها",
  coin_transactions:      "💰 تراکنش‌های سکه",
  group_chats:            "👨‍👩‍👧 گروه‌ها",
  group_members:          "👤 اعضای گروه",
  anonymous_messages:     "📩 پیام‌های ناشناس",
  bottle_messages:        "🍾 بطری‌ها",
  chains:                 "🔗 زنجیرها",
  chain_links:            "⛓️ حلقه‌های زنجیر",
  future_letters:         "✉️ نامه‌ها به آینده",
  reports:                "🚨 گزارش‌ها",
  blocks:                 "🚫 بلاک‌ها",
  warnings:               "⚠️ هشدارها",
  bad_words:              "🔑 کلمات ممنوع",
  timed_anon_links:       "⏱️ لینک‌های مدت‌دار",
  pro_anon_links:         "⭐ لینک‌های پرو",
  tetrapay_transactions:  "🏦 تراکنش‌های تتراپی",
  plisio_transactions:    "🪙 تراکنش‌های پلیزیو",
};

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
 * Performance strategy:
 *   • Bulk INSERT … ON CONFLICT DO NOTHING in chunks of CHUNK_SIZE rows.
 *     One SQL round-trip per chunk instead of one per row — 500x faster.
 *   • Chunk failures fall back to row-by-row so a single bad row never
 *     blocks the rest of the table.
 *   • Settings use per-row ON CONFLICT DO UPDATE (must overwrite).
 *   • Users use ON CONFLICT DO UPDATE via EXCLUDED pseudo-table so that
 *     coins/balance are correctly restored in bulk.
 */
export async function restoreFromBackup(
  data: any,
  onProgress?: (msg: string) => Promise<void>
): Promise<RestoreResult> {
  const restored: Record<string, number> = {};
  const skipped:  Record<string, number> = {};
  const errors:   string[] = [];
  const CHUNK = 500;

  const d  = (v: any): Date | null => (v ? new Date(v) : null);
  const dn = (v: any): Date        => (v ? new Date(v) : new Date());
  const n  = (v: any, def = 0): number  => Number(v ?? def);
  const s  = (v: any, def = ""): string => String(v ?? def);
  const b  = (v: any, def = true): boolean => (v !== undefined && v !== null ? Boolean(v) : def);

  /**
   * Generic bulk-insert helper.
   * `prepareRow` → transforms raw backup row to a Drizzle-compatible object.
   * `bulkFn`     → called with a prepared chunk; MUST use onConflictDoNothing.
   * On chunk failure, falls back to inserting each row individually.
   *
   * Counting is EXACT: we read the number of rows actually written from the
   * driver result (`.rowCount` for plain inserts, array length when a caller
   * uses `.returning()`). Rows silently dropped by ON CONFLICT DO NOTHING are
   * counted as skipped, not restored — so the per-table report is truthful.
   */
  const affected = (res: any, attempted: number): number => {
    if (Array.isArray(res)) return res.length;
    if (res && typeof res.rowCount === "number") return res.rowCount;
    return attempted; // driver gave no count — assume all written
  };

  async function bulkRestore<T>(
    tableName: string,
    rawRows: any[],
    prepareRow: (r: any) => T,
    bulkFn: (rows: T[]) => Promise<any>
  ): Promise<void> {
    if (!rawRows?.length) {
      restored[tableName] = 0;
      skipped[tableName]  = 0;
      return;
    }

    let ok = 0, skip = 0;

    for (let i = 0; i < rawRows.length; i += CHUNK) {
      const chunk = rawRows.slice(i, i + CHUNK);
      let prepared: T[];

      // Step 1: prepare (transform) the chunk — catch per-row bad data
      try {
        prepared = chunk.map(prepareRow);
      } catch {
        for (const r of chunk) {
          try {
            const res = await bulkFn([prepareRow(r)]);
            const wrote = affected(res, 1);
            wrote > 0 ? ok++ : skip++;
          } catch (e2: any) {
            skip++;
            if (errors.length < 50) errors.push(`${tableName}: ${s(e2?.message ?? e2).slice(0, 100)}`);
          }
        }
        continue;
      }

      // Step 2: try the whole chunk as one INSERT statement
      try {
        const res = await bulkFn(prepared);
        const wrote = affected(res, prepared.length);
        ok   += wrote;
        skip += prepared.length - wrote;
      } catch {
        // Step 3: chunk failed — try each row individually
        for (const row of prepared) {
          try {
            const res = await bulkFn([row]);
            const wrote = affected(res, 1);
            wrote > 0 ? ok++ : skip++;
          } catch (e2: any) {
            skip++;
            if (errors.length < 50) errors.push(`${tableName}: ${s(e2?.message ?? e2).slice(0, 100)}`);
          }
        }
      }
    }

    restored[tableName] = ok;
    skipped[tableName]  = skip;

    if (onProgress) {
      const name  = TABLE_LABELS[tableName] ?? tableName;
      const label = skip > 0
        ? `✅ ${name}: ${ok.toLocaleString()} ⚠️(${skip} رد شد)`
        : `✅ ${name}: ${ok.toLocaleString()}`;
      await onProgress(label).catch(() => {});
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // IMPORTANT: table order matters for FK constraints.
  // users → referrals → payments → coin_transactions → everything else
  // ─────────────────────────────────────────────────────────────────────────────

  // ── 1: settings (key-value; must DO UPDATE to overwrite stale values) ────────
  {
    const rows = data.app_settings ?? [];
    let ok = 0, skip = 0;
    for (const r of rows) {
      try {
        await db.insert(adminSettingsTable)
          .values({ key: s(r.key), value: s(r.value ?? "") })
          .onConflictDoUpdate({ target: adminSettingsTable.key, set: { value: s(r.value ?? "") } });
        ok++;
      } catch (e: any) {
        skip++;
        if (errors.length < 50) errors.push(`settings: ${s(e?.message ?? e).slice(0, 100)}`);
      }
    }
    restored["settings"] = ok;
    skipped["settings"]  = skip;
    if (onProgress && rows.length > 0) await onProgress(`✅ ${TABLE_LABELS.settings}: ${ok}`).catch(() => {});
  }

  // ── 2: users (DO UPDATE via EXCLUDED so coins/balance are restored correctly) ─
  await bulkRestore(
    "users", data.users ?? [],
    (r) => ({
      telegramId:       n(r.telegramId   ?? r.telegram_id),
      username:         (r.username      ?? null) as any,
      firstName:        (r.firstName     ?? r.first_name) ?? null,
      lastName:         (r.lastName      ?? r.last_name)  ?? null,
      gender:           r.gender ?? null,
      age:              r.age != null ? n(r.age) : null,
      city:             r.city  ?? null,
      language:         r.language ?? "fa",
      coins:            n(r.coins),
      referralCode:     s(r.referralCode ?? r.referral_code),
      referredBy:       (r.referredBy ?? r.referred_by) != null ? n(r.referredBy ?? r.referred_by) : null,
      status:           r.status ?? "active",
      warningCount:     n(r.warningCount ?? r.warning_count),
      isInQueue:        b(r.isInQueue ?? r.is_in_queue, false),
      isInChat:         b(r.isInChat  ?? r.is_in_chat,  false),
      isInGroup:        b(r.isInGroup ?? r.is_in_group, false),
      maxGroupsCreated: n(r.maxGroupsCreated ?? r.max_groups_created, 5),
      maxGroupsJoined:  n(r.maxGroupsJoined  ?? r.max_groups_joined,  5),
      setupStep:        (r.setupStep ?? r.setup_step) ?? null,
      anonymousToken:   (r.anonymousToken ?? r.anonymous_token) ?? null,
      anonLinkPaid:     b(r.anonLinkPaid    ?? r.anon_link_paid,    false),
      anonLinkEnabled:  b(r.anonLinkEnabled ?? r.anon_link_enabled, true),
      reportCount:      n(r.reportCount ?? r.report_count),
      restrictedUntil:  d(r.restrictedUntil ?? r.restricted_until),
      lastSeen:         d(r.lastSeen ?? r.last_seen),
      lastSpinDate:     (r.lastSpinDate ?? r.last_spin_date) ?? null,
      createdAt:        dn(r.createdAt),
      updatedAt:        dn(r.updatedAt),
    }),
    async (rows) => {
      // Use sql`excluded.col` so each conflicting row gets ITS OWN backup values.
      await (db.insert(usersTable) as any).values(rows).onConflictDoUpdate({
        target: usersTable.telegramId,
        set: {
          username:         sql`excluded.username`,
          firstName:        sql`excluded.first_name`,
          lastName:         sql`excluded.last_name`,
          gender:           sql`excluded.gender`,
          age:              sql`excluded.age`,
          city:             sql`excluded.city`,
          language:         sql`excluded.language`,
          coins:            sql`excluded.coins`,
          referralCode:     sql`excluded.referral_code`,
          referredBy:       sql`excluded.referred_by`,
          status:           sql`excluded.status`,
          warningCount:     sql`excluded.warning_count`,
          isInQueue:        sql`excluded.is_in_queue`,
          isInChat:         sql`excluded.is_in_chat`,
          isInGroup:        sql`excluded.is_in_group`,
          maxGroupsCreated: sql`excluded.max_groups_created`,
          maxGroupsJoined:  sql`excluded.max_groups_joined`,
          setupStep:        sql`excluded.setup_step`,
          anonymousToken:   sql`excluded.anonymous_token`,
          anonLinkPaid:     sql`excluded.anon_link_paid`,
          anonLinkEnabled:  sql`excluded.anon_link_enabled`,
          reportCount:      sql`excluded.report_count`,
          restrictedUntil:  sql`excluded.restricted_until`,
          lastSeen:         sql`excluded.last_seen`,
          lastSpinDate:     sql`excluded.last_spin_date`,
          updatedAt:        sql`excluded.updated_at`,
        },
      });
    }
  );

  // ── 3: referrals ──────────────────────────────────────────────────────────────
  await bulkRestore(
    "referrals", data.referrals ?? [],
    (r) => ({
      id:         r.id != null ? n(r.id) : undefined,
      referrerId: n(r.referrerId ?? r.referrer_id),
      referredId: n(r.referredId ?? r.referred_id),
      rewarded:   n(r.rewarded),
      createdAt:  dn(r.createdAt),
    }),
    (rows) => (db.insert(referralsTable) as any).values(rows).onConflictDoNothing()
  );

  // ── 4: admin_permissions ──────────────────────────────────────────────────────
  await bulkRestore(
    "admin_permissions", data.admin_permissions ?? [],
    (r) => ({
      id:         r.id != null ? n(r.id) : undefined,
      telegramId: n(r.telegramId ?? r.telegram_id),
      username:   r.username ?? null,
      level:      r.level ?? "moderator",
      addedBy:    n(r.addedBy ?? r.added_by),
      createdAt:  dn(r.createdAt),
    }),
    (rows) => (db.insert(adminPermissionsTable) as any).values(rows).onConflictDoNothing()
  );

  // ── 5: payment_packages ───────────────────────────────────────────────────────
  await bulkRestore(
    "payment_packages", data.payment_packages ?? [],
    (r) => ({
      id:              r.id != null ? n(r.id) : undefined,
      gateway:         r.gateway ?? null,
      coins:           n(r.coins),
      price:           n(r.price),
      originalPrice:   (r.originalPrice ?? r.original_price) ?? null,
      discountPercent: n(r.discountPercent ?? r.discount_percent),
      currency:        r.currency ?? "IRT",
      cardPrice:       (r.cardPrice     ?? r.card_price)     ?? null,
      cryptoPrice:     (r.cryptoPrice   ?? r.crypto_price)   ?? null,
      tetrapayPrice:   (r.tetrapayPrice ?? r.tetrapay_price) ?? null,
      plisioPrice:     (r.plisioPrice   ?? r.plisio_price)   ?? null,
      label:           r.label ?? null,
      description:     r.description ?? null,
      isActive:        b(r.isActive ?? r.is_active),
      createdAt:       dn(r.createdAt),
    }),
    (rows) => (db.insert(paymentPackagesTable) as any).values(rows).onConflictDoNothing()
  );

  // ── 6: discount_codes ─────────────────────────────────────────────────────────
  await bulkRestore(
    "discount_codes", data.discount_codes ?? [],
    (r) => ({
      id:              r.id != null ? n(r.id) : undefined,
      code:            s(r.code),
      discountPercent: n(r.discountPercent ?? r.discount_percent),
      maxUses:         (r.maxUses ?? r.max_uses) != null ? n(r.maxUses ?? r.max_uses) : null,
      usedCount:       n(r.usedCount ?? r.used_count),
      expiresAt:       d(r.expiresAt ?? r.expires_at),
      isActive:        b(r.isActive ?? r.is_active),
      createdAt:       dn(r.createdAt),
    }),
    (rows) => (db.insert(discountCodesTable) as any).values(rows).onConflictDoNothing()
  );

  // ── 7: gift_codes ─────────────────────────────────────────────────────────────
  await bulkRestore(
    "gift_codes", data.gift_codes ?? [],
    (r) => ({
      id:        r.id != null ? n(r.id) : undefined,
      code:      s(r.code),
      coins:     n(r.coins),
      maxUsage:  n(r.maxUsage ?? r.max_usage, 1),
      usedCount: n(r.usedCount ?? r.used_count),
      isActive:  b(r.isActive ?? r.is_active),
      createdBy: n(r.createdBy ?? r.created_by),
      createdAt: dn(r.createdAt),
    }),
    (rows) => (db.insert(giftCodesTable) as any).values(rows).onConflictDoNothing()
  );

  // ── 8: gift_code_redemptions ──────────────────────────────────────────────────
  await bulkRestore(
    "gift_code_redemptions", data.gift_code_redemptions ?? [],
    (r) => ({
      id:         r.id != null ? n(r.id) : undefined,
      codeId:     n(r.codeId ?? r.code_id ?? r.giftCodeId ?? r.gift_code_id),
      userId:     n(r.userId ?? r.user_id),
      redeemedAt: dn(r.redeemedAt ?? r.redeemed_at ?? r.createdAt),
    }),
    (rows) => (db.insert(giftCodeRedemptionsTable) as any).values(rows).onConflictDoNothing()
  );

  // ── 9: payments ───────────────────────────────────────────────────────────────
  await bulkRestore(
    "payments", data.payments ?? [],
    (r) => ({
      id:              r.id != null ? n(r.id) : undefined,
      userId:          n(r.userId ?? r.user_id),
      packageId:       (r.packageId ?? r.package_id) != null ? n(r.packageId ?? r.package_id) : null,
      coins:           n(r.coins),
      price:           n(r.price),
      currency:        r.currency ?? "IRT",
      method:          r.method   ?? "card",
      status:          r.status   ?? "pending",
      receiptFileId:   (r.receiptFileId  ?? r.receipt_file_id)  ?? null,
      adminMessageId:  (r.adminMessageId ?? r.admin_message_id) != null ? n(r.adminMessageId ?? r.admin_message_id) : null,
      adminGroupId:    (r.adminGroupId   ?? r.admin_group_id)   != null ? n(r.adminGroupId   ?? r.admin_group_id)   : null,
      rejectionReason: (r.rejectionReason ?? r.rejection_reason) ?? null,
      processedBy:     (r.processedBy ?? r.processed_by) != null ? n(r.processedBy ?? r.processed_by) : null,
      processedAt:     d(r.processedAt ?? r.processed_at),
      createdAt:       dn(r.createdAt),
    }),
    (rows) => (db.insert(paymentsTable) as any).values(rows).onConflictDoNothing()
  );

  // ── 10: coin_transactions ─────────────────────────────────────────────────────
  await bulkRestore(
    "coin_transactions", data.coin_transactions ?? [],
    (r) => ({
      id:            r.id != null ? n(r.id) : undefined,
      userId:        n(r.userId ?? r.user_id),
      amount:        n(r.amount),
      type:          r.type ?? "payment",
      description:   r.description ?? null,
      balanceBefore: n(r.balanceBefore ?? r.balance_before),
      balanceAfter:  n(r.balanceAfter  ?? r.balance_after),
      createdAt:     dn(r.createdAt),
    }),
    (rows) => (db.insert(coinTransactionsTable) as any).values(rows).onConflictDoNothing()
  );

  // ── 11: group_chats ───────────────────────────────────────────────────────────
  await bulkRestore(
    "group_chats", data.group_chats ?? [],
    (r) => ({ ...r, createdAt: dn(r.createdAt), endedAt: d(r.endedAt), lastActivityAt: d(r.lastActivityAt) }),
    (rows) => (db.insert(groupChatsTable) as any).values(rows).onConflictDoNothing()
  );

  // ── 12: group_members ─────────────────────────────────────────────────────────
  await bulkRestore(
    "group_members", data.group_members ?? [],
    (r) => ({ ...r, joinedAt: dn(r.joinedAt), leftAt: d(r.leftAt) }),
    (rows) => (db.insert(groupMembersTable) as any).values(rows).onConflictDoNothing()
  );

  // ── 13: anonymous_messages ────────────────────────────────────────────────────
  await bulkRestore(
    "anonymous_messages", data.anonymous_messages ?? [],
    (r) => ({ ...r, createdAt: dn(r.createdAt), senderRevealedAt: d(r.senderRevealedAt), repliedAt: d(r.repliedAt) }),
    (rows) => (db.insert(anonymousMessagesTable) as any).values(rows).onConflictDoNothing()
  );

  // ── 14: bottle_messages ───────────────────────────────────────────────────────
  await bulkRestore(
    "bottle_messages", data.bottle_messages ?? [],
    (r) => ({ ...r, createdAt: dn(r.createdAt), deliveredAt: d(r.deliveredAt), expiresAt: d(r.expiresAt) }),
    (rows) => (db.insert(bottleMessagesTable) as any).values(rows).onConflictDoNothing()
  );

  // ── 15: chains ────────────────────────────────────────────────────────────────
  await bulkRestore(
    "chains", data.chains ?? [],
    (r) => ({ ...r, createdAt: dn(r.createdAt), completedAt: d(r.completedAt) }),
    (rows) => (db.insert(chainsTable) as any).values(rows).onConflictDoNothing()
  );

  // ── 16: chain_links ───────────────────────────────────────────────────────────
  await bulkRestore(
    "chain_links", data.chain_links ?? [],
    (r) => ({ ...r, createdAt: dn(r.createdAt) }),
    (rows) => (db.insert(chainLinksTable) as any).values(rows).onConflictDoNothing()
  );

  // ── 17: future_letters ────────────────────────────────────────────────────────
  await bulkRestore(
    "future_letters", data.future_letters ?? [],
    (r) => ({ ...r, createdAt: dn(r.createdAt), deliverAt: dn(r.deliverAt) }),
    (rows) => (db.insert(futureLettersTable) as any).values(rows).onConflictDoNothing()
  );

  // ── 18: reports ───────────────────────────────────────────────────────────────
  await bulkRestore(
    "reports", data.reports ?? [],
    (r) => ({ ...r, createdAt: dn(r.createdAt), reviewedAt: d(r.reviewedAt) }),
    (rows) => (db.insert(reportsTable) as any).values(rows).onConflictDoNothing()
  );

  // ── 19: blocks ────────────────────────────────────────────────────────────────
  await bulkRestore(
    "blocks", data.blocks ?? [],
    (r) => ({ ...r, createdAt: dn(r.createdAt) }),
    (rows) => (db.insert(blocksTable) as any).values(rows).onConflictDoNothing()
  );

  // ── 20: warnings ──────────────────────────────────────────────────────────────
  await bulkRestore(
    "warnings", data.warnings ?? [],
    (r) => ({ ...r, createdAt: dn(r.createdAt) }),
    (rows) => (db.insert(warningsTable) as any).values(rows).onConflictDoNothing()
  );

  // ── 21: bad_words ─────────────────────────────────────────────────────────────
  await bulkRestore(
    "bad_words", data.bad_words ?? [],
    (r) => ({
      id:        r.id != null ? n(r.id) : undefined,
      word:      s(r.word),
      language:  r.language ?? "all",
      createdAt: dn(r.createdAt ?? r.addedAt ?? r.added_at),
    }),
    (rows) => (db.insert(badWordsTable) as any).values(rows).onConflictDoNothing()
  );

  // ── 22: timed_anon_links ──────────────────────────────────────────────────────
  await bulkRestore(
    "timed_anon_links", data.timed_anon_links ?? [],
    (r) => ({ ...r, createdAt: dn(r.createdAt), expiresAt: d(r.expiresAt) }),
    (rows) => (db.insert(timedAnonLinksTable) as any).values(rows).onConflictDoNothing()
  );

  // ── 23: pro_anon_links ────────────────────────────────────────────────────────
  await bulkRestore(
    "pro_anon_links", data.pro_anon_links ?? [],
    (r) => ({ ...r, createdAt: dn(r.createdAt), expiresAt: d(r.expiresAt) }),
    (rows) => (db.insert(proAnonLinksTable) as any).values(rows).onConflictDoNothing()
  );

  // ── 24: tetrapay_transactions ─────────────────────────────────────────────────
  await bulkRestore(
    "tetrapay_transactions", data.tetrapay_transactions ?? [],
    (r) => ({
      id:               r.id != null ? n(r.id) : undefined,
      paymentId:        n(r.paymentId ?? r.payment_id),
      userId:           n(r.userId    ?? r.user_id),
      hashId:           s(r.hashId    ?? r.hash_id),
      authority:        (r.authority) ?? null,
      trackingId:       (r.trackingId    ?? r.tracking_id)     ?? null,
      paymentUrlBot:    (r.paymentUrlBot ?? r.payment_url_bot) ?? null,
      paymentUrlWeb:    (r.paymentUrlWeb ?? r.payment_url_web) ?? null,
      amountRial:       n(r.amountRial ?? r.amount_rial),
      status:           r.status ?? "pending",
      callbackVerified: b(r.callbackVerified ?? r.callback_verified, false),
      errorMessage:     (r.errorMessage ?? r.error_message) ?? null,
      createdAt:        dn(r.createdAt),
      verifiedAt:       d(r.verifiedAt ?? r.verified_at),
    }),
    (rows) => (db.insert(tetraPayTransactionsTable) as any).values(rows).onConflictDoNothing()
  );

  // ── 25: plisio_transactions ───────────────────────────────────────────────────
  await bulkRestore(
    "plisio_transactions", data.plisio_transactions ?? [],
    (r) => ({
      id:               r.id != null ? n(r.id) : undefined,
      paymentId:        n(r.paymentId ?? r.payment_id),
      userId:           n(r.userId    ?? r.user_id),
      orderNumber:      s(r.orderNumber ?? r.order_number),
      txnId:            (r.txnId      ?? r.txn_id)      ?? null,
      invoiceUrl:       (r.invoiceUrl ?? r.invoice_url) ?? null,
      amountUsd:        s(r.amountUsd ?? r.amount_usd),
      currency:         r.currency ?? null,
      status:           r.status ?? "pending",
      callbackVerified: b(r.callbackVerified ?? r.callback_verified, false),
      errorMessage:     (r.errorMessage ?? r.error_message) ?? null,
      createdAt:        dn(r.createdAt),
      verifiedAt:       d(r.verifiedAt ?? r.verified_at),
    }),
    (rows) => (db.insert(plisioTransactionsTable) as any).values(rows).onConflictDoNothing()
  );

  // ── Reset serial sequences ────────────────────────────────────────────────────
  // Rows were restored with their ORIGINAL id values (to keep cross-table
  // relations intact). Advance each id sequence past MAX(id) so future inserts
  // don't collide with restored rows (which would raise duplicate-key errors).
  const seqTables = [
    "referrals", "admin_permissions", "payment_packages", "discount_codes",
    "gift_codes", "gift_code_redemptions", "payments", "coin_transactions",
    "group_chats", "group_members", "anonymous_messages", "bottle_messages",
    "chains", "chain_links", "future_letters", "reports", "blocks", "warnings",
    "bad_words", "timed_anon_links", "pro_anon_links",
    "tetrapay_transactions", "plisio_transactions", "admin_settings",
  ];
  for (const t of seqTables) {
    try {
      await db.execute(sql.raw(
        `SELECT setval(seq, GREATEST(mx, 1)) FROM (` +
        `SELECT pg_get_serial_sequence('"${t}"', 'id') AS seq, ` +
        `(SELECT COALESCE(MAX(id), 0) FROM "${t}") AS mx` +
        `) q WHERE seq IS NOT NULL`
      ));
    } catch (e: any) {
      if (errors.length < 50) errors.push(`seq ${t}: ${s(e?.message ?? e).slice(0, 80)}`);
    }
  }
  if (onProgress) await onProgress("🔧 sequence ها بازتنظیم شدند").catch(() => {});

  return { success: errors.length === 0, restored, skipped, errors };
}
