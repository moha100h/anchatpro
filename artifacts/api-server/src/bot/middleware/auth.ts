import type { NextFunction } from "grammy";
import type { BotContext } from "../context.js";
import { getUserByTelegramId, getOrCreateUser } from "../services/user.service.js";
import { isAdmin } from "../handlers/admin.js";
import { t } from "../i18n/index.js";

export async function authMiddleware(ctx: BotContext, next: NextFunction): Promise<void> {
  if (!ctx.from) return next();
  const telegramId = ctx.from.id;
  const user = await getUserByTelegramId(telegramId);
  ctx.dbUser = user;

  // Admins and super-admins are NEVER blocked — even if their DB status is banned
  if (user?.status === "banned" && !isAdmin(telegramId)) {
    const lang = user.language ?? "fa";
    await ctx.reply(t(lang).userBanned);
    return;
  }

  return next();
}
