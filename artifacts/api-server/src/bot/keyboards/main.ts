import { Keyboard } from "grammy";
import { t, type Lang } from "../i18n/index.js";
import type { PaymentPackage } from "@workspace/db";

// Auto-resolve call mini-app URL from environment
const _domain = process.env["PUBLIC_DOMAIN"] ?? "tisabuy.com";
export const CALL_APP_URL =
  process.env["CALL_MINI_APP_URL"] ?? `https://${_domain}/call/`;

export function mainMenuKeyboard(lang: Lang) {
  const i = t(lang);
  return new Keyboard()
    .text(i.menuConnect).text(i.menuGroup).row()
    .text(i.menuAnonProLink).text(i.menuMyLink).row()
    .text(i.menuMagic).row()
    .text(i.menuCoins).text(i.menuReferral).row()
    .text(i.menuHelp).text(i.menuSettings).row()
    .webApp(i.menuCall, CALL_APP_URL)
    .resized()
    .persistent();
}

export function magicMenuKeyboard(lang: Lang) {
  const i = t(lang);
  return new Keyboard()
    .text(i.magicBtnBottle).text(i.magicBtnChain).row()
    .text(i.magicBtnLetter).text(i.magicBtnFreq).row()
    .text(i.magicBtnHelp).text(i.back)
    .resized()
    .persistent();
}

export function magicHelpMenuKeyboard(lang: Lang) {
  const i = t(lang);
  return new Keyboard()
    .text(i.magicHelpBtnBottle).text(i.magicHelpBtnChain).row()
    .text(i.magicHelpBtnLetter).text(i.magicHelpBtnFreq).row()
    .text(i.back)
    .resized()
    .persistent();
}

export function genderKeyboard(lang: Lang) {
  const i = t(lang);
  return new Keyboard()
    .text(i.male).text(i.female).row()
    .text(i.other)
    .resized()
    .oneTime();
}

export function genderPrefKeyboard(lang: Lang, sameAge: boolean = false) {
  const i = t(lang);
  const sameAgeBtn = sameAge ? i.genderPrefSameAgeOn : i.genderPrefSameAgeOff;
  return new Keyboard()
    .text(i.genderPrefFemale).text(i.genderPrefMale).row()
    .text(i.genderPrefAny).text(sameAgeBtn).row()
    .text(i.back)
    .resized()
    .persistent();
}

export function chatControlKeyboard(lang: Lang) {
  const i = t(lang);
  return new Keyboard()
    .text(i.endChat).row()
    .text(i.reportUser).text(i.blockUser)
    .resized()
    .persistent();
}

/** Regular group member keyboard */
export function groupControlKeyboard(lang: Lang) {
  const i = t(lang);
  return new Keyboard()
    .text(i.leaveGroup).row()
    .text(i.groupLeaveRemoveBtn)
    .resized()
    .persistent();
}

/** Group creator keyboard — includes member management + admin/expand options */
export function groupCreatorKeyboard(lang: Lang) {
  const i = t(lang);
  return new Keyboard()
    .text(i.manageMembers).row()
    .text(i.groupAdminPromoteBtn).row()
    .text(i.groupExpandBtn).row()
    .text(i.groupInviteLinkBtn).row()
    .text(i.leaveGroup).row()
    .text(i.groupLeaveRemoveBtn)
    .resized()
    .persistent();
}

/** Group admin keyboard — can manage members but not promote/expand */
export function groupAdminKeyboard(lang: Lang) {
  const i = t(lang);
  return new Keyboard()
    .text(i.manageMembers).row()
    .text(i.leaveGroup).row()
    .text(i.groupLeaveRemoveBtn)
    .resized()
    .persistent();
}

/** Group sub-menu: 3 options + back */
export function groupSubMenuKeyboard(lang: Lang) {
  const i = t(lang);
  return new Keyboard()
    .text(i.menuCreateGroup).row()
    .text(i.groupSubMenuMine).row()
    .text(i.groupSubMenuJoin).row()
    .text(i.back)
    .resized()
    .persistent();
}

/** My Groups sub-menu: created vs joined */
export function groupMyGroupsKeyboard(lang: Lang) {
  const i = t(lang);
  return new Keyboard()
    .text(i.groupMyGroupsCreated).row()
    .text(i.groupMyGroupsJoined).row()
    .text(i.back)
    .resized()
    .persistent();
}

export function cancelKeyboard(lang: Lang) {
  const i = t(lang);
  return new Keyboard().text(i.cancel).resized().oneTime();
}

export function languageKeyboard() {
  return new Keyboard()
    .text("🇮🇷 فارسی").text("🇬🇧 English")
    .resized()
    .oneTime();
}

export function settingsKeyboard(lang: Lang) {
  const i = t(lang);
  return new Keyboard()
    .text(i.changeGender).text(i.changeAge).row()
    .text(i.changeLanguage).text(i.changeCity).row()
    .text(i.back)
    .resized()
    .oneTime();
}

/** Persistent coins sub-menu */
export function coinsSubMenuKeyboard(lang: Lang) {
  const i = t(lang);
  return new Keyboard()
    .text(i.coinsBtnHistory).text(i.coinsBtnBuy).row()
    .text(i.back)
    .resized()
    .persistent();
}

/** Persistent help sections menu */
export function helpMenuKeyboard(lang: Lang) {
  const i = t(lang);
  return new Keyboard()
    .text(i.helpBtnConnect).text(i.helpBtnGroup).row()
    .text(i.helpBtnLink).text(i.helpBtnProLink).row()
    .text(i.helpBtnCoins).text(i.helpBtnMagic).row()
    .text(i.helpBtnRules).row()
    .text(i.helpBtnSupport).row()
    .text(i.back)
    .resized()
    .persistent();
}

/** Persistent invite/referral sub-menu */
export function inviteMenuKeyboard(lang: Lang) {
  const i = t(lang);
  return new Keyboard()
    .text(i.inviteBtnSpin).row()
    .text(i.inviteBtnGetLink).row()
    .text(i.inviteBtnStats).row()
    .text(i.inviteBtnLeaderboard).text(i.inviteBtnGiftCode).row()
    .text(i.back)
    .resized()
    .persistent();
}

/** Persistent anonymous link sub-menu — shows unread count on inbox button when > 0 */
export function myLinkMenuKeyboard(lang: Lang, unread: number = 0) {
  const i = t(lang);
  const inboxBtn = unread > 0
    ? (lang === "fa" ? `📬 صندوق پیام (${unread} جدید)` : `📬 Inbox (${unread} new)`)
    : i.myLinkBtnInbox;
  return new Keyboard()
    .text(i.myLinkBtnPermanent).row()
    .text(i.myLinkBtnTimed).row()
    .text(inboxBtn).row()
    .text(i.back)
    .resized()
    .persistent();
}

/** Persistent Pro Anonymous Link sub-menu — inbox count is dynamic */
export function anonProSubMenuKeyboard(lang: Lang, proInboxCount: number) {
  const i = t(lang);
  return new Keyboard()
    .text(i.proLinkBtnPerm).row()
    .text(i.proLinkBtnInApp).row()
    .text(i.proLinkBtnMyLinks).row()
    .text(i.proLinkBtnInbox(proInboxCount)).row()
    .text(i.back)
    .resized()
    .persistent();
}

/** One-button cancel keyboard shown while user is typing a pro anonymous message */
export function cancelProSendKeyboard(lang: Lang) {
  return new Keyboard()
    .text(lang === "fa" ? "❌ انصراف" : "❌ Cancel")
    .resized()
    .persistent();
}

/** One-time timed link duration chooser */
export function timedLinkKeyboard(lang: Lang) {
  const i = t(lang);
  return new Keyboard()
    .text(i.timedLink1h).text(i.timedLink6h).row()
    .text(i.timedLink24h).text(i.timedLink7d).row()
    .text(i.back)
    .resized()
    .oneTime();
}

const GW_DEFAULTS = {
  fa: {
    card:     "💳 پرداخت کارت‌به‌کارت",
    crypto:   "₿ ارز دیجیتال (کریپتو)",
    tetrapay: "🌐 درگاه آنلاین (TetraPay)",
    plisio:   "💫 پلیزیو (Plisio)",
    stars:    "⭐ استارز تلگرام",
  },
  en: {
    card:     "💳 Card Payment",
    crypto:   "₿ Cryptocurrency",
    tetrapay: "🌐 Online Gateway (TetraPay)",
    plisio:   "💫 Plisio (Crypto)",
    stars:    "⭐ Telegram Stars",
  },
};

/** STEP 1: Gateway selection keyboard — shown first when buying coins */
export function coinsGatewayKeyboard(
  lang: Lang,
  enabled: { card: boolean; crypto: boolean; gateway: boolean; plisio?: boolean; stars?: boolean },
  customNames?: { card?: string; crypto?: string; tetrapay?: string; plisio?: string; stars?: string }
) {
  const defaults = GW_DEFAULTS[lang];
  const kb = new Keyboard();
  if (enabled.card)    kb.text(customNames?.card     ?? defaults.card).row();
  if (enabled.crypto)  kb.text(customNames?.crypto   ?? defaults.crypto).row();
  if (enabled.gateway) kb.text(customNames?.tetrapay ?? defaults.tetrapay).row();
  if (enabled.plisio)  kb.text(customNames?.plisio   ?? defaults.plisio).row();
  if (enabled.stars)   kb.text(customNames?.stars    ?? defaults.stars).row();
  kb.text(lang === "fa" ? "🔙 بازگشت" : "🔙 Back");
  return kb.resized().persistent();
}

/** STEP 2: Package selection keyboard — uses pkg.price directly (gateway-scoped packages) */
export function coinsPackagesKeyboard(
  packages: PaymentPackage[],
  lang: Lang,
  method?: "card" | "crypto" | "gateway" | "plisio" | "stars"
) {
  const isUsdMethod   = method === "crypto" || method === "plisio";
  const isStarsMethod = method === "stars";
  const kb = new Keyboard();
  for (const pkg of packages) {
    // Gateway-scoped packages: use pkg.price directly.
    // Legacy packages (no gateway): resolve per-gateway override.
    const effectivePrice = pkg.gateway ? pkg.price : (
      method === "card"    && pkg.cardPrice    ? pkg.cardPrice    :
      method === "crypto"  && pkg.cryptoPrice  ? pkg.cryptoPrice  :
      method === "gateway" && pkg.tetrapayPrice ? pkg.tetrapayPrice :
      method === "plisio"  && (pkg.plisioPrice ?? pkg.cryptoPrice) ? (pkg.plisioPrice ?? pkg.cryptoPrice)! :
      pkg.price
    );
    const isStarsPkg = pkg.gateway === "stars" || pkg.currency === "XTR" || isStarsMethod;
    const isUsd      = !isStarsPkg && (pkg.gateway ? (pkg.gateway === "crypto" || pkg.gateway === "plisio") : isUsdMethod);
    const priceStr   = isStarsPkg
      ? `⭐ ${Math.round(effectivePrice)}`
      : isUsd
        ? `$${effectivePrice}`
        : effectivePrice.toLocaleString("fa-IR") + " تومان";

    const hasDiscount = (pkg.discountPercent ?? 0) > 0;
    const label = pkg.label ?? (lang === "fa" ? `${pkg.coins} سکه` : `${pkg.coins} coins`);
    const btnText = hasDiscount
      ? `💎 ${label} | ${priceStr} 🔥-${pkg.discountPercent}%`
      : `💎 ${label} | ${priceStr}`;
    kb.text(btnText).row();
  }
  kb.text(lang === "fa" ? "🔙 بازگشت" : "🔙 Back");
  return kb.resized().persistent();
}
