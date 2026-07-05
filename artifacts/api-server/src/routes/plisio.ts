/**
 * Plisio payment gateway webhook
 * POST /webhook/plisio
 *
 * Plisio sends a callback payload after every status change:
 *   { status: string, order_number: string, txn_id: string, verify_hash: string, ... }
 * The callback_url must include ?json=true so Plisio sends JSON (not form-encoded).
 *
 * IMPORTANT: Always respond HTTP 200. Non-200 causes Plisio to retry indefinitely.
 *
 * Raw body capture is handled in app.ts (before express.json) and attached to
 * req.rawBody — this is critical for correct HMAC-SHA1 verification.
 */

import { Router, type Request } from "express";
import { handlePlisioCallback } from "../bot/services/plisio.service.js";
import { getBotInstance, getBotUsername } from "../bot/bot-instance.js";
import { getUserByTelegramId } from "../bot/services/user.service.js";
import { getSetting } from "../bot/services/payment.service.js";
import { t } from "../bot/i18n/index.js";
import { logger } from "../lib/logger.js";
import { db, plisioTransactionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { User } from "@workspace/db";

const router = Router();

/** Statuses that warrant a user notification (terminal, non-success states). */
const NOTIFY_STATUSES = new Set(["expired", "cancelled", "failed", "mismatch", "error"]);

/**
 * GET /webhook/plisio/return — browser lands here after leaving Plisio's
 * checkout page (before ever reaching the bot).
 *
 * This is intentionally NOT a straight redirect into the bot: the query
 * string is just the order_number Plisio was told to bounce back with. We
 * do not trust it as proof of anything — we only use it to look the order
 * up. The bot itself re-verifies the real DB status (set only by the signed
 * webhook) and confirms the clicking user owns the order before showing
 * anything. This route exists purely to present a professional "returning
 * to bot" screen and to carry the order reference across.
 */
router.get("/return", async (req, res) => {
  const orderNumberRaw = String(req.query["order"] ?? "");
  const orderNumber = /^[A-Za-z0-9_-]{1,64}$/.test(orderNumberRaw) ? orderNumberRaw : "";

  const botUsername = getBotUsername() ?? "anymschat_bot";
  const deepLink = orderNumber
    ? `https://t.me/${botUsername}?start=plisio_r_${orderNumber}`
    : `https://t.me/${botUsername}`;

  // Best-effort existence check purely for the loading copy shown; the bot
  // side remains the sole source of truth for what the user is told.
  let exists = false;
  if (orderNumber) {
    const [tx] = await db
      .select({ id: plisioTransactionsTable.id })
      .from(plisioTransactionsTable)
      .where(eq(plisioTransactionsTable.orderNumber, orderNumber))
      .limit(1);
    exists = !!tx;
  }

  res.status(200).send(renderReturnPage(deepLink, exists));
});

function renderReturnPage(deepLink: string, exists: boolean): string {
  const escapedLink = deepLink.replace(/"/g, "&quot;");
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="refresh" content="1;url=${escapedLink}">
<title>در حال بازگشت به ربات...</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#0f1720; font-family: Tahoma, sans-serif; color:#e5e7eb; }
  .card { text-align:center; padding:32px; max-width:360px; }
  .spinner { width:44px; height:44px; margin:0 auto 20px; border-radius:50%;
             border:4px solid rgba(255,255,255,0.15); border-top-color:#22c55e; animation:spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  h1 { font-size:18px; margin:0 0 8px; }
  p { font-size:14px; color:#9ca3af; margin:0 0 20px; }
  a.btn { display:inline-block; padding:10px 22px; border-radius:10px; background:#22c55e;
          color:#0f1720; text-decoration:none; font-weight:bold; }
</style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h1>${exists ? "در حال بررسی نتیجه پرداخت..." : "در حال بازگشت به ربات..."}</h1>
    <p>اگر به‌طور خودکار منتقل نشدید، روی دکمه زیر بزنید.</p>
    <a class="btn" href="${escapedLink}">بازگشت به ربات</a>
  </div>
  <script>setTimeout(function(){ window.location.href = "${escapedLink}"; }, 400);</script>
</body>
</html>`;
}

type PlisioRequest = Request & { rawBody?: string };

router.post("/", async (req: PlisioRequest, res) => {
  // Always 200 — Plisio retries on any non-2xx response.
  res.status(200).json({ ok: true });

  try {
    const rawBody = req.rawBody ?? "";
    const payload = (req.body ?? {}) as Record<string, unknown>;

    // Sanity check: if both are empty the body parser failed completely.
    if (!rawBody && Object.keys(payload).length === 0) {
      logger.error(
        { contentType: req.headers["content-type"] },
        "plisio webhook: received empty body — Content-Type may be unsupported or body was not captured"
      );
      return;
    }

    const result = await handlePlisioCallback(rawBody, payload);

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

      // ── Archive a summary in the Plisio review group (successful payments only) ──
      await notifyPlisioReviewGroup(result, userRecord).catch((e) =>
        logger.warn({ err: e }, "plisio: failed to send review-group archive message")
      );
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

// ─── Review-group archive notification (successful payments only) ─────────────

async function notifyPlisioReviewGroup(
  result: Awaited<ReturnType<typeof handlePlisioCallback>>,
  userRecord: User | null
): Promise<void> {
  const bot = getBotInstance();
  if (!bot) return;

  const rawGroupId = (await getSetting("plisio_review_group")) ?? (await getSetting("payment_review_group"));
  if (!rawGroupId) return;
  const groupId = parseInt(rawGroupId, 10);
  if (!Number.isFinite(groupId)) return;

  const fullName = [userRecord?.firstName, userRecord?.lastName].filter(Boolean).join(" ") || "—";
  const username = userRecord?.username ? `@${userRecord.username}` : "—";

  const text =
    `💫 <b>پرداخت موفق — Plisio</b>\n\n` +
    `👤 کاربر: ${fullName} (${username})\n` +
    `🆔 آیدی عددی: <code>${result.userId}</code>\n\n` +
    `🪙 سکه شارژ شده: <b>${result.coins}</b>\n` +
    `💵 مبلغ: <b>${result.amountUsd ?? "-"}</b> ${result.cryptoCurrency ?? "USD"}\n` +
    `📄 شماره سفارش: <code>${result.orderNumber ?? "-"}</code>\n` +
    `🔖 شناسه تراکنش: <code>${result.txnId ?? "-"}</code>\n\n` +
    `🕒 ${new Date().toLocaleString("fa-IR")}\n` +
    `✅ وضعیت: تکمیل و بایگانی شد`;

  await bot.api.sendMessage(groupId, text, { parse_mode: "HTML" });
}

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
