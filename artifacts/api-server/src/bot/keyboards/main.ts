import { Keyboard } from "grammy";
import { t, type Lang } from "../i18n/index.js";

export function mainMenuKeyboard(lang: Lang) {
  const i = t(lang);
  return new Keyboard()
    .text(i.menuConnect).text(i.menuGroup).row()
    .text(i.menuAnonProLink).text(i.menuMyLink).row()
    .text(i.menuMagic).row()
    .text(i.menuCoins).text(i.menuReferral).row()
    .text(i.menuHelp).text(i.menuSettings)
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

export function genderPrefKeyboard(lang: Lang) {
  const i = t(lang);
  return new Keyboard()
    .text(i.genderPrefFemale).text(i.genderPrefMale).row()
    .text(i.genderPrefAny).row()
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
    .text(i.helpBtnLink).text(i.helpBtnCoins).row()
    .text(i.helpBtnRules).text(i.helpBtnMagic).row()
    .text(i.helpBtnSupport).row()
    .text(i.back)
    .resized()
    .persistent();
}

/** Persistent invite/referral sub-menu */
export function inviteMenuKeyboard(lang: Lang) {
  const i = t(lang);
  return new Keyboard()
    .text(i.inviteBtnGetLink).row()
    .text(i.inviteBtnStats).row()
    .text(i.back)
    .resized()
    .persistent();
}

/** Persistent anonymous link sub-menu */
export function myLinkMenuKeyboard(lang: Lang) {
  const i = t(lang);
  return new Keyboard()
    .text(i.myLinkBtnPermanent).row()
    .text(i.myLinkBtnTimed).row()
    .text(i.myLinkBtnInbox).row()
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
