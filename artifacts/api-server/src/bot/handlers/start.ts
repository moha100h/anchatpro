import { Bot } from "grammy";
import type { BotContext } from "../context.js";
import {
  getOrCreateUser,
  updateUser,
  setUserSetupStep,
  setUserLanguage,
  getUserByTelegramId,
  getUserByAnonToken,
} from "../services/user.service.js";
import { processReferralReward } from "../services/coin.service.js";
import { getSetting } from "../services/payment.service.js";
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
    const arg = ctx.match?.trim() ?? "";

    // ── 1. Handle anonymous link (a_ or anon_ prefix) ──────────────────────
    if (arg.startsWith("a_") || arg.startsWith("anon_")) {
      const token = arg.startsWith("a_") ? arg.slice(2) : arg.slice(5);
      const receiver = await getUserByAnonToken(token);
      if (receiver && receiver.telegramId !== tgId) {
        const sender = await getOrCreateUser(tgId, ctx.from!.first_name, ctx.from!.username);
        if (!sender.gender || !sender.age) {
          // New/incomplete user → save pending anon + start setup
          ctx.session.step = `pending_anon:${receiver.telegramId}`;
          await setUserLanguage(tgId, "fa");
          await setUserSetupStep(tgId, "select_language");
          const customWelcome = await getSetting("welcome_message");
          if (customWelcome) await ctx.reply(customWelcome);
          await ctx.reply(BILINGUAL_WELCOME, { reply_markup: languageKeyboard() });
          return;
        }
        // Existing complete user → go directly to anon send
        ctx.session.step = `anon_send:${receiver.telegramId}`;
        const lang = (sender.language as "fa" | "en") ?? "fa";
        await ctx.reply(t(lang).sendAnonMsg, { reply_markup: { remove_keyboard: true } });
        return;
      }
      // Invalid token or self-link → fall through to normal /start
    }

    // ── 2. Extract referral code (supports ref_ and r_ formats) ────────────
    let referralCode: string | undefined;
    if (arg.startsWith("ref_")) referralCode = arg.slice(4);
    else if (arg.startsWith("r_")) referralCode = arg.slice(2);

    // ── 3. Get or create user ───────────────────────────────────────────────
    const user = await getOrCreateUser(tgId, ctx.from!.first_name, ctx.from!.username, referralCode);
    const lang = (user.language as "fa" | "en") ?? "fa";

    // ── 4. New user → setup flow ────────────────────────────────────────────
    if (!user.gender || !user.age) {
      await setUserLanguage(tgId, "fa");
      await setUserSetupStep(tgId, "select_language");
      const customWelcome = await getSetting("welcome_message");
      if (customWelcome) await ctx.reply(customWelcome);
      await ctx.reply(BILINGUAL_WELCOME, { reply_markup: languageKeyboard() });
      return;
    }

    // ── 5. Existing user → clear stuck state + show main menu ──────────────
    if (user.setupStep) await setUserSetupStep(tgId, null);
    await processReferralReward(tgId);
    if (referralCode) await ctx.reply(t(lang).referralWelcome(user.firstName ?? "کاربر"));
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

    // ── Age step ──────────────────────────────────────────────────────────────
    if (user?.setupStep === "select_age") {
      const lang = (user?.language as "fa" | "en") ?? "fa";
      const age = parseInt(ctx.message.text.trim(), 10);

      if (isNaN(age) || age < 13 || age > 100) {
        await ctx.reply(t(lang).invalidAge);
        return;
      }

      await updateUser(tgId, { age });
      // Move to city step instead of finishing setup
      await setUserSetupStep(tgId, "select_city");
      await ctx.reply(t(lang).selectCity, { reply_markup: { remove_keyboard: true } });
      return;
    }

    // ── City step ─────────────────────────────────────────────────────────────
    if (user?.setupStep === "select_city") {
      const lang = (user?.language as "fa" | "en") ?? "fa";
      const input = ctx.message.text.trim();

      // "." or empty = skip city
      const city = input === "." || input === "" ? null : input.slice(0, 100);
      if (city !== null) {
        await updateUser(tgId, { city });
      }

      // Finish setup
      await setUserSetupStep(tgId, null);
      await processReferralReward(tgId);

      // Check for pending anon link (user clicked anon link before completing setup)
      const pendingStep = ctx.session.step;
      ctx.session.step = undefined;
      if (pendingStep?.startsWith("pending_anon:")) {
        const receiverId = pendingStep.slice(13);
        ctx.session.step = `anon_send:${receiverId}`;
        await ctx.reply(t(lang).sendAnonMsg, { reply_markup: { remove_keyboard: true } });
      } else {
        await ctx.reply(t(lang).profileComplete, { reply_markup: mainMenuKeyboard(lang) });
      }
      return;
    }

    return next();
  });
}
