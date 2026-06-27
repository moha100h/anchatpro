import { Bot } from "grammy";
import type { BotContext } from "../context.js";
import {
  getOrCreateUser,
  updateUser,
  setUserSetupStep,
  setUserLanguage,
  getUserByTelegramId,
  getUserByAnonToken,
} from "../services/user.service.js";
import { processReferralReward, deductCoins } from "../services/coin.service.js";
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
import { languageKeyboard, genderKeyboard, mainMenuKeyboard, groupControlKeyboard } from "../keyboards/main.js";

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

          const cost = group.joinCost;
          const deduct = await deductCoins(tgId, cost, "group_cost", "Join group via invite link");
          if (!deduct.success) {
            await ctx.reply(t(lang).insufficientCoins, { reply_markup: mainMenuKeyboard(lang) });
            return;
          }

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

    // ── 2. Extract referral code (supports ref_ and r_ formats) ────────────
    let referralCode: string | undefined;
    if (arg.startsWith("ref_")) referralCode = arg.slice(4);
    else if (arg.startsWith("r_")) referralCode = arg.slice(2);

    // ── 3. Get or create user ───────────────────────────────────────────────
    const user = await getOrCreateUser(tgId, ctx.from!.first_name, ctx.from!.username, referralCode);
    const lang = (user.language as "fa" | "en") ?? "fa";

    // ── 4. New user → setup flow ────────────────────────────────────────────
    if (!user.gender || !user.age) {
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

    await processReferralReward(tgId);
    if (referralCode) await ctx.reply(t(lang).referralWelcome(user.firstName ?? "کاربر"));
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
      } else {
        await ctx.reply(t(lang).profileComplete, { reply_markup: mainMenuKeyboard(lang) });
      }
      return;
    }

    return next();
  });
}
