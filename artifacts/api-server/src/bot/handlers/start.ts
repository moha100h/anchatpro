import { Bot } from "grammy";
import type { BotContext } from "../context.js";
import {
  getOrCreateUser,
  updateUser,
  setUserSetupStep,
  setUserLanguage,
  getUserByTelegramId,
} from "../services/user.service.js";
import { processReferralReward } from "../services/coin.service.js";
import { t } from "../i18n/index.js";
import { languageKeyboard, genderKeyboard, mainMenuKeyboard } from "../keyboards/main.js";

// Bilingual welcome shown before language is selected
const BILINGUAL_WELCOME =
  "👋 سلام! به ربات ناشناس خوش آمدید!\n" +
  "🇮🇷 لطفاً زبان خود را انتخاب کنید:\n\n" +
  "👋 Welcome to the Anonymous Chat Bot!\n" +
  "🇬🇧 Please select your language:";

export function registerStartHandler(bot: Bot<BotContext>) {
  // /start command
  bot.command("start", async (ctx) => {
    const tgId = ctx.from!.id;
    const args = ctx.match?.trim();
    let referralCode: string | undefined;

    if (args?.startsWith("ref_")) {
      referralCode = args.replace("ref_", "");
    }

    const user = await getOrCreateUser(tgId, ctx.from!.first_name, ctx.from!.username, referralCode);
    const lang = (user.language as "fa" | "en") ?? "fa";

    // New user — start setup flow
    if (!user.gender || !user.age) {
      await setUserLanguage(tgId, "fa");
      await setUserSetupStep(tgId, "select_language");
      await ctx.reply(BILINGUAL_WELCOME, { reply_markup: languageKeyboard() });
      return;
    }

    // Existing user — clear any stuck setup state and show main menu
    if (user.setupStep) {
      await setUserSetupStep(tgId, null);
    }

    await processReferralReward(tgId);

    if (referralCode) {
      await ctx.reply(t(lang).referralWelcome(user.firstName ?? "کاربر"));
    }

    await ctx.reply(t(lang).profileComplete, { reply_markup: mainMenuKeyboard(lang) });
  });

  // ─── Language selection (initial setup only) ────────────────────────────────
  // IMPORTANT: must call next() when step doesn't match so settings.ts handler fires
  bot.hears(["🇮🇷 فارسی", "🇬🇧 English"], async (ctx, next) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);

    // Only handle during initial language-selection step; defer to settings.ts otherwise
    if (user?.setupStep !== "select_language") return next();

    const lang = ctx.message!.text === "🇮🇷 فارسی" ? "fa" : "en";
    await setUserLanguage(tgId, lang);
    await setUserSetupStep(tgId, "select_gender");
    await ctx.reply(t(lang).selectGender, { reply_markup: genderKeyboard(lang) });
  });

  // ─── Gender selection (initial setup only) ──────────────────────────────────
  // IMPORTANT: must call next() when step doesn't match so settings.ts handler fires
  bot.hears(
    [/^(👦 مرد|👧 زن|🌈 سایر|👦 Male|👧 Female|🌈 Other)$/],
    async (ctx, next) => {
      const tgId = ctx.from!.id;
      const user = ctx.dbUser ?? await getUserByTelegramId(tgId);

      // Only handle during initial gender-selection step; defer to settings.ts otherwise
      if (user?.setupStep !== "select_gender") return next();

      const text = ctx.message!.text ?? "";
      const gender =
        text.includes("مرد") || text.includes("Male") ? "male"
        : text.includes("زن") || text.includes("Female") ? "female"
        : "other";

      const lang = (user?.language as "fa" | "en") ?? "fa";
      await updateUser(tgId, { gender });
      await setUserSetupStep(tgId, "select_age");
      await ctx.reply(t(lang).selectAge, { reply_markup: { remove_keyboard: true } });
    }
  );

  // ─── Age input (initial setup only) ─────────────────────────────────────────
  bot.on("message:text", async (ctx, next) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);

    if (user?.setupStep !== "select_age") return next();

    const lang = (user?.language as "fa" | "en") ?? "fa";
    const age = parseInt(ctx.message.text.trim(), 10);

    if (isNaN(age) || age < 13 || age > 100) {
      await ctx.reply(t(lang).invalidAge);
      return;
    }

    // Save age and CLEAR setupStep (null = SQL NULL, not undefined which Drizzle ignores)
    await updateUser(tgId, { age });
    await setUserSetupStep(tgId, null);
    await processReferralReward(tgId);
    await ctx.reply(t(lang).profileComplete, { reply_markup: mainMenuKeyboard(lang) });
  });
}
