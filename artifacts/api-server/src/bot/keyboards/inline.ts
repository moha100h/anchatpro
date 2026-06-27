import { InlineKeyboard } from "grammy";
import { t, type Lang } from "../i18n/index.js";
import type { PaymentPackage } from "@workspace/db";

export function reportReasonsKeyboard(lang: Lang) {
  const i = t(lang);
  const kb = new InlineKeyboard();
  i.reportReasons.forEach((r, idx) => {
    kb.text(r, `report_reason:${idx}`);
    if (idx % 2 === 1) kb.row();
  });
  return kb;
}

export function blockReasonsKeyboard(lang: Lang) {
  const i = t(lang);
  const kb = new InlineKeyboard();
  i.blockReasons.forEach((r, idx) => {
    kb.text(r, `block_reason:${idx}`);
    if (idx % 2 === 1) kb.row();
  });
  return kb;
}

export function packagesKeyboard(packages: PaymentPackage[], lang: Lang) {
  const i = t(lang);
  const kb = new InlineKeyboard();
  packages.forEach((pkg, idx) => {
    kb.text(i.packageInfo(pkg.coins, pkg.price, pkg.currency), `pkg:${pkg.id}`);
    if (idx % 2 === 1) kb.row();
  });
  return kb;
}

export function paymentMethodKeyboard(lang: Lang, enabledMethods: { card: boolean; crypto: boolean; gateway: boolean }) {
  const i = t(lang);
  const kb = new InlineKeyboard();
  if (enabledMethods.card) kb.text(i.payByCard, "pay_method:card").row();
  if (enabledMethods.crypto) kb.text(i.payByCrypto, "pay_method:crypto").row();
  if (enabledMethods.gateway) kb.text(i.payByGateway, "pay_method:gateway").row();
  return kb;
}

export function anonMsgActionsKeyboard(msgId: number, lang: Lang) {
  const i = t(lang);
  return new InlineKeyboard()
    .text(i.replyAnon, `anon_reply:${msgId}`).row()
    .text(i.blockSender, `anon_block:${msgId}`).text(i.reportSender, `anon_report:${msgId}`);
}

export function paymentReviewKeyboard(paymentId: number, lang: Lang) {
  const i = t(lang);
  return new InlineKeyboard()
    .text(i.approvePayment, `pay_approve:${paymentId}`)
    .text(i.rejectPayment, `pay_reject:${paymentId}`);
}

export function proAnonMsgActionsKeyboard(
  msgId: number,
  linkType: string,
  lang: Lang,
  revealCost: number = 1,
  revealed: boolean = false,
  senderId?: number,
) {
  const isPerm = linkType === "pro_perm";
  const fa = lang === "fa";

  const kb = new InlineKeyboard()
    .text(fa ? "💬 پاسخ" : "💬 Reply", `pro_reply:${msgId}`).row();

  if (revealed && senderId) {
    kb.url(fa ? "✅ مشاهده فرستنده" : "✅ View sender", `tg://user?id=${senderId}`).row();
  } else if (isPerm) {
    kb.text(fa ? "🔍 مشاهده فرستنده" : "🔍 View sender", `pro_reveal:${msgId}`).row();
  } else {
    kb.text(fa ? `🔍 فرستنده (${revealCost} سکه)` : `🔍 Sender (${revealCost} coin)`, `pro_reveal:${msgId}`).row();
  }

  kb.text(fa ? "🚫 بلاک" : "🚫 Block", `pro_block:${msgId}`)
    .text(fa ? "⚠️ گزارش" : "⚠️ Report", `pro_report:${msgId}`);

  return kb;
}

export function proLinkManageInlineKeyboard(linkId: number, tier: string, enabled: boolean, lang: Lang) {
  const fa = lang === "fa";
  return new InlineKeyboard()
    .text(enabled ? (fa ? "❌ غیرفعال کردن" : "❌ Disable") : (fa ? "✅ فعال کردن" : "✅ Enable"),
      `pro_toggle:${linkId}:${enabled ? "off" : "on"}`).row()
    .text(fa ? "🔄 تغییر لینک" : "🔄 Change link", `pro_change_token:${linkId}`).row()
    .text(fa ? "💬 پیام خوش‌آمدگویی" : "💬 Welcome msg", `pro_set_welcome:${linkId}`).row()
    .text(fa ? "✏️ نام نمایشی" : "✏️ Display name", `pro_set_name:${linkId}`)
    .text(fa ? "🏷️ لینک اختصاصی" : "🏷️ Custom alias", `pro_set_alias:${linkId}`);
}

export function proInAppDurationKeyboard(lang: Lang) {
  const fa = lang === "fa";
  return new InlineKeyboard()
    .text(fa ? "⏱️ ۱ ساعت" : "⏱️ 1 hour", "pro_inapp_dur:1")
    .text(fa ? "⏱️ ۶ ساعت" : "⏱️ 6 hours", "pro_inapp_dur:6").row()
    .text(fa ? "⏱️ ۲۴ ساعت" : "⏱️ 24 hours", "pro_inapp_dur:24")
    .text(fa ? "📅 ۷ روز" : "📅 7 days", "pro_inapp_dur:168").row()
    .text(fa ? "❌ لغو" : "❌ Cancel", "pro_inapp_cancel");
}

export function proInAppConfirmKeyboard(hours: number, token: string, lang: Lang) {
  const fa = lang === "fa";
  return new InlineKeyboard()
    .text(fa ? "✅ تأیید و ساخت" : "✅ Confirm & Create", `pro_inapp_buy:${hours}:${token}`).row()
    .text(fa ? "❌ انصراف" : "❌ Cancel", "pro_inapp_cancel");
}

export function adminUserActionsKeyboard(userId: number, lang: Lang, isBanned: boolean) {
  return new InlineKeyboard()
    .text("➕ سکه", `admin_addcoins:${userId}`)
    .text("➖ سکه", `admin_removecoins:${userId}`).row()
    .text(isBanned ? "✅ رفع مسدود" : "🔨 مسدود", `admin_${isBanned ? "unban" : "ban"}:${userId}`).row()
    .text("🌳 درخت ارجاع", `admin_reftree:${userId}`);
}
