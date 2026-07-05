/**
 * TetraPay payment gateway webhook
 * POST /webhook/tetrapay
 *
 * TetraPay sends a callback payload after payment completes.
 * IMPORTANT: TetraPay uses "Authority" (capital A) in both create-order
 * responses and webhook callbacks. We accept both casing to be safe.
 */

import { Router } from "express";
import { handleTetraPayCallback } from "../bot/services/tetrapay.service.js";
import { getBotInstance } from "../bot/bot-instance.js";
import { getUserByTelegramId } from "../bot/services/user.service.js";
import { t } from "../bot/i18n/index.js";
import { logger } from "../lib/logger.js";

const router = Router();

router.post("/", async (req, res) => {
  // Always 200 so TetraPay doesn't retry on application errors.
  res.status(200).json({ ok: true });

  try {
    // TetraPay sends "Authority" (capital A) in some API versions and "authority"
    // (lowercase) in others. Accept both to avoid silently missing the field.
    const body = (req.body ?? {}) as Record<string, unknown>;

    const status    = body["status"]    ?? body["Status"]    ?? 0;
    const hashId    = (body["hash_id"]  ?? body["Hash_id"]   ?? body["hashId"]) as string | undefined;
    const authority = (body["authority"] ?? body["Authority"] ?? body["AUTHORITY"]) as string | undefined;

    logger.info(
      {
        status,
        authority: authority ? `${authority.slice(0, 8)}…` : "(missing)",
        hashId: hashId ? `${hashId.slice(0, 12)}…` : "(missing)",
        bodyKeys: Object.keys(body),
      },
      "tetrapay webhook: incoming callback"
    );

    if (!authority && !hashId) {
      logger.warn({ bodyKeys: Object.keys(body) }, "tetrapay webhook: both authority and hash_id missing in callback — cannot process");
      return;
    }

    const result = await handleTetraPayCallback({ status, hash_id: hashId, authority });

    logger.info(
      { success: result.success, alreadyVerified: result.alreadyVerified, userId: result.userId, coins: result.coins, error: result.error },
      "tetrapay webhook: handleTetraPayCallback result"
    );

    const bot = getBotInstance();
    if (!bot) {
      logger.warn("tetrapay webhook: bot instance not available — cannot notify user");
      return;
    }

    if (result.alreadyVerified) return;

    // ── Successful payment → credit already done in service — notify user ────
    if (result.success && result.coins !== undefined && result.userId) {
      const userRecord = await getUserByTelegramId(result.userId);
      const uLang = (userRecord?.language as "fa" | "en") ?? "fa";
      await bot.api
        .sendMessage(result.userId, t(uLang).paymentApproved(result.coins), { parse_mode: "Markdown" })
        .catch((e) => logger.warn({ err: e, userId: result.userId }, "tetrapay: failed to send success notification to user"));
      logger.info({ userId: result.userId, coins: result.coins }, "tetrapay webhook: user notified of successful payment");
      return;
    }

    // ── Payment failed / cancelled → notify user ─────────────────────────────
    if (!result.success && result.userId) {
      const userRecord = await getUserByTelegramId(result.userId);
      const uLang = (userRecord?.language as "fa" | "en") ?? "fa";
      const failMsg = uLang === "fa"
        ? "❌ *پرداخت ناموفق بود*\n\nپرداخت تأیید نشد یا لغو شد.\nدر صورت کسر وجه از حسابتان، با پشتیبانی تماس بگیرید.\n\nبرای خرید مجدد از منوی 🛒 *خرید سکه* استفاده کنید."
        : "❌ *Payment failed or was cancelled*\n\nYour payment was not confirmed.\nIf any amount was deducted, please contact support.\n\nTo try again, use the 🛒 *Buy Coins* menu.";
      await bot.api
        .sendMessage(result.userId, failMsg, { parse_mode: "Markdown" })
        .catch((e) => logger.warn({ err: e, userId: result.userId }, "tetrapay: failed to send failure notification to user"));
    }

  } catch (err) {
    logger.error({ err }, "tetrapay webhook: unhandled error");
  }
});

export default router;
