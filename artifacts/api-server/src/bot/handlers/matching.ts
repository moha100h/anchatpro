import { Bot } from "grammy";
import type { BotContext } from "../context.js";
import { getUserByTelegramId } from "../services/user.service.js";
import { deductCoins } from "../services/coin.service.js";
import {
  addToQueue, removeFromQueue, findMatch, createChatSession,
  getActiveSession, endChatSession, getPartnerId
} from "../services/matching.service.js";
import { reportUser, blockUser, isBlocked } from "../services/safety.service.js";
import { containsBadWord, issueWarning } from "../services/safety.service.js";
import { t } from "../i18n/index.js";
import { mainMenuKeyboard, genderPrefKeyboard, chatControlKeyboard, cancelKeyboard } from "../keyboards/main.js";
import { reportReasonsKeyboard, blockReasonsKeyboard } from "../keyboards/inline.js";

export function registerMatchingHandlers(bot: Bot<BotContext>) {
  // Connect button
  bot.hears([/^🔗 اتصال/, /^🔗 Connect/], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user || !user.gender) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    if (user.isInChat) { await ctx.reply(t(lang).alreadyInChat); return; }
    if (user.isInQueue) { await ctx.reply(t(lang).alreadyInQueue); return; }
    if (user.isInGroup) { await ctx.reply(t(lang).alreadyInGroup); return; }

    await ctx.reply(t(lang).selectGenderPref, { reply_markup: genderPrefKeyboard(lang) });
  });

  // Gender preference selection
  bot.hears([/^👧 زن$/, /^👦 مرد$/, /^🎲 هر کسی$/, /^👧 Female$/, /^👦 Male$/, /^🎲 Anyone$/], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    if (user.isInChat || user.isInGroup) return;

    const text = ctx.message!.text ?? "";
    let pref: "male" | "female" | "any" = "any";
    let needsCoin = false;

    if (text.includes("👧")) { pref = "female"; needsCoin = true; }
    else if (text.includes("👦")) { pref = "male"; needsCoin = true; }
    else { pref = "any"; }

    if (needsCoin) {
      const result = await deductCoins(tgId, 1, "chat_cost", `Connect to ${pref}`);
      if (!result.success) {
        await ctx.reply(t(lang).insufficientCoins, { reply_markup: mainMenuKeyboard(lang) });
        return;
      }
    }

    // Try to find a match immediately
    const matchId = await findMatch(tgId, pref, user.gender ?? "other");

    if (matchId) {
      const sessionId = await createChatSession(tgId, matchId);
      await ctx.reply(t(lang).connected, { reply_markup: chatControlKeyboard(lang) });

      const matchUser = await getUserByTelegramId(matchId);
      const matchLang = (matchUser?.language as "fa" | "en") ?? "fa";
      await bot.api.sendMessage(matchId, t(matchLang).connected, { reply_markup: chatControlKeyboard(matchLang) });
    } else {
      await addToQueue(tgId, pref, user.gender ?? "other");
      await ctx.reply(t(lang).addedToQueue, { reply_markup: cancelKeyboard(lang) });

      // Queue matching loop (check every 5s, timeout 60s)
      setTimeout(async () => { await tryMatchFromQueue(bot, tgId, pref, user.gender ?? "other", lang); }, 3000);
    }
  });

  // Cancel search
  bot.hears([/^❌ لغو/, /^❌ Cancel/], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    if (user.isInQueue) {
      await removeFromQueue(tgId);
      await ctx.reply(t(lang).removedFromQueue, { reply_markup: mainMenuKeyboard(lang) });
    }
  });

  // End chat
  bot.hears([/^🔴 پایان/, /^🔴 End Chat/], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    const session = await getActiveSession(tgId);
    if (!session) { await ctx.reply(t(lang).notInChat, { reply_markup: mainMenuKeyboard(lang) }); return; }

    const result = await endChatSession(session.id, tgId);
    if (!result) { await ctx.reply(t(lang).notInChat, { reply_markup: mainMenuKeyboard(lang) }); return; }

    await ctx.reply(t(lang).chatEnded, { reply_markup: mainMenuKeyboard(lang) });

    const partnerId = result.user1Id === tgId ? result.user2Id : result.user1Id;
    const partnerUser = await getUserByTelegramId(partnerId);
    const partnerLang = (partnerUser?.language as "fa" | "en") ?? "fa";
    await bot.api.sendMessage(partnerId, t(partnerLang).chatEndedByPartner, { reply_markup: mainMenuKeyboard(partnerLang) }).catch(() => {});
  });

  // Report user
  bot.hears([/^🚨 گزارش/, /^🚨 Report/], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    const session = await getActiveSession(tgId);
    if (!session) { await ctx.reply(t(lang).notInChat); return; }

    ctx.session.pendingReportSessionId = session.id;
    await ctx.reply(t(lang).selectReportReason, { reply_markup: reportReasonsKeyboard(lang) });
  });

  // Block user
  bot.hears([/^🚫 بلاک/, /^🚫 Block/], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    const session = await getActiveSession(tgId);
    if (!session) { await ctx.reply(t(lang).notInChat); return; }

    const partnerId = await getPartnerId(session.id, tgId);
    if (!partnerId) return;
    ctx.session.pendingBlockUserId = partnerId;
    await ctx.reply(t(lang).selectBlockReason, { reply_markup: blockReasonsKeyboard(lang) });
  });

  // Report reason callback
  bot.callbackQuery(/^report_reason:(\d+)$/, async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";
    const reasonIdx = parseInt(ctx.match![1], 10);
    const reasons = t(lang).reportReasons;
    const reason = reasons[reasonIdx] ?? "Other";

    const sessionId = ctx.session.pendingReportSessionId;
    if (sessionId) {
      const session = await getActiveSession(tgId);
      const partnerId = session ? await getPartnerId(session.id, tgId) : null;
      if (partnerId) await reportUser(tgId, partnerId, reason, sessionId);
    }
    ctx.session.pendingReportSessionId = undefined;
    await ctx.editMessageText(t(lang).reportSent);
    await ctx.answerCallbackQuery();
  });

  // Block reason callback
  bot.callbackQuery(/^block_reason:(\d+)$/, async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";
    const reasonIdx = parseInt(ctx.match![1], 10);
    const reasons = t(lang).blockReasons;
    const reason = reasons[reasonIdx] ?? "Other";

    const blockedId = ctx.session.pendingBlockUserId;
    if (blockedId) {
      const blocked = await blockUser(tgId, blockedId, reason);
      if (!blocked) { await ctx.editMessageText(t(lang).alreadyBlocked); }
      else { await ctx.editMessageText(t(lang).userBlocked); }

      // End session
      const session = await getActiveSession(tgId);
      if (session) {
        const result = await endChatSession(session.id, tgId);
        if (result) {
          const partnerId = result.user1Id === tgId ? result.user2Id : result.user1Id;
          const partnerUser = await getUserByTelegramId(partnerId);
          const pLang = (partnerUser?.language as "fa" | "en") ?? "fa";
          await bot.api.sendMessage(partnerId, t(pLang).chatEndedByPartner, { reply_markup: mainMenuKeyboard(pLang) }).catch(() => {});
        }
      }
      await ctx.reply(t(lang).chatEnded, { reply_markup: mainMenuKeyboard(lang) });
    }
    ctx.session.pendingBlockUserId = undefined;
    await ctx.answerCallbackQuery();
  });

  // Forward messages during chat
  bot.on("message", async (ctx, next) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user?.isInChat) return next();
    const lang = (user.language as "fa" | "en") ?? "fa";

    const session = await getActiveSession(tgId);
    if (!session) return next();

    const partnerId = await getPartnerId(session.id, tgId);
    if (!partnerId) return next();

    const partnerUser = await getUserByTelegramId(partnerId);
    if (!partnerUser?.isInChat) return next();

    // Safety check
    if (ctx.message.text) {
      const isBad = await containsBadWord(ctx.message.text);
      if (isBad) {
        await ctx.reply(t(lang).messageBlocked);
        const warnCount = await issueWarning(tgId, "Bad word in chat");
        if (warnCount < 3) await ctx.reply(t(lang).warningIssued(warnCount));
        return;
      }
      await bot.api.sendMessage(partnerId, ctx.message.text).catch(() => {});
    } else if (ctx.message.photo) {
      const photo = ctx.message.photo.at(-1)!;
      await bot.api.sendPhoto(partnerId, photo.file_id, { caption: ctx.message.caption ?? "" }).catch(() => {});
    } else if (ctx.message.video) {
      await bot.api.sendVideo(partnerId, ctx.message.video.file_id, { caption: ctx.message.caption ?? "" }).catch(() => {});
    } else if (ctx.message.voice) {
      await bot.api.sendVoice(partnerId, ctx.message.voice.file_id).catch(() => {});
    } else if (ctx.message.audio) {
      await bot.api.sendAudio(partnerId, ctx.message.audio.file_id).catch(() => {});
    } else if (ctx.message.sticker) {
      await bot.api.sendSticker(partnerId, ctx.message.sticker.file_id).catch(() => {});
    } else if (ctx.message.document) {
      await bot.api.sendDocument(partnerId, ctx.message.document.file_id, { caption: ctx.message.caption ?? "" }).catch(() => {});
    } else if (ctx.message.animation) {
      await bot.api.sendAnimation(partnerId, ctx.message.animation.file_id).catch(() => {});
    } else if (ctx.message.video_note) {
      await bot.api.sendVideoNote(partnerId, ctx.message.video_note.file_id).catch(() => {});
    }
  });
}

async function tryMatchFromQueue(bot: Bot<BotContext>, tgId: number, pref: "male" | "female" | "any", gender: string, lang: "fa" | "en", attempt = 0): Promise<void> {
  if (attempt >= 12) { // 12 * 5s = 60s timeout
    await removeFromQueue(tgId);
    await bot.api.sendMessage(tgId, t(lang).queueTimeout).catch(() => {});
    return;
  }

  const user = await getUserByTelegramId(tgId);
  if (!user?.isInQueue) return; // Already matched or cancelled

  const matchId = await findMatch(tgId, pref, gender);
  if (matchId) {
    await createChatSession(tgId, matchId);
    await bot.api.sendMessage(tgId, t(lang).connected, { reply_markup: chatControlKeyboard(lang) }).catch(() => {});
    const matchUser = await getUserByTelegramId(matchId);
    const matchLang = (matchUser?.language as "fa" | "en") ?? "fa";
    await bot.api.sendMessage(matchId, t(matchLang).connected, { reply_markup: chatControlKeyboard(matchLang) }).catch(() => {});
  } else {
    setTimeout(() => tryMatchFromQueue(bot, tgId, pref, gender, lang, attempt + 1), 5000);
  }
}
