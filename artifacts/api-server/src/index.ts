process.env["TZ"] = "Asia/Tehran";
import http from "node:http";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { createBot } from "./bot/index.js";
import { setBotInstance, setBotUsername } from "./bot/bot-instance.js";
import { mountCallSignaling } from "./call/signaling.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Start Express server
const server = http.createServer(app);

// Mount WebSocket signaling for Mini App calls
mountCallSignaling(server);

server.listen(port, async () => {
  logger.info({ port }, "Server listening");

  // Start Telegram Bot
  if (process.env["TELEGRAM_BOT_TOKEN"]) {
    try {
      const bot = await createBot();
      setBotInstance(bot);
      await bot.start({
        onStart: (info) => {
          setBotUsername(info.username);
          logger.info({ username: info.username }, "Bot started");
        },
        drop_pending_updates: true,
      });
    } catch (err) {
      logger.error({ err }, "Failed to start Telegram bot");
    }
  } else {
    logger.warn("TELEGRAM_BOT_TOKEN not set — bot not started");
  }
});

server.on("error", (err) => {
  logger.error({ err }, "Server error");
  process.exit(1);
});
