import { Bot, session } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import type { BotContext, SessionData } from "./context.js";
import { authMiddleware } from "./middleware/auth.js";
import { rateLimitMiddleware } from "./middleware/rate-limit.js";
import { registerStartHandler } from "./handlers/start.js";
import { registerMatchingHandlers } from "./handlers/matching.js";
import { registerGroupHandlers } from "./handlers/group.js";
import { registerAnonLinkHandlers } from "./handlers/anonymous-link.js";
import { registerCoinHandlers } from "./handlers/coins.js";
import { registerHelpHandlers } from "./handlers/help.js";
import { registerSettingsHandlers } from "./handlers/settings.js";
import { registerAdminHandlers, setAdminIds } from "./handlers/admin.js";
import { ensureDefaultPackages } from "./services/payment.service.js";
import { initDefaultBadWords } from "./services/safety.service.js";
import { sendBackup, getBackupConfig } from "./services/backup.service.js";
import { cleanupStaleQueue } from "./services/matching.service.js";
import { logger } from "../lib/logger.js";
import cron from "node-cron";

export async function createBot(): Promise<Bot<BotContext>> {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN environment variable is required");

  const adminIdsStr = process.env["ADMIN_IDS"] ?? "";
  const adminIds = adminIdsStr.split(",").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
  setAdminIds(adminIds);

  const botUsername = process.env["BOT_USERNAME"];

  const bot = new Bot<BotContext>(token);

  // Session
  bot.use(session<SessionData, BotContext>({
    initial: (): SessionData => ({}),
  }));

  // Auth middleware
  bot.use(authMiddleware);
  bot.use(rateLimitMiddleware);

  // Register all handlers
  registerStartHandler(bot);
  registerMatchingHandlers(bot);
  registerGroupHandlers(bot);
  registerAnonLinkHandlers(bot);
  registerCoinHandlers(bot);
  registerHelpHandlers(bot);
  registerSettingsHandlers(bot);
  registerAdminHandlers(bot);

  // Global error handler
  bot.catch((err) => {
    logger.error({ err: err.error, ctx: err.ctx?.update }, "Bot error");
  });

  // Init defaults
  await ensureDefaultPackages();
  await initDefaultBadWords();

  // Scheduled jobs
  // Cleanup stale queue every 2 minutes
  cron.schedule("*/2 * * * *", async () => {
    try {
      const staleIds = await cleanupStaleQueue(2);
      if (staleIds.length > 0) {
        for (const uid of staleIds) {
          const { getUserByTelegramId } = await import("./services/user.service.js");
          const { t } = await import("./i18n/index.js");
          const { mainMenuKeyboard } = await import("./keyboards/main.js");
          const user = await getUserByTelegramId(uid);
          const lang = (user?.language as "fa" | "en") ?? "fa";
          await bot.api.sendMessage(uid, t(lang).queueTimeout, { reply_markup: mainMenuKeyboard(lang) }).catch(() => {});
        }
      }
    } catch (e) {
      logger.error({ err: e }, "Queue cleanup error");
    }
  });

  // Scheduled backup
  cron.schedule("0 * * * *", async () => {
    try {
      const config = await getBackupConfig();
      if (!config?.isVerified || !config.chatId) return;
      const now = new Date();
      const lastBackup = config.lastBackupAt ? new Date(config.lastBackupAt) : null;
      const hoursSinceLastBackup = lastBackup ? (now.getTime() - lastBackup.getTime()) / (1000 * 60 * 60) : Infinity;
      if (hoursSinceLastBackup >= config.scheduleHours) {
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
