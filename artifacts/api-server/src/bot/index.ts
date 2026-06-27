import { Bot, session } from "grammy";
import type { BotContext, SessionData } from "./context.js";
import { authMiddleware } from "./middleware/auth.js";
import { rateLimitMiddleware } from "./middleware/rate-limit.js";
import { registerStartHandler } from "./handlers/start.js";
import { registerMatchingHandlers } from "./handlers/matching.js";
import { registerGroupHandlers, registerGroupMessageForwarder } from "./handlers/group.js";
import { registerAnonLinkHandlers } from "./handlers/anonymous-link.js";
import { registerProAnonLinkHandlers } from "./handlers/pro-anon-link.js";
import { registerCoinHandlers } from "./handlers/coins.js";
import { registerHelpHandlers } from "./handlers/help.js";
import { registerSettingsHandlers } from "./handlers/settings.js";
import { registerAdminHandlers, setAdminIds } from "./handlers/admin.js";
import { registerMagicHandlers } from "./handlers/magic.js";
import { getDueLetters, markLetterDelivered, expireOldBottles, expireDeliveredBottles, cleanStaleFrequency } from "./services/magic.service.js";
import { ensureDefaultPackages, setSetting, getSetting } from "./services/payment.service.js";
import { initDefaultBadWords, setOwnerIds } from "./services/safety.service.js";
import { getTetraPayCallbackUrl } from "../lib/base-url.js";
import { forceJoinMiddleware } from "./middleware/force-join.js";
import { sendBackup, getBackupConfig } from "./services/backup.service.js";
import { cleanupStaleQueue } from "./services/matching.service.js";
import { getUserByTelegramId, getUsersWithUnreadAnonMessages } from "./services/user.service.js";
import { t } from "./i18n/index.js";
import { mainMenuKeyboard } from "./keyboards/main.js";
import { logger } from "../lib/logger.js";
import cron from "node-cron";

export async function createBot(): Promise<Bot<BotContext>> {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN environment variable is required");

  const adminIdsStr = process.env["ADMIN_IDS"] ?? "";
  const adminIds = adminIdsStr
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));
  setAdminIds(adminIds);
  // First admin in ADMIN_IDS is the owner — protected from being banned
  if (adminIds.length > 0) setOwnerIds([adminIds[0]]);

  const bot = new Bot<BotContext>(token);

  // In-memory session (sufficient for ephemeral state like pending payment step)
  bot.use(
    session<SessionData, BotContext>({
      initial: (): SessionData => ({}),
    })
  );

  // Global middleware: populate ctx.dbUser and enforce rate limits + force join
  bot.use(authMiddleware);
  bot.use(rateLimitMiddleware);
  bot.use(forceJoinMiddleware);

  // Register handlers — ORDER MATTERS for overlapping hears/on patterns.
  // start.ts hears handlers call next() when their step guard doesn't match,
  // so settings.ts handlers are reached correctly.
  registerStartHandler(bot);      // /start, language select, gender select (setup), age input (setup)
  registerMatchingHandlers(bot);  // connect, gender pref, end chat, report, block, message forwarding
  registerGroupHandlers(bot);     // join/leave group, My Groups, named groups, admin promote
  registerAnonLinkHandlers(bot);  // /start anon_ links, send/reply anon messages, inbox
  registerProAnonLinkHandlers(bot); // pro permanent + in-app anon links, pro inbox
  registerCoinHandlers(bot);      // coins menu, buy, packages, payment methods, receipt upload
  registerHelpHandlers(bot);      // help text
  registerSettingsHandlers(bot);  // settings menu, change gender/age/language (registered AFTER start.ts!)
  registerAdminHandlers(bot);     // /admin, callbacks, text inputs for admin actions
  registerMagicHandlers(bot);     // 🌊 اقیانوس احساس: bottle, chain, letter, frequency
  // MUST be last: group message forwarder runs only if no preceding handler consumed the message.
  // This ensures keyboard buttons (inbox, help, etc.) fire before group forwarding.
  registerGroupMessageForwarder(bot);

  // Global error handler
  bot.catch((err) => {
    logger.error({ err: err.error, update: err.ctx?.update }, "Unhandled bot error");
  });

  // Seed default data
  await ensureDefaultPackages();
  await initDefaultBadWords();

  // Auto-set TetraPay callback URL if not already configured
  const existingCallback = await getSetting("tetrapay_callback_url");
  if (!existingCallback) {
    const url = getTetraPayCallbackUrl();
    await setSetting("tetrapay_callback_url", url);
    logger.info({ url }, "TetraPay callback URL auto-configured");
  }

  // ─── Scheduled jobs ──────────────────────────────────────────────────────────

  // 🌊 Magic: deliver future letters every 5 minutes
  cron.schedule("*/5 * * * *", async () => {
    try {
      const letters = await getDueLetters();
      for (const letter of letters) {
        const user = await getUserByTelegramId(letter.userId);
        const lang = (user?.language as "fa" | "en") ?? "fa";
        await bot.api
          .sendMessage(letter.userId, t(lang).letterDelivered(letter.message), { parse_mode: "Markdown" })
          .catch(() => {});
        await markLetterDelivered(letter.id);
      }
    } catch (e) {
      logger.error({ err: e }, "Future letters cron error");
    }
  });

  // 🌊 Magic: expire stale bottles + frequency queue every 30 minutes
  cron.schedule("*/30 * * * *", async () => {
    try {
      await expireOldBottles();
      const expired = await expireDeliveredBottles();
      for (const { senderId } of expired) {
        const user = await getUserByTelegramId(senderId);
        const lang = (user?.language as "fa" | "en") ?? "fa";
        await bot.api.sendMessage(senderId, t(lang).bottleExpiredSender).catch(() => {});
      }
      const staleFreqIds = await cleanStaleFrequency();
      for (const uid of staleFreqIds) {
        const user = await getUserByTelegramId(uid);
        const lang = (user?.language as "fa" | "en") ?? "fa";
        await bot.api.sendMessage(uid, t(lang).freqTimeout, { reply_markup: mainMenuKeyboard(lang) }).catch(() => {});
      }
    } catch (e) {
      logger.error({ err: e }, "Magic cron error");
    }
  });

  // Cleanup stale matching queue every 2 minutes
  cron.schedule("*/2 * * * *", async () => {
    try {
      const staleIds = await cleanupStaleQueue(2);
      for (const uid of staleIds) {
        const user = await getUserByTelegramId(uid);
        const lang = (user?.language as "fa" | "en") ?? "fa";
        await bot.api
          .sendMessage(uid, t(lang).queueTimeout, { reply_markup: mainMenuKeyboard(lang) })
          .catch(() => {});
      }
    } catch (e) {
      logger.error({ err: e }, "Queue cleanup error");
    }
  });

  // ─── Daily midnight inbox reminder (every day at 00:00 Tehran = 20:30 UTC) ───
  // Sends a reminder to every user who has unread anonymous messages
  cron.schedule("30 20 * * *", async () => {
    try {
      const usersWithUnread = await getUsersWithUnreadAnonMessages();
      for (const { receiverId, unreadCount } of usersWithUnread) {
        const user = await getUserByTelegramId(receiverId);
        if (!user) continue;
        const lang = (user.language as "fa" | "en") ?? "fa";
        await bot.api
          .sendMessage(receiverId, t(lang).anonInboxDailyReminder(unreadCount), {
            parse_mode: "Markdown",
          })
          .catch(() => {});
      }
      if (usersWithUnread.length > 0) {
        logger.info({ count: usersWithUnread.length }, "Midnight inbox reminders sent");
      }
    } catch (e) {
      logger.error({ err: e }, "Midnight inbox reminder cron error");
    }
  });

  // Scheduled backup
  cron.schedule("0 * * * *", async () => {
    try {
      const config = await getBackupConfig();
      if (!config?.isVerified || !config.chatId) return;
      const now = new Date();
      const lastBackup = config.lastBackupAt ? new Date(config.lastBackupAt) : null;
      const hoursSinceLast = lastBackup
        ? (now.getTime() - lastBackup.getTime()) / (1000 * 60 * 60)
        : Infinity;
      if (hoursSinceLast >= config.scheduleHours) {
        await sendBackup(bot);
        logger.info("Scheduled backup sent");
      }
    } catch (e) {
      logger.error({ err: e }, "Scheduled backup error");
    }
  });

  logger.info({ adminIds }, "Bot initialized successfully");
  return bot;
}
