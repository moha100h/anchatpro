import { Bot, InlineKeyboard } from "grammy";
import type { BotContext } from "../context.js";
import { getUserByTelegramId } from "../services/user.service.js";
import { getBalance, getCoinHistory, getReferralStats } from "../services/coin.service.js";
import {
  redeemGiftCode,
  getTopReferrers,
  getLeaderboardLastUpdated,
  getReferralRank,
} from "../services/gift.service.js";
import {
  getPackages,
  getPackageById,
  createPayment,
  approveStarsPayment,
  submitReceipt,
  getSetting,
  isMethodEnabled,
  getPendingPayment,
  setAdminMessageId,
  cancelPayment,
  validateDiscountCode,
  useDiscountCode,
  getCryptoCurrencies,
  fetchCryptoPriceWithFallback,
  methodToGateway,
} from "../services/payment.service.js";
import { createTetraPayOrder } from "../services/tetrapay.service.js";
import { createPlisioOrder } from "../services/plisio.service.js";
import { t } from "../i18n/index.js";
import { mainMenuKeyboard, coinsSubMenuKeyboard, inviteMenuKeyboard, coinsPackagesKeyboard, coinsGatewayKeyboard } from "../keyboards/main.js";
import { spinWheel, hasSpunToday } from "../services/spin.service.js";
import { packagesKeyboard, paymentMethodKeyboard, paymentReviewKeyboard } from "../keyboards/inline.js";

/** Translate a coin transaction type + description to Persian */
function txLabelFa(type: string, description: string | null): string {
  if (description) {
    return description
      .replace(/\b(27\d{7,}|[1-9]\d{6,})\b/g, "👤 مدیر")
      .replace(/Purchase of (\d+) coins?/gi, "خرید $1 سکه")
      .replace(/Admin add[:\s]*/gi, "افزایش مدیر: ")
      .replace(/Admin remove[:\s]*/gi, "کاهش مدیر: ")
      .replace(/Referral reward for inviting user \S+/gi, "جایزه دعوت دوست")
      .replace(/Referral reward/gi, "جایزه دعوت")
      .replace(/Referral bonus for invited user/gi, "جایزه عضویت با دعوت")
      .replace(/Connect to male/gi, "اتصال به پسر")
      .replace(/Connect to female/gi, "اتصال به دختر")
      .replace(/Connect to any/gi, "اتصال شانسی")
      .replace(/Permanent anonymous link/gi, "لینک ناشناس ثابت")
      .replace(/Timed anonymous link/gi, "لینک ناشناس مدت‌دار")
      .replace(/Gift code redemption/gi, "استفاده از کد هدیه")
      .replace(/Group create/gi, "ساخت گروه")
      .replace(/Group join/gi, "پیوستن به گروه")
      .replace(/Group expand/gi, "افزایش ظرفیت گروه")
      .replace(/Group promote/gi, "ارتقا به مدیر گروه")
      .replace(/Pro anonymous link/gi, "لینک ناشناس پرو")
      .replace(/Magic\s*spend/gi, "ویژگی اسرار");
  }
  const map: Record<string, string> = {
    admin_add:       "💰 افزایش سکه توسط مدیر",
    admin_remove:    "💸 کاهش سکه توسط مدیر",
    referral_reward: "🎁 جایزه دعوت دوستان",
    chat_cost:       "💬 هزینه اتصال ناشناس",
    group_cost:      "👥 هزینه گروه ناشناس",
    magic_spend:     "🔮 هزینه ویژگی‌های اقیانوس",
    payment:         "🛒 خرید سکه",
    refund:          "↩️ بازگشت وجه",
    daily_spin:      "🎰 گردونه شانس روزانه",
  };
  return map[type] ?? type;
}

/** Translate a coin transaction type + description to English */
function txLabelEn(type: string, description: string | null): string {
  if (description) {
    return description.replace(/\b(27\d{7,}|[1-9]\d{6,})\b/g, "Admin");
  }
  const map: Record<string, string> = {
    admin_add:       "💰 Coins added by admin",
    admin_remove:    "💸 Coins removed by admin",
    referral_reward: "🎁 Referral reward",
    chat_cost:       "💬 Chat connection fee",
    group_cost:      "👥 Group fee",
    magic_spend:     "🔮 Mystery feature",
    payment:         "🛒 Coin purchase",
    refund:          "↩️ Refund",
    daily_spin:      "🎰 Daily spin wheel",
  };
  return map[type] ?? type;
}

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

// ─── Shared payment-processing helper ────────────────────────────────────────
// Called after gateway + package + optional-discount are all known.
// Handles card / crypto / gateway payment paths identically for both text and
// inline purchase flows.
async function handlePaymentByMethod(
  ctx: any,
  bot: Bot<BotContext>,
  lang: "fa" | "en",
  tgId: number,
  method: "card" | "crypto" | "gateway" | "plisio" | "stars",
  pkgId: number,
  discPct: number,
  discCode: number | undefined,
): Promise<void> {
  // ── Telegram Stars gateway ─────────────────────────────────────────────────
  if (method === "stars") {
    let payment;
    try {
      payment = await createPayment(tgId, pkgId, "stars", { discountPercent: discPct, discountCodeId: discCode });
    } catch {
      await ctx.reply(lang === "fa" ? "❌ خطا در ایجاد پرداخت. لطفاً دوباره امتحان کنید." : "❌ Failed to create payment. Please try again.");
      return;
    }
    if (discCode) { await useDiscountCode(discCode).catch(() => {}); }
    ctx.session.pendingPaymentMethod    = "stars";
    ctx.session.pendingPaymentPackageId = undefined;

    const starsAmount = Math.max(1, Math.round(payment.price));
    const title       = lang === "fa" ? `خرید ${payment.coins} سکه` : `Buy ${payment.coins} Coins`;
    const description = lang === "fa"
      ? `پرداخت با استارز تلگرام — ${payment.coins} سکه به حساب شما اضافه می‌شود.`
      : `Pay with Telegram Stars — ${payment.coins} coins will be added to your account.`;
    const payload = `stars_${payment.id}`;

    try {
      await ctx.api.sendInvoice(
        tgId,
        title,
        description,
        payload,
        "XTR",
        [{ label: lang === "fa" ? `${payment.coins} سکه` : `${payment.coins} Coins`, amount: starsAmount }],
        { provider_token: "" }
      );
    } catch (err: any) {
      await ctx.reply(lang === "fa"
        ? `❌ خطا در ارسال فاکتور Stars.\n\`${err?.message ?? err}\``
        : `❌ Failed to send Stars invoice.\n\`${err?.message ?? err}\``,
        { parse_mode: "Markdown" }
      );
    }
    return;
  }
  // ── Plisio crypto gateway ────────────────────────────────────────────────────
  if (method === "plisio") {
    await ctx.reply(t(lang).gatewayCreating);
    let payment;
    try {
      payment = await createPayment(tgId, pkgId, "plisio", { discountPercent: discPct, discountCodeId: discCode });
    } catch {
      await ctx.reply(lang === "fa" ? "❌ خطا در ایجاد پرداخت. لطفاً دوباره امتحان کنید." : "❌ Failed to create payment. Please try again.");
      return;
    }
    if (discCode) { await useDiscountCode(discCode).catch(() => {}); }
    ctx.session.pendingPaymentMethod    = "plisio";
    ctx.session.pendingPaymentPackageId = undefined;

    // payment.price is already the correct USD amount (gateway-scoped uses pkg.price, legacy uses plisioPrice ?? cryptoPrice ?? price, discount already applied)
    const usdAmount = payment.price;
    const result = await createPlisioOrder(payment.id, tgId, usdAmount, payment.coins);
    if (!result.success) {
      const rawErr = result.error ?? "Gateway error";
      // Detect minimum-amount violations from Plisio and show friendly message
      const minMatch = rawErr.match(/greater than:\s*([\d.]+)\s*(\S+)/i);
      if (minMatch) {
        const minAmt = minMatch[1];
        const currency = minMatch[2];
        await ctx.reply(
          lang === "fa"
            ? `❌ مبلغ بسته انتخابی برای ارز *${currency}* کافی نیست.\n\n` +
              `حداقل مبلغ پرداخت با این ارز *${minAmt} ${currency}* است.\n` +
              `یک بسته با قیمت بالاتر انتخاب کنید، یا ارز دیگری را امتحان کنید.`
            : `❌ The selected package amount is too low for *${currency}*.\n\n` +
              `Minimum payment with this currency is *${minAmt} ${currency}*.\n` +
              `Please select a higher-priced package or try a different currency.`,
          { parse_mode: "Markdown" }
        );
      } else {
        await ctx.reply(t(lang).gatewayError(rawErr));
      }
      return;
    }
    const info = lang === "fa"
      ? `💫 *پرداخت از طریق Plisio*\n\n` +
        `💵 مبلغ: *$${usdAmount} USD* (معادل کریپتو)\n` +
        `🪙 دریافتی: *${payment.coins} سکه*\n\n` +
        `🔗 روی دکمه زیر کلیک کنید و ارز دیجیتال خود را انتخاب کنید.\n` +
        `⏰ لینک تا *۳۰ دقیقه* معتبر است.\n\n` +
        `_پس از پرداخت، سکه‌ها به صورت خودکار به حسابتان اضافه می‌شود._`
      : `💫 *Pay via Plisio*\n\n` +
        `💵 Amount: *$${usdAmount} USD* (in crypto)\n` +
        `🪙 Receive: *${payment.coins} coins*\n\n` +
        `🔗 Click below to select your cryptocurrency.\n` +
        `⏰ Link valid for *30 minutes*.\n\n` +
        `_Coins will be credited automatically after payment._`;

    const kb = new InlineKeyboard().url(
      lang === "fa" ? "💫 پرداخت با Plisio" : "💫 Pay with Plisio",
      result.invoiceUrl!
    );
    await ctx.reply(info, { parse_mode: "Markdown", reply_markup: kb });
    return;
  }

  // ── TetraPay online gateway ─────────────────────────────────────────────────
  if (method === "gateway") {
    await ctx.reply(t(lang).gatewayCreating);
    let payment;
    try {
      payment = await createPayment(tgId, pkgId, "gateway", { discountPercent: discPct, discountCodeId: discCode });
    } catch {
      await ctx.reply(lang === "fa" ? "❌ خطا در ایجاد پرداخت. لطفاً دوباره امتحان کنید." : "❌ Failed to create payment. Please try again.");
      return;
    }
    if (discCode) { await useDiscountCode(discCode).catch(() => {}); }
    ctx.session.pendingPaymentMethod    = "gateway";
    ctx.session.pendingPaymentPackageId = undefined;

    const desc   = lang === "fa" ? `خرید ${payment.coins} سکه` : `Purchase ${payment.coins} coins`;
    const result = await createTetraPayOrder(payment.id, tgId, payment.price * 10, desc);
    if (!result.success) {
      await ctx.reply(t(lang).gatewayError(result.error ?? "Gateway error"));
      return;
    }
    const info = t(lang).gatewayPaymentInfo(payment.price);
    const kb   = new InlineKeyboard();
    if (result.paymentUrlBot) kb.url(t(lang).openPaymentBot, result.paymentUrlBot).row();
    if (result.paymentUrlWeb) kb.url(t(lang).openPaymentWeb, result.paymentUrlWeb);
    await ctx.reply(info, { parse_mode: "Markdown", reply_markup: kb });
    return;
  }

  // ── Card payment ────────────────────────────────────────────────────────────
  if (method === "card") {
    const [cardNo, holderName, bankName] = await Promise.all([
      getSetting("card_number"),
      getSetting("card_holder_name"),
      getSetting("card_bank_name"),
    ]);
    let payment;
    try {
      payment = await createPayment(tgId, pkgId, "card", { discountPercent: discPct, discountCodeId: discCode });
    } catch {
      await ctx.reply(lang === "fa" ? "❌ خطا در ایجاد پرداخت." : "❌ Failed to create payment.");
      return;
    }
    if (discCode) { await useDiscountCode(discCode).catch(() => {}); }
    ctx.session.pendingPaymentMethod    = "card";
    ctx.session.pendingPaymentPackageId = undefined;

    const priceStr = payment.price.toLocaleString("fa-IR");
    const info = lang === "fa"
      ? `💳 <b>اطلاعات پرداخت کارت‌به‌کارت</b>\n\n` +
        (bankName   ? `🏦 بانک: <b>${bankName}</b>\n`        : "") +
        (holderName ? `👤 صاحب کارت: <b>${holderName}</b>\n` : "") +
        `💳 شماره کارت:\n<code>${cardNo ?? "6219-8610-0000-0000"}</code>\n\n` +
        `💰 مبلغ: <b>${priceStr} تومان</b>` +
        (discPct > 0 ? ` 🔥 <i>(تخفیف ${discPct}% اعمال شد)</i>` : "") +
        `\n\n📸 پس از واریز، تصویر رسید را ارسال کنید.`
      : `💳 <b>Bank Card Payment</b>\n\n` +
        (bankName   ? `🏦 Bank: <b>${bankName}</b>\n`     : "") +
        (holderName ? `👤 Holder: <b>${holderName}</b>\n` : "") +
        `💳 Card:\n<code>${cardNo ?? "6219-8610-0000-0000"}</code>\n\n` +
        `💰 Amount: <b>${payment.price.toLocaleString()} IRT</b>` +
        (discPct > 0 ? ` 🔥 <i>(${discPct}% discount applied)</i>` : "") +
        `\n\n📸 Send receipt photo after transfer.`;

    await ctx.reply(info, { parse_mode: "HTML" });
    await ctx.reply(t(lang).uploadReceipt, {
      reply_markup: { keyboard: [[{ text: t(lang).cancel }]], resize_keyboard: true, one_time_keyboard: true },
    });
    return;
  }

  // ── Crypto payment ──────────────────────────────────────────────────────────
  if (method === "crypto") {
    const currencies = await getCryptoCurrencies();
    if (currencies.length > 1) {
      // Multi-currency: let user pick
      const currKb = new InlineKeyboard();
      currencies.forEach((c, i) => { currKb.text(`${c.symbol} (${c.network})`, `crypto_buy:${i}`).row(); });
      await ctx.reply(
        lang === "fa" ? "💱 ارز دیجیتال خود را انتخاب کنید:" : "💱 Select your cryptocurrency:",
        { reply_markup: currKb }
      );
      return;
    }

    const c       = currencies[0];
    const wallet  = c?.address ?? (await getSetting("crypto_wallet")) ?? "TYour...WalletAddress";
    const symbol  = c?.symbol  ?? "USDT";
    const network = c?.network ?? "TRC20";
    const name    = c?.name    ?? "Tether";
    const cgId    = c?.coinGeckoId ?? "tether";

    let payment;
    try {
      payment = await createPayment(tgId, pkgId, "crypto", { discountPercent: discPct, discountCodeId: discCode });
    } catch {
      await ctx.reply(lang === "fa" ? "❌ خطا در ایجاد پرداخت." : "❌ Failed to create payment.");
      return;
    }
    if (discCode) { await useDiscountCode(discCode).catch(() => {}); }
    ctx.session.pendingPaymentMethod    = "crypto";
    ctx.session.pendingPaymentPackageId = undefined;

    const priceIrt = await fetchCryptoPriceWithFallback(cgId);
    // If currency=USD (gateway-scoped crypto package), price IS already USD; otherwise IRT
    const amountRaw = payment.currency === "USD"
      ? (priceIrt && priceIrt > 0 ? payment.price / (priceIrt / 30000) : payment.price)
      : (priceIrt && priceIrt > 0 ? payment.price / priceIrt : payment.price / 30_000);
    const amountStr = amountRaw < 0.001 ? `${amountRaw.toFixed(8)} ${symbol}` : `${amountRaw.toFixed(6)} ${symbol}`;

    const info = lang === "fa"
      ? `₿ <b>پرداخت با ${name} (${network})</b>\n\n` +
        `💰 مبلغ: <b>${amountStr}</b>` +
        (discPct > 0 ? ` 🔥 <i>(تخفیف ${discPct}% اعمال شد)</i>` : "") +
        `\n📋 آدرس کیف پول:\n<code>${wallet}</code>\n\n` +
        `⚠️ <b>فقط شبکه ${network} قبول می‌شود</b>\n📸 پس از انتقال، رسید را ارسال کنید.`
      : `₿ <b>Pay with ${name} (${network})</b>\n\n` +
        `💰 Amount: <b>${amountStr}</b>\n📋 Wallet:\n<code>${wallet}</code>\n\n` +
        `⚠️ <b>Only ${network} network accepted</b>\n📸 Send receipt after transfer.`;

    let linkKb: InlineKeyboard | undefined;
    if (symbol === "USDT" && network === "TRC20") {
      linkKb = new InlineKeyboard().url(
        t(lang).cryptoPaymentLinkBtn,
        `https://link.trustwallet.com/send?coin=10001_0xa614f803B6FD780986A42c78Ec9c7f77e6DeD13&address=${encodeURIComponent(wallet)}&amount=${amountRaw}`
      );
    }

    await ctx.reply(info, { parse_mode: "HTML", reply_markup: linkKb });
    await ctx.reply(t(lang).uploadReceipt, {
      reply_markup: { keyboard: [[{ text: t(lang).cancel }]], resize_keyboard: true, one_time_keyboard: true },
    });
  }
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

    // Cancel gift code input if active
    if (ctx.session.giftCodeInput) {
      ctx.session.giftCodeInput = false;
      await ctx.reply(t(lang).giftCodeCancelled, { reply_markup: mainMenuKeyboard(lang) });
      return;
    }

    // Cancel buying flow (gateway / package / discount steps)
    if (
      ctx.session.step === "buying:gateway" ||
      ctx.session.step === "buying:package" ||
      ctx.session.step === "buying:discount_code"
    ) {
      ctx.session.step = undefined;
      ctx.session.pendingPaymentMethod    = undefined;
      ctx.session.pendingPaymentPackageId = undefined;
      ctx.session.pendingDiscountCodeId   = undefined;
      ctx.session.pendingDiscountPercent  = undefined;
      await ctx.reply(t(lang).paymentCancelled, { reply_markup: coinsSubMenuKeyboard(lang) });
      return;
    }

    const pendingPayment = await getPendingPayment(tgId);
    if (pendingPayment) {
      await cancelPayment(pendingPayment.id);
      ctx.session.pendingPaymentPackageId = undefined;
      ctx.session.pendingPaymentMethod    = undefined;
      ctx.session.pendingDiscountCodeId   = undefined;
      ctx.session.pendingDiscountPercent  = undefined;
      await ctx.reply(t(lang).paymentCancelled, { reply_markup: mainMenuKeyboard(lang) });
      return;
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
      const label = lang === "fa"
        ? txLabelFa(tx.type, tx.description ?? null)
        : txLabelEn(tx.type, tx.description ?? null);
      msg += `${sign}${tx.amount} سکه — ${label} — ${date}\n`;
    }
    await ctx.reply(msg, { parse_mode: "Markdown" });
  });

  // ─── Buy Coins (text button) → STEP 1: gateway selection ─────────────────
  bot.hears(["🛒 خرید سکه", "🛒 Buy Coins"], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    const [cardOn, cryptoOn, gatewayOn, plisioOn, starsOn] = await Promise.all([
      isMethodEnabled("card"),
      isMethodEnabled("crypto"),
      isMethodEnabled("gateway"),
      isMethodEnabled("plisio"),
      isMethodEnabled("stars"),
    ]);

    if (!cardOn && !cryptoOn && !gatewayOn && !plisioOn && !starsOn) {
      await ctx.reply(
        lang === "fa"
          ? "⚠️ در حال حاضر هیچ روش پرداختی فعال نیست. لطفاً بعداً امتحان کنید."
          : "⚠️ No payment methods available right now. Please try later."
      );
      return;
    }

    ctx.session.step                = "buying:gateway";
    ctx.session.pendingPaymentMethod    = undefined;
    ctx.session.pendingPaymentPackageId = undefined;
    ctx.session.pendingDiscountCodeId   = undefined;
    ctx.session.pendingDiscountPercent  = undefined;

    const [nameCard, nameCrypto, nameTetrapay, namePlisio, nameStars] = await Promise.all([
      getSetting("gateway_display_name_card"),
      getSetting("gateway_display_name_crypto"),
      getSetting("gateway_display_name_tetrapay"),
      getSetting("gateway_display_name_plisio"),
      getSetting("gateway_display_name_stars"),
    ]);
    const gwNames = {
      card:     nameCard     ?? (lang === "fa" ? "💳 پرداخت کارت‌به‌کارت" : "💳 Card Payment"),
      crypto:   nameCrypto   ?? (lang === "fa" ? "₿ ارز دیجیتال (کریپتو)" : "₿ Cryptocurrency"),
      tetrapay: nameTetrapay ?? (lang === "fa" ? "🌐 درگاه آنلاین (TetraPay)" : "🌐 Online Gateway (TetraPay)"),
      plisio:   namePlisio   ?? (lang === "fa" ? "💫 پلیزیو (Plisio)" : "💫 Plisio (Crypto)"),
      stars:    nameStars    ?? (lang === "fa" ? "⭐ استارز تلگرام" : "⭐ Telegram Stars"),
    };

    await ctx.reply(
      lang === "fa"
        ? "💰 *خرید سکه*\n\nابتدا روش پرداخت خود را انتخاب کنید:"
        : "💰 *Buy Coins*\n\nFirst, choose your payment method:",
      {
        parse_mode:   "Markdown",
        reply_markup: coinsGatewayKeyboard(lang, { card: cardOn, crypto: cryptoOn, gateway: gatewayOn, plisio: plisioOn, stars: starsOn }, gwNames),
      }
    );
  });

  // ─── STEP 1 handler: gateway button tapped ─────────────────────────────────
  bot.on("message:text", async (ctx, next) => {
    if (ctx.session.step !== "buying:gateway") return next();
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";
    const text = ctx.message.text;

    // Back → coins sub-menu
    if (/^🔙/.test(text)) {
      ctx.session.step = undefined;
      await ctx.reply(t(lang).coinsBalance(user?.coins ?? 0), {
        parse_mode:   "Markdown",
        reply_markup: coinsSubMenuKeyboard(lang),
      });
      return;
    }

    // Match text against gateway display names (fetch from settings for custom names)
    const [nameCard, nameCrypto, nameTetrapay, namePlisio, nameStars2] = await Promise.all([
      getSetting("gateway_display_name_card"),
      getSetting("gateway_display_name_crypto"),
      getSetting("gateway_display_name_tetrapay"),
      getSetting("gateway_display_name_plisio"),
      getSetting("gateway_display_name_stars"),
    ]);
    const GW_MAP: Array<{ names: string[]; method: "card" | "crypto" | "gateway" | "plisio" | "stars" }> = [
      { method: "card",    names: [nameCard    ?? "💳 پرداخت کارت‌به‌کارت", "💳 Card Payment",                 "💳"] },
      { method: "crypto",  names: [nameCrypto  ?? "₿ ارز دیجیتال (کریپتو)", "₿ Cryptocurrency",               "₿"]  },
      { method: "gateway", names: [nameTetrapay ?? "🌐 درگاه آنلاین (TetraPay)", "🌐 Online Gateway (TetraPay)", "🌐"] },
      { method: "plisio",  names: [namePlisio  ?? "💫 پلیزیو (Plisio)",        "💫 Plisio (Crypto)",            "💫"] },
      { method: "stars",   names: [nameStars2  ?? "⭐ استارز تلگرام",          "⭐ Telegram Stars",              "⭐"] },
    ];
    let method: "card" | "crypto" | "gateway" | "plisio" | "stars" | null = null;
    for (const gw of GW_MAP) {
      if (gw.names.some(n => text === n || text.startsWith(n.slice(0, 2)))) {
        method = gw.method;
        break;
      }
    }

    if (!method) return next();

    // Verify still enabled
    const enabled = await isMethodEnabled(method);
    if (!enabled) {
      await ctx.reply(
        lang === "fa"
          ? "❌ این روش پرداخت فعلاً غیرفعال است. روش دیگری انتخاب کنید."
          : "❌ This payment method is currently disabled. Choose another."
      );
      return;
    }

    ctx.session.pendingPaymentMethod    = method;
    ctx.session.step                    = "buying:package";
    ctx.session.pendingPaymentPackageId = undefined;
    ctx.session.pendingDiscountCodeId   = undefined;
    ctx.session.pendingDiscountPercent  = undefined;

    const methodLabel =
      method === "card"    ? (lang === "fa" ? "💳 کارت‌به‌کارت"           : "💳 Card")
      : method === "crypto"  ? (lang === "fa" ? "₿ ارز دیجیتال"              : "₿ Crypto")
      : method === "plisio"  ? (lang === "fa" ? "💫 Plisio (کریپتو جهانی)"  : "💫 Plisio (Crypto)")
      : method === "stars"   ? (lang === "fa" ? "⭐ استارز تلگرام"           : "⭐ Telegram Stars")
      :                        (lang === "fa" ? "🌐 درگاه آنلاین (TetraPay)" : "🌐 Online Gateway");

    const packages = await getPackages(method);
    if (packages.length === 0) {
      await ctx.reply(
        lang === "fa"
          ? "⚠️ هیچ بسته‌ای برای این روش پرداخت تعریف نشده. لطفاً روش دیگری انتخاب کنید."
          : "⚠️ No packages available for this payment method. Please choose another.",
        { reply_markup: coinsGatewayKeyboard(lang, { card: true, crypto: true, gateway: true, plisio: true, stars: true }) }
      );
      return;
    }

    await ctx.reply(
      lang === "fa"
        ? `✅ روش: *${methodLabel}*\n\n💎 اکنون یک بسته سکه انتخاب کنید:`
        : `✅ Method: *${methodLabel}*\n\n💎 Now select a coin package:`,
      {
        parse_mode:   "Markdown",
        reply_markup: coinsPackagesKeyboard(packages, lang, method),
      }
    );
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

  // ─── Package selected (inline buy_coins flow) ────────────────────────────
  bot.callbackQuery(/^pkg:(\d+)$/, async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";
    const pkgId = parseInt(ctx.match![1], 10);

    ctx.session.pendingPaymentPackageId = pkgId;
    ctx.session.pendingDiscountCodeId   = undefined;
    ctx.session.pendingDiscountPercent  = undefined;

    const pkg = await getPackageById(pkgId);
    const isUsdPkg = pkg?.currency === "USD" || pkg?.gateway === "crypto" || pkg?.gateway === "plisio";
    const priceStr = isUsdPkg
      ? `$${pkg?.price ?? ""}`
      : `${(pkg?.price ?? 0).toLocaleString("fa-IR")} تومان`;
    const discPct  = pkg?.discountPercent ?? 0;

    const discKb = new InlineKeyboard()
      .text(lang === "fa" ? "🏷️ دارم کد تخفیف" : "🏷️ I have a discount code", "discount:enter").row()
      .text(lang === "fa" ? "⏭️ ندارم، ادامه"   : "⏭️ Skip, continue",         "discount:skip");

    const msg = lang === "fa"
      ? `✅ بسته انتخاب شد: *${pkg?.coins ?? pkgId} سکه*\n` +
        `💵 قیمت: *${priceStr}*` +
        (discPct > 0 ? ` 🔥 (${discPct}% تخفیف)` : "") +
        `\n\nآیا کد تخفیف دارید؟`
      : `✅ Package: *${pkg?.coins ?? pkgId} coins*\n💵 Price: *${priceStr}*\n\nDo you have a discount code?`;

    await ctx.editMessageText(msg, { parse_mode: "Markdown", reply_markup: discKb });
    await ctx.answerCallbackQuery();
  });

  // ─── Discount code inline prompts ────────────────────────────────────────
  bot.callbackQuery("discount:enter", async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";
    ctx.session.step = "buying:discount_code";
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    await ctx.reply(lang === "fa" ? "🏷️ کد تخفیف خود را وارد کنید:" : "🏷️ Enter your discount code:");
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("discount:skip", async (ctx) => {
    const tgId   = ctx.from!.id;
    const user   = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang   = (user?.language as "fa" | "en") ?? "fa";
    const method = ctx.session.pendingPaymentMethod as "card" | "crypto" | "gateway" | undefined;
    const pkgId  = ctx.session.pendingPaymentPackageId;
    ctx.session.pendingDiscountCodeId  = undefined;
    ctx.session.pendingDiscountPercent = undefined;
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    await ctx.answerCallbackQuery();

    // Text-keyboard flow: method already chosen in step 1
    if (method && pkgId) {
      await handlePaymentByMethod(ctx, bot, lang, tgId, method, pkgId, 0, undefined);
      return;
    }

    // Inline flow fallback: show method keyboard
    const enabled = {
      card:    await isMethodEnabled("card"),
      crypto:  await isMethodEnabled("crypto"),
      gateway: await isMethodEnabled("gateway"),
    };
    await ctx.reply(t(lang).selectPaymentMethod, { reply_markup: paymentMethodKeyboard(lang, enabled) });
  });

  // ─── Payment method selected ──────────────────────────────────────────────
  bot.callbackQuery(/^pay_method:(card|crypto|gateway)$/, async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";
    const method = ctx.match![1] as "card" | "crypto" | "gateway";
    const pkgId  = ctx.session.pendingPaymentPackageId;

    if (!pkgId) { await ctx.answerCallbackQuery(); return; }

    const enabled = await isMethodEnabled(method);
    if (!enabled) {
      await ctx.editMessageText(t(lang).paymentMethodDisabled);
      await ctx.answerCallbackQuery();
      return;
    }

    const discPct  = ctx.session.pendingDiscountPercent ?? 0;
    const discCode = ctx.session.pendingDiscountCodeId;

    // ── TetraPay gateway ──────────────────────────────────────────────────
    if (method === "gateway") {
      await ctx.editMessageText(t(lang).gatewayCreating);
      const payment = await createPayment(tgId, pkgId, "gateway", {
        discountPercent: discPct,
        discountCodeId:  discCode,
      });
      if (discCode) {
        await useDiscountCode(discCode).catch(() => {});
        ctx.session.pendingDiscountCodeId  = undefined;
        ctx.session.pendingDiscountPercent = undefined;
      }
      ctx.session.pendingPaymentMethod = "gateway";

      const desc   = lang === "fa" ? `خرید ${payment.coins} سکه` : `Purchase ${payment.coins} coins`;
      const result = await createTetraPayOrder(payment.id, tgId, payment.price * 10, desc);

      if (!result.success) {
        await ctx.editMessageText(t(lang).gatewayError(result.error ?? "Gateway error"));
        await ctx.answerCallbackQuery();
        return;
      }

      const info = t(lang).gatewayPaymentInfo(payment.price);
      const kb   = new InlineKeyboard();
      if (result.paymentUrlBot) kb.url(t(lang).openPaymentBot, result.paymentUrlBot).row();
      if (result.paymentUrlWeb) kb.url(t(lang).openPaymentWeb, result.paymentUrlWeb);
      await ctx.editMessageText(info, { parse_mode: "Markdown", reply_markup: kb });
      await ctx.answerCallbackQuery();
      return;
    }

    // ── Card ──────────────────────────────────────────────────────────────
    if (method === "card") {
      const [cardNo, holderName, bankName] = await Promise.all([
        getSetting("card_number"),
        getSetting("card_holder_name"),
        getSetting("card_bank_name"),
      ]);
      const payment = await createPayment(tgId, pkgId, "card", {
        discountPercent: discPct,
        discountCodeId:  discCode,
      });
      if (discCode) {
        await useDiscountCode(discCode).catch(() => {});
        ctx.session.pendingDiscountCodeId  = undefined;
        ctx.session.pendingDiscountPercent = undefined;
      }
      ctx.session.pendingPaymentMethod = "card";

      const priceStr = payment.price.toLocaleString("fa-IR");
      const info = lang === "fa"
        ? `💳 <b>اطلاعات پرداخت کارت بانکی</b>\n\n` +
          (bankName   ? `🏦 بانک: <b>${bankName}</b>\n`        : "") +
          (holderName ? `👤 صاحب کارت: <b>${holderName}</b>\n` : "") +
          `💳 شماره کارت:\n<code>${cardNo ?? "6219-8610-0000-0000"}</code>\n\n` +
          `💰 مبلغ واریز: <b>${priceStr} تومان</b>` +
          (discPct > 0 ? ` 🔥 <i>(تخفیف ${discPct}% اعمال شد)</i>` : "") +
          `\n\n📸 پس از واریز، تصویر رسید را ارسال کنید.`
        : `💳 <b>Bank Card Payment</b>\n\n` +
          (bankName   ? `🏦 Bank: <b>${bankName}</b>\n`          : "") +
          (holderName ? `👤 Holder: <b>${holderName}</b>\n`      : "") +
          `💳 Card number:\n<code>${cardNo ?? "6219-8610-0000-0000"}</code>\n\n` +
          `💰 Amount: <b>${payment.price.toLocaleString()} IRT</b>` +
          (discPct > 0 ? ` 🔥 <i>(${discPct}% discount applied)</i>` : "") +
          `\n\n📸 Send your receipt photo after transfer.`;

      await ctx.editMessageText(info, { parse_mode: "HTML" });
      await ctx.reply(t(lang).uploadReceipt, {
        reply_markup: { keyboard: [[{ text: t(lang).cancel }]], resize_keyboard: true, one_time_keyboard: true },
      });
      await ctx.answerCallbackQuery();
      return;
    }

    // ── Crypto (multi-currency) ───────────────────────────────────────────
    if (method === "crypto") {
      const currencies = await getCryptoCurrencies();
      if (currencies.length > 1) {
        // Multi-currency: show selection first (don't create payment yet)
        const currKb = new InlineKeyboard();
        currencies.forEach((c, i) => {
          currKb.text(`${c.symbol} (${c.network})`, `crypto_buy:${i}`).row();
        });
        await ctx.editMessageText(
          lang === "fa" ? "💱 ارز دیجیتال خود را انتخاب کنید:" : "💱 Select your cryptocurrency:",
          { reply_markup: currKb }
        );
        await ctx.answerCallbackQuery();
        return;
      }

      // Single currency or fallback
      const c       = currencies[0];
      const wallet  = c?.address ?? (await getSetting("crypto_wallet")) ?? "TYour...WalletAddress";
      const symbol  = c?.symbol  ?? "USDT";
      const network = c?.network ?? "TRC20";
      const name    = c?.name    ?? "Tether";
      const cgId    = c?.coinGeckoId ?? "tether";

      const payment = await createPayment(tgId, pkgId, "crypto", {
        discountPercent: discPct,
        discountCodeId:  discCode,
      });
      if (discCode) {
        await useDiscountCode(discCode).catch(() => {});
        ctx.session.pendingDiscountCodeId  = undefined;
        ctx.session.pendingDiscountPercent = undefined;
      }
      ctx.session.pendingPaymentMethod = "crypto";

      const priceIrt = await fetchCryptoPriceWithFallback(cgId);
      let amountRaw  = priceIrt && priceIrt > 0
        ? payment.price / priceIrt
        : payment.price / 30000;
      const amountStr = amountRaw < 0.001
        ? `${amountRaw.toFixed(8)} ${symbol}`
        : `${amountRaw.toFixed(6)} ${symbol}`;

      const info = lang === "fa"
        ? `₿ <b>پرداخت با ${name} (${network})</b>\n\n` +
          `💰 مبلغ: <b>${amountStr}</b>` +
          (discPct > 0 ? ` 🔥 <i>(تخفیف ${discPct}% اعمال شد)</i>` : "") +
          `\n📋 آدرس کیف پول:\n<code>${wallet}</code>\n\n` +
          `⚠️ <b>فقط شبکه ${network} قبول می‌شود</b>\n📸 پس از انتقال، رسید را ارسال کنید.`
        : `₿ <b>Pay with ${name} (${network})</b>\n\n` +
          `💰 Amount: <b>${amountStr}</b>\n📋 Wallet:\n<code>${wallet}</code>\n\n` +
          `⚠️ <b>Only ${network} network accepted</b>\n📸 Send receipt after transfer.`;

      let linkKb: InlineKeyboard | undefined;
      if (symbol === "USDT" && network === "TRC20") {
        linkKb = new InlineKeyboard().url(t(lang).cryptoPaymentLinkBtn, buildTrustWalletLink(wallet, amountRaw));
      }

      await ctx.editMessageText(info, { parse_mode: "HTML", reply_markup: linkKb });
      await ctx.reply(t(lang).uploadReceipt, {
        reply_markup: { keyboard: [[{ text: t(lang).cancel }]], resize_keyboard: true, one_time_keyboard: true },
      });
      await ctx.answerCallbackQuery();
    }
  });

  // ─── Multi-currency crypto: currency selected ─────────────────────────────
  bot.callbackQuery(/^crypto_buy:(\d+)$/, async (ctx) => {
    const tgId    = ctx.from!.id;
    const user    = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang    = (user?.language as "fa" | "en") ?? "fa";
    const pkgId   = ctx.session.pendingPaymentPackageId;
    if (!pkgId) { await ctx.answerCallbackQuery(); return; }

    const currencies = await getCryptoCurrencies();
    const idx = parseInt(ctx.match![1], 10);
    const c   = currencies[idx];
    if (!c) { await ctx.answerCallbackQuery("❌"); return; }

    const discPct  = ctx.session.pendingDiscountPercent ?? 0;
    const discCode = ctx.session.pendingDiscountCodeId;

    const payment = await createPayment(tgId, pkgId, "crypto", {
      discountPercent: discPct,
      discountCodeId:  discCode,
    });
    if (discCode) {
      await useDiscountCode(discCode).catch(() => {});
      ctx.session.pendingDiscountCodeId  = undefined;
      ctx.session.pendingDiscountPercent = undefined;
    }
    ctx.session.pendingPaymentMethod = "crypto";

    const cgId     = c.coinGeckoId ?? c.symbol.toLowerCase();
    const priceIrt = await fetchCryptoPriceWithFallback(cgId);
    // If currency=USD (gateway-scoped crypto package), price IS already USD; otherwise IRT
    let amountRaw  = payment.currency === "USD"
      ? (priceIrt && priceIrt > 0 ? payment.price / (priceIrt / 30000) : payment.price)
      : (priceIrt && priceIrt > 0 ? payment.price / priceIrt : payment.price / 30000);
    const amountStr = amountRaw < 0.001
      ? `${amountRaw.toFixed(8)} ${c.symbol}`
      : `${amountRaw.toFixed(6)} ${c.symbol}`;

    const info = lang === "fa"
      ? `₿ <b>پرداخت با ${c.name} (${c.network})</b>\n\n` +
        `💰 مبلغ: <b>${amountStr}</b>` +
        (discPct > 0 ? ` 🔥 <i>(تخفیف ${discPct}% اعمال شد)</i>` : "") +
        `\n📋 آدرس:\n<code>${c.address}</code>\n\n` +
        `⚠️ <b>فقط شبکه ${c.network} قبول می‌شود</b>\n📸 رسید را پس از انتقال ارسال کنید.`
      : `₿ <b>Pay with ${c.name} (${c.network})</b>\n\n` +
        `💰 Amount: <b>${amountStr}</b>\n📋 Address:\n<code>${c.address}</code>\n\n` +
        `⚠️ <b>Only ${c.network} network accepted</b>\n📸 Send receipt after transfer.`;

    let linkKb: InlineKeyboard | undefined;
    if (c.symbol === "USDT" && c.network === "TRC20") {
      linkKb = new InlineKeyboard().url(t(lang).cryptoPaymentLinkBtn, buildTrustWalletLink(c.address, amountRaw));
    }

    await ctx.editMessageText(info, { parse_mode: "HTML", reply_markup: linkKb });
    await ctx.reply(t(lang).uploadReceipt, {
      reply_markup: { keyboard: [[{ text: t(lang).cancel }]], resize_keyboard: true, one_time_keyboard: true },
    });
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

    ctx.session.pendingPaymentPackageId = undefined;
    ctx.session.pendingPaymentMethod    = undefined;

    await ctx.reply(t(lang).receiptSubmitted, { reply_markup: mainMenuKeyboard(lang) });

    // Route receipt to per-gateway review group (with fallback to payment_review_group)
    const METHOD_GROUP_SETTING: Record<string, string> = {
      card:    "card_review_group",
      crypto:  "crypto_review_group",
      gateway: "tetrapay_review_group",
      plisio:  "plisio_review_group",
    };
    const groupKey = METHOD_GROUP_SETTING[pendingPayment.method] ?? "payment_review_group";
    const rawGroupId = (await getSetting(groupKey)) ?? (await getSetting("payment_review_group"));
    if (rawGroupId) {
      const groupId  = parseInt(rawGroupId, 10);
      const reviewText = t("fa").paymentReviewMsg(pendingPayment);
      const msg = await bot.api
        .sendPhoto(groupId, fileId, {
          caption:      reviewText,
          reply_markup: paymentReviewKeyboard(pendingPayment.id, "fa"),
          parse_mode:   "Markdown",
        })
        .catch(() => null);
      if (msg) await setAdminMessageId(pendingPayment.id, msg.message_id, groupId);
    }
  });

  // ─── STEP 2: package selection (persistent reply-keyboard) ───────────────
  bot.on("message:text", async (ctx, next) => {
    if (ctx.session.step !== "buying:package") return next();
    const tgId   = ctx.from!.id;
    const user   = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang   = (user?.language as "fa" | "en") ?? "fa";
    const text   = ctx.message.text;
    const method = ctx.session.pendingPaymentMethod as "card" | "crypto" | "gateway" | "plisio" | undefined;

    // Back → return to gateway selection
    if (/^🔙/.test(text)) {
      ctx.session.step                = "buying:gateway";
      ctx.session.pendingPaymentMethod    = undefined;
      ctx.session.pendingPaymentPackageId = undefined;
      ctx.session.pendingDiscountCodeId   = undefined;
      ctx.session.pendingDiscountPercent  = undefined;
      const [cardOn, cryptoOn, gatewayOn, plisioOn] = await Promise.all([
        isMethodEnabled("card"),
        isMethodEnabled("crypto"),
        isMethodEnabled("gateway"),
        isMethodEnabled("plisio"),
      ]);
      await ctx.reply(
        lang === "fa" ? "💰 روش پرداخت را انتخاب کنید:" : "💰 Choose your payment method:",
        { reply_markup: coinsGatewayKeyboard(lang, { card: cardOn, crypto: cryptoOn, gateway: gatewayOn, plisio: plisioOn }) }
      );
      return;
    }

    // Reconstruct button text for each package and find the one that matches
    const packages = await getPackages(method ?? undefined);
    const isUsdMethod = method === "crypto" || method === "plisio";
    const pkg = packages.find(p => {
      const effectivePrice = p.gateway ? p.price : (
        method === "card"    && p.cardPrice    ? p.cardPrice    :
        method === "crypto"  && p.cryptoPrice  ? p.cryptoPrice  :
        method === "gateway" && p.tetrapayPrice ? p.tetrapayPrice :
        method === "plisio"  && (p.plisioPrice ?? p.cryptoPrice) ? (p.plisioPrice ?? p.cryptoPrice)! :
        p.price
      );
      const hasDisc    = (p.discountPercent ?? 0) > 0;
      const label      = p.label ?? (lang === "fa" ? `${p.coins} سکه` : `${p.coins} coins`);
      const usd = p.gateway ? (p.gateway === "crypto" || p.gateway === "plisio") : isUsdMethod;
      const priceStr = usd ? `$${effectivePrice}` : effectivePrice.toLocaleString("fa-IR") + " تومان";
      const expected =
        lang === "fa"
          ? hasDisc
            ? `💎 ${label} | ${priceStr} 🔥-${p.discountPercent}%`
            : `💎 ${label} | ${priceStr}`
          : hasDisc
            ? `💎 ${p.coins} coins | ${priceStr} 🔥-${p.discountPercent}%`
            : `💎 ${p.coins} coins | ${priceStr}`;
      return text === expected;
    });

    if (!pkg) return next();

    ctx.session.step                = undefined;
    ctx.session.pendingPaymentPackageId = pkg.id;
    ctx.session.pendingDiscountCodeId   = undefined;
    ctx.session.pendingDiscountPercent  = undefined;

    // Effective price
    const effectivePrice = pkg.gateway ? pkg.price : (
      method === "card"    && pkg.cardPrice    ? pkg.cardPrice    :
      method === "crypto"  && pkg.cryptoPrice  ? pkg.cryptoPrice  :
      method === "gateway" && pkg.tetrapayPrice ? pkg.tetrapayPrice :
      method === "plisio"  && (pkg.plisioPrice ?? pkg.cryptoPrice) ? (pkg.plisioPrice ?? pkg.cryptoPrice)! :
      pkg.price
    );
    const usdPkg = pkg.gateway ? (pkg.gateway === "crypto" || pkg.gateway === "plisio") : isUsdMethod;
    const priceStr = usdPkg ? `$${effectivePrice}` : effectivePrice.toLocaleString("fa-IR") + " تومان";
    const discPct  = pkg.discountPercent ?? 0;

    const discKb = new InlineKeyboard()
      .text(lang === "fa" ? "🏷️ دارم کد تخفیف" : "🏷️ I have a discount code", "discount:enter").row()
      .text(lang === "fa" ? "⏭️ ندارم، ادامه"   : "⏭️ Skip, continue",          "discount:skip");

    const msg = lang === "fa"
      ? `✅ *بسته انتخاب شد: ${pkg.label ?? pkg.coins + " سکه"}*\n` +
        `💵 قیمت: *${priceStr}*` +
        (discPct > 0 ? ` 🔥 (${discPct}% تخفیف)` : "") +
        `\n\n🏷️ آیا کد تخفیف دارید؟`
      : `✅ *Package: ${pkg.coins} coins*\n💵 Price: *${priceStr}*` +
        (discPct > 0 ? ` 🔥 (${discPct}% off)` : "") +
        `\n\n🏷️ Do you have a discount code?`;

    await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: discKb });
  });

  // ─── Text: discount code input ────────────────────────────────────────────
  bot.on("message:text", async (ctx, next) => {
    if (ctx.session.step !== "buying:discount_code") return next();
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";
    ctx.session.step = undefined;
    const code = ctx.message.text.trim();

    const result = await validateDiscountCode(code);
    if (!result.valid) {
      const errMap: Record<string, string> = {
        invalid: lang === "fa" ? "❌ کد تخفیف معتبر نیست." : "❌ Invalid discount code.",
        expired: lang === "fa" ? "❌ این کد منقضی شده."     : "❌ This code has expired.",
        used_up: lang === "fa" ? "❌ این کد به حداکثر استفاده رسیده." : "❌ Code usage limit reached.",
      };
      const retryKb = new InlineKeyboard()
        .text(lang === "fa" ? "🔄 دوباره امتحان"  : "🔄 Try again", "discount:enter").row()
        .text(lang === "fa" ? "⏭️ بدون کد ادامه" : "⏭️ Continue without code", "discount:skip");
      await ctx.reply((errMap[result.error ?? "invalid"] ?? errMap.invalid));
      await ctx.reply(lang === "fa" ? "چه می‌خواهید بکنید؟" : "What would you like to do?", { reply_markup: retryKb });
      return;
    }

    ctx.session.pendingDiscountCodeId   = result.codeId;
    ctx.session.pendingDiscountPercent  = result.discountPercent;

    await ctx.reply(
      lang === "fa"
        ? `✅ کد تخفیف *${result.discountPercent}%* با موفقیت اعمال شد! 🎉`
        : `✅ Discount code applied: *${result.discountPercent}%* off! 🎉`,
      { parse_mode: "Markdown" }
    );

    const method = ctx.session.pendingPaymentMethod as "card" | "crypto" | "gateway" | undefined;
    const pkgId  = ctx.session.pendingPaymentPackageId;

    // Text-keyboard flow: method already chosen
    if (method && pkgId) {
      await handlePaymentByMethod(
        ctx, bot, lang, tgId, method, pkgId,
        result.discountPercent ?? 0, result.codeId
      );
      return;
    }

    // Inline flow fallback: show method selection
    const enabled = {
      card:    await isMethodEnabled("card"),
      crypto:  await isMethodEnabled("crypto"),
      gateway: await isMethodEnabled("gateway"),
    };
    await ctx.reply(t(lang).selectPaymentMethod, { reply_markup: paymentMethodKeyboard(lang, enabled) });
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

    const [inviterRewardStr, inviteeRewardStr, customBannerText] = await Promise.all([
      getSetting("referral_reward_inviter"),
      getSetting("referral_reward_invitee"),
      getSetting("referral_banner_text"),
    ]);
    const inviterReward = parseInt(inviterRewardStr ?? "10", 10);
    const inviteeReward = parseInt(inviteeRewardStr ?? "5", 10);

    // Message 1: link info (copyable) — HTML to avoid URL underscore conflicts
    await ctx.reply(t(lang).referralLinkMsg(link), { parse_mode: "HTML" });

    // Message 2: forward-able promotional banner — custom or default
    const bannerText = customBannerText && customBannerText.trim()
      ? customBannerText
          .replace(/\{link\}/g, link)
          .replace(/\{inviterReward\}/g, String(inviterReward))
          .replace(/\{inviteeReward\}/g, String(inviteeReward))
          .replace(/\{botUsername\}/g, botUsername)
      : t(lang).referralBanner(link, inviterReward, inviteeReward, botUsername);

    await ctx.reply(bannerText, {
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

  // ─── Leaderboard ──────────────────────────────────────────────────────────
  bot.hears(["🏆 برترین کاربران", "🏆 Top Users"], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    const [top, myRankInfo] = await Promise.all([
      getTopReferrers(20),
      getReferralRank(tgId),
    ]);

    if (top.length === 0) {
      let emptyMsg = t(lang).leaderboardEmpty;
      if (myRankInfo) {
        emptyMsg += t(lang).leaderboardMyRank(myRankInfo.rank, myRankInfo.count);
      }
      await ctx.reply(emptyMsg, { parse_mode: "Markdown" });
      return;
    }

    const lastUpdated = getLeaderboardLastUpdated();
    const minutesAgo = lastUpdated ? Math.floor((Date.now() - lastUpdated) / 60_000) : 0;

    // Find if current user is in the top list
    const myIndexInTop = top.findIndex((e) => e.telegramId === tgId);

    let msg = t(lang).leaderboardTitle(minutesAgo);
    for (let i = 0; i < top.length; i++) {
      const entry = top[i];
      const isMe = i === myIndexInTop;
      // Anonymize: show first 2 chars + *** (own name shown slightly differently when "isMe")
      const raw  = entry.firstName ?? "?";
      const safe = raw.replace(/[*_`[\]()~>#+=|{}.!-]/g, "\\$&");
      const anon = isMe
        ? safe.slice(0, 3) + "\\*\\*\\*"
        : (safe.length > 1 ? safe.slice(0, 2) + "\\*\\*\\*" : safe.slice(0, 1) + "\\*\\*\\*");
      msg += t(lang).leaderboardRow(i + 1, anon, entry.referralCount, isMe);
    }

    // Show user's rank footer
    if (myIndexInTop < 0) {
      // Not in top 20 — show their rank below
      msg += myRankInfo
        ? t(lang).leaderboardMyRank(myRankInfo.rank, myRankInfo.count)
        : t(lang).leaderboardNotRanked;
    }

    msg += t(lang).leaderboardFooter;

    await ctx.reply(msg, { parse_mode: "Markdown" });
  });

  // ─── Gift code button ─────────────────────────────────────────────────────
  bot.hears(["🎟️ کد هدیه", "🎟️ Gift Code"], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    ctx.session.giftCodeInput = true;
    const cancelKb = {
      keyboard: [[{ text: t(lang).cancel }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    };
    await ctx.reply(t(lang).giftCodePrompt, { parse_mode: "Markdown", reply_markup: cancelKb });
  });

  // ─── Spin Wheel — text button ─────────────────────────────────────────────
  bot.hears(["🎰 گردونه شانس", "🎰 Spin Wheel"], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    const alreadySpun = await hasSpunToday(tgId);
    const kb = alreadySpun
      ? undefined
      : new InlineKeyboard().text(t(lang).spinWheelBtn, "spin:do");

    await ctx.reply(t(lang).spinWheelIntro(alreadySpun), {
      parse_mode: "Markdown",
      reply_markup: kb,
    });
  });

  // ─── Spin Wheel — callback (actual spin) ──────────────────────────────────
  bot.callbackQuery("spin:do", async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";

    // Show spinning animation immediately
    await ctx.editMessageText(t(lang).spinSpinning, { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();

    // Short delay for suspense (1.5s)
    await new Promise<void>((resolve) => setTimeout(resolve, 1500));

    const result = await spinWheel(tgId);

    if (!result.success) {
      if (result.reason === "already_spun") {
        await ctx.editMessageText(t(lang).spinAlreadySpun, { parse_mode: "Markdown" });
      }
      return;
    }

    const msg = result.tier === "high"
      ? t(lang).spinResultHigh(result.coins, result.newBalance)
      : t(lang).spinResultLow(result.coins, result.newBalance);

    await ctx.editMessageText(msg, { parse_mode: "Markdown" });
  });

  // ─── Telegram Stars: pre-checkout validation ─────────────────────────────
  bot.on("pre_checkout_query", async (ctx) => {
    const payload = ctx.preCheckoutQuery.invoice_payload;
    if (!payload.startsWith("stars_")) {
      await ctx.answerPreCheckoutQuery(false, "Invalid payment payload");
      return;
    }
    const paymentId = parseInt(payload.slice(6), 10);
    if (isNaN(paymentId)) {
      await ctx.answerPreCheckoutQuery(false, "Invalid payment ID");
      return;
    }
    const payment = await getPendingPayment(ctx.from.id);
    // Verify this specific payment record is still pending
    if (!payment || payment.id !== paymentId || payment.status !== "pending") {
      await ctx.answerPreCheckoutQuery(false, "This payment has already been processed or expired.");
      return;
    }
    // All good — confirm the checkout
    await ctx.answerPreCheckoutQuery(true);
  });

  // ─── Telegram Stars: successful payment handler ───────────────────────────
  bot.on("message:successful_payment", async (ctx) => {
    const sp = ctx.message.successful_payment;
    if (!sp.invoice_payload.startsWith("stars_")) return;

    const tgId      = ctx.from!.id;
    const paymentId = parseInt(sp.invoice_payload.slice(6), 10);
    const chargeId  = sp.telegram_payment_charge_id;
    const user      = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang      = (user?.language as "fa" | "en") ?? "fa";

    // Atomically approve the payment (idempotent — returns null if already processed)
    const payment = await approveStarsPayment(paymentId, chargeId);
    if (!payment) {
      // Already approved (duplicate event) — silently ignore
      return;
    }

    // Credit coins to user
    const { addCoins } = await import("../services/coin.service.js");
    await addCoins(tgId, payment.coins, "payment", `⭐ خرید ${payment.coins} سکه با استارز`);

    // Reset session
    ctx.session.pendingPaymentMethod    = undefined;
    ctx.session.pendingPaymentPackageId = undefined;

    await ctx.reply(
      lang === "fa"
        ? `✅ *پرداخت موفق!*\n\n` +
          `⭐ ${sp.total_amount} استارز دریافت شد\n` +
          `💎 *${payment.coins} سکه* به حساب شما اضافه شد!\n\n` +
          `از خرید شما متشکریم 🙏`
        : `✅ *Payment Successful!*\n\n` +
          `⭐ ${sp.total_amount} Stars received\n` +
          `💎 *${payment.coins} coins* added to your account!\n\n` +
          `Thank you for your purchase 🙏`,
      { parse_mode: "Markdown", reply_markup: mainMenuKeyboard(lang) }
    );
  });

  // ─── Gift code text input ─────────────────────────────────────────────────
  bot.on("message:text", async (ctx, next) => {
    if (!ctx.session.giftCodeInput) return next();

    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";

    ctx.session.giftCodeInput = false;

    const result = await redeemGiftCode(tgId, ctx.message.text);

    if (result.success) {
      await ctx.reply(t(lang).giftCodeSuccess(result.coins), {
        parse_mode: "Markdown",
        reply_markup: mainMenuKeyboard(lang),
      });
      return;
    }

    const errMsg: Record<string, string> = {
      invalid:      t(lang).giftCodeInvalid,
      expired:      t(lang).giftCodeExpired,
      inactive:     t(lang).giftCodeExpired,
      already_used: t(lang).giftCodeAlreadyUsed,
    };
    await ctx.reply(errMsg[result.error] ?? t(lang).giftCodeInvalid, {
      parse_mode: "Markdown",
      reply_markup: inviteMenuKeyboard(lang),
    });
  });
}

