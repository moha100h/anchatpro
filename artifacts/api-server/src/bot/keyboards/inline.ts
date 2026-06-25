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

export function adminUserActionsKeyboard(userId: number, lang: Lang, isBanned: boolean) {
  return new InlineKeyboard()
    .text("➕ سکه", `admin_addcoins:${userId}`)
    .text("➖ سکه", `admin_removecoins:${userId}`).row()
    .text(isBanned ? "✅ رفع مسدود" : "🔨 مسدود", `admin_${isBanned ? "unban" : "ban"}:${userId}`).row()
    .text("🌳 درخت ارجاع", `admin_reftree:${userId}`);
}
