/**
 * 🌊 اقیانوس احساس — Magic features handler
 * Features: پیام در بطری | زنجیر احساس | نامه به آینده | فرکانس ناشناس
 */

import { Bot, InlineKeyboard } from "grammy";
import type { BotContext } from "../context.js";
import { t } from "../i18n/index.js";
import {
  getFeatureConfig,
  consumeFeature,
  sendBottle,
  findBottleForUser,
  deliverBottle,
  updateBottleStatus,
  joinOrCreateChain,
  claimChainForUser,
  getChainLinks,
  createFutureLetter,
  joinFrequency,
  leaveFrequencyQueue,
  MOOD_LABELS,
  type Mood,
} from "../services/magic.service.js";
import { createChatSession } from "../services/matching.service.js";
import { getUserByTelegramId } from "../services/user.service.js";
import { db, bottleMessagesTable, chainsTable, chainLinksTable, usersTable } from "@workspace/db";
import { eq, ne, and, notInArray } from "drizzle-orm";

export function registerMagicHandlers(bot: Bot<BotContext>): void {

  // ── Main magic menu ─────────────────────────────────────────────────────────
  bot.hears(/^🌊/, async (ctx, next) => {
    if (!ctx.dbUser) return next();
    const lang = (ctx.dbUser.language as "fa" | "en") ?? "fa";
    const [bCfg, cCfg, lCfg, fCfg] = await Promise.all([
      getFeatureConfig("bottle"),
      getFeatureConfig("chain"),
      getFeatureConfig("letter"),
      getFeatureConfig("frequency"),
    ]);
    await ctx.reply(
      t(lang).magicMenu({ bottleCost: bCfg.cost, chainCost: cCfg.cost, letterCost: lCfg.cost, freqCost: fCfg.cost }),
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard()
          .text("🍾 پیام در بطری",   "magic:bottle").row()
          .text("🔗 زنجیر احساس",   "magic:chain").row()
          .text("✉️ نامه به آینده",  "magic:letter").row()
          .text("📡 فرکانس ناشناس", "magic:frequency").row()
          .text("📖 راهنما",         "magic:help"),
      }
    );
  });

  // ── Help menu ───────────────────────────────────────────────────────────────
  bot.callbackQuery("magic:help", async (ctx) => {
    const lang = (ctx.dbUser?.language as "fa" | "en") ?? "fa";
    await ctx.editMessageText(t(lang).magicHelpMenu, {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text("🍾 پیام در بطری",   "magic:help:bottle").row()
        .text("🔗 زنجیر احساس",   "magic:help:chain").row()
        .text("✉️ نامه به آینده",  "magic:help:letter").row()
        .text("📡 فرکانس ناشناس", "magic:help:frequency"),
    });
    await ctx.answerCallbackQuery();
  });

  const helpItems = [
    ["bottle",    "magicHelpBottle"],
    ["chain",     "magicHelpChain"],
    ["letter",    "magicHelpLetter"],
    ["frequency", "magicHelpFreq"],
  ] as const;

  for (const [key, textKey] of helpItems) {
    bot.callbackQuery(`magic:help:${key}`, async (ctx) => {
      const lang = (ctx.dbUser?.language as "fa" | "en") ?? "fa";
      await ctx.answerCallbackQuery();
      await ctx.reply((t(lang) as Record<string, any>)[textKey] as string, {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("🔙 بازگشت", "magic:help"),
      });
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 🍾 پیام در بطری
  // ────────────────────────────────────────────────────────────────────────────

  bot.callbackQuery("magic:bottle", async (ctx) => {
    const lang = (ctx.dbUser?.language as "fa" | "en") ?? "fa";
    const result = await consumeFeature(ctx.from.id, "bottle");
    await ctx.answerCallbackQuery();
    if (!result.ok) {
      const cfg = await getFeatureConfig("bottle");
      await ctx.reply(
        result.reason === "disabled" ? t(lang).magicDisabled
        : result.reason === "limit"  ? t(lang).magicLimitReached(cfg.dailyLimit)
        : t(lang).magicNotEnoughCoins(cfg.cost)
      );
      return;
    }
    ctx.session.magicStep = "bottle_write";
    await ctx.reply(t(lang).bottleAskMessage, { parse_mode: "Markdown" });
  });

  bot.callbackQuery(/^bottle:reply:(\d+)$/, async (ctx) => {
    const bottleId = parseInt(ctx.match[1]!, 10);
    const lang = (ctx.dbUser?.language as "fa" | "en") ?? "fa";
    await ctx.answerCallbackQuery();

    const [bottle] = await db
      .select()
      .from(bottleMessagesTable)
      .where(eq(bottleMessagesTable.id, bottleId));

    if (!bottle || bottle.status !== "delivered") {
      await ctx.editMessageText("❌ این پیام دیگر قابل پاسخ نیست.");
      return;
    }

    const userId    = ctx.from.id;
    const partnerId = bottle.senderId;
    await createChatSession(userId, partnerId);
    await updateBottleStatus(bottleId, "replied");

    const partnerUser = await getUserByTelegramId(partnerId);
    const partnerLang = (partnerUser?.language as "fa" | "en") ?? "fa";
    await ctx.editMessageText(t(lang).bottleReplied);
    await bot.api.sendMessage(partnerId, t(partnerLang).bottleReplied).catch(() => {});
  });

  bot.callbackQuery(/^bottle:ignore:(\d+)$/, async (ctx) => {
    const bottleId = parseInt(ctx.match[1]!, 10);
    const lang = (ctx.dbUser?.language as "fa" | "en") ?? "fa";
    await updateBottleStatus(bottleId, "ignored");
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(t(lang).bottleIgnored);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 🔗 زنجیر احساس
  // ────────────────────────────────────────────────────────────────────────────

  bot.callbackQuery("magic:chain", async (ctx) => {
    const lang   = (ctx.dbUser?.language as "fa" | "en") ?? "fa";
    const userId = ctx.from.id;
    await ctx.answerCallbackQuery();

    const waiting = await claimChainForUser(userId);
    if (waiting) {
      const links = await getChainLinks(waiting.id);
      const prevText = links.map((l) => l.message).join(" / ");
      ctx.session.magicStep = "chain_write";
      ctx.session.magicChainId = waiting.id;
      await ctx.reply(t(lang).chainAskNext(waiting.currentStep, prevText), { parse_mode: "Markdown" });
      return;
    }

    const result = await consumeFeature(userId, "chain");
    if (!result.ok) {
      const cfg = await getFeatureConfig("chain");
      await ctx.reply(
        result.reason === "disabled" ? t(lang).magicDisabled
        : result.reason === "limit"  ? t(lang).magicLimitReached(cfg.dailyLimit)
        : t(lang).magicNotEnoughCoins(cfg.cost)
      );
      return;
    }
    ctx.session.magicStep = "chain_write";
    ctx.session.magicChainId = undefined;
    await ctx.reply(t(lang).chainAskFirst, { parse_mode: "Markdown" });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // ✉️ نامه به آینده
  // ────────────────────────────────────────────────────────────────────────────

  bot.callbackQuery("magic:letter", async (ctx) => {
    const lang   = (ctx.dbUser?.language as "fa" | "en") ?? "fa";
    const result = await consumeFeature(ctx.from.id, "letter");
    await ctx.answerCallbackQuery();
    if (!result.ok) {
      const cfg = await getFeatureConfig("letter");
      await ctx.reply(
        result.reason === "disabled" ? t(lang).magicDisabled
        : result.reason === "limit"  ? t(lang).magicLimitReached(cfg.dailyLimit)
        : t(lang).magicNotEnoughCoins(cfg.cost)
      );
      return;
    }
    await ctx.reply(t(lang).letterAskDelay, {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text(t(lang).letterDelay7,  "magic:letter:7").row()
        .text(t(lang).letterDelay30, "magic:letter:30").row()
        .text(t(lang).letterDelay60, "magic:letter:60").row()
        .text(t(lang).letterDelay90, "magic:letter:90"),
    });
  });

  for (const days of [7, 30, 60, 90]) {
    bot.callbackQuery(`magic:letter:${days}`, async (ctx) => {
      const lang = (ctx.dbUser?.language as "fa" | "en") ?? "fa";
      ctx.session.magicStep = `letter_write:${days}`;
      await ctx.answerCallbackQuery();
      await ctx.reply(t(lang).letterAskContent(days), { parse_mode: "Markdown" });
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 📡 فرکانس ناشناس
  // ────────────────────────────────────────────────────────────────────────────

  bot.callbackQuery("magic:frequency", async (ctx) => {
    const lang   = (ctx.dbUser?.language as "fa" | "en") ?? "fa";
    const result = await consumeFeature(ctx.from.id, "frequency");
    await ctx.answerCallbackQuery();
    if (!result.ok) {
      const cfg = await getFeatureConfig("frequency");
      await ctx.reply(
        result.reason === "disabled" ? t(lang).magicDisabled
        : result.reason === "limit"  ? t(lang).magicLimitReached(cfg.dailyLimit)
        : t(lang).magicNotEnoughCoins(cfg.cost)
      );
      return;
    }
    const kb = new InlineKeyboard();
    for (const [mood, label] of Object.entries(MOOD_LABELS)) {
      kb.text(label, `magic:freq:${mood}`).row();
    }
    await ctx.reply(t(lang).freqAskMood, { parse_mode: "Markdown", reply_markup: kb });
  });

  for (const mood of Object.keys(MOOD_LABELS) as Mood[]) {
    bot.callbackQuery(`magic:freq:${mood}`, async (ctx) => {
      const lang      = (ctx.dbUser?.language as "fa" | "en") ?? "fa";
      const userId    = ctx.from.id;
      const moodLabel = MOOD_LABELS[mood];
      await ctx.answerCallbackQuery();

      const partnerId = await joinFrequency(userId, mood);
      if (partnerId) {
        await createChatSession(userId, partnerId);
        const partnerUser = await getUserByTelegramId(partnerId);
        const partnerLang = (partnerUser?.language as "fa" | "en") ?? "fa";
        await ctx.reply(t(lang).freqConnected(moodLabel), { parse_mode: "Markdown" });
        await bot.api
          .sendMessage(partnerId, t(partnerLang).freqConnected(moodLabel), { parse_mode: "Markdown" })
          .catch(() => {});
      } else {
        await ctx.reply(t(lang).freqSearching(moodLabel), {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard().text(t(lang).freqCancelBtn, "magic:freq:cancel"),
        });
      }
    });
  }

  bot.callbackQuery("magic:freq:cancel", async (ctx) => {
    const lang = (ctx.dbUser?.language as "fa" | "en") ?? "fa";
    await leaveFrequencyQueue(ctx.from.id);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(t(lang).freqCancelled);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Text input handler (bottle / chain / letter)
  // ────────────────────────────────────────────────────────────────────────────
  bot.on("message:text", async (ctx, next) => {
    const step = ctx.session.magicStep;
    if (!step) return next();

    const lang   = (ctx.dbUser?.language as "fa" | "en") ?? "fa";
    const userId = ctx.from!.id;
    const text   = ctx.message.text.trim();

    // ── Bottle ────────────────────────────────────────────────────────────────
    if (step === "bottle_write") {
      ctx.session.magicStep = undefined;
      if (text.length > 500) {
        await ctx.reply(t(lang).bottleTooLong);
        return;
      }
      const bottleId = await sendBottle(userId, text);

      // Try to deliver to a random active user immediately
      const candidates = await db
        .select({ telegramId: usersTable.telegramId, language: usersTable.language })
        .from(usersTable)
        .where(and(ne(usersTable.telegramId, userId), eq(usersTable.status, "active")))
        .limit(20);

      if (candidates.length > 0) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)]!;
        await deliverBottle(bottleId, pick.telegramId);
        const recipientLang = (pick.language as "fa" | "en") ?? "fa";
        await bot.api
          .sendMessage(pick.telegramId, t(recipientLang).bottleReceived(text), {
            parse_mode: "Markdown",
            reply_markup: new InlineKeyboard()
              .text(t(recipientLang).bottleReplyBtn,  `bottle:reply:${bottleId}`)
              .text(t(recipientLang).bottleIgnoreBtn, `bottle:ignore:${bottleId}`),
          })
          .catch(() => {});
      }
      await ctx.reply(t(lang).bottleSent);
      return;
    }

    // ── Chain ─────────────────────────────────────────────────────────────────
    if (step === "chain_write") {
      ctx.session.magicStep = undefined;

      const { chainId, step: chainStep, isComplete, participantIds } =
        await joinOrCreateChain(userId, text, 10);

      if (isComplete) {
        const links = await getChainLinks(chainId);
        const fullText = links.map((l, i) => `${i + 1}. ${l.message}`).join("\n");
        for (const pid of participantIds) {
          const pu = await getUserByTelegramId(pid);
          const pl = (pu?.language as "fa" | "en") ?? "fa";
          await bot.api
            .sendMessage(pid, t(pl).chainComplete(fullText), { parse_mode: "Markdown" })
            .catch(() => {});
        }
      } else {
        await ctx.reply(t(lang).chainSent, { parse_mode: "Markdown" });

        // Pass chain to the next random user (not already a participant)
        const participants = (
          await db
            .select({ userId: chainLinksTable.userId })
            .from(chainLinksTable)
            .where(eq(chainLinksTable.chainId, chainId))
        ).map((r) => r.userId);

        const candidateQuery = participants.length > 0
          ? db.select({ telegramId: usersTable.telegramId, language: usersTable.language })
              .from(usersTable)
              .where(and(eq(usersTable.status, "active"), notInArray(usersTable.telegramId, participants)))
              .limit(20)
          : db.select({ telegramId: usersTable.telegramId, language: usersTable.language })
              .from(usersTable)
              .where(and(eq(usersTable.status, "active"), ne(usersTable.telegramId, userId)))
              .limit(20);

        const candidates = await candidateQuery;
        if (candidates.length > 0) {
          const pick = candidates[Math.floor(Math.random() * candidates.length)]!;
          await db
            .update(chainsTable)
            .set({ currentHolder: pick.telegramId })
            .where(eq(chainsTable.id, chainId));

          const links = await getChainLinks(chainId);
          const prevText = links.map((l) => l.message).join(" / ");
          const pl = (pick.language as "fa" | "en") ?? "fa";
          await bot.api
            .sendMessage(pick.telegramId, t(pl).chainAskNext(chainStep + 1, prevText), {
              parse_mode: "Markdown",
              reply_markup: new InlineKeyboard().text("🔗 ادامه زنجیر", "magic:chain"),
            })
            .catch(() => {});
        }
      }
      return;
    }

    // ── Letter ────────────────────────────────────────────────────────────────
    if (step.startsWith("letter_write:")) {
      ctx.session.magicStep = undefined;
      const days      = parseInt(step.split(":")[1]!, 10);
      const deliverAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      await createFutureLetter(userId, text, deliverAt);
      await ctx.reply(t(lang).letterSaved(days), { parse_mode: "Markdown" });
      return;
    }

    return next();
  });
}
