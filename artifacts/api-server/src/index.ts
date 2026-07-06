process.env["TZ"] = "Asia/Tehran";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { createBot } from "./bot/index.js";
import { setBotInstance, setBotUsername } from "./bot/bot-instance.js";
import { getBaseUrl, getPlisioCallbackUrl, getTetraPayCallbackUrl } from "./lib/base-url.js";

// PORT: required in production; fall back to 8080 for dev convenience.
const rawPort = process.env["PORT"] ?? "8080";
const port    = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Start Express server
app.listen(port, async (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  // ── Startup diagnostics — visible in server logs on both Replit and VPS ────
  const baseUrl         = getBaseUrl();
  const plisioWebhook   = getPlisioCallbackUrl();
  const tetrapayWebhook = getTetraPayCallbackUrl();
  const baseUrlSource   = process.env["BASE_URL"]
    ? "BASE_URL env var"
    : process.env["REPLIT_DEV_DOMAIN"]
      ? "REPLIT_DEV_DOMAIN env var"
      : "localhost fallback — set BASE_URL on VPS!";

  logger.info({ port }, "Server listening");
  logger.info(
    { baseUrl, baseUrlSource, plisioWebhook, tetrapayWebhook },
    "Effective public URL — verify callback URLs in admin panel match these"
  );

  if (baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1")) {
    logger.warn(
      { baseUrl },
      "BASE_URL resolved to localhost — Plisio/TetraPay webhooks will NOT work on a VPS. " +
      "Set BASE_URL=https://yourdomain.com in your .env file and restart."
    );
  }

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
