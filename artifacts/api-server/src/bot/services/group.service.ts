import { db } from "@workspace/db";
import { groupChatsTable, groupMembersTable, usersTable } from "@workspace/db";
import { eq, and, isNull, count } from "drizzle-orm";

const MIN_MEMBERS = 3;
const MAX_MEMBERS = 10;

export async function joinOrCreateGroup(userId: number): Promise<{ groupId: number; memberCount: number; isNew: boolean }> {
  // Find an open group
  const openGroups = await db.select().from(groupChatsTable).where(
    and(eq(groupChatsTable.status, "forming"))
  );

  let targetGroup = openGroups.find(g => g.memberCount < MAX_MEMBERS);

  if (!targetGroup) {
    const [newGroup] = await db.insert(groupChatsTable).values({
      status: "forming",
      memberCount: 0,
      maxMembers: MAX_MEMBERS,
      createdAt: new Date(),
    }).returning();
    targetGroup = newGroup;
  }

  await db.insert(groupMembersTable).values({
    groupId: targetGroup.id,
    userId,
    joinedAt: new Date(),
  });

  const newCount = targetGroup.memberCount + 1;
  await db.update(groupChatsTable).set({ memberCount: newCount }).where(eq(groupChatsTable.id, targetGroup.id));
  await db.update(usersTable).set({ isInGroup: true, updatedAt: new Date() }).where(eq(usersTable.telegramId, userId));

  // Activate if enough members
  if (newCount >= MIN_MEMBERS) {
    await db.update(groupChatsTable).set({ status: "active" }).where(eq(groupChatsTable.id, targetGroup.id));
  }

  return { groupId: targetGroup.id, memberCount: newCount, isNew: targetGroup.memberCount === 0 };
}

export async function getGroupMembers(groupId: number): Promise<number[]> {
  const members = await db.select().from(groupMembersTable).where(
    and(eq(groupMembersTable.groupId, groupId), isNull(groupMembersTable.leftAt))
  );
  return members.map(m => m.userId);
}

export async function getUserGroup(userId: number): Promise<number | null> {
  const [member] = await db.select().from(groupMembersTable).where(
    and(eq(groupMembersTable.userId, userId), isNull(groupMembersTable.leftAt))
  ).limit(1);
  if (!member) return null;

  const [group] = await db.select().from(groupChatsTable).where(
    and(eq(groupChatsTable.id, member.groupId), eq(groupChatsTable.status, "active"))
  ).limit(1);
  return group?.id ?? null;
}

export async function leaveGroup(userId: number): Promise<{ groupId: number; remaining: number } | null> {
  const [member] = await db.select().from(groupMembersTable).where(
    and(eq(groupMembersTable.userId, userId), isNull(groupMembersTable.leftAt))
  ).limit(1);
  if (!member) return null;

  await db.update(groupMembersTable).set({ leftAt: new Date() }).where(eq(groupMembersTable.id, member.id));
  await db.update(usersTable).set({ isInGroup: false, updatedAt: new Date() }).where(eq(usersTable.telegramId, userId));

  const [group] = await db.select().from(groupChatsTable).where(eq(groupChatsTable.id, member.groupId)).limit(1);
  if (!group) return null;

  const remaining = Math.max(0, group.memberCount - 1);
  await db.update(groupChatsTable).set({ memberCount: remaining }).where(eq(groupChatsTable.id, member.groupId));

  if (remaining < 2) {
    await db.update(groupChatsTable).set({ status: "ended", endedAt: new Date() }).where(eq(groupChatsTable.id, member.groupId));
    // Clean up remaining members
    const remainingMembers = await db.select().from(groupMembersTable).where(
      and(eq(groupMembersTable.groupId, member.groupId), isNull(groupMembersTable.leftAt))
    );
    for (const m of remainingMembers) {
      await db.update(groupMembersTable).set({ leftAt: new Date() }).where(eq(groupMembersTable.id, m.id));
      await db.update(usersTable).set({ isInGroup: false, updatedAt: new Date() }).where(eq(usersTable.telegramId, m.userId));
    }
  }

  return { groupId: member.groupId, remaining };
}

export async function generateGroupUserId(userId: number, groupId: number): Promise<string> {
  const members = await getGroupMembers(groupId);
  const idx = members.indexOf(userId);
  return `#${(idx + 1).toString().padStart(3, "0")}`;
}
