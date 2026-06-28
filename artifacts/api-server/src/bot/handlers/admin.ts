import { Bot, Keyboard } from "grammy";
import type { BotContext } from "../context.js";
import {
  getUserByTelegramId,
  searchUser,
  getTotalStats,
  getReferralTree,
} from "../services/user.service.js";
import { addCoins, deductCoins } from "../services/coin.service.js";
import {
  createGiftCode,
  listGiftCodes,
  deactivateGiftCode,
  getTopReferrers,
} from "../services/gift.service.js";
import {
  banUser,
  unbanUser,
  isOwner,
  addBadWord,
  getPendingReportsCount,
  getPendingReports,
  dismissReport,
  markReportReviewed,
} from "../services/safety.service.js";
import { invalidateForceJoinCache } from "../middleware/force-join.js";
import { broadcastMessage } from "../services/broadcast.service.js";
import {
  generateVerificationCode,
  setBackupSchedule,
  sendBackup,
  verifyBackupGroup,
  getBackupConfig,
} from "../services/backup.service.js";
import { setSetting, getSetting } from "../services/payment.service.js";
import { getTetraPayCallbackUrl } from "../../lib/base-url.js";
import { getTotalChats } from "../services/matching.service.js";
import { db } from "@workspace/db";
import { adminPermissionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { t } from "../i18n/index.js";
import { adminUserActionsKeyboard } from "../keyboards/inline.js";
import { mainMenuKeyboard } from "../keyboards/main.js";

// ─── Admin identity & permissions ─────────────────────────────────────────────

const SUPER_ADMIN_IDS = new Set<number>();
const SUB_ADMIN_IDS = new Map<number, "admin" | "moderator">();

export function setAdminIds(ids: number[]): void {
  ids.forEach((id) => SUPER_ADMIN_IDS.add(id));
}

async function loadSubAdmins(): Promise<void> {
  try {
    const rows = await db.select().from(adminPermissionsTable);
    SUB_ADMIN_IDS.clear();
    for (const row of rows) {
      SUB_ADMIN_IDS.set(Number(row.telegramId), row.level as "admin" | "moderator");
    }
  } catch {
    // Table may not exist before migration — safe to ignore
  }
}

export function isAdmin(userId: number): boolean {
  return SUPER_ADMIN_IDS.has(userId) || SUB_ADMIN_IDS.has(userId);
}

function isSuperAdmin(userId: number): boolean {
  return SUPER_ADMIN_IDS.has(userId);
}

function canDo(userId: number, action: string): boolean {
  if (SUPER_ADMIN_IDS.has(userId)) return true;
  const level = SUB_ADMIN_IDS.get(userId);
  if (!level) return false;
  if (level === "admin") return action !== "manage_admins";
  if (level === "moderator") return ["search_user", "ban_user", "reports"].includes(action);
  return false;
}

// ─── Persistent Admin Keyboards ───────────────────────────────────────────────

export const ADMIN_BTN = {
  USERS:       "👤 کاربران",
  REPORTS:     "🚨 گزارش‌ها",
  PAYMENT:     "💳 روش‌های پرداخت",
  COSTS:       "💰 هزینه‌های سیستم",
  SYSTEM:      "⚙️ تنظیمات سیستم",
  MAGIC:       "🔮 دنیای اسرار",
  REFERRAL:    "🎁 رفرال و جوایز",
  TOP_REF:     "🏆 برترین رفرال‌ها",
  EXIT:        "🔙 خروج از پنل ادمین",
  // Costs sub-menu
  COST_MATCH:     "🎭 اتصال ناشناس",
  COST_GROUP:     "👥 گروه ناشناس",
  COST_PRO_LINK:  "💎 لینک پرو",
  COST_TIMED:     "🔗 لینک مدت‌دار",
  COST_MAGIC:     "🔮 دنیای اسرار",
  // System sub-menu
  WELCOME:     "📝 خوش‌آمدگویی",
  BROADCAST:   "📣 پیام همگانی",
  GIFTS:       "🎟️ کدهای هدیه",
  BADWORDS:    "🔤 کلمات ناپسند",
  BACKUP:      "💾 بکاپ",
  FORCE_JOIN:  "📢 فورس جوین",
  ADMINS:      "👥 مدیریت ادمین‌ها",
  // Payment sub-menu
  CARD:        "💳 کارت بانکی",
  CRYPTO:      "₿ ارز دیجیتال",
  TETRAPAY:    "🔷 TetraPay",
  // Sub-menu back
  BACK_PANEL:  "🔙 پنل ادمین",
} as const;

function adminMainKeyboard(tgId: number): Keyboard {
  const kb = new Keyboard();

  if (canDo(tgId, "search_user")) {
    kb.text(ADMIN_BTN.USERS).text(ADMIN_BTN.REPORTS).row();
  } else {
    kb.text(ADMIN_BTN.REPORTS).row();
  }
  if (canDo(tgId, "payment")) {
    kb.text(ADMIN_BTN.PAYMENT).text(ADMIN_BTN.COSTS).row();
    kb.text(ADMIN_BTN.SYSTEM).row();
    kb.text(ADMIN_BTN.REFERRAL).text(ADMIN_BTN.TOP_REF).row();
  }
  kb.text(ADMIN_BTN.EXIT);
  return kb.resized().persistent();
}

function adminSystemKeyboard(tgId: number): Keyboard {
  const kb = new Keyboard();
  if (canDo(tgId, "welcome_msg")) kb.text(ADMIN_BTN.WELCOME);
  if (canDo(tgId, "broadcast")) kb.text(ADMIN_BTN.BROADCAST);
  kb.row();
  if (canDo(tgId, "payment")) kb.text(ADMIN_BTN.GIFTS);
  if (canDo(tgId, "badwords")) kb.text(ADMIN_BTN.BADWORDS);
  kb.row();
  if (canDo(tgId, "backup")) kb.text(ADMIN_BTN.BACKUP);
  if (isSuperAdmin(tgId)) kb.text(ADMIN_BTN.FORCE_JOIN);
  kb.row();
  if (isSuperAdmin(tgId)) kb.text(ADMIN_BTN.ADMINS).row();
  kb.text(ADMIN_BTN.BACK_PANEL);
  return kb.resized().persistent();
}

function adminPaymentKeyboard(): Keyboard {
  return new Keyboard()
    .text(ADMIN_BTN.CARD).text(ADMIN_BTN.CRYPTO).row()
    .text(ADMIN_BTN.TETRAPAY).row()
    .text(ADMIN_BTN.BACK_PANEL)
    .resized().persistent();
}

function adminCostsKeyboard(): Keyboard {
  return new Keyboard()
    .text(ADMIN_BTN.COST_MATCH).row()
    .text(ADMIN_BTN.COST_GROUP).row()
    .text(ADMIN_BTN.COST_PRO_LINK).text(ADMIN_BTN.COST_TIMED).row()
    .text(ADMIN_BTN.COST_MAGIC).row()
    .text(ADMIN_BTN.BACK_PANEL)
    .resized().persistent();
}

// ─── Stats + main panel display ───────────────────────────────────────────────

async function showAdminPanel(ctx: BotContext): Promise<void> {
  const tgId = ctx.from!.id;
  ctx.session.adminMode = "main";
  ctx.session.adminAction = undefined;

  const [stats, totalChats, pendingReports] = await Promise.all([
    getTotalStats(),
    getTotalChats(),
    getPendingReportsCount(),
  ]);

  const msg =
    `🛡️ *پنل مدیریت ربات*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `👥 کاربران: \`${stats.totalUsers}\`  |  💬 چت‌ها: \`${totalChats}\`\n` +
    `🚨 گزارش‌های در انتظار: \`${pendingReports}\`\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `_یکی از بخش‌ها را از منوی پایین انتخاب کنید._`;

  await ctx.reply(msg, {
    parse_mode: "Markdown",
    reply_markup: adminMainKeyboard(tgId),
  });
}

// ─── Register handlers ─────────────────────────────────────────────────────────

export function registerAdminHandlers(bot: Bot<BotContext>): void {
  loadSubAdmins().catch(() => {});

  // ── /admin command ────────────────────────────────────────────────────────────
  bot.command("admin", async (ctx) => {
    if (!isAdmin(ctx.from!.id)) return;
    await showAdminPanel(ctx);
  });

  // ── 🔙 خروج از پنل ادمین ─────────────────────────────────────────────────────
  bot.hears(ADMIN_BTN.EXIT, async (ctx, next) => {
    if (!isAdmin(ctx.from!.id) || !ctx.session.adminMode) return next();
    ctx.session.adminMode = undefined;
    ctx.session.adminAction = undefined;
    const user = await getUserByTelegramId(ctx.from!.id);
    const lang = (user?.language as "fa" | "en") ?? "fa";
    await ctx.reply("🏠 به منوی اصلی برگشتید.", { reply_markup: mainMenuKeyboard(lang) });
  });

  // ── 🔙 پنل ادمین (از زیرمنوها) ──────────────────────────────────────────────
  bot.hears(ADMIN_BTN.BACK_PANEL, async (ctx, next) => {
    if (!isAdmin(ctx.from!.id) || !ctx.session.adminMode) return next();
    ctx.session.adminAction = undefined;
    await showAdminPanel(ctx);
  });

  // ── 👤 کاربران ────────────────────────────────────────────────────────────────
  bot.hears(ADMIN_BTN.USERS, async (ctx, next) => {
    if (!isAdmin(ctx.from!.id) || !ctx.session.adminMode) return next();
    if (!canDo(ctx.from!.id, "search_user")) {
      await ctx.reply("❌ دسترسی ندارید.");
      return;
    }
    ctx.session.adminAction = "search_user";
    await ctx.reply(
      "🔍 *جستجو کاربر*\n\nآیدی عددی تلگرام کاربر را وارد کنید:",
      { parse_mode: "Markdown" }
    );
  });

  // ── 🚨 گزارش‌ها ───────────────────────────────────────────────────────────────
  bot.hears(ADMIN_BTN.REPORTS, async (ctx, next) => {
    if (!isAdmin(ctx.from!.id) || !ctx.session.adminMode) return next();
    await showReports(ctx);
  });

  // ── 💳 روش‌های پرداخت ────────────────────────────────────────────────────────
  bot.hears(ADMIN_BTN.PAYMENT, async (ctx, next) => {
    if (!isAdmin(ctx.from!.id) || !ctx.session.adminMode) return next();
    if (!canDo(ctx.from!.id, "payment")) { await ctx.reply("❌ دسترسی ندارید."); return; }
    ctx.session.adminMode = "payment";
    ctx.session.adminAction = undefined;
    await showPaymentSection(ctx);
  });

  // ── 💰 هزینه‌های سیستم ───────────────────────────────────────────────────────
  bot.hears(ADMIN_BTN.COSTS, async (ctx, next) => {
    if (!isAdmin(ctx.from!.id) || !ctx.session.adminMode) return next();
    if (!canDo(ctx.from!.id, "payment")) { await ctx.reply("❌ دسترسی ندارید."); return; }
    ctx.session.adminMode = "costs";
    ctx.session.adminAction = undefined;
    await ctx.reply(
      "💰 *هزینه‌های سیستم*\n\nیک بخش را انتخاب کنید:",
      { parse_mode: "Markdown", reply_markup: adminCostsKeyboard() }
    );
  });

  // ── 🎭 اتصال ناشناس (costs sub) ─────────────────────────────────────────────
  bot.hears(ADMIN_BTN.COST_MATCH, async (ctx, next) => {
    if (!isAdmin(ctx.from!.id) || ctx.session.adminMode !== "costs") return next();
    if (!canDo(ctx.from!.id, "payment")) { await ctx.reply("❌ دسترسی ندارید."); return; }
    const [freeDailyStr, costGenderStr, costAnyStr] = await Promise.all([
      getSetting("match_free_daily"),
      getSetting("match_cost_gender"),
      getSetting("match_cost_any"),
    ]);
    const freeDailyVal = freeDailyStr ?? "3";
    const costGenderVal = costGenderStr ?? "1";
    const costAnyVal = costAnyStr ?? "1";
    await ctx.reply(
      `🎭 *اتصال ناشناس — هزینه‌ها*\n\n` +
      `• اتصال شانسی رایگان روزانه: \`${freeDailyVal}\` بار\n` +
      `• هزینه اتصال به جنسیت خاص: \`${costGenderVal}\` سکه\n` +
      `• هزینه اتصال شانسی (بعد از رایگان): \`${costAnyVal}\` سکه\n\n` +
      `_روی دکمه مورد نظر برای تغییر کلیک کنید._`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: `🎲 اتصال رایگان روزانه: ${freeDailyVal}`, callback_data: "pay_set:match_free_daily" }],
            [{ text: `👧 هزینه جنسیت خاص: ${costGenderVal} سکه`, callback_data: "pay_set:match_cost_gender" }],
            [{ text: `🎲 هزینه شانسی (بعد رایگان): ${costAnyVal} سکه`, callback_data: "pay_set:match_cost_any" }],
          ],
        },
      }
    );
  });

  // ── 👥 گروه ناشناس (costs sub) ───────────────────────────────────────────────
  bot.hears(ADMIN_BTN.COST_GROUP, async (ctx, next) => {
    if (!isAdmin(ctx.from!.id) || ctx.session.adminMode !== "costs") return next();
    if (!canDo(ctx.from!.id, "payment")) { await ctx.reply("❌ دسترسی ندارید."); return; }
    const [groupCreate, groupJoin, groupExpand, groupAdminPromote, groupExpandAdmin] = await Promise.all([
      getSetting("group_create_cost"),
      getSetting("group_join_cost"),
      getSetting("group_slot_expand_cost"),
      getSetting("group_admin_promote_cost"),
      getSetting("group_expand_cost"),
    ]);
    const s = (v: string | null | undefined, d = "0") => `${v ?? d}`;
    await ctx.reply(
      `👥 *گروه ناشناس — هزینه‌ها*\n\n` +
      `• ساخت گروه: \`${s(groupCreate, "3")}\` سکه\n` +
      `• پیوستن به گروه: \`${s(groupJoin, "1")}\` سکه\n` +
      `• افزایش ظرفیت عضویت: \`${s(groupExpand, "30")}\` سکه\n` +
      `• ارتقا عضو به ادمین: \`${s(groupAdminPromote, "5")}\` سکه\n` +
      `• افزایش ظرفیت گروه به ۲۵ نفر: \`${s(groupExpandAdmin, "10")}\` سکه\n\n` +
      `_روی دکمه مورد نظر برای تغییر کلیک کنید._`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: `🆕 ساخت: ${s(groupCreate, "3")} سکه`, callback_data: "pay_set:group_create_cost" },
              { text: `👥 پیوستن: ${s(groupJoin, "1")} سکه`, callback_data: "pay_set:group_join_cost" },
            ],
            [
              { text: `📈 ظرفیت عضویت: ${s(groupExpand, "30")} سکه`, callback_data: "pay_set:group_slot_expand_cost" },
              { text: `⭐ ارتقا ادمین: ${s(groupAdminPromote, "5")} سکه`, callback_data: "pay_set:group_admin_promote_cost" },
            ],
            [{ text: `⬆️ افزایش به ۲۵ نفر: ${s(groupExpandAdmin, "10")} سکه`, callback_data: "pay_set:group_expand_cost" }],
          ],
        },
      }
    );
  });

  // ── 💎 لینک پرو (costs sub) ──────────────────────────────────────────────────
  bot.hears(ADMIN_BTN.COST_PRO_LINK, async (ctx, next) => {
    if (!isAdmin(ctx.from!.id) || ctx.session.adminMode !== "costs") return next();
    if (!canDo(ctx.from!.id, "payment")) { await ctx.reply("❌ دسترسی ندارید."); return; }
    const permLink = await getSetting("perm_anon_link_cost");
    const v = permLink ?? "10";
    await ctx.reply(
      `💎 *لینک ناشناس پرو — هزینه*\n\n• لینک پرو دائمی: \`${v}\` سکه\n\n_این لینک یک‌بار خریداری می‌شود._`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: `💎 تغییر هزینه لینک پرو: ${v} سکه`, callback_data: "pay_set:perm_anon_link_cost" }],
          ],
        },
      }
    );
  });

  // ── 🔗 لینک مدت‌دار (costs sub) ─────────────────────────────────────────────
  bot.hears(ADMIN_BTN.COST_TIMED, async (ctx, next) => {
    if (!isAdmin(ctx.from!.id) || ctx.session.adminMode !== "costs") return next();
    if (!canDo(ctx.from!.id, "payment")) { await ctx.reply("❌ دسترسی ندارید."); return; }
    const timedLink = await getSetting("timed_anon_link_cost");
    const v = timedLink ?? "3";
    await ctx.reply(
      `🔗 *لینک ناشناس مدت‌دار — هزینه*\n\n• هزینه ساخت هر لینک مدت‌دار: \`${v}\` سکه\n\n_مدت‌های موجود: ۱ ساعت | ۶ ساعت | ۲۴ ساعت | ۷ روز_`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: `⏱️ تغییر هزینه لینک مدت‌دار: ${v} سکه`, callback_data: "pay_set:timed_anon_link_cost" }],
          ],
        },
      }
    );
  });

  // ── ⚙️ تنظیمات سیستم ─────────────────────────────────────────────────────────
  bot.hears(ADMIN_BTN.SYSTEM, async (ctx, next) => {
    if (!isAdmin(ctx.from!.id) || !ctx.session.adminMode) return next();
    ctx.session.adminMode = "system";
    ctx.session.adminAction = undefined;
    await ctx.reply(
      "⚙️ *تنظیمات سیستم*\n\nیکی از بخش‌ها را انتخاب کنید:",
      { parse_mode: "Markdown", reply_markup: adminSystemKeyboard(ctx.from!.id) }
    );
  });

  // ── 🔮 دنیای اسرار ───────────────────────────────────────────────────────────
  bot.hears(ADMIN_BTN.MAGIC, async (ctx, next) => {
    if (!isAdmin(ctx.from!.id) || !ctx.session.adminMode) return next();
    if (!canDo(ctx.from!.id, "payment")) { await ctx.reply("❌ دسترسی ندارید."); return; }
    await showMagicSection(ctx);
  });

  // ── 🎁 رفرال و جوایز ─────────────────────────────────────────────────────────
  bot.hears(ADMIN_BTN.REFERRAL, async (ctx, next) => {
    if (!isAdmin(ctx.from!.id) || !ctx.session.adminMode) return next();
    if (!canDo(ctx.from!.id, "payment")) { await ctx.reply("❌ دسترسی ندارید."); return; }
    await showReferralSection(ctx);
  });

  // ── 🏆 برترین رفرال‌ها ────────────────────────────────────────────────────────
  bot.hears(ADMIN_BTN.TOP_REF, async (ctx, next) => {
    if (!isAdmin(ctx.from!.id) || !ctx.session.adminMode) return next();
    if (!canDo(ctx.from!.id, "payment")) { await ctx.reply("❌ دسترسی ندارید."); return; }
    await showTopReferrers(ctx);
  });

  // ── ⚙️ System sub-menu handlers ──────────────────────────────────────────────

  bot.hears(ADMIN_BTN.WELCOME, async (ctx, next) => {
    if (!isAdmin(ctx.from!.id) || ctx.session.adminMode !== "system") return next();
    if (!canDo(ctx.from!.id, "welcome_msg")) { await ctx.reply("❌ دسترسی ندارید."); return; }
    const current = await getSetting("welcome_message");
    const msgText = current ? t("fa").currentWelcomeMsg(current) : t("fa").noWelcomeMsg;
    await ctx.reply(msgText, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "✏️ تغییر پیام", callback_data: "admin:set_welcome" }],
          ...(current ? [[{ text: "🗑️ پاک کردن", callback_data: "admin:clear_welcome" }]] : []),
        ],
      },
    });
  });

  bot.hears(ADMIN_BTN.BROADCAST, async (ctx, next) => {
    if (!isAdmin(ctx.from!.id) || ctx.session.adminMode !== "system") return next();
    if (!canDo(ctx.from!.id, "broadcast")) { await ctx.reply("❌ دسترسی ندارید."); return; }
    await ctx.reply(
      "📣 *پیام همگانی*\n\nهدف ارسال را انتخاب کنید:",
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "👥 همه کاربران",  callback_data: "bc_target:all" },
              { text: "🟢 کاربران فعال", callback_data: "bc_target:active" },
            ],
          ],
        },
      }
    );
  });

  bot.hears(ADMIN_BTN.GIFTS, async (ctx, next) => {
    if (!isAdmin(ctx.from!.id) || ctx.session.adminMode !== "system") return next();
    if (!canDo(ctx.from!.id, "payment")) { await ctx.reply("❌ دسترسی ندارید."); return; }
    await showGiftsSection(ctx);
  });

  bot.hears(ADMIN_BTN.BADWORDS, async (ctx, next) => {
    if (!isAdmin(ctx.from!.id) || ctx.session.adminMode !== "system") return next();
    if (!canDo(ctx.from!.id, "badwords")) { await ctx.reply("❌ دسترسی ندارید."); return; }
    ctx.session.adminAction = "add_badword";
    await ctx.reply(
      "🔤 *کلمات ناپسند*\n\nکلمه‌ای که می‌خواهید فیلتر شود را وارد کنید:",
      { parse_mode: "Markdown" }
    );
  });

  bot.hears(ADMIN_BTN.BACKUP, async (ctx, next) => {
    if (!isAdmin(ctx.from!.id) || ctx.session.adminMode !== "system") return next();
    if (!canDo(ctx.from!.id, "backup")) { await ctx.reply("❌ دسترسی ندارید."); return; }
    await showBackupSection(ctx);
  });

  bot.hears(ADMIN_BTN.FORCE_JOIN, async (ctx, next) => {
    if (!isAdmin(ctx.from!.id) || ctx.session.adminMode !== "system") return next();
    if (!isSuperAdmin(ctx.from!.id)) { await ctx.reply("❌ دسترسی ندارید."); return; }
    await showForceJoinSection(ctx);
  });

  bot.hears(ADMIN_BTN.ADMINS, async (ctx, next) => {
    if (!isAdmin(ctx.from!.id) || ctx.session.adminMode !== "system") return next();
    if (!isSuperAdmin(ctx.from!.id)) { await ctx.reply("❌ دسترسی ندارید."); return; }
    await showManageAdmins(ctx);
  });

  // ── 💳 Payment sub-menu handlers ─────────────────────────────────────────────

  bot.hears(ADMIN_BTN.CARD, async (ctx, next) => {
    if (!isAdmin(ctx.from!.id) || ctx.session.adminMode !== "payment") return next();
    if (!canDo(ctx.from!.id, "payment")) { await ctx.reply("❌"); return; }
    const cardNo      = await getSetting("card_number") ?? "تنظیم نشده";
    const reviewGroup = await getSetting("payment_review_group") ?? "تنظیم نشده";
    const cardEnabled = (await getSetting("payment_method_card") ?? "enabled") !== "disabled";
    await ctx.reply(
      `💳 *کارت بانکی*\n\n` +
      `وضعیت: ${cardEnabled ? "✅ فعال" : "❌ غیرفعال"}\n` +
      `شماره کارت: \`${cardNo}\`\n` +
      `گروه بررسی: \`${reviewGroup}\``,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "✏️ شماره کارت",       callback_data: "pay_set:card_number" }],
            [{ text: "✏️ گروه بررسی پرداخت", callback_data: "pay_set:payment_review_group" }],
            [{ text: cardEnabled ? "❌ غیرفعال کردن کارت" : "✅ فعال کردن کارت", callback_data: "pay_toggle:card" }],
          ],
        },
      }
    );
  });

  bot.hears(ADMIN_BTN.CRYPTO, async (ctx, next) => {
    if (!isAdmin(ctx.from!.id) || ctx.session.adminMode !== "payment") return next();
    if (!canDo(ctx.from!.id, "payment")) { await ctx.reply("❌"); return; }
    const wallet        = await getSetting("crypto_wallet") ?? "تنظیم نشده";
    const cryptoEnabled = (await getSetting("payment_method_crypto") ?? "enabled") !== "disabled";
    await ctx.reply(
      `₿ *ارز دیجیتال*\n\n` +
      `وضعیت: ${cryptoEnabled ? "✅ فعال" : "❌ غیرفعال"}\n` +
      `آدرس کیف پول: \`${wallet}\``,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "✏️ آدرس کیف پول",      callback_data: "pay_set:crypto_wallet" }],
            [{ text: cryptoEnabled ? "❌ غیرفعال کردن کریپتو" : "✅ فعال کردن کریپتو", callback_data: "pay_toggle:crypto" }],
          ],
        },
      }
    );
  });

  bot.hears(ADMIN_BTN.TETRAPAY, async (ctx, next) => {
    if (!isAdmin(ctx.from!.id) || ctx.session.adminMode !== "payment") return next();
    if (!canDo(ctx.from!.id, "payment")) { await ctx.reply("❌"); return; }
    const apiKey    = await getSetting("tetrapay_api_key");
    const cbUrl     = await getSetting("tetrapay_callback_url");
    const gwEnabled = (await getSetting("payment_method_gateway") ?? "enabled") !== "disabled";
    await ctx.reply(
      t("fa").tetraPayStatus(!!apiKey, cbUrl ?? null) +
      `\n\nوضعیت درگاه: ${gwEnabled ? "✅ فعال" : "❌ غیرفعال"}`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: t("fa").setApiKey,             callback_data: "pay_set:tetrapay_api_key" }],
            [{ text: t("fa").autoDetectCallbackUrl, callback_data: "tetrapay:auto_url" }],
            [{ text: t("fa").setCallbackUrl,        callback_data: "pay_set:tetrapay_callback_url" }],
            [{ text: gwEnabled ? "❌ غیرفعال کردن درگاه" : "✅ فعال کردن درگاه", callback_data: "pay_toggle:gateway" }],
          ],
        },
      }
    );
  });

  // ── Callback: admin:panel — legacy support (from inline back buttons) ─────────
  bot.callbackQuery("admin:panel", async (ctx) => {
    if (!isAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery("❌"); return; }
    await ctx.answerCallbackQuery();
    await showAdminPanel(ctx);
  });

  // ── Callbacks: report review ──────────────────────────────────────────────────
  bot.callbackQuery(/^admin_review:dismiss:(\d+)$/, async (ctx) => {
    if (!canDo(ctx.from!.id, "reports") && !canDo(ctx.from!.id, "search_user")) {
      await ctx.answerCallbackQuery("❌"); return;
    }
    const reportId = parseInt(ctx.match![1], 10);
    await dismissReport(reportId, ctx.from!.id);
    await ctx.answerCallbackQuery("✅ گزارش رد شد");
    await ctx.reply(`✅ گزارش #${reportId} رد شد.`);
  });

  bot.callbackQuery(/^admin_review:ban:(\d+):(\d+)$/, async (ctx) => {
    if (!canDo(ctx.from!.id, "ban_user")) { await ctx.answerCallbackQuery("❌"); return; }
    const reportedId = parseInt(ctx.match![1], 10);
    const reportId   = parseInt(ctx.match![2], 10);
    if (isOwner(reportedId)) { await ctx.answerCallbackQuery(t("fa").adminCannotBanOwner); return; }
    const result = await banUser(reportedId, ctx.from!.id);
    if (!result.success) { await ctx.answerCallbackQuery(`❌ ${result.reason ?? "Cannot ban"}`); return; }
    await markReportReviewed(reportId, ctx.from!.id);
    await bot.api.sendMessage(reportedId, t("fa").userBanned).catch(() => {});
    await ctx.answerCallbackQuery("🚫 کاربر بن شد");
    await ctx.reply(`🚫 کاربر \`${reportedId}\` بن شد و گزارش #${reportId} بررسی شد.`, { parse_mode: "Markdown" });
  });

  // ── Callback: welcome ─────────────────────────────────────────────────────────
  bot.callbackQuery("admin:set_welcome", async (ctx) => {
    if (!canDo(ctx.from!.id, "welcome_msg")) { await ctx.answerCallbackQuery("❌"); return; }
    ctx.session.adminAction = "set_welcome_message";
    await ctx.reply(t("fa").setWelcomeMsgPrompt);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("admin:clear_welcome", async (ctx) => {
    if (!canDo(ctx.from!.id, "welcome_msg")) { await ctx.answerCallbackQuery("❌"); return; }
    await setSetting("welcome_message", "");
    await ctx.reply(t("fa").welcomeMsgCleared);
    await ctx.answerCallbackQuery("✅");
  });

  // ── Callback: broadcast target ────────────────────────────────────────────────
  bot.callbackQuery(/^bc_target:(all|active)$/, async (ctx) => {
    if (!canDo(ctx.from!.id, "broadcast")) { await ctx.answerCallbackQuery("❌"); return; }
    const target = ctx.match![1] as "all" | "active";
    ctx.session.adminAction = `broadcast:${target}`;
    await ctx.reply(
      `✅ هدف: ${target === "all" ? "همه کاربران" : "کاربران فعال"}\n\nمتن پیام همگانی را بنویسید:`
    );
    await ctx.answerCallbackQuery();
  });

  // ── Callback: pay_set / pay_toggle / tetrapay ─────────────────────────────────
  bot.callbackQuery(/^pay_set:(.+)$/, async (ctx) => {
    if (!canDo(ctx.from!.id, "payment")) { await ctx.answerCallbackQuery("❌"); return; }
    const key = ctx.match![1];
    ctx.session.adminAction = `set_setting:${key}`;
    const labels: Record<string, string> = {
      card_number:              "شماره کارت بانکی",
      crypto_wallet:            "آدرس کیف پول ارز دیجیتال",
      payment_review_group:     "آیدی گروه بررسی پرداخت",
      group_create_cost:        "هزینه ساخت گروه (سکه)",
      group_join_cost:          "هزینه پیوستن به گروه (سکه)",
      group_slot_expand_cost:   "هزینه افزایش ظرفیت گروه (سکه)",
      group_admin_promote_cost: "هزینه ارتقا ادمین گروه (سکه)",
      group_expand_cost:        "هزینه افزایش ظرفیت ادمین (سکه)",
      perm_anon_link_cost:      "هزینه لینک ناشناس دائمی (سکه)",
      timed_anon_link_cost:     "هزینه لینک ناشناس موقت (سکه)",
      magic_bottle_cost:        "هزینه بطری پیام (سکه)",
      magic_chain_cost:         "هزینه زنجیر احساس (سکه)",
      magic_letter_cost:        "هزینه نامه به آینده (سکه)",
      magic_frequency_cost:     "هزینه فرکانس ناشناس (سکه)",
      signup_bonus:             "سکه خوش‌آمدگویی ثبت‌نام (سکه)",
      referral_reward_inviter:  "پاداش دعوت‌کننده (سکه)",
      referral_reward_invitee:  "پاداش دعوت‌شده (سکه)",
      support_link:             "لینک پشتیبانی (@username یا t.me/...)",
      tetrapay_api_key:         "کلید API تتراپی",
      tetrapay_callback_url:    "آدرس Callback تتراپی",
    };
    await ctx.reply(`✏️ مقدار جدید *${labels[key] ?? key}* را وارد کنید:`, { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^pay_toggle:(card|crypto|gateway)$/, async (ctx) => {
    if (!canDo(ctx.from!.id, "payment")) { await ctx.answerCallbackQuery("❌"); return; }
    const method  = ctx.match![1];
    const key     = `payment_method_${method}`;
    const current = await getSetting(key);
    const newVal  = current === "disabled" ? "enabled" : "disabled";
    await setSetting(key, newVal);
    const label = method === "card" ? "کارت" : method === "crypto" ? "کریپتو" : "درگاه";
    await ctx.reply(`${newVal === "enabled" ? "✅ فعال" : "❌ غیرفعال"} شد: ${label}`);
    await ctx.answerCallbackQuery("✅");
  });

  bot.callbackQuery("tetrapay:auto_url", async (ctx) => {
    if (!canDo(ctx.from!.id, "payment")) { await ctx.answerCallbackQuery("❌"); return; }
    const url = getTetraPayCallbackUrl();
    await setSetting("tetrapay_callback_url", url);
    await ctx.answerCallbackQuery("✅ URL تنظیم شد");
    await ctx.reply(t("fa").callbackUrlAutoSet(url), { parse_mode: "Markdown" });
  });

  // ── Callback: costs section editing (inline for each cost item) ───────────────
  // (costs section shows inline edit buttons — action only, no navigation)

  // ── Callback: magic config ────────────────────────────────────────────────────
  const MAGIC_NAMES: Record<string, string> = {
    bottle:    "🍾 پیام در بطری",
    chain:     "🔗 زنجیر احساس",
    letter:    "✉️ نامه به آینده",
    frequency: "📡 فرکانس ناشناس",
  };

  bot.callbackQuery(/^magic_cfg:(.+)$/, async (ctx) => {
    if (!canDo(ctx.from!.id, "payment")) { await ctx.answerCallbackQuery("❌"); return; }
    const feature = ctx.match[1]!;
    const [en, co, da] = await Promise.all([
      getSetting(`magic_${feature}_enabled`),
      getSetting(`magic_${feature}_cost`),
      getSetting(`magic_${feature}_daily`),
    ]);
    const enabled = (en ?? "true") !== "false";
    const cost    = parseInt(co ?? "2", 10);
    const daily   = parseInt(da ?? "3", 10);
    const name    = MAGIC_NAMES[feature] ?? feature;
    await ctx.reply(
      t("fa").adminMagicFeaturePanel(name, enabled, cost, daily),
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: enabled ? "❌ غیرفعال کردن" : "✅ فعال کردن", callback_data: `magic_toggle:${feature}` }],
            [{ text: "💰 تغییر هزینه سکه",      callback_data: `magic_set:cost:${feature}` }],
            [{ text: "📅 تغییر محدودیت روزانه",  callback_data: `magic_set:daily:${feature}` }],
          ],
        },
      }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^magic_toggle:(.+)$/, async (ctx) => {
    if (!canDo(ctx.from!.id, "payment")) { await ctx.answerCallbackQuery("❌"); return; }
    const feature = ctx.match[1]!;
    const current = (await getSetting(`magic_${feature}_enabled`) ?? "true") !== "false";
    await setSetting(`magic_${feature}_enabled`, current ? "false" : "true");
    await ctx.answerCallbackQuery(current ? "❌ غیرفعال شد" : "✅ فعال شد");
    await ctx.reply(`${current ? "❌ غیرفعال" : "✅ فعال"} شد: ${MAGIC_NAMES[feature] ?? feature}`);
  });

  bot.callbackQuery(/^magic_set:(cost|daily):(.+)$/, async (ctx) => {
    if (!canDo(ctx.from!.id, "payment")) { await ctx.answerCallbackQuery("❌"); return; }
    const type    = ctx.match[1]!;
    const feature = ctx.match[2]!;
    const label   = type === "cost" ? "هزینه سکه (عدد)" : "محدودیت روزانه (عدد)";
    ctx.session.adminAction = `set_setting:magic_${feature}_${type}`;
    await ctx.reply(`🔢 مقدار جدید *${label}* برای ${MAGIC_NAMES[feature] ?? feature} را وارد کنید:`, { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
  });

  // ── Callback: gifts ───────────────────────────────────────────────────────────
  bot.callbackQuery("admin:create_gift", async (ctx) => {
    if (!canDo(ctx.from!.id, "payment")) { await ctx.answerCallbackQuery("❌"); return; }
    ctx.session.adminAction    = "gift_create_coins";
    ctx.session.adminGiftCoins = undefined;
    await ctx.reply(
      "🎟️ *ساخت کد هدیه جدید*\n\n*مرحله ۱/۲:* تعداد سکه کد را وارد کنید:",
      { parse_mode: "Markdown" }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^admin:gift_off:(\d+)$/, async (ctx) => {
    if (!canDo(ctx.from!.id, "payment")) { await ctx.answerCallbackQuery("❌"); return; }
    const codeId = parseInt(ctx.match![1], 10);
    await deactivateGiftCode(codeId);
    await ctx.reply("🚫 کد هدیه غیرفعال شد.");
    await ctx.answerCallbackQuery("✅");
  });

  // ── Callback: referral section ────────────────────────────────────────────────
  bot.callbackQuery("admin:add_sub_admin", async (ctx) => {
    if (!isSuperAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery("❌"); return; }
    ctx.session.adminAction = "add_sub_admin";
    await ctx.reply(t("fa").enterAdminId);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^admin_perm_level:(\d+):(admin|moderator)$/, async (ctx) => {
    if (!isSuperAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery("❌"); return; }
    const uid   = parseInt(ctx.match![1], 10);
    const level = ctx.match![2] as "admin" | "moderator";
    if (SUPER_ADMIN_IDS.has(uid)) {
      await ctx.editMessageText("⚠️ این کاربر سوپر ادمین است.");
      await ctx.answerCallbackQuery(); return;
    }
    try {
      await db.insert(adminPermissionsTable).values({
        telegramId: uid, level, addedBy: ctx.from!.id, createdAt: new Date(),
      }).onConflictDoNothing();
      SUB_ADMIN_IDS.set(uid, level);
      const levelLabel = level === "admin" ? t("fa").adminLevelAdmin : t("fa").adminLevelModerator;
      await ctx.editMessageText(t("fa").adminAdded(uid, levelLabel));
    } catch {
      await ctx.editMessageText("❌ خطا در اضافه کردن ادمین.");
    }
    await ctx.answerCallbackQuery("✅");
  });

  bot.callbackQuery(/^admin_perm_remove:(\d+)$/, async (ctx) => {
    if (!isSuperAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery("❌"); return; }
    const uid = parseInt(ctx.match![1], 10);
    await db.delete(adminPermissionsTable).where(eq(adminPermissionsTable.telegramId, uid)).catch(() => {});
    SUB_ADMIN_IDS.delete(uid);
    await ctx.reply(t("fa").adminRemoved(uid));
    await ctx.answerCallbackQuery("✅");
  });

  // ── Callback: backup sub-actions ─────────────────────────────────────────────
  bot.callbackQuery("backup:gencode", async (ctx) => {
    if (!isAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery(); return; }
    const code = await generateVerificationCode();
    await ctx.reply(
      `🔑 *کد تأیید بکاپ:*\n\n\`${code}\`\n\nربات را به گروه مورد نظر اضافه کنید و این دستور را بفرستید:\n\`/verify_backup ${code}\``,
      { parse_mode: "Markdown" }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("backup:send", async (ctx) => {
    if (!isAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery(); return; }
    await ctx.answerCallbackQuery("در حال ارسال...");
    const success = await sendBackup(bot);
    await ctx.reply(success ? t("fa").backupSent : t("fa").backupFailed);
  });

  bot.callbackQuery("backup:schedule", async (ctx) => {
    if (!isAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery(); return; }
    ctx.session.adminAction = "set_backup_schedule";
    await ctx.reply("⏱️ فاصله بکاپ را به ساعت وارد کنید (مثلاً ۲۴):");
    await ctx.answerCallbackQuery();
  });

  bot.command("verify_backup", async (ctx) => {
    const code = ctx.match?.trim();
    if (!code) return;
    const verified = await verifyBackupGroup(ctx.chat.id, code);
    await ctx.reply(verified ? "✅ گروه بکاپ با موفقیت تأیید شد!" : "❌ کد نادرست است.");
  });

  // ── Callback: force join sub-actions ─────────────────────────────────────────
  bot.callbackQuery("fj:toggle", async (ctx) => {
    if (!isSuperAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery("❌"); return; }
    const current = (await getSetting("force_join_enabled")) === "true";
    await setSetting("force_join_enabled", current ? "false" : "true");
    invalidateForceJoinCache();
    await ctx.reply(current ? t("fa").forceJoinDisabled : t("fa").forceJoinEnabled);
    await ctx.answerCallbackQuery("✅");
  });

  bot.callbackQuery("fj:set_channel", async (ctx) => {
    if (!isSuperAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery("❌"); return; }
    ctx.session.adminAction = "set_force_join_channel";
    await ctx.reply(t("fa").forceJoinEnterChannel);
    await ctx.answerCallbackQuery();
  });

  // ── Callback: user management ─────────────────────────────────────────────────
  bot.callbackQuery(/^admin_addcoins:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery(); return; }
    ctx.session.adminAction = `add_coins:${ctx.match![1]}`;
    await ctx.reply(t("fa").enterAmount);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^admin_removecoins:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery(); return; }
    ctx.session.adminAction = `remove_coins:${ctx.match![1]}`;
    await ctx.reply(t("fa").enterAmount);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^admin_ban:(\d+)$/, async (ctx) => {
    if (!canDo(ctx.from!.id, "ban_user")) { await ctx.answerCallbackQuery("❌"); return; }
    const uid = parseInt(ctx.match![1], 10);
    if (isOwner(uid)) { await ctx.answerCallbackQuery(t("fa").adminCannotBanOwner); return; }
    const result = await banUser(uid, ctx.from!.id);
    if (!result.success) { await ctx.answerCallbackQuery(`❌ ${result.reason ?? "Cannot ban"}`); return; }
    await ctx.editMessageText(t("fa").adminUserBanned(uid), { reply_markup: undefined });
    await bot.api.sendMessage(uid, t("fa").userBanned).catch(() => {});
    await ctx.answerCallbackQuery("✅");
  });

  bot.callbackQuery(/^admin_unban:(\d+)$/, async (ctx) => {
    if (!canDo(ctx.from!.id, "ban_user")) { await ctx.answerCallbackQuery("❌"); return; }
    const uid = parseInt(ctx.match![1], 10);
    await unbanUser(uid);
    await ctx.editMessageText(t("fa").adminUserUnbanned(uid), { reply_markup: undefined });
    await ctx.answerCallbackQuery("✅");
  });

  bot.callbackQuery(/^admin_reftree:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery(); return; }
    const uid  = parseInt(ctx.match![1], 10);
    const tree = await getReferralTree(uid);
    if (tree.length === 0) {
      await ctx.reply("🌳 این کاربر هیچ‌کس را دعوت نکرده.");
    } else {
      let msg = "🌳 *درخت ارجاع:*\n\n";
      for (const node of tree) {
        msg += `${"  ".repeat(node.level - 1)}└ سطح ${node.level}: ${node.user.firstName} (\`${node.user.telegramId}\`) — 💰${node.user.coins}\n`;
      }
      await ctx.reply(msg, { parse_mode: "Markdown" });
    }
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^admin:show_user:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery(); return; }
    const uid  = parseInt(ctx.match![1], 10);
    const user = await searchUser(uid);
    if (!user) { await ctx.answerCallbackQuery("کاربر یافت نشد"); return; }
    await ctx.reply(t("fa").adminUserInfo(user), {
      parse_mode: "Markdown",
      reply_markup: adminUserActionsKeyboard(user.telegramId, "fa", user.status === "banned"),
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^admin:gift_user:(\d+)$/, async (ctx) => {
    if (!canDo(ctx.from!.id, "payment")) { await ctx.answerCallbackQuery("❌"); return; }
    const uid  = parseInt(ctx.match![1], 10);
    const user = await getUserByTelegramId(uid);
    const name = user?.firstName ?? `کاربر ${uid}`;
    ctx.session.adminAction = `gift_user:${uid}`;
    await ctx.reply(
      `🎁 *ارسال هدیه سکه*\n\nگیرنده: *${name}* (\`${uid}\`)\n\nتعداد سکه را وارد کنید:`,
      { parse_mode: "Markdown" }
    );
    await ctx.answerCallbackQuery();
  });

  // ── 📩 ورودی متن ادمین ────────────────────────────────────────────────────────
  bot.on("message:text", async (ctx, next) => {
    const tgId = ctx.from!.id;
    if (!isAdmin(tgId)) return next();
    const action = ctx.session.adminAction;
    if (!action) return next();

    const text = ctx.message.text.trim();
    ctx.session.adminAction = undefined;

    if (action === "search_user") {
      const uid  = parseInt(text, 10);
      const user = await searchUser(uid);
      if (!user) { await ctx.reply(t("fa").adminNotFound); return; }
      await ctx.reply(t("fa").adminUserInfo(user), {
        parse_mode: "Markdown",
        reply_markup: adminUserActionsKeyboard(user.telegramId, "fa", user.status === "banned"),
      });
      return;
    }

    if (action === "add_sub_admin") {
      const uid = parseInt(text, 10);
      if (isNaN(uid))               { await ctx.reply("❌ آیدی نامعتبر."); return; }
      if (SUPER_ADMIN_IDS.has(uid)) { await ctx.reply("⚠️ این کاربر سوپر ادمین است."); return; }
      if (SUB_ADMIN_IDS.has(uid))   { await ctx.reply(t("fa").adminAlreadyExists); return; }
      await ctx.reply(t("fa").selectAdminLevel, {
        reply_markup: {
          inline_keyboard: [
            [{ text: `مدیر کامل (${t("fa").adminLevelAdmin})`,  callback_data: `admin_perm_level:${uid}:admin` }],
            [{ text: `ناظر (${t("fa").adminLevelModerator})`,    callback_data: `admin_perm_level:${uid}:moderator` }],
          ],
        },
      });
      return;
    }

    if (action === "set_welcome_message") {
      if (text === "0") {
        await setSetting("welcome_message", "");
        await ctx.reply(t("fa").welcomeMsgCleared);
      } else {
        await setSetting("welcome_message", text);
        await ctx.reply(t("fa").welcomeMsgSet);
      }
      return;
    }

    if (action.startsWith("add_coins:")) {
      const uid    = parseInt(action.replace("add_coins:", ""), 10);
      const amount = parseInt(text, 10);
      if (isNaN(amount) || amount <= 0) { await ctx.reply("❌ مقدار نامعتبر"); return; }
      await addCoins(uid, amount, "admin_add", `Admin added by ${tgId}`);
      await ctx.reply(t("fa").adminCoinsAdded(amount, uid));
      await bot.api.sendMessage(uid, `💰 ادمین ${amount} سکه به حساب شما اضافه کرد!`).catch(() => {});
      return;
    }

    if (action.startsWith("remove_coins:")) {
      const uid    = parseInt(action.replace("remove_coins:", ""), 10);
      const amount = parseInt(text, 10);
      if (isNaN(amount) || amount <= 0) { await ctx.reply("❌ مقدار نامعتبر"); return; }
      await deductCoins(uid, amount, "admin_remove", `Admin removed by ${tgId}`);
      await ctx.reply(t("fa").adminCoinsRemoved(amount, uid));
      return;
    }

    if (action.startsWith("set_setting:")) {
      const key = action.replace("set_setting:", "");
      await setSetting(key, text);
      await ctx.reply(`✅ تنظیم شد: \`${key}\` = \`${text}\``, { parse_mode: "Markdown" });
      return;
    }

    if (action === "set_backup_schedule") {
      const hours = parseInt(text, 10);
      if (isNaN(hours) || hours < 1) { await ctx.reply("❌ مقدار نامعتبر"); return; }
      await setBackupSchedule(hours);
      await ctx.reply(`✅ بکاپ خودکار هر *${hours}* ساعت.`, { parse_mode: "Markdown" });
      return;
    }

    if (action.startsWith("broadcast:")) {
      const target = action.replace("broadcast:", "") as "all" | "active";
      await ctx.reply("📢 در حال ارسال...");
      const { sent, failed } = await broadcastMessage(bot, tgId, text, target);
      await ctx.reply(t("fa").adminBroadcastSent(sent) + ` (${failed} خطا)`);
      return;
    }

    if (action === "add_badword") {
      await addBadWord(text);
      await ctx.reply(`✅ کلمه *"${text}"* به لیست فیلتر اضافه شد.`, { parse_mode: "Markdown" });
      return;
    }

    if (action === "set_force_join_channel") {
      const channel = text.startsWith("@") ? text : `@${text}`;
      await setSetting("force_join_channel", channel);
      invalidateForceJoinCache();
      await ctx.reply(t("fa").forceJoinChannelSet(channel));
      return;
    }

    if (action === "gift_create_coins") {
      const coins = parseInt(text, 10);
      if (isNaN(coins) || coins < 1) {
        await ctx.reply("❌ مقدار نامعتبر — عدد صحیح مثبت وارد کنید.");
        ctx.session.adminAction = "gift_create_coins";
        return;
      }
      ctx.session.adminGiftCoins = coins;
      ctx.session.adminAction    = "gift_create_maxusage";
      await ctx.reply(
        `✅ تعداد سکه: *${coins}*\n\n*مرحله ۲/۲:* حداکثر تعداد استفاده‌کنندگان را وارد کنید:`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    if (action === "gift_create_maxusage") {
      const maxUsage = parseInt(text, 10);
      if (isNaN(maxUsage) || maxUsage < 1) {
        await ctx.reply("❌ مقدار نامعتبر — عدد صحیح مثبت وارد کنید.");
        ctx.session.adminAction = "gift_create_maxusage";
        return;
      }
      const coins = ctx.session.adminGiftCoins ?? 10;
      ctx.session.adminGiftCoins = undefined;
      const code = await createGiftCode(coins, maxUsage, tgId);
      await ctx.reply(
        `🎟️ *کد هدیه ساخته شد!*\n\n📋 کد: \`${code}\`\n💰 سکه: *${coins}*\n👥 حداکثر: *${maxUsage}* نفر`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    if (action.startsWith("gift_user:")) {
      const uid    = parseInt(action.replace("gift_user:", ""), 10);
      const amount = parseInt(text, 10);
      if (isNaN(amount) || amount <= 0) {
        await ctx.reply("❌ مقدار نامعتبر — عدد مثبت وارد کنید.");
        return;
      }
      await addCoins(uid, amount, "admin_add", `Admin gift by ${tgId}`);
      const user = await getUserByTelegramId(uid);
      const name = user?.firstName ?? `${uid}`;
      await ctx.reply(
        `🎁 *هدیه ارسال شد!*\n\n*${name}* (\`${uid}\`) — *${amount}* سکه دریافت کرد.`,
        { parse_mode: "Markdown" }
      );
      await bot.api.sendMessage(uid, `🎁 ادمین *${amount}* سکه به شما هدیه داد! 🪙`, { parse_mode: "Markdown" }).catch(() => {});
      return;
    }

    return next();
  });
}

// ─── Section display helpers ───────────────────────────────────────────────────

async function showReports(ctx: BotContext): Promise<void> {
  const reports = await getPendingReports(8);
  if (reports.length === 0) {
    await ctx.reply("✅ *هیچ گزارش در انتظاری وجود ندارد.*", { parse_mode: "Markdown" });
    return;
  }
  const total = await getPendingReportsCount();
  let msg = `🚨 *گزارش‌های در انتظار بررسی* (${total} گزارش)\n\n`;
  const kb: Array<Array<{ text: string; callback_data: string }>> = [];
  for (const r of reports) {
    const dateStr = r.createdAt.toLocaleDateString("fa-IR");
    msg +=
      `━━━━━━━━━━━━━━━━\n` +
      `📌 گزارش #${r.id}\n` +
      `👤 گزارش‌دهنده: \`${r.reporterId}\`\n` +
      `🔴 متهم: \`${r.reportedId}\`\n` +
      `📝 دلیل: ${r.reason}\n` +
      (r.description ? `💬 توضیح: ${r.description}\n` : "") +
      `🕒 تاریخ: ${dateStr}\n\n`;
    kb.push([
      { text: `✅ رد #${r.id}`,               callback_data: `admin_review:dismiss:${r.id}` },
      { text: `🚫 بن + رد #${r.id}`,          callback_data: `admin_review:ban:${r.reportedId}:${r.id}` },
      { text: `🔍 کاربر`,                      callback_data: `admin:show_user:${r.reportedId}` },
    ]);
  }
  if (total > reports.length) msg += `\n_نمایش ${reports.length} از ${total} گزارش_`;
  await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: { inline_keyboard: kb } });
}

async function showPaymentSection(ctx: BotContext): Promise<void> {
  const cardEnabled   = (await getSetting("payment_method_card")    ?? "enabled") !== "disabled";
  const cryptoEnabled = (await getSetting("payment_method_crypto")  ?? "enabled") !== "disabled";
  const gwEnabled     = (await getSetting("payment_method_gateway") ?? "enabled") !== "disabled";
  await ctx.reply(
    `💳 *روش‌های پرداخت*\n\n` +
    `💳 کارت بانکی: ${cardEnabled   ? "✅ فعال" : "❌ غیرفعال"}\n` +
    `₿ ارز دیجیتال: ${cryptoEnabled ? "✅ فعال" : "❌ غیرفعال"}\n` +
    `🔷 TetraPay: ${gwEnabled        ? "✅ فعال" : "❌ غیرفعال"}\n\n` +
    `_از منوی پایین روش مورد نظر را انتخاب کنید._`,
    { parse_mode: "Markdown", reply_markup: adminPaymentKeyboard() }
  );
}

async function showCostsSection(ctx: BotContext): Promise<void> {
  const [
    groupCreate, groupJoin, groupExpand, groupAdminPromote, groupExpandAdmin,
    permLink, timedLink,
    bottleCost, chainCost, letterCost, freqCost,
  ] = await Promise.all([
    getSetting("group_create_cost"),
    getSetting("group_join_cost"),
    getSetting("group_slot_expand_cost"),
    getSetting("group_admin_promote_cost"),
    getSetting("group_expand_cost"),
    getSetting("perm_anon_link_cost"),
    getSetting("timed_anon_link_cost"),
    getSetting("magic_bottle_cost"),
    getSetting("magic_chain_cost"),
    getSetting("magic_letter_cost"),
    getSetting("magic_frequency_cost"),
  ]);
  const s = (v: string | null | undefined, d = "0") => `\`${v ?? d}\` سکه`;
  const msg =
    `💰 *هزینه‌های سیستم*\n\n` +
    `👥 *گروه‌ها*\n` +
    `• ساخت گروه: ${s(groupCreate, "3")}\n` +
    `• پیوستن: ${s(groupJoin, "3")}\n` +
    `• افزایش ظرفیت: ${s(groupExpand, "30")}\n` +
    `• ارتقا ادمین: ${s(groupAdminPromote, "5")}\n` +
    `• افزایش ظرفیت (ادمین): ${s(groupExpandAdmin, "10")}\n\n` +
    `🔗 *لینک ناشناس*\n` +
    `• لینک دائمی: ${s(permLink, "10")}\n` +
    `• لینک موقت (هر ساعت): ${s(timedLink, "3")}\n\n` +
    `🔮 *دنیای اسرار*\n` +
    `• 🍾 بطری: ${s(bottleCost, "2")}  • 🔗 زنجیر: ${s(chainCost, "2")}\n` +
    `• ✉️ نامه: ${s(letterCost, "2")}  • 📡 فرکانس: ${s(freqCost, "2")}\n\n` +
    `_روی دکمه هر آیتم کلیک کنید تا تغییر دهید._`;
  await ctx.reply(msg, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "👥 ساخت گروه",         callback_data: "pay_set:group_create_cost" },
          { text: "👥 پیوستن",             callback_data: "pay_set:group_join_cost" },
        ],
        [
          { text: "📈 افزایش ظرفیت",      callback_data: "pay_set:group_slot_expand_cost" },
          { text: "⭐ ارتقا ادمین",        callback_data: "pay_set:group_admin_promote_cost" },
        ],
        [{ text: "⬆️ افزایش ظرفیت (ادمین)", callback_data: "pay_set:group_expand_cost" }],
        [
          { text: "🔗 لینک دائمی",         callback_data: "pay_set:perm_anon_link_cost" },
          { text: "⏱ لینک موقت",           callback_data: "pay_set:timed_anon_link_cost" },
        ],
        [
          { text: "🍾 بطری",               callback_data: "pay_set:magic_bottle_cost" },
          { text: "🔗 زنجیر",              callback_data: "pay_set:magic_chain_cost" },
        ],
        [
          { text: "✉️ نامه",               callback_data: "pay_set:magic_letter_cost" },
          { text: "📡 فرکانس",              callback_data: "pay_set:magic_frequency_cost" },
        ],
      ],
    },
  });
}

async function showMagicSection(ctx: BotContext): Promise<void> {
  const features = ["bottle", "chain", "letter", "frequency"] as const;
  const cfgs: Record<string, { enabled: boolean; cost: number; daily: number }> = {};
  for (const f of features) {
    const [en, co, da] = await Promise.all([
      getSetting(`magic_${f}_enabled`),
      getSetting(`magic_${f}_cost`),
      getSetting(`magic_${f}_daily`),
    ]);
    cfgs[f] = {
      enabled: (en ?? "true") !== "false",
      cost:    parseInt(co ?? "2", 10),
      daily:   parseInt(da ?? "3", 10),
    };
  }
  await ctx.reply(
    t("fa").adminMagicPanel(cfgs as any),
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🍾 پیام در بطری",   callback_data: "magic_cfg:bottle"    }],
          [{ text: "🔗 زنجیر احساس",   callback_data: "magic_cfg:chain"     }],
          [{ text: "✉️ نامه به آینده",  callback_data: "magic_cfg:letter"    }],
          [{ text: "📡 فرکانس ناشناس", callback_data: "magic_cfg:frequency" }],
        ],
      },
    }
  );
}

async function showReferralSection(ctx: BotContext): Promise<void> {
  const [inviterReward, inviteeReward, signupBonus, supportLink] = await Promise.all([
    getSetting("referral_reward_inviter"),
    getSetting("referral_reward_invitee"),
    getSetting("signup_bonus"),
    getSetting("support_link"),
  ]);
  await ctx.reply(
    `🎁 *رفرال و پاداش‌ها*\n\n` +
    `🎉 سکه خوش‌آمدگویی (کاربر جدید): \`${signupBonus ?? "15"}\` سکه\n` +
    `🎁 پاداش دعوت‌کننده: \`${inviterReward ?? "10"}\` سکه\n` +
    `🎁 پاداش دعوت‌شده: \`${inviteeReward ?? "5"}\` سکه\n` +
    `📞 لینک پشتیبانی: ${supportLink ?? "تنظیم نشده"}`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🎉 سکه خوش‌آمدگویی",  callback_data: "pay_set:signup_bonus" }],
          [{ text: "🎁 پاداش دعوت‌کننده", callback_data: "pay_set:referral_reward_inviter" }],
          [{ text: "🎁 پاداش دعوت‌شده",   callback_data: "pay_set:referral_reward_invitee" }],
          [{ text: "📞 لینک پشتیبانی",     callback_data: "pay_set:support_link" }],
        ],
      },
    }
  );
}

async function showTopReferrers(ctx: BotContext): Promise<void> {
  const top = await getTopReferrers(20, true);
  if (top.length === 0) {
    await ctx.reply("🏆 هنوز رفرال موفقی ثبت نشده.");
    return;
  }
  let msg = "🏆 *برترین رفرال‌دهندگان*\n\n";
  for (let i = 0; i < top.length; i++) {
    const e     = top[i];
    const medal = i < 3 ? ["🥇", "🥈", "🥉"][i] : `${i + 1}.`;
    const uname = e.username ? `@${e.username}` : "—";
    msg += `${medal} *${e.firstName}* \`${e.telegramId}\`\n    ${uname} | ${e.referralCount} دعوت | ${e.coinsEarned}🪙\n\n`;
  }
  const kb: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];
  for (const e of top.slice(0, 10)) {
    kb.push([
      { text: `💬 پیام به ${e.firstName}`, url: `tg://user?id=${e.telegramId}` } as { text: string; url: string },
      { text: `🎁 هدیه`,                   callback_data: `admin:gift_user:${e.telegramId}` },
      { text: `🔍 مشاهده`,                  callback_data: `admin:show_user:${e.telegramId}` },
    ]);
  }
  await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: { inline_keyboard: kb as any } });
}

async function showGiftsSection(ctx: BotContext): Promise<void> {
  const codes = await listGiftCodes();
  let msg = "🎟️ *کدهای هدیه*\n\n";
  if (codes.length === 0) {
    msg += "_(هیچ کدی ساخته نشده)_";
  } else {
    for (const c of codes.slice(0, 20)) {
      const status = !c.isActive ? "🚫" : c.usedCount >= c.maxUsage ? "✅ تموم شده" : "🟢 فعال";
      msg += `${status} \`${c.code}\` — ${c.coins}🪙 — ${c.usedCount}/${c.maxUsage} نفر\n`;
    }
    if (codes.length > 20) msg += `\n_... و ${codes.length - 20} کد دیگر_`;
  }
  const kb: Array<Array<{ text: string; callback_data: string }>> = [
    [{ text: "➕ ساخت کد هدیه جدید", callback_data: "admin:create_gift" }],
  ];
  for (const c of codes.filter(x => x.isActive && x.usedCount < x.maxUsage).slice(0, 5)) {
    kb.push([{ text: `🚫 غیرفعال: ${c.code}`, callback_data: `admin:gift_off:${c.id}` }]);
  }
  await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: { inline_keyboard: kb } });
}

async function showBackupSection(ctx: BotContext): Promise<void> {
  const config = await getBackupConfig();
  const status = config?.isVerified
    ? `✅ تنظیم شده (گروه: \`${config.chatId}\`)`
    : "❌ تنظیم نشده";
  await ctx.reply(
    `💾 *تنظیمات بکاپ*\n\nوضعیت: ${status}`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔑 کد تأیید جدید",   callback_data: "backup:gencode" }],
          [{ text: "📤 ارسال بکاپ الان", callback_data: "backup:send" }],
          [{ text: "⏱️ تنظیم زمان‌بندی", callback_data: "backup:schedule" }],
        ],
      },
    }
  );
}

async function showForceJoinSection(ctx: BotContext): Promise<void> {
  const enabled = (await getSetting("force_join_enabled")) === "true";
  const channel = await getSetting("force_join_channel");
  await ctx.reply(
    t("fa").forceJoinStatus(enabled, channel),
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: t("fa").toggleForceJoin,     callback_data: "fj:toggle" }],
          [{ text: t("fa").setForceJoinChannel, callback_data: "fj:set_channel" }],
        ],
      },
    }
  );
}

async function showManageAdmins(ctx: BotContext): Promise<void> {
  const subAdmins = await db.select().from(adminPermissionsTable).catch(() => []);
  let msgText = t("fa").currentSubAdmins;
  const buttons: Array<Array<{ text: string; callback_data: string }>> = [];
  if (subAdmins.length === 0) {
    msgText += t("fa").noSubAdmins;
  } else {
    for (const sa of subAdmins) {
      const levelLabel = sa.level === "admin" ? t("fa").adminLevelAdmin : t("fa").adminLevelModerator;
      const display    = sa.username ? `@${sa.username}` : `ID:${sa.telegramId}`;
      msgText += `• ${display} — ${levelLabel}\n`;
      buttons.push([{ text: `❌ حذف ${sa.telegramId}`, callback_data: `admin_perm_remove:${sa.telegramId}` }]);
    }
  }
  buttons.push([{ text: t("fa").addSubAdmin, callback_data: "admin:add_sub_admin" }]);
  await ctx.reply(msgText, { parse_mode: "Markdown", reply_markup: { inline_keyboard: buttons } });
}
