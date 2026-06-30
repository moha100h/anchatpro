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
  userGender: string,
  userLanguage?: string,
  ageMatch?: boolean,
  userAge?: number
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
    .select({
      userId: matchingQueueTable.userId,
      genderPreference: matchingQueueTable.genderPreference,
      userGender: matchingQueueTable.userGender,
      createdAt: matchingQueueTable.createdAt,
      language: usersTable.language,
      age: usersTable.age,
    })
    .from(matchingQueueTable)
    .innerJoin(usersTable, eq(matchingQueueTable.userId, usersTable.telegramId))
    .where(
      and(
        ne(matchingQueueTable.userId, userId),
        // Only match with users who are actually waiting and not already in a chat
        eq(usersTable.isInQueue, true),
        eq(usersTable.isInChat, false),
        blockedIds.length > 0
          ? notInArray(matchingQueueTable.userId, blockedIds)
          : undefined
      )
    )
    .orderBy(asc(matchingQueueTable.createdAt));

  const matchesGenderPref = (c: (typeof candidates)[number]) => {
    const prefMatch = genderPreference === "any" || c.userGender === genderPreference;
    const theirPrefMatch = c.genderPreference === "any" || c.genderPreference === userGender;
    return prefMatch && theirPrefMatch;
  };

  const sameLanguage = (c: (typeof candidates)[number]) =>
    !userLanguage || !c.language || c.language === userLanguage;

  // Age proximity filter: within ±5 years
  const nearAge = (c: (typeof candidates)[number]) =>
    !ageMatch || !userAge || !c.age || Math.abs(c.age - userAge) <= 5;

  // Helper: run all 5 priority levels with optional age filter
  const findWithPriority = (useAgeFilter: boolean) => {
    const af = useAgeFilter ? nearAge : () => true;
    return (
      candidates.find((c) => af(c) && matchesGenderPref(c) && sameLanguage(c)) ??
      candidates.find((c) => af(c) && matchesGenderPref(c)) ??
      candidates.find((c) => {
        const prefOk = genderPreference === "any" || c.userGender === genderPreference;
        return af(c) && prefOk && sameLanguage(c);
      }) ??
      candidates.find((c) => af(c) && (genderPreference === "any" || c.userGender === genderPreference)) ??
      (genderPreference === "any" ? candidates.find((c) => af(c)) : null)
    );
  };

  // When ageMatch is on: first try near-age candidates, then fall back to any age
  const best = (ageMatch && userAge)
    ? (findWithPriority(true) ?? findWithPriority(false))
    : findWithPriority(false);

  return best?.userId ?? null;
}

export async function createChatSession(user1Id: number, user2Id: number): Promise<number | null> {
  // Guard against race conditions: verify both users are still free before creating a session.
  const [u1, u2] = await Promise.all([
    db.select({ isInChat: usersTable.isInChat, isInQueue: usersTable.isInQueue })
      .from(usersTable).where(eq(usersTable.telegramId, user1Id)).limit(1),
    db.select({ isInChat: usersTable.isInChat, isInQueue: usersTable.isInQueue })
      .from(usersTable).where(eq(usersTable.telegramId, user2Id)).limit(1),
  ]);
  // If either user is already in a chat, abort — they were snatched by a concurrent match
  if (u1[0]?.isInChat || u2[0]?.isInChat) return null;

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
