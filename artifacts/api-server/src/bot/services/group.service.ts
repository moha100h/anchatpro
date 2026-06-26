import { db } from "@workspace/db";
import { groupChatsTable, groupMembersTable, usersTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";

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
): Promise<Array<{ id: number; userId: number; isCreator: boolean; alias: string }>> {
  const members = await db
    .select()
    .from(groupMembersTable)
    .where(and(eq(groupMembersTable.groupId, groupId), isNull(groupMembersTable.leftAt)));
  return members.map((m, idx) => ({
    id: m.id,
    userId: m.userId,
    isCreator: m.isCreator,
    alias: `#${(idx + 1).toString().padStart(3, "0")}`,
  }));
}

// ─── Group creation (paid, by creator) ───────────────────────────────────────

/** Creator pays and starts a new group. Returns groupId. */
export async function createGroup(creatorId: number, joinCost = 1): Promise<{ groupId: number }> {
  const [group] = await db
    .insert(groupChatsTable)
    .values({
      creatorId,
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

  return { groupId: group.id };
}

// ─── Join public group ────────────────────────────────────────────────────────

export async function joinOrCreateGroup(
  userId: number
): Promise<{ groupId: number; memberCount: number; isNew: boolean }> {
  const openGroups = await db
    .select()
    .from(groupChatsTable)
    .where(eq(groupChatsTable.status, "forming"));

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

  if (remaining < 2) {
    await db
      .update(groupChatsTable)
      .set({ status: "ended", endedAt: new Date() })
      .where(eq(groupChatsTable.id, member.groupId));
    // Remove all remaining members
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
