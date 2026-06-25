import { Bot } from "grammy";
import type { BotContext } from "../context.js";
import { getUserByTelegramId, getUserByAnonToken } from "../services/user.service.js";
import { db } from "@workspace/db";
import { anonymousMessagesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { reportUser, blockUser } from "../services/safety.service.js";
import { t } from "../i18n/index.js";
import { mainMenuKeyboard } from "../keyboards/main.js";
import { anonMsgActionsKeyboard } from "../keyboards/inline.js";

export function registerAnonLinkHandlers(bot: Bot<BotContext>) {
  const BOT_USERNAME = process.env["BOT_USERNAME"] ?? "bot";

  // My link button
  bot.hears([/^🔗 لینک ناشناس من/, /^🔗 My Anonymous Link/], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user?.anonymousToken) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    const link = `https://t.me/${BOT_USERNAME}?start=anon_${user.anonymousToken}`;
    const msg = `${t(lang).myLink}\n\`${link}\`\n\n${t(lang).linkInfo}`;
    await ctx.reply(msg, { parse_mode: "Markdown" });
  });

  // Handle /start anon_ deep links
  bot.command("start", async (ctx, next) => {
    const arg = ctx.match?.trim();
    if (!arg?.startsWith("anon_")) return next();

    const token = arg.replace("anon_", "");
    const tgId = ctx.from!.id;
    const sender = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!sender) return;
    const lang = (sender.language as "fa" | "en") ?? "fa";

    const receiver = await getUserByAnonToken(token);
    if (!receiver || receiver.telegramId === tgId) return;

    ctx.session.step = `anon_send:${receiver.telegramId}`;
    await ctx.reply(t(lang).sendAnonMsg, { reply_markup: { remove_keyboard: true } });
  });

  // Receive anonymous message
  bot.on("message", async (ctx, next) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return next();

    const step = ctx.session.step;
    if (!step?.startsWith("anon_send:")) return next();

    const lang = (user.language as "fa" | "en") ?? "fa";
    const receiverId = parseInt(step.replace("anon_send:", ""), 10);

    let content: string | undefined;
    let fileId: string | undefined;
    let fileType: string | undefined;

    if (ctx.message.text) content = ctx.message.text;
    else if (ctx.message.photo) { fileId = ctx.message.photo.at(-1)!.file_id; fileType = "photo"; }
    else if (ctx.message.video) { fileId = ctx.message.video.file_id; fileType = "video"; }
    else if (ctx.message.voice) { fileId = ctx.message.voice.file_id; fileType = "voice"; }
    else if (ctx.message.sticker) { fileId = ctx.message.sticker.file_id; fileType = "sticker"; }

    const [msg] = await db.insert(anonymousMessagesTable).values({
      receiverId,
      senderId: tgId,
      content: content ?? null,
      fileId: fileId ?? null,
      fileType: fileType ?? null,
      status: "pending",
      isRead: false,
      createdAt: new Date(),
    }).returning();

    ctx.session.step = undefined;
    await ctx.reply(t(lang).anonMsgSent, { reply_markup: mainMenuKeyboard(lang) });

    // Notify receiver
    const receiver = await getUserByTelegramId(receiverId);
    const rLang = (receiver?.language as "fa" | "en") ?? "fa";

    const notifyText = `${t(rLang).anonMsgReceived}`;
    let sentMsg: any;
    if (content) {
      sentMsg = await bot.api.sendMessage(receiverId, `${notifyText}\n\n${content}`, { reply_markup: anonMsgActionsKeyboard(msg.id, rLang) }).catch(() => null);
    } else if (fileId && fileType === "photo") {
      sentMsg = await bot.api.sendPhoto(receiverId, fileId, { caption: notifyText, reply_markup: anonMsgActionsKeyboard(msg.id, rLang) }).catch(() => null);
    } else if (fileId && fileType === "video") {
      sentMsg = await bot.api.sendVideo(receiverId, fileId, { caption: notifyText, reply_markup: anonMsgActionsKeyboard(msg.id, rLang) }).catch(() => null);
    } else if (fileId && fileType === "voice") {
      sentMsg = await bot.api.sendVoice(receiverId, fileId, { reply_markup: anonMsgActionsKeyboard(msg.id, rLang) }).catch(() => null);
    } else if (fileId && fileType === "sticker") {
      sentMsg = await bot.api.sendSticker(receiverId, fileId).catch(() => null);
    }
  });

  // Reply to anonymous message
  bot.callbackQuery(/^anon_reply:(\d+)$/, async (ctx) => {
    const tgId = ctx.from!.id;
    const msgId = parseInt(ctx.match![1], 10);
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";

    ctx.session.step = `anon_reply:${msgId}`;
    await ctx.editMessageReplyMarkup();
    await ctx.reply(t(lang).replyPrompt);
    await ctx.answerCallbackQuery();
  });

  // Block anon sender
  bot.callbackQuery(/^anon_block:(\d+)$/, async (ctx) => {
    const tgId = ctx.from!.id;
    const msgId = parseInt(ctx.match![1], 10);
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";

    const [msg] = await db.select().from(anonymousMessagesTable).where(eq(anonymousMessagesTable.id, msgId)).limit(1);
    if (msg?.senderId) await blockUser(tgId, msg.senderId, "anon_message");
    await db.update(anonymousMessagesTable).set({ status: "blocked" }).where(eq(anonymousMessagesTable.id, msgId));
    await ctx.editMessageReplyMarkup();
    await ctx.reply(t(lang).userBlocked);
    await ctx.answerCallbackQuery();
  });

  // Report anon sender
  bot.callbackQuery(/^anon_report:(\d+)$/, async (ctx) => {
    const tgId = ctx.from!.id;
    const msgId = parseInt(ctx.match![1], 10);
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";

    const [msg] = await db.select().from(anonymousMessagesTable).where(eq(anonymousMessagesTable.id, msgId)).limit(1);
    if (msg?.senderId) await reportUser(tgId, msg.senderId, "Anonymous message report");
    await ctx.editMessageReplyMarkup();
    await ctx.reply(t(lang).reportSent);
    await ctx.answerCallbackQuery();
  });

  // Handle reply text
  bot.on("message:text", async (ctx, next) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const step = ctx.session.step;

    if (!step?.startsWith("anon_reply:")) return next();
    const lang = (user?.language as "fa" | "en") ?? "fa";

    const msgId = parseInt(step.replace("anon_reply:", ""), 10);
    const [original] = await db.select().from(anonymousMessagesTable).where(eq(anonymousMessagesTable.id, msgId)).limit(1);

    if (!original) { ctx.session.step = undefined; return; }

    await db.update(anonymousMessagesTable).set({ replyContent: ctx.message.text, repliedAt: new Date(), status: "replied" }).where(eq(anonymousMessagesTable.id, msgId));
    ctx.session.step = undefined;
    await ctx.reply(t(lang).replySent, { reply_markup: mainMenuKeyboard(lang) });

    if (original.senderId) {
      const sender = await getUserByTelegramId(original.senderId);
      const sLang = (sender?.language as "fa" | "en") ?? "fa";
      await bot.api.sendMessage(original.senderId, `${t(sLang).yourReply}\n\n${ctx.message.text}`).catch(() => {});
    }
  });
}
