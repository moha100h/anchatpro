import { Bot } from "grammy";
import type { BotContext } from "../context.js";
import { getUserByTelegramId, searchUser, getTotalStats, getAllUsers, getReferralTree } from "../services/user.service.js";
import { addCoins, deductCoins } from "../services/coin.service.js";
import { banUser, unbanUser, isOwner } from "../services/safety.service.js";
import { invalidateForceJoinCache } from "../middleware/force-join.js";
import { broadcastMessage } from "../services/broadcast.service.js";
import { generateVerificationCode, setBackupSchedule, sendBackup, verifyBackupGroup, getBackupConfig } from "../services/backup.service.js";
import { setSetting, getSetting } from "../services/payment.service.js";
import { getTetraPayCallbackUrl } from "../../lib/base-url.js";
import { getTotalChats } from "../services/matching.service.js";
import { getPendingReportsCount, addBadWord } from "../services/safety.service.js";
import { db } from "@workspace/db";
import { adminPermissionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { t } from "../i18n/index.js";
import { adminUserActionsKeyboard } from "../keyboards/inline.js";

// ─── Admin identity & permissions ────────────────────────────────────────────

/** Super admin IDs loaded from ADMIN_IDS env */
const SUPER_ADMIN_IDS = new Set<number>();

/** Sub-admins stored in DB: telegramId → level */
const SUB_ADMIN_IDS = new Map<number, "admin" | "moderator">();

export function setAdminIds(ids: number[]): void {
  ids.forEach((id) => SUPER_ADMIN_IDS.add(id));
}

async function loadSubAdmins(): Promise<void> {
  try {
    const rows = await db.select().from(adminPermissionsTable);
    SUB_ADMIN_IDS.clear();
    for (const row of rows) {
      SUB_ADMIN_IDS.set(Number(row.telegramId), row.level as "admin" | "moderator");
    }
  } catch {
    // Table may not exist before migration — safe to ignore on first run
  }
}

export function isAdmin(userId: number): boolean {
  return SUPER_ADMIN_IDS.has(userId) || SUB_ADMIN_IDS.has(userId);
}

function isSuperAdmin(userId: number): boolean {
  return SUPER_ADMIN_IDS.has(userId);
}

/** Moderators can only search, view reports, and ban. Regular admins get everything except manage_admins. Super admins get everything. */
function canDo(userId: number, action: string): boolean {
  if (SUPER_ADMIN_IDS.has(userId)) return true;
  const level = SUB_ADMIN_IDS.get(userId);
  if (!level) return false;
  if (level === "admin") return action !== "manage_admins";
  if (level === "moderator") return ["search_user", "ban_user"].includes(action);
  return false;
}

// ─── Register handlers ────────────────────────────────────────────────────────

export function registerAdminHandlers(bot: Bot<BotContext>): void {
  // Load sub-admins from DB at startup
  loadSubAdmins().catch(() => {});

  // ── /admin command ─────────────────────────────────────────────────────────
  bot.command("admin", async (ctx) => {
    const tgId = ctx.from!.id;
    if (!isAdmin(tgId)) return;
    const stats = await getTotalStats();
    const totalChats = await getTotalChats();
    const pendingReports = await getPendingReportsCount();

    const statsLine =
      `📊 *پنل مدیریت*\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `👥 کاربران: \`${stats.totalUsers}\`  |  💬 چت: \`${totalChats}\`\n` +
      `🚨 گزارش‌ها: \`${pendingReports}\`\n` +
      `━━━━━━━━━━━━━━━━━━━━━`;

    const buttons: Array<Array<{ text: string; callback_data: string }>> = [];

    // ─ 👥 کاربران ─
    const userRow: Array<{ text: string; callback_data: string }> = [
      { text: "🔍 جستجو کاربر", callback_data: "admin:search_user" },
    ];
    if (pendingReports > 0) userRow.push({ text: `🚨 گزارش‌ها (${pendingReports})`, callback_data: "admin:reports" });
    buttons.push(userRow);

    // ─ 💳 مالی ─
    if (canDo(tgId, "payment")) {
      buttons.push([
        { text: "💳 پرداخت", callback_data: "admin:payment_settings" },
        { text: "🔷 TetraPay", callback_data: "admin:tetrapay" },
      ]);
    }

    // ─ 📢 محتوا ─
    const contentRow: Array<{ text: string; callback_data: string }> = [];
    if (canDo(tgId, "broadcast"))   contentRow.push({ text: "📣 همگانی", callback_data: "admin:broadcast" });
    if (canDo(tgId, "welcome_msg")) contentRow.push({ text: "📝 خوشامد", callback_data: "admin:welcome_msg" });
    if (contentRow.length > 0) buttons.push(contentRow);

    // ─ 🛡️ امنیت ─
    const secRow: Array<{ text: string; callback_data: string }> = [];
    if (canDo(tgId, "badwords"))  secRow.push({ text: "🔤 کلمات ناپسند", callback_data: "admin:badwords" });
    if (isSuperAdmin(tgId))       secRow.push({ text: "📢 فورس جوین", callback_data: "admin:force_join" });
    if (secRow.length > 0) buttons.push(secRow);

    // ─ 🔮 دنیای اسرار ─
    if (canDo(tgId, "payment")) {
      buttons.push([{ text: "🔮 دنیای اسرار", callback_data: "admin:magic" }]);
    }

    // ─ ⚙️ سیستم ─
    const sysRow: Array<{ text: string; callback_data: string }> = [];
    if (canDo(tgId, "backup"))    sysRow.push({ text: "💾 بکاپ", callback_data: "admin:backup" });
    if (isSuperAdmin(tgId))       sysRow.push({ text: "👤 ادمین‌ها", callback_data: "admin:manage_admins" });
    if (sysRow.length > 0) buttons.push(sysRow);

    await ctx.reply(statsLine, { parse_mode: "Markdown", reply_markup: { inline_keyboard: buttons } });
  });

  // ── Search user ─────────────────────────────────────────────────────────────
  bot.callbackQuery("admin:search_user", async (ctx) => {
    if (!isAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery(); return; }
    ctx.session.adminAction = "search_user";
    await ctx.reply(t("fa").enterUserId);
    await ctx.answerCallbackQuery();
  });

  // ── Broadcast ───────────────────────────────────────────────────────────────
  bot.callbackQuery("admin:broadcast", async (ctx) => {
    if (!canDo(ctx.from!.id, "broadcast")) { await ctx.answerCallbackQuery("❌"); return; }
    ctx.session.adminAction = undefined;
    await ctx.reply("📢 هدف پیام را انتخاب کنید:", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "همه کاربران", callback_data: "bc_target:all" }],
          [{ text: "کاربران فعال (7 روز)", callback_data: "bc_target:active" }],
        ]
      }
    });
    await ctx.answerCallbackQuery();
  });

  // ── Backup ──────────────────────────────────────────────────────────────────
  bot.callbackQuery("admin:backup", async (ctx) => {
    if (!canDo(ctx.from!.id, "backup")) { await ctx.answerCallbackQuery("❌"); return; }
    const config = await getBackupConfig();
    const status = config?.isVerified ? `✅ تنظیم شده (گروه: ${config.chatId})` : "❌ تنظیم نشده";
    await ctx.reply(`💾 **تنظیمات بکاپ**\n\nوضعیت: ${status}`, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔑 کد تأیید جدید", callback_data: "backup:gencode" }],
          [{ text: "📤 ارسال بکاپ", callback_data: "backup:send" }],
          [{ text: "⏱️ تنظیم زمان‌بندی", callback_data: "backup:schedule" }],
        ]
      }
    });
    await ctx.answerCallbackQuery();
  });

  // ── Payment settings ────────────────────────────────────────────────────────
  bot.callbackQuery("admin:payment_settings", async (ctx) => {
    if (!canDo(ctx.from!.id, "payment")) { await ctx.answerCallbackQuery("❌"); return; }
    const cardNo = await getSetting("card_number") ?? "تنظیم نشده";
    const wallet = await getSetting("crypto_wallet") ?? "تنظیم نشده";
    const reviewGroup = await getSetting("payment_review_group") ?? "تنظیم نشده";
    const createCost = await getSetting("group_create_cost") ?? "3";
    await ctx.reply(
      `💳 **تنظیمات پرداخت**\n\n` +
      `شماره کارت: ${cardNo}\n` +
      `کیف ارز دیجیتال: ${wallet}\n` +
      `گروه بررسی: ${reviewGroup}\n` +
      `هزینه ساخت گروه: ${createCost} سکه`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "تنظیم شماره کارت", callback_data: "pay_set:card_number" }],
            [{ text: "تنظیم کیف ارز دیجیتال", callback_data: "pay_set:crypto_wallet" }],
            [{ text: "تنظیم گروه بررسی", callback_data: "pay_set:payment_review_group" }],
            [{ text: "تنظیم هزینه ساخت گروه", callback_data: "pay_set:group_create_cost" }],
            [{ text: "غیرفعال/فعال کارت", callback_data: "pay_toggle:card" }],
            [{ text: "غیرفعال/فعال کریپتو", callback_data: "pay_toggle:crypto" }],
          ]
        }
      }
    );
    await ctx.answerCallbackQuery();
  });

  // ── Referral & Group settings ────────────────────────────────────────────────
  bot.callbackQuery("admin:magic", async (ctx) => {
    if (!canDo(ctx.from!.id, "payment")) { await ctx.answerCallbackQuery("❌"); return; }

    const inviterReward   = await getSetting("referral_reward_inviter")   ?? "5";
    const inviteeReward   = await getSetting("referral_reward_invitee")   ?? "0";
    const supportLink     = await getSetting("support_link")               ?? "تنظیم نشده";
    const adminCost       = await getSetting("group_admin_promote_cost")   ?? "5";
    const expandCost      = await getSetting("group_expand_cost")          ?? "10";

    await ctx.reply(
      `🔮 **تنظیمات دنیای اسرار + گروه‌ها**\n\n` +
      `🎁 پاداش دعوت (دعوت‌کننده): **${inviterReward}** سکه\n` +
      `🎁 پاداش دعوت (دعوت‌شده): **${inviteeReward}** سکه\n` +
      `📞 لینک پشتیبانی: ${supportLink}\n` +
      `⭐ هزینه ارتقا ادمین گروه: **${adminCost}** سکه\n` +
      `⬆️ هزینه افزایش ظرفیت گروه: **${expandCost}** سکه`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🎁 پاداش دعوت‌کننده",  callback_data: "pay_set:referral_reward_inviter" }],
            [{ text: "🎁 پاداش دعوت‌شده",     callback_data: "pay_set:referral_reward_invitee" }],
            [{ text: "📞 لینک پشتیبانی",      callback_data: "pay_set:support_link" }],
            [{ text: "⭐ هزینه ارتقا ادمین",  callback_data: "pay_set:group_admin_promote_cost" }],
            [{ text: "⬆️ هزینه افزایش ظرفیت", callback_data: "pay_set:group_expand_cost" }],
          ]
        }
      }
    );
    await ctx.answerCallbackQuery();
  });

  // ── Bad words ────────────────────────────────────────────────────────────────
  bot.callbackQuery("admin:badwords", async (ctx) => {
    if (!canDo(ctx.from!.id, "badwords")) { await ctx.answerCallbackQuery("❌"); return; }
    ctx.session.adminAction = "add_badword";
    await ctx.reply("🔤 کلمه ناپسند را وارد کنید:");
    await ctx.answerCallbackQuery();
  });

  // ── Welcome message ──────────────────────────────────────────────────────────
  bot.callbackQuery("admin:welcome_msg", async (ctx) => {
    if (!canDo(ctx.from!.id, "welcome_msg")) { await ctx.answerCallbackQuery("❌"); return; }
    const current = await getSetting("welcome_message");
    const msgText = current
      ? t("fa").currentWelcomeMsg(current)
      : t("fa").noWelcomeMsg;
    await ctx.reply(msgText, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "✏️ تغییر پیام", callback_data: "admin:set_welcome" }],
          ...(current ? [[{ text: "🗑️ پاک کردن", callback_data: "admin:clear_welcome" }]] : []),
        ]
      }
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("admin:set_welcome", async (ctx) => {
    if (!canDo(ctx.from!.id, "welcome_msg")) { await ctx.answerCallbackQuery("❌"); return; }
    ctx.session.adminAction = "set_welcome_message";
    await ctx.reply(t("fa").setWelcomeMsgPrompt);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("admin:clear_welcome", async (ctx) => {
    if (!canDo(ctx.from!.id, "welcome_msg")) { await ctx.answerCallbackQuery("❌"); return; }
    await setSetting("welcome_message", "");
    await ctx.reply(t("fa").welcomeMsgCleared);
    await ctx.answerCallbackQuery("✅");
  });

  // ── Manage sub-admins (super admin only) ─────────────────────────────────────
  bot.callbackQuery("admin:manage_admins", async (ctx) => {
    if (!isSuperAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery("❌ دسترسی ندارید"); return; }

    const subAdmins = await db.select().from(adminPermissionsTable).catch(() => []);
    let msgText = t("fa").currentSubAdmins;
    const buttons: Array<Array<{ text: string; callback_data: string }>> = [];

    if (subAdmins.length === 0) {
      msgText += t("fa").noSubAdmins;
    } else {
      for (const sa of subAdmins) {
        const levelLabel = sa.level === "admin" ? t("fa").adminLevelAdmin : t("fa").adminLevelModerator;
        const display = sa.username ? `@${sa.username}` : `ID:${sa.telegramId}`;
        msgText += `• ${display} — ${levelLabel}\n`;
        buttons.push([{ text: `❌ حذف ${sa.telegramId}`, callback_data: `admin_perm_remove:${sa.telegramId}` }]);
      }
    }

    buttons.push([{ text: t("fa").addSubAdmin, callback_data: "admin:add_sub_admin" }]);

    await ctx.reply(msgText, { parse_mode: "Markdown", reply_markup: { inline_keyboard: buttons } });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("admin:add_sub_admin", async (ctx) => {
    if (!isSuperAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery("❌"); return; }
    ctx.session.adminAction = "add_sub_admin";
    await ctx.reply(t("fa").enterAdminId);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^admin_perm_level:(\d+):(admin|moderator)$/, async (ctx) => {
    if (!isSuperAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery("❌"); return; }
    const uid = parseInt(ctx.match![1], 10);
    const level = ctx.match![2] as "admin" | "moderator";

    if (SUPER_ADMIN_IDS.has(uid)) {
      await ctx.editMessageText("⚠️ این کاربر سوپر ادمین است و نمی‌توان سطح دسترسی جدیدی اضافه کرد.");
      await ctx.answerCallbackQuery();
      return;
    }

    try {
      await db.insert(adminPermissionsTable).values({
        telegramId: uid,
        level,
        addedBy: ctx.from!.id,
        createdAt: new Date(),
      }).onConflictDoNothing();
      SUB_ADMIN_IDS.set(uid, level);
      const levelLabel = level === "admin" ? t("fa").adminLevelAdmin : t("fa").adminLevelModerator;
      await ctx.editMessageText(t("fa").adminAdded(uid, levelLabel));
    } catch {
      await ctx.editMessageText("❌ خطا در اضافه کردن ادمین.");
    }
    await ctx.answerCallbackQuery("✅");
  });

  bot.callbackQuery(/^admin_perm_remove:(\d+)$/, async (ctx) => {
    if (!isSuperAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery("❌"); return; }
    const uid = parseInt(ctx.match![1], 10);

    await db.delete(adminPermissionsTable).where(eq(adminPermissionsTable.telegramId, uid)).catch(() => {});
    SUB_ADMIN_IDS.delete(uid);
    await ctx.reply(t("fa").adminRemoved(uid));
    await ctx.answerCallbackQuery("✅");
  });

  // ── Backup sub-actions ───────────────────────────────────────────────────────
  bot.callbackQuery("backup:gencode", async (ctx) => {
    if (!isAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery(); return; }
    const code = await generateVerificationCode();
    await ctx.reply(`🔑 **کد تأیید بکاپ:**\n\n\`${code}\`\n\nربات را به گروه مورد نظر اضافه کنید و این دستور را بفرستید:\n\`/verify_backup ${code}\``, { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("backup:send", async (ctx) => {
    if (!isAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery(); return; }
    await ctx.answerCallbackQuery("در حال ارسال...");
    const success = await sendBackup(bot);
    await ctx.reply(success ? t("fa").backupSent : t("fa").backupFailed);
  });

  bot.callbackQuery("backup:schedule", async (ctx) => {
    if (!isAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery(); return; }
    ctx.session.adminAction = "set_backup_schedule";
    await ctx.reply("⏱️ فاصله بکاپ را به ساعت وارد کنید (مثلاً 24):");
    await ctx.answerCallbackQuery();
  });

  bot.command("verify_backup", async (ctx) => {
    const code = ctx.match?.trim();
    if (!code) return;
    const chatId = ctx.chat.id;
    const verified = await verifyBackupGroup(chatId, code);
    await ctx.reply(verified ? "✅ گروه بکاپ با موفقیت تأیید شد!" : "❌ کد نادرست است.");
  });

  // ── Payment setting shortcuts ────────────────────────────────────────────────
  bot.callbackQuery(/^pay_set:(.+)$/, async (ctx) => {
    if (!canDo(ctx.from!.id, "payment")) { await ctx.answerCallbackQuery("❌"); return; }
    const key = ctx.match![1];
    ctx.session.adminAction = `set_setting:${key}`;
    const labels: Record<string, string> = {
      card_number: "شماره کارت",
      crypto_wallet: "آدرس کیف پول",
      payment_review_group: "آیدی گروه بررسی",
      group_create_cost: "هزینه ساخت گروه (سکه)",
    };
    await ctx.reply(`${labels[key] ?? key} را وارد کنید:`);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^pay_toggle:(card|crypto|gateway)$/, async (ctx) => {
    if (!canDo(ctx.from!.id, "payment")) { await ctx.answerCallbackQuery("❌"); return; }
    const method = ctx.match![1];
    const key = `payment_method_${method}`;
    const current = await getSetting(key);
    const newVal = current === "disabled" ? "enabled" : "disabled";
    await setSetting(key, newVal);
    await ctx.reply(`✅ روش ${method}: ${newVal}`);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^bc_target:(all|active)$/, async (ctx) => {
    if (!canDo(ctx.from!.id, "broadcast")) { await ctx.answerCallbackQuery("❌"); return; }
    const target = ctx.match![1] as "all" | "active";
    ctx.session.adminAction = `broadcast:${target}`;
    await ctx.reply(`✅ هدف: ${target === "all" ? "همه" : "فعال"}\n\nمتن پیام را بنویسید:`);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^admin_addcoins:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery(); return; }
    ctx.session.adminAction = `add_coins:${ctx.match![1]}`;
    await ctx.reply(t("fa").enterAmount);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^admin_removecoins:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery(); return; }
    ctx.session.adminAction = `remove_coins:${ctx.match![1]}`;
    await ctx.reply(t("fa").enterAmount);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^admin_ban:(\d+)$/, async (ctx) => {
    if (!canDo(ctx.from!.id, "ban_user")) { await ctx.answerCallbackQuery("❌"); return; }
    const uid = parseInt(ctx.match![1], 10);
    if (isOwner(uid)) {
      await ctx.answerCallbackQuery(t("fa").adminCannotBanOwner);
      return;
    }
    const result = await banUser(uid, ctx.from!.id);
    if (!result.success) {
      await ctx.answerCallbackQuery(`❌ ${result.reason ?? "Cannot ban"}`);
      return;
    }
    await ctx.editMessageText(t("fa").adminUserBanned(uid), { reply_markup: undefined });
    await bot.api.sendMessage(uid, t("fa").userBanned).catch(() => { return; });
    await ctx.answerCallbackQuery("✅");
  });

  bot.callbackQuery(/^admin_unban:(\d+)$/, async (ctx) => {
    if (!canDo(ctx.from!.id, "ban_user")) { await ctx.answerCallbackQuery("❌"); return; }
    const uid = parseInt(ctx.match![1], 10);
    await unbanUser(uid);
    await ctx.editMessageText(t("fa").adminUserUnbanned(uid), { reply_markup: undefined });
    await ctx.answerCallbackQuery("✅");
  });

  bot.callbackQuery(/^admin_reftree:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery(); return; }
    const uid = parseInt(ctx.match![1], 10);
    const tree = await getReferralTree(uid);
    if (tree.length === 0) {
      await ctx.reply("🌳 کاربری دعوت نشده.");
    } else {
      let msg = "🌳 **درخت ارجاع:**\n\n";
      for (const node of tree) {
        msg += `${"  ".repeat(node.level - 1)}└ Level ${node.level}: ${node.user.firstName} (${node.user.telegramId}) — 💰${node.user.coins}\n`;
      }
      await ctx.reply(msg, { parse_mode: "Markdown" });
    }
    await ctx.answerCallbackQuery();
  });

  // ── TetraPay settings ───────────────────────────────────────────────────────
  bot.callbackQuery("admin:tetrapay", async (ctx) => {
    if (!canDo(ctx.from!.id, "payment")) { await ctx.answerCallbackQuery("❌"); return; }
    const apiKey = await getSetting("tetrapay_api_key");
    const callbackUrl = await getSetting("tetrapay_callback_url");
    await ctx.reply(
      t("fa").tetraPayStatus(!!apiKey, callbackUrl ?? null),
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: t("fa").setApiKey, callback_data: "pay_set:tetrapay_api_key" }],
            [{ text: t("fa").autoDetectCallbackUrl, callback_data: "tetrapay:auto_url" }],
            [{ text: t("fa").setCallbackUrl, callback_data: "pay_set:tetrapay_callback_url" }],
            [{ text: "غیرفعال/فعال درگاه", callback_data: "pay_toggle:gateway" }],
          ]
        }
      }
    );
    await ctx.answerCallbackQuery();
  });

  // ── 🌊 Magic features settings ────────────────────────────────────────────
  bot.callbackQuery("admin:magic", async (ctx) => {
    if (!canDo(ctx.from!.id, "payment")) { await ctx.answerCallbackQuery("❌"); return; }
    const features = ["bottle", "chain", "letter", "frequency"] as const;
    const cfgs: Record<string, { enabled: boolean; cost: number; daily: number }> = {};
    for (const f of features) {
      const [en, co, da] = await Promise.all([
        getSetting(`magic_${f}_enabled`),
        getSetting(`magic_${f}_cost`),
        getSetting(`magic_${f}_daily`),
      ]);
      cfgs[f] = {
        enabled: (en ?? "true") !== "false",
        cost: parseInt(co ?? "2", 10),
        daily: parseInt(da ?? "3", 10),
      };
    }
    await ctx.reply(
      t("fa").adminMagicPanel(cfgs as any),
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🍾 پیام در بطری",   callback_data: "magic_cfg:bottle" }],
            [{ text: "🔗 زنجیر احساس",   callback_data: "magic_cfg:chain" }],
            [{ text: "✉️ نامه به آینده",  callback_data: "magic_cfg:letter" }],
            [{ text: "📡 فرکانس ناشناس", callback_data: "magic_cfg:frequency" }],
          ],
        },
      }
    );
    await ctx.answerCallbackQuery();
  });

  const MAGIC_NAMES: Record<string, string> = {
    bottle: "🍾 پیام در بطری",
    chain: "🔗 زنجیر احساس",
    letter: "✉️ نامه به آینده",
    frequency: "📡 فرکانس ناشناس",
  };

  bot.callbackQuery(/^magic_cfg:(.+)$/, async (ctx) => {
    if (!canDo(ctx.from!.id, "payment")) { await ctx.answerCallbackQuery("❌"); return; }
    const feature = ctx.match[1]!;
    const [en, co, da] = await Promise.all([
      getSetting(`magic_${feature}_enabled`),
      getSetting(`magic_${feature}_cost`),
      getSetting(`magic_${feature}_daily`),
    ]);
    const enabled = (en ?? "true") !== "false";
    const cost    = parseInt(co ?? "2", 10);
    const daily   = parseInt(da ?? "3", 10);
    const name    = MAGIC_NAMES[feature] ?? feature;
    await ctx.reply(
      t("fa").adminMagicFeaturePanel(name, enabled, cost, daily),
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: enabled ? "❌ غیرفعال کردن" : "✅ فعال کردن", callback_data: `magic_toggle:${feature}` }],
            [{ text: "💰 تغییر هزینه سکه",          callback_data: `magic_set:cost:${feature}` }],
            [{ text: "📅 تغییر محدودیت روزانه",       callback_data: `magic_set:daily:${feature}` }],
          ],
        },
      }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^magic_toggle:(.+)$/, async (ctx) => {
    if (!canDo(ctx.from!.id, "payment")) { await ctx.answerCallbackQuery("❌"); return; }
    const feature = ctx.match[1]!;
    const current = (await getSetting(`magic_${feature}_enabled`) ?? "true") !== "false";
    await setSetting(`magic_${feature}_enabled`, current ? "false" : "true");
    await ctx.answerCallbackQuery(current ? "❌ غیرفعال شد" : "✅ فعال شد");
    await ctx.reply(`${current ? "❌ غیرفعال" : "✅ فعال"} شد: ${MAGIC_NAMES[feature] ?? feature}`);
  });

  bot.callbackQuery(/^magic_set:(cost|daily):(.+)$/, async (ctx) => {
    if (!canDo(ctx.from!.id, "payment")) { await ctx.answerCallbackQuery("❌"); return; }
    const type    = ctx.match[1]!;
    const feature = ctx.match[2]!;
    const label   = type === "cost" ? "هزینه سکه (عدد)" : "محدودیت روزانه (عدد)";
    ctx.session.adminAction = `set_setting:magic_${feature}_${type}`;
    await ctx.reply(`🔢 مقدار جدید ${label} برای ${MAGIC_NAMES[feature] ?? feature} را وارد کنید:`);
    await ctx.answerCallbackQuery();
  });

  // ── TetraPay: auto-detect callback URL ────────────────────────────────────
  bot.callbackQuery("tetrapay:auto_url", async (ctx) => {
    if (!canDo(ctx.from!.id, "payment")) { await ctx.answerCallbackQuery("❌"); return; }
    const url = getTetraPayCallbackUrl();
    await setSetting("tetrapay_callback_url", url);
    await ctx.answerCallbackQuery("✅ URL تنظیم شد");
    await ctx.reply(t("fa").callbackUrlAutoSet(url), { parse_mode: "Markdown" });
  });

  // ── Force Join settings (super admin only) ────────────────────────────────────
  bot.callbackQuery("admin:force_join", async (ctx) => {
    if (!isSuperAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery("❌"); return; }
    const enabled = (await getSetting("force_join_enabled")) === "true";
    const channel = await getSetting("force_join_channel");
    await ctx.reply(
      t("fa").forceJoinStatus(enabled, channel),
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: t("fa").toggleForceJoin, callback_data: "fj:toggle" }],
            [{ text: t("fa").setForceJoinChannel, callback_data: "fj:set_channel" }],
          ]
        }
      }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("fj:toggle", async (ctx) => {
    if (!isSuperAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery("❌"); return; }
    const current = (await getSetting("force_join_enabled")) === "true";
    await setSetting("force_join_enabled", current ? "false" : "true");
    invalidateForceJoinCache();
    await ctx.reply(current ? t("fa").forceJoinDisabled : t("fa").forceJoinEnabled);
    await ctx.answerCallbackQuery("✅");
  });

  bot.callbackQuery("fj:set_channel", async (ctx) => {
    if (!isSuperAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery("❌"); return; }
    ctx.session.adminAction = "set_force_join_channel";
    await ctx.reply(t("fa").forceJoinEnterChannel);
    await ctx.answerCallbackQuery();
  });

  // ── Handle admin text inputs ─────────────────────────────────────────────────
  bot.on("message:text", async (ctx, next) => {
    const tgId = ctx.from!.id;
    if (!isAdmin(tgId)) return next();
    const action = ctx.session.adminAction;
    if (!action) return next();

    const text = ctx.message.text.trim();
    ctx.session.adminAction = undefined;

    if (action === "search_user") {
      const uid = parseInt(text, 10);
      const user = await searchUser(uid);
      if (!user) { await ctx.reply(t("fa").adminNotFound); return; }
      await ctx.reply(t("fa").adminUserInfo(user), {
        parse_mode: "Markdown",
        reply_markup: adminUserActionsKeyboard(user.telegramId, "fa", user.status === "banned"),
      });
      return;
    }

    if (action === "add_sub_admin") {
      const uid = parseInt(text, 10);
      if (isNaN(uid)) { await ctx.reply("❌ آیدی نامعتبر."); return; }
      if (SUPER_ADMIN_IDS.has(uid)) { await ctx.reply("⚠️ این کاربر سوپر ادمین است."); return; }
      if (SUB_ADMIN_IDS.has(uid)) { await ctx.reply(t("fa").adminAlreadyExists); return; }
      await ctx.reply(t("fa").selectAdminLevel, {
        reply_markup: {
          inline_keyboard: [
            [{ text: `مدیر کامل (${t("fa").adminLevelAdmin})`, callback_data: `admin_perm_level:${uid}:admin` }],
            [{ text: `ناظر (${t("fa").adminLevelModerator})`, callback_data: `admin_perm_level:${uid}:moderator` }],
          ]
        }
      });
      return;
    }

    if (action === "set_welcome_message") {
      if (text === "0") {
        await setSetting("welcome_message", "");
        await ctx.reply(t("fa").welcomeMsgCleared);
      } else {
        await setSetting("welcome_message", text);
        await ctx.reply(t("fa").welcomeMsgSet);
      }
      return;
    }

    if (action.startsWith("add_coins:")) {
      const uid = parseInt(action.replace("add_coins:", ""), 10);
      const amount = parseInt(text, 10);
      if (isNaN(amount) || amount <= 0) { await ctx.reply("❌ مقدار نامعتبر"); return; }
      await addCoins(uid, amount, "admin_add", `Admin added by ${tgId}`);
      await ctx.reply(t("fa").adminCoinsAdded(amount, uid));
      await bot.api.sendMessage(uid, `💰 ادمین ${amount} سکه به حساب شما اضافه کرد!`).catch(() => { return; });
      return;
    }

    if (action.startsWith("remove_coins:")) {
      const uid = parseInt(action.replace("remove_coins:", ""), 10);
      const amount = parseInt(text, 10);
      if (isNaN(amount) || amount <= 0) { await ctx.reply("❌ مقدار نامعتبر"); return; }
      await deductCoins(uid, amount, "admin_remove", `Admin removed by ${tgId}`);
      await ctx.reply(t("fa").adminCoinsRemoved(amount, uid));
      return;
    }

    if (action.startsWith("set_setting:")) {
      const key = action.replace("set_setting:", "");
      await setSetting(key, text);
      await ctx.reply(`✅ تنظیم شد: ${key} = ${text}`);
      return;
    }

    if (action === "set_backup_schedule") {
      const hours = parseInt(text, 10);
      if (isNaN(hours) || hours < 1) { await ctx.reply("❌ مقدار نامعتبر"); return; }
      await setBackupSchedule(hours);
      await ctx.reply(`✅ بکاپ هر ${hours} ساعت.`);
      return;
    }

    if (action.startsWith("broadcast:")) {
      const target = action.replace("broadcast:", "") as "all" | "active";
      await ctx.reply(`📢 در حال ارسال...`);
      const { sent, failed } = await broadcastMessage(bot, tgId, text, target);
      await ctx.reply(t("fa").adminBroadcastSent(sent) + ` (${failed} خطا)`);
      return;
    }

    if (action === "add_badword") {
      await addBadWord(text);
      await ctx.reply(`✅ کلمه "${text}" اضافه شد.`);
      return;
    }

    if (action === "set_force_join_channel") {
      const channel = text.startsWith("@") ? text : `@${text}`;
      await setSetting("force_join_channel", channel);
      invalidateForceJoinCache();
      await ctx.reply(t("fa").forceJoinChannelSet(channel));
      return;
    }

    return next();
  });
}
