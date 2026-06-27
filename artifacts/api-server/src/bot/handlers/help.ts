import { Bot } from "grammy";
import type { BotContext } from "../context.js";
import { getUserByTelegramId } from "../services/user.service.js";
import { getSetting } from "../services/payment.service.js";
import { t } from "../i18n/index.js";
import { mainMenuKeyboard, helpMenuKeyboard } from "../keyboards/main.js";

function getLang(ctx: BotContext): "fa" | "en" {
  return (ctx.dbUser?.language as "fa" | "en") ?? "fa";
}

export function registerHelpHandlers(bot: Bot<BotContext>) {
  // ─── Main help menu ────────────────────────────────────────────────────────
  bot.hears([/^📋 راهنما و قوانین/, /^📋 Help & Rules/], async (ctx) => {
    const lang = getLang(ctx);
    await ctx.reply(t(lang).helpMenuTitle, {
      parse_mode: "Markdown",
      reply_markup: helpMenuKeyboard(lang),
    });
  });

  bot.command("help", async (ctx) => {
    const lang = getLang(ctx);
    await ctx.reply(t(lang).helpMenuTitle, {
      parse_mode: "Markdown",
      reply_markup: helpMenuKeyboard(lang),
    });
  });

  // ─── Section: Anonymous Connect ────────────────────────────────────────────
  bot.hears(["🔗 راهنمای اتصال", "🔗 Connect Guide"], async (ctx) => {
    const lang = getLang(ctx);
    await ctx.reply(t(lang).helpSectionConnect, { parse_mode: "Markdown" });
  });

  // ─── Section: Group ────────────────────────────────────────────────────────
  bot.hears(["👥 راهنمای گروه", "👥 Group Guide"], async (ctx) => {
    const lang = getLang(ctx);
    await ctx.reply(t(lang).helpSectionGroup, { parse_mode: "Markdown" });
  });

  // ─── Section: Anonymous Link ───────────────────────────────────────────────
  bot.hears(["🔗 راهنمای لینک ناشناس", "🔗 Anonymous Link Guide"], async (ctx) => {
    const lang = getLang(ctx);
    await ctx.reply(t(lang).helpSectionLink, { parse_mode: "Markdown" });
  });

  // ─── Section: Coins ────────────────────────────────────────────────────────
  bot.hears(["💰 راهنمای سکه‌ها", "💰 Coins Guide"], async (ctx) => {
    const lang = getLang(ctx);
    await ctx.reply(t(lang).helpSectionCoins, { parse_mode: "Markdown" });
  });

  // ─── Section: Rules ────────────────────────────────────────────────────────
  bot.hears(["🚫 قوانین و مقررات", "🚫 Rules & Regulations"], async (ctx) => {
    const lang = getLang(ctx);
    await ctx.reply(t(lang).helpSectionRules, { parse_mode: "Markdown" });
  });

  // ─── Section: Magic World ──────────────────────────────────────────────────
  bot.hears(["🔮 راهنمای دنیای اسرار", "🔮 Mystery World Guide"], async (ctx) => {
    const lang = getLang(ctx);
    await ctx.reply(t(lang).helpSectionMagic, { parse_mode: "Markdown" });
  });

  // ─── Section: Support contact ──────────────────────────────────────────────
  bot.hears(["💬 پشتیبانی", "💬 Support"], async (ctx) => {
    const lang = getLang(ctx);
    const link = await getSetting("support_link");
    if (!link) {
      await ctx.reply(t(lang).helpSupportNotSet, { parse_mode: "Markdown" });
      return;
    }
    await ctx.reply(t(lang).helpSupportText(link), { parse_mode: "Markdown" });
  });

  // ─── Back from help menu ──────────────────────────────────────────────────
  // Uses the existing back handler priority — this catches back only during help context.
  // The main "back" button is also handled by settings.ts as a catch-all.
}
