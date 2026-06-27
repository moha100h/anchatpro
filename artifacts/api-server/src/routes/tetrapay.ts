/**
 * TetraPay payment gateway webhook
 * POST /webhook/tetrapay
 *
 * TetraPay sends a callback payload after payment completes:
 *   { status: number, hash_id: string, authority: string, ... }
 *
 * We verify the payment with TetraPay and, if valid, credit the user's coins.
 * The bot instance is passed via the singleton exported from bot/bot-instance.ts
 */

import { Router } from "express";
import { handleTetraPayCallback } from "../bot/services/tetrapay.service.js";
import { getBotInstance } from "../bot/bot-instance.js";
import { getUserByTelegramId } from "../bot/services/user.service.js";
import { t } from "../bot/i18n/index.js";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const payload = req.body as {
      status?: number | string;
      hash_id?: string;
      authority?: string;
    };

    const result = await handleTetraPayCallback({
      status: payload.status ?? 0,
      hash_id: payload.hash_id,
      authority: payload.authority,
    });

    if (!result.success) {
      res.status(200).json({ ok: false, error: result.error });
      return;
    }

    if (result.alreadyVerified) {
      res.status(200).json({ ok: true, note: "already_verified" });
      return;
    }

    // Notify user via bot
    if (result.userId && result.coins !== undefined) {
      const bot = getBotInstance();
      if (bot) {
        const userRecord = await getUserByTelegramId(result.userId);
        const uLang = (userRecord?.language as "fa" | "en") ?? "fa";
        await bot.api
          .sendMessage(result.userId, t(uLang).paymentApproved(result.coins))
          .catch(() => {});
      }
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Internal error" });
  }
});

export default router;
