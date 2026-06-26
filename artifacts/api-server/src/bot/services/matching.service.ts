import { db } from "@workspace/db";
import { matchingQueueTable, chatSessionsTable, usersTable, blocksTable } from "@workspace/db";
import { eq, and, ne, or, notInArray, asc, count, lt } from "drizzle-orm";

export async function addToQueue(
  userId: number,
  genderPreference: "male" | "female" | "any",
  userGender?: string
): Promise<void> {
  await db
    .insert(matchingQueueTable)
    .values({
      userId,
      genderPreference,
      userGender: userGender ?? "other",
      createdAt: new Date(),
    })
    .onConflictDoNothing();
  await db
    .update(usersTable)
    .set({ isInQueue: true, updatedAt: new Date() })
    .where(eq(usersTable.telegramId, userId));
}

export async function removeFromQueue(userId: number): Promise<void> {
  await db.delete(matchingQueueTable).where(eq(matchingQueueTable.userId, userId));
  await db
    .update(usersTable)
    .set({ isInQueue: false, updatedAt: new Date() })
    .where(eq(usersTable.telegramId, userId));
}

export async function findMatch(
  userId: number,
  genderPreference: "male" | "female" | "any",
  userGender: string
): Promise<number | null> {
  // Get users blocked by or blocking this user
  const blocks = await db
    .select()
    .from(blocksTable)
    .where(or(eq(blocksTable.blockerId, userId), eq(blocksTable.blockedId, userId)));
  const blockedIds = blocks.map((b) =>
    b.blockerId === userId ? b.blockedId : b.blockerId
  );

  const candidates = await db
    .select()
    .from(matchingQueueTable)
    .where(
      and(
        ne(matchingQueueTable.userId, userId),
        blockedIds.length > 0
          ? notInArray(matchingQueueTable.userId, blockedIds)
          : undefined
      )
    )
    .orderBy(asc(matchingQueueTable.createdAt));

  // Smart matching: mutual preference first, then one-way, then any-any
  const bestMatch =
    candidates.find((c) => {
      const prefMatch = genderPreference === "any" || c.userGender === genderPreference;
      const theirPrefMatch = c.genderPreference === "any" || c.genderPreference === userGender;
      return prefMatch && theirPrefMatch;
    }) ??
    candidates.find((c) => genderPreference === "any" || c.userGender === genderPreference) ??
    (genderPreference === "any" ? candidates[0] : null);

  return bestMatch?.userId ?? null;
}

export async function createChatSession(user1Id: number, user2Id: number): Promise<number> {
  const [session] = await db
    .insert(chatSessionsTable)
    .values({ user1Id, user2Id, status: "active", startedAt: new Date() })
    .returning();

  await db
    .update(usersTable)
    .set({ isInChat: true, isInQueue: false, updatedAt: new Date() })
    .where(or(eq(usersTable.telegramId, user1Id), eq(usersTable.telegramId, user2Id)));

  await db
    .delete(matchingQueueTable)
    .where(
      or(eq(matchingQueueTable.userId, user1Id), eq(matchingQueueTable.userId, user2Id))
    );

  return session.id;
}

export async function getActiveSession(
  userId: number
): Promise<typeof chatSessionsTable.$inferSelect | null> {
  const [session] = await db
    .select()
    .from(chatSessionsTable)
    .where(
      and(
        or(eq(chatSessionsTable.user1Id, userId), eq(chatSessionsTable.user2Id, userId)),
        eq(chatSessionsTable.status, "active")
      )
    )
    .limit(1);
  return session ?? null;
}

export async function endChatSession(
  sessionId: number,
  endedBy: number
): Promise<{ user1Id: number; user2Id: number } | null> {
  const [session] = await db
    .select()
    .from(chatSessionsTable)
    .where(eq(chatSessionsTable.id, sessionId))
    .limit(1);
  if (!session || session.status === "ended") return null;

  await db
    .update(chatSessionsTable)
    .set({ status: "ended", endedAt: new Date(), endedBy })
    .where(eq(chatSessionsTable.id, sessionId));

  await db
    .update(usersTable)
    .set({ isInChat: false, updatedAt: new Date() })
    .where(
      or(eq(usersTable.telegramId, session.user1Id), eq(usersTable.telegramId, session.user2Id))
    );

  return { user1Id: session.user1Id, user2Id: session.user2Id };
}

export async function getPartnerId(sessionId: number, myId: number): Promise<number | null> {
  const [session] = await db
    .select()
    .from(chatSessionsTable)
    .where(eq(chatSessionsTable.id, sessionId))
    .limit(1);
  if (!session) return null;
  return session.user1Id === myId ? session.user2Id : session.user1Id;
}

export async function cleanupStaleQueue(timeoutMinutes = 2): Promise<number[]> {
  const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000);
  const staleEntries = await db
    .select()
    .from(matchingQueueTable)
    .where(lt(matchingQueueTable.createdAt, cutoff));

  const staleIds = staleEntries.map((e) => e.userId);
  for (const uid of staleIds) {
    await removeFromQueue(uid);
  }
  return staleIds;
}

export async function getTotalChats(): Promise<number> {
  const [result] = await db.select({ count: count() }).from(chatSessionsTable);
  return result?.count ?? 0;
}
