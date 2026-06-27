/**
 * Singleton bot instance — allows Express routes to send messages via the bot.
 * Set after createBot() returns in index.ts.
 */

import type { Bot } from "grammy";
import type { BotContext } from "./context.js";

let _bot: Bot<BotContext> | null = null;

export function setBotInstance(bot: Bot<BotContext>): void {
  _bot = bot;
}

export function getBotInstance(): Bot<BotContext> | null {
  return _bot;
}
