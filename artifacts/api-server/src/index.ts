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

      // Auto-detect server URL and configure call settings
      try {
        const { getSetting, setSetting } = await import("./bot/services/payment.service.js");

        // Detect the publicly accessible base URL for this server.
        // Priority: REPLIT_DEV_DOMAIN (Replit dev) → PUBLIC_DOMAIN (VPS) → auto-detect IP
        let miniAppBaseUrl: string;
        let turnHost: string;

        if (process.env["REPLIT_DEV_DOMAIN"]) {
          // On Replit dev: API server is on port 8080 (externalPort=8080)
          miniAppBaseUrl = `https://${process.env["REPLIT_DEV_DOMAIN"]}:8080`;
          turnHost       = process.env["REPLIT_DEV_DOMAIN"];
        } else if (process.env["PUBLIC_DOMAIN"]) {
          miniAppBaseUrl = `https://${process.env["PUBLIC_DOMAIN"]}`;
          turnHost       = process.env["PUBLIC_DOMAIN"];
        } else {
          // Auto-detect public IP as last resort
          try {
            const ipResp = await fetch("https://ifconfig.me/ip", { signal: AbortSignal.timeout(3000) });
            const ip     = (await ipResp.text()).trim();
            miniAppBaseUrl = `https://${ip}:8080`;
            turnHost       = ip;
          } catch {
            miniAppBaseUrl = "https://tisabuy.com";
            turnHost       = "tisabuy.com";
          }
        }

        const miniAppUrl = `${miniAppBaseUrl}/call/`;

        // Always force-update environment-derived settings on startup
        await setSetting("call_mini_app_url", miniAppUrl);
        await setSetting("call_turn_host",    turnHost);

        // Seed other settings only if not already stored
        const otherDefaults: Record<string, string> = {
          call_enabled:              "1",
          call_video_enabled:        "1",
          call_mini_app_enabled:     "1",
          call_cost_voice_random:    "3",
          call_cost_voice_gender:    "5",
          call_cost_video_random:    "6",
          call_cost_video_gender:    "10",
          call_min_balance:          "3",
          call_max_duration_minutes: "30",
          call_turn_port:            "3478",
        };
        for (const [key, val] of Object.entries(otherDefaults)) {
          const existing = await getSetting(key);
          if (existing === null || existing === undefined) {
            await setSetting(key, val);
          }
        }

        // Auto-seed TURN credentials from env (set by install.sh or manually)
        const turnUsername = process.env["TURN_USERNAME"] ?? "";
        const turnPassword = process.env["TURN_PASSWORD"] ?? "";
        if (turnUsername && turnPassword) {
          const existingUser = await getSetting("call_turn_username");
          if (!existingUser) {
            await setSetting("call_turn_username", turnUsername);
            await setSetting("call_turn_credential", turnPassword);
            logger.info({ turnUsername }, "TURN credentials auto-seeded from env");
          }
        }
        logger.info({ miniAppUrl, turnHost }, "Call settings auto-configured");

        // Sync keyboard call button state with DB setting
        const { setCallBtnEnabled } = await import("./bot/keyboards/main.js");
        const callMiniAppEnabled = await getSetting("call_mini_app_enabled");
        setCallBtnEnabled((callMiniAppEnabled ?? "1") !== "0");

        // Set BotFather menu button to the auto-detected mini-app URL
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
