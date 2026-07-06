import { Bot } from "grammy";
import type { BotContext } from "../context.js";
import {
  getOrCreateUser,
  updateUser,
  setUserSetupStep,
  setUserLanguage,
  getUserByTelegramId,
  getUserByAnonToken,
  getUserByReferralCode,
  getUserReferral,
} from "../services/user.service.js";
import { processReferralReward, deductCoins, addCoins, getBalance } from "../services/coin.service.js";
import { getSetting } from "../services/payment.service.js";
import { getActiveSession, endChatSession } from "../services/matching.service.js";
import {
  getGroupByInviteToken,
  joinGroupByInvite,
  getGroupMembers,
  generateGroupUserId,
  isUserBannedFromGroup,
  getExistingMembership,
  reactivateAndGetRole,
  getUserGroup,
  leaveGroup,
} from "../services/group.service.js";
import { eq as eqDrizzle } from "drizzle-orm";
import { t } from "../i18n/index.js";
import { languageKeyboard, genderKeyboard, mainMenuKeyboard, groupControlKeyboard, coinsSubMenuKeyboard } from "../keyboards/main.js";

// Bilingual welcome shown before language is selected
const BILINGUAL_WELCOME =
  "👋 سلام! به ربات ناشناس خوش آمدید!\n" +
  "🇮🇷 لطفاً زبان خود را انتخاب کنید:\n\n" +
  "👋 Welcome to the Anonymous Chat Bot!\n" +
  "🇬🇧 Please select your language:";

export function registerStartHandler(bot: Bot<BotContext>) {
  // /start command
  bot.command("start", async (ctx) => {
    const tgId = ctx.from!.id;
    const arg = ctx.match?.trim() ?? "";

    // ── 1a. Handle group invite link (g_ prefix) ────────────────────────────
    if (arg.startsWith("g_")) {
      const token = arg.slice(2);
      // Named groups may have status="ended" in DB but are re-activatable, so don't filter by status here
      const group = await getGroupByInviteToken(token);
      if (group) {
        // Anonymous groups that ended are gone; named groups are always joinable
        const isAnonymousEnded = group.status === "ended" && !group.creatorId;
        if (!isAnonymousEnded) {
          const user = await getOrCreateUser(tgId, ctx.from!.first_name, ctx.from!.username);
          const lang = (user.language as "fa" | "en") ?? "fa";

          if (!user.gender || !user.age) {
            // Incomplete user → normal setup
            await setUserLanguage(tgId, "fa");
            await setUserSetupStep(tgId, "select_language");
            const customWelcome = await getSetting("welcome_message");
            if (customWelcome) await ctx.reply(customWelcome);
            await ctx.reply(BILINGUAL_WELCOME, { reply_markup: languageKeyboard() });
            return;
          }

          // Check if user is already a member of this specific group
          const membership = await getExistingMembership(tgId, group.id);
          if (membership.exists) {
            // Re-enter the group they already belong to (no coin charge)
            await reactivateAndGetRole(tgId, group.id);
            const myAlias = await generateGroupUserId(tgId, group.id);
            await ctx.reply(
              lang === "fa"
                ? `✅ به گروه بازگشتید.\n🆔 نام شما: ${myAlias}`
                : `✅ Welcome back to the group.\n🆔 Your alias: ${myAlias}`,
              { reply_markup: groupControlKeyboard(lang) }
            );
            return;
          }

          // User not in this group — check if they're in another group/chat
          if (user.isInGroup || user.isInChat) {
            await ctx.reply(t(lang).alreadyInGroup, { reply_markup: mainMenuKeyboard(lang) });
            return;
          }

          const isBanned = await isUserBannedFromGroup(tgId, group.id);
          if (isBanned) {
            await ctx.reply(t(lang).errorGeneral, { reply_markup: mainMenuKeyboard(lang) });
            return;
          }

          if (group.memberCount >= group.maxMembers) {
            await ctx.reply(lang === "fa" ? "⚠️ این گروه پر است." : "⚠️ This group is full.", {
              reply_markup: mainMenuKeyboard(lang),
            });
            return;
          }

          // Invite-link joins are always free — the creator sent this link personally.
          // In-bot group discovery (group.ts) applies the configurable join cost separately.
          const { memberCount } = await joinGroupByInvite(tgId, group.id);
          const myAlias = await generateGroupUserId(tgId, group.id);

          await ctx.reply(t(lang).groupJoined.replace("{count}", memberCount.toString()), {
            reply_markup: groupControlKeyboard(lang),
          });

          const members = await getGroupMembers(group.id);
          for (const memberId of members) {
            if (memberId === tgId) continue;
            const mUser = await getUserByTelegramId(memberId);
            const mLang = (mUser?.language as "fa" | "en") ?? "fa";
            await bot.api.sendMessage(memberId, t(mLang).memberJoined(myAlias, memberCount)).catch(() => {});
          }
          return;
        }
      }
      // Invalid/expired token → fall through to normal /start
    }

    // ── 1b. Handle anonymous link (a_ or anon_ prefix) ──────────────────────
    if (arg.startsWith("a_") || arg.startsWith("anon_")) {
      const token = arg.startsWith("a_") ? arg.slice(2) : arg.slice(5);
      const receiver = await getUserByAnonToken(token);
      if (receiver && receiver.telegramId !== tgId) {
        const sender = await getOrCreateUser(tgId, ctx.from!.first_name, ctx.from!.username);
        const lang = (sender.language as "fa" | "en") ?? "fa";

        // Check if receiver has disabled their link
        if (!receiver.anonLinkEnabled) {
          await ctx.reply(t(lang).anonLinkDisabledForSender, {
            reply_markup: sender.gender && sender.age ? mainMenuKeyboard(lang) : undefined,
          });
          return;
        }

        if (!sender.gender || !sender.age) {
          // New/incomplete user → save pending anon + start setup
          ctx.session.step = `pending_anon:${receiver.telegramId}`;
          await setUserLanguage(tgId, "fa");
          await setUserSetupStep(tgId, "select_language");
          const customWelcome = await getSetting("welcome_message");
          if (customWelcome) await ctx.reply(customWelcome);
          await ctx.reply(BILINGUAL_WELCOME, { reply_markup: languageKeyboard() });
          return;
        }

        // Existing complete user → go directly to anon send
        ctx.session.step = `anon_send:${receiver.telegramId}`;
        const receiverName = receiver.firstName ?? (lang === "fa" ? "کاربر" : "User");
        const { cancelAnonKeyboard } = await import("./anonymous-link.js");
        await ctx.reply(t(lang).sendAnonMsg(receiverName), {
          parse_mode: "HTML",
          reply_markup: cancelAnonKeyboard(receiverName, lang),
        });
        return;
      }
      // Invalid token or self-link → fall through to normal /start
    }

    // ── 1c. Handle timed anonymous link (t_ prefix) ──────────────────────────
    if (arg.startsWith("t_")) {
      const token = arg.slice(2);
      const { db, timedAnonLinksTable } = await import("@workspace/db");
      const [timedLink] = await db
        .select()
        .from(timedAnonLinksTable)
        .where(eqDrizzle(timedAnonLinksTable.token, token))
        .limit(1);

      if (timedLink && timedLink.expiresAt > new Date() && timedLink.userId !== tgId) {
        const sender = await getOrCreateUser(tgId, ctx.from!.first_name, ctx.from!.username);
        const lang = (sender.language as "fa" | "en") ?? "fa";

        // Get receiver info for name display and enabled check
        const timedReceiver = await getUserByTelegramId(timedLink.userId);

        // Check if receiver has disabled their link
        if (timedReceiver && !timedReceiver.anonLinkEnabled) {
          await ctx.reply(t(lang).anonLinkDisabledForSender, {
            reply_markup: sender.gender && sender.age ? mainMenuKeyboard(lang) : undefined,
          });
          return;
        }

        if (!sender.gender || !sender.age) {
          ctx.session.step = `pending_anon:${timedLink.userId}`;
          await setUserLanguage(tgId, "fa");
          await setUserSetupStep(tgId, "select_language");
          const customWelcome = await getSetting("welcome_message");
          if (customWelcome) await ctx.reply(customWelcome);
          await ctx.reply(BILINGUAL_WELCOME, { reply_markup: languageKeyboard() });
          return;
        }

        ctx.session.step = `anon_send:${timedLink.userId}`;
        const receiverName = timedReceiver?.firstName ?? (lang === "fa" ? "کاربر" : "User");
        const { cancelAnonKeyboard } = await import("./anonymous-link.js");
        await ctx.reply(t(lang).sendAnonMsg(receiverName), {
          parse_mode: "HTML",
          reply_markup: cancelAnonKeyboard(receiverName, lang),
        });
        return;
      }
      // Expired / invalid → show message
      const lang = "fa";
      await ctx.reply(t(lang).timedLinkInvalid);
    }

    // ── 1d. Handle Pro Permanent link (ap_ prefix) ───────────────────────────
    if (arg.startsWith("ap_")) {
      const slug = arg.slice(3);
      const { db, proAnonLinksTable } = await import("@workspace/db");
      const { or } = await import("drizzle-orm");
      const [proLink] = await db
        .select()
        .from(proAnonLinksTable)
        .where(or(eqDrizzle(proAnonLinksTable.token, slug), eqDrizzle(proAnonLinksTable.alias, slug)))
        .limit(1);

      if (proLink && proLink.tier === "permanent") {
        if (!proLink.isEnabled) {
          await ctx.reply(t("fa").proLinkDisabled);
          return;
        }
        if (proLink.userId === tgId) {
          await ctx.reply("❌ نمی‌توانید برای خودتان پیام بفرستید.");
          return;
        }
        const sender = await getOrCreateUser(tgId, ctx.from!.first_name, ctx.from!.username);
        const sLang = (sender.language as "fa" | "en") ?? "fa";

        if (!sender.gender || !sender.age) {
          ctx.session.step = `pending_pro:${proLink.userId}:${proLink.id}:permanent`;
          await setUserLanguage(tgId, "fa");
          await setUserSetupStep(tgId, "select_language");
          const customWelcome = await getSetting("welcome_message");
          if (customWelcome) await ctx.reply(customWelcome);
          await ctx.reply(BILINGUAL_WELCOME, { reply_markup: languageKeyboard() });
          return;
        }

        ctx.session.step = `pro_send:${proLink.userId}:${proLink.id}:permanent`;
        const ownerUser = await getUserByTelegramId(proLink.userId);
        const ownerName = proLink.displayName ?? proLink.alias ?? ownerUser?.firstName ?? (sLang === "fa" ? "ناشناس" : "Anonymous");
        const greeting = proLink.welcomeMessage
          ? t(sLang).proLinkWelcomeGreeting(ownerName, proLink.welcomeMessage)
          : t(sLang).proLinkDefaultGreeting(ownerName);
        const { cancelProSendKeyboard } = await import("../keyboards/main.js");
        await ctx.reply(greeting, { parse_mode: "HTML", reply_markup: cancelProSendKeyboard(sLang) });
        return;
      }
    }

    // ── 1e. Handle Pro In-App link (ai_ prefix) ───────────────────────────────
    if (arg.startsWith("ai_")) {
      const slug = arg.slice(3);
      const { db, proAnonLinksTable } = await import("@workspace/db");
      const { or } = await import("drizzle-orm");
      const [proLink] = await db
        .select()
        .from(proAnonLinksTable)
        .where(or(eqDrizzle(proAnonLinksTable.token, slug), eqDrizzle(proAnonLinksTable.alias, slug)))
        .limit(1);

      if (proLink && proLink.tier === "inapp") {
        if (!proLink.isEnabled || (proLink.expiresAt && proLink.expiresAt < new Date())) {
          const lang = "fa";
          await ctx.reply(proLink.expiresAt && proLink.expiresAt < new Date() ? t(lang).proLinkExpired : t(lang).proLinkDisabled);
          return;
        }
        if (proLink.userId === tgId) {
          await ctx.reply("❌ نمی‌توانید برای خودتان پیام بفرستید.");
          return;
        }
        const sender = await getOrCreateUser(tgId, ctx.from!.first_name, ctx.from!.username);
        const sLang = (sender.language as "fa" | "en") ?? "fa";

        if (!sender.gender || !sender.age) {
          ctx.session.step = `pending_pro:${proLink.userId}:${proLink.id}:inapp`;
          await setUserLanguage(tgId, "fa");
          await setUserSetupStep(tgId, "select_language");
          const customWelcome = await getSetting("welcome_message");
          if (customWelcome) await ctx.reply(customWelcome);
          await ctx.reply(BILINGUAL_WELCOME, { reply_markup: languageKeyboard() });
          return;
        }

        ctx.session.step = `pro_send:${proLink.userId}:${proLink.id}:inapp`;
        const ownerUserInApp = await getUserByTelegramId(proLink.userId);
        const ownerName = proLink.displayName ?? proLink.alias ?? ownerUserInApp?.firstName ?? (sLang === "fa" ? "ناشناس" : "Anonymous");
        const greeting = proLink.welcomeMessage
          ? t(sLang).proLinkWelcomeGreeting(ownerName, proLink.welcomeMessage)
          : t(sLang).proLinkDefaultGreeting(ownerName);
        const { cancelProSendKeyboard: cancelKbInApp } = await import("../keyboards/main.js");
        await ctx.reply(greeting, { parse_mode: "HTML", reply_markup: cancelKbInApp(sLang) });
        return;
      }
      const lang = "fa";
      await ctx.reply(t(lang).proLinkExpired);
      return;
    }

    // ── 1f. Handle Plisio payment return (success / expired / fail) ─────────
    if (arg.startsWith("plisio_ok")) {
      const user = await getOrCreateUser(tgId, ctx.from!.first_name, ctx.from!.username);
      const lang = (user.language as "fa" | "en") ?? "fa";

      // Security: only show if user has a real completed transaction in last 2h
      const { db, plisioTransactionsTable, paymentsTable } = await import("@workspace/db");
      const { desc, gte, and: andDb, eq: eqDb } = await import("drizzle-orm");
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

      const [recentTx] = await db
        .select({ coins: paymentsTable.coins })
        .from(plisioTransactionsTable)
        .innerJoin(paymentsTable, eqDb(paymentsTable.id, plisioTransactionsTable.paymentId))
        .where(
          andDb(
            eqDb(plisioTransactionsTable.userId, tgId),
            eqDb(plisioTransactionsTable.status, "completed"),
            gte(plisioTransactionsTable.createdAt, twoHoursAgo)
          )
        )
        .orderBy(desc(plisioTransactionsTable.createdAt))
        .limit(1);

      if (!recentTx) {
        // Random link clicker — no recent payment, show main menu silently
        await ctx.reply(t(lang).profileComplete, { reply_markup: mainMenuKeyboard(lang) });
        return;
      }

      const balance = await getBalance(tgId);

      await ctx.reply(
        lang === "fa"
          ? `✅ <b>پرداخت با موفقیت انجام شد!</b>\n\n` +
            `🪙 سکه خریداری‌شده: <b>${recentTx.coins} سکه</b>\n` +
            `💰 موجودی فعلی: <b>${balance} سکه</b>`
          : `✅ <b>Payment successful!</b>\n\n` +
            `🪙 Coins purchased: <b>${recentTx.coins} coins</b>\n` +
            `💰 Current balance: <b>${balance} coins</b>`,
        { parse_mode: "HTML", reply_markup: coinsSubMenuKeyboard(lang) }
      );
      return;
    }

    if (arg.startsWith("plisio_exp")) {
      const user = await getOrCreateUser(tgId, ctx.from!.first_name, ctx.from!.username);
      const lang = (user.language as "fa" | "en") ?? "fa";

      const { db, plisioTransactionsTable } = await import("@workspace/db");
      const { desc, gte, and: andDb, eq: eqDb, or: orDb } = await import("drizzle-orm");
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

      const [recentTx] = await db
        .select({ status: plisioTransactionsTable.status })
        .from(plisioTransactionsTable)
        .where(
          andDb(
            eqDb(plisioTransactionsTable.userId, tgId),
            orDb(
              eqDb(plisioTransactionsTable.status, "expired"),
              eqDb(plisioTransactionsTable.status, "pending"),
              eqDb(plisioTransactionsTable.status, "cancelled")
            ),
            gte(plisioTransactionsTable.createdAt, twoHoursAgo)
          )
        )
        .orderBy(desc(plisioTransactionsTable.createdAt))
        .limit(1);

      if (!recentTx) {
        // Random link clicker — no recent transaction, show main menu silently
        await ctx.reply(t(lang).profileComplete, { reply_markup: mainMenuKeyboard(lang) });
        return;
      }

      await ctx.reply(
        lang === "fa"
          ? `⏰ <b>مهلت پرداخت منقضی شد</b>\n\n` +
            `لینک پرداخت Plisio پس از ۳۰ دقیقه منقضی می‌شود.\n` +
            `برای خرید مجدد سکه از دکمه 🛒 خرید سکه استفاده کنید.`
          : `⏰ <b>Payment link expired</b>\n\n` +
            `Plisio payment links expire after 30 minutes.\n` +
            `Use the 🛒 Buy Coins button to try again.`,
        { parse_mode: "HTML", reply_markup: coinsSubMenuKeyboard(lang) }
      );
      return;
    }

    if (arg.startsWith("plisio_fail") || arg.startsWith("plisio_cancel")) {
      const user = await getOrCreateUser(tgId, ctx.from!.first_name, ctx.from!.username);
      const lang = (user.language as "fa" | "en") ?? "fa";

      const { db, plisioTransactionsTable } = await import("@workspace/db");
      const { desc, gte, and: andDb, eq: eqDb, or: orDb } = await import("drizzle-orm");
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

      const [recentTx] = await db
        .select({ status: plisioTransactionsTable.status })
        .from(plisioTransactionsTable)
        .where(
          andDb(
            eqDb(plisioTransactionsTable.userId, tgId),
            orDb(
              eqDb(plisioTransactionsTable.status, "failed"),
              eqDb(plisioTransactionsTable.status, "cancelled"),
              eqDb(plisioTransactionsTable.status, "mismatch"),
              eqDb(plisioTransactionsTable.status, "error"),
              eqDb(plisioTransactionsTable.status, "pending")
            ),
            gte(plisioTransactionsTable.createdAt, twoHoursAgo)
          )
        )
        .orderBy(desc(plisioTransactionsTable.createdAt))
        .limit(1);

      if (!recentTx) {
        await ctx.reply(t(lang).profileComplete, { reply_markup: mainMenuKeyboard(lang) });
        return;
      }

      await ctx.reply(
        lang === "fa"
          ? `❌ <b>پرداخت انجام نشد</b>\n\n` +
            `تراکنش شما لغو یا ناموفق بود.\n` +
            `اگر مبلغی از کیف پول کسر شده، با پشتیبانی تماس بگیرید.\n` +
            `در غیر این صورت از دکمه 🛒 خرید سکه مجدداً اقدام کنید.`
          : `❌ <b>Payment not completed</b>\n\n` +
            `Your transaction was cancelled or failed.\n` +
            `If funds were deducted, please contact support.\n` +
            `Otherwise, use the 🛒 Buy Coins button to try again.`,
        { parse_mode: "HTML", reply_markup: coinsSubMenuKeyboard(lang) }
      );
      return;
    }

    // ── 1g. Plisio return via server landing page — order-bound, fraud-proof ─
    // The success/fail redirect URLs now point at our own server first
    // (see plisio.service.ts / routes/plisio.ts), which forwards here with
    // the exact order_number. We look up that specific order, confirm the
    // clicking Telegram user actually owns it, and only then reveal the
    // *real* status recorded by the signed webhook — never what the link
    // itself claims. A stranger who finds/guesses this link with no matching
    // paid order (or someone else's order) never sees a success screen.
    if (arg.startsWith("plisio_r_")) {
      const orderNumber = arg.slice("plisio_r_".length);
      const user = await getOrCreateUser(tgId, ctx.from!.first_name, ctx.from!.username);
      const lang = (user.language as "fa" | "en") ?? "fa";

      const { db, plisioTransactionsTable, paymentsTable } = await import("@workspace/db");
      const { eq: eqDb } = await import("drizzle-orm");

      const [tx] = await db
        .select()
        .from(plisioTransactionsTable)
        .where(eqDb(plisioTransactionsTable.orderNumber, orderNumber))
        .limit(1);

      // No matching order, or it belongs to a different user — reveal nothing.
      if (!tx || tx.userId !== tgId) {
        await ctx.reply(
          lang === "fa"
            ? `⚠️ <b>اطلاعات پرداخت یافت نشد</b>\n\n` +
              `اگر پرداختی انجام داده‌اید و سکه دریافت نکرده‌اید،\n` +
              `لطفاً با پشتیبانی تماس بگیرید و شماره سفارش Plisio خود را اعلام کنید.`
            : `⚠️ <b>Payment record not found</b>\n\n` +
              `If you made a payment and didn't receive coins,\n` +
              `please contact support with your Plisio order number.`,
          { parse_mode: "HTML", reply_markup: mainMenuKeyboard(lang) }
        );
        return;
      }

      if (tx.status === "completed") {
        const [payment] = await db
          .select({ coins: paymentsTable.coins })
          .from(paymentsTable)
          .where(eqDb(paymentsTable.id, tx.paymentId))
          .limit(1);
        const coins = payment?.coins ?? 0;
        const balance = await getBalance(tgId);
        await ctx.reply(
          lang === "fa"
            ? `✅ <b>پرداخت با موفقیت انجام شد!</b>\n\n` +
              `🪙 سکه خریداری‌شده: <b>${coins} سکه</b>\n` +
              `💰 موجودی فعلی: <b>${balance} سکه</b>`
            : `✅ <b>Payment successful!</b>\n\n` +
              `🪙 Coins purchased: <b>${coins} coins</b>\n` +
              `💰 Current balance: <b>${balance} coins</b>`,
          { parse_mode: "HTML", reply_markup: coinsSubMenuKeyboard(lang) }
        );
        return;
      }

      if (tx.status === "pending") {
        // Browser redirected before our webhook finished processing.
        // Try to verify directly via Plisio API — handles cases where:
        //   • Webhook URL changed (Replit dev domain rotated)
        //   • Webhook arrived but HMAC failed on a previous server build
        //   • Blockchain confirmation was slow and webhook hasn't arrived yet
        if (tx.txnId) {
          try {
            const { checkPlisioTxnStatus, recoverCompletedPlisioTx } = await import("../services/plisio.service.js");
            const apiResult = await checkPlisioTxnStatus(tx.txnId);

            if (apiResult?.status === "completed") {
              const recovery = await recoverCompletedPlisioTx(tx);
              const balance  = await getBalance(tgId);
              const coins    = recovery.coins;
              await ctx.reply(
                lang === "fa"
                  ? `✅ <b>پرداخت تأیید شد!</b>\n\n` +
                    (coins ? `🪙 سکه خریداری‌شده: <b>${coins} سکه</b>\n` : "") +
                    `💰 موجودی فعلی: <b>${balance} سکه</b>`
                  : `✅ <b>Payment confirmed!</b>\n\n` +
                    (coins ? `🪙 Coins purchased: <b>${coins} coins</b>\n` : "") +
                    `💰 Current balance: <b>${balance} coins</b>`,
                { parse_mode: "HTML", reply_markup: coinsSubMenuKeyboard(lang) }
              );
              return;
            }

            if (apiResult?.status === "expired") {
              await db
                .update(plisioTransactionsTable)
                .set({ status: "expired" })
                .where(eqDb(plisioTransactionsTable.id, tx.id));
              await ctx.reply(
                lang === "fa"
                  ? `⏰ <b>مهلت پرداخت منقضی شد</b>\n\n` +
                    `لینک پرداخت Plisio پس از ۳۰ دقیقه منقضی می‌شود.\n` +
                    `برای خرید مجدد سکه از دکمه 🛒 خرید سکه استفاده کنید.`
                  : `⏰ <b>Payment link expired</b>\n\n` +
                    `Plisio payment links expire after 30 minutes.\n` +
                    `Use the 🛒 Buy Coins button to try again.`,
                { parse_mode: "HTML", reply_markup: coinsSubMenuKeyboard(lang) }
              );
              return;
            }

            if (apiResult?.status === "failed" || apiResult?.status === "cancelled") {
              await db
                .update(plisioTransactionsTable)
                .set({ status: apiResult.status })
                .where(eqDb(plisioTransactionsTable.id, tx.id));
              await ctx.reply(
                lang === "fa"
                  ? `❌ <b>پرداخت ناموفق بود</b>\n\n` +
                    `تراکنش لغو یا رد شد.\n` +
                    `اگر مبلغی از کیف پول کسر شده، با پشتیبانی تماس بگیرید.`
                  : `❌ <b>Payment failed</b>\n\n` +
                    `Your transaction was cancelled or rejected.\n` +
                    `If funds were deducted, please contact support.`,
                { parse_mode: "HTML", reply_markup: coinsSubMenuKeyboard(lang) }
              );
              return;
            }
          } catch {
            // API check failed — fall through to "still pending" message
          }
        }

        // Still pending (or API unavailable)
        await ctx.reply(
          lang === "fa"
            ? `⏳ <b>در حال تأیید پرداخت...</b>\n\n` +
              `پرداخت شما در حال بررسی است. معمولاً چند ثانیه تا چند دقیقه طول می‌کشد.\n` +
              `به محض تأیید، سکه‌ها به‌صورت خودکار به حساب شما اضافه می‌شود.\n\n` +
              `اگر بعد از چند دقیقه سکه دریافت نکردید، با پشتیبانی تماس بگیرید.`
            : `⏳ <b>Confirming your payment...</b>\n\n` +
              `Your payment is being verified. This usually takes a few seconds to a few minutes.\n` +
              `Coins will be credited automatically once confirmed.\n\n` +
              `If you don't receive coins after a few minutes, please contact support.`,
          { parse_mode: "HTML", reply_markup: coinsSubMenuKeyboard(lang) }
        );
        return;
      }

      if (tx.status === "expired") {
        await ctx.reply(
          lang === "fa"
            ? `⏰ <b>مهلت پرداخت منقضی شد</b>\n\n` +
              `لینک پرداخت Plisio پس از ۳۰ دقیقه منقضی می‌شود.\n` +
              `برای خرید مجدد سکه از دکمه 🛒 خرید سکه استفاده کنید.`
            : `⏰ <b>Payment link expired</b>\n\n` +
              `Plisio payment links expire after 30 minutes.\n` +
              `Use the 🛒 Buy Coins button to try again.`,
          { parse_mode: "HTML", reply_markup: coinsSubMenuKeyboard(lang) }
        );
        return;
      }

      // failed / cancelled / mismatch / error — generic terminal-failure message
      await ctx.reply(
        lang === "fa"
          ? `❌ <b>پرداخت انجام نشد</b>\n\n` +
            `تراکنش شما لغو یا ناموفق بود.\n` +
            `اگر مبلغی از کیف پول کسر شده، با پشتیبانی تماس بگیرید.\n` +
            `در غیر این صورت از دکمه 🛒 خرید سکه مجدداً اقدام کنید.`
          : `❌ <b>Payment not completed</b>\n\n` +
            `Your transaction was cancelled or failed.\n` +
            `If funds were deducted, please contact support.\n` +
            `Otherwise, use the 🛒 Buy Coins button to try again.`,
        { parse_mode: "HTML", reply_markup: coinsSubMenuKeyboard(lang) }
      );
      return;
    }

    // ── 2. Extract referral code (supports inv / ref_ / r_ formats) ─────────
    let referralCode: string | undefined;
    if (arg.startsWith("inv"))      referralCode = arg.slice(3);
    else if (arg.startsWith("ref_")) referralCode = arg.slice(4);
    else if (arg.startsWith("r_"))   referralCode = arg.slice(2);

    // ── 3. Get or create user ───────────────────────────────────────────────
    const user = await getOrCreateUser(tgId, ctx.from!.first_name, ctx.from!.username, referralCode);
    const lang = (user.language as "fa" | "en") ?? "fa";

    // ── 4. New user → setup flow ────────────────────────────────────────────
    if (!user.gender || !user.age) {
      // If they joined via referral link, greet them with inviter's name before setup
      if (referralCode) {
        const inviter = await getUserByReferralCode(referralCode);
        if (inviter) {
          await ctx.reply(t("fa").referralWelcome(inviter.firstName ?? "یک دوست"), { parse_mode: "Markdown" });
        }
      }
      await setUserLanguage(tgId, "fa");
      await setUserSetupStep(tgId, "select_language");
      const customWelcome = await getSetting("welcome_message");
      if (customWelcome) await ctx.reply(customWelcome);
      await ctx.reply(BILINGUAL_WELCOME, { reply_markup: languageKeyboard() });
      return;
    }

    // ── 5. Existing user → clear stuck state + show main menu ──────────────
    if (user.setupStep) await setUserSetupStep(tgId, null);

    // If user is stuck in an active chat, end it gracefully before resetting
    if (user.isInChat) {
      const session = await getActiveSession(tgId);
      if (session) {
        const result = await endChatSession(session.id, tgId);
        if (result) {
          const partnerId = result.user1Id === tgId ? result.user2Id : result.user1Id;
          await bot.api
            .sendMessage(partnerId, t(lang).chatEndedByPartner, { reply_markup: mainMenuKeyboard(lang) })
            .catch(() => {});
        }
      }
    }

    // If user is in a group, leave them gracefully on /start (reset action)
    if (user.isInGroup) {
      const actualGroupId = await getUserGroup(tgId);
      if (actualGroupId === null) {
        // Stale flag — just clear it
        await updateUser(tgId, { isInGroup: false });
      } else {
        // Genuinely in a group — leave and notify remaining members
        const leaveResult = await leaveGroup(tgId);
        if (leaveResult) {
          const remainingMembers = await getGroupMembers(leaveResult.groupId);
          const notifyMsg = lang === "fa" ? "یکی از اعضا گروه را ترک کرد." : "A member left the group.";
          for (const memberId of remainingMembers) {
            if (memberId === tgId) continue;
            const mUser = await getUserByTelegramId(memberId);
            const mLang = (mUser?.language as "fa" | "en") ?? "fa";
            if (leaveResult.groupActuallyEnded) {
              await bot.api.sendMessage(memberId, t(mLang).groupEnded, { reply_markup: mainMenuKeyboard(mLang) }).catch(() => {});
            } else {
              await bot.api.sendMessage(memberId, notifyMsg).catch(() => {});
            }
          }
        }
      }
    }

    // Clear stale session step
    if (ctx.session.step) ctx.session.step = undefined;

    const existingReferralResult = await processReferralReward(tgId);
    if (referralCode) {
      if (existingReferralResult) {
        // Pending reward just processed → welcome with inviter name
        const inviter = await getUserByTelegramId(existingReferralResult.referrerId);
        await ctx.reply(t(lang).referralWelcome(inviter?.firstName ?? "یک دوست"), { parse_mode: "Markdown" });
      } else {
        // Already registered — check if they previously joined via someone's link
        const existingReferral = await getUserReferral(tgId);
        if (existingReferral) {
          const inviter = await getUserByTelegramId(existingReferral.referrerId);
          await ctx.reply(t(lang).alreadyJoinedVia(inviter?.firstName ?? "یک دوست"), { parse_mode: "HTML" });
        } else {
          await ctx.reply(t(lang).alreadyMember);
        }
      }
    }
    await ctx.reply(t(lang).profileComplete, { reply_markup: mainMenuKeyboard(lang) });
  });

  // ─── Language selection (initial setup only) ────────────────────────────────
  // IMPORTANT: must call next() when step doesn't match so settings.ts handler fires
  bot.hears(["🇮🇷 فارسی", "🇬🇧 English"], async (ctx, next) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);

    // Only handle during initial language-selection step; defer to settings.ts otherwise
    if (user?.setupStep !== "select_language") return next();

    const lang = ctx.message!.text === "🇮🇷 فارسی" ? "fa" : "en";
    await setUserLanguage(tgId, lang);
    await setUserSetupStep(tgId, "select_gender");
    await ctx.reply(t(lang).selectGender, { reply_markup: genderKeyboard(lang) });
  });

  // ─── Gender selection (initial setup only) ──────────────────────────────────
  // IMPORTANT: must call next() when step doesn't match so settings.ts handler fires
  bot.hears(
    [/^(👦 پسر|👧 دختر|👦 مرد|👧 زن|🌈 سایر|👦 Male|👧 Female|🌈 Other)$/],
    async (ctx, next) => {
      const tgId = ctx.from!.id;
      const user = ctx.dbUser ?? await getUserByTelegramId(tgId);

      // Only handle during initial gender-selection step; defer to settings.ts otherwise
      if (user?.setupStep !== "select_gender") return next();

      const text = ctx.message!.text ?? "";
      const gender =
        text.includes("پسر") || text.includes("مرد") || text.includes("Male") ? "male"
        : text.includes("دختر") || text.includes("زن") || text.includes("Female") ? "female"
        : "other";

      const lang = (user?.language as "fa" | "en") ?? "fa";
      await updateUser(tgId, { gender });
      await setUserSetupStep(tgId, "select_age");
      await ctx.reply(t(lang).selectAge, { reply_markup: { remove_keyboard: true } });
    }
  );

  // ─── Age input (initial setup only) ─────────────────────────────────────────
  bot.on("message:text", async (ctx, next) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);

    // ── Age step ──────────────────────────────────────────────────────────────
    if (user?.setupStep === "select_age") {
      const lang = (user?.language as "fa" | "en") ?? "fa";
      const age = parseInt(ctx.message.text.trim(), 10);

      if (isNaN(age) || age < 13 || age > 100) {
        await ctx.reply(t(lang).invalidAge);
        return;
      }

      await updateUser(tgId, { age });
      // Move to city step instead of finishing setup
      await setUserSetupStep(tgId, "select_city");
      await ctx.reply(t(lang).selectCity, { reply_markup: { remove_keyboard: true } });
      return;
    }

    // ── City step ─────────────────────────────────────────────────────────────
    if (user?.setupStep === "select_city") {
      const lang = (user?.language as "fa" | "en") ?? "fa";
      const input = ctx.message.text.trim();

      // "." or empty = skip city
      const city = input === "." || input === "" ? null : input.slice(0, 100);
      if (city !== null) {
        await updateUser(tgId, { city });
      }

      // Finish setup
      await setUserSetupStep(tgId, null);

      // ── Signup bonus: all new users get coins on first registration ──────
      const signupBonusStr = await getSetting("signup_bonus");
      const signupBonus = signupBonusStr ? parseInt(signupBonusStr, 10) : 15;
      if (signupBonus > 0) {
        await addCoins(tgId, signupBonus, "referral_reward", "Signup welcome bonus");
        await ctx.reply(t(lang).signupBonus(signupBonus), { parse_mode: "Markdown" });
      }

      // ── Referral reward: extra coins for joining via referral link ────────
      const referralResult = await processReferralReward(tgId);
      if (referralResult) {
        if (referralResult.inviterCoins > 0) {
          await bot.api.sendMessage(
            referralResult.referrerId,
            t((await getUserByTelegramId(referralResult.referrerId))?.language as "fa" | "en" ?? "fa")
              .referralReward(referralResult.inviterCoins)
          ).catch(() => {});
        }
        if (referralResult.inviteeCoins > 0) {
          await ctx.reply(t(lang).referralInviteeReward(referralResult.inviteeCoins), { parse_mode: "Markdown" });
        }
      }

      // Check for pending anon link (user clicked anon link before completing setup)
      const pendingStep = ctx.session.step;
      ctx.session.step = undefined;
      if (pendingStep?.startsWith("pending_anon:")) {
        const receiverId = pendingStep.slice(13);
        ctx.session.step = `anon_send:${receiverId}`;
        await ctx.reply(t(lang).sendAnonMsg(lang === "fa" ? "کاربر" : "User"), { reply_markup: { remove_keyboard: true } });
      } else if (pendingStep?.startsWith("pending_pro:")) {
        // Format: pending_pro:OWNER_ID:LINK_ID:TIER
        const parts = pendingStep.slice(12).split(":");
        const ownerId = parts[0];
        const linkId = parts[1];
        const tier = parts[2];
        ctx.session.step = `pro_send:${ownerId}:${linkId}:${tier}`;
        await ctx.reply(lang === "fa" ? "📝 پیام خود را ارسال کنید:" : "📝 Send your message:", { reply_markup: { remove_keyboard: true } });
      } else {
        await ctx.reply(t(lang).profileComplete, { reply_markup: mainMenuKeyboard(lang) });
      }
      return;
    }

    return next();
  });
}
