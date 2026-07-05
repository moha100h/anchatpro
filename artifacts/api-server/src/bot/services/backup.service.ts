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
      db.select().from(coinTransactionsTable).orderBy(desc(coinTransactionsTable.createdAt)).limit(100_000),
      db.select().from(paymentsTable).orderBy(desc(paymentsTable.createdAt)),
      db.select().from(giftCodesTable).catch(() => [] as any[]),
      db.select().from(giftCodeRedemptionsTable).catch(() => [] as any[]),
      db.select().from(groupChatsTable),
      db.select().from(groupMembersTable),
      db.select().from(anonymousMessagesTable).orderBy(desc(anonymousMessagesTable.createdAt)).limit(20_000),
      db.select().from(bottleMessagesTable),
      db.select().from(chainsTable),
      db.select().from(chainLinksTable),
      db.select().from(futureLettersTable),
      db.select().from(reportsTable).orderBy(desc(reportsTable.createdAt)).limit(5_000),
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
   */
  async function bulkRestore<T>(
    tableName: string,
    rawRows: any[],
    prepareRow: (r: any) => T,
    bulkFn: (rows: T[]) => Promise<void>
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
            await bulkFn([prepareRow(r)]);
            ok++;
          } catch (e2: any) {
            skip++;
            if (errors.length < 50) errors.push(`${tableName}: ${s(e2?.message ?? e2).slice(0, 100)}`);
          }
        }
        continue;
      }

      // Step 2: try the whole chunk as one INSERT statement
      try {
        await bulkFn(prepared);
        ok += prepared.length;
      } catch {
        // Step 3: chunk failed — try each row individually
        for (const row of prepared) {
          try {
            await bulkFn([row]);
            ok++;
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
      const label = skip > 0
        ? `✅ ${tableName}: ${ok.toLocaleString()} ⚠️(${skip} رد شد)`
        : `✅ ${tableName}: ${ok.toLocaleString()}`;
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
    if (onProgress && rows.length > 0) await onProgress(`✅ settings: ${ok}`).catch(() => {});
  }

  // ── 2: users (DO UPDATE via EXCLUDED so coins/balance are restored correctly) ─
  await bulkRestore(
    "users", data.users ?? [],
    (r) => ({
      telegramId:   n(r.telegramId   ?? r.telegram_id),
      referralCode: s(r.referralCode ?? r.referral_code),
      firstName:    s(r.firstName    ?? r.first_name),
      lastName:     (r.lastName      ?? r.last_name)   ?? null,
      language:     r.language ?? "fa",
      gender:       r.gender   ?? null,
      age:          r.age != null ? n(r.age) : null,
      city:         r.city     ?? null,
      coins:        n(r.coins),
      reportCount:  n(r.reportCount  ?? r.report_count),
      createdAt:    dn(r.createdAt),
    }),
    async (rows) => {
      // Use sql`excluded.col` so each conflicting row gets ITS OWN backup values.
      await (db.insert(usersTable) as any).values(rows).onConflictDoUpdate({
        target: usersTable.telegramId,
        set: {
          firstName:    sql`excluded.first_name`,
          lastName:     sql`excluded.last_name`,
          language:     sql`excluded.language`,
          gender:       sql`excluded.gender`,
          age:          sql`excluded.age`,
          city:         sql`excluded.city`,
          coins:        sql`excluded.coins`,
          reportCount:  sql`excluded.report_count`,
          referralCode: sql`excluded.referral_code`,
        },
      });
    }
  );

  // ── 3: referrals ──────────────────────────────────────────────────────────────
  await bulkRestore(
    "referrals", data.referrals ?? [],
    (r) => ({
      referrerId: n(r.referrerId ?? r.inviter_id),
      referredId: n(r.referredId ?? r.invitee_id),
      rewarded:   n(r.rewarded),
      createdAt:  dn(r.createdAt),
    }),
    (rows) => (db.insert(referralsTable) as any).values(rows).onConflictDoNothing()
  );

  // ── 4: admin_permissions ──────────────────────────────────────────────────────
  await bulkRestore(
    "admin_permissions", data.admin_permissions ?? [],
    (r) => ({
      telegramId: n(r.telegramId),
      addedBy:    n(r.addedBy),
      username:   r.username ?? null,
      level:      r.level ?? "moderator",
      createdAt:  dn(r.createdAt),
    }),
    (rows) => (db.insert(adminPermissionsTable) as any).values(rows).onConflictDoNothing()
  );

  // ── 5: payment_packages ───────────────────────────────────────────────────────
  await bulkRestore(
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
    (rows) => (db.insert(paymentPackagesTable) as any).values(rows).onConflictDoNothing()
  );

  // ── 6: discount_codes ─────────────────────────────────────────────────────────
  await bulkRestore(
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
    (rows) => (db.insert(discountCodesTable) as any).values(rows).onConflictDoNothing()
  );

  // ── 7: gift_codes ─────────────────────────────────────────────────────────────
  await bulkRestore(
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
    (rows) => (db.insert(giftCodesTable) as any).values(rows).onConflictDoNothing()
  );

  // ── 8: gift_code_redemptions ──────────────────────────────────────────────────
  await bulkRestore(
    "gift_code_redemptions", data.gift_code_redemptions ?? [],
    (r) => ({
      giftCodeId: n(r.giftCodeId ?? r.gift_code_id),
      userId:     n(r.userId    ?? r.user_id),
      createdAt:  dn(r.createdAt),
    }),
    (rows) => (db.insert(giftCodeRedemptionsTable) as any).values(rows).onConflictDoNothing()
  );

  // ── 9: payments ───────────────────────────────────────────────────────────────
  await bulkRestore(
    "payments", data.payments ?? [],
    (r) => ({
      userId:          n(r.userId         ?? r.user_id),
      packageId:       (r.packageId       ?? r.package_id)    ?? null,
      coins:           n(r.coins),
      price:           n(r.price),
      currency:        r.currency  ?? "IRT",
      method:          r.method    ?? "card",
      status:          r.status    ?? "pending",
      receiptFileId:   r.receiptFileId  ?? null,
      adminMessageId:  r.adminMessageId ?? null,
      adminChatId:     r.adminChatId    ?? null,
      approvedBy:      r.approvedBy     ?? null,
      discountCodeId:  r.discountCodeId ?? null,
      discountPercent: n(r.discountPercent),
      processedAt:     d(r.processedAt),
      createdAt:       dn(r.createdAt),
      updatedAt:       d(r.updatedAt),
    }),
    (rows) => (db.insert(paymentsTable) as any).values(rows).onConflictDoNothing()
  );

  // ── 10: coin_transactions ─────────────────────────────────────────────────────
  await bulkRestore(
    "coin_transactions", data.coin_transactions ?? [],
    (r) => ({
      userId:      n(r.userId      ?? r.user_id),
      amount:      n(r.amount),
      type:        r.type          ?? "payment",
      description: r.description  ?? null,
      createdAt:   dn(r.createdAt),
    }),
    (rows) => (db.insert(coinTransactionsTable) as any).values(rows).onConflictDoNothing()
  );

  // ── 11: group_chats ───────────────────────────────────────────────────────────
  await bulkRestore(
    "group_chats", data.group_chats ?? [],
    (r) => ({ ...r, createdAt: dn(r.createdAt) }),
    (rows) => (db.insert(groupChatsTable) as any).values(rows).onConflictDoNothing()
  );

  // ── 12: group_members ─────────────────────────────────────────────────────────
  await bulkRestore(
    "group_members", data.group_members ?? [],
    (r) => ({ ...r, joinedAt: dn(r.joinedAt) }),
    (rows) => (db.insert(groupMembersTable) as any).values(rows).onConflictDoNothing()
  );

  // ── 13: anonymous_messages ────────────────────────────────────────────────────
  await bulkRestore(
    "anonymous_messages", data.anonymous_messages ?? [],
    (r) => ({ ...r, createdAt: dn(r.createdAt) }),
    (rows) => (db.insert(anonymousMessagesTable) as any).values(rows).onConflictDoNothing()
  );

  // ── 14: bottle_messages ───────────────────────────────────────────────────────
  await bulkRestore(
    "bottle_messages", data.bottle_messages ?? [],
    (r) => ({ ...r, createdAt: dn(r.createdAt) }),
    (rows) => (db.insert(bottleMessagesTable) as any).values(rows).onConflictDoNothing()
  );

  // ── 15: chains ────────────────────────────────────────────────────────────────
  await bulkRestore(
    "chains", data.chains ?? [],
    (r) => ({ ...r, createdAt: dn(r.createdAt) }),
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
    (r) => ({ ...r, createdAt: dn(r.createdAt) }),
    (rows) => (db.insert(futureLettersTable) as any).values(rows).onConflictDoNothing()
  );

  // ── 18: reports ───────────────────────────────────────────────────────────────
  await bulkRestore(
    "reports", data.reports ?? [],
    (r) => ({ ...r, createdAt: dn(r.createdAt) }),
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
    (r) => ({ word: s(r.word), addedAt: dn(r.addedAt) }),
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
    (r) => ({ ...r, createdAt: dn(r.createdAt) }),
    (rows) => (db.insert(proAnonLinksTable) as any).values(rows).onConflictDoNothing()
  );

  // ── 24: tetrapay_transactions ─────────────────────────────────────────────────
  await bulkRestore(
    "tetrapay_transactions", data.tetrapay_transactions ?? [],
    (r) => ({
      paymentId:        n(r.paymentId       ?? r.payment_id),
      userId:           n(r.userId          ?? r.user_id),
      orderNumber:      s(r.orderNumber     ?? r.order_number),
      txnId:            (r.txnId            ?? r.txn_id)       ?? null,
      invoiceUrl:       (r.invoiceUrl       ?? r.invoice_url)  ?? null,
      amountIrt:        n(r.amountIrt       ?? r.amount_irt),
      status:           r.status            ?? "pending",
      callbackVerified: b(r.callbackVerified ?? r.callback_verified, false),
      verifiedAt:       d(r.verifiedAt      ?? r.verified_at),
      errorMessage:     (r.errorMessage     ?? r.error_message) ?? null,
      createdAt:        dn(r.createdAt),
    }),
    (rows) => (db.insert(tetraPayTransactionsTable) as any).values(rows).onConflictDoNothing()
  );

  // ── 25: plisio_transactions ───────────────────────────────────────────────────
  await bulkRestore(
    "plisio_transactions", data.plisio_transactions ?? [],
    (r) => ({
      paymentId:        n(r.paymentId        ?? r.payment_id),
      userId:           n(r.userId           ?? r.user_id),
      orderNumber:      s(r.orderNumber      ?? r.order_number),
      txnId:            (r.txnId             ?? r.txn_id)        ?? null,
      invoiceUrl:       (r.invoiceUrl        ?? r.invoice_url)   ?? null,
      amountUsd:        (r.amountUsd         ?? r.amount_usd)    ?? null,
      currency:         r.currency           ?? null,
      status:           r.status             ?? "pending",
      callbackVerified: b(r.callbackVerified  ?? r.callback_verified, false),
      verifiedAt:       d(r.verifiedAt        ?? r.verified_at),
      errorMessage:     (r.errorMessage      ?? r.error_message) ?? null,
      createdAt:        dn(r.createdAt),
    }),
    (rows) => (db.insert(plisioTransactionsTable) as any).values(rows).onConflictDoNothing()
  );

  return { success: errors.length === 0, restored, skipped, errors };
}
