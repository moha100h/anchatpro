import { Bot } from "grammy";
import type { BotContext } from "../context.js";
import { getUserByTelegramId } from "../services/user.service.js";
import { getBalance, getCoinHistory, getReferralStats } from "../services/coin.service.js";
import { getPackages, createPayment, submitReceipt, getSetting, isMethodEnabled, getPendingPayment, setAdminMessageId } from "../services/payment.service.js";
import { t } from "../i18n/index.js";
import { mainMenuKeyboard, cancelKeyboard } from "../keyboards/main.js";
import { packagesKeyboard, paymentMethodKeyboard, paymentReviewKeyboard } from "../keyboards/inline.js";

export function registerCoinHandlers(bot: Bot<BotContext>) {
  // Coins menu
  bot.hears([/^💰 سکه‌های من/, /^💰 My Coins/], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";
    const balance = await getBalance(tgId);
    const history = await getCoinHistory(tgId, 5);

    let msg = t(lang).coinsBalance(balance) + "\n\n";
    if (history.length > 0) {
      msg += "📋 " + (lang === "fa" ? "آخرین تراکنش‌ها:" : "Recent transactions:") + "\n";
      for (const tx of history) {
        const sign = tx.amount > 0 ? "+" : "";
        msg += `${sign}${tx.amount} — ${tx.description ?? tx.type}\n`;
      }
    }

    const buyBtn = lang === "fa" ? "🛒 خرید سکه" : "🛒 Buy Coins";
    await ctx.reply(msg, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{ text: buyBtn, callback_data: "buy_coins" }]]
      }
    });
  });

  // Buy coins
  bot.callbackQuery("buy_coins", async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";

    const packages = await getPackages();
    if (packages.length === 0) {
      await ctx.answerCallbackQuery(lang === "fa" ? "بسته‌ای موجود نیست" : "No packages available");
      return;
    }
    await ctx.editMessageText(t(lang).selectPackage, { reply_markup: packagesKeyboard(packages, lang) });
    await ctx.answerCallbackQuery();
  });

  // Package selected
  bot.callbackQuery(/^pkg:(\d+)$/, async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";
    const pkgId = parseInt(ctx.match![1], 10);

    ctx.session.pendingPaymentPackageId = pkgId;

    const enabled = {
      card: await isMethodEnabled("card"),
      crypto: await isMethodEnabled("crypto"),
      gateway: await isMethodEnabled("gateway"),
    };

    await ctx.editMessageText(t(lang).selectPaymentMethod, { reply_markup: paymentMethodKeyboard(lang, enabled) });
    await ctx.answerCallbackQuery();
  });

  // Payment method selected
  bot.callbackQuery(/^pay_method:(card|crypto|gateway)$/, async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";
    const method = ctx.match![1] as "card" | "crypto" | "gateway";
    const pkgId = ctx.session.pendingPaymentPackageId;

    if (!pkgId) { await ctx.answerCallbackQuery(); return; }

    const payment = await createPayment(tgId, pkgId, method);
    ctx.session.pendingPaymentMethod = method;

    if (method === "gateway") {
      await ctx.editMessageText(t(lang).gatewayUnavailable);
    } else if (method === "card") {
      const cardNo = await getSetting("card_number") ?? "6219-8610-0000-0000";
      const info = t(lang).cardPaymentInfo(cardNo, payment.price);
      await ctx.editMessageText(info, { parse_mode: "Markdown" });
      await ctx.reply(t(lang).uploadReceipt, { reply_markup: cancelKeyboard(lang) });
    } else if (method === "crypto") {
      const wallet = await getSetting("crypto_wallet") ?? "TXxxxx...";
      const amount = `${payment.price} USDT`;
      const info = t(lang).cryptoPaymentInfo(wallet, amount);
      await ctx.editMessageText(info, { parse_mode: "Markdown" });
      await ctx.reply(t(lang).uploadReceipt, { reply_markup: cancelKeyboard(lang) });
    }

    await ctx.answerCallbackQuery();
  });

  // Upload receipt (photo)
  bot.on("message:photo", async (ctx, next) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";

    const pendingPayment = await getPendingPayment(tgId);
    if (!pendingPayment) return next();

    const fileId = ctx.message.photo.at(-1)!.file_id;
    await submitReceipt(pendingPayment.id, fileId);
    await ctx.reply(t(lang).receiptSubmitted, { reply_markup: mainMenuKeyboard(lang) });

    // Send to admin review group
    const adminGroupId = await getSetting("payment_review_group");
    if (adminGroupId) {
      const groupId = parseInt(adminGroupId, 10);
      const reviewText = t(lang).paymentReviewMsg(pendingPayment);
      const msg = await bot.api.sendPhoto(groupId, fileId, {
        caption: reviewText,
        reply_markup: paymentReviewKeyboard(pendingPayment.id, "fa"),
        parse_mode: "Markdown",
      }).catch(() => null);
      if (msg) await setAdminMessageId(pendingPayment.id, msg.message_id, groupId);
    }
  });

  // Admin approve payment
  bot.callbackQuery(/^pay_approve:(\d+)$/, async (ctx) => {
    const paymentId = parseInt(ctx.match![1], 10);
    const adminId = ctx.from!.id;

    const { approvePayment } = await import("../services/payment.service.js");
    const payment = await approvePayment(paymentId, adminId);

    if (!payment) {
      await ctx.editMessageCaption({ caption: t("fa").paymentAlreadyProcessed });
      await ctx.answerCallbackQuery();
      return;
    }

    await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    await ctx.editMessageCaption({ caption: `✅ تأیید شد — ${payment.coins} سکه — کاربر ${payment.userId}` });

    const userTgId = payment.userId;
    const userRecord = await getUserByTelegramId(userTgId);
    const uLang = (userRecord?.language as "fa" | "en") ?? "fa";
    await bot.api.sendMessage(userTgId, t(uLang).paymentApproved(payment.coins)).catch(() => {});
    await ctx.answerCallbackQuery("✅");
  });

  // Admin reject payment
  bot.callbackQuery(/^pay_reject:(\d+)$/, async (ctx) => {
    const paymentId = parseInt(ctx.match![1], 10);
    const adminId = ctx.from!.id;

    const { rejectPayment } = await import("../services/payment.service.js");
    const payment = await rejectPayment(paymentId, adminId);

    if (!payment) {
      await ctx.editMessageCaption({ caption: t("fa").paymentAlreadyProcessed });
      await ctx.answerCallbackQuery();
      return;
    }

    await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    await ctx.editMessageCaption({ caption: `❌ رد شد — کاربر ${payment.userId}` });

    const userRecord = await getUserByTelegramId(payment.userId);
    const uLang = (userRecord?.language as "fa" | "en") ?? "fa";
    await bot.api.sendMessage(payment.userId, t(uLang).paymentRejected).catch(() => {});
    await ctx.answerCallbackQuery("❌");
  });

  // Referral
  bot.hears([/^🎁 دعوت/, /^🎁 Invite/], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";
    const botUsername = process.env["BOT_USERNAME"] ?? "bot";
    const link = `https://t.me/${botUsername}?start=ref_${user.referralCode}`;
    const stats = await getReferralStats(tgId);
    await ctx.reply(t(lang).referralInfo(user.referralCode, link, stats.total, stats.coinsEarned), {
      parse_mode: "Markdown"
    });
  });
}
