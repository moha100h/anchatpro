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

      // Auto-seed call settings defaults + configure BotFather menu button
      try {
        const { getSetting, setSetting } = await import("./bot/services/payment.service.js");
        const domain = process.env["PUBLIC_DOMAIN"] ?? "tisabuy.com";

        // Seed call settings only when not already stored in DB
        const callDefaults: Record<string, string> = {
          call_enabled:              "1",
          call_video_enabled:        "1",
          call_cost_voice_random:    "3",
          call_cost_voice_gender:    "5",
          call_cost_video_random:    "6",
          call_cost_video_gender:    "10",
          call_min_balance:          "3",
          call_max_duration_minutes: "30",
          call_turn_host:            domain,
          call_turn_port:            "3478",
          call_mini_app_url:         `https://${domain}/call/`,
        };
        for (const [key, val] of Object.entries(callDefaults)) {
          const existing = await getSetting(key);
          if (existing === null || existing === undefined) {
            await setSetting(key, val);
          }
        }
        logger.info({ domain }, "Call settings defaults seeded");

        // Set BotFather menu button to the stored (or just-seeded) mini-app URL
        const miniAppUrl = (await getSetting("call_mini_app_url")) ?? `https://${domain}/call/`;
        await bot.api.setChatMenuButton({
          menu_button: { type: "web_app", text: "📞 تماس ناشناس", web_app: { url: miniAppUrl } },
        });
        logger.info({ url: miniAppUrl }, "BotFather menu button set to Mini App");
      } catch (e) {
        logger.warn({ e }, "Could not init call settings — will retry on next restart");
      }

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
