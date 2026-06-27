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
import { mainMenuKeyboard, coinsSubMenuKeyboard, inviteMenuKeyboard } from "../keyboards/main.js";
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
    await ctx.reply(t(lang).coinsBalance(balance), {
      parse_mode: "Markdown",
      reply_markup: coinsSubMenuKeyboard(lang),
    });
  });

  // ─── Transaction history ───────────────────────────────────────────────────
  bot.hears(["📋 تراکنش‌های من", "📋 My Transactions"], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    const history = await getCoinHistory(tgId, 20);
    if (history.length === 0) {
      await ctx.reply(lang === "fa" ? "📋 هنوز تراکنشی ثبت نشده است." : "📋 No transactions yet.");
      return;
    }

    let msg = (lang === "fa" ? "📋 **تراکنش‌های من:**\n\n" : "📋 **My Transactions:**\n\n");
    for (const tx of history) {
      const sign = tx.amount > 0 ? "+" : "";
      const date = new Date(tx.createdAt).toLocaleDateString(lang === "fa" ? "fa-IR" : "en-GB");
      msg += `${sign}${tx.amount} سکه — ${tx.description ?? tx.type} — ${date}\n`;
    }
    await ctx.reply(msg, { parse_mode: "Markdown" });
  });

  // ─── Buy Coins (text button) ───────────────────────────────────────────────
  bot.hears(["🛒 خرید سکه", "🛒 Buy Coins"], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    const packages = await getPackages();
    if (packages.length === 0) {
      await ctx.reply(lang === "fa" ? "در حال حاضر بسته‌ای موجود نیست." : "No packages available.");
      return;
    }
    await ctx.reply(t(lang).selectPackage, {
      parse_mode: "Markdown",
      reply_markup: packagesKeyboard(packages, lang),
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

  // ─── Invite / Referral sub-menu ──────────────────────────────────────────
  bot.hears([/^🎁 دعوت/, /^🎁 Invite/], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";
    await ctx.reply(t(lang).referralInfoTitle, {
      parse_mode: "Markdown",
      reply_markup: inviteMenuKeyboard(lang),
    });
  });

  // ─── Get referral link + shareable banner ────────────────────────────────
  bot.hears(["🔗 لینک دعوت + بنر ارسال", "🔗 Invite Link + Share Banner"], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    // Use botInfo username — always accurate after bot init
    const botUsername = bot.botInfo?.username ?? "anymschat_bot";
    // Use inv prefix (no underscore) to avoid Markdown parse issues
    const link = `https://t.me/${botUsername}?start=inv${user.referralCode}`;

    const [inviterRewardStr, inviteeRewardStr] = await Promise.all([
      getSetting("referral_reward_inviter"),
      getSetting("referral_reward_invitee"),
    ]);
    const inviterReward = parseInt(inviterRewardStr ?? "10", 10);
    const inviteeReward = parseInt(inviteeRewardStr ?? "5", 10);

    // Message 1: link info (copyable) — HTML to avoid URL underscore conflicts
    await ctx.reply(t(lang).referralLinkMsg(link), { parse_mode: "HTML" });

    // Message 2: forward-able promotional banner — HTML
    await ctx.reply(t(lang).referralBanner(link, inviterReward, inviteeReward), {
      parse_mode: "HTML",
    });
  });

  // ─── Referral stats (detailed) ────────────────────────────────────────────
  bot.hears(["📊 آمار دقیق دعوت‌هایم", "📊 My Detailed Referral Stats"], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    const [stats, inviterRewardStr, inviteeRewardStr] = await Promise.all([
      getReferralStats(tgId),
      getSetting("referral_reward_inviter"),
      getSetting("referral_reward_invitee"),
    ]);
    const inviterReward = parseInt(inviterRewardStr ?? "10", 10);
    const inviteeReward = parseInt(inviteeRewardStr ?? "5", 10);

    await ctx.reply(
      t(lang).referralStats(stats.total, stats.successful, stats.pending, stats.coinsEarned, inviterReward, inviteeReward),
      { parse_mode: "Markdown" }
    );
  });
}

