import { Bot, InlineKeyboard, Keyboard } from "grammy";
import type { BotContext } from "../context.js";
import {
  getUserByTelegramId,
  getUserByAnonToken,
  refreshAnonToken,
  setAnonLinkEnabled,
  setAnonLinkPaid,
} from "../services/user.service.js";
import { deductCoins } from "../services/coin.service.js";
import { getSetting } from "../services/payment.service.js";
import { db } from "@workspace/db";
import { anonymousMessagesTable, timedAnonLinksTable } from "@workspace/db";
import { eq, desc, count as countFn, and } from "drizzle-orm";
import { reportUser, blockUser } from "../services/safety.service.js";
import { t } from "../i18n/index.js";
import { mainMenuKeyboard, myLinkMenuKeyboard, timedLinkKeyboard } from "../keyboards/main.js";
import { anonMsgActionsKeyboard } from "../keyboards/inline.js";
import { randomBytes } from "crypto";

const PAGE_SIZE = 10;

const DURATION_MAP: Record<string, number> = {
  "⏱️ ۱ ساعت": 1,
  "⏱️ ۶ ساعت": 6,
  "⏱️ ۲۴ ساعت": 24,
  "📅 ۷ روز": 168,
  "⏱️ 1 Hour": 1,
  "⏱️ 6 Hours": 6,
  "⏱️ 24 Hours": 24,
  "📅 7 Days": 168,
};

const DEFAULT_PERM_LINK_COST = 10;
const DEFAULT_TIMED_LINK_COST = 3;

function formatExpiry(date: Date, lang: "fa" | "en"): string {
  return date.toLocaleString(lang === "fa" ? "fa-IR" : "en-GB");
}

function formatDate(date: Date, lang: "fa" | "en"): string {
  return date.toLocaleString(lang === "fa" ? "fa-IR" : "en-GB");
}

async function getPermLinkCost(): Promise<number> {
  const v = await getSetting("perm_anon_link_cost");
  return v ? parseInt(v, 10) : DEFAULT_PERM_LINK_COST;
}

async function getTimedLinkCost(): Promise<number> {
  const v = await getSetting("timed_anon_link_cost");
  return v ? parseInt(v, 10) : DEFAULT_TIMED_LINK_COST;
}

async function getUnreadCount(tgId: number): Promise<number> {
  const [row] = await db
    .select({ cnt: countFn() })
    .from(anonymousMessagesTable)
    .where(and(
      eq(anonymousMessagesTable.receiverId, tgId),
      eq(anonymousMessagesTable.isRead, false),
    ));
  return Number(row?.cnt ?? 0);
}

function permLinkKeyboard(enabled: boolean, lang: "fa" | "en") {
  return new InlineKeyboard().text(
    enabled ? t(lang).anonLinkToggleOffBtn : t(lang).anonLinkToggleOnBtn,
    `anon_toggle:${enabled ? "off" : "on"}`
  );
}

function permLinkBuyKeyboard(lang: "fa" | "en") {
  const [confirm, cancel] =
    lang === "fa"
      ? ["✅ تأیید و پرداخت", "❌ انصراف"]
      : ["✅ Confirm & Pay", "❌ Cancel"];
  return new InlineKeyboard()
    .text(confirm, "anon_perm_buy")
    .text(cancel, "anon_perm_cancel");
}

function timedLinkBuyKeyboard(lang: "fa" | "en", hours: number, token: string) {
  const [confirm, cancel] =
    lang === "fa"
      ? ["✅ تأیید و پرداخت", "❌ انصراف"]
      : ["✅ Confirm & Pay", "❌ Cancel"];
  return new InlineKeyboard()
    .text(confirm, `anon_timed_buy:${hours}:${token}`)
    .text(cancel, "anon_timed_cancel");
}

export function cancelAnonKeyboard(receiverName: string, lang: "fa" | "en") {
  const btnText = t(lang).anonCancelSendBtn(receiverName);
  return new Keyboard().text(btnText).resized().persistent();
}

export function registerAnonLinkHandlers(bot: Bot<BotContext>) {
  const BOT_USERNAME = process.env["BOT_USERNAME"] ?? "bot";

  // ─── My Anonymous Link sub-menu ─────────────────────────────────────────────
  bot.hears([/^🔗 لینک ناشناس من/, /^🔗 My Anonymous Link/], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? (await getUserByTelegramId(tgId));
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";
    const unread = await getUnreadCount(tgId);

    await ctx.reply(t(lang).myLinkMenuTitle(unread), {
      parse_mode: "HTML",
      reply_markup: myLinkMenuKeyboard(lang),
    });
  });

  // ─── Cancel anon send (persistent keyboard button) ──────────────────────────
  bot.hears(
    [/^❌ انصراف از پیام دادن به/, /^❌ Cancel sending to/],
    async (ctx) => {
      const tgId = ctx.from!.id;
      const user = ctx.dbUser ?? (await getUserByTelegramId(tgId));
      const lang = (user?.language as "fa" | "en") ?? "fa";
      ctx.session.step = undefined;
      await ctx.reply(t(lang).anonCancelledSend, {
        reply_markup: mainMenuKeyboard(lang),
      });
    }
  );

  // ─── Permanent anonymous link ────────────────────────────────────────────────
  bot.hears(
    ["🔗 لینک ثابت ناشناس من", "🔗 My Permanent Anonymous Link"],
    async (ctx) => {
      const tgId = ctx.from!.id;
      const user = ctx.dbUser ?? (await getUserByTelegramId(tgId));
      if (!user) return;
      const lang = (user.language as "fa" | "en") ?? "fa";

      if (user.anonLinkPaid) {
        const token = await refreshAnonToken(tgId);
        const link = `https://t.me/${BOT_USERNAME}?start=a_${token}`;
        await ctx.reply(t(lang).anonLinkActive(link), {
          parse_mode: "HTML",
          reply_markup: permLinkKeyboard(user.anonLinkEnabled, lang),
        });
        return;
      }

      const cost = await getPermLinkCost();
      if (user.coins < cost) {
        const msg =
          lang === "fa"
            ? `❌ سکه کافی ندارید!\n\n💰 موجودی: ${user.coins} سکه | هزینه: ${cost} سکه`
            : `❌ Not enough coins!\n\n💰 Balance: ${user.coins} | Cost: ${cost}`;
        await ctx.reply(msg, { reply_markup: myLinkMenuKeyboard(lang) });
        return;
      }

      await ctx.reply(t(lang).anonLinkBuyConfirm(cost), {
        parse_mode: "HTML",
        reply_markup: permLinkBuyKeyboard(lang),
      });
    }
  );

  // ─── Confirm buy permanent link ──────────────────────────────────────────────
  bot.callbackQuery("anon_perm_buy", async (ctx) => {
    await ctx.answerCallbackQuery();
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? (await getUserByTelegramId(tgId));
    const lang = (user?.language as "fa" | "en") ?? "fa";

    const cost = await getPermLinkCost();
    const result = await deductCoins(
      tgId, cost, "magic_spend",
      lang === "fa" ? "ساخت لینک ناشناس ثابت" : "Permanent anonymous link"
    );
    if (!result.success) {
      await ctx.editMessageText(lang === "fa" ? "❌ سکه کافی ندارید!" : "❌ Not enough coins!");
      return;
    }

    await setAnonLinkPaid(tgId);
    const token = await refreshAnonToken(tgId);
    const link = `https://t.me/${BOT_USERNAME}?start=a_${token}`;
    await ctx.editMessageText(t(lang).anonLinkActive(link), {
      parse_mode: "HTML",
      reply_markup: permLinkKeyboard(true, lang),
    });
  });

  // ─── Cancel buy permanent link ───────────────────────────────────────────────
  bot.callbackQuery("anon_perm_cancel", async (ctx) => {
    await ctx.answerCallbackQuery();
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? (await getUserByTelegramId(tgId));
    const lang = (user?.language as "fa" | "en") ?? "fa";
    await ctx.editMessageText(lang === "fa" ? "❌ لغو شد." : "❌ Cancelled.");
  });

  // ─── Toggle permanent link on/off ────────────────────────────────────────────
  bot.callbackQuery(/^anon_toggle:(on|off)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? (await getUserByTelegramId(tgId));
    const lang = (user?.language as "fa" | "en") ?? "fa";
    const enable = ctx.match![1] === "on";

    await setAnonLinkEnabled(tgId, enable);
    const token = await refreshAnonToken(tgId);
    const link = `https://t.me/${BOT_USERNAME}?start=a_${token}`;
    const statusMsg = enable ? t(lang).anonLinkNowEnabled : t(lang).anonLinkNowDisabled;

    await ctx.editMessageText(`${statusMsg}\n\n${t(lang).anonLinkActive(link)}`, {
      parse_mode: "HTML",
      reply_markup: permLinkKeyboard(enable, lang),
    });
  });

  // ─── Timed link: show duration keyboard with cost ────────────────────────────
  bot.hears(
    ["⏱️ ساخت لینک مدت‌دار", "⏱️ Create Timed Link"],
    async (ctx) => {
      const tgId = ctx.from!.id;
      const user = ctx.dbUser ?? (await getUserByTelegramId(tgId));
      if (!user) return;
      const lang = (user.language as "fa" | "en") ?? "fa";

      const cost = await getTimedLinkCost();
      await ctx.reply(t(lang).timedLinkBuyTitle(cost), {
        parse_mode: "HTML",
        reply_markup: timedLinkKeyboard(lang),
      });
    }
  );

  // ─── Timed link: duration selected → show confirmation ───────────────────────
  bot.hears(
    ["⏱️ ۱ ساعت","⏱️ ۶ ساعت","⏱️ ۲۴ ساعت","📅 ۷ روز",
     "⏱️ 1 Hour","⏱️ 6 Hours","⏱️ 24 Hours","📅 7 Days"],
    async (ctx) => {
      const tgId = ctx.from!.id;
      const user = ctx.dbUser ?? (await getUserByTelegramId(tgId));
      if (!user) return;
      const lang = (user.language as "fa" | "en") ?? "fa";

      const text = ctx.message?.text ?? "";
      const hours = DURATION_MAP[text];
      if (!hours) return;

      const cost = await getTimedLinkCost();
      if (user.coins < cost) {
        const msg =
          lang === "fa"
            ? `❌ سکه کافی ندارید!\n\n💰 موجودی: ${user.coins} سکه | هزینه: ${cost} سکه`
            : `❌ Not enough coins!\n\n💰 Balance: ${user.coins} | Cost: ${cost}`;
        await ctx.reply(msg, { reply_markup: myLinkMenuKeyboard(lang) });
        return;
      }

      const pendingToken = randomBytes(12).toString("hex");
      const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
      const expiryStr = formatExpiry(expiresAt, lang);

      const confirmMsg =
        lang === "fa"
          ? `⏱️ <b>تأیید ساخت لینک مدت‌دار</b>\n\n⌛ مدت: ${text}\n📅 انقضا: ${expiryStr}\n💰 هزینه: <b>${cost} سکه</b>\n\nتأیید می‌کنید؟`
          : `⏱️ <b>Confirm Timed Link</b>\n\n⌛ Duration: ${text}\n📅 Expires: ${expiryStr}\n💰 Cost: <b>${cost} coins</b>\n\nConfirm?`;

      ctx.session.step = `timed_link_confirm:${hours}:${pendingToken}`;

      await ctx.reply(confirmMsg, {
        parse_mode: "HTML",
        reply_markup: timedLinkBuyKeyboard(lang, hours, pendingToken),
      });
    }
  );

  // ─── Confirm buy timed link ──────────────────────────────────────────────────
  bot.callbackQuery(/^anon_timed_buy:(\d+):([a-f0-9]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? (await getUserByTelegramId(tgId));
    const lang = (user?.language as "fa" | "en") ?? "fa";

    const hours = parseInt(ctx.match![1], 10);
    const token = ctx.match![2];

    const cost = await getTimedLinkCost();
    const result = await deductCoins(
      tgId, cost, "magic_spend",
      lang === "fa" ? "ساخت لینک ناشناس مدت‌دار" : "Timed anonymous link"
    );
    if (!result.success) {
      await ctx.editMessageText(lang === "fa" ? "❌ سکه کافی ندارید!" : "❌ Not enough coins!");
      return;
    }

    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
    await db.insert(timedAnonLinksTable).values({ userId: tgId, token, coinsCost: cost, expiresAt });
    ctx.session.step = undefined;

    const link = `https://t.me/${BOT_USERNAME}?start=t_${token}`;
    const expiryStr = formatExpiry(expiresAt, lang);
    const successMsg =
      lang === "fa"
        ? `✅ <b>لینک مدت‌دار ساخته شد!</b>\n\n🔗 لینک:\n<code>${link}</code>\n\n📅 انقضا: ${expiryStr}\n\nاین لینک را به اشتراک بگذارید.`
        : `✅ <b>Timed link created!</b>\n\n🔗 Link:\n<code>${link}</code>\n\n📅 Expires: ${expiryStr}\n\nShare this link with others.`;

    await ctx.editMessageText(successMsg, { parse_mode: "HTML" });
  });

  // ─── Cancel buy timed link ───────────────────────────────────────────────────
  bot.callbackQuery("anon_timed_cancel", async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = undefined;
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? (await getUserByTelegramId(tgId));
    const lang = (user?.language as "fa" | "en") ?? "fa";
    await ctx.editMessageText(lang === "fa" ? "❌ لغو شد." : "❌ Cancelled.");
  });

  // ─── Inbox: show paginated received messages ──────────────────────────────────
  bot.hears(
    ["📬 صندوق پیام ناشناس من", "📬 My Anonymous Inbox"],
    async (ctx) => {
      await showInboxPage(ctx, bot, 0);
    }
  );

  bot.callbackQuery(/^anon_inbox:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await showInboxPage(ctx, bot, parseInt(ctx.match![1], 10));
  });

  // ─── Receive anonymous message (step: anon_send:{receiverId}) ────────────────
  // NOTE: session.step is NOT cleared after send — user stays in send mode
  // until they explicitly press the cancel button.
  bot.on("message", async (ctx, next) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? (await getUserByTelegramId(tgId));
    if (!user) return next();

    const step = ctx.session.step;
    if (!step?.startsWith("anon_send:")) return next();

    const lang = (user.language as "fa" | "en") ?? "fa";
    const receiverId = parseInt(step.replace("anon_send:", ""), 10);

    // Determine content type
    let content: string | undefined;
    let fileId: string | undefined;
    let fileType: string | undefined;

    if (ctx.message.text) {
      content = ctx.message.text;
    } else if (ctx.message.photo) {
      fileId = ctx.message.photo.at(-1)!.file_id;
      fileType = "photo";
    } else if (ctx.message.video) {
      fileId = ctx.message.video.file_id;
      fileType = "video";
    } else if (ctx.message.voice) {
      fileId = ctx.message.voice.file_id;
      fileType = "voice";
    } else if (ctx.message.sticker) {
      fileId = ctx.message.sticker.file_id;
      fileType = "sticker";
    }

    const [msg] = await db
      .insert(anonymousMessagesTable)
      .values({
        receiverId,
        senderId: tgId,
        content: content ?? null,
        fileId: fileId ?? null,
        fileType: fileType ?? null,
        status: "pending",
        isRead: false,
        createdAt: new Date(),
      })
      .returning();

    // Keep session active — user stays in anon-send mode for multiple messages
    // Show confirmation with cancel keyboard still visible
    const receiverName = await getUserByTelegramId(receiverId)
      .then(r => r?.firstName ?? (lang === "fa" ? "کاربر" : "User"));

    await ctx.reply(t(lang).anonMsgSentKeep, {
      reply_markup: cancelAnonKeyboard(receiverName, lang),
    });

    // Deliver to receiver — works regardless of receiver's bot state
    const receiver = await getUserByTelegramId(receiverId);
    const rLang = (receiver?.language as "fa" | "en") ?? "fa";
    const notifyText = t(rLang).anonMsgReceived;

    if (content) {
      await bot.api
        .sendMessage(receiverId, `${notifyText}\n\n${content}`, {
          reply_markup: anonMsgActionsKeyboard(msg.id, rLang),
        })
        .catch(() => null);
    } else if (fileId && fileType === "photo") {
      await bot.api
        .sendPhoto(receiverId, fileId, {
          caption: notifyText,
          reply_markup: anonMsgActionsKeyboard(msg.id, rLang),
        })
        .catch(() => null);
    } else if (fileId && fileType === "video") {
      await bot.api
        .sendVideo(receiverId, fileId, {
          caption: notifyText,
          reply_markup: anonMsgActionsKeyboard(msg.id, rLang),
        })
        .catch(() => null);
    } else if (fileId && fileType === "voice") {
      await bot.api
        .sendVoice(receiverId, fileId, {
          reply_markup: anonMsgActionsKeyboard(msg.id, rLang),
        })
        .catch(() => null);
    } else if (fileId && fileType === "sticker") {
      await bot.api.sendSticker(receiverId, fileId).catch(() => null);
      await bot.api
        .sendMessage(receiverId, notifyText, {
          reply_markup: anonMsgActionsKeyboard(msg.id, rLang),
        })
        .catch(() => null);
    }
  });

  // ─── Reply to anonymous message ──────────────────────────────────────────────
  bot.callbackQuery(/^anon_reply:(\d+)$/, async (ctx) => {
    const tgId = ctx.from!.id;
    const msgId = parseInt(ctx.match![1], 10);
    const user = ctx.dbUser ?? (await getUserByTelegramId(tgId));
    const lang = (user?.language as "fa" | "en") ?? "fa";

    ctx.session.step = `anon_reply:${msgId}`;
    await ctx.editMessageReplyMarkup().catch(() => null);
    await ctx.reply(t(lang).replyPrompt);
    await ctx.answerCallbackQuery();
  });

  // ─── Block anon sender ───────────────────────────────────────────────────────
  bot.callbackQuery(/^anon_block:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const tgId = ctx.from!.id;
    const msgId = parseInt(ctx.match![1], 10);
    const user = ctx.dbUser ?? (await getUserByTelegramId(tgId));
    const lang = (user?.language as "fa" | "en") ?? "fa";

    const [msg] = await db
      .select()
      .from(anonymousMessagesTable)
      .where(eq(anonymousMessagesTable.id, msgId))
      .limit(1);

    if (msg?.senderId) {
      await blockUser(tgId, msg.senderId, "anon_message");
    }
    await db
      .update(anonymousMessagesTable)
      .set({ status: "blocked" })
      .where(eq(anonymousMessagesTable.id, msgId));

    await ctx.editMessageReplyMarkup().catch(() => null);
    await ctx.reply(t(lang).userBlocked);
  });

  // ─── Report anon sender ──────────────────────────────────────────────────────
  bot.callbackQuery(/^anon_report:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const tgId = ctx.from!.id;
    const msgId = parseInt(ctx.match![1], 10);
    const user = ctx.dbUser ?? (await getUserByTelegramId(tgId));
    const lang = (user?.language as "fa" | "en") ?? "fa";

    const [msg] = await db
      .select()
      .from(anonymousMessagesTable)
      .where(eq(anonymousMessagesTable.id, msgId))
      .limit(1);

    if (msg?.senderId) {
      await reportUser(tgId, msg.senderId, "Anonymous message report");
    }
    await db
      .update(anonymousMessagesTable)
      .set({ status: "blocked" })
      .where(eq(anonymousMessagesTable.id, msgId));

    await ctx.editMessageReplyMarkup().catch(() => null);
    await ctx.reply(t(lang).reportSent);
  });

  // ─── Handle anon reply text ──────────────────────────────────────────────────
  bot.on("message:text", async (ctx, next) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? (await getUserByTelegramId(tgId));
    const step = ctx.session.step;

    if (!step?.startsWith("anon_reply:")) return next();
    const lang = (user?.language as "fa" | "en") ?? "fa";

    const msgId = parseInt(step.replace("anon_reply:", ""), 10);
    const [original] = await db
      .select()
      .from(anonymousMessagesTable)
      .where(eq(anonymousMessagesTable.id, msgId))
      .limit(1);

    if (!original) {
      ctx.session.step = undefined;
      return;
    }

    await db
      .update(anonymousMessagesTable)
      .set({ replyContent: ctx.message.text, repliedAt: new Date(), status: "replied" })
      .where(eq(anonymousMessagesTable.id, msgId));

    ctx.session.step = undefined;
    await ctx.reply(t(lang).replySent, { reply_markup: mainMenuKeyboard(lang) });

    // Notify the original sender with proper format and replier's name
    if (original.senderId) {
      const replierName = user?.firstName ?? (lang === "fa" ? "کاربر" : "User");
      const sender = await getUserByTelegramId(original.senderId);
      const sLang = (sender?.language as "fa" | "en") ?? "fa";
      const replyNotify = t(sLang).yourReplyFromName(replierName) + ctx.message.text;

      await bot.api
        .sendMessage(original.senderId, replyNotify)
        .catch(() => {});
    }
  });
}

// ─── Inbox helper — shared between hears and callbackQuery ────────────────────
async function showInboxPage(
  ctx: import("grammy").Context & { from?: import("grammy/types").User; session?: { step?: string } },
  bot: Bot<BotContext>,
  page: number
) {
  const tgId = ctx.from!.id;
  const user = await getUserByTelegramId(tgId);
  const lang = (user?.language as "fa" | "en") ?? "fa";

  // Only show unread messages
  const unreadFilter = and(
    eq(anonymousMessagesTable.receiverId, tgId),
    eq(anonymousMessagesTable.isRead, false),
  );

  const [unreadRow] = await db
    .select({ cnt: countFn() })
    .from(anonymousMessagesTable)
    .where(unreadFilter);
  const unread = Number(unreadRow?.cnt ?? 0);

  if (unread === 0) {
    await ctx.reply(t(lang).anonInboxEmpty, { reply_markup: myLinkMenuKeyboard(lang) });
    return;
  }

  const totalPages = Math.ceil(unread / PAGE_SIZE);
  const offset = page * PAGE_SIZE;

  // Fetch page — unread only
  const messages = await db
    .select()
    .from(anonymousMessagesTable)
    .where(unreadFilter)
    .orderBy(desc(anonymousMessagesTable.createdAt))
    .limit(PAGE_SIZE)
    .offset(offset);

  // Mark fetched messages as read
  const msgIds = messages.map((m) => m.id);
  for (const id of msgIds) {
    await db
      .update(anonymousMessagesTable)
      .set({ isRead: true })
      .where(eq(anonymousMessagesTable.id, id));
  }

  // Send header
  const header = t(lang).anonInboxHeader(unread, unread, page + 1, totalPages);
  await bot.api.sendMessage(tgId, header, { parse_mode: "HTML" }).catch(() => null);

  // Send each message
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const num = offset + i + 1;
    const dateStr = formatDate(msg.createdAt, lang);

    let displayContent: string;
    if (msg.content) {
      displayContent = msg.content.length > 300 ? msg.content.slice(0, 300) + "…" : msg.content;
    } else if (msg.fileType) {
      displayContent = t(lang).anonInboxMediaLabel(msg.fileType);
    } else {
      displayContent = "?";
    }

    const msgText = t(lang).anonInboxMsgText(num, dateStr, displayContent);
    const statusTag =
      msg.status === "replied"
        ? (lang === "fa" ? " ✅ پاسخ داده شد" : " ✅ Replied")
        : msg.status === "blocked"
        ? (lang === "fa" ? " 🚫 مسدود" : " 🚫 Blocked")
        : "";

    // Only show action buttons for pending (non-blocked, non-replied already actioned) messages
    const showActions = msg.status === "pending";

    await bot.api
      .sendMessage(tgId, msgText + statusTag, {
        parse_mode: "HTML",
        reply_markup: showActions ? anonMsgActionsKeyboard(msg.id, lang) : undefined,
      })
      .catch(() => null);

    // If it's a media message, send the media too
    if (msg.fileId) {
      if (msg.fileType === "photo") {
        await bot.api.sendPhoto(tgId, msg.fileId).catch(() => null);
      } else if (msg.fileType === "video") {
        await bot.api.sendVideo(tgId, msg.fileId).catch(() => null);
      } else if (msg.fileType === "voice") {
        await bot.api.sendVoice(tgId, msg.fileId).catch(() => null);
      } else if (msg.fileType === "sticker") {
        await bot.api.sendSticker(tgId, msg.fileId).catch(() => null);
      }
    }
  }

  // Pagination footer
  const navKb = new InlineKeyboard();
  if (page > 0) {
    navKb.text(t(lang).anonInboxPrevBtn(page), `anon_inbox:${page - 1}`);
  }
  if (page + 1 < totalPages) {
    if (page > 0) navKb.row();
    navKb.text(t(lang).anonInboxNextBtn(page + 2), `anon_inbox:${page + 1}`);
  }

  if (page > 0 || page + 1 < totalPages) {
    const sep = lang === "fa" ? "─── پایان صفحه ───" : "─── End of page ───";
    await bot.api
      .sendMessage(tgId, sep, { reply_markup: navKb })
      .catch(() => null);
  }
}
