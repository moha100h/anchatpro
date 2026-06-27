import { Bot, InlineKeyboard } from "grammy";
import type { BotContext } from "../context.js";
import { getUserByTelegramId } from "../services/user.service.js";
import { getBalance, getCoinHistory, getReferralStats } from "../services/coin.service.js";
import {
  getPackages,
  createPayment,
  submitReceipt,
  getSetting,
  isMethodEnabled,
  getPendingPayment,
  setAdminMessageId,
  cancelPayment,
} from "../services/payment.service.js";
import { createTetraPayOrder } from "../services/tetrapay.service.js";
import { t } from "../i18n/index.js";
import { mainMenuKeyboard } from "../keyboards/main.js";
import { packagesKeyboard, paymentMethodKeyboard, paymentReviewKeyboard } from "../keyboards/inline.js";

/** Build a Trust Wallet deep-link for USDT TRC20 */
function buildTrustWalletLink(wallet: string, amountUsdt: number): string {
  const encoded = encodeURIComponent(wallet);
  return (
    `https://link.trustwallet.com/send` +
    `?coin=10001_0xa614f803B6FD780986A42c78Ec9c7f77e6DeD13` +
    `&address=${encoded}` +
    `&amount=${amountUsdt}`
  );
}

export function registerCoinHandlers(bot: Bot<BotContext>) {
  // ─── Cancel handler (pending payment) ─────────────────────────────────────
  // Fires AFTER matching.ts cancel handler (which already called next() if not in queue).
  // If a pending payment exists, cancel it and show main menu.
  // Otherwise pass to the next cancel handler (settings.ts).
  bot.hears([/^❌ لغو/, /^❌ Cancel/], async (ctx, next) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return next();
    const lang = (user.language as "fa" | "en") ?? "fa";

    const pendingPayment = await getPendingPayment(tgId);
    if (pendingPayment) {
      await cancelPayment(pendingPayment.id);
      ctx.session.pendingPaymentPackageId = undefined;
      ctx.session.pendingPaymentMethod = undefined;
      await ctx.reply(t(lang).paymentCancelled, { reply_markup: mainMenuKeyboard(lang) });
      return; // handled
    }

    return next();
  });

  // ─── My Coins menu ────────────────────────────────────────────────────────
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
      reply_markup: new InlineKeyboard().text(buyBtn, "buy_coins"),
    });
  });

  // ─── Buy coins (inline) ──────────────────────────────────────────────────
  bot.callbackQuery("buy_coins", async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";

    const packages = await getPackages();
    if (packages.length === 0) {
      await ctx.answerCallbackQuery(lang === "fa" ? "بسته‌ای موجود نیست" : "No packages available");
      return;
    }
    await ctx.editMessageText(t(lang).selectPackage, {
      reply_markup: packagesKeyboard(packages, lang),
    });
    await ctx.answerCallbackQuery();
  });

  // ─── Package selected ────────────────────────────────────────────────────
  bot.callbackQuery(/^pkg:(\d+)$/, async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";
    const pkgId = parseInt(ctx.match![1], 10);

    ctx.session.pendingPaymentPackageId = pkgId;

    const enabled = {
      card:    await isMethodEnabled("card"),
      crypto:  await isMethodEnabled("crypto"),
      gateway: await isMethodEnabled("gateway"),
    };

    await ctx.editMessageText(t(lang).selectPaymentMethod, {
      reply_markup: paymentMethodKeyboard(lang, enabled),
    });
    await ctx.answerCallbackQuery();
  });

  // ─── Payment method selected ──────────────────────────────────────────────
  bot.callbackQuery(/^pay_method:(card|crypto|gateway)$/, async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";
    const method = ctx.match![1] as "card" | "crypto" | "gateway";
    const pkgId = ctx.session.pendingPaymentPackageId;

    if (!pkgId) { await ctx.answerCallbackQuery(); return; }

    // Check if method is enabled
    const enabled = await isMethodEnabled(method);
    if (!enabled) {
      await ctx.editMessageText(t(lang).paymentMethodDisabled);
      await ctx.answerCallbackQuery();
      return;
    }

    if (method === "gateway") {
      await ctx.editMessageText(t(lang).gatewayCreating);
      const payment = await createPayment(tgId, pkgId, "gateway");
      ctx.session.pendingPaymentMethod = "gateway";

      // Create TetraPay order (price is in Toman; TetraPay expects Rial = Toman × 10)
      const desc = lang === "fa" ? `خرید ${payment.coins} سکه` : `Purchase ${payment.coins} coins`;
      const result = await createTetraPayOrder(payment.id, tgId, payment.price * 10, desc);

      if (!result.success) {
        await ctx.editMessageText(t(lang).gatewayError(result.error ?? "Gateway error"));
        await ctx.answerCallbackQuery();
        return;
      }

      const info = t(lang).gatewayPaymentInfo(payment.price);
      const kb = new InlineKeyboard();
      if (result.paymentUrlBot) kb.url(t(lang).openPaymentBot, result.paymentUrlBot).row();
      if (result.paymentUrlWeb) kb.url(t(lang).openPaymentWeb, result.paymentUrlWeb);
      await ctx.editMessageText(info, { parse_mode: "Markdown", reply_markup: kb });
      await ctx.answerCallbackQuery();
      return;
    }

    const payment = await createPayment(tgId, pkgId, method);
    ctx.session.pendingPaymentMethod = method;

    if (method === "card") {
      const cardNo = await getSetting("card_number") ?? "6219-8610-0000-0000";
      const info = t(lang).cardPaymentInfo(cardNo, payment.price);
      await ctx.editMessageText(info, { parse_mode: "Markdown" });

      // Show upload receipt prompt with cancel keyboard (reply keyboard)
      const cancelKb = {
        keyboard: [[{ text: t(lang).cancel }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      };
      await ctx.reply(t(lang).uploadReceipt, { reply_markup: cancelKb });

    } else if (method === "crypto") {
      const wallet = await getSetting("crypto_wallet") ?? "TYour...WalletAddress";
      const amountUsdt = (payment.price / 30000).toFixed(2); // rough IRT→USDT conversion
      const amount = `${amountUsdt} USDT`;
      const info = t(lang).cryptoPaymentInfo(wallet, amount);

      // Build payment link button (Trust Wallet deep-link)
      const trustLink = buildTrustWalletLink(wallet, parseFloat(amountUsdt));
      const linkKb = new InlineKeyboard().url(t(lang).cryptoPaymentLinkBtn, trustLink);

      await ctx.editMessageText(info, { parse_mode: "Markdown", reply_markup: linkKb });

      // Show upload receipt prompt with cancel keyboard
      const cancelKb = {
        keyboard: [[{ text: t(lang).cancel }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      };
      await ctx.reply(t(lang).uploadReceipt, { reply_markup: cancelKb });
    }

    await ctx.answerCallbackQuery();
  });

  // ─── Upload receipt (photo) ───────────────────────────────────────────────
  bot.on("message:photo", async (ctx, next) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";

    const pendingPayment = await getPendingPayment(tgId);
    if (!pendingPayment) return next();

    const fileId = ctx.message.photo.at(-1)!.file_id;
    await submitReceipt(pendingPayment.id, fileId);

    // Clear session state
    ctx.session.pendingPaymentPackageId = undefined;
    ctx.session.pendingPaymentMethod = undefined;

    await ctx.reply(t(lang).receiptSubmitted, { reply_markup: mainMenuKeyboard(lang) });

    // Forward to admin review group
    const adminGroupId = await getSetting("payment_review_group");
    if (adminGroupId) {
      const groupId = parseInt(adminGroupId, 10);
      const reviewText = t("fa").paymentReviewMsg(pendingPayment);
      const msg = await bot.api
        .sendPhoto(groupId, fileId, {
          caption: reviewText,
          reply_markup: paymentReviewKeyboard(pendingPayment.id, "fa"),
          parse_mode: "Markdown",
        })
        .catch(() => null);
      if (msg) await setAdminMessageId(pendingPayment.id, msg.message_id, groupId);
    }
  });

  // ─── Admin: approve payment ───────────────────────────────────────────────
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
    await ctx.editMessageCaption({
      caption: `✅ تأیید شد — ${payment.coins} سکه — کاربر ${payment.userId}`,
    });

    const userRecord = await getUserByTelegramId(payment.userId);
    const uLang = (userRecord?.language as "fa" | "en") ?? "fa";
    await bot.api.sendMessage(payment.userId, t(uLang).paymentApproved(payment.coins)).catch(() => {});
    await ctx.answerCallbackQuery("✅");
  });

  // ─── Admin: reject payment ────────────────────────────────────────────────
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

  // ─── Referral ────────────────────────────────────────────────────────────
  bot.hears([/^🎁 دعوت/, /^🎁 Invite/], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    const botUsername = bot.botInfo?.username ?? process.env["BOT_USERNAME"] ?? "bot";
    const link = `https://t.me/${botUsername}?start=r_${user.referralCode}`;
    const stats = await getReferralStats(tgId);

    await ctx.reply(
      t(lang).referralInfo(user.referralCode, link, stats.total, stats.coinsEarned),
      { parse_mode: "Markdown" }
    );
  });
}
