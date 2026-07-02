import { Bot, InlineKeyboard } from "grammy";
import type { BotContext } from "../context.js";
import { getUserByTelegramId } from "../services/user.service.js";
import { getSetting } from "../services/payment.service.js";
import { getCallCost } from "../../call/coin-guard.js";
import { t } from "../i18n/index.js";
import { mainMenuKeyboard } from "../keyboards/main.js";

export function registerCallHandlers(bot: Bot<BotContext>): void {
  bot.hears([/^📞 تماس ناشناس/, /^📞 Anonymous Call/], async (ctx) => {
    const tgId = ctx.from!.id;
    const user  = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang  = (user?.language as "fa" | "en") ?? "fa";

    const callEnabled = await getSetting("call_enabled");
    if (callEnabled === "0") {
      await ctx.reply(
        lang === "fa"
          ? "❌ ویژگی تماس ناشناس در حال حاضر غیرفعال است."
          : "❌ Anonymous Call feature is currently disabled.",
        { reply_markup: mainMenuKeyboard(lang) }
      );
      return;
    }

    const minBalance = parseInt((await getSetting("call_min_balance")) ?? "3", 10);
    const coins = user?.coins ?? 0;
    if (coins < minBalance) {
      await ctx.reply(
        lang === "fa"
          ? `❌ موجودی سکه شما کافی نیست.\n\n💰 حداقل موجودی برای تماس: *${minBalance} سکه*\n🪙 موجودی شما: *${coins} سکه*\n\nاز منوی 🛒 خرید سکه، موجودی خود را افزایش دهید.`
          : `❌ Insufficient coin balance.\n\n💰 Minimum balance to call: *${minBalance} coins*\n🪙 Your balance: *${coins} coins*`,
        { parse_mode: "Markdown", reply_markup: mainMenuKeyboard(lang) }
      );
      return;
    }

    const videoEnabled = await getSetting("call_video_enabled");
    const [voiceRandom, voiceGender, videoRandom, videoGender] = await Promise.all([
      getCallCost("voice", "random"),
      getCallCost("voice", "gender" as any).then(() => getCallCost("voice", "male")),
      getCallCost("video", "random"),
      getCallCost("video", "male"),
    ]);

    const miniAppUrl = `https://tisabuy.com/call/?initData=`;

    const costText = lang === "fa"
      ? `🎤 تماس صوتی:\n` +
        `  • شانسی: ${voiceRandom} سکه\n` +
        `  • با جنسیت خاص: ${voiceGender} سکه\n\n` +
        (videoEnabled !== "0"
          ? `📹 تماس تصویری:\n` +
            `  • شانسی: ${videoRandom} سکه\n` +
            `  • با جنسیت خاص: ${videoGender} سکه\n\n`
          : "")
      : `🎤 Voice Call:\n` +
        `  • Random: ${voiceRandom} coins\n` +
        `  • Gender filter: ${voiceGender} coins\n\n` +
        (videoEnabled !== "0"
          ? `📹 Video Call:\n` +
            `  • Random: ${videoRandom} coins\n` +
            `  • Gender filter: ${videoGender} coins\n\n`
          : "");

    const kb = new InlineKeyboard().webApp(
      lang === "fa" ? "📞 باز کردن تماس ناشناس" : "📞 Open Anonymous Call",
      `https://tisabuy.com/call/`
    );

    await ctx.reply(
      lang === "fa"
        ? `📞 *تماس ناشناس*\n\n` +
          `با افراد ناشناس تماس صوتی یا تصویری بگیرید.\n` +
          `هویت شما کاملاً محفوظ می‌ماند.\n\n` +
          `💰 *هزینه اتصال:*\n${costText}` +
          `🪙 موجودی فعلی شما: *${coins} سکه*`
        : `📞 *Anonymous Call*\n\n` +
          `Make voice or video calls with anonymous strangers.\n` +
          `Your identity is fully protected.\n\n` +
          `💰 *Connection cost:*\n${costText}` +
          `🪙 Your balance: *${coins} coins*`,
      { parse_mode: "Markdown", reply_markup: kb }
    );
  });
}
