import { Bot } from "grammy";
import type { BotContext } from "../context.js";
import { getUserByTelegramId } from "../services/user.service.js";
import { deductCoins } from "../services/coin.service.js";
import { joinOrCreateGroup, leaveGroup, getUserGroup, getGroupMembers, generateGroupUserId } from "../services/group.service.js";
import { containsBadWord, issueWarning } from "../services/safety.service.js";
import { t } from "../i18n/index.js";
import { mainMenuKeyboard, groupControlKeyboard } from "../keyboards/main.js";

export function registerGroupHandlers(bot: Bot<BotContext>) {
  bot.hears([/^👥 گروه/, /^👥 Anonymous Group/], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    if (user.isInChat) { await ctx.reply(t(lang).alreadyInChat); return; }
    if (user.isInGroup) { await ctx.reply(t(lang).alreadyInGroup); return; }

    const result = await deductCoins(tgId, 1, "group_cost", "Join anonymous group");
    if (!result.success) {
      await ctx.reply(t(lang).insufficientCoins, { reply_markup: mainMenuKeyboard(lang) });
      return;
    }

    const { groupId, memberCount, isNew } = await joinOrCreateGroup(tgId);
    const members = await getGroupMembers(groupId);

    const groupMsg = t(lang).groupJoined.replace("{count}", memberCount.toString());
    await ctx.reply(groupMsg, { reply_markup: groupControlKeyboard(lang) });

    if (isNew) {
      await ctx.reply(t(lang).newGroupCreated);
    }

    // Notify existing members
    const myId = await generateGroupUserId(tgId, groupId);
    for (const memberId of members) {
      if (memberId === tgId) continue;
      const memberUser = await getUserByTelegramId(memberId);
      const memberLang = (memberUser?.language as "fa" | "en") ?? "fa";
      await bot.api.sendMessage(memberId, `👥 کاربر ${myId} به گروه پیوست. (${memberCount} نفر)`)
        .catch(() => {});
    }
  });

  // Leave group
  bot.hears([/^🚪 خروج/, /^🚪 Leave Group/], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    const result = await leaveGroup(tgId);
    if (!result) {
      await ctx.reply(t(lang).notInChat, { reply_markup: mainMenuKeyboard(lang) });
      return;
    }

    await ctx.reply(t(lang).groupLeft, { reply_markup: mainMenuKeyboard(lang) });

    if (result.remaining < 2) {
      const members = await getGroupMembers(result.groupId);
      for (const memberId of members) {
        const mUser = await getUserByTelegramId(memberId);
        const mLang = (mUser?.language as "fa" | "en") ?? "fa";
        await bot.api.sendMessage(memberId, t(mLang).groupEnded, { reply_markup: mainMenuKeyboard(mLang) }).catch(() => {});
      }
    }
  });

  // Forward group messages
  bot.on("message", async (ctx, next) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user?.isInGroup) return next();
    const lang = (user.language as "fa" | "en") ?? "fa";

    const groupId = await getUserGroup(tgId);
    if (!groupId) return next();

    const members = await getGroupMembers(groupId);
    const myAlias = await generateGroupUserId(tgId, groupId);

    if (ctx.message.text) {
      const isBad = await containsBadWord(ctx.message.text);
      if (isBad) {
        await ctx.reply(t(lang).messageBlocked);
        await issueWarning(tgId, "Bad word in group");
        return;
      }
      const fwdText = t(lang).groupMessage(myAlias) + ctx.message.text;
      for (const memberId of members) {
        if (memberId === tgId) continue;
        await bot.api.sendMessage(memberId, fwdText).catch(() => {});
      }
    } else if (ctx.message.photo) {
      const photo = ctx.message.photo.at(-1)!;
      for (const memberId of members) {
        if (memberId === tgId) continue;
        await bot.api.sendPhoto(memberId, photo.file_id, { caption: `[گروه] ${myAlias}: ${ctx.message.caption ?? ""}` }).catch(() => {});
      }
    } else if (ctx.message.sticker) {
      for (const memberId of members) {
        if (memberId === tgId) continue;
        await bot.api.sendSticker(memberId, ctx.message.sticker.file_id).catch(() => {});
      }
    }
  });
}
