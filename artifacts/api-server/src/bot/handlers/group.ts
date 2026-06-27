import { Bot, InlineKeyboard } from "grammy";
import type { BotContext } from "../context.js";
import { getUserByTelegramId } from "../services/user.service.js";
import { deductCoins } from "../services/coin.service.js";
import { getSetting } from "../services/payment.service.js";
import {
  joinOrCreateGroup,
  leaveGroup,
  getUserGroup,
  getGroupMembers,
  generateGroupUserId,
  getGroupMemberDisplayName,
  dismissGroupFromList,
  createGroup,
  isGroupCreator,
  isGroupAdmin,
  getGroupMembersWithDetails,
  kickMember,
  banMember,
  getCreatorGroups,
  getJoinedGroups,
  getUserGroupSlots,
  expandGroupSlots,
  promoteToAdmin,
  getGroupAdminCount,
  expandGroupLimit,
  getGroupByInviteToken,
  joinGroupByInvite,
  getGroupInviteToken,
  updateGroupActivity,
  cleanupStaleAnonymousGroups,
} from "../services/group.service.js";
import { containsBadWord, issueWarning } from "../services/safety.service.js";
import { t } from "../i18n/index.js";
import {
  mainMenuKeyboard,
  groupControlKeyboard,
  groupCreatorKeyboard,
  groupAdminKeyboard,
  groupSubMenuKeyboard,
  groupMyGroupsKeyboard,
} from "../keyboards/main.js";

function buildMemberKeyboard(
  groupId: number,
  members: Array<{ id: number; userId: number; isCreator: boolean; isAdmin: boolean; alias: string }>,
  lang: "fa" | "en"
): InlineKeyboard {
  const manageable = members.filter((m) => !m.isCreator);
  const kb = new InlineKeyboard();
  for (const m of manageable) {
    const label = m.isAdmin ? `⭐ ${m.alias}` : m.alias;
    kb.text(label, `g_noop:${m.id}`)
      .text(t(lang).kickBtn, `g_kick:${groupId}:${m.id}`)
      .text(t(lang).banBtn, `g_ban:${groupId}:${m.id}`)
      .row();
  }
  return kb;
}

function buildPromoteKeyboard(
  groupId: number,
  members: Array<{ id: number; userId: number; isCreator: boolean; isAdmin: boolean; alias: string }>
): InlineKeyboard {
  const eligible = members.filter((m) => !m.isCreator && !m.isAdmin);
  const kb = new InlineKeyboard();
  for (const m of eligible) {
    kb.text(m.alias, `g_promote:${groupId}:${m.id}`).row();
  }
  return kb;
}

export function registerGroupHandlers(bot: Bot<BotContext>) {
  // ─── Group sub-menu ───────────────────────────────────────────────────────────
  bot.hears([/^👥 گروه/, /^👥 Anonymous Group/], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    if (user.isInGroup) {
      await ctx.reply(t(lang).alreadyInGroup);
      return;
    }

    await ctx.reply(t(lang).menuGroup, { reply_markup: groupSubMenuKeyboard(lang) });
  });

  // ─── Join public anonymous group — disabled, invite link only ────────────────
  bot.hears(["👥 پیوستن به گروه‌های ناشناس", "👥 Join Anonymous Groups"], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";
    await ctx.reply(t(lang).groupJoinOnlyViaLink, { parse_mode: "Markdown" });
  });

  // ─── Join confirm callback ────────────────────────────────────────────────────
  bot.callbackQuery("group:join:confirm", async (ctx) => {
    await ctx.answerCallbackQuery();
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    if (user.isInChat)  { await ctx.editMessageText(t(lang).alreadyInChat).catch(() => {}); return; }
    if (user.isInGroup) { await ctx.editMessageText(t(lang).alreadyInGroup).catch(() => {}); return; }

    // Check joined group slot limit
    const slots = await getUserGroupSlots(tgId);
    if (slots.joinedCount >= slots.maxJoined) {
      const expandCostStr = await getSetting("group_slot_expand_cost");
      const expandCost = expandCostStr ? parseInt(expandCostStr, 10) : 30;
      await ctx.editMessageText(t(lang).groupLimitJoinedReached(slots.maxJoined, expandCost), { parse_mode: "Markdown" }).catch(() => {});
      return;
    }

    const costStr = await getSetting("group_join_cost");
    const cost = costStr ? parseInt(costStr, 10) : 3;

    const result = await deductCoins(tgId, cost, "group_cost", "Join anonymous group");
    if (!result.success) {
      await ctx.editMessageText(t(lang).insufficientCoins).catch(() => {});
      await ctx.reply(t(lang).insufficientCoins, { reply_markup: mainMenuKeyboard(lang) });
      return;
    }

    await ctx.editMessageText("⏳").catch(() => {});

    const { groupId, memberCount, isNew } = await joinOrCreateGroup(tgId);
    const myAlias = await generateGroupUserId(tgId, groupId);
    const members = await getGroupMembers(groupId);

    await bot.api.sendMessage(tgId, t(lang).groupJoined.replace("{count}", memberCount.toString()), {
      reply_markup: groupControlKeyboard(lang),
    }).catch(() => {});
    if (isNew) await bot.api.sendMessage(tgId, t(lang).newGroupCreated).catch(() => {});

    for (const memberId of members) {
      if (memberId === tgId) continue;
      const mUser = await getUserByTelegramId(memberId);
      const mLang = (mUser?.language as "fa" | "en") ?? "fa";
      await bot.api.sendMessage(memberId, t(mLang).memberJoined(myAlias, memberCount)).catch(() => {});
    }

    if (memberCount >= 3) {
      const allDetails = await getGroupMembersWithDetails(groupId);
      const creatorEntry = allDetails.find((m) => m.isCreator);
      if (creatorEntry && creatorEntry.userId !== tgId) {
        const cUser = await getUserByTelegramId(creatorEntry.userId);
        const cLang = (cUser?.language as "fa" | "en") ?? "fa";
        await bot.api.sendMessage(creatorEntry.userId, t(cLang).groupActiveNotif(memberCount)).catch(() => {});
      }
    }
  });

  // ─── Join cancel callback ─────────────────────────────────────────────────────
  bot.callbackQuery("group:join:cancel", async (ctx) => {
    await ctx.answerCallbackQuery();
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";
    await ctx.editMessageText("❌").catch(() => {});
    await ctx.reply(t(lang).menuGroup, { reply_markup: groupSubMenuKeyboard(lang) });
  });

  // ─── My Groups (sub-menu) ─────────────────────────────────────────────────────
  bot.hears(["📋 گروه‌های من", "📋 My Groups"], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";
    await ctx.reply(t(lang).groupSubMenuMine, { reply_markup: groupMyGroupsKeyboard(lang) });
  });

  // ─── My Created Groups ────────────────────────────────────────────────────────
  bot.hears(["🏗️ گروه‌های ساخته‌ام", "🏗️ Groups I Created"], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    const [slots, groups] = await Promise.all([getUserGroupSlots(tgId), getCreatorGroups(tgId)]);
    if (groups.length === 0) {
      await ctx.reply(t(lang).myGroupsCreatedEmpty, { parse_mode: "Markdown" });
      return;
    }

    const BOT_USERNAME = process.env["BOT_USERNAME"] ?? "bot";
    const kb = new InlineKeyboard();
    const activeCount = groups.filter(g => g.status !== "ended").length;
    const header = lang === "fa"
      ? `🏗️ **گروه‌های ساخته‌ام**\n📊 فعال: ${activeCount} از ${slots.maxCreated}`
      : `🏗️ **My Created Groups**\n📊 Active: ${activeCount} of ${slots.maxCreated}`;

    for (const g of groups) {
      const name = g.name ?? t(lang).groupNoName;
      if (g.status !== "ended") {
        // Active group: enter button + invite link URL button
        kb.text(`🟢 ${name} — ${g.activeMemberCount}/${g.maxMembers} 👥`, `group:enter:${g.id}`).row();
        if (g.inviteToken) {
          const inviteUrl = `https://t.me/${BOT_USERNAME}?start=g_${g.inviteToken}`;
          kb.url(`🔗 ${lang === "fa" ? "لینک دعوت" : "Invite Link"}`, inviteUrl).row();
        }
      } else {
        // Ended group: info + dismiss button
        kb.text(`🔴 ${name} — ${lang === "fa" ? "پایان یافته" : "Ended"}`, `group:noop`).row();
        kb.text(t(lang).groupDismissBtn, `group:dismiss:created:${g.id}`).row();
      }
    }
    if (slots.maxCreated < 10) {
      const expandCostStr = await getSetting("group_slot_expand_cost");
      const expandCost = expandCostStr ? parseInt(expandCostStr, 10) : 30;
      kb.row().text(
        t(lang).groupExpandCreatedBtn.replace("۳۰", String(expandCost)).replace("30", String(expandCost)),
        "group:expand:created"
      );
    }
    await ctx.reply(header, { parse_mode: "Markdown", reply_markup: kb });
  });

  // ─── My Joined Groups ─────────────────────────────────────────────────────────
  bot.hears(["👤 گروه‌های عضو شده", "👤 Groups I Joined"], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    const [slots, groups] = await Promise.all([getUserGroupSlots(tgId), getJoinedGroups(tgId)]);
    if (groups.length === 0) {
      await ctx.reply(t(lang).myGroupsJoinedEmpty, { parse_mode: "Markdown" });
      return;
    }
    const kb = new InlineKeyboard();
    const activeJoined = groups.filter(g => g.status !== "ended" && g.leftAt === null).length;
    const header = lang === "fa"
      ? `👤 **گروه‌های عضو شده**\n📊 فعال: ${activeJoined} از ${slots.maxJoined}`
      : `👤 **Groups I Joined**\n📊 Active: ${activeJoined} of ${slots.maxJoined}`;

    for (const g of groups) {
      const name = g.name ?? t(lang).groupNoName;
      const isActive = g.status !== "ended" && g.leftAt === null;
      const roleIcon = g.isAdmin ? "⭐" : "";
      if (isActive) {
        kb.text(`🟢 ${roleIcon} ${name} — ${g.memberCount}/${g.maxMembers} 👥`.replace("  ", " "), `group:enter:${g.id}`).row();
      } else {
        kb.text(`🔴 ${name} — ${lang === "fa" ? "پایان یافته" : "Ended"}`, `group:noop`).row();
        kb.text(t(lang).groupDismissBtn, `group:dismiss:joined:${g.id}`).row();
      }
    }
    if (slots.maxJoined < 10) {
      const expandCostStr = await getSetting("group_slot_expand_cost");
      const expandCost = expandCostStr ? parseInt(expandCostStr, 10) : 30;
      kb.row().text(
        t(lang).groupExpandJoinedBtn.replace("۳۰", String(expandCost)).replace("30", String(expandCost)),
        "group:expand:joined"
      );
    }
    await ctx.reply(header, { parse_mode: "Markdown", reply_markup: kb });
  });

  // ─── Enter group callback ─────────────────────────────────────────────────────
  bot.callbackQuery(/^group:enter:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const groupId = parseInt(ctx.match[1]);
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    const [creator, admin] = await Promise.all([
      isGroupCreator(tgId, groupId),
      isGroupAdmin(tgId, groupId),
    ]);

    let kb;
    if (creator)    kb = groupCreatorKeyboard(lang);
    else if (admin) kb = groupAdminKeyboard(lang);
    else            kb = groupControlKeyboard(lang);

    const groupMembers = await getGroupMembers(groupId);
    const memberCount = groupMembers.length;
    const enterMsg = lang === "fa"
      ? `🚪 وارد گروه شدید (${memberCount} نفر)`
      : `🚪 Entered group (${memberCount} members)`;
    await ctx.reply(enterMsg, { reply_markup: kb });
  });

  // ─── Noop callback (info-only buttons like ended group names) ────────────────
  bot.callbackQuery("group:noop", async (ctx) => {
    await ctx.answerCallbackQuery();
  });

  // ─── Go to My Groups (from slot limit warning) ────────────────────────────────
  bot.callbackQuery("group:go:mygroups", async (ctx) => {
    await ctx.answerCallbackQuery();
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";
    await ctx.reply(t(lang).groupSubMenuMine, { reply_markup: groupMyGroupsKeyboard(lang) });
  });

  // ─── Dismiss ended group from created list ────────────────────────────────────
  bot.callbackQuery(/^group:dismiss:created:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const groupId = parseInt(ctx.match[1]);
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";
    await dismissGroupFromList(tgId, groupId);
    await ctx.editMessageText(t(lang).groupDismissedOk).catch(() => {});
  });

  // ─── Dismiss ended group from joined list ─────────────────────────────────────
  bot.callbackQuery(/^group:dismiss:joined:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const groupId = parseInt(ctx.match[1]);
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";
    await dismissGroupFromList(tgId, groupId);
    await ctx.editMessageText(t(lang).groupDismissedOk).catch(() => {});
  });

  // ─── Expand group slots callbacks ─────────────────────────────────────────────
  bot.callbackQuery("group:expand:created", async (ctx) => {
    await ctx.answerCallbackQuery();
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";
    const expandCostStr = await getSetting("group_slot_expand_cost");
    const expandCost = expandCostStr ? parseInt(expandCostStr, 10) : 30;
    const kb = new InlineKeyboard()
      .text(t(lang).confirm, "group:expand:created:confirm")
      .text(t(lang).cancel, "group:expand:created:cancel");
    await ctx.reply(t(lang).groupExpandCreatedConfirm(expandCost), { parse_mode: "Markdown", reply_markup: kb });
  });

  bot.callbackQuery("group:expand:created:confirm", async (ctx) => {
    await ctx.answerCallbackQuery();
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";
    const expandCostStr = await getSetting("group_slot_expand_cost");
    const expandCost = expandCostStr ? parseInt(expandCostStr, 10) : 30;
    // Check already maxed
    const slots = await getUserGroupSlots(tgId);
    if (slots.maxCreated >= 10) {
      await ctx.editMessageText(t(lang).groupExpandAlreadyMax, { parse_mode: "Markdown" }).catch(() => {});
      return;
    }
    // Deduct coins FIRST
    const result = await deductCoins(tgId, expandCost, "group_cost", "Expand group created slots");
    if (!result.success) {
      await ctx.editMessageText(t(lang).insufficientCoins, { parse_mode: "Markdown" }).catch(() => {});
      return;
    }
    await expandGroupSlots(tgId, "created");
    await ctx.editMessageText(t(lang).groupExpandSuccess, { parse_mode: "Markdown" }).catch(() => {});
  });

  bot.callbackQuery("group:expand:created:cancel", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("❌").catch(() => {});
  });

  bot.callbackQuery("group:expand:joined", async (ctx) => {
    await ctx.answerCallbackQuery();
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";
    const expandCostStr = await getSetting("group_slot_expand_cost");
    const expandCost = expandCostStr ? parseInt(expandCostStr, 10) : 30;
    const kb = new InlineKeyboard()
      .text(t(lang).confirm, "group:expand:joined:confirm")
      .text(t(lang).cancel, "group:expand:joined:cancel");
    await ctx.reply(t(lang).groupExpandJoinedConfirm(expandCost), { parse_mode: "Markdown", reply_markup: kb });
  });

  bot.callbackQuery("group:expand:joined:confirm", async (ctx) => {
    await ctx.answerCallbackQuery();
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";
    const expandCostStr = await getSetting("group_slot_expand_cost");
    const expandCost = expandCostStr ? parseInt(expandCostStr, 10) : 30;
    // Check already maxed
    const slots = await getUserGroupSlots(tgId);
    if (slots.maxJoined >= 10) {
      await ctx.editMessageText(t(lang).groupExpandAlreadyMax, { parse_mode: "Markdown" }).catch(() => {});
      return;
    }
    // Deduct coins FIRST
    const result = await deductCoins(tgId, expandCost, "group_cost", "Expand group joined slots");
    if (!result.success) {
      await ctx.editMessageText(t(lang).insufficientCoins, { parse_mode: "Markdown" }).catch(() => {});
      return;
    }
    await expandGroupSlots(tgId, "joined");
    await ctx.editMessageText(t(lang).groupExpandSuccess, { parse_mode: "Markdown" }).catch(() => {});
  });

  bot.callbackQuery("group:expand:joined:cancel", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("❌").catch(() => {});
  });

  // ─── Anon Pro Link placeholder ────────────────────────────────────────────────
  bot.hears(["🔗 ساخت لینک ناشناس پرو", "🔗 Create Pro Anon Link"], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";
    await ctx.reply(t(lang).anonProLinkComingSoon, { parse_mode: "Markdown" });
  });

  // ─── Create group (paid, with creator privileges) ────────────────────────────
  bot.hears([/^ساخت گروه ناشناس/, /^Create Anonymous Group/], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    if (user.isInChat)  { await ctx.reply(t(lang).alreadyInChat);  return; }
    if (user.isInGroup) { await ctx.reply(t(lang).alreadyInGroup); return; }
    if (user.isInQueue) { await ctx.reply(t(lang).alreadyInQueue); return; }

    // Check slot limit
    const slots = await getUserGroupSlots(tgId);
    if (slots.createdCount >= slots.maxCreated) {
      const expandCostStr = await getSetting("group_slot_expand_cost");
      const expandCost = expandCostStr ? parseInt(expandCostStr, 10) : 30;
      const kb = new InlineKeyboard();
      kb.text(t(lang).groupLimitGoToMyGroups, "group:go:mygroups").row();
      if (slots.maxCreated < 10) {
        kb.text(t(lang).groupExpandCreatedBtn.replace("۳۰", String(expandCost)).replace("30", String(expandCost)), "group:expand:created");
      }
      await ctx.reply(t(lang).groupLimitCreatedReached(slots.maxCreated, expandCost), {
        parse_mode: "Markdown",
        reply_markup: kb,
      });
      return;
    }

    const costStr = await getSetting("group_create_cost");
    const cost = costStr ? parseInt(costStr, 10) : 3;

    await ctx.reply(t(lang).createGroupInfo(cost), {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text(t(lang).confirm, "create_group:confirm")
        .text(t(lang).cancel, "create_group:cancel"),
    });
  });

  bot.callbackQuery("create_group:confirm", async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";

    if (user?.isInGroup || user?.isInChat) {
      await ctx.editMessageText(t(lang).alreadyInGroup);
      await ctx.answerCallbackQuery();
      return;
    }

    // Re-check slot limit at confirm time
    const slots = await getUserGroupSlots(tgId);
    if (slots.createdCount >= slots.maxCreated) {
      const expandCostStr = await getSetting("group_slot_expand_cost");
      const expandCost = expandCostStr ? parseInt(expandCostStr, 10) : 30;
      await ctx.editMessageText(t(lang).groupLimitCreatedReached(slots.maxCreated, expandCost), { parse_mode: "Markdown" }).catch(() => {});
      await ctx.answerCallbackQuery();
      return;
    }

    const costStr = await getSetting("group_create_cost");
    const cost = costStr ? parseInt(costStr, 10) : 3;

    const result = await deductCoins(tgId, cost, "group_cost", "Create anonymous group");
    if (!result.success) {
      await ctx.editMessageText(t(lang).insufficientCoins);
      await ctx.answerCallbackQuery();
      return;
    }

    await ctx.editMessageText(t(lang).createGroupAskName, { reply_markup: undefined, parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
    ctx.session.step = "create_group_naming";
  });

  bot.callbackQuery("create_group:cancel", async (ctx) => {
    const user = ctx.dbUser ?? await getUserByTelegramId(ctx.from!.id);
    const lang = (user?.language as "fa" | "en") ?? "fa";
    await ctx.editMessageText(t(lang).cancelledAction);
    await ctx.answerCallbackQuery();
  });

  // ─── Group naming step ────────────────────────────────────────────────────────
  bot.on("message:text", async (ctx, next) => {
    if (ctx.session.step !== "create_group_naming") return next();

    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";

    const input = ctx.message.text.trim();
    if (input !== "." && input.length > 30) {
      await ctx.reply(t(lang).groupNameTooLong, { parse_mode: "Markdown" });
      return;
    }

    const groupName = input === "." ? undefined : input;
    const { inviteToken } = await createGroup(tgId, groupName);
    ctx.session.step = undefined;

    const BOT_USERNAME = process.env["BOT_USERNAME"] ?? "bot";
    const link = `https://t.me/${BOT_USERNAME}?start=g_${inviteToken}`;
    const displayName = groupName ?? t(lang).groupNoName;
    const msg = t(lang).groupCreatedWithName(displayName) + `\n\n🔗 \`${link}\``;
    await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: groupCreatorKeyboard(lang) });
  });

  // ─── Manage members (creator or admin) ───────────────────────────────────────
  bot.hears([/^👥 مدیریت اعضا/, /^👥 Manage Members/], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    const groupId = await getUserGroup(tgId);
    if (!groupId) { await ctx.reply(t(lang).notInChat); return; }

    const adminCheck = await isGroupAdmin(tgId, groupId);
    if (!adminCheck) { await ctx.reply(t(lang).notGroupCreator); return; }

    const members = await getGroupMembersWithDetails(groupId);
    const manageable = members.filter((m) => !m.isCreator);
    if (manageable.length === 0) {
      await ctx.reply(t(lang).noMembersToManage);
      return;
    }

    const kb = buildMemberKeyboard(groupId, members, lang);
    await ctx.reply(t(lang).memberListTitle, { parse_mode: "Markdown", reply_markup: kb });
  });

  // ─── Kick member ─────────────────────────────────────────────────────────────
  bot.callbackQuery(/^g_kick:(\d+):(\d+)$/, async (ctx) => {
    const tgId = ctx.from!.id;
    const groupId = parseInt(ctx.match![1], 10);
    const memberDbId = parseInt(ctx.match![2], 10);
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";

    const adminCheck = await isGroupAdmin(tgId, groupId);
    if (!adminCheck) { await ctx.answerCallbackQuery(t("fa").notGroupCreator); return; }

    const kickedUserId = await kickMember(groupId, memberDbId);
    if (!kickedUserId) { await ctx.answerCallbackQuery(); return; }

    const kickedUser = await getUserByTelegramId(kickedUserId);
    const kLang = (kickedUser?.language as "fa" | "en") ?? "fa";
    await bot.api.sendMessage(kickedUserId, t(kLang).youWereKicked, { reply_markup: mainMenuKeyboard(kLang) }).catch(() => {});

    const members = await getGroupMembersWithDetails(groupId);
    if (members.filter((m) => !m.isCreator).length === 0) {
      await ctx.editMessageText(t(lang).noMembersToManage, { reply_markup: undefined });
    } else {
      await ctx.editMessageReplyMarkup({ reply_markup: buildMemberKeyboard(groupId, members, lang) });
    }
    await ctx.answerCallbackQuery("✅");
  });

  // ─── Ban member ───────────────────────────────────────────────────────────────
  bot.callbackQuery(/^g_ban:(\d+):(\d+)$/, async (ctx) => {
    const tgId = ctx.from!.id;
    const groupId = parseInt(ctx.match![1], 10);
    const memberDbId = parseInt(ctx.match![2], 10);
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";

    const adminCheck = await isGroupAdmin(tgId, groupId);
    if (!adminCheck) { await ctx.answerCallbackQuery(t("fa").notGroupCreator); return; }

    const bannedUserId = await banMember(groupId, memberDbId);
    if (!bannedUserId) { await ctx.answerCallbackQuery(); return; }

    const bannedUser = await getUserByTelegramId(bannedUserId);
    const bLang = (bannedUser?.language as "fa" | "en") ?? "fa";
    await bot.api.sendMessage(bannedUserId, t(bLang).youWereBanned, { reply_markup: mainMenuKeyboard(bLang) }).catch(() => {});

    const members = await getGroupMembersWithDetails(groupId);
    if (members.filter((m) => !m.isCreator).length === 0) {
      await ctx.editMessageText(t(lang).noMembersToManage, { reply_markup: undefined });
    } else {
      await ctx.editMessageReplyMarkup({ reply_markup: buildMemberKeyboard(groupId, members, lang) });
    }
    await ctx.answerCallbackQuery("✅");
  });

  // ─── No-op for member label buttons ──────────────────────────────────────────
  bot.callbackQuery(/^g_noop:\d+$/, async (ctx) => {
    await ctx.answerCallbackQuery();
  });

  // ─── Group invite link ────────────────────────────────────────────────────────
  bot.hears(["🔗 لینک دعوت گروه", "🔗 Group Invite Link"], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    const groupId = await getUserGroup(tgId);
    if (!groupId) { await ctx.reply(t(lang).notInChat, { reply_markup: mainMenuKeyboard(lang) }); return; }

    const creatorCheck = await isGroupCreator(tgId, groupId);
    if (!creatorCheck) { await ctx.reply(t(lang).notGroupCreator); return; }

    const token = await getGroupInviteToken(groupId);
    if (!token) { await ctx.reply(t(lang).errorGeneral); return; }

    const BOT_USERNAME = process.env["BOT_USERNAME"] ?? "bot";
    await ctx.reply(`🔗 \`https://t.me/${BOT_USERNAME}?start=g_${token}\``, { parse_mode: "Markdown" });
  });

  // ─── Promote to admin ─────────────────────────────────────────────────────────
  bot.hears(["⭐ ارتقا به ادمین", "⭐ Promote to Admin"], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    const groupId = await getUserGroup(tgId);
    if (!groupId) { await ctx.reply(t(lang).notInChat); return; }

    const creatorCheck = await isGroupCreator(tgId, groupId);
    if (!creatorCheck) { await ctx.reply(t(lang).notGroupCreator); return; }

    const adminCount = await getGroupAdminCount(groupId);
    if (adminCount >= 2) {
      await ctx.reply(t(lang).groupAdminMaxReached, { parse_mode: "Markdown" });
      return;
    }

    const costStr = await getSetting("group_admin_promote_cost");
    const cost = costStr ? parseInt(costStr, 10) : 5;

    const members = await getGroupMembersWithDetails(groupId);
    const eligible = members.filter((m) => !m.isCreator && !m.isAdmin);
    if (eligible.length === 0) {
      await ctx.reply(t(lang).noMembersToManage);
      return;
    }

    await ctx.reply(t(lang).groupAdminPromoteCost(cost) + "\n\n" + t(lang).groupSelectForAdmin, {
      parse_mode: "Markdown",
      reply_markup: buildPromoteKeyboard(groupId, members),
    });
  });

  bot.callbackQuery(/^g_promote:(\d+):(\d+)$/, async (ctx) => {
    const tgId = ctx.from!.id;
    const groupId = parseInt(ctx.match![1], 10);
    const memberDbId = parseInt(ctx.match![2], 10);
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";

    const creatorCheck = await isGroupCreator(tgId, groupId);
    if (!creatorCheck) { await ctx.answerCallbackQuery(t("fa").notGroupCreator); return; }

    const adminCount = await getGroupAdminCount(groupId);
    if (adminCount >= 2) {
      await ctx.editMessageText(t(lang).groupAdminMaxReached, { reply_markup: undefined, parse_mode: "Markdown" });
      await ctx.answerCallbackQuery();
      return;
    }

    const costStr = await getSetting("group_admin_promote_cost");
    const cost = costStr ? parseInt(costStr, 10) : 5;

    const deduct = await deductCoins(tgId, cost, "group_cost", "Promote group admin");
    if (!deduct.success) {
      await ctx.editMessageText(t(lang).insufficientCoins, { reply_markup: undefined });
      await ctx.answerCallbackQuery();
      return;
    }

    const promotedUserId = await promoteToAdmin(groupId, memberDbId);
    if (!promotedUserId) {
      await ctx.editMessageText(t(lang).errorGeneral, { reply_markup: undefined });
      await ctx.answerCallbackQuery();
      return;
    }

    const members = await getGroupMembersWithDetails(groupId);
    const promoted = members.find((m) => m.id === memberDbId);
    await ctx.editMessageText(t(lang).promotedToAdmin(promoted?.alias ?? "?"), {
      reply_markup: undefined,
      parse_mode: "Markdown",
    });
    await ctx.answerCallbackQuery("✅");

    const promotedUser = await getUserByTelegramId(promotedUserId);
    const pLang = (promotedUser?.language as "fa" | "en") ?? "fa";
    await bot.api.sendMessage(promotedUserId, t(pLang).youWerePromotedAdmin, {
      reply_markup: groupAdminKeyboard(pLang),
    }).catch(() => {});
  });

  // ─── Expand group capacity ────────────────────────────────────────────────────
  bot.hears(["⬆️ افزایش ظرفیت به ۲۵ نفر", "⬆️ Expand Capacity to 25"], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    const groupId = await getUserGroup(tgId);
    if (!groupId) { await ctx.reply(t(lang).notInChat); return; }

    const creatorCheck = await isGroupCreator(tgId, groupId);
    if (!creatorCheck) { await ctx.reply(t(lang).notGroupCreator); return; }

    const costStr = await getSetting("group_expand_cost");
    const cost = costStr ? parseInt(costStr, 10) : 10;

    await ctx.reply(t(lang).groupExpandCost(cost, 25), {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text(t(lang).confirm, "group_expand:confirm")
        .text(t(lang).cancel, "group_expand:cancel"),
    });
  });

  bot.callbackQuery("group_expand:confirm", async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    const lang = (user?.language as "fa" | "en") ?? "fa";

    const groupId = await getUserGroup(tgId);
    if (!groupId) { await ctx.answerCallbackQuery(); return; }

    const creatorCheck = await isGroupCreator(tgId, groupId);
    if (!creatorCheck) { await ctx.answerCallbackQuery(t("fa").notGroupCreator); return; }

    const groups = await import("../services/group.service.js").then((m) => m.getCreatorGroups(tgId));
    const current = groups.find((g) => g.id === groupId);
    if (current && current.maxMembers >= 25) {
      await ctx.editMessageText(t(lang).groupAlreadyMaxExpanded, { reply_markup: undefined, parse_mode: "Markdown" });
      await ctx.answerCallbackQuery();
      return;
    }

    const costStr = await getSetting("group_expand_cost");
    const cost = costStr ? parseInt(costStr, 10) : 10;

    const deduct = await deductCoins(tgId, cost, "group_cost", "Expand group capacity");
    if (!deduct.success) {
      await ctx.editMessageText(t(lang).insufficientCoins, { reply_markup: undefined });
      await ctx.answerCallbackQuery();
      return;
    }

    await expandGroupLimit(groupId, 25);
    await ctx.editMessageText(t(lang).groupExpanded(25), { reply_markup: undefined, parse_mode: "Markdown" });
    await ctx.answerCallbackQuery("✅");
  });

  bot.callbackQuery("group_expand:cancel", async (ctx) => {
    const user = ctx.dbUser ?? await getUserByTelegramId(ctx.from!.id);
    const lang = (user?.language as "fa" | "en") ?? "fa";
    await ctx.editMessageText(t(lang).cancelledAction);
    await ctx.answerCallbackQuery();
  });

  // ─── Leave group ─────────────────────────────────────────────────────────────
  bot.hears([/^🚪 خروج/, /^🚪 Leave Group/], async (ctx) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user) return;
    const lang = (user.language as "fa" | "en") ?? "fa";

    const groupIdBefore = await getUserGroup(tgId);
    const myAlias = groupIdBefore ? await generateGroupUserId(tgId, groupIdBefore) : "?";

    const result = await leaveGroup(tgId);
    if (!result) {
      await ctx.reply(t(lang).notInChat, { reply_markup: mainMenuKeyboard(lang) });
      return;
    }

    await ctx.reply(t(lang).groupLeft, { reply_markup: mainMenuKeyboard(lang) });

    if (result.remaining < 2) {
      const members = await getGroupMembers(result.groupId);
      for (const memberId of members) {
        const mUser = await getUserByTelegramId(memberId);
        const mLang = (mUser?.language as "fa" | "en") ?? "fa";
        await bot.api.sendMessage(memberId, t(mLang).groupEnded, { reply_markup: mainMenuKeyboard(mLang) }).catch(() => {});
      }
    } else {
      const members = await getGroupMembers(result.groupId);
      for (const memberId of members) {
        const mUser = await getUserByTelegramId(memberId);
        const mLang = (mUser?.language as "fa" | "en") ?? "fa";
        await bot.api.sendMessage(memberId, t(mLang).memberLeft(myAlias, result.remaining)).catch(() => {});
      }
    }
  });

  // ─── Forward group messages ───────────────────────────────────────────────────
  bot.on("message", async (ctx, next) => {
    const tgId = ctx.from!.id;
    const user = ctx.dbUser ?? await getUserByTelegramId(tgId);
    if (!user?.isInGroup) return next();
    const lang = (user.language as "fa" | "en") ?? "fa";

    const groupId = await getUserGroup(tgId);
    if (!groupId) return next();

    const members = await getGroupMembers(groupId);
    // Display name: "👑 FirstName ***" / "⭐ FirstName ***" / "FirstName ***"
    const myDisplayName = await getGroupMemberDisplayName(tgId, groupId);

    // Update last activity timestamp for anonymous group cleanup
    void updateGroupActivity(groupId);

    if (ctx.message.text) {
      const isBad = await containsBadWord(ctx.message.text);
      if (isBad) {
        await ctx.reply(t(lang).messageBlocked);
        await issueWarning(tgId, "Bad word in group");
        return;
      }
      const fwdText = `[${lang === "fa" ? "گروه" : "Group"}] ${myDisplayName}:\n${ctx.message.text}`;
      for (const memberId of members) {
        if (memberId === tgId) continue;
        await bot.api.sendMessage(memberId, fwdText).catch(() => {});
      }
    } else if (ctx.message.photo) {
      const photo = ctx.message.photo.at(-1)!;
      const caption = `[${lang === "fa" ? "گروه" : "Group"}] ${myDisplayName}: ${ctx.message.caption ?? ""}`;
      for (const memberId of members) {
        if (memberId === tgId) continue;
        await bot.api.sendPhoto(memberId, photo.file_id, { caption }).catch(() => {});
      }
    } else if (ctx.message.video) {
      const caption = `[${lang === "fa" ? "گروه" : "Group"}] ${myDisplayName}: ${ctx.message.caption ?? ""}`;
      for (const memberId of members) {
        if (memberId === tgId) continue;
        await bot.api.sendVideo(memberId, ctx.message.video.file_id, { caption }).catch(() => {});
      }
    } else if (ctx.message.voice) {
      for (const memberId of members) {
        if (memberId === tgId) continue;
        await bot.api.sendVoice(memberId, ctx.message.voice.file_id).catch(() => {});
      }
    } else if (ctx.message.sticker) {
      for (const memberId of members) {
        if (memberId === tgId) continue;
        await bot.api.sendSticker(memberId, ctx.message.sticker.file_id).catch(() => {});
      }
    }
  });

  // ─── Cleanup scheduler: end stale anonymous groups every hour ─────────────────
  setInterval(async () => {
    try {
      const cleaned = await cleanupStaleAnonymousGroups();
      if (cleaned > 0) console.log(`[group-cleanup] Ended ${cleaned} stale anonymous group(s).`);
    } catch (e) {
      console.error("[group-cleanup] Error:", e);
    }
  }, 60 * 60 * 1000); // every hour
}
