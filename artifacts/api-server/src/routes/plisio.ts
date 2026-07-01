/**
 * Plisio payment gateway webhook
 * POST /webhook/plisio
 *
 * Plisio sends a callback payload after every status change:
 *   { status: string, order_number: string, txn_id: string, verify_hash: string, ... }
 * The callback_url must include ?json=true so Plisio sends JSON (not form-encoded).
 *
 * IMPORTANT: Always respond HTTP 200. Non-200 causes Plisio to retry indefinitely.
 */

import { Router } from "express";
import { handlePlisioCallback } from "../bot/services/plisio.service.js";
import { getBotInstance } from "../bot/bot-instance.js";
import { getUserByTelegramId } from "../bot/services/user.service.js";
import { t } from "../bot/i18n/index.js";
import { logger } from "../lib/logger.js";

const router = Router();

/** Statuses that warrant a user notification (terminal, non-success states). */
const NOTIFY_STATUSES = new Set(["expired", "cancelled", "failed", "mismatch", "error"]);

router.post("/", async (req, res) => {
  // Always 200 — Plisio retries on any non-2xx response.
  res.status(200).json({ ok: true });

  try {
    const payload = req.body as Record<string, unknown>;
    const result  = await handlePlisioCallback(payload);

    if (result.alreadyVerified) return;

    const bot = getBotInstance();
    if (!bot || !result.userId) return;

    // ── Successful payment → credit coins & notify ───────────────────────────
    if (result.success && result.coins !== undefined) {
      const userRecord = await getUserByTelegramId(result.userId);
      const uLang = (userRecord?.language as "fa" | "en") ?? "fa";
      await bot.api
        .sendMessage(result.userId, t(uLang).paymentApproved(result.coins), { parse_mode: "Markdown" })
        .catch((e) => logger.warn({ err: e }, "plisio: failed to send success notification"));
      return;
    }

    // ── Terminal failure (expired / cancelled / failed / mismatch) → notify ──
    if (!result.success && result.paymentStatus && NOTIFY_STATUSES.has(result.paymentStatus)) {
      const userRecord = await getUserByTelegramId(result.userId);
      const uLang = (userRecord?.language as "fa" | "en") ?? "fa";
      const msg = getPlisioStatusMessage(result.paymentStatus, uLang);
      await bot.api
        .sendMessage(result.userId, msg, { parse_mode: "HTML" })
        .catch((e) => logger.warn({ err: e }, "plisio: failed to send failure notification"));
    }
  } catch (err) {
    logger.error({ err }, "plisio webhook: unhandled error");
  }
});

// ─── Status messages ──────────────────────────────────────────────────────────

function getPlisioStatusMessage(status: string, lang: "fa" | "en"): string {
  if (lang === "fa") {
    switch (status) {
      case "expired":
        return (
          "⏰ <b>لینک پرداخت Plisio منقضی شد</b>\n\n" +
          "مهلت ۳۰ دقیقه‌ای پرداخت به پایان رسید.\n" +
          "برای خرید مجدد سکه، دوباره از منوی 🪙 <b>خرید سکه</b> اقدام کنید."
        );
      case "cancelled":
        return (
          "❌ <b>پرداخت Plisio لغو شد</b>\n\n" +
          "شما پرداخت را لغو کردید.\n" +
          "در صورت تمایل می‌توانید مجدداً از منوی 🪙 <b>خرید سکه</b> اقدام کنید."
        );
      case "failed":
        return (
          "❌ <b>پرداخت Plisio ناموفق بود</b>\n\n" +
          "متأسفانه تراکنش شما تأیید نشد.\n" +
          "در صورت کسر مبلغ از کیف پول، با پشتیبانی تماس بگیرید."
        );
      case "mismatch":
        return (
          "⚠️ <b>مغایرت در مبلغ پرداختی Plisio</b>\n\n" +
          "مبلغ واریزی با مبلغ فاکتور مطابقت ندارد.\n" +
          "لطفاً با پشتیبانی تماس بگیرید تا بررسی شود."
        );
      case "error":
        return (
          "⚠️ <b>خطا در پردازش پرداخت Plisio</b>\n\n" +
          "یک خطای فنی در سمت درگاه رخ داد.\n" +
          "در صورت کسر مبلغ، با پشتیبانی تماس بگیرید."
        );
      default:
        return "⚠️ وضعیت پرداخت Plisio به‌روزرسانی شد.";
    }
  } else {
    switch (status) {
      case "expired":
        return (
          "⏰ <b>Plisio payment link expired</b>\n\n" +
          "The 30-minute payment window has passed.\n" +
          "To buy coins again, go to the 🪙 <b>Buy Coins</b> menu."
        );
      case "cancelled":
        return (
          "❌ <b>Plisio payment cancelled</b>\n\n" +
          "You cancelled the payment.\n" +
          "You can try again from the 🪙 <b>Buy Coins</b> menu."
        );
      case "failed":
        return (
          "❌ <b>Plisio payment failed</b>\n\n" +
          "Your transaction was not confirmed.\n" +
          "If funds were deducted, please contact support."
        );
      case "mismatch":
        return (
          "⚠️ <b>Plisio payment amount mismatch</b>\n\n" +
          "The amount sent does not match the invoice.\n" +
          "Please contact support for resolution."
        );
      case "error":
        return (
          "⚠️ <b>Plisio payment processing error</b>\n\n" +
          "A technical error occurred at the gateway.\n" +
          "If funds were deducted, please contact support."
        );
      default:
        return "⚠️ Your Plisio payment status has been updated.";
    }
  }
}

export default router;
