/**
 * 🌊 اقیانوس احساس — Magic features handler
 * Navigation: Reply Keyboard (persistent sub-menu) — no inline nav clutter
 * Inline keyboards used ONLY for transient one-time choices (mood, letter delay)
 */

import { Bot, InlineKeyboard } from "grammy";
import type { BotContext } from "../context.js";
import { t } from "../i18n/index.js";
import { mainMenuKeyboard, magicMenuKeyboard, cancelKeyboard, chatControlKeyboard } from "../keyboards/main.js";
import {
  getFeatureConfig,
  consumeFeature,
  sendBottle,
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

  // ────────────────────────────────────────────────────────────────────────────
  // Main magic menu button → switch to sub-keyboard (no inline buttons)
  // ────────────────────────────────────────────────────────────────────────────
  bot.hears([/^🌊 اقیانوس/, /^🌊 Ocean/], async (ctx, next) => {
    if (!ctx.dbUser) return next();
    const lang = (ctx.dbUser.language as "fa" | "en") ?? "fa";
    await ctx.reply(t(lang).magicSubTitle, {
      parse_mode: "Markdown",
      reply_markup: magicMenuKeyboard(lang),
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 🍾 پیام در بطری
  // ────────────────────────────────────────────────────────────────────────────
  bot.hears([/^🍾 پیام در بطری/, /^🍾 Message in a Bottle/], async (ctx, next) => {
    if (!ctx.dbUser) return next();
    const lang   = (ctx.dbUser.language as "fa" | "en") ?? "fa";
    const userId = ctx.from!.id;

    const result = await consumeFeature(userId, "bottle");
    if (!result.ok) {
      const cfg = await getFeatureConfig("bottle");
      await ctx.reply(
        result.reason === "disabled" ? t(lang).magicDisabled
        : result.reason === "limit"  ? t(lang).magicLimitReached(cfg.dailyLimit)
        : t(lang).magicNotEnoughCoins(cfg.cost),
        { reply_markup: magicMenuKeyboard(lang) }
      );
      return;
    }
    ctx.session.magicStep = "bottle_write";
    await ctx.reply(t(lang).bottleAskMessage, {
      parse_mode: "Markdown",
      reply_markup: cancelKeyboard(lang),
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 🔗 زنجیر احساس
  // ────────────────────────────────────────────────────────────────────────────
  bot.hears([/^🔗 زنجیر احساس/, /^🔗 Emotion Chain/], async (ctx, next) => {
    if (!ctx.dbUser) return next();
    const lang   = (ctx.dbUser.language as "fa" | "en") ?? "fa";
    const userId = ctx.from!.id;

    // Check for a waiting chain first
    const waiting = await claimChainForUser(userId);
    if (waiting) {
      const links = await getChainLinks(waiting.id);
      const prevText = links.map((l) => l.message).join(" / ");
      ctx.session.magicStep = "chain_write";
      ctx.session.magicChainId = waiting.id;
      await ctx.reply(t(lang).chainAskNext(waiting.currentStep, prevText), {
        parse_mode: "Markdown",
        reply_markup: cancelKeyboard(lang),
      });
      return;
    }

    const result = await consumeFeature(userId, "chain");
    if (!result.ok) {
      const cfg = await getFeatureConfig("chain");
      await ctx.reply(
        result.reason === "disabled" ? t(lang).magicDisabled
        : result.reason === "limit"  ? t(lang).magicLimitReached(cfg.dailyLimit)
        : t(lang).magicNotEnoughCoins(cfg.cost),
        { reply_markup: magicMenuKeyboard(lang) }
      );
      return;
    }
    ctx.session.magicStep = "chain_write";
    ctx.session.magicChainId = undefined;
    await ctx.reply(t(lang).chainAskFirst, {
      parse_mode: "Markdown",
      reply_markup: cancelKeyboard(lang),
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // ✉️ نامه به آینده
  // ────────────────────────────────────────────────────────────────────────────
  bot.hears([/^✉️ نامه به آینده/, /^✉️ Letter to the Future/], async (ctx, next) => {
    if (!ctx.dbUser) return next();
    const lang   = (ctx.dbUser.language as "fa" | "en") ?? "fa";
    const userId = ctx.from!.id;

    const result = await consumeFeature(userId, "letter");
    if (!result.ok) {
      const cfg = await getFeatureConfig("letter");
      await ctx.reply(
        result.reason === "disabled" ? t(lang).magicDisabled
        : result.reason === "limit"  ? t(lang).magicLimitReached(cfg.dailyLimit)
        : t(lang).magicNotEnoughCoins(cfg.cost),
        { reply_markup: magicMenuKeyboard(lang) }
      );
      return;
    }
    // Delay selection: inline (transient one-time choice, not navigation)
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
      await ctx.editMessageText(t(lang).letterAskContent(days), { parse_mode: "Markdown" });
      await ctx.reply("✏️", { reply_markup: cancelKeyboard(lang) });
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 📡 فرکانس ناشناس
  // ────────────────────────────────────────────────────────────────────────────
  bot.hears([/^📡 فرکانس ناشناس/, /^📡 Anonymous Frequency/], async (ctx, next) => {
    if (!ctx.dbUser) return next();
    const lang   = (ctx.dbUser.language as "fa" | "en") ?? "fa";
    const userId = ctx.from!.id;

    const result = await consumeFeature(userId, "frequency");
    if (!result.ok) {
      const cfg = await getFeatureConfig("frequency");
      await ctx.reply(
        result.reason === "disabled" ? t(lang).magicDisabled
        : result.reason === "limit"  ? t(lang).magicLimitReached(cfg.dailyLimit)
        : t(lang).magicNotEnoughCoins(cfg.cost),
        { reply_markup: magicMenuKeyboard(lang) }
      );
      return;
    }
    // Mood selection: inline (transient one-time choice)
    const kb = new InlineKeyboard();
    for (const [mood, label] of Object.entries(MOOD_LABELS)) {
      kb.text(label, `magic:freq:${mood}`).row();
    }
    await ctx.reply(t(lang).freqAskMood, {
      parse_mode: "Markdown",
      reply_markup: kb,
    });
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
        const [myUser, partnerUser] = await Promise.all([
          getUserByTelegramId(userId),
          getUserByTelegramId(partnerId),
        ]);
        const partnerLang = (partnerUser?.language as "fa" | "en") ?? "fa";
        // Each sees the other person's profile + mood
        await ctx.editMessageText(t(lang).connectedWithMood(partnerUser ?? {}, moodLabel), { parse_mode: "Markdown" });
        await ctx.reply("👇", { reply_markup: chatControlKeyboard(lang) });
        await bot.api
          .sendMessage(partnerId, t(partnerLang).connectedWithMood(myUser ?? {}, moodLabel), { parse_mode: "Markdown" })
          .catch(() => {});
        await bot.api
          .sendMessage(partnerId, "👇", { reply_markup: chatControlKeyboard(partnerLang) })
          .catch(() => {});
      } else {
        // Still searching — show cancel in the inline (not nav, actual cancel action)
        await ctx.editMessageText(t(lang).freqSearching(moodLabel), {
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
    await ctx.reply(t(lang).magicSubTitle, {
      parse_mode: "Markdown",
      reply_markup: magicMenuKeyboard(lang),
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Bottle reply / ignore callbacks (from delivery message)
  // ────────────────────────────────────────────────────────────────────────────
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

    const [myUser, partnerUser] = await Promise.all([
      getUserByTelegramId(userId),
      getUserByTelegramId(partnerId),
    ]);
    const partnerLang = (partnerUser?.language as "fa" | "en") ?? "fa";
    await ctx.editMessageText(t(lang).connectedWith(partnerUser ?? {}), { parse_mode: "Markdown" });
    await ctx.reply("👇", { reply_markup: chatControlKeyboard(lang) });
    await bot.api
      .sendMessage(partnerId, t(partnerLang).connectedWith(myUser ?? {}), { parse_mode: "Markdown" })
      .catch(() => {});
    await bot.api
      .sendMessage(partnerId, "👇", { reply_markup: chatControlKeyboard(partnerLang) })
      .catch(() => {});
  });

  bot.callbackQuery(/^bottle:ignore:(\d+)$/, async (ctx) => {
    const bottleId = parseInt(ctx.match[1]!, 10);
    const lang = (ctx.dbUser?.language as "fa" | "en") ?? "fa";
    await updateBottleStatus(bottleId, "ignored");
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(t(lang).bottleIgnored);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Text input handler — bottle / chain / letter
  // Intercepts BEFORE the global text handler; uses next() if not in magic step
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
        await ctx.reply(t(lang).bottleTooLong, { reply_markup: magicMenuKeyboard(lang) });
        return;
      }
      const bottleId = await sendBottle(userId, text);

      // Deliver to a random active user
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
      await ctx.reply(t(lang).bottleSent, { reply_markup: magicMenuKeyboard(lang) });
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
        await ctx.reply(t(lang).chainSent, {
          parse_mode: "Markdown",
          reply_markup: magicMenuKeyboard(lang),
        });

        // Pass chain to next random user (not already a participant)
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
              reply_markup: new InlineKeyboard()
                .text(`🔗 ${chainStep + 1}/10 — ادامه زنجیر`, "magic:chain:continue"),
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
      await ctx.reply(t(lang).letterSaved(days), {
        parse_mode: "Markdown",
        reply_markup: magicMenuKeyboard(lang),
      });
      return;
    }

    return next();
  });

  // Chain continue button (sent to next participant via delivery message)
  bot.callbackQuery("magic:chain:continue", async (ctx) => {
    const lang = (ctx.dbUser?.language as "fa" | "en") ?? "fa";
    await ctx.answerCallbackQuery();
    // Just redirect — the hears handler will pick up the actual chain claim
    await ctx.reply(t(lang).magicSubTitle, {
      parse_mode: "Markdown",
      reply_markup: magicMenuKeyboard(lang),
    });
  });
}
