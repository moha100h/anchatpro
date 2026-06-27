import { Bot, InlineKeyboard } from "grammy";
import type { BotContext } from "../context.js";
import { getUserByTelegramId } from "../services/user.service.js";
import { deductCoins } from "../services/coin.service.js";
import {
  addToQueue,
  removeFromQueue,
  findMatch,
  createChatSession,
  getActiveSession,
  endChatSession,
  getPartnerId,
} from "../services/matching.service.js";
import { reportUser, blockUser, containsBadWord, issueWarning } from "../services/safety.service.js";
import { t } from "../i18n/index.js";
import {
  mainMenuKeyboard,
  genderPrefKeyboard,
  chatControlKeyboard,
  cancelKeyboard,
} from "../keyboards/main.js";
import { reportReasonsKeyboard, blockReasonsKeyboard } from "../keyboards/inline.js";

// ─── Daily free "any" chat counter (resets each calendar day) ────────────────
const dailyFreeMap = new Map<number, { count: number; date: string }>();
const FREE_ANY_DAILY = 3;

function getTodayKey(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tehran" });
}
function getFreeChatCount(tgId: number): number {
  const entry = dailyFreeMap.get(tgId);
  if (!entry || entry.date !== getTodayKey()) return 0;
  return entry.count;
}
function incrementFreeChat(tgId: number): void {
  dailyFreeMap.set(tgId, { count: getFreeChatCount(tgId) + 1, date: getTodayKey() });
}

export function registerMatchingHandlers(bot: Bot<BotContext>) {
  // ─── Connect button ──────────────────────────────────────────────────────────
  bot.hears([/^🔗 اتصال/, /^🔗 Connect/], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user || !user.gender) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    if (user.isInChat)  { await ctx.reply(t(lang).alreadyInChat);  return; }
    if (user.isInQueue) { await ctx.reply(t(lang).alreadyInQueue); return; }
    if (user.isInGroup) { await ctx.reply(t(lang).alreadyInGroup); return; }

    await ctx.reply(t(lang).selectGenderPref, { reply_markup: genderPrefKeyboard(lang) });
  });

  // ─── Gender preference selection ─────────────────────────────────────────────
  bot.hears(
    [/^👧 (دختر|زن)$/, /^👦 (پسر|مرد)$/, /^🎲 شانسی$/, /^👧 Female$/, /^👦 Male$/, /^🎲 Random$/],
    async (ctx) => {
      const tgId = ctx.from!.id;
      const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
      if (!user) return;
      const lang = (user.language as "fa" | "en") ?? "fa";
      if (user.isInChat || user.isInGroup) return;

      const text = ctx.message!.text ?? "";
      let pref: "male" | "female" | "any" = "any";
      if (text.includes("👧")) pref = "female";
      else if (text.includes("👦")) pref = "male";
      else pref = "any";

      if (pref === "any") {
        const used = getFreeChatCount(tgId);
        if (used < FREE_ANY_DAILY) {
          // Free — queue directly and show remaining
          incrementFreeChat(tgId);
          const left = FREE_ANY_DAILY - getFreeChatCount(tgId);
          const matchId = await findMatch(tgId, "any", user.gender ?? "other");
          if (matchId) {
            await createChatSession(tgId, matchId);
            const matchUser = await getUserByTelegramId(matchId);
            const matchLang = (matchUser?.language as "fa" | "en") ?? "fa";
            await ctx.reply(t(lang).connectedWith(matchUser ?? {}), {
              parse_mode: "Markdown",
              reply_markup: chatControlKeyboard(lang),
            });
            await bot.api
              .sendMessage(matchId, t(matchLang).connectedWith(user), {
                parse_mode: "Markdown",
                reply_markup: chatControlKeyboard(matchLang),
              })
              .catch(() => {});
          } else {
            await addToQueue(tgId, "any", user.gender ?? "other");
            await ctx.reply(t(lang).matchFreeAny(left), { reply_markup: cancelKeyboard(lang) });
            setTimeout(() => tryMatchFromQueue(bot, tgId, "any", user.gender ?? "other", lang), 3000);
          }
          return;
        }
        // Daily free exhausted → ask for coin confirmation
        const kb = new InlineKeyboard()
          .text(t(lang).matchConfirmBtn, "match:confirm:any")
          .text(t(lang).matchCancelBtn, "match:cancel");
        await ctx.reply(t(lang).matchCostAny, { parse_mode: "Markdown", reply_markup: kb });
        return;
      }

      // male / female — always costs 1 coin → confirm first
      const kb = new InlineKeyboard()
        .text(t(lang).matchConfirmBtn, `match:confirm:${pref}`)
        .text(t(lang).matchCancelBtn, "match:cancel");
      await ctx.reply(t(lang).matchCostGender, { parse_mode: "Markdown", reply_markup: kb });
    }
  );

  // ─── Match confirm callback ────────────────────────────────────────────────
  bot.callbackQuery(/^match:confirm:(male|female|any)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    if (user.isInChat || user.isInGroup) {
      await ctx.editMessageText("❌").catch(() => {});
      return;
    }

    const pref = ctx.match![1] as "male" | "female" | "any";
    const result = await deductCoins(tgId, 1, "chat_cost", `Connect to ${pref}`);
    if (!result.success) {
      await ctx.editMessageText(t(lang).insufficientCoins).catch(() => {});
      await ctx.reply(t(lang).insufficientCoins, { reply_markup: mainMenuKeyboard(lang) });
      return;
    }

    await ctx.editMessageText("⏳").catch(() => {});

    const matchId = await findMatch(tgId, pref, user.gender ?? "other");
    if (matchId) {
      await createChatSession(tgId, matchId);
      const matchUser = await getUserByTelegramId(matchId);
      const matchLang = (matchUser?.language as "fa" | "en") ?? "fa";
      await bot.api
        .sendMessage(tgId, t(lang).connectedWith(matchUser ?? {}), {
          parse_mode: "Markdown",
          reply_markup: chatControlKeyboard(lang),
        })
        .catch(() => {});
      await bot.api
        .sendMessage(matchId, t(matchLang).connectedWith(user), {
          parse_mode: "Markdown",
          reply_markup: chatControlKeyboard(matchLang),
        })
        .catch(() => {});
    } else {
      await addToQueue(tgId, pref, user.gender ?? "other");
      await bot.api
        .sendMessage(tgId, t(lang).addedToQueue, { reply_markup: cancelKeyboard(lang) })
        .catch(() => {});
      setTimeout(() => tryMatchFromQueue(bot, tgId, pref, user.gender ?? "other", lang), 3000);
    }
  });

  // ─── Back from gender-pref screen → main menu ───────────────────────────────
  bot.hears(["🔙 برگشت", "🔙 Back"], async (ctx, next) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return next();
    // Only handle here when user is completely idle (not in chat/queue/group)
    if (user.isInChat || user.isInQueue || user.isInGroup) return next();
    const lang = (user.language as "fa" | "en") ?? "fa";
    await ctx.reply("📋", { reply_markup: mainMenuKeyboard(lang) });
  });

  // ─── Match cancel callback ────────────────────────────────────────────────
  bot.callbackQuery("match:cancel", async (ctx) => {
    await ctx.answerCallbackQuery();
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";
    await ctx.editMessageText("❌").catch(() => {});
    await ctx.reply(t(lang).selectGenderPref, { reply_markup: genderPrefKeyboard(lang) });
  });

  // ─── Cancel search / queue
  // IMPORTANT: calls next() when NOT in queue so subsequent cancel handlers can fire
  bot.hears([/^❌ لغو/, /^❌ Cancel/], async (ctx, next) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return next();
    const lang = (user.language as "fa" | "en") ?? "fa";

    if (user.isInQueue) {
      await removeFromQueue(tgId);
      await ctx.reply(t(lang).removedFromQueue, { reply_markup: mainMenuKeyboard(lang) });
      return; // handled — stop chain
    }

    return next(); // not in queue — pass to next cancel handler (coins, settings, etc.)
  });

  // ─── End chat ────────────────────────────────────────────────────────────────
  bot.hears([/^🔴 پایان/, /^🔴 End Chat/], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    const session = await getActiveSession(tgId);
    if (!session) {
      await ctx.reply(t(lang).notInChat, { reply_markup: mainMenuKeyboard(lang) });
      return;
    }

    const result = await endChatSession(session.id, tgId);
    if (!result) {
      await ctx.reply(t(lang).notInChat, { reply_markup: mainMenuKeyboard(lang) });
      return;
    }

    await ctx.reply(t(lang).chatEnded, { reply_markup: mainMenuKeyboard(lang) });

    const partnerId = result.user1Id === tgId ? result.user2Id : result.user1Id;
    const partnerUser = await getUserByTelegramId(partnerId);
    const partnerLang = (partnerUser?.language as "fa" | "en") ?? "fa";
    await bot.api
      .sendMessage(partnerId, t(partnerLang).chatEndedByPartner, { reply_markup: mainMenuKeyboard(partnerLang) })
      .catch(() => {});
  });

  // ─── Report user ─────────────────────────────────────────────────────────────
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

  // ─── Block user ──────────────────────────────────────────────────────────────
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

  // ─── Report reason callback ───────────────────────────────────────────────────
  bot.callbackQuery(/^report_reason:(\d+)$/, async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";
    const reasonIdx = parseInt(ctx.match![1], 10);
    const reason = t(lang).reportReasons[reasonIdx] ?? "Other";

    const sessionId = ctx.session.pendingReportSessionId;
    if (sessionId) {
      const session = await getActiveSession(tgId);
      const partnerId = session ? await getPartnerId(session.id, tgId) : null;
      if (partnerId) await reportUser(tgId, partnerId, reason, sessionId);
    }
    ctx.session.pendingReportSessionId = undefined;
    await ctx.editMessageText(t(lang).reportSent).catch(() => {});
    await ctx.answerCallbackQuery();
  });

  // ─── Block reason callback ────────────────────────────────────────────────────
  bot.callbackQuery(/^block_reason:(\d+)$/, async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";
    const reasonIdx = parseInt(ctx.match![1], 10);
    const reason = t(lang).blockReasons[reasonIdx] ?? "Other";

    const blockedId = ctx.session.pendingBlockUserId;
    if (blockedId) {
      const blocked = await blockUser(tgId, blockedId, reason);
      await ctx.editMessageText(blocked ? t(lang).userBlocked : t(lang).alreadyBlocked).catch(() => {});

      const session = await getActiveSession(tgId);
      if (session) {
        const result = await endChatSession(session.id, tgId);
        if (result) {
          const partnerId = result.user1Id === tgId ? result.user2Id : result.user1Id;
          const partnerUser = await getUserByTelegramId(partnerId);
          const pLang = (partnerUser?.language as "fa" | "en") ?? "fa";
          await bot.api
            .sendMessage(partnerId, t(pLang).chatEndedByPartner, { reply_markup: mainMenuKeyboard(pLang) })
            .catch(() => {});
        }
      }
      await ctx.reply(t(lang).chatEnded, { reply_markup: mainMenuKeyboard(lang) });
    }
    ctx.session.pendingBlockUserId = undefined;
    await ctx.answerCallbackQuery();
  });

  // ─── Forward messages during 1-on-1 chat ─────────────────────────────────────
  // Button/command texts that must NEVER be forwarded — let hears() handlers catch them.
  // This guards against the edge case where the user's visible keyboard diverges from
  // their isInChat state (e.g. after /start resets the keyboard mid-session).
  const SKIP_FORWARD_RE =
    /^(🔴|🚨|🚫|❌|🔙|💰|❓|⚙️|🎁|🌊|🔮|🍾|✉️|📡|👧|👦|🎲|🌈|🇮🇷|🇬🇧|🚪|📖|📋|🛒|🔗|👥|🆕|⭐|⬆️|📊)/u;

  bot.on("message", async (ctx, next) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user?.isInChat) return next();
    // If user is in anon-reply or anon-send mode, skip chat forwarding
    if (ctx.session.step?.startsWith("anon_reply:") || ctx.session.step?.startsWith("anon_send:")) return next();

    const session = await getActiveSession(tgId);
    if (!session) return next();

    const partnerId = await getPartnerId(session.id, tgId);
    if (!partnerId) return next();

    const partnerUser = await getUserByTelegramId(partnerId);
    if (!partnerUser?.isInChat) return next();

    // Safety check on text
    if (ctx.message.text) {
      // Do NOT forward keyboard button texts — pass to the proper hears() handler
      if (SKIP_FORWARD_RE.test(ctx.message.text)) return next();

      const lang = (user.language as "fa" | "en") ?? "fa";
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
      await bot.api
        .sendPhoto(partnerId, photo.file_id, { caption: ctx.message.caption ?? "" })
        .catch(() => {});
    } else if (ctx.message.video) {
      await bot.api
        .sendVideo(partnerId, ctx.message.video.file_id, { caption: ctx.message.caption ?? "" })
        .catch(() => {});
    } else if (ctx.message.voice) {
      await bot.api.sendVoice(partnerId, ctx.message.voice.file_id).catch(() => {});
    } else if (ctx.message.audio) {
      await bot.api.sendAudio(partnerId, ctx.message.audio.file_id).catch(() => {});
    } else if (ctx.message.sticker) {
      await bot.api.sendSticker(partnerId, ctx.message.sticker.file_id).catch(() => {});
    } else if (ctx.message.document) {
      await bot.api
        .sendDocument(partnerId, ctx.message.document.file_id, { caption: ctx.message.caption ?? "" })
        .catch(() => {});
    } else if (ctx.message.animation) {
      await bot.api
        .sendAnimation(partnerId, ctx.message.animation.file_id)
        .catch(() => {});
    } else if (ctx.message.video_note) {
      await bot.api.sendVideoNote(partnerId, ctx.message.video_note.file_id).catch(() => {});
    }
  });
}

// ─── Background queue matching loop ──────────────────────────────────────────
async function tryMatchFromQueue(
  bot: Bot<BotContext>,
  tgId: number,
  pref: "male" | "female" | "any",
  gender: string,
  lang: "fa" | "en",
  attempt = 0
): Promise<void> {
  if (attempt >= 12) {
    await removeFromQueue(tgId);
    await bot.api.sendMessage(tgId, t(lang).queueTimeout).catch(() => {});
    return;
  }

  const user = await getUserByTelegramId(tgId);
  if (!user?.isInQueue) return; // already matched or cancelled

  const matchId = await findMatch(tgId, pref, gender);
  if (matchId) {
    await createChatSession(tgId, matchId);
    const [myUser, matchUser] = await Promise.all([
      getUserByTelegramId(tgId),
      getUserByTelegramId(matchId),
    ]);
    const matchLang = (matchUser?.language as "fa" | "en") ?? "fa";
    await bot.api
      .sendMessage(tgId, t(lang).connectedWith(matchUser ?? {}), {
        parse_mode: "Markdown",
        reply_markup: chatControlKeyboard(lang),
      })
      .catch(() => {});
    await bot.api
      .sendMessage(matchId, t(matchLang).connectedWith(myUser ?? {}), {
        parse_mode: "Markdown",
        reply_markup: chatControlKeyboard(matchLang),
      })
      .catch(() => {});
  } else {
    setTimeout(() => tryMatchFromQueue(bot, tgId, pref, gender, lang, attempt + 1), 5000);
  }
}
