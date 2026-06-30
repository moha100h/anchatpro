import { Bot, Keyboard } from "grammy";
import type { BotContext } from "../context.js";
import {
  getUserByTelegramId,
  searchUser,
  getTotalStats,
  getActiveUserStats,
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
  addBadWordsBulk,
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
  parseBackupBuffer,
  restoreFromBackup,
} from "../services/backup.service.js";
import {
  setSetting,
  getSetting,
  getAllPackages,
  getPackageById,
  createPackage,
  updatePackage,
  createDiscountCode,
  listDiscountCodes,
  toggleDiscountCode,
  getCryptoCurrencies,
  saveCryptoCurrencies,
} from "../services/payment.service.js";
import { getTetraPayCallbackUrl, getPlisioCallbackUrl } from "../../lib/base-url.js";
import { getTotalChats } from "../services/matching.service.js";
import { db } from "@workspace/db";
import { adminPermissionsTable, usersTable } from "@workspace/db";
import { getBotInstance } from "../bot-instance.js";
import { eq } from "drizzle-orm";
import { t } from "../i18n/index.js";
import { adminUserActionsKeyboard } from "../keyboards/inline.js";
import { mainMenuKeyboard } from "../keyboards/main.js";

// ─── Group verification tokens ────────────────────────────────────────────────

const GROUP_TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface GroupTokenEntry {
  settingKey: string;
  adminId:    number;
  expires:    number;
}

const pendingGroupTokens = new Map<string, GroupTokenEntry>();

function generateGroupToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "GRPSET-";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function cleanExpiredGroupTokens(): void {
  const now = Date.now();
  for (const [token, entry] of pendingGroupTokens) {
    if (entry.expires < now) pendingGroupTokens.delete(token);
  }
}

const REVIEW_GROUP_KEYS = new Set([
  "card_review_group",
  "crypto_review_group",
  "tetrapay_review_group",
  "plisio_review_group",
  "payment_review_group",
]);

const REVIEW_GROUP_LABELS: Record<string, string> = {
  card_review_group:     "گروه بررسی کارت 💳",
  crypto_review_group:   "گروه بررسی کریپتو ₿",
  tetrapay_review_group: "گروه بررسی TetraPay 🌐",
  plisio_review_group:   "گروه بررسی Plisio 💫",
  payment_review_group:  "گروه بررسی پیش‌فرض 📋",
};

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
  STATS:       "📊 آمار سیستم",
  REPORTS:     "🚨 گزارش‌ها",
  PAYMENT:     "💳 روش‌های پرداخت",
  COSTS:       "💰 هزینه‌های سیستم",
  SYSTEM:      "⚙️ تنظیمات سیستم",
  MAGIC:       "🔮 اقیانوس",
  REFERRAL:    "🎁 رفرال و جوایز",
  TOP_REF:     "🏆 برترین رفرال‌ها",
  EXIT:        "🔙 خروج از پنل ادمین",
  // Costs sub-menu
  COST_MATCH:     "🎭 اتصال ناشناس",
  COST_GROUP:     "👥 گروه ناشناس",
  COST_PRO_LINK:  "💎 لینک پرو",
  COST_TIMED:     "🔗 لینک مدت‌دار",
  COST_MAGIC:     "🔮 اقیانوس",
  COST_RESTRICTION_UNLOCK: "🔓 رفع محدودیت سریع",
  COST_SPIN_WHEEL:         "🎰 گردونه شانس روزانه",
  // System sub-menu
  WELCOME:     "📝 خوش‌آمدگویی",
  BROADCAST:   "📣 پیام همگانی",
  GIFTS:       "🎟️ کدهای هدیه",
  BADWORDS:    "🔤 کلمات ناپسند",
  BACKUP:      "💾 بکاپ",
  FORCE_JOIN:  "📢 فورس جوین",
  ADMINS:      "👥 مدیریت ادمین‌ها",
  // Payment sub-menu
  CARD:           "💳 کارت بانکی",
  CRYPTO:         "₿ ارز دیجیتال",
  TETRAPAY:       "🔷 TetraPay",
  PLISIO:         "💫 Plisio",
  PACKAGES:       "📦 بسته‌های سکه",
  DISCOUNT_CODES: "🏷️ کدهای تخفیف",
  // Sub-menu back
  BACK_PANEL:  "🔙 پنل ادمین",
} as const;

function adminMainKeyboard(tgId: number): Keyboard {
  const kb = new Keyboard();

  if (canDo(tgId, "search_user")) {
    kb.text(ADMIN_BTN.USERS).text(ADMIN_BTN.STATS).row();
  } else {
    kb.text(ADMIN_BTN.STATS).row();
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
    .text(ADMIN_BTN.TETRAPAY).text(ADMIN_BTN.PLISIO).row()
    .text(ADMIN_BTN.PACKAGES).text(ADMIN_BTN.DISCOUNT_CODES).row()
    .text(ADMIN_BTN.BACK_PANEL)
    .resized().persistent();
}

function adminCostsKeyboard(): Keyboard {
  return new Keyboard()
    .text(ADMIN_BTN.COST_MATCH).row()
    .text(ADMIN_BTN.COST_GROUP).row()
    .text(ADMIN_BTN.COST_PRO_LINK).text(ADMIN_BTN.COST_TIMED).row()
    .text(ADMIN_BTN.COST_MAGIC).row()
    .text(ADMIN_BTN.COST_RESTRICTION_UNLOCK).row()
    .text(ADMIN_BTN.COST_SPIN_WHEEL).row()
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

  // ── 📊 آمار سیستم ────────────────────────────────────────────────────────────
  bot.hears(ADMIN_BTN.STATS, async (ctx, next) => {
    if (!isAdmin(ctx.from!.id) || !ctx.session.adminMode) return next();
    const [s, pendingReports] = await Promise.all([
      getActiveUserStats(),
      getPendingReportsCount(),
    ]);
    const msg =
      `📊 *آمار کلی سیستم*\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `👥 کل اعضا: \`${s.total.toLocaleString()}\`\n` +
      `🟢 فعال امروز: \`${s.today.toLocaleString()}\`\n` +
      `📅 فعال ۷ روز: \`${s.sevenDays.toLocaleString()}\`\n` +
      `📅 فعال ۱۵ روز: \`${s.fifteenDays.toLocaleString()}\`\n` +
      `📅 فعال ۳۰ روز: \`${s.thirtyDays.toLocaleString()}\`\n` +
      `━━━━━━━━━━━━━━━━━━━━━\n` +
      `🚨 گزارش‌های در انتظار: \`${pendingReports}\``;
    await ctx.reply(msg, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: `🚨 بررسی گزارش‌ها (${pendingReports})`, callback_data: "admin:show_reports" }],
        ],
      },
    });
  });

  // ── 🚨 گزارش‌ها (inline) ──────────────────────────────────────────────────────
  bot.callbackQuery("admin:show_reports", async (ctx) => {
    if (!isAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery("❌"); return; }
    await ctx.answerCallbackQuery();
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
    const [c1, c6, c24, c168] = await Promise.all([
      getSetting("timed_link_cost_1h"),
      getSetting("timed_link_cost_6h"),
      getSetting("timed_link_cost_24h"),
      getSetting("timed_link_cost_7d"),
    ]);
    const v1 = c1 ?? "1", v6 = c6 ?? "2", v24 = c24 ?? "3", v168 = c168 ?? "5";
    await ctx.reply(
      `🔗 *لینک ناشناس مدت‌دار — هزینه‌ها*\n\n` +
      `• ⏱️ ۱ ساعت: \`${v1}\` سکه\n` +
      `• ⏱️ ۶ ساعت: \`${v6}\` سکه\n` +
      `• ⏱️ ۲۴ ساعت: \`${v24}\` سکه\n` +
      `• 📅 ۷ روز: \`${v168}\` سکه\n\n` +
      `_روی دکمه مورد نظر برای تغییر کلیک کنید._`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: `⏱️ ۱ ساعت: ${v1} سکه`, callback_data: "pay_set:timed_link_cost_1h" },
              { text: `⏱️ ۶ ساعت: ${v6} سکه`, callback_data: "pay_set:timed_link_cost_6h" },
            ],
            [
              { text: `⏱️ ۲۴ ساعت: ${v24} سکه`, callback_data: "pay_set:timed_link_cost_24h" },
              { text: `📅 ۷ روز: ${v168} سکه`, callback_data: "pay_set:timed_link_cost_7d" },
            ],
          ],
        },
      }
    );
  });

  // ── 🔓 رفع محدودیت سریع (costs sub) ─────────────────────────────────────────
  bot.hears(ADMIN_BTN.COST_RESTRICTION_UNLOCK, async (ctx, next) => {
    if (!isAdmin(ctx.from!.id) || ctx.session.adminMode !== "costs") return next();
    if (!canDo(ctx.from!.id, "payment")) { await ctx.reply("❌ دسترسی ندارید."); return; }
    const [costStr, durationStr] = await Promise.all([
      getSetting("restriction_unlock_cost"),
      getSetting("restriction_duration_hours"),
    ]);
    const v = costStr ?? "20";
    const d = durationStr ?? "3";
    await ctx.reply(
      `🔓 *محدودیت کاربران — تنظیمات*\n\n` +
      `• مدت محدودیت پیش‌فرض: \`${d}\` ساعت\n` +
      `• هزینه رفع فوری توسط کاربر: \`${v}\` سکه\n\n` +
      `_کاربران محدودشده می‌توانند با پرداخت سکه، فوری از محدودیت خارج شوند._`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: `⏱️ مدت محدودیت: ${d} ساعت`, callback_data: "pay_set:restriction_duration_hours" }],
            [{ text: `🔓 هزینه رفع فوری: ${v} سکه`, callback_data: "pay_set:restriction_unlock_cost" }],
          ],
        },
      },
    );
  });

  // ── 🎰 گردونه شانس روزانه (costs sub) ──────────────────────────────────────────
  bot.hears(ADMIN_BTN.COST_SPIN_WHEEL, async (ctx, next) => {
    if (!isAdmin(ctx.from!.id) || ctx.session.adminMode !== "costs") return next();
    if (!canDo(ctx.from!.id, "payment")) { await ctx.reply("❌ دسترسی ندارید."); return; }
    const [minStr, maxStr] = await Promise.all([
      getSetting("spin_min_coins"),
      getSetting("spin_max_coins"),
    ]);
    const minV = minStr ?? "1";
    const maxV = maxStr ?? "10";
    const mid = Math.floor((parseInt(minV, 10) + parseInt(maxV, 10)) / 2);
    await ctx.reply(
      `🎰 *گردونه شانس روزانه — تنظیمات*\n\n` +
      `• حداقل سکه: \`${minV}\`\n` +
      `• حداکثر سکه: \`${maxV}\`\n` +
      `• نقطه میانی (mid): \`${mid}\`\n\n` +
      `📊 *توزیع احتمال:*\n` +
      `• ۷۰٪ مواقع: \`${minV}\` تا \`${mid}\` سکه\n` +
      `• ۳۰٪ مواقع: \`${mid + 1}\` تا \`${maxV}\` سکه\n\n` +
      `_روی دکمه مورد نظر برای تغییر کلیک کنید._`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: `📉 حداقل سکه: ${minV}`, callback_data: "pay_set:spin_min_coins" }],
            [{ text: `📈 حداکثر سکه: ${maxV}`, callback_data: "pay_set:spin_max_coins" }],
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

  // ── 🔮 اقیانوس ───────────────────────────────────────────────────────────────
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
    // Reset broadcast filter state
    ctx.session.broadcastGender = undefined;
    ctx.session.broadcastAgeRange = undefined;
    ctx.session.broadcastCountLimit = undefined;
    ctx.session.broadcastTarget = undefined;
    await ctx.reply(
      "📣 *پیام همگانی*\n\n*مرحله ۱/۴:* جنسیت گیرندگان را انتخاب کنید:",
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "🎲 همه", callback_data: "bc_gender:any" },
              { text: "👧 دختران", callback_data: "bc_gender:female" },
              { text: "👦 پسران", callback_data: "bc_gender:male" },
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
    const [cardNo, holderName, bankName, reviewGroup, methodVal] = await Promise.all([
      getSetting("card_number"),
      getSetting("card_holder_name"),
      getSetting("card_bank_name"),
      getSetting("card_review_group"),
      getSetting("payment_method_card"),
    ]);
    const cardEnabled = (methodVal ?? "enabled") !== "disabled";
    await ctx.reply(
      `💳 *کارت بانکی*\n\n` +
      `وضعیت: ${cardEnabled ? "✅ فعال" : "❌ غیرفعال"}\n` +
      `شماره کارت: \`${cardNo ?? "تنظیم نشده"}\`\n` +
      `نام صاحب کارت: \`${holderName ?? "تنظیم نشده"}\`\n` +
      `نام بانک: \`${bankName ?? "تنظیم نشده"}\`\n` +
      `گروه بررسی: \`${reviewGroup ?? "تنظیم نشده"}\``,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "✏️ شماره کارت",        callback_data: "pay_set:card_number" }],
            [{ text: "✏️ نام صاحب کارت",     callback_data: "pay_set:card_holder_name" }],
            [{ text: "✏️ نام بانک",           callback_data: "pay_set:card_bank_name" }],
            [{ text: "✏️ گروه بررسی کارت",   callback_data: "pay_set:card_review_group" }],
            [{ text: cardEnabled ? "❌ غیرفعال کردن کارت" : "✅ فعال کردن کارت", callback_data: "pay_toggle:card" }],
          ],
        },
      }
    );
  });

  bot.hears(ADMIN_BTN.CRYPTO, async (ctx, next) => {
    if (!isAdmin(ctx.from!.id) || ctx.session.adminMode !== "payment") return next();
    if (!canDo(ctx.from!.id, "payment")) { await ctx.reply("❌"); return; }
    const [reviewGroup, methodVal] = await Promise.all([
      getSetting("crypto_review_group"),
      getSetting("payment_method_crypto"),
    ]);
    const cryptoEnabled = (methodVal ?? "enabled") !== "disabled";
    const currencies = await getCryptoCurrencies();
    const currList = currencies.length > 0
      ? currencies.map((c, i) =>
          `  ${i + 1}. *${c.symbol}* (${c.network}): \`${c.address.slice(0, 14)}...\``
        ).join("\n")
      : "  _هیچ ارزی تنظیم نشده_";
    await ctx.reply(
      `₿ *ارز دیجیتال*\n\n` +
      `وضعیت: ${cryptoEnabled ? "✅ فعال" : "❌ غیرفعال"}\n` +
      `گروه بررسی: \`${reviewGroup ?? "تنظیم نشده"}\`\n\n` +
      `💱 ارزهای فعال:\n${currList}`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "✏️ گروه بررسی کریپتو",  callback_data: "pay_set:crypto_review_group" }],
            [{ text: "💱 مدیریت ارزها",        callback_data: "admin_crypto:list" }],
            [{ text: cryptoEnabled ? "❌ غیرفعال کردن کریپتو" : "✅ فعال کردن کریپتو", callback_data: "pay_toggle:crypto" }],
          ],
        },
      }
    );
  });

  bot.hears(ADMIN_BTN.TETRAPAY, async (ctx, next) => {
    if (!isAdmin(ctx.from!.id) || ctx.session.adminMode !== "payment") return next();
    if (!canDo(ctx.from!.id, "payment")) { await ctx.reply("❌"); return; }
    const [apiKey, cbUrl, reviewGroup, methodVal] = await Promise.all([
      getSetting("tetrapay_api_key"),
      getSetting("tetrapay_callback_url"),
      getSetting("tetrapay_review_group"),
      getSetting("payment_method_gateway"),
    ]);
    const gwEnabled = (methodVal ?? "enabled") !== "disabled";
    await ctx.reply(
      t("fa").tetraPayStatus(!!apiKey, cbUrl ?? null) +
      `\n\nوضعیت درگاه: ${gwEnabled ? "✅ فعال" : "❌ غیرفعال"}\n` +
      `گروه بررسی: \`${reviewGroup ?? "تنظیم نشده"}\``,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: t("fa").setApiKey,             callback_data: "pay_set:tetrapay_api_key" }],
            [{ text: t("fa").autoDetectCallbackUrl, callback_data: "tetrapay:auto_url" }],
            [{ text: t("fa").setCallbackUrl,        callback_data: "pay_set:tetrapay_callback_url" }],
            [{ text: "✏️ گروه بررسی TetraPay",    callback_data: "pay_set:tetrapay_review_group" }],
            [{ text: gwEnabled ? "❌ غیرفعال کردن درگاه" : "✅ فعال کردن درگاه", callback_data: "pay_toggle:gateway" }],
          ],
        },
      }
    );
  });

  // ── 💫 Plisio crypto gateway ───────────────────────────────────────────────────
  bot.hears(ADMIN_BTN.PLISIO, async (ctx, next) => {
    if (!isAdmin(ctx.from!.id) || ctx.session.adminMode !== "payment") return next();
    if (!canDo(ctx.from!.id, "payment")) { await ctx.reply("❌ دسترسی ندارید."); return; }
    const [apiKey, cbUrl, currencies, reviewGroup, methodVal] = await Promise.all([
      getSetting("plisio_api_key"),
      getSetting("plisio_callback_url"),
      getSetting("plisio_currencies"),
      getSetting("plisio_review_group"),
      getSetting("payment_method_plisio"),
    ]);
    const enabled = (methodVal ?? "enabled") !== "disabled";
    const webhookUrl = getPlisioCallbackUrl();
    await ctx.reply(
      `💫 *Plisio — درگاه کریپتو جهانی*\n\n` +
      `وضعیت: ${enabled ? "✅ فعال" : "❌ غیرفعال"}\n` +
      `🔑 کلید API: \`${apiKey ? "✅ ثبت شده" : "❌ ثبت نشده"}\`\n` +
      `🔗 Callback URL: \`${cbUrl ?? "❌ ثبت نشده"}\`\n` +
      `💱 ارزهای مجاز: \`${currencies ?? "ETH,LTC,BNB,USDT_TRX,TRX"}\`\n` +
      `👥 گروه بررسی: \`${reviewGroup ?? "تنظیم نشده"}\`\n\n` +
      `📋 *راهنمای اتصال Plisio:*\n` +
      `1️⃣ به پنل Plisio → Account → API بروید\n` +
      `2️⃣ *کلید مخفی* (Secret Key) را کپی کنید\n` +
      `3️⃣ در فیلد *Status URL* این آدرس را ثبت کنید:\n` +
      `\`${webhookUrl}?json=true\`\n` +
      `4️⃣ *کلید API* رو از دکمه زیر وارد کنید`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔑 ثبت/تغییر کلید API",          callback_data: "pay_set:plisio_api_key" }],
            [{ text: "🔗 تشخیص خودکار Callback URL",  callback_data: "plisio:auto_url" }],
            [{ text: "✏️ ویرایش Callback URL",          callback_data: "pay_set:plisio_callback_url" }],
            [{ text: "💱 ارزهای مجاز (ETH,LTC,...)",   callback_data: "pay_set:plisio_currencies" }],
            [{ text: "👥 گروه بررسی Plisio",            callback_data: "pay_set:plisio_review_group" }],
            [{ text: enabled ? "❌ غیرفعال کردن Plisio" : "✅ فعال کردن Plisio", callback_data: "pay_toggle:plisio" }],
          ],
        },
      }
    );
  });

  // ─── Package management ────────────────────────────────────────────────────────
  bot.hears(ADMIN_BTN.PACKAGES, async (ctx, next) => {
    if (!isAdmin(ctx.from!.id) || ctx.session.adminMode !== "payment") return next();
    if (!canDo(ctx.from!.id, "payment")) { await ctx.reply("❌"); return; }
    const packages = await getAllPackages();
    const kb: Array<Array<{ text: string; callback_data: string }>> = [];
    let msg = "📦 *بسته‌های سکه:*\n\n";
    if (packages.length === 0) {
      msg += "_هیچ بسته‌ای وجود ندارد_\n";
    } else {
      for (const pkg of packages) {
        const status   = pkg.isActive ? "✅" : "❌";
        const disc     = (pkg.discountPercent ?? 0) > 0 ? ` 🔥-${pkg.discountPercent}%` : "";
        const label    = pkg.label ? ` (${pkg.label})` : "";
        const gwPrices = [
          pkg.cardPrice    ? `💳${pkg.cardPrice.toLocaleString("fa-IR")}`    : null,
          pkg.cryptoPrice  ? `₿$${pkg.cryptoPrice}`                         : null,
          pkg.tetrapayPrice ? `🌐${pkg.tetrapayPrice.toLocaleString("fa-IR")}` : null,
          pkg.plisioPrice   ? `💫$${pkg.plisioPrice}`                          : null,
        ].filter(Boolean).join(" | ");
        const gwStr = gwPrices ? ` [${gwPrices}]` : "";
        msg += `${status} ${pkg.coins} سکه${label} | ${pkg.price.toLocaleString("fa-IR")} تومان${disc}${gwStr} — #${pkg.id}\n`;
        kb.push([
          { text: `✏️ ویرایش #${pkg.id}`,     callback_data: `admin_pkg:edit:${pkg.id}` },
          { text: pkg.isActive ? `🚫 غیرفعال` : `✅ فعال`, callback_data: `admin_pkg:toggle:${pkg.id}` },
        ]);
      }
    }
    kb.push([{ text: "➕ افزودن بسته جدید", callback_data: "admin_pkg:create" }]);
    await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: { inline_keyboard: kb } });
  });

  // ─── Discount code management ──────────────────────────────────────────────────
  bot.hears(ADMIN_BTN.DISCOUNT_CODES, async (ctx, next) => {
    if (!isAdmin(ctx.from!.id) || ctx.session.adminMode !== "payment") return next();
    if (!canDo(ctx.from!.id, "payment")) { await ctx.reply("❌"); return; }
    const codes = await listDiscountCodes();
    const kb: Array<Array<{ text: string; callback_data: string }>> = [];
    let msg = "🏷️ *کدهای تخفیف:*\n\n";
    if (codes.length === 0) {
      msg += "_هیچ کدی وجود ندارد_\n";
    } else {
      for (const dc of codes) {
        const status = dc.isActive ? "✅" : "❌";
        const uses   = dc.maxUses != null ? `${dc.usedCount}/${dc.maxUses}` : `${dc.usedCount}/∞`;
        msg += `${status} \`${dc.code}\` — ${dc.discountPercent}% — استفاده: ${uses}\n`;
        kb.push([{
          text: dc.isActive ? `❌ غیرفعال ${dc.code}` : `✅ فعال ${dc.code}`,
          callback_data: `admin_dc:toggle:${dc.id}:${dc.isActive ? "off" : "on"}`,
        }]);
      }
    }
    kb.push([{ text: "➕ ساخت کد تخفیف جدید", callback_data: "admin_dc:create" }]);
    await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: { inline_keyboard: kb } });
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

  // ── Callbacks: referral banner edit ──────────────────────────────────────────
  bot.callbackQuery("admin:edit_referral_banner", async (ctx) => {
    if (!canDo(ctx.from!.id, "payment")) { await ctx.answerCallbackQuery("❌"); return; }
    ctx.session.adminAction = "set_referral_banner";
    await ctx.reply(
      `✏️ *متن بنر رفرال را وارد کنید:*\n\n` +
      `می‌توانید از متغیرهای زیر استفاده کنید:\n` +
      `\`{link}\` — لینک دعوت\n` +
      `\`{inviterReward}\` — سکه دعوت‌کننده\n` +
      `\`{inviteeReward}\` — سکه دعوت‌شده\n` +
      `\`{botUsername}\` — نام ربات\n\n` +
      `_برای لغو، عدد \`0\` را ارسال کنید._`,
      { parse_mode: "Markdown" }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("admin:clear_referral_banner", async (ctx) => {
    if (!canDo(ctx.from!.id, "payment")) { await ctx.answerCallbackQuery("❌"); return; }
    await setSetting("referral_banner_text", "");
    await ctx.reply("✅ بنر رفرال به حالت پیش‌فرض برگشت.");
    await ctx.answerCallbackQuery("✅");
  });

  // ── Callbacks: broadcast multi-step filter flow ───────────────────────────────

  // Step 1 → gender selection → go to age
  bot.callbackQuery(/^bc_gender:(any|male|female)$/, async (ctx) => {
    if (!canDo(ctx.from!.id, "broadcast")) { await ctx.answerCallbackQuery("❌"); return; }
    const g = ctx.match![1] as "any" | "male" | "female";
    ctx.session.broadcastGender = g;
    await ctx.editMessageText(
      `✅ جنسیت: ${g === "any" ? "همه" : g === "female" ? "👧 دختران" : "👦 پسران"}\n\n*مرحله ۲/۴:* بازه سنی گیرندگان:`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "بدون فیلتر", callback_data: "bc_age:any" }],
            [
              { text: "۱۵–۲۵ سال", callback_data: "bc_age:15-25" },
              { text: "۲۵–۳۵ سال", callback_data: "bc_age:25-35" },
            ],
            [
              { text: "۱۵–۳۵ سال", callback_data: "bc_age:15-35" },
              { text: "۱۸–۴۰ سال", callback_data: "bc_age:18-40" },
            ],
          ],
        },
      }
    );
    await ctx.answerCallbackQuery();
  });

  // Step 2 → age → go to count limit
  bot.callbackQuery(/^bc_age:(.+)$/, async (ctx) => {
    if (!canDo(ctx.from!.id, "broadcast")) { await ctx.answerCallbackQuery("❌"); return; }
    ctx.session.broadcastAgeRange = ctx.match![1] as string;
    await ctx.editMessageText(
      `✅ سن: ${ctx.session.broadcastAgeRange === "any" ? "بدون فیلتر" : ctx.session.broadcastAgeRange}\n\n*مرحله ۳/۴:* حداکثر تعداد گیرنده:`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "بدون محدودیت", callback_data: "bc_limit:0" }],
            [
              { text: "۱۰۰ نفر",  callback_data: "bc_limit:100"  },
              { text: "۵۰۰ نفر",  callback_data: "bc_limit:500"  },
            ],
            [
              { text: "۱۰۰۰ نفر", callback_data: "bc_limit:1000" },
              { text: "۵۰۰۰ نفر", callback_data: "bc_limit:5000" },
            ],
          ],
        },
      }
    );
    await ctx.answerCallbackQuery();
  });

  // Step 3 → count limit → go to target
  bot.callbackQuery(/^bc_limit:(\d+)$/, async (ctx) => {
    if (!canDo(ctx.from!.id, "broadcast")) { await ctx.answerCallbackQuery("❌"); return; }
    ctx.session.broadcastCountLimit = parseInt(ctx.match![1] as string, 10);
    const limitLabel = ctx.session.broadcastCountLimit === 0 ? "بدون محدودیت" : `${ctx.session.broadcastCountLimit} نفر`;
    await ctx.editMessageText(
      `✅ تعداد: ${limitLabel}\n\n*مرحله ۴/۴:* هدف ارسال:`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "👥 همه کاربران",   callback_data: "bc_target:all"    },
              { text: "🟢 کاربران فعال",  callback_data: "bc_target:active" },
            ],
          ],
        },
      }
    );
    await ctx.answerCallbackQuery();
  });

  // Step 4 → target → ask for message text
  bot.callbackQuery(/^bc_target:(all|active)$/, async (ctx) => {
    if (!canDo(ctx.from!.id, "broadcast")) { await ctx.answerCallbackQuery("❌"); return; }
    const target = ctx.match![1] as "all" | "active";
    ctx.session.broadcastTarget = target;
    ctx.session.adminAction = `broadcast_send:${target}`;
    const g     = ctx.session.broadcastGender    ?? "any";
    const age   = ctx.session.broadcastAgeRange  ?? "any";
    const limit = ctx.session.broadcastCountLimit ?? 0;
    const gLabel     = g === "any" ? "همه" : g === "female" ? "👧 دختران" : "👦 پسران";
    const ageLabel   = age === "any" ? "بدون فیلتر" : age;
    const limitLabel = limit === 0 ? "بدون محدودیت" : `${limit} نفر`;
    await ctx.editMessageText(
      `✅ *خلاصه فیلترها:*\n` +
      `👤 جنسیت: ${gLabel}  |  🎂 سن: ${ageLabel}  |  🔢 تعداد: ${limitLabel}\n` +
      `📡 هدف: ${target === "all" ? "همه کاربران" : "کاربران فعال"}\n\n` +
      `✏️ *متن پیام همگانی را بنویسید:*`,
      { parse_mode: "Markdown" }
    );
    await ctx.answerCallbackQuery();
  });

  // ── Callback: pay_set / pay_toggle / tetrapay ─────────────────────────────────
  bot.callbackQuery(/^pay_set:(.+)$/, async (ctx) => {
    if (!canDo(ctx.from!.id, "payment")) { await ctx.answerCallbackQuery("❌"); return; }
    const key     = ctx.match![1];
    const adminId = ctx.from!.id;

    // ── Review group keys → token-based verification ──────────────────────────
    if (REVIEW_GROUP_KEYS.has(key)) {
      cleanExpiredGroupTokens();
      // Revoke any existing token for this admin+key pair
      for (const [tok, entry] of pendingGroupTokens) {
        if (entry.adminId === adminId && entry.settingKey === key) {
          pendingGroupTokens.delete(tok);
        }
      }
      const token = generateGroupToken();
      pendingGroupTokens.set(token, {
        settingKey: key,
        adminId,
        expires: Date.now() + GROUP_TOKEN_TTL_MS,
      });
      const label = REVIEW_GROUP_LABELS[key] ?? key;
      await ctx.reply(
        `🔑 *تنظیم ${label}*\n\n` +
        `این کد را در گروه مورد نظر ارسال کنید:\n\n` +
        `\`${token}\`\n\n` +
        `_کد تا ۵ دقیقه معتبر است. بات باید عضو گروه باشد._`,
        { parse_mode: "Markdown" }
      );
      await ctx.answerCallbackQuery();
      return;
    }

    // ── Other settings → text input ───────────────────────────────────────────
    ctx.session.adminAction = `set_setting:${key}`;
    const labels: Record<string, string> = {
      card_number:              "شماره کارت بانکی",
      card_holder_name:         "نام صاحب کارت",
      card_bank_name:           "نام بانک",
      crypto_wallet:            "آدرس کیف پول ارز دیجیتال",
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
      restriction_unlock_cost:      "هزینه رفع محدودیت سریع (سکه)",
      restriction_duration_hours:   "مدت محدودیت (ساعت، پیش‌فرض ۳)",
      spin_min_coins:               "حداقل سکه گردونه شانس",
      spin_max_coins:               "حداکثر سکه گردونه شانس",
      support_link:             "لینک پشتیبانی (@username یا t.me/...)",
      tetrapay_api_key:         "کلید API تتراپی",
      tetrapay_callback_url:    "آدرس Callback تتراپی",
      plisio_api_key:           "کلید API پلیزیو (Secret Key)",
      plisio_callback_url:      "آدرس Callback پلیزیو (Status URL)",
      plisio_currencies:        "ارزهای مجاز پلیزیو (مثال: ETH,LTC,USDT_TRX,TRX)",
      plisio_review_group:      "گروه بررسی پلیزیو (ID یا @username)",
    };
    await ctx.reply(`✏️ مقدار جدید *${labels[key] ?? key}* را وارد کنید:`, { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
  });

  // ── Group message handler: recognize verification tokens ──────────────────────
  bot.on("message:text", async (ctx, next) => {
    const chatType = ctx.chat?.type;
    if (chatType !== "group" && chatType !== "supergroup") return next();

    const text = ctx.message.text.trim();
    if (!text.startsWith("GRPSET-")) return next();

    cleanExpiredGroupTokens();
    const entry = pendingGroupTokens.get(text);
    if (!entry) {
      await ctx.reply("❌ کد نامعتبر یا منقضی شده.");
      return;
    }
    if (entry.expires < Date.now()) {
      pendingGroupTokens.delete(text);
      await ctx.reply("❌ کد منقضی شده است. لطفاً مجدداً از پنل ادمین کد جدید دریافت کنید.");
      return;
    }

    const chatId = ctx.chat!.id;
    const chatTitle = ctx.chat!.title ?? String(chatId);
    await setSetting(entry.settingKey, String(chatId));
    pendingGroupTokens.delete(text);

    const label = REVIEW_GROUP_LABELS[entry.settingKey] ?? entry.settingKey;
    // Confirm in group
    await ctx.reply(`✅ گروه «${chatTitle}» به عنوان *${label}* ثبت شد.`, { parse_mode: "Markdown" });

    // Notify admin in PM
    try {
      await bot.api.sendMessage(
        entry.adminId,
        `✅ *${label}* با موفقیت تنظیم شد!\n\n` +
        `📌 گروه: *${chatTitle}*\n` +
        `🆔 شناسه: \`${chatId}\``,
        { parse_mode: "Markdown" }
      );
    } catch {
      // Admin may not have started PM — ignore
    }
  });

  bot.callbackQuery(/^pay_toggle:(card|crypto|gateway|plisio)$/, async (ctx) => {
    if (!canDo(ctx.from!.id, "payment")) { await ctx.answerCallbackQuery("❌"); return; }
    const method  = ctx.match![1]!;
    const key     = `payment_method_${method}`;
    const current = await getSetting(key);
    const newVal  = current === "disabled" ? "enabled" : "disabled";
    await setSetting(key, newVal);
    const labels: Record<string, string> = { card: "کارت", crypto: "کریپتو", gateway: "درگاه (TetraPay)", plisio: "Plisio" };
    await ctx.reply(`${newVal === "enabled" ? "✅ فعال" : "❌ غیرفعال"} شد: ${labels[method] ?? method}`);
    await ctx.answerCallbackQuery("✅");
  });

  bot.callbackQuery("tetrapay:auto_url", async (ctx) => {
    if (!canDo(ctx.from!.id, "payment")) { await ctx.answerCallbackQuery("❌"); return; }
    const url = getTetraPayCallbackUrl();
    await setSetting("tetrapay_callback_url", url);
    await ctx.answerCallbackQuery("✅ URL تنظیم شد");
    await ctx.reply(t("fa").callbackUrlAutoSet(url), { parse_mode: "Markdown" });
  });

  bot.callbackQuery("plisio:auto_url", async (ctx) => {
    if (!canDo(ctx.from!.id, "payment")) { await ctx.answerCallbackQuery("❌"); return; }
    const url = getPlisioCallbackUrl();
    await setSetting("plisio_callback_url", url);
    await ctx.answerCallbackQuery("✅ URL تنظیم شد");
    await ctx.reply(
      `✅ *Callback URL پلیزیو تنظیم شد:*\n\n` +
      `\`${url}\`\n\n` +
      `⚠️ در پنل Plisio، این آدرس را در *Status URL* با پسوند \`?json=true\` ثبت کنید:\n` +
      `\`${url}?json=true\``,
      { parse_mode: "Markdown" }
    );
  });

  // ── Callbacks: package CRUD ───────────────────────────────────────────────────
  bot.callbackQuery("admin_pkg:create", async (ctx) => {
    if (!canDo(ctx.from!.id, "payment")) { await ctx.answerCallbackQuery("❌"); return; }
    ctx.session.adminAction       = "admin_pkg_create_coins";
    ctx.session.adminPkgStep      = "coins";
    ctx.session.adminPkgCoins     = undefined;
    ctx.session.adminPkgPrice     = undefined;
    ctx.session.adminPkgDiscount  = undefined;
    ctx.session.adminPkgCardPrice    = undefined;
    ctx.session.adminPkgCryptoPrice  = undefined;
    ctx.session.adminPkgTetrapayPrice = undefined;
    await ctx.reply("📦 *ساخت بسته جدید*\n\n*مرحله ۱/۷:* تعداد سکه را وارد کنید:", { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^admin_pkg:edit:(\d+)$/, async (ctx) => {
    if (!canDo(ctx.from!.id, "payment")) { await ctx.answerCallbackQuery("❌"); return; }
    const id = parseInt(ctx.match![1], 10);
    ctx.session.adminPkgEditId = id;
    const pkg = await getPackageById(id);
    const cardStr    = pkg?.cardPrice    ? `💳 کارت: ${pkg.cardPrice.toLocaleString("fa-IR")} تومان`       : "💳 کارت: پایه";
    const cryptoStr  = pkg?.cryptoPrice  ? `₿ کریپتو: $${pkg.cryptoPrice}`                                : "₿ کریپتو: پایه";
    const tetrapayStr = pkg?.tetrapayPrice ? `🌐 TetraPay: ${pkg.tetrapayPrice.toLocaleString("fa-IR")} تومان` : "🌐 TetraPay: پایه";
    await ctx.reply(
      `✏️ ویرایش بسته #${id}\n\n` +
      `💎 سکه: ${pkg?.coins ?? "?"} | 💵 پایه: ${(pkg?.price ?? 0).toLocaleString("fa-IR")} تومان\n` +
      `${cardStr}\n${cryptoStr}\n${tetrapayStr}\n\n` +
      `کدام فیلد را ویرایش می‌کنید؟`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "💎 تعداد سکه",           callback_data: `pkg_edit_field:${id}:coins`         }],
            [{ text: "💵 قیمت پایه (تومان)",   callback_data: `pkg_edit_field:${id}:price`         }],
            [{ text: "🔥 درصد تخفیف",         callback_data: `pkg_edit_field:${id}:discount`      }],
            [{ text: "🏷️ عنوان",               callback_data: `pkg_edit_field:${id}:label`         }],
            [{ text: "💳 قیمت کارت (تومان)",   callback_data: `pkg_edit_field:${id}:card_price`    }],
            [{ text: "₿ قیمت کریپتو ($USD)",  callback_data: `pkg_edit_field:${id}:crypto_price`  }],
            [{ text: "🌐 قیمت TetraPay (تومان)", callback_data: `pkg_edit_field:${id}:tetrapay_price` }],
            [{ text: "💫 قیمت Plisio ($USD)",    callback_data: `pkg_edit_field:${id}:plisio_price`   }],
          ],
        },
      }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^admin_pkg:toggle:(\d+)$/, async (ctx) => {
    if (!canDo(ctx.from!.id, "payment")) { await ctx.answerCallbackQuery("❌"); return; }
    const id  = parseInt(ctx.match![1], 10);
    const pkg = await getPackageById(id);
    if (!pkg) { await ctx.answerCallbackQuery("بسته یافت نشد"); return; }
    await updatePackage(id, { isActive: !pkg.isActive });
    await ctx.reply(`${!pkg.isActive ? "✅ فعال" : "🚫 غیرفعال"} شد: بسته #${id} (${pkg.coins} سکه)`);
    await ctx.answerCallbackQuery("✅");
  });

  bot.callbackQuery(/^pkg_edit_field:(\d+):(coins|price|discount|label|card_price|crypto_price|tetrapay_price|plisio_price)$/, async (ctx) => {
    if (!canDo(ctx.from!.id, "payment")) { await ctx.answerCallbackQuery("❌"); return; }
    const id    = parseInt(ctx.match![1], 10);
    const field = ctx.match![2]!;
    ctx.session.adminPkgEditId = id;
    ctx.session.adminAction    = `pkg_edit:${id}:${field}`;
    const labels: Record<string, string> = {
      coins:          "تعداد سکه (عدد مثبت)",
      price:          "قیمت پایه تومان (عدد مثبت)",
      discount:       "درصد تخفیف ۰-۱۰۰",
      label:          "عنوان بسته (یا - برای حذف)",
      card_price:     "قیمت کارت (تومان) — یا - برای استفاده از قیمت پایه",
      crypto_price:   "قیمت کریپتو ($USD عدد صحیح) — یا - برای استفاده از قیمت پایه",
      tetrapay_price: "قیمت TetraPay (تومان) — یا - برای استفاده از قیمت پایه",
      plisio_price:   "قیمت Plisio ($USD) — یا - برای استفاده از قیمت کریپتو",
    };
    await ctx.reply(`✏️ مقدار جدید *${labels[field] ?? field}* را وارد کنید:`, { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
  });

  // ── Callbacks: discount codes ─────────────────────────────────────────────────
  bot.callbackQuery("admin_dc:create", async (ctx) => {
    if (!canDo(ctx.from!.id, "payment")) { await ctx.answerCallbackQuery("❌"); return; }
    ctx.session.adminAction = "dc_create_code";
    await ctx.reply("🏷️ *ساخت کد تخفیف*\n\n*مرحله ۱/۳:* کد را وارد کنید (حروف انگلیسی/عدد):", { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^admin_dc:toggle:(\d+):(on|off)$/, async (ctx) => {
    if (!canDo(ctx.from!.id, "payment")) { await ctx.answerCallbackQuery("❌"); return; }
    const id     = parseInt(ctx.match![1], 10);
    const active = ctx.match![2] === "on";
    await toggleDiscountCode(id, active);
    await ctx.reply(active ? "✅ کد تخفیف فعال شد." : "❌ کد تخفیف غیرفعال شد.");
    await ctx.answerCallbackQuery("✅");
  });

  // ── Callbacks: crypto currency management ─────────────────────────────────────
  bot.callbackQuery("admin_crypto:list", async (ctx) => {
    if (!canDo(ctx.from!.id, "payment")) { await ctx.answerCallbackQuery("❌"); return; }
    const currencies = await getCryptoCurrencies();
    const kb: Array<Array<{ text: string; callback_data: string }>> = [];
    let msg = "💱 *ارزهای دیجیتال:*\n\n";
    if (currencies.length === 0) {
      msg += "_هیچ ارزی تنظیم نشده_\n";
    } else {
      currencies.forEach((c, i) => {
        msg += `${i + 1}. *${c.symbol}* (${c.network})\n   \`${c.address.slice(0, 20)}...\`\n`;
        kb.push([{ text: `🗑️ حذف ${c.symbol}`, callback_data: `admin_crypto:remove:${i}` }]);
      });
    }
    kb.push([{ text: "➕ افزودن ارز", callback_data: "admin_crypto:add" }]);
    await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: { inline_keyboard: kb } });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("admin_crypto:add", async (ctx) => {
    if (!canDo(ctx.from!.id, "payment")) { await ctx.answerCallbackQuery("❌"); return; }
    ctx.session.adminAction     = "crypto_add_symbol";
    ctx.session.adminCryptoStep = "symbol";
    await ctx.reply("💱 *افزودن ارز*\n\n*مرحله ۱/۴:* نماد ارز (مثال: USDT, BTC, ETH):", { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^admin_crypto:remove:(\d+)$/, async (ctx) => {
    if (!canDo(ctx.from!.id, "payment")) { await ctx.answerCallbackQuery("❌"); return; }
    const idx = parseInt(ctx.match![1], 10);
    const currencies = await getCryptoCurrencies();
    if (idx >= currencies.length) { await ctx.answerCallbackQuery("❌"); return; }
    const removed = currencies.splice(idx, 1)[0];
    await saveCryptoCurrencies(currencies);
    await ctx.reply(`🗑️ ارز *${removed!.symbol}* حذف شد.`, { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery("✅");
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

  // ── Backup restore: admin sends .json.gz (or .json) document to bot ──────────
  bot.on("message:document", async (ctx, next) => {
    if (!isAdmin(ctx.from!.id)) return next();
    const doc = ctx.message.document;

    // Only pick up files that look like our backups
    const fileName = doc.file_name ?? "";
    if (!fileName.match(/backup.*\.(json(\.gz)?|gz)$/i)) return next();

    await ctx.reply("⏳ در حال دریافت و بررسی فایل بکاپ...");

    try {
      // Download via Telegram File API
      const fileInfo = await bot.api.getFile(doc.file_id);
      const fileUrl  = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;
      const resp     = await fetch(fileUrl);
      if (!resp.ok) {
        await ctx.reply("❌ دانلود فایل ناموفق بود.");
        return;
      }
      const buf  = Buffer.from(await resp.arrayBuffer());
      const data = parseBackupBuffer(buf);

      const meta  = data._meta;
      const stats = meta.stats ?? {};
      const ts    = meta.timestamp ? new Date(meta.timestamp).toLocaleString("fa-IR") : "نامشخص";

      // Store file_id in session for restore confirm
      ctx.session.adminAction = `restore_confirm:${doc.file_id}`;

      await ctx.reply(
        `📦 *فایل بکاپ شناسایی شد*\n\n` +
        `🕐 تاریخ: \`${ts}\`\n` +
        `🔢 نسخه: ${meta.backupVersion}\n\n` +
        `📊 *آمار:*\n` +
        `• 👥 کاربران: *${(stats.users ?? 0).toLocaleString()}*\n` +
        `• 💰 تراکنش‌ها: *${(stats.transactions ?? 0).toLocaleString()}*\n` +
        `• 💳 پرداخت‌ها: *${(stats.payments ?? 0).toLocaleString()}*\n` +
        `• 👥 گروه‌ها: *${stats.groups ?? 0}*\n` +
        `• 📩 پیام‌های ناشناس: *${(stats.anonMessages ?? 0).toLocaleString()}*\n` +
        `• 🚨 گزارش‌ها: *${(stats.reports ?? 0).toLocaleString()}*\n\n` +
        `⚠️ *این عملیات داده‌های موجود را با upsert بازنویسی می‌کند!*\n` +
        `برای تأیید یا لغو انتخاب کنید:`,
        {
          parse_mode:   "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: "✅ بله، بازیابی شود", callback_data: "backup:restore_go" }],
              [{ text: "❌ لغو",               callback_data: "backup:restore_cancel" }],
            ],
          },
        }
      );
    } catch (err: any) {
      if (err?.message === "NOT_A_BACKUP") {
        await ctx.reply("❌ این فایل یک بکاپ معتبر نیست.");
      } else {
        console.error("Backup parse error:", err);
        await ctx.reply(`❌ خطا در پردازش فایل: ${err?.message ?? "خطای نامشخص"}`);
      }
    }
  });

  // ── Restore confirm ──────────────────────────────────────────────────────────
  bot.callbackQuery("backup:restore_go", async (ctx) => {
    if (!isAdmin(ctx.from!.id)) { await ctx.answerCallbackQuery("❌"); return; }
    await ctx.answerCallbackQuery("⏳ در حال بازیابی...");

    const action  = ctx.session.adminAction ?? "";
    const fileId  = action.startsWith("restore_confirm:") ? action.slice("restore_confirm:".length) : null;
    ctx.session.adminAction = undefined;

    if (!fileId) {
      await ctx.reply("❌ فایل بکاپ یافت نشد. لطفاً مجدداً فایل را ارسال کنید.");
      return;
    }

    const progressMsg = await ctx.reply("⏳ *در حال بازیابی اطلاعات...*\nاین فرایند ممکن است چند دقیقه طول بکشد.", { parse_mode: "Markdown" });

    try {
      const fileInfo = await bot.api.getFile(fileId);
      const fileUrl  = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;
      const resp     = await fetch(fileUrl);
      const buf      = Buffer.from(await resp.arrayBuffer());
      const data     = parseBackupBuffer(buf);

      const result = await restoreFromBackup(data);

      const restoredLines = Object.entries(result.restored)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `• ${k}: *${n.toLocaleString()}*`)
        .join("\n");

      const skippedTotal = Object.values(result.skipped).reduce((a, b) => a + b, 0);

      await bot.api.editMessageText(
        ctx.chat!.id,
        progressMsg.message_id,
        `✅ *بازیابی کامل شد!*\n\n` +
        `📊 *بازیابی شده:*\n${restoredLines || "—"}\n\n` +
        (skippedTotal > 0 ? `⚠️ نادیده گرفته شده: ${skippedTotal}\n\n` : "") +
        (result.errors.length > 0 ? `❌ خطاهای جزئی (${result.errors.length}):\n${result.errors.slice(0, 5).join("\n")}\n\n` : "") +
        `_سیستم آماده استفاده است._`,
        { parse_mode: "Markdown" }
      ).catch(() => {});

    } catch (err: any) {
      console.error("Restore error:", err);
      await ctx.reply(`❌ خطا در بازیابی: ${err?.message ?? "خطای نامشخص"}`);
    }
  });

  bot.callbackQuery("backup:restore_cancel", async (ctx) => {
    ctx.session.adminAction = undefined;
    await ctx.editMessageText("❌ بازیابی لغو شد.").catch(() => {});
    await ctx.answerCallbackQuery("لغو شد");
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

  bot.callbackQuery(/^admin_unrestrict:(\d+)$/, async (ctx) => {
    if (!canDo(ctx.from!.id, "ban_user")) { await ctx.answerCallbackQuery("❌"); return; }
    const uid = parseInt(ctx.match![1], 10);
    await db
      .update(usersTable)
      .set({ status: "active", restrictedUntil: null, updatedAt: new Date() })
      .where(eq(usersTable.telegramId, uid));
    await ctx.editMessageText(
      `✅ *محدودیت کاربر \`${uid}\` توسط ادمین برداشته شد.*`,
      { parse_mode: "Markdown", reply_markup: undefined }
    );
    await ctx.answerCallbackQuery("✅ رفع محدودیت شد");
    await getBotInstance().api.sendMessage(
      uid,
      `✅ *ادمین محدودیت حساب شما را برداشت.*\n\nاکنون می‌تونی از تمام امکانات ربات استفاده کنی! 🎉`,
      { parse_mode: "Markdown" }
    ).catch(() => {});
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
      reply_markup: adminUserActionsKeyboard(user.telegramId, "fa", user.status === "banned", user.status === "restricted"),
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
        reply_markup: adminUserActionsKeyboard(user.telegramId, "fa", user.status === "banned", user.status === "restricted"),
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

    if (action === "set_referral_banner") {
      if (text === "0") {
        await ctx.reply("❌ لغو شد. بنر تغییر نکرد.");
      } else {
        await setSetting("referral_banner_text", text);
        await ctx.reply(
          `✅ *متن بنر رفرال ذخیره شد!*\n\n` +
          `متغیرها موقع ارسال خودکار جایگزین می‌شوند:\n` +
          `\`{link}\` ← لینک دعوت\n` +
          `\`{inviterReward}\` ← سکه دعوت‌کننده\n` +
          `\`{inviteeReward}\` ← سکه دعوت‌شده\n` +
          `\`{botUsername}\` ← نام ربات`,
          { parse_mode: "Markdown" }
        );
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

    if (action.startsWith("broadcast_send:")) {
      const target    = (ctx.session.broadcastTarget ?? action.replace("broadcast_send:", "")) as "all" | "active";
      const gender    = ctx.session.broadcastGender;
      const ageRange  = ctx.session.broadcastAgeRange ?? "any";
      const countLimit = ctx.session.broadcastCountLimit ?? 0;

      // Parse age range
      let ageMin: number | undefined;
      let ageMax: number | undefined;
      if (ageRange !== "any") {
        const [minStr, maxStr] = ageRange.split("-");
        if (minStr) ageMin = parseInt(minStr, 10);
        if (maxStr) ageMax = parseInt(maxStr, 10);
      }

      const filter = {
        gender: gender && gender !== "any" ? gender as "male" | "female" : undefined,
        ageMin,
        ageMax,
        limit: countLimit > 0 ? countLimit : undefined,
      };

      await ctx.reply("📢 در حال ارسال...");
      const { sent, failed, total } = await broadcastMessage(bot, tgId, text, target, filter);
      await ctx.reply(
        `✅ *ارسال همگانی تمام شد!*\n\n` +
        `📤 ارسال‌شده: *${sent}* نفر\n` +
        `❌ خطا: *${failed}* نفر\n` +
        `👥 کل مخاطب: *${total}* نفر`,
        { parse_mode: "Markdown" }
      );
      // Clear broadcast state
      ctx.session.broadcastGender     = undefined;
      ctx.session.broadcastAgeRange   = undefined;
      ctx.session.broadcastCountLimit = undefined;
      ctx.session.broadcastTarget     = undefined;
      return;
    }

    if (action === "add_badword") {
      // Split by comma, semicolon, or newline — supports both single and bulk entry
      const rawList = text.split(/[,،;\n]+/).map((w) => w.trim()).filter(Boolean);
      if (rawList.length > 1) {
        const { added, skipped } = await addBadWordsBulk(rawList);
        await ctx.reply(
          `✅ *${added}* کلمه به لیست فیلتر اضافه شد.\n` +
          (skipped > 0 ? `⏭️ *${skipped}* کلمه قبلاً موجود بود و نادیده گرفته شد.` : ""),
          { parse_mode: "Markdown" }
        );
      } else {
        await addBadWord(text.trim());
        await ctx.reply(`✅ کلمه *"${text.trim()}"* به لیست فیلتر اضافه شد.`, { parse_mode: "Markdown" });
      }
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

    // ── Package create flow ────────────────────────────────────────────────
    if (action === "admin_pkg_create_coins") {
      const coins = parseInt(text, 10);
      if (isNaN(coins) || coins < 1) {
        await ctx.reply("❌ عدد صحیح مثبت وارد کنید.");
        ctx.session.adminAction = "admin_pkg_create_coins";
        return;
      }
      ctx.session.adminPkgCoins  = coins;
      ctx.session.adminAction    = "admin_pkg_create_price";
      await ctx.reply(`✅ سکه: *${coins}*\n\n*مرحله ۲/۷:* قیمت پایه (تومان) را وارد کنید:`, { parse_mode: "Markdown" });
      return;
    }

    if (action === "admin_pkg_create_price") {
      const price = parseInt(text, 10);
      if (isNaN(price) || price < 1) {
        await ctx.reply("❌ عدد صحیح مثبت وارد کنید.");
        ctx.session.adminAction = "admin_pkg_create_price";
        return;
      }
      ctx.session.adminPkgPrice = price;
      ctx.session.adminAction   = "admin_pkg_create_discount";
      await ctx.reply(
        `✅ قیمت پایه: *${price.toLocaleString("fa-IR")}* تومان\n\n*مرحله ۳/۷:* درصد تخفیف (۰ = بدون تخفیف):`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    if (action === "admin_pkg_create_discount") {
      const disc = parseInt(text, 10);
      if (isNaN(disc) || disc < 0 || disc > 100) {
        await ctx.reply("❌ عددی بین ۰ تا ۱۰۰ وارد کنید.");
        ctx.session.adminAction = "admin_pkg_create_discount";
        return;
      }
      ctx.session.adminPkgDiscount = disc;
      ctx.session.adminAction      = "admin_pkg_create_label";
      await ctx.reply(
        `✅ تخفیف: *${disc}%*\n\n*مرحله ۴/۷:* عنوان بسته (یا - برای پیش‌فرض):`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    if (action === "admin_pkg_create_label") {
      const label = (text === "-" || text === "رد") ? null : text;
      ctx.session.adminPkgLabel = label ?? "";
      ctx.session.adminAction   = "admin_pkg_create_card_price";
      await ctx.reply(
        `✅ عنوان: *${label ?? "پیش‌فرض"}*\n\n` +
        `*مرحله ۵/۷:* قیمت ویژه کارت (تومان)\n` +
        `_یا دقیقاً \`-\` بفرستید تا از قیمت پایه استفاده شود:_`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    if (action === "admin_pkg_create_card_price") {
      if (text.trim() === "-") {
        ctx.session.adminPkgCardPrice = undefined;
      } else {
        const v = parseInt(text, 10);
        if (isNaN(v) || v < 1) { await ctx.reply("❌ عدد مثبت یا - وارد کنید."); return; }
        ctx.session.adminPkgCardPrice = v;
      }
      ctx.session.adminAction = "admin_pkg_create_crypto_price";
      await ctx.reply(
        `✅ قیمت کارت: *${ctx.session.adminPkgCardPrice ? ctx.session.adminPkgCardPrice.toLocaleString("fa-IR") + " تومان" : "قیمت پایه"}*\n\n` +
        `*مرحله ۶/۷:* قیمت ویژه کریپتو ($USD — عدد صحیح)\n` +
        `_یا دقیقاً \`-\` بفرستید تا از قیمت پایه استفاده شود:_`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    if (action === "admin_pkg_create_crypto_price") {
      if (text.trim() === "-") {
        ctx.session.adminPkgCryptoPrice = undefined;
      } else {
        const v = parseInt(text, 10);
        if (isNaN(v) || v < 1) { await ctx.reply("❌ عدد مثبت یا - وارد کنید."); return; }
        ctx.session.adminPkgCryptoPrice = v;
      }
      ctx.session.adminAction = "admin_pkg_create_tetrapay_price";
      await ctx.reply(
        `✅ قیمت کریپتو: *${ctx.session.adminPkgCryptoPrice ? "$" + ctx.session.adminPkgCryptoPrice : "قیمت پایه"}*\n\n` +
        `*مرحله ۷/۷:* قیمت ویژه TetraPay (تومان)\n` +
        `_یا دقیقاً \`-\` بفرستید تا از قیمت پایه استفاده شود:_`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    if (action === "admin_pkg_create_tetrapay_price") {
      if (text.trim() === "-") {
        ctx.session.adminPkgTetrapayPrice = undefined;
      } else {
        const v = parseInt(text, 10);
        if (isNaN(v) || v < 1) { await ctx.reply("❌ عدد مثبت یا - وارد کنید."); return; }
        ctx.session.adminPkgTetrapayPrice = v;
      }
      ctx.session.adminAction = "admin_pkg_create_plisio_price";
      await ctx.reply(
        `✅ قیمت TetraPay: *${ctx.session.adminPkgTetrapayPrice ? ctx.session.adminPkgTetrapayPrice.toLocaleString("fa-IR") + " تومان" : "قیمت پایه"}*\n\n` +
        `*مرحله ۸/۸:* قیمت ویژه Plisio ($USD — عدد صحیح)\n` +
        `_یا دقیقاً \`-\` بفرستید تا از قیمت کریپتو استفاده شود:_`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    if (action === "admin_pkg_create_plisio_price") {
      if (text.trim() === "-") {
        ctx.session.adminPkgPlisioPrice = undefined;
      } else {
        const v = parseInt(text, 10);
        if (isNaN(v) || v < 1) { await ctx.reply("❌ عدد مثبت یا - وارد کنید."); return; }
        ctx.session.adminPkgPlisioPrice = v;
      }

      const coins         = ctx.session.adminPkgCoins    ?? 10;
      const price         = ctx.session.adminPkgPrice    ?? 10000;
      const discount      = ctx.session.adminPkgDiscount ?? 0;
      const label         = ctx.session.adminPkgLabel === "" ? null : (ctx.session.adminPkgLabel ?? null);
      const origPrice     = discount > 0 ? Math.round(price / (1 - discount / 100)) : undefined;
      const cardPrice     = ctx.session.adminPkgCardPrice;
      const cryptoPrice   = ctx.session.adminPkgCryptoPrice;
      const tetrapayPrice = ctx.session.adminPkgTetrapayPrice;
      const plisioPrice   = ctx.session.adminPkgPlisioPrice;

      ctx.session.adminPkgCoins         = undefined;
      ctx.session.adminPkgPrice         = undefined;
      ctx.session.adminPkgDiscount      = undefined;
      ctx.session.adminPkgStep          = undefined;
      ctx.session.adminPkgLabel         = undefined;
      ctx.session.adminPkgCardPrice     = undefined;
      ctx.session.adminPkgCryptoPrice   = undefined;
      ctx.session.adminPkgTetrapayPrice = undefined;
      ctx.session.adminPkgPlisioPrice   = undefined;

      const pkg = await createPackage({
        coins, price, originalPrice: origPrice,
        discountPercent: discount,
        label: label ?? undefined,
        cardPrice, cryptoPrice, tetrapayPrice, plisioPrice,
      });
      await ctx.reply(
        `📦 *بسته جدید ساخته شد!*\n\n` +
        `💎 سکه: *${pkg.coins}*\n` +
        `💵 قیمت پایه: *${pkg.price.toLocaleString("fa-IR")}* تومان\n` +
        (discount > 0 ? `🔥 تخفیف: *${discount}%*\n` : "") +
        (label ? `🏷️ عنوان: *${label}*\n` : "") +
        (cardPrice    ? `💳 کارت: *${cardPrice.toLocaleString("fa-IR")}* تومان\n`    : "") +
        (cryptoPrice  ? `₿ کریپتو: *$${cryptoPrice}*\n`                             : "") +
        (tetrapayPrice ? `🌐 TetraPay: *${tetrapayPrice.toLocaleString("fa-IR")}* تومان\n` : "") +
        (plisioPrice   ? `💫 Plisio: *$${plisioPrice}*\n`                             : "") +
        `✅ شناسه: #${pkg.id}`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    if (action.startsWith("pkg_edit:")) {
      const parts = action.split(":");
      const id    = parseInt(parts[1]!, 10);
      const field = parts[2]!;
      if (field === "coins") {
        const v = parseInt(text, 10);
        if (isNaN(v) || v < 1) { await ctx.reply("❌ عدد مثبت وارد کنید."); return; }
        await updatePackage(id, { coins: v });
      } else if (field === "price") {
        const v = parseInt(text, 10);
        if (isNaN(v) || v < 1) { await ctx.reply("❌ عدد مثبت وارد کنید."); return; }
        await updatePackage(id, { price: v });
      } else if (field === "discount") {
        const v = parseInt(text, 10);
        if (isNaN(v) || v < 0 || v > 100) { await ctx.reply("❌ عدد ۰-۱۰۰ وارد کنید."); return; }
        await updatePackage(id, { discountPercent: v });
      } else if (field === "label") {
        await updatePackage(id, { label: text === "-" ? null : text });
      } else if (field === "card_price") {
        if (text.trim() === "-") {
          await updatePackage(id, { cardPrice: null });
        } else {
          const v = parseInt(text, 10);
          if (isNaN(v) || v < 1) { await ctx.reply("❌ عدد مثبت یا - وارد کنید."); return; }
          await updatePackage(id, { cardPrice: v });
        }
      } else if (field === "crypto_price") {
        if (text.trim() === "-") {
          await updatePackage(id, { cryptoPrice: null });
        } else {
          const v = parseInt(text, 10);
          if (isNaN(v) || v < 1) { await ctx.reply("❌ عدد مثبت یا - وارد کنید."); return; }
          await updatePackage(id, { cryptoPrice: v });
        }
      } else if (field === "tetrapay_price") {
        if (text.trim() === "-") {
          await updatePackage(id, { tetrapayPrice: null });
        } else {
          const v = parseInt(text, 10);
          if (isNaN(v) || v < 1) { await ctx.reply("❌ عدد مثبت یا - وارد کنید."); return; }
          await updatePackage(id, { tetrapayPrice: v });
        }
      } else if (field === "plisio_price") {
        if (text.trim() === "-") {
          await updatePackage(id, { plisioPrice: null });
        } else {
          const v = parseInt(text, 10);
          if (isNaN(v) || v < 1) { await ctx.reply("❌ عدد مثبت یا - وارد کنید."); return; }
          await updatePackage(id, { plisioPrice: v });
        }
      }
      ctx.session.adminPkgEditId = undefined;
      ctx.session.adminAction    = undefined;
      await ctx.reply(`✅ بسته #${id} با موفقیت ویرایش شد.`);
      return;
    }

    // ── Discount code create flow ──────────────────────────────────────────
    if (action === "dc_create_code") {
      const code = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (code.length < 3) {
        await ctx.reply("❌ کد باید حداقل ۳ کاراکتر انگلیسی/عدد باشد.");
        ctx.session.adminAction = "dc_create_code";
        return;
      }
      ctx.session.adminDcCode = code;
      ctx.session.adminAction = "dc_create_percent";
      await ctx.reply(`✅ کد: \`${code}\`\n\n*مرحله ۲/۳:* درصد تخفیف (۱-۱۰۰):`, { parse_mode: "Markdown" });
      return;
    }

    if (action === "dc_create_percent") {
      const pct = parseInt(text, 10);
      if (isNaN(pct) || pct < 1 || pct > 100) {
        await ctx.reply("❌ عددی بین ۱ تا ۱۰۰ وارد کنید.");
        ctx.session.adminAction = "dc_create_percent";
        return;
      }
      ctx.session.adminDcPercent = pct;
      ctx.session.adminAction    = "dc_create_maxuses";
      await ctx.reply(
        `✅ تخفیف: *${pct}%*\n\n*مرحله ۳/۳:* حداکثر استفاده (۰ = نامحدود):`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    if (action === "dc_create_maxuses") {
      const max  = parseInt(text, 10);
      if (isNaN(max) || max < 0) {
        await ctx.reply("❌ عدد غیرمنفی وارد کنید (۰ = نامحدود).");
        ctx.session.adminAction = "dc_create_maxuses";
        return;
      }
      const code = ctx.session.adminDcCode   ?? "";
      const pct  = ctx.session.adminDcPercent ?? 10;
      ctx.session.adminDcCode    = undefined;
      ctx.session.adminDcPercent = undefined;
      await createDiscountCode({ code, discountPercent: pct, maxUses: max > 0 ? max : undefined });
      await ctx.reply(
        `🏷️ *کد تخفیف ساخته شد!*\n\n` +
        `📋 کد: \`${code}\`\n` +
        `💥 تخفیف: *${pct}%*\n` +
        `👥 حداکثر استفاده: *${max > 0 ? max : "نامحدود"}*`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    // ── Crypto currency add flow ───────────────────────────────────────────
    if (action === "crypto_add_symbol") {
      ctx.session.adminCryptoSymbol = text.toUpperCase().trim();
      ctx.session.adminAction       = "crypto_add_name";
      await ctx.reply(
        `✅ نماد: *${ctx.session.adminCryptoSymbol}*\n\n*مرحله ۲/۴:* نام ارز (مثال: Tether):`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    if (action === "crypto_add_name") {
      ctx.session.adminCryptoName = text;
      ctx.session.adminAction     = "crypto_add_address";
      await ctx.reply(`✅ نام: *${text}*\n\n*مرحله ۳/۴:* آدرس کیف پول:`, { parse_mode: "Markdown" });
      return;
    }

    if (action === "crypto_add_address") {
      ctx.session.adminCryptoAddress = text.trim();
      ctx.session.adminAction        = "crypto_add_network";
      await ctx.reply(
        `✅ آدرس ثبت شد\n\n*مرحله ۴/۴:* نام شبکه (مثال: TRC20, ERC20, BEP20):`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    if (action === "crypto_add_network") {
      const symbol  = ctx.session.adminCryptoSymbol  ?? "TOKEN";
      const name    = ctx.session.adminCryptoName    ?? symbol;
      const address = ctx.session.adminCryptoAddress ?? "";
      const network = text.trim();
      const cgMap: Record<string, string> = {
        USDT: "tether", BTC: "bitcoin", ETH: "ethereum", BNB: "binancecoin",
        TRX: "tron", LTC: "litecoin", DOGE: "dogecoin", ADA: "cardano",
        SOL: "solana", MATIC: "matic-network", TON: "the-open-network",
      };
      const cgId = cgMap[symbol] ?? symbol.toLowerCase();
      ctx.session.adminCryptoSymbol  = undefined;
      ctx.session.adminCryptoName    = undefined;
      ctx.session.adminCryptoAddress = undefined;
      ctx.session.adminCryptoStep    = undefined;

      const currencies = await getCryptoCurrencies();
      currencies.push({ symbol, name, address, network, coinGeckoId: cgId });
      await saveCryptoCurrencies(currencies);
      await ctx.reply(
        `💱 *ارز اضافه شد!*\n\n💎 ${symbol} — ${name}\n🌐 شبکه: ${network}\n📋 آدرس: \`${address.slice(0, 20)}...\``,
        { parse_mode: "Markdown" }
      );
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
    `🔮 *اقیانوس*\n` +
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
  const [inviterReward, inviteeReward, signupBonus, supportLink, bannerText] = await Promise.all([
    getSetting("referral_reward_inviter"),
    getSetting("referral_reward_invitee"),
    getSetting("signup_bonus"),
    getSetting("support_link"),
    getSetting("referral_banner_text"),
  ]);
  const bannerPreview = bannerText
    ? bannerText.slice(0, 80) + (bannerText.length > 80 ? "..." : "")
    : "پیش‌فرض (خودکار)";
  await ctx.reply(
    `🎁 *رفرال و پاداش‌ها*\n\n` +
    `🎉 سکه خوش‌آمدگویی (کاربر جدید): \`${signupBonus ?? "15"}\` سکه\n` +
    `🎁 پاداش دعوت‌کننده: \`${inviterReward ?? "10"}\` سکه\n` +
    `🎁 پاداش دعوت‌شده: \`${inviteeReward ?? "5"}\` سکه\n` +
    `📞 لینک پشتیبانی: ${supportLink ?? "تنظیم نشده"}\n` +
    `📝 متن بنر: ${bannerPreview}`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🎉 سکه خوش‌آمدگویی",  callback_data: "pay_set:signup_bonus" }],
          [{ text: "🎁 پاداش دعوت‌کننده", callback_data: "pay_set:referral_reward_inviter" }],
          [{ text: "🎁 پاداش دعوت‌شده",   callback_data: "pay_set:referral_reward_invitee" }],
          [{ text: "📞 لینک پشتیبانی",     callback_data: "pay_set:support_link" }],
          [{ text: "📝 ویرایش متن بنر رفرال", callback_data: "admin:edit_referral_banner" }],
          ...(bannerText ? [[{ text: "🗑️ حذف بنر سفارشی (برگشت به پیش‌فرض)", callback_data: "admin:clear_referral_banner" }]] : []),
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
  const lastBackup = config?.lastBackupAt
    ? `\n🕐 آخرین بکاپ: \`${new Date(config.lastBackupAt).toLocaleString("fa-IR")}\``
    : "";
  await ctx.reply(
    `💾 *تنظیمات بکاپ*\n\nوضعیت: ${status}${lastBackup}\n\n` +
    `📥 *بازیابی:* برای بازیابی، فایل \`backup_*.json.gz\` را مستقیم به ربات ارسال کنید.`,
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
