import { Bot, InlineKeyboard } from "grammy";
import type { BotContext } from "../context.js";
import { getUserByTelegramId, updateUser, isUserRestricted } from "../services/user.service.js";
import { getUserGroup } from "../services/group.service.js";
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
import { getSetting } from "../services/payment.service.js";
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

async function getFreeAnyDaily(): Promise<number> {
  const v = await getSetting("match_free_daily");
  const n = parseInt(v ?? "3", 10);
  return isNaN(n) || n < 0 ? 3 : n;
}
async function getMatchCostAny(): Promise<number> {
  const v = await getSetting("match_cost_any");
  const n = parseInt(v ?? "1", 10);
  return isNaN(n) || n < 1 ? 1 : n;
}
async function getMatchCostGender(): Promise<number> {
  const v = await getSetting("match_cost_gender");
  const n = parseInt(v ?? "1", 10);
  return isNaN(n) || n < 1 ? 1 : n;
}

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

    // Check restriction (auto-lifted once the window passes)
    if (await isUserRestricted(tgId)) {
      await ctx.reply(t(lang).userRestricted);
      return;
    }

    if (user.isInChat)  { await ctx.reply(t(lang).alreadyInChat);  return; }
    if (user.isInQueue) { await ctx.reply(t(lang).alreadyInQueue); return; }
    if (user.isInGroup) {
      // Verify — flag can be stale after a crash
      const actualGroupId = await getUserGroup(tgId);
      if (actualGroupId !== null) {
        await ctx.reply(t(lang).alreadyInGroup);
        return;
      }
      await updateUser(tgId, { isInGroup: false });
      // Fall through — stale flag cleared
    }

    ctx.session.sameAgeMatch = ctx.session.sameAgeMatch ?? false;
    await ctx.reply(t(lang).selectGenderPref, { reply_markup: genderPrefKeyboard(lang, ctx.session.sameAgeMatch) });
  });

  // ─── Same-age toggle button ────────────────────────────────────────────────
  bot.hears(
    ["🎯 هم‌سن", "🎯 Same Age", "✅ هم‌سن (فعال)", "✅ Same Age (On)"],
    async (ctx) => {
      const tgId = ctx.from!.id;
      const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
      if (!user) return;
      const lang = (user.language as "fa" | "en") ?? "fa";
      // Only handle if user is idle
      if (user.isInChat || user.isInGroup || user.isInQueue) return;

      ctx.session.sameAgeMatch = !ctx.session.sameAgeMatch;
      const msg = ctx.session.sameAgeMatch
        ? (lang === "fa"
            ? "🎯 **هم‌سن فعال** شد\n\nسیستم سعی می‌کند کاربری هم‌سن شما پیدا کند.\nاگر هم‌سن پیدا نشد، به نزدیک‌ترین سن متصل می‌شوید."
            : "🎯 **Same Age enabled**\n\nThe system will try to find someone your age.\nIf none found, you'll be matched with the closest age.")
        : (lang === "fa" ? "🎯 هم‌سن **غیرفعال** شد." : "🎯 Same Age **disabled**.");
      await ctx.reply(msg, {
        parse_mode: "Markdown",
        reply_markup: genderPrefKeyboard(lang, ctx.session.sameAgeMatch),
      });
    }
  );

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

      const ageMatch = ctx.session.sameAgeMatch ?? false;
      const userAge = user.age ?? undefined;

      if (pref === "any") {
        const freeAnyDaily = await getFreeAnyDaily();
        const used = getFreeChatCount(tgId);
        if (used < freeAnyDaily) {
          // Free — queue directly and show remaining
          incrementFreeChat(tgId);
          const left = freeAnyDaily - getFreeChatCount(tgId);
          const matchId = await findMatch(tgId, "any", user.gender ?? "other", user.language ?? undefined, ageMatch, userAge);
          if (matchId) {
            const sessionId = await createChatSession(tgId, matchId);
            if (sessionId) {
              ctx.session.sameAgeMatch = false;
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
              // Race condition: the matched user was taken — fall back to queue
              await addToQueue(tgId, "any", user.gender ?? "other");
              await ctx.reply(t(lang).matchFreeAny(left), { reply_markup: cancelKeyboard(lang) });
              setTimeout(() => tryMatchFromQueue(bot, tgId, "any", user.gender ?? "other", lang), 3000);
            }
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
    const coinCost = pref === "any" ? await getMatchCostAny() : await getMatchCostGender();
    const result = await deductCoins(tgId, coinCost, "chat_cost", `Connect to ${pref}`);
    if (!result.success) {
      await ctx.editMessageText(t(lang).insufficientCoins).catch(() => {});
      await ctx.reply(t(lang).insufficientCoins, { reply_markup: mainMenuKeyboard(lang) });
      return;
    }

    await ctx.editMessageText("⏳").catch(() => {});

    const ageMatch = ctx.session.sameAgeMatch ?? false;
    const userAge = user.age ?? undefined;
    const matchId = await findMatch(tgId, pref, user.gender ?? "other", user.language ?? undefined, ageMatch, userAge);
    if (matchId) {
      const sessionId = await createChatSession(tgId, matchId);
      if (sessionId) {
        ctx.session.sameAgeMatch = false;
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
        // Race condition: matched user was taken — put in queue
        await addToQueue(tgId, pref, user.gender ?? "other");
        await bot.api
          .sendMessage(tgId, t(lang).addedToQueue, { reply_markup: cancelKeyboard(lang) })
          .catch(() => {});
        setTimeout(() => tryMatchFromQueue(bot, tgId, pref, user.gender ?? "other", lang), 3000);
      }
    } else {
      await addToQueue(tgId, pref, user.gender ?? "other");
      await bot.api
        .sendMessage(tgId, t(lang).addedToQueue, { reply_markup: cancelKeyboard(lang) })
        .catch(() => {});
      setTimeout(() => tryMatchFromQueue(bot, tgId, pref, user.gender ?? "other", lang), 3000);
    }
  });

  // ─── Back from gender-pref screen or cancel queue ───────────────────────────
  bot.hears([/^🔙 بازگشت/, /^🔙 Back/], async (ctx, next) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return next();
    const lang = (user.language as "fa" | "en") ?? "fa";

    // If in queue: cancel queue first, then return to main menu
    if (user.isInQueue) {
      await removeFromQueue(tgId);
      await ctx.reply(t(lang).removedFromQueue, { reply_markup: mainMenuKeyboard(lang) });
      return;
    }

    // If in chat or group: let other handlers deal with it
    if (user.isInChat || user.isInGroup) return next();

    // Idle: return to main menu
    await ctx.reply("🏠", { reply_markup: mainMenuKeyboard(lang) });
  });

  // ─── Match cancel callback ────────────────────────────────────────────────
  bot.callbackQuery("match:cancel", async (ctx) => {
    await ctx.answerCallbackQuery();
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";
    await ctx.editMessageText("❌").catch(() => {});
    await ctx.reply(t(lang).selectGenderPref, { reply_markup: genderPrefKeyboard(lang, ctx.session.sameAgeMatch ?? false) });
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
      if (partnerId) {
        const result = await reportUser(tgId, partnerId, reason, sessionId);
        // Notify the reported user about the warning
        const reportedUser = await getUserByTelegramId(partnerId);
        const reportedLang = (reportedUser?.language as "fa" | "en") ?? "fa";
        if (result.restricted && result.restrictedUntil) {
          const until = result.restrictedUntil.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
          await bot.api
            .sendMessage(partnerId, t(reportedLang).reportedRestricted(result.recentCount, until))
            .catch(() => {});
        } else {
          await bot.api
            .sendMessage(partnerId, t(reportedLang).reportedWarning(result.recentCount))
            .catch(() => {});
        }
      }
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
function getTimeoutMsg(lang: "fa" | "en", pref: "male" | "female" | "any"): string {
  if (lang !== "fa") return t(lang).queueTimeout;
  if (pref === "female") return t(lang).queueTimeoutFemale;
  if (pref === "male")   return t(lang).queueTimeoutMale;
  return t(lang).queueTimeoutAny;
}

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
    await bot.api.sendMessage(tgId, getTimeoutMsg(lang, pref), { reply_markup: { remove_keyboard: true } }).catch(() => {});
    // Send main menu
    const { mainMenuKeyboard } = await import("../keyboards/main.js");
    await bot.api.sendMessage(tgId, "🏠", { reply_markup: mainMenuKeyboard(lang) }).catch(() => {});
    return;
  }

  const user = await getUserByTelegramId(tgId);
  if (!user?.isInQueue) return; // already matched or cancelled
  if (user.isInChat) {
    // Stale isInQueue flag — clean up
    await removeFromQueue(tgId);
    return;
  }

  const matchId = await findMatch(tgId, pref, gender);
  if (matchId) {
    const sessionId = await createChatSession(tgId, matchId);
    if (!sessionId) {
      // Race condition — retry soon
      setTimeout(() => tryMatchFromQueue(bot, tgId, pref, gender, lang, attempt), 1500);
      return;
    }
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
