import { Bot, InlineKeyboard } from "grammy";
import type { BotContext } from "../context.js";
import { getUserByTelegramId } from "../services/user.service.js";
import { deductCoins, addCoins } from "../services/coin.service.js";
import { getSetting } from "../services/payment.service.js";
import { reportUser, blockUser } from "../services/safety.service.js";
import { db } from "@workspace/db";
import { proAnonLinksTable, anonymousMessagesTable } from "@workspace/db";
import { eq, desc, count as countFn, and, inArray, lte, isNotNull } from "drizzle-orm";
import { t } from "../i18n/index.js";
import { mainMenuKeyboard, anonProSubMenuKeyboard, cancelProSendKeyboard } from "../keyboards/main.js";
import {
  proAnonMsgActionsKeyboard,
  proLinkManageInlineKeyboard,
  proInAppDurationKeyboard,
  proInAppConfirmKeyboard,
} from "../keyboards/inline.js";
import { randomBytes } from "crypto";
import type { ProAnonLink } from "@workspace/db";

const PAGE_SIZE = 10;
const PRO_PERM_FREE_CHANGES_PER_DAY = 2;

// ─── Cost helpers ──────────────────────────────────────────────────────────────
async function getProPermCost() {
  const v = await getSetting("pro_perm_link_cost");
  return v ? parseInt(v, 10) : 50;
}
async function getProInAppCost() {
  const v = await getSetting("pro_inapp_link_cost");
  return v ? parseInt(v, 10) : 5;
}
async function getProRevealCost() {
  const v = await getSetting("pro_reveal_cost");
  return v ? parseInt(v, 10) : 1;
}
async function getProWelcomeCost() {
  const v = await getSetting("pro_welcome_cost");
  return v ? parseInt(v, 10) : 3;
}
async function getProChangeCost() {
  const v = await getSetting("pro_change_link_cost");
  return v ? parseInt(v, 10) : 3;
}

// ─── DB helpers ───────────────────────────────────────────────────────────────
function buildProLink(botUsername: string, tier: string, link: { token: string; alias: string | null }) {
  const slug = link.alias ?? link.token;
  const prefix = tier === "permanent" ? "ap" : "ai";
  return `https://t.me/${botUsername}?start=${prefix}_${slug}`;
}

async function getProUnreadCount(tgId: number): Promise<number> {
  const [row] = await db
    .select({ cnt: countFn() })
    .from(anonymousMessagesTable)
    .where(
      and(
        eq(anonymousMessagesTable.receiverId, tgId),
        eq(anonymousMessagesTable.isRead, false),
        inArray(anonymousMessagesTable.linkType, ["pro_perm", "pro_inapp"]),
      ),
    );
  return Number(row?.cnt ?? 0);
}

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatExpiry(date: Date, lang: "fa" | "en") {
  try {
    return date.toLocaleString(lang === "fa" ? "fa-IR" : "en-GB");
  } catch {
    return date.toISOString();
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function registerProAnonLinkHandlers(bot: Bot<BotContext>) {
  const getBotUsername = () => bot.botInfo?.username ?? "anymschat_bot";

  // ─── Pro sub-menu (main menu button) ──────────────────────────────────────
  bot.hears(["💎 لینک ناشناس پرو", "💎 Pro Anonymous Link"], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? (await getUserByTelegramId(tgId));
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    // Auto-delete expired in-app links
    const now = new Date();
    const expired = await db
      .select({ id: proAnonLinksTable.id })
      .from(proAnonLinksTable)
      .where(
        and(
          eq(proAnonLinksTable.userId, tgId),
          eq(proAnonLinksTable.tier, "inapp"),
          isNotNull(proAnonLinksTable.expiresAt),
          lte(proAnonLinksTable.expiresAt, now),
        ),
      );
    for (const el of expired) {
      await db.delete(proAnonLinksTable).where(eq(proAnonLinksTable.id, el.id));
    }
    if (expired.length > 0) {
      await ctx.reply(
        lang === "fa"
          ? `⏰ ${expired.length} لینک درون‌برنامه‌ای منقضی‌شده حذف شد.`
          : `⏰ ${expired.length} expired in-app link(s) removed.`,
      );
    }

    const inboxCount = await getProUnreadCount(tgId);
    await ctx.reply(t(lang).proLinkSubMenuTitle(inboxCount), {
      parse_mode: "Markdown",
      reply_markup: anonProSubMenuKeyboard(lang, inboxCount),
    });
  });

  // ─── My Pro Links list ─────────────────────────────────────────────────────
  bot.hears(["📋 لینک‌های پرو من", "📋 My Pro Links"], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? (await getUserByTelegramId(tgId));
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";
    const fa = lang === "fa";

    const links = await db
      .select()
      .from(proAnonLinksTable)
      .where(eq(proAnonLinksTable.userId, tgId))
      .orderBy(desc(proAnonLinksTable.createdAt));

    if (links.length === 0) {
      await ctx.reply(t(lang).proMyLinksEmpty);
      return;
    }

    const kb = new InlineKeyboard();
    for (const link of links) {
      const isInApp = link.tier === "inapp";
      const expired = isInApp && link.expiresAt && link.expiresAt < new Date();
      const label =
        (isInApp ? "⚡" : "💎") +
        " " +
        (link.displayName ?? link.alias ?? link.token.slice(0, 8)) +
        (expired ? (fa ? " (منقضی)" : " (expired)") : "") +
        (link.isEnabled ? "" : (fa ? " ❌" : " ❌"));
      kb.text(label, `pro_manage:${link.id}`).row();
    }

    await ctx.reply(t(lang).proMyLinksHeader, { parse_mode: "HTML", reply_markup: kb });
  });

  // ─── My Pro Links: manage specific link ────────────────────────────────────
  bot.callbackQuery(/^pro_manage:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const linkId = parseInt(ctx.match![1], 10);
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? (await getUserByTelegramId(tgId));
    const lang = (user?.language as "fa" | "en") ?? "fa";

    const [link] = await db
      .select()
      .from(proAnonLinksTable)
      .where(and(eq(proAnonLinksTable.id, linkId), eq(proAnonLinksTable.userId, tgId)))
      .limit(1);
    if (!link) return;

    const linkUrl = buildProLink(getBotUsername(), link.tier, link);
    let body: string;
    if (link.tier === "permanent") {
      body = t(lang).proPermLinkActive(linkUrl, link.displayName, link.alias, !!link.welcomeMessage, link.isEnabled);
    } else {
      const expiryStr = link.expiresAt ? formatExpiry(link.expiresAt, lang) : "?";
      body = t(lang).proInAppLinkActive(linkUrl, expiryStr, link.displayName, link.isEnabled);
    }
    await ctx.editMessageText(body, {
      parse_mode: "HTML",
      reply_markup: proLinkManageInlineKeyboard(link.id, link.tier, link.isEnabled, lang),
    });
  });

  // ─── Pro Permanent Link ────────────────────────────────────────────────────
  bot.hears(["💎 لینک پرو دائمی", "💎 Pro Permanent Link"], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? (await getUserByTelegramId(tgId));
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    const [existing] = await db
      .select()
      .from(proAnonLinksTable)
      .where(and(eq(proAnonLinksTable.userId, tgId), eq(proAnonLinksTable.tier, "permanent")))
      .limit(1);

    if (existing) {
      const link = buildProLink(getBotUsername(), "permanent", existing);
      await ctx.reply(
        t(lang).proPermLinkActive(link, existing.displayName, existing.alias, !!existing.welcomeMessage, existing.isEnabled),
        { parse_mode: "HTML", reply_markup: proLinkManageInlineKeyboard(existing.id, "permanent", existing.isEnabled, lang) },
      );
      return;
    }

    const cost = await getProPermCost();
    await ctx.reply(t(lang).proPermLinkFeatures, { parse_mode: "Markdown" });

    if (user.coins < cost) {
      const msg =
        lang === "fa"
          ? `❌ سکه کافی ندارید.\n💰 موجودی: ${user.coins} | هزینه: ${cost} سکه`
          : `❌ Not enough coins.\n💰 Balance: ${user.coins} | Cost: ${cost} coins`;
      await ctx.reply(msg);
      return;
    }

    await ctx.reply(t(lang).proPermLinkBuyConfirm(cost), {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text(lang === "fa" ? "✅ تأیید و خرید" : "✅ Confirm & Buy", "pro_perm_buy")
        .text(lang === "fa" ? "❌ انصراف" : "❌ Cancel", "pro_perm_cancel"),
    });
  });

  // ─── Confirm buy permanent link ────────────────────────────────────────────
  bot.callbackQuery("pro_perm_buy", async (ctx) => {
    await ctx.answerCallbackQuery();
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? (await getUserByTelegramId(tgId));
    const lang = (user?.language as "fa" | "en") ?? "fa";

    const [alreadyHas] = await db
      .select()
      .from(proAnonLinksTable)
      .where(and(eq(proAnonLinksTable.userId, tgId), eq(proAnonLinksTable.tier, "permanent")))
      .limit(1);

    if (alreadyHas) {
      const link = buildProLink(getBotUsername(), "permanent", alreadyHas);
      await ctx.editMessageText(
        t(lang).proPermLinkActive(link, alreadyHas.displayName, alreadyHas.alias, !!alreadyHas.welcomeMessage, alreadyHas.isEnabled),
        { parse_mode: "HTML", reply_markup: proLinkManageInlineKeyboard(alreadyHas.id, "permanent", alreadyHas.isEnabled, lang) },
      );
      return;
    }

    const cost = await getProPermCost();
    const result = await deductCoins(tgId, cost, "magic_spend", lang === "fa" ? "خرید لینک پرو دائمی" : "Pro permanent link purchase");
    if (!result.success) {
      await ctx.editMessageText(lang === "fa" ? "❌ سکه کافی ندارید!" : "❌ Not enough coins!");
      return;
    }

    const token = randomBytes(16).toString("hex");
    const [link] = await db
      .insert(proAnonLinksTable)
      .values({ userId: tgId, tier: "permanent", token, isEnabled: true, linkChangesToday: 0, createdAt: new Date() })
      .returning();

    const linkUrl = buildProLink(getBotUsername(), "permanent", link);
    await ctx.editMessageText(t(lang).proPermLinkActive(linkUrl, null, null, false, true), {
      parse_mode: "HTML",
      reply_markup: proLinkManageInlineKeyboard(link.id, "permanent", true, lang),
    });
  });

  bot.callbackQuery("pro_perm_cancel", async (ctx) => {
    await ctx.answerCallbackQuery();
    const lang = ((ctx.dbUser?.language) as "fa" | "en") ?? "fa";
    await ctx.editMessageText(lang === "fa" ? "❌ لغو شد." : "❌ Cancelled.");
  });

  // ─── Pro In-App Link ───────────────────────────────────────────────────────
  bot.hears(["⚡ لینک درون‌برنامه‌ای", "⚡ In-App Link"], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? (await getUserByTelegramId(tgId));
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    const [revealCost, welcomeCost, changeCost, linkCost] = await Promise.all([
      getProRevealCost(), getProWelcomeCost(), getProChangeCost(), getProInAppCost(),
    ]);

    await ctx.reply(t(lang).proInAppLinkFeatures(revealCost, welcomeCost, changeCost), { parse_mode: "Markdown" });

    if (user.coins < linkCost) {
      const msg =
        lang === "fa"
          ? `❌ سکه کافی ندارید.\n💰 موجودی: ${user.coins} | هزینه: ${linkCost} سکه`
          : `❌ Not enough coins.\n💰 Balance: ${user.coins} | Cost: ${linkCost} coins`;
      await ctx.reply(msg);
      return;
    }

    const createMsg =
      lang === "fa"
        ? `⚡ **ساخت لینک درون‌برنامه‌ای** — هزینه: **${linkCost} سکه**\n\nمدت زمان لینک را انتخاب کنید:`
        : `⚡ **Create In-App Link** — Cost: **${linkCost} coins**\n\nSelect link duration:`;
    await ctx.reply(createMsg, { parse_mode: "Markdown", reply_markup: proInAppDurationKeyboard(lang) });
  });

  // ─── In-App duration selection ─────────────────────────────────────────────
  bot.callbackQuery(/^pro_inapp_dur:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const hours = parseInt(ctx.match![1], 10);
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? (await getUserByTelegramId(tgId));
    const lang = (user?.language as "fa" | "en") ?? "fa";
    const cost = await getProInAppCost();

    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
    const expiryStr = formatExpiry(expiresAt, lang);
    const pendingToken = randomBytes(16).toString("hex");

    const durationLabel =
      hours <= 1 ? (lang === "fa" ? "۱ ساعت" : "1 hour")
        : hours <= 6 ? (lang === "fa" ? "۶ ساعت" : "6 hours")
        : hours <= 24 ? (lang === "fa" ? "۲۴ ساعت" : "24 hours")
        : (lang === "fa" ? "۷ روز" : "7 days");

    const msg =
      lang === "fa"
        ? `⚡ <b>تأیید ساخت لینک درون‌برنامه‌ای</b>\n\n⌛ مدت: ${durationLabel}\n📅 انقضا: ${expiryStr}\n💰 هزینه: <b>${cost} سکه</b>\n\nتأیید می‌کنید؟`
        : `⚡ <b>Confirm In-App Link</b>\n\n⌛ Duration: ${durationLabel}\n📅 Expires: ${expiryStr}\n💰 Cost: <b>${cost} coins</b>\n\nConfirm?`;

    await ctx.editMessageText(msg, { parse_mode: "HTML", reply_markup: proInAppConfirmKeyboard(hours, pendingToken, lang) });
  });

  // ─── Confirm create in-app link ────────────────────────────────────────────
  bot.callbackQuery(/^pro_inapp_buy:(\d+):([a-f0-9]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const hours = parseInt(ctx.match![1], 10);
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? (await getUserByTelegramId(tgId));
    const lang = (user?.language as "fa" | "en") ?? "fa";

    const cost = await getProInAppCost();
    const result = await deductCoins(tgId, cost, "magic_spend", lang === "fa" ? "ساخت لینک درون‌برنامه‌ای" : "In-app link creation");
    if (!result.success) {
      await ctx.editMessageText(lang === "fa" ? "❌ سکه کافی ندارید!" : "❌ Not enough coins!");
      return;
    }

    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
    const token = randomBytes(16).toString("hex");

    const [link] = await db
      .insert(proAnonLinksTable)
      .values({ userId: tgId, tier: "inapp", token, isEnabled: true, linkChangesToday: 0, expiresAt, createdAt: new Date() })
      .returning();

    const linkUrl = buildProLink(getBotUsername(), "inapp", link);
    const expiryStr = formatExpiry(expiresAt, lang);

    await ctx.editMessageText(t(lang).proInAppLinkActive(linkUrl, expiryStr, null, true), {
      parse_mode: "HTML",
      reply_markup: proLinkManageInlineKeyboard(link.id, "inapp", true, lang),
    });
  });

  bot.callbackQuery("pro_inapp_cancel", async (ctx) => {
    await ctx.answerCallbackQuery();
    const lang = ((ctx.dbUser?.language) as "fa" | "en") ?? "fa";
    await ctx.editMessageText(lang === "fa" ? "❌ لغو شد." : "❌ Cancelled.");
  });

  // ─── Toggle link on/off ────────────────────────────────────────────────────
  bot.callbackQuery(/^pro_toggle:(\d+):(on|off)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const linkId = parseInt(ctx.match![1], 10);
    const enable = ctx.match![2] === "on";
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? (await getUserByTelegramId(tgId));
    const lang = (user?.language as "fa" | "en") ?? "fa";

    const [link] = await db
      .update(proAnonLinksTable)
      .set({ isEnabled: enable })
      .where(and(eq(proAnonLinksTable.id, linkId), eq(proAnonLinksTable.userId, tgId)))
      .returning();
    if (!link) return;

    const linkUrl = buildProLink(getBotUsername(), link.tier, link);
    const statusMsg = enable ? t(lang).proLinkToggledOn : t(lang).proLinkToggledOff;

    let body: string;
    if (link.tier === "permanent") {
      body = t(lang).proPermLinkActive(linkUrl, link.displayName, link.alias, !!link.welcomeMessage, enable);
    } else {
      const expiryStr = link.expiresAt ? formatExpiry(link.expiresAt, lang) : "?";
      body = t(lang).proInAppLinkActive(linkUrl, expiryStr, link.displayName, enable);
    }

    await ctx.editMessageText(`${statusMsg}\n\n${body}`, {
      parse_mode: "HTML",
      reply_markup: proLinkManageInlineKeyboard(linkId, link.tier, enable, lang),
    });
  });

  // ─── Change link token ─────────────────────────────────────────────────────
  bot.callbackQuery(/^pro_change_token:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const linkId = parseInt(ctx.match![1], 10);
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? (await getUserByTelegramId(tgId));
    const lang = (user?.language as "fa" | "en") ?? "fa";

    const [link] = await db
      .select()
      .from(proAnonLinksTable)
      .where(and(eq(proAnonLinksTable.id, linkId), eq(proAnonLinksTable.userId, tgId)))
      .limit(1);
    if (!link) return;

    const today = getTodayStr();

    if (link.tier === "permanent") {
      const sameDay = link.lastLinkChangeDate === today;
      const usedToday = sameDay ? link.linkChangesToday : 0;
      const changesLeft = PRO_PERM_FREE_CHANGES_PER_DAY - usedToday;

      if (changesLeft <= 0) {
        await ctx.answerCallbackQuery({
          text: lang === "fa" ? "❌ امروز به حد مجاز رسیده‌اید (۲ بار)" : "❌ Daily limit reached (2 changes)",
          show_alert: true,
        });
        return;
      }

      const newToken = randomBytes(16).toString("hex");
      const [updated] = await db
        .update(proAnonLinksTable)
        .set({ token: newToken, alias: null, linkChangesToday: usedToday + 1, lastLinkChangeDate: today })
        .where(eq(proAnonLinksTable.id, linkId))
        .returning();

      const newUrl = buildProLink(getBotUsername(), "permanent", updated);
      const remaining = PRO_PERM_FREE_CHANGES_PER_DAY - updated.linkChangesToday;
      await ctx.editMessageText(t(lang).proChangeLinkFree(newUrl, remaining), {
        parse_mode: "HTML",
        reply_markup: proLinkManageInlineKeyboard(linkId, "permanent", updated.isEnabled, lang),
      });
    } else {
      const cost = await getProChangeCost();
      const result = await deductCoins(tgId, cost, "magic_spend", "Change pro link token");
      if (!result.success) {
        await ctx.answerCallbackQuery({
          text: lang === "fa" ? `❌ سکه کافی ندارید (${cost} سکه)` : `❌ Not enough coins (${cost})`,
          show_alert: true,
        });
        return;
      }

      const newToken = randomBytes(16).toString("hex");
      const [updated] = await db
        .update(proAnonLinksTable)
        .set({ token: newToken, alias: null })
        .where(eq(proAnonLinksTable.id, linkId))
        .returning();

      const newUrl = buildProLink(getBotUsername(), "inapp", updated);
      await ctx.editMessageText(t(lang).proChangeLinkCost(newUrl), {
        parse_mode: "HTML",
        reply_markup: proLinkManageInlineKeyboard(linkId, "inapp", updated.isEnabled, lang),
      });
    }
  });

  // ─── Set welcome message ───────────────────────────────────────────────────
  bot.callbackQuery(/^pro_set_welcome:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const linkId = parseInt(ctx.match![1], 10);
    const tgId = ctx.from!.id;

    const [link] = await db
      .select()
      .from(proAnonLinksTable)
      .where(and(eq(proAnonLinksTable.id, linkId), eq(proAnonLinksTable.userId, tgId)))
      .limit(1);
    if (!link) return;

    const user = ctx.dbUser ?? (await getUserByTelegramId(tgId));
    const lang = (user?.language as "fa" | "en") ?? "fa";

    if (link.tier === "inapp") {
      const cost = await getProWelcomeCost();
      const result = await deductCoins(tgId, cost, "magic_spend", "Set pro link welcome message");
      if (!result.success) {
        await ctx.answerCallbackQuery({
          text: lang === "fa" ? `❌ سکه کافی ندارید (${cost} سکه)` : `❌ Not enough coins (${cost})`,
          show_alert: true,
        });
        return;
      }
    }

    ctx.session.step = `pro_set_welcome:${linkId}`;
    await ctx.reply(t(lang).proSetWelcomePrompt);
  });

  // ─── Set display name ──────────────────────────────────────────────────────
  bot.callbackQuery(/^pro_set_name:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const linkId = parseInt(ctx.match![1], 10);
    const tgId = ctx.from!.id;
    const [link] = await db
      .select()
      .from(proAnonLinksTable)
      .where(and(eq(proAnonLinksTable.id, linkId), eq(proAnonLinksTable.userId, tgId)))
      .limit(1);
    if (!link) return;

    const user = ctx.dbUser ?? (await getUserByTelegramId(tgId));
    const lang = (user?.language as "fa" | "en") ?? "fa";
    ctx.session.step = `pro_set_name:${linkId}`;
    await ctx.reply(t(lang).proSetDisplayNamePrompt);
  });

  // ─── Set alias ─────────────────────────────────────────────────────────────
  bot.callbackQuery(/^pro_set_alias:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const linkId = parseInt(ctx.match![1], 10);
    const tgId = ctx.from!.id;
    const [link] = await db
      .select()
      .from(proAnonLinksTable)
      .where(and(eq(proAnonLinksTable.id, linkId), eq(proAnonLinksTable.userId, tgId)))
      .limit(1);
    if (!link) return;

    const user = ctx.dbUser ?? (await getUserByTelegramId(tgId));
    const lang = (user?.language as "fa" | "en") ?? "fa";
    ctx.session.step = `pro_set_alias:${linkId}`;
    await ctx.reply(t(lang).proSetAliasPrompt);
  });

  // ─── Reveal sender ─────────────────────────────────────────────────────────
  bot.callbackQuery(/^pro_reveal:(\d+)$/, async (ctx) => {
    const msgId = parseInt(ctx.match![1], 10);
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? (await getUserByTelegramId(tgId));
    const lang = (user?.language as "fa" | "en") ?? "fa";

    const [msg] = await db
      .select()
      .from(anonymousMessagesTable)
      .where(and(eq(anonymousMessagesTable.id, msgId), eq(anonymousMessagesTable.receiverId, tgId)))
      .limit(1);

    if (!msg || !msg.senderId) {
      await ctx.answerCallbackQuery({
        text: lang === "fa" ? "❌ اطلاعات فرستنده موجود نیست" : "❌ Sender info unavailable",
        show_alert: true,
      });
      return;
    }

    if (msg.senderRevealedAt) {
      // Already revealed — open private chat directly
      const revealCost = await getProRevealCost();
      await ctx.editMessageReplyMarkup({
        reply_markup: proAnonMsgActionsKeyboard(msgId, msg.linkType, lang, revealCost, true, msg.senderId ?? undefined),
      }).catch(() => null);
      await ctx.answerCallbackQuery({
        text: lang === "fa" ? "✅ هویت فرستنده قبلاً آشکار شده است." : "✅ Already revealed.",
        show_alert: false,
      });
      return;
    }

    if (msg.linkType === "pro_inapp") {
      const cost = await getProRevealCost();
      const result = await deductCoins(tgId, cost, "magic_spend", "Reveal pro message sender");
      if (!result.success) {
        await ctx.answerCallbackQuery({
          text: lang === "fa" ? `❌ سکه کافی ندارید (${cost} سکه)` : `❌ Not enough coins (${cost})`,
          show_alert: true,
        });
        return;
      }
    }

    await db
      .update(anonymousMessagesTable)
      .set({ senderRevealedAt: new Date() })
      .where(eq(anonymousMessagesTable.id, msgId));

    const revealCost = await getProRevealCost();
    await ctx.editMessageReplyMarkup({
      reply_markup: proAnonMsgActionsKeyboard(msgId, msg.linkType, lang, revealCost, true, msg.senderId ?? undefined),
    }).catch(() => null);
    await ctx.answerCallbackQuery({
      text: lang === "fa" ? "✅ هویت فرستنده آشکار شد — روی دکمه بزن تا چت باز شه" : "✅ Sender revealed — tap the button to open chat",
      show_alert: true,
    });
  });

  // ─── Reply to pro message ──────────────────────────────────────────────────
  bot.callbackQuery(/^pro_reply:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const msgId = parseInt(ctx.match![1], 10);
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? (await getUserByTelegramId(tgId));
    const lang = (user?.language as "fa" | "en") ?? "fa";
    ctx.session.step = `pro_reply:${msgId}`;
    await ctx.editMessageReplyMarkup().catch(() => null);
    await ctx.reply(t(lang).proReplyPrompt);
  });

  // ─── Block sender ──────────────────────────────────────────────────────────
  bot.callbackQuery(/^pro_block:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const msgId = parseInt(ctx.match![1], 10);
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? (await getUserByTelegramId(tgId));
    const lang = (user?.language as "fa" | "en") ?? "fa";

    const [msg] = await db
      .select()
      .from(anonymousMessagesTable)
      .where(eq(anonymousMessagesTable.id, msgId))
      .limit(1);

    if (msg?.senderId) {
      await blockUser(tgId, msg.senderId, "pro_anon_message");
    }
    await db.update(anonymousMessagesTable).set({ status: "blocked" }).where(eq(anonymousMessagesTable.id, msgId));
    await ctx.editMessageReplyMarkup().catch(() => null);
    await ctx.reply(t(lang).userBlocked);
  });

  // ─── Report sender ─────────────────────────────────────────────────────────
  bot.callbackQuery(/^pro_report:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const msgId = parseInt(ctx.match![1], 10);
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? (await getUserByTelegramId(tgId));
    const lang = (user?.language as "fa" | "en") ?? "fa";

    const [msg] = await db
      .select()
      .from(anonymousMessagesTable)
      .where(eq(anonymousMessagesTable.id, msgId))
      .limit(1);

    if (msg?.senderId) {
      await reportUser(tgId, msg.senderId, "Pro anonymous message report");
    }
    await db.update(anonymousMessagesTable).set({ status: "blocked" }).where(eq(anonymousMessagesTable.id, msgId));
    await ctx.editMessageReplyMarkup().catch(() => null);
    await ctx.reply(t(lang).reportSent);
  });

  // ─── Pro Inbox ─────────────────────────────────────────────────────────────
  bot.hears([/^📬 صندوق پرو/, /^📬 Pro Inbox/], async (ctx) => {
    await showProInboxPage(ctx, bot, 0);
  });

  bot.callbackQuery(/^pro_inbox:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await showProInboxPage(ctx, bot, parseInt(ctx.match![1], 10));
  });

  // ─── Message handler: pro_send: step (all file types) ─────────────────────
  bot.on("message", async (ctx, next) => {
    const tgId = ctx.from!.id;
    const step = ctx.session.step;
    if (!step?.startsWith("pro_send:")) return next();

    const parts = step.split(":");
    const receiverId = parseInt(parts[1], 10);
    const linkId = parseInt(parts[2], 10);
    const tier = parts[3] as "permanent" | "inapp";

    const user = ctx.dbUser ?? (await getUserByTelegramId(tgId));
    const lang = (user?.language as "fa" | "en") ?? "fa";

    let content: string | undefined;
    let fileId: string | undefined;
    let fileType: string | undefined;
    let caption: string | undefined;

    const m = ctx.message;

    // Cancel button check
    if (m.text === "❌ انصراف" || m.text === "❌ Cancel") {
      ctx.session.step = undefined;
      await ctx.reply(lang === "fa" ? "❌ ارسال پیام لغو شد." : "❌ Cancelled.", { reply_markup: mainMenuKeyboard(lang) });
      return;
    }

    if (m.text) {
      content = m.text;
    } else if (m.photo) {
      fileId = m.photo.at(-1)!.file_id;
      fileType = "photo";
      caption = m.caption;
    } else if (m.video) {
      fileId = m.video.file_id;
      fileType = "video";
      caption = m.caption;
    } else if (m.animation) {
      fileId = m.animation.file_id;
      fileType = "animation";
      caption = m.caption;
    } else if (m.voice) {
      fileId = m.voice.file_id;
      fileType = "voice";
    } else if (m.audio) {
      fileId = m.audio.file_id;
      fileType = "audio";
      caption = m.caption;
    } else if (m.document) {
      fileId = m.document.file_id;
      fileType = "document";
      caption = m.caption;
    } else if (m.video_note) {
      fileId = m.video_note.file_id;
      fileType = "video_note";
    } else if (m.sticker) {
      fileId = m.sticker.file_id;
      fileType = "sticker";
    } else {
      return next();
    }

    const receiver = await getUserByTelegramId(receiverId);
    const rLang = (receiver?.language as "fa" | "en") ?? "fa";
    const receiverBusy = !!(receiver?.isInChat || receiver?.isInGroup);
    const linkType = tier === "permanent" ? "pro_perm" : "pro_inapp";

    const [msg] = await db
      .insert(anonymousMessagesTable)
      .values({
        receiverId,
        senderId: tgId,
        content: content ?? null,
        fileId: fileId ?? null,
        fileType: fileType ?? null,
        status: "pending",
        isRead: receiverBusy ? false : true,
        linkType,
        proLinkId: linkId,
        createdAt: new Date(),
      })
      .returning();

    const revealCost = await getProRevealCost();
    const notifyText = t(rLang).proMsgReceived;
    const actionKb = proAnonMsgActionsKeyboard(msg.id, linkType, rLang, revealCost);

    if (!receiverBusy) {
      if (content) {
        await bot.api
          .sendMessage(receiverId, `${notifyText}\n\n${content}`, { parse_mode: "HTML", reply_markup: actionKb })
          .catch(() => null);
      } else if (fileId && fileType) {
        await sendFileToUser(bot, receiverId, fileId, fileType, `${notifyText}${caption ? `\n${caption}` : ""}`, actionKb);
      }
    }

    // Keep session alive — user can send multiple messages until they press Cancel
    await ctx.reply(t(lang).proMsgSentConfirm, { reply_markup: cancelProSendKeyboard(lang) });
  });

  // ─── Text input handler: pro_reply, pro_set_welcome, pro_set_name, pro_set_alias
  bot.on("message:text", async (ctx, next) => {
    const tgId = ctx.from!.id;
    const step = ctx.session.step;
    if (!step) return next();

    const user = ctx.dbUser ?? (await getUserByTelegramId(tgId));
    const lang = (user?.language as "fa" | "en") ?? "fa";

    // ── Reply to pro message ────────────────────────────────────────────────
    if (step.startsWith("pro_reply:")) {
      const msgId = parseInt(step.replace("pro_reply:", ""), 10);
      const [original] = await db
        .select()
        .from(anonymousMessagesTable)
        .where(eq(anonymousMessagesTable.id, msgId))
        .limit(1);

      if (!original) { ctx.session.step = undefined; return; }

      await db.update(anonymousMessagesTable).set({
        replyContent: ctx.message.text,
        repliedAt: new Date(),
        status: "replied",
      }).where(eq(anonymousMessagesTable.id, msgId));

      ctx.session.step = undefined;
      await ctx.reply(t(lang).proReplySent, { reply_markup: mainMenuKeyboard(lang) });

      if (original.senderId) {
        const sender = await getUserByTelegramId(original.senderId);
        const sLang = (sender?.language as "fa" | "en") ?? "fa";
        // Use proLink displayName as the replier name shown to the sender
        let replierName: string;
        if (original.proLinkId) {
          const [pl] = await db
            .select({ displayName: proAnonLinksTable.displayName, alias: proAnonLinksTable.alias })
            .from(proAnonLinksTable)
            .where(eq(proAnonLinksTable.id, original.proLinkId))
            .limit(1);
          const linkOwner = await getUserByTelegramId(original.receiverId);
          replierName = pl?.displayName ?? pl?.alias ?? linkOwner?.firstName ?? (sLang === "fa" ? "ناشناس" : "Anonymous");
        } else {
          replierName = user?.firstName ?? (lang === "fa" ? "کاربر" : "User");
        }
        await bot.api
          .sendMessage(original.senderId, t(sLang).yourReplyFromName(replierName) + ctx.message.text)
          .catch(() => {});
      }
      return;
    }

    // ── Set welcome message ─────────────────────────────────────────────────
    if (step.startsWith("pro_set_welcome:")) {
      const linkId = parseInt(step.replace("pro_set_welcome:", ""), 10);
      const welcome = ctx.message.text.slice(0, 500);
      await db.update(proAnonLinksTable).set({ welcomeMessage: welcome })
        .where(and(eq(proAnonLinksTable.id, linkId), eq(proAnonLinksTable.userId, tgId)));
      ctx.session.step = undefined;
      await ctx.reply(t(lang).proWelcomeSet, { reply_markup: mainMenuKeyboard(lang) });
      return;
    }

    // ── Set display name ────────────────────────────────────────────────────
    if (step.startsWith("pro_set_name:")) {
      const linkId = parseInt(step.replace("pro_set_name:", ""), 10);
      const name = ctx.message.text.slice(0, 50);
      await db.update(proAnonLinksTable).set({ displayName: name })
        .where(and(eq(proAnonLinksTable.id, linkId), eq(proAnonLinksTable.userId, tgId)));
      ctx.session.step = undefined;
      await ctx.reply(t(lang).proDisplayNameSet, { reply_markup: mainMenuKeyboard(lang) });
      return;
    }

    // ── Set alias ───────────────────────────────────────────────────────────
    if (step.startsWith("pro_set_alias:")) {
      const linkId = parseInt(step.replace("pro_set_alias:", ""), 10);
      const aliasRaw = ctx.message.text.trim();

      if (!/^[a-zA-Z0-9_]{1,20}$/.test(aliasRaw)) {
        await ctx.reply(t(lang).proAliasInvalid);
        return;
      }

      const [taken] = await db
        .select({ id: proAnonLinksTable.id })
        .from(proAnonLinksTable)
        .where(eq(proAnonLinksTable.alias, aliasRaw))
        .limit(1);

      if (taken && taken.id !== linkId) {
        await ctx.reply(t(lang).proAliasTaken);
        return;
      }

      const [updated] = await db
        .update(proAnonLinksTable)
        .set({ alias: aliasRaw })
        .where(and(eq(proAnonLinksTable.id, linkId), eq(proAnonLinksTable.userId, tgId)))
        .returning();

      ctx.session.step = undefined;
      const linkUrl = buildProLink(getBotUsername(), updated.tier, updated);
      await ctx.reply(t(lang).proAliasSet(linkUrl), { parse_mode: "HTML", reply_markup: mainMenuKeyboard(lang) });
      return;
    }

    return next();
  });
}

// ─── File delivery helper ──────────────────────────────────────────────────────
async function sendFileToUser(
  bot: Bot<BotContext>,
  userId: number,
  fileId: string,
  fileType: string,
  caption: string,
  keyboard: InlineKeyboard,
) {
  switch (fileType) {
    case "photo":
      await bot.api.sendPhoto(userId, fileId, { caption, parse_mode: "HTML", reply_markup: keyboard }).catch(() => null);
      break;
    case "video":
      await bot.api.sendVideo(userId, fileId, { caption, parse_mode: "HTML", reply_markup: keyboard }).catch(() => null);
      break;
    case "animation":
      await bot.api.sendAnimation(userId, fileId, { caption, parse_mode: "HTML", reply_markup: keyboard }).catch(() => null);
      break;
    case "audio":
      await bot.api.sendAudio(userId, fileId, { caption, parse_mode: "HTML", reply_markup: keyboard }).catch(() => null);
      break;
    case "document":
      await bot.api.sendDocument(userId, fileId, { caption, parse_mode: "HTML", reply_markup: keyboard }).catch(() => null);
      break;
    case "voice":
      await bot.api.sendVoice(userId, fileId).catch(() => null);
      await bot.api.sendMessage(userId, caption, { parse_mode: "HTML", reply_markup: keyboard }).catch(() => null);
      break;
    case "video_note":
      await bot.api.sendVideoNote(userId, fileId).catch(() => null);
      await bot.api.sendMessage(userId, caption, { parse_mode: "HTML", reply_markup: keyboard }).catch(() => null);
      break;
    case "sticker":
      await bot.api.sendSticker(userId, fileId).catch(() => null);
      await bot.api.sendMessage(userId, caption, { parse_mode: "HTML", reply_markup: keyboard }).catch(() => null);
      break;
    default:
      await bot.api.sendMessage(userId, caption, { parse_mode: "HTML", reply_markup: keyboard }).catch(() => null);
  }
}

// ─── Pro Inbox helper ──────────────────────────────────────────────────────────
async function showProInboxPage(
  ctx: import("grammy").Context & { from?: import("grammy/types").User; session?: { step?: string } },
  bot: Bot<BotContext>,
  page: number,
) {
  const tgId = ctx.from!.id;
  const user = await getUserByTelegramId(tgId);
  const lang = (user?.language as "fa" | "en") ?? "fa";

  const proFilter = and(
    eq(anonymousMessagesTable.receiverId, tgId),
    eq(anonymousMessagesTable.isRead, false),
    inArray(anonymousMessagesTable.linkType, ["pro_perm", "pro_inapp"]),
  );

  const [countRow] = await db.select({ cnt: countFn() }).from(anonymousMessagesTable).where(proFilter);
  const total = Number(countRow?.cnt ?? 0);

  if (total === 0) {
    await ctx.reply(t(lang).proInboxEmpty, { reply_markup: anonProSubMenuKeyboard(lang, 0) });
    return;
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const offset = page * PAGE_SIZE;

  const messages = await db
    .select()
    .from(anonymousMessagesTable)
    .where(proFilter)
    .orderBy(desc(anonymousMessagesTable.createdAt))
    .limit(PAGE_SIZE)
    .offset(offset);

  for (const msg of messages) {
    await db.update(anonymousMessagesTable).set({ isRead: true }).where(eq(anonymousMessagesTable.id, msg.id));
  }

  const header = t(lang).proInboxHeader(total, page + 1, totalPages);
  await bot.api.sendMessage(tgId, header, { parse_mode: "HTML" }).catch(() => null);

  const revealCost = await getProRevealCost();

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const num = offset + i + 1;
    const dateStr = msg.createdAt.toLocaleString(lang === "fa" ? "fa-IR" : "en-GB");

    let preview: string;
    if (msg.content) {
      preview = msg.content.length > 300 ? msg.content.slice(0, 300) + "…" : msg.content;
    } else if (msg.fileType) {
      preview = t(lang).proInboxMediaLabel(msg.fileType);
    } else {
      preview = "?";
    }

    const msgText = t(lang).proInboxMsgText(num, dateStr, preview, msg.linkType);
    const statusTag =
      msg.status === "replied"
        ? (lang === "fa" ? " ✅ پاسخ داده شد" : " ✅ Replied")
        : msg.status === "blocked"
        ? (lang === "fa" ? " 🚫 مسدود" : " 🚫 Blocked")
        : "";

    const showActions = msg.status === "pending";
    const isRevealed = !!msg.senderRevealedAt;
    const actionKb = showActions
      ? proAnonMsgActionsKeyboard(msg.id, msg.linkType, lang, revealCost, isRevealed, msg.senderId ?? undefined)
      : undefined;

    if (msg.content) {
      await bot.api
        .sendMessage(tgId, msgText + statusTag, { parse_mode: "HTML", reply_markup: actionKb })
        .catch(() => null);
    } else if (msg.fileId && msg.fileType) {
      await sendFileToUser(bot, tgId, msg.fileId, msg.fileType, msgText + statusTag, actionKb ?? new InlineKeyboard());
      if (!actionKb) continue;
    } else {
      await bot.api
        .sendMessage(tgId, msgText + statusTag, { parse_mode: "HTML", reply_markup: actionKb })
        .catch(() => null);
    }
  }

  if (totalPages > 1) {
    const kb = new InlineKeyboard();
    if (page > 0) kb.text(lang === "fa" ? "◀️ قبلی" : "◀️ Prev", `pro_inbox:${page - 1}`);
    if (page < totalPages - 1) kb.text(lang === "fa" ? "▶️ بعدی" : "▶️ Next", `pro_inbox:${page + 1}`);
    await bot.api
      .sendMessage(tgId, lang === "fa" ? `صفحه ${page + 1} از ${totalPages}` : `Page ${page + 1} of ${totalPages}`, { reply_markup: kb })
      .catch(() => null);
  }
}

// ─── Exported helpers for start.ts ────────────────────────────────────────────
export { buildProLink, getProUnreadCount };
