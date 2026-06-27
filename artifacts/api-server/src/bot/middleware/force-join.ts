/**
 * Force Join Middleware
 * Checks if a user is a member of the configured channel before allowing access.
 * Admin can enable/disable and configure the channel via the admin panel.
 *
 * Settings stored in admin_settings:
 *   force_join_enabled: "true" | "false"
 *   force_join_channel: "@channelname" or "-100xxxx" (chat ID)
 *   force_join_message: custom message text (optional)
 */

import type { NextFunction } from "grammy";
import type { BotContext } from "../context.js";
import { getSetting } from "../services/payment.service.js";
import { InlineKeyboard } from "grammy";

// Commands that always bypass force-join check
const BYPASS_COMMANDS = new Set(["/start", "/help"]);

// Cache to avoid DB query on every message (5-second TTL)
let cachedEnabled: string | null = null;
let cachedChannel: string | null = null;
let cacheExpiry = 0;

async function getForceJoinConfig(): Promise<{ enabled: boolean; channel: string | null; message: string | null }> {
  const now = Date.now();
  if (now < cacheExpiry) {
    return {
      enabled: cachedEnabled === "true",
      channel: cachedChannel,
      message: null,
    };
  }

  const [enabled, channel] = await Promise.all([
    getSetting("force_join_enabled"),
    getSetting("force_join_channel"),
  ]);

  cachedEnabled = enabled;
  cachedChannel = channel;
  cacheExpiry = now + 5_000; // 5s cache

  return { enabled: enabled === "true", channel, message: null };
}

/** Invalidate cache after admin changes settings */
export function invalidateForceJoinCache(): void {
  cacheExpiry = 0;
}

export async function forceJoinMiddleware(ctx: BotContext, next: NextFunction): Promise<void> {
  if (!ctx.from) return next();

  const config = await getForceJoinConfig();
  if (!config.enabled || !config.channel) return next();

  // Skip for /start command (handled separately to allow referral flow)
  const isStartCmd = ctx.message?.text?.startsWith("/start") ?? false;
  if (isStartCmd) return next();

  // Skip admin commands
  const isAdminCmd = ctx.message?.text?.startsWith("/admin") ?? false;
  if (isAdminCmd) return next();

  // Skip callback queries for join_verified
  const callbackData = ctx.callbackQuery?.data;
  if (callbackData === "check_force_join") {
    // Re-check membership
    try {
      const member = await ctx.api.getChatMember(config.channel, ctx.from.id);
      if (["member", "administrator", "creator"].includes(member.status)) {
        await ctx.answerCallbackQuery("✅");
        await ctx.editMessageReplyMarkup();
        return next();
      }
      await ctx.answerCallbackQuery("❌ هنوز عضو نشده‌اید");
    } catch {
      await ctx.answerCallbackQuery("❌ خطا در بررسی عضویت");
    }
    return;
  }

  try {
    const member = await ctx.api.getChatMember(config.channel, ctx.from.id);
    if (["member", "administrator", "creator"].includes(member.status)) {
      return next(); // Member — allow through
    }
  } catch {
    // getChatMember fails if bot is not in the channel or user not found
    // Fail open (allow through) to avoid blocking all users on misconfiguration
    return next();
  }

  // Not a member — send join prompt
  const customMessage = await getSetting("force_join_message");
  const msg = customMessage || "⚠️ برای استفاده از ربات، ابتدا باید در کانال ما عضو شوید:";

  // Build keyboard with join + check buttons
  const channelDisplay = config.channel.startsWith("@") ? config.channel : "کانال";
  const kb = new InlineKeyboard()
    .url(`📢 عضویت در ${channelDisplay}`, `https://t.me/${config.channel.replace("@", "")}`)
    .row()
    .text("✅ عضو شدم", "check_force_join");

  await ctx.reply(msg, { reply_markup: kb });
}
