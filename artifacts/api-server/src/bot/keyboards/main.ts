import { Keyboard } from "grammy";
import { t, type Lang } from "../i18n/index.js";

export function magicMenuKeyboard(lang: Lang) {
  const i = t(lang);
  return new Keyboard()
    .text(i.magicBtnBottle).text(i.magicBtnChain).row()
    .text(i.magicBtnLetter).text(i.magicBtnFreq).row()
    .text(i.back)
    .resized()
    .persistent();
}

export function mainMenuKeyboard(lang: Lang) {
  const i = t(lang);
  return new Keyboard()
    .text(i.menuConnect).text(i.menuGroup).row()
    .text(i.menuCreateGroup).text(i.menuMyLink).row()
    .text(i.menuCoins).text(i.menuReferral).row()
    .text(i.menuMagic).row()
    .text(i.menuHelp).text(i.menuSettings)
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
    .text(i.genderPrefAny)
    .resized()
    .oneTime();
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
    .text(i.leaveGroup)
    .resized()
    .persistent();
}

/** Group creator keyboard — includes member management */
export function groupCreatorKeyboard(lang: Lang) {
  const i = t(lang);
  return new Keyboard()
    .text(i.manageMembers).row()
    .text(i.leaveGroup)
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
    .text(i.changeLanguage).row()
    .text(i.back)
    .resized()
    .oneTime();
}
