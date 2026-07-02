import { Bot } from "grammy";
import type { BotContext } from "../context.js";
import {
  getUserByTelegramId,
  updateUser,
  setUserLanguage,
  setUserSetupStep,
} from "../services/user.service.js";
import { t } from "../i18n/index.js";
import {
  mainMenuKeyboard,
  magicMenuKeyboard,
  settingsKeyboard,
  genderKeyboard,
  cancelKeyboard,
  languageKeyboard,
} from "../keyboards/main.js";

export function registerSettingsHandlers(bot: Bot<BotContext>) {
  // ─── Cancel handler (setup step changes) ────────────────────────────────────
  // Fires AFTER matching.ts and coins.ts cancel handlers (both call next() when not handled).
  // Handles cancel during change_age / change_gender / change_language flows.
  bot.hears([/^❌ لغو/, /^❌ Cancel/], async (ctx, next) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return next();
    const lang = (user.language as "fa" | "en") ?? "fa";

    const isSettingsStep =
      user.setupStep === "change_age" ||
      user.setupStep === "change_gender" ||
      user.setupStep === "change_language";

    if (isSettingsStep) {
      await setUserSetupStep(tgId, null);
      await ctx.reply(t(lang).cancelledAction, { reply_markup: mainMenuKeyboard(lang) });
      return; // handled
    }

    // Final fallback: if in magic step → magic menu, else main menu
    if (ctx.session.magicStep) {
      ctx.session.magicStep = undefined;
      await ctx.reply(t(lang).cancelledAction, { reply_markup: magicMenuKeyboard(lang) });
    } else {
      await ctx.reply(t(lang).cancelledAction, { reply_markup: mainMenuKeyboard(lang) });
    }
  });

  // ─── Open settings menu ──────────────────────────────────────────────────────
  bot.hears([/^⚙️ تنظیمات/, /^⚙️ Settings/], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";
    // Clear any stale payment/step session state
    ctx.session.step                    = undefined;
    ctx.session.pendingPaymentMethod    = undefined;
    ctx.session.pendingPaymentPackageId = undefined;
    ctx.session.pendingDiscountCodeId   = undefined;
    ctx.session.pendingDiscountPercent  = undefined;

    const genderLabel =
      user.gender === "male"   ? t(lang).male
      : user.gender === "female" ? t(lang).female
      : t(lang).other;
    const profileInfo = t(lang).currentProfile(genderLabel, user.age ?? 0, user.city);

    await ctx.reply(`${t(lang).settingsMenu}\n\n${profileInfo}`, {
      parse_mode: "Markdown",
      reply_markup: settingsKeyboard(lang),
    });
  });

  // ─── Initiate gender change ──────────────────────────────────────────────────
  bot.hears([/^👤 تغییر جنسیت/, /^👤 Change Gender/], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";
    await setUserSetupStep(tgId, "change_gender");
    await ctx.reply(t(lang).selectGender, { reply_markup: genderKeyboard(lang) });
  });

  // ─── Initiate age change ─────────────────────────────────────────────────────
  bot.hears([/^🎂 تغییر سن/, /^🎂 Change Age/], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";
    await setUserSetupStep(tgId, "change_age");
    await ctx.reply(t(lang).selectAge, { reply_markup: cancelKeyboard(lang) });
  });

  // ─── Initiate city change ────────────────────────────────────────────────────
  bot.hears([/^🏙️ تغییر شهر/, /^🏙️ Change City/], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";
    await setUserSetupStep(tgId, "change_city");
    const prompt = lang === "fa"
      ? "🏙️ شهر جدید خود را وارد کنید:\n(برای پاک کردن شهر، یک نقطه «.» بفرستید)"
      : "🏙️ Enter your new city:\n(Send a dot «.» to clear your city)";
    await ctx.reply(prompt, { reply_markup: cancelKeyboard(lang) });
  });

  // ─── Initiate language change ────────────────────────────────────────────────
  bot.hears([/^🌐 تغییر زبان/, /^🌐 Change Language/], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";
    await setUserSetupStep(tgId, "change_language");
    await ctx.reply(t(lang).changeLanguage, { reply_markup: languageKeyboard() });
  });

  // ─── Back button — always return to main menu (catch-all, runs AFTER matching.ts) ────
  bot.hears([/^🔙 بازگشت/, /^🔙 Back/], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";
    // Clear all step-related state
    await setUserSetupStep(tgId, null);
    ctx.session.magicStep     = undefined;
    ctx.session.magicChainId  = undefined;
    ctx.session.step          = undefined;
    ctx.session.adminAction   = undefined;
    ctx.session.giftCodeInput = false;
    await ctx.reply("🏠", { reply_markup: mainMenuKeyboard(lang) });
  });

  // ─── Handle gender selection (change_gender step) ────────────────────────────
  // Registered AFTER start.ts hears handler which calls next() when step !== "select_gender"
  bot.hears(
    [/^(👦 پسر|👧 دختر|👦 مرد|👧 زن|🌈 سایر|👦 Male|👧 Female|🌈 Other)$/],
    async (ctx) => {
      const tgId = ctx.from!.id;
      const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
      if (user?.setupStep !== "change_gender") return;
      const lang = (user.language as "fa" | "en") ?? "fa";

      const text = ctx.message!.text ?? "";
      const gender =
        text.includes("پسر") || text.includes("مرد") || text.includes("Male") ? "male"
        : text.includes("دختر") || text.includes("زن") || text.includes("Female") ? "female"
        : "other";

      await updateUser(tgId, { gender });
      await setUserSetupStep(tgId, null);
      await ctx.reply(t(lang).profileUpdated, { reply_markup: mainMenuKeyboard(lang) });
    }
  );

  // ─── Handle language selection (change_language step) ───────────────────────
  // Registered AFTER start.ts hears handler which calls next() when step !== "select_language"
  bot.hears(["🇮🇷 فارسی", "🇬🇧 English"], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (user?.setupStep !== "change_language") return;

    const lang = ctx.message!.text === "🇮🇷 فارسی" ? "fa" : "en";
    await setUserLanguage(tgId, lang);
    await setUserSetupStep(tgId, null);
    await ctx.reply(t(lang).profileUpdated, { reply_markup: mainMenuKeyboard(lang) });
  });

  // ─── Handle city input (change_city step) ───────────────────────────────────
  bot.on("message:text", async (ctx, next) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (user?.setupStep !== "change_city") return next();
    const lang = (user.language as "fa" | "en") ?? "fa";

    const raw  = ctx.message.text.trim();
    const city = raw === "." ? null : raw.slice(0, 64);
    await updateUser(tgId, { city });
    await setUserSetupStep(tgId, null);
    await ctx.reply(t(lang).profileUpdated, { reply_markup: mainMenuKeyboard(lang) });
  });

  // ─── Handle age input (change_age step) ─────────────────────────────────────
  bot.on("message:text", async (ctx, next) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (user?.setupStep !== "change_age") return next();
    const lang = (user.language as "fa" | "en") ?? "fa";

    const age = parseInt(ctx.message.text.trim(), 10);
    if (isNaN(age) || age < 13 || age > 100) {
      await ctx.reply(t(lang).invalidAge);
      return;
    }
    await updateUser(tgId, { age });
    await setUserSetupStep(tgId, null);
    await ctx.reply(t(lang).profileUpdated, { reply_markup: mainMenuKeyboard(lang) });
  });
}
