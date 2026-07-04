process.env["TZ"] = "Asia/Tehran";

import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// Load the repo-root .env explicitly (not just whatever env PM2/the shell
// happened to capture at process-start time). This makes the app resilient
// to `pm2 restart` without `--update-env`, server reboots, or manually
// launching the built dist/index.mjs from any working directory — it always
// reads the same .env file the installer wrote, regardless of how it was
// started. Existing process env vars (if any) still take precedence.
//
// IMPORTANT: static `import ... from "./app.js"` (and its transitive
// imports, e.g. the db package which builds a `Pool` from
// `process.env.DATABASE_URL` at module top-level) are hoisted and evaluated
// BEFORE any of this file's own top-level statements run — so calling
// `dotenv.config()` above a static import does NOT guarantee it runs first.
// Using dynamic `import()` after `dotenv.config()` defers evaluation of
// those modules until this point in execution, guaranteeing env vars are
// loaded before anything reads them.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const { default: app } = await import("./app.js");
const { logger } = await import("./lib/logger.js");
const { createBot } = await import("./bot/index.js");
const { setBotInstance, setBotUsername } = await import("./bot/bot-instance.js");

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Start Express server
app.listen(port, async (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
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
