import { Bot, InlineKeyboard } from "grammy";
import type { BotContext } from "../context.js";
import { getUserByTelegramId } from "../services/user.service.js";
import { deductCoins } from "../services/coin.service.js";
import { getSetting } from "../services/payment.service.js";
import {
  joinOrCreateGroup,
  leaveGroup,
  getUserGroup,
  getGroupMembers,
  generateGroupUserId,
  createGroup,
  isGroupCreator,
  getGroupMembersWithDetails,
  kickMember,
  banMember,
} from "../services/group.service.js";
import { containsBadWord, issueWarning } from "../services/safety.service.js";
import { t } from "../i18n/index.js";
import { mainMenuKeyboard, groupControlKeyboard, groupCreatorKeyboard } from "../keyboards/main.js";

/** Build inline keyboard for group member management */
function buildMemberKeyboard(
  groupId: number,
  members: Array<{ id: number; userId: number; isCreator: boolean; alias: string }>,
  lang: "fa" | "en"
): InlineKeyboard {
  const nonCreators = members.filter((m) => !m.isCreator);
  const kb = new InlineKeyboard();
  for (const m of nonCreators) {
    kb.text(m.alias, `g_noop:${m.id}`)
      .text(t(lang).kickBtn, `g_kick:${groupId}:${m.id}`)
      .text(t(lang).banBtn, `g_ban:${groupId}:${m.id}`)
      .row();
  }
  return kb;
}

export function registerGroupHandlers(bot: Bot<BotContext>) {
  // ─── Join group ──────────────────────────────────────────────────────────────
  bot.hears([/^👥 گروه/, /^👥 Anonymous Group/], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    if (user.isInChat)  { await ctx.reply(t(lang).alreadyInChat);  return; }
    if (user.isInGroup) { await ctx.reply(t(lang).alreadyInGroup); return; }
    if (user.isInQueue) { await ctx.reply(t(lang).alreadyInQueue); return; }

    const result = await deductCoins(tgId, 1, "group_cost", "Join anonymous group");
    if (!result.success) {
      await ctx.reply(t(lang).insufficientCoins, { reply_markup: mainMenuKeyboard(lang) });
      return;
    }

    const { groupId, memberCount, isNew } = await joinOrCreateGroup(tgId);
    const myAlias = await generateGroupUserId(tgId, groupId);
    const members = await getGroupMembers(groupId);

    const groupMsg = t(lang).groupJoined.replace("{count}", memberCount.toString());
    await ctx.reply(groupMsg, { reply_markup: groupControlKeyboard(lang) });

    if (isNew) await ctx.reply(t(lang).newGroupCreated);

    // Notify existing members
    for (const memberId of members) {
      if (memberId === tgId) continue;
      const memberUser = await getUserByTelegramId(memberId);
      const memberLang = (memberUser?.language as "fa" | "en") ?? "fa";
      await bot.api.sendMessage(memberId, t(memberLang).memberJoined(myAlias, memberCount)).catch(() => {});
    }

    // Notify creator if their forming group just became active
    if (memberCount >= 3) {
      const allDetails = await getGroupMembersWithDetails(groupId);
      const creatorEntry = allDetails.find((m) => m.isCreator);
      if (creatorEntry && creatorEntry.userId !== tgId) {
        const cUser = await getUserByTelegramId(creatorEntry.userId);
        const cLang = (cUser?.language as "fa" | "en") ?? "fa";
        await bot.api.sendMessage(creatorEntry.userId, t(cLang).groupActiveNotif(memberCount)).catch(() => {});
      }
    }
  });

  // ─── Create group (paid, with creator privileges) ────────────────────────────
  bot.hears([/^🆕 ساخت گروه/, /^🆕 Create Anonymous Group/], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    if (user.isInChat)  { await ctx.reply(t(lang).alreadyInChat);  return; }
    if (user.isInGroup) { await ctx.reply(t(lang).alreadyInGroup); return; }
    if (user.isInQueue) { await ctx.reply(t(lang).alreadyInQueue); return; }

    const costStr = await getSetting("group_create_cost");
    const cost = costStr ? parseInt(costStr, 10) : 3;

    await ctx.reply(t(lang).createGroupInfo(cost), {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text(t(lang).confirm, "create_group:confirm")
        .text(t(lang).cancel, "create_group:cancel"),
    });
  });

  bot.callbackQuery("create_group:confirm", async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";

    if ((user?.isInGroup) || (user?.isInChat)) {
      await ctx.editMessageText(t(lang).alreadyInGroup);
      await ctx.answerCallbackQuery();
      return;
    }

    const costStr = await getSetting("group_create_cost");
    const cost = costStr ? parseInt(costStr, 10) : 3;

    const result = await deductCoins(tgId, cost, "group_cost", "Create anonymous group");
    if (!result.success) {
      await ctx.editMessageText(t(lang).insufficientCoins);
      await ctx.answerCallbackQuery();
      return;
    }

    const { groupId } = await createGroup(tgId);

    await ctx.editMessageText(t(lang).groupCreatedSuccess, { reply_markup: undefined });
    await ctx.reply(t(lang).groupCreatedSuccess, { reply_markup: groupCreatorKeyboard(lang) });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("create_group:cancel", async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";
    await ctx.editMessageText(t(lang).cancelledAction);
    await ctx.answerCallbackQuery();
  });

  // ─── Manage members (creator only) ───────────────────────────────────────────
  bot.hears([/^👥 مدیریت اعضا/, /^👥 Manage Members/], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    const groupId = await getUserGroup(tgId);
    if (!groupId) { await ctx.reply(t(lang).notInChat); return; }

    const creatorCheck = await isGroupCreator(tgId, groupId);
    if (!creatorCheck) { await ctx.reply(t(lang).notGroupCreator); return; }

    const members = await getGroupMembersWithDetails(groupId);
    const nonCreators = members.filter((m) => !m.isCreator);

    if (nonCreators.length === 0) {
      await ctx.reply(t(lang).noMembersToManage);
      return;
    }

    const kb = buildMemberKeyboard(groupId, members, lang);
    await ctx.reply(t(lang).memberListTitle, { parse_mode: "Markdown", reply_markup: kb });
  });

  // ─── Kick member (creator) ────────────────────────────────────────────────────
  bot.callbackQuery(/^g_kick:(\d+):(\d+)$/, async (ctx) => {
    const tgId = ctx.from!.id;
    const groupId = parseInt(ctx.match![1], 10);
    const memberDbId = parseInt(ctx.match![2], 10);

    const creatorCheck = await isGroupCreator(tgId, groupId);
    if (!creatorCheck) { await ctx.answerCallbackQuery(t("fa").notGroupCreator); return; }

    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";

    const kickedUserId = await kickMember(groupId, memberDbId);
    if (!kickedUserId) { await ctx.answerCallbackQuery(); return; }

    // Notify kicked user
    const kickedUser = await getUserByTelegramId(kickedUserId);
    const kLang = (kickedUser?.language as "fa" | "en") ?? "fa";
    await bot.api.sendMessage(kickedUserId, t(kLang).youWereKicked, { reply_markup: mainMenuKeyboard(kLang) }).catch(() => {});

    // Refresh keyboard
    const members = await getGroupMembersWithDetails(groupId);
    const nonCreators = members.filter((m) => !m.isCreator);
    if (nonCreators.length === 0) {
      await ctx.editMessageText(t(lang).noMembersToManage, { reply_markup: undefined });
    } else {
      const kb = buildMemberKeyboard(groupId, members, lang);
      await ctx.editMessageReplyMarkup({ reply_markup: kb });
    }
    await ctx.answerCallbackQuery("✅");
  });

  // ─── Ban member (creator) ─────────────────────────────────────────────────────
  bot.callbackQuery(/^g_ban:(\d+):(\d+)$/, async (ctx) => {
    const tgId = ctx.from!.id;
    const groupId = parseInt(ctx.match![1], 10);
    const memberDbId = parseInt(ctx.match![2], 10);

    const creatorCheck = await isGroupCreator(tgId, groupId);
    if (!creatorCheck) { await ctx.answerCallbackQuery(t("fa").notGroupCreator); return; }

    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";

    const bannedUserId = await banMember(groupId, memberDbId);
    if (!bannedUserId) { await ctx.answerCallbackQuery(); return; }

    // Notify banned user
    const bannedUser = await getUserByTelegramId(bannedUserId);
    const bLang = (bannedUser?.language as "fa" | "en") ?? "fa";
    await bot.api.sendMessage(bannedUserId, t(bLang).youWereBanned, { reply_markup: mainMenuKeyboard(bLang) }).catch(() => {});

    // Refresh keyboard
    const members = await getGroupMembersWithDetails(groupId);
    const nonCreators = members.filter((m) => !m.isCreator);
    if (nonCreators.length === 0) {
      await ctx.editMessageText(t(lang).noMembersToManage, { reply_markup: undefined });
    } else {
      const kb = buildMemberKeyboard(groupId, members, lang);
      await ctx.editMessageReplyMarkup({ reply_markup: kb });
    }
    await ctx.answerCallbackQuery("✅");
  });

  // ─── No-op for member name buttons ───────────────────────────────────────────
  bot.callbackQuery(/^g_noop:\d+$/, async (ctx) => {
    await ctx.answerCallbackQuery();
  });

  // ─── Leave group ─────────────────────────────────────────────────────────────
  bot.hears([/^🚪 خروج/, /^🚪 Leave Group/], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    const groupIdBefore = await getUserGroup(tgId);
    const myAlias = groupIdBefore ? await generateGroupUserId(tgId, groupIdBefore) : "?";

    const result = await leaveGroup(tgId);
    if (!result) {
      await ctx.reply(t(lang).notInChat, { reply_markup: mainMenuKeyboard(lang) });
      return;
    }

    await ctx.reply(t(lang).groupLeft, { reply_markup: mainMenuKeyboard(lang) });

    if (result.remaining < 2) {
      // Dissolve group — not enough members left
      const members = await getGroupMembers(result.groupId);
      for (const memberId of members) {
        const mUser = await getUserByTelegramId(memberId);
        const mLang = (mUser?.language as "fa" | "en") ?? "fa";
        await bot.api.sendMessage(memberId, t(mLang).groupEnded, { reply_markup: mainMenuKeyboard(mLang) }).catch(() => {});
      }
    } else {
      // Notify remaining members
      const members = await getGroupMembers(result.groupId);
      for (const memberId of members) {
        const mUser = await getUserByTelegramId(memberId);
        const mLang = (mUser?.language as "fa" | "en") ?? "fa";
        await bot.api.sendMessage(memberId, t(mLang).memberLeft(myAlias, result.remaining)).catch(() => {});
      }
    }
  });

  // ─── Forward group messages ───────────────────────────────────────────────────
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
      const caption = `[${lang === "fa" ? "گروه" : "Group"}] ${myAlias}: ${ctx.message.caption ?? ""}`;
      for (const memberId of members) {
        if (memberId === tgId) continue;
        await bot.api.sendPhoto(memberId, photo.file_id, { caption }).catch(() => {});
      }
    } else if (ctx.message.video) {
      const caption = `[${lang === "fa" ? "گروه" : "Group"}] ${myAlias}: ${ctx.message.caption ?? ""}`;
      for (const memberId of members) {
        if (memberId === tgId) continue;
        await bot.api.sendVideo(memberId, ctx.message.video.file_id, { caption }).catch(() => {});
      }
    } else if (ctx.message.voice) {
      for (const memberId of members) {
        if (memberId === tgId) continue;
        await bot.api.sendVoice(memberId, ctx.message.voice.file_id).catch(() => {});
      }
    } else if (ctx.message.sticker) {
      for (const memberId of members) {
        if (memberId === tgId) continue;
        await bot.api.sendSticker(memberId, ctx.message.sticker.file_id).catch(() => {});
      }
    }
  });
}
