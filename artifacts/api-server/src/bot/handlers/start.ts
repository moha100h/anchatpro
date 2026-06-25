import { Bot } from "grammy";
import type { BotContext } from "../context.js";
import { getOrCreateUser, updateUser, setUserSetupStep, setUserLanguage, getUserByTelegramId } from "../services/user.service.js";
import { processReferralReward } from "../services/coin.service.js";
import { t } from "../i18n/index.js";
import { languageKeyboard, genderKeyboard, mainMenuKeyboard } from "../keyboards/main.js";

export function registerStartHandler(bot: Bot<BotContext>) {
  bot.command("start", async (ctx) => {
    const tgId = ctx.from!.id;
    const args = ctx.match?.trim();
    let referralCode: string | undefined;

    if (args?.startsWith("ref_")) {
      referralCode = args.replace("ref_", "");
    }

    const user = await getOrCreateUser(tgId, ctx.from!.first_name, ctx.from!.username, referralCode);

    // New user — start setup
    if (!user.gender || !user.age) {
      await setUserLanguage(tgId, "fa");
      await ctx.reply(t("fa").welcome, { reply_markup: languageKeyboard() });
      await setUserSetupStep(tgId, "select_language");
      return;
    }

    // Existing user — show main menu
    const lang = (user.language as "fa" | "en") ?? "fa";
    await processReferralReward(tgId);

    if (referralCode) {
      const referrer = await getUserByTelegramId(user.telegramId);
      await ctx.reply(t(lang).referralWelcome(referrer?.firstName ?? "کاربر"));
    }

    await ctx.reply(t(lang).profileComplete, { reply_markup: mainMenuKeyboard(lang) });
  });

  // Language selection
  bot.hears(["🇮🇷 فارسی", "🇬🇧 English"], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);

    if (user?.setupStep !== "select_language") return;

    const lang = ctx.message!.text === "🇮🇷 فارسی" ? "fa" : "en";
    await setUserLanguage(tgId, lang);
    await setUserSetupStep(tgId, "select_gender");

    await ctx.reply(t(lang).selectGender, { reply_markup: genderKeyboard(lang) });
  });

  // Gender selection during setup
  bot.hears([/^(👦 مرد|👧 زن|🌈 سایر|👦 Male|👧 Female|🌈 Other)$/], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);

    if (user?.setupStep !== "select_gender") return;

    const text = ctx.message!.text ?? "";
    const gender = text.includes("مرد") || text.includes("Male") ? "male"
      : text.includes("زن") || text.includes("Female") ? "female"
      : "other";

    await updateUser(tgId, { gender });
    await setUserSetupStep(tgId, "select_age");

    const lang = (user?.language as "fa" | "en") ?? "fa";
    await ctx.reply(t(lang).selectAge, { reply_markup: { remove_keyboard: true } });
  });

  // Age input during setup
  bot.on("message:text", async (ctx, next) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);

    if (user?.setupStep !== "select_age") return next();

    const age = parseInt(ctx.message.text.trim(), 10);
    const lang = (user?.language as "fa" | "en") ?? "fa";

    if (isNaN(age) || age < 13 || age > 100) {
      await ctx.reply(t(lang).invalidAge);
      return;
    }

    await updateUser(tgId, { age, setupStep: undefined });
    await processReferralReward(tgId);

    await ctx.reply(t(lang).profileComplete, { reply_markup: mainMenuKeyboard(lang) });
  });
}
