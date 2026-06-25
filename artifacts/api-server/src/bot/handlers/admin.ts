import { Bot } from "grammy";
import type { BotContext } from "../context.js";
import { getUserByTelegramId, searchUser, getTotalStats, getAllUsers, getReferralTree } from "../services/user.service.js";
import { addCoins, deductCoins } from "../services/coin.service.js";
import { banUser, unbanUser } from "../services/safety.service.js";
import { broadcastMessage } from "../services/broadcast.service.js";
import { generateVerificationCode, setBackupSchedule, sendBackup, verifyBackupGroup, getBackupConfig } from "../services/backup.service.js";
import { setSetting, getSetting } from "../services/payment.service.js";
import { getTotalChats } from "../services/matching.service.js";
import { getPendingReportsCount, addBadWord } from "../services/safety.service.js";
import { t } from "../i18n/index.js";
import { adminUserActionsKeyboard } from "../keyboards/inline.js";

const ADMIN_IDS = new Set<number>();

export function setAdminIds(ids: number[]): void {
  ids.forEach(id => ADMIN_IDS.add(id));
}

function isAdmin(userId: number): boolean {
  return ADMIN_IDS.has(userId);
}

export function registerAdminHandlers(bot: Bot<BotContext>): void {
  bot.command("admin", async (ctx) => {
    const tgId = ctx.from!.id;
    if (!isAdmin(tgId)) return;
    const stats = await getTotalStats();
    const totalChats = await getTotalChats();
    const pendingReports = await getPendingReportsCount();
    const msg = t("fa").adminStats({ ...stats, totalChats, pendingReports });
    await ctx.reply(msg, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "👤 جستجو کاربر", callback_data: "admin:search_user" }],
          [{ text: "📢 ارسال همگانی", callback_data: "admin:broadcast" }],
          [{ text: "💾 تنظیمات بکاپ", callback_data: "admin:backup" }],
          [{ text: "💳 تنظیمات پرداخت", callback_data: "admin:payment_settings" }],
          [{ text: "🔤 کلمات ناپسند", callback_data: "admin:badwords" }],
        ]
      }
    });
  });

  bot.callbackQuery("admin:search_user", async (ctx) => {
    if (!isAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery(); return; }
    ctx.session.adminAction = "search_user";
    await ctx.reply(t("fa").enterUserId);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("admin:broadcast", async (ctx) => {
    if (!isAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery(); return; }
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

  bot.callbackQuery("admin:backup", async (ctx) => {
    if (!isAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery(); return; }
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

  bot.callbackQuery("admin:payment_settings", async (ctx) => {
    if (!isAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery(); return; }
    const cardNo = await getSetting("card_number") ?? "تنظیم نشده";
    const wallet = await getSetting("crypto_wallet") ?? "تنظیم نشده";
    const reviewGroup = await getSetting("payment_review_group") ?? "تنظیم نشده";
    await ctx.reply(`💳 **تنظیمات پرداخت**\n\nشماره کارت: ${cardNo}\nکیف ارز دیجیتال: ${wallet}\nگروه بررسی: ${reviewGroup}`, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "تنظیم شماره کارت", callback_data: "pay_set:card_number" }],
          [{ text: "تنظیم کیف ارز دیجیتال", callback_data: "pay_set:crypto_wallet" }],
          [{ text: "تنظیم گروه بررسی", callback_data: "pay_set:payment_review_group" }],
          [{ text: "غیرفعال/فعال کارت", callback_data: "pay_toggle:card" }],
          [{ text: "غیرفعال/فعال کریپتو", callback_data: "pay_toggle:crypto" }],
        ]
      }
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("admin:badwords", async (ctx) => {
    if (!isAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery(); return; }
    ctx.session.adminAction = "add_badword";
    await ctx.reply("🔤 کلمه ناپسند را وارد کنید:");
    await ctx.answerCallbackQuery();
  });

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

  bot.callbackQuery(/^pay_set:(.+)$/, async (ctx) => {
    if (!isAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery(); return; }
    const key = ctx.match![1];
    ctx.session.adminAction = `set_setting:${key}`;
    const labels: Record<string, string> = {
      card_number: "شماره کارت",
      crypto_wallet: "آدرس کیف پول",
      payment_review_group: "آیدی گروه بررسی",
    };
    await ctx.reply(`${labels[key] ?? key} را وارد کنید:`);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^pay_toggle:(card|crypto|gateway)$/, async (ctx) => {
    if (!isAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery(); return; }
    const method = ctx.match![1];
    const key = `payment_method_${method}`;
    const current = await getSetting(key);
    const newVal = current === "disabled" ? "enabled" : "disabled";
    await setSetting(key, newVal);
    await ctx.reply(`✅ روش ${method}: ${newVal}`);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^bc_target:(all|active)$/, async (ctx) => {
    if (!isAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery(); return; }
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
    if (!isAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery(); return; }
    const uid = parseInt(ctx.match![1], 10);
    await banUser(uid);
    await ctx.editMessageText(t("fa").adminUserBanned(uid), { reply_markup: undefined });
    await bot.api.sendMessage(uid, t("fa").userBanned).catch(() => { return; });
    await ctx.answerCallbackQuery("✅");
  });

  bot.callbackQuery(/^admin_unban:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery(); return; }
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

  // Handle admin text inputs
  bot.on("message:text", async (ctx, next) => {
    const tgId = ctx.from!.id;
    if (!isAdmin(tgId)) { return next(); }
    const action = ctx.session.adminAction;
    if (!action) { return next(); }

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

    return next();
  });
}
