/**
 * Plisio payment gateway webhook
 * POST /webhook/plisio
 *
 * Plisio sends a callback payload after payment:
 *   { status: string, order_number: string, txn_id: string, verify_hash: string, ... }
 * The callback_url must include ?json=true to receive JSON (not form-encoded).
 */

import { Router } from "express";
import { handlePlisioCallback } from "../bot/services/plisio.service.js";
import { getBotInstance } from "../bot/bot-instance.js";
import { getUserByTelegramId } from "../bot/services/user.service.js";
import { t } from "../bot/i18n/index.js";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const payload = req.body as Record<string, unknown>;
    const result  = await handlePlisioCallback(payload);

    if (!result.success) {
      res.status(200).json({ ok: false, error: result.error });
      return;
    }

    if (result.alreadyVerified) {
      res.status(200).json({ ok: true, note: "already_verified" });
      return;
    }

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
  } catch {
    res.status(500).json({ ok: false, error: "Internal error" });
  }
});

export default router;
