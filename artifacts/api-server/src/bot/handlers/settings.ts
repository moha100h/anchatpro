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
  settingsKeyboard,
  genderKeyboard,
  cancelKeyboard,
  languageKeyboard,
} from "../keyboards/main.js";

export function registerSettingsHandlers(bot: Bot<BotContext>) {
  // ─── Open settings menu ──────────────────────────────────────────────────────
  bot.hears([/^⚙️ تنظیمات/, /^⚙️ Settings/], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    const genderLabel =
      user.gender === "male" ? t(lang).male
      : user.gender === "female" ? t(lang).female
      : t(lang).other;
    const profileInfo = t(lang).currentProfile(genderLabel, user.age ?? 0);
    await ctx.reply(`${t(lang).settingsMenu}\n\n${profileInfo}`, { reply_markup: settingsKeyboard(lang) });
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

  // ─── Initiate language change ────────────────────────────────────────────────
  bot.hears([/^🌐 تغییر زبان/, /^🌐 Change Language/], async (ctx) => {
    const tgId = ctx.from!.id;
    await setUserSetupStep(tgId, "change_language");
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";
    await ctx.reply(t(lang).changeLanguage, { reply_markup: languageKeyboard() });
  });

  // ─── Back button ─────────────────────────────────────────────────────────────
  bot.hears([/^🔙 بازگشت/, /^🔙 Back/], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";
    await setUserSetupStep(tgId, null);
    await ctx.reply("🏠", { reply_markup: mainMenuKeyboard(lang) });
  });

  // ─── Handle gender selection (change_gender step) ───────────────────────────
  // Registered AFTER start.ts handler which defers via next() when setupStep !== "select_gender"
  bot.hears(
    [/^(👦 مرد|👧 زن|🌈 سایر|👦 Male|👧 Female|🌈 Other)$/],
    async (ctx) => {
      const tgId = ctx.from!.id;
      const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
      if (user?.setupStep !== "change_gender") return;
      const lang = (user.language as "fa" | "en") ?? "fa";

      const text = ctx.message!.text ?? "";
      const gender =
        text.includes("مرد") || text.includes("Male") ? "male"
        : text.includes("زن") || text.includes("Female") ? "female"
        : "other";

      await updateUser(tgId, { gender });
      await setUserSetupStep(tgId, null);
      await ctx.reply(t(lang).profileUpdated, { reply_markup: mainMenuKeyboard(lang) });
    }
  );

  // ─── Handle language selection (change_language step) ───────────────────────
  // Registered AFTER start.ts handler which defers via next() when setupStep !== "select_language"
  bot.hears(["🇮🇷 فارسی", "🇬🇧 English"], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (user?.setupStep !== "change_language") return;

    const lang = ctx.message!.text === "🇮🇷 فارسی" ? "fa" : "en";
    await setUserLanguage(tgId, lang);
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
