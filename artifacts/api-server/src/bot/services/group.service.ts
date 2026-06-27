import { db } from "@workspace/db";
import { groupChatsTable, groupMembersTable, usersTable } from "@workspace/db";
import { eq, and, isNull, isNotNull, ne, or, not } from "drizzle-orm";
import { randomBytes } from "crypto";

const MIN_MEMBERS = 3;
const MAX_MEMBERS = 10;

// ─── Query helpers ────────────────────────────────────────────────────────────

export async function getGroupMembers(groupId: number): Promise<number[]> {
  const members = await db
    .select()
    .from(groupMembersTable)
    .where(and(eq(groupMembersTable.groupId, groupId), isNull(groupMembersTable.leftAt)));
  return members.map((m) => m.userId);
}

export async function getUserGroup(userId: number): Promise<number | null> {
  const [member] = await db
    .select()
    .from(groupMembersTable)
    .where(and(eq(groupMembersTable.userId, userId), isNull(groupMembersTable.leftAt)))
    .limit(1);
  if (!member) return null;

  // Check active first, then forming (creator waiting for members)
  const [group] = await db
    .select()
    .from(groupChatsTable)
    .where(and(eq(groupChatsTable.id, member.groupId), eq(groupChatsTable.status, "active")))
    .limit(1);
  if (group) return group.id;

  const [forming] = await db
    .select()
    .from(groupChatsTable)
    .where(and(eq(groupChatsTable.id, member.groupId), eq(groupChatsTable.status, "forming")))
    .limit(1);
  return forming?.id ?? null;
}

export async function generateGroupUserId(userId: number, groupId: number): Promise<string> {
  const members = await db
    .select()
    .from(groupMembersTable)
    .where(and(eq(groupMembersTable.groupId, groupId), isNull(groupMembersTable.leftAt)));
  const idx = members.findIndex((m) => m.userId === userId);
  return `#${((idx === -1 ? members.length : idx) + 1).toString().padStart(3, "0")}`;
}

/** Returns display name "👑 FirstName ***" / "⭐ FirstName ***" / "FirstName ***" for group chat messages */
export async function getGroupMemberDisplayName(userId: number, groupId: number): Promise<string> {
  const [[userRow], [memberRow]] = await Promise.all([
    db.select({ firstName: usersTable.firstName })
      .from(usersTable).where(eq(usersTable.telegramId, userId)).limit(1),
    db.select({ isCreator: groupMembersTable.isCreator, isAdmin: groupMembersTable.isAdmin })
      .from(groupMembersTable)
      .where(and(eq(groupMembersTable.userId, userId), eq(groupMembersTable.groupId, groupId), isNull(groupMembersTable.leftAt)))
      .limit(1),
  ]);
  const name = userRow?.firstName ?? "ناشناس";
  const masked = `${name} ***`;
  if (memberRow?.isCreator) return `👑 ${masked}`;
  if (memberRow?.isAdmin)   return `⭐ ${masked}`;
  return masked;
}

/** Mark a group as dismissed in the user's list (hides it from created/joined list) */
export async function dismissGroupFromList(userId: number, groupId: number): Promise<void> {
  await db
    .update(groupMembersTable)
    .set({ dismissed: true })
    .where(and(eq(groupMembersTable.userId, userId), eq(groupMembersTable.groupId, groupId)));
}

export async function isGroupCreator(userId: number, groupId: number): Promise<boolean> {
  const [member] = await db
    .select()
    .from(groupMembersTable)
    .where(
      and(
        eq(groupMembersTable.userId, userId),
        eq(groupMembersTable.groupId, groupId),
        eq(groupMembersTable.isCreator, true),
        isNull(groupMembersTable.leftAt)
      )
    )
    .limit(1);
  return !!member;
}

export async function isUserBannedFromGroup(userId: number, groupId: number): Promise<boolean> {
  const [banned] = await db
    .select()
    .from(groupMembersTable)
    .where(
      and(
        eq(groupMembersTable.userId, userId),
        eq(groupMembersTable.groupId, groupId),
        eq(groupMembersTable.isBanned, true)
      )
    )
    .limit(1);
  return !!banned;
}

export async function getGroupMembersWithDetails(
  groupId: number
): Promise<Array<{ id: number; userId: number; isCreator: boolean; isAdmin: boolean; alias: string }>> {
  const members = await db
    .select()
    .from(groupMembersTable)
    .where(and(eq(groupMembersTable.groupId, groupId), isNull(groupMembersTable.leftAt)));
  return members.map((m, idx) => ({
    id: m.id,
    userId: m.userId,
    isCreator: m.isCreator,
    isAdmin: m.isAdmin,
    alias: `#${(idx + 1).toString().padStart(3, "0")}`,
  }));
}

// ─── Group creation (paid, by creator) ───────────────────────────────────────

/** Creator pays and starts a new group. Returns groupId + inviteToken. */
export async function createGroup(
  creatorId: number,
  name?: string,
  joinCost = 1
): Promise<{ groupId: number; inviteToken: string }> {
  const inviteToken = randomBytes(12).toString("hex"); // 24 hex chars

  const [group] = await db
    .insert(groupChatsTable)
    .values({
      creatorId,
      name: name ?? null,
      inviteToken,
      status: "forming",
      memberCount: 0,
      maxMembers: MAX_MEMBERS,
      joinCost,
      createdAt: new Date(),
    })
    .returning();

  await db.insert(groupMembersTable).values({
    groupId: group.id,
    userId: creatorId,
    isCreator: true,
    isBanned: false,
    joinedAt: new Date(),
  });

  await db
    .update(groupChatsTable)
    .set({ memberCount: 1 })
    .where(eq(groupChatsTable.id, group.id));
  await db
    .update(usersTable)
    .set({ isInGroup: true, updatedAt: new Date() })
    .where(eq(usersTable.telegramId, creatorId));

  return { groupId: group.id, inviteToken };
}

// ─── Join public group ────────────────────────────────────────────────────────

export async function joinOrCreateGroup(
  userId: number
): Promise<{ groupId: number; memberCount: number; isNew: boolean }> {
  const openGroups = await db
    .select()
    .from(groupChatsTable)
    .where(and(eq(groupChatsTable.status, "forming"), isNull(groupChatsTable.inviteToken)));

  // Filter groups where this user was previously banned
  const available: (typeof openGroups)[number][] = [];
  for (const g of openGroups) {
    if (g.memberCount >= MAX_MEMBERS) continue;
    const banned = await isUserBannedFromGroup(userId, g.id);
    if (!banned) available.push(g);
  }

  let targetGroup = available[0] ?? null;
  let isNew = false;

  if (!targetGroup) {
    const [newGroup] = await db
      .insert(groupChatsTable)
      .values({
        status: "forming",
        memberCount: 0,
        maxMembers: MAX_MEMBERS,
        joinCost: 1,
        createdAt: new Date(),
      })
      .returning();
    targetGroup = newGroup;
    isNew = true;
  }

  await db.insert(groupMembersTable).values({
    groupId: targetGroup.id,
    userId,
    isCreator: false,
    isBanned: false,
    joinedAt: new Date(),
  });

  const newCount = targetGroup.memberCount + 1;
  await db
    .update(groupChatsTable)
    .set({ memberCount: newCount })
    .where(eq(groupChatsTable.id, targetGroup.id));
  await db
    .update(usersTable)
    .set({ isInGroup: true, updatedAt: new Date() })
    .where(eq(usersTable.telegramId, userId));

  if (newCount >= MIN_MEMBERS) {
    await db
      .update(groupChatsTable)
      .set({ status: "active" })
      .where(eq(groupChatsTable.id, targetGroup.id));
  }

  return { groupId: targetGroup.id, memberCount: newCount, isNew };
}

// ─── Leave group ──────────────────────────────────────────────────────────────

export async function leaveGroup(
  userId: number
): Promise<{ groupId: number; remaining: number } | null> {
  const [member] = await db
    .select()
    .from(groupMembersTable)
    .where(and(eq(groupMembersTable.userId, userId), isNull(groupMembersTable.leftAt)))
    .limit(1);
  if (!member) return null;

  await db
    .update(groupMembersTable)
    .set({ leftAt: new Date() })
    .where(eq(groupMembersTable.id, member.id));
  await db
    .update(usersTable)
    .set({ isInGroup: false, updatedAt: new Date() })
    .where(eq(usersTable.telegramId, userId));

  const [group] = await db
    .select()
    .from(groupChatsTable)
    .where(eq(groupChatsTable.id, member.groupId))
    .limit(1);
  if (!group) return null;

  const remaining = Math.max(0, group.memberCount - 1);
  await db
    .update(groupChatsTable)
    .set({ memberCount: remaining })
    .where(eq(groupChatsTable.id, member.groupId));

  // Only auto-end ANONYMOUS groups (creatorId = null) when too few members remain.
  // Named groups (creatorId set) stay active until the creator explicitly deletes them.
  if (remaining === 0 && group.creatorId === null) {
    await db
      .update(groupChatsTable)
      .set({ status: "ended", endedAt: new Date() })
      .where(eq(groupChatsTable.id, member.groupId));
    // Remove any remaining members (safety sweep)
    const rest = await db
      .select()
      .from(groupMembersTable)
      .where(and(eq(groupMembersTable.groupId, member.groupId), isNull(groupMembersTable.leftAt)));
    for (const m of rest) {
      await db
        .update(groupMembersTable)
        .set({ leftAt: new Date() })
        .where(eq(groupMembersTable.id, m.id));
      await db
        .update(usersTable)
        .set({ isInGroup: false, updatedAt: new Date() })
        .where(eq(usersTable.telegramId, m.userId));
    }
  }

  return { groupId: member.groupId, remaining };
}

// ─── Creator: kick member ─────────────────────────────────────────────────────

/** Removes a member from the group (by DB row ID). Returns their telegramId. */
export async function kickMember(groupId: number, memberDbId: number): Promise<number | null> {
  const [member] = await db
    .select()
    .from(groupMembersTable)
    .where(
      and(
        eq(groupMembersTable.id, memberDbId),
        eq(groupMembersTable.groupId, groupId),
        isNull(groupMembersTable.leftAt)
      )
    )
    .limit(1);
  if (!member || member.isCreator) return null;

  await db
    .update(groupMembersTable)
    .set({ leftAt: new Date() })
    .where(eq(groupMembersTable.id, member.id));
  await db
    .update(usersTable)
    .set({ isInGroup: false, updatedAt: new Date() })
    .where(eq(usersTable.telegramId, member.userId));

  const remainingIds = await getGroupMembers(groupId);
  await db
    .update(groupChatsTable)
    .set({ memberCount: remainingIds.length })
    .where(eq(groupChatsTable.id, groupId));

  return member.userId;
}

// ─── Creator: ban member ──────────────────────────────────────────────────────

/** Kicks and permanently bans a member from this group (by DB row ID). Returns their telegramId. */
export async function banMember(groupId: number, memberDbId: number): Promise<number | null> {
  const [member] = await db
    .select()
    .from(groupMembersTable)
    .where(
      and(
        eq(groupMembersTable.id, memberDbId),
        eq(groupMembersTable.groupId, groupId),
        isNull(groupMembersTable.leftAt)
      )
    )
    .limit(1);
  if (!member || member.isCreator) return null;

  await db
    .update(groupMembersTable)
    .set({ leftAt: new Date(), isBanned: true })
    .where(eq(groupMembersTable.id, member.id));
  await db
    .update(usersTable)
    .set({ isInGroup: false, updatedAt: new Date() })
    .where(eq(usersTable.telegramId, member.userId));

  const remainingIds = await getGroupMembers(groupId);
  await db
    .update(groupChatsTable)
    .set({ memberCount: remainingIds.length })
    .where(eq(groupChatsTable.id, groupId));

  return member.userId;
}

// ─── New functions: admin, expand, invite, creator-groups ─────────────────────

/** Returns ALL groups where user is creator (excluding dismissed ones). Includes live active member count. */
export async function getCreatorGroups(
  userId: number
): Promise<Array<{ id: number; name: string | null; inviteToken: string | null; memberCount: number; activeMemberCount: number; maxMembers: number; status: string }>> {
  const rows = await db
    .select({
      id: groupChatsTable.id,
      name: groupChatsTable.name,
      inviteToken: groupChatsTable.inviteToken,
      memberCount: groupChatsTable.memberCount,
      maxMembers: groupChatsTable.maxMembers,
      status: groupChatsTable.status,
      dismissed: groupMembersTable.dismissed,
    })
    .from(groupChatsTable)
    .leftJoin(
      groupMembersTable,
      and(eq(groupMembersTable.groupId, groupChatsTable.id), eq(groupMembersTable.userId, userId), eq(groupMembersTable.isCreator, true))
    )
    .where(and(eq(groupChatsTable.creatorId, userId), not(eq(groupMembersTable.dismissed, true))));

  // Fetch live active member counts for each group in parallel
  const withActive = await Promise.all(rows.map(async (r) => {
    const activeRows = await db
      .select({ id: groupMembersTable.id })
      .from(groupMembersTable)
      .where(and(eq(groupMembersTable.groupId, r.id), isNull(groupMembersTable.leftAt)));
    return { id: r.id, name: r.name, inviteToken: r.inviteToken, memberCount: r.memberCount, activeMemberCount: activeRows.length, maxMembers: r.maxMembers, status: r.status };
  }));
  return withActive;
}

/** Groups the user joined via invite link (named groups with creatorId set, NOT the user themselves), excluding dismissed. */
export async function getJoinedGroups(
  userId: number
): Promise<Array<{ id: number; name: string | null; memberCount: number; maxMembers: number; isAdmin: boolean; status: string; leftAt: Date | null }>> {
  const rows = await db
    .select({
      id: groupChatsTable.id,
      name: groupChatsTable.name,
      memberCount: groupChatsTable.memberCount,
      maxMembers: groupChatsTable.maxMembers,
      isAdmin: groupMembersTable.isAdmin,
      status: groupChatsTable.status,
      leftAt: groupMembersTable.leftAt,
    })
    .from(groupMembersTable)
    .innerJoin(groupChatsTable, eq(groupMembersTable.groupId, groupChatsTable.id))
    .where(
      and(
        eq(groupMembersTable.userId, userId),
        eq(groupMembersTable.dismissed, false),
        // Only named groups (invite-link groups have creatorId set)
        isNotNull(groupChatsTable.creatorId),
        // Exclude groups the user themselves created
        ne(groupChatsTable.creatorId, userId)
      )
    );
  return rows;
}

/** Returns the user's current group slot limits and usage counts (active groups only) */
export async function getUserGroupSlots(tgId: number): Promise<{
  maxCreated: number; maxJoined: number; createdCount: number; joinedCount: number;
}> {
  const [user] = await db
    .select({ maxGroupsCreated: usersTable.maxGroupsCreated, maxGroupsJoined: usersTable.maxGroupsJoined })
    .from(usersTable)
    .where(eq(usersTable.telegramId, tgId));
  const maxCreated = user?.maxGroupsCreated ?? 5;
  const maxJoined  = user?.maxGroupsJoined  ?? 5;
  const [cc, jc] = await Promise.all([getCreatorGroups(tgId), getJoinedGroups(tgId)]);
  // Only count non-ended groups toward the limit
  const createdCount = cc.filter(g => g.status !== "ended").length;
  const joinedCount  = jc.filter(g => g.status !== "ended" && g.leftAt === null).length;
  return { maxCreated, maxJoined, createdCount, joinedCount };
}

/** Expand user's group slot limit from 5 → 10 for the given section. Returns false if already maxed. */
export async function expandGroupSlots(tgId: number, section: "created" | "joined"): Promise<boolean> {
  const [user] = await db
    .select({ maxGroupsCreated: usersTable.maxGroupsCreated, maxGroupsJoined: usersTable.maxGroupsJoined })
    .from(usersTable)
    .where(eq(usersTable.telegramId, tgId));
  const current = section === "created" ? (user?.maxGroupsCreated ?? 5) : (user?.maxGroupsJoined ?? 5);
  if (current >= 10) return false;
  await db
    .update(usersTable)
    .set(section === "created"
      ? { maxGroupsCreated: 10, updatedAt: new Date() }
      : { maxGroupsJoined: 10, updatedAt: new Date() })
    .where(eq(usersTable.telegramId, tgId));
  return true;
}

/** Count of promoted admins (isAdmin=true, non-creator, currently in group) */
export async function getGroupAdminCount(groupId: number): Promise<number> {
  const rows = await db
    .select({ id: groupMembersTable.id })
    .from(groupMembersTable)
    .where(
      and(
        eq(groupMembersTable.groupId, groupId),
        eq(groupMembersTable.isAdmin, true),
        isNull(groupMembersTable.leftAt)
      )
    );
  return rows.length;
}

/** Promotes a group member (by DB row id) to admin. Returns their telegramId. */
export async function promoteToAdmin(groupId: number, memberDbId: number): Promise<number | null> {
  const [member] = await db
    .select()
    .from(groupMembersTable)
    .where(
      and(
        eq(groupMembersTable.id, memberDbId),
        eq(groupMembersTable.groupId, groupId),
        isNull(groupMembersTable.leftAt)
      )
    )
    .limit(1);
  if (!member || member.isCreator || member.isAdmin) return null;

  await db
    .update(groupMembersTable)
    .set({ isAdmin: true })
    .where(eq(groupMembersTable.id, memberDbId));

  return member.userId;
}

/** Update last_activity_at for a group (called on each forwarded message). */
export async function updateGroupActivity(groupId: number): Promise<void> {
  await db
    .update(groupChatsTable)
    .set({ lastActivityAt: new Date() })
    .where(eq(groupChatsTable.id, groupId));
}

/** Ends anonymous groups that have been inactive for more than 24 hours. */
export async function cleanupStaleAnonymousGroups(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  // Find anonymous (creatorId null) active/forming groups with no activity in 24h
  const stale = await db
    .select({ id: groupChatsTable.id, lastActivityAt: groupChatsTable.lastActivityAt, createdAt: groupChatsTable.createdAt })
    .from(groupChatsTable)
    .where(
      and(
        isNull(groupChatsTable.creatorId),
        or(eq(groupChatsTable.status, "active"), eq(groupChatsTable.status, "forming"))
      )
    );

  let cleaned = 0;
  for (const g of stale) {
    const lastActive = g.lastActivityAt ?? g.createdAt;
    if (lastActive < cutoff) {
      // End the group
      await db.update(groupChatsTable).set({ status: "ended", endedAt: new Date() }).where(eq(groupChatsTable.id, g.id));
      // Clear all active members
      const members = await db
        .select()
        .from(groupMembersTable)
        .where(and(eq(groupMembersTable.groupId, g.id), isNull(groupMembersTable.leftAt)));
      for (const m of members) {
        await db.update(groupMembersTable).set({ leftAt: new Date() }).where(eq(groupMembersTable.id, m.id));
        await db.update(usersTable).set({ isInGroup: false, updatedAt: new Date() }).where(eq(usersTable.telegramId, m.userId));
      }
      cleaned++;
    }
  }
  return cleaned;
}

/** Expands maxMembers for a group. */
export async function expandGroupLimit(groupId: number, newMax: number): Promise<void> {
  await db
    .update(groupChatsTable)
    .set({ maxMembers: newMax })
    .where(eq(groupChatsTable.id, groupId));
}

/** Returns a forming/active group matching the invite token, or null. */
export async function getGroupByInviteToken(
  token: string
): Promise<typeof groupChatsTable.$inferSelect | null> {
  const [group] = await db
    .select()
    .from(groupChatsTable)
    .where(and(eq(groupChatsTable.inviteToken, token), isNotNull(groupChatsTable.inviteToken)))
    .limit(1);
  return group ?? null;
}

/** Returns the inviteToken for a group. */
export async function getGroupInviteToken(groupId: number): Promise<string | null> {
  const [g] = await db
    .select({ inviteToken: groupChatsTable.inviteToken })
    .from(groupChatsTable)
    .where(eq(groupChatsTable.id, groupId))
    .limit(1);
  return g?.inviteToken ?? null;
}

/** True if user is creator OR promoted admin of the group (and hasn't left). */
export async function isGroupAdmin(userId: number, groupId: number): Promise<boolean> {
  const [member] = await db
    .select()
    .from(groupMembersTable)
    .where(
      and(
        eq(groupMembersTable.userId, userId),
        eq(groupMembersTable.groupId, groupId),
        isNull(groupMembersTable.leftAt)
      )
    )
    .limit(1);
  if (!member) return false;
  return member.isCreator || member.isAdmin;
}

/** Joins a user to a specific group (by invite link). Returns the new memberCount. */
export async function joinGroupByInvite(
  userId: number,
  groupId: number
): Promise<{ memberCount: number }> {
  const [group] = await db
    .select()
    .from(groupChatsTable)
    .where(eq(groupChatsTable.id, groupId))
    .limit(1);
  if (!group) return { memberCount: 0 };

  await db.insert(groupMembersTable).values({
    groupId,
    userId,
    isCreator: false,
    isBanned: false,
    joinedAt: new Date(),
  });

  const newCount = group.memberCount + 1;
  await db
    .update(groupChatsTable)
    .set({
      memberCount: newCount,
      status: newCount >= MIN_MEMBERS ? "active" : "forming",
    })
    .where(eq(groupChatsTable.id, groupId));
  await db
    .update(usersTable)
    .set({ isInGroup: true, updatedAt: new Date() })
    .where(eq(usersTable.telegramId, userId));

  return { memberCount: newCount };
}
