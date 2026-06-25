import { Bot } from "grammy";
import type { BotContext } from "../context.js";
import { getUserByTelegramId } from "../services/user.service.js";
import { t } from "../i18n/index.js";

export function registerHelpHandlers(bot: Bot<BotContext>) {
  bot.hears([/^❓ راهنما/, /^❓ Help/], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";
    await ctx.reply(t(lang).helpText, { parse_mode: "Markdown" });
  });

  bot.command("help", async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";
    await ctx.reply(t(lang).helpText, { parse_mode: "Markdown" });
  });
}
