import type { NextFunction } from "grammy";
import type { BotContext } from "../context.js";
import { checkRateLimit } from "../services/safety.service.js";
import { t } from "../i18n/index.js";

export async function rateLimitMiddleware(ctx: BotContext, next: NextFunction): Promise<void> {
  if (!ctx.from) return next();
  const userId = ctx.from.id;
  const lang = (ctx.dbUser?.language as "fa" | "en") ?? "fa";

  // 30 messages per 10 seconds for regular messages
  if (ctx.message?.text || ctx.message?.photo || ctx.message?.video) {
    const allowed = await checkRateLimit(userId, "message", 30, 10);
    if (!allowed) {
      await ctx.reply(t(lang).rateLimitExceeded);
      return;
    }
  }

  return next();
}
