import { db, callQueueTable, callSessionsTable, usersTable } from "@workspace/db";
import { eq, and, ne, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

export type CallType     = "voice" | "video";
export type GenderFilter = "male" | "female" | "random";

/** Upsert user into queue — replaces any previous slot */
export async function joinQueue(
  userId:       number,
  callType:     CallType,
  genderFilter: GenderFilter,
): Promise<string> {
  const roomToken = randomUUID().replace(/-/g, "").slice(0, 32);
  await db
    .insert(callQueueTable)
    .values({ userId, callType, genderFilter, roomToken, status: "waiting" })
    .onConflictDoUpdate({
      target: callQueueTable.userId,
      set: { callType, genderFilter, roomToken, status: "waiting", createdAt: sql`now()`, matchedAt: null },
    });
  return roomToken;
}

/** Remove user from queue */
export async function leaveQueue(userId: number): Promise<void> {
  await db.delete(callQueueTable).where(eq(callQueueTable.userId, userId));
}

/**
 * Find a compatible waiting match (FIFO).
 * Gender compatibility rules:
 *   - "random" → accepts anyone
 *   - "male"   → other must be male AND accept me
 *   - "female" → other must be female AND accept me
 */
export async function findMatch(
  myUserId:     number,
  callType:     CallType,
  genderFilter: GenderFilter,
  myGender:     string | null,
): Promise<{ userId: number; roomToken: string; genderFilter: GenderFilter } | null> {
  const candidates = await db
    .select({
      qUserId:   callQueueTable.userId,
      roomToken: callQueueTable.roomToken,
      qFilter:   callQueueTable.genderFilter,
      uGender:   usersTable.gender,
    })
    .from(callQueueTable)
    .innerJoin(usersTable, eq(usersTable.telegramId, callQueueTable.userId))
    .where(
      and(
        ne(callQueueTable.userId, myUserId),
        eq(callQueueTable.status, "waiting"),
        eq(callQueueTable.callType, callType),
      )
    )
    .orderBy(callQueueTable.createdAt) // FIFO
    .limit(50);

  for (const c of candidates) {
    const iWantThem  = matchesFilter(genderFilter, c.uGender);
    const theyWantMe = matchesFilter(c.qFilter,    myGender);
    if (iWantThem && theyWantMe) {
      return { userId: c.qUserId, roomToken: c.roomToken, genderFilter: c.qFilter };
    }
  }
  return null;
}

function matchesFilter(filter: string, gender: string | null): boolean {
  if (filter === "random") return true;
  if (!gender) return false;
  return filter === gender;
}

/** Remove both users from queue + create session record */
export async function confirmMatch(params: {
  callerUserId:          number;
  receiverUserId:        number;
  callType:              CallType;
  callerGenderFilter:    GenderFilter;
  roomToken:             string;
  coinsDeductedCaller:   number;
  coinsDeductedReceiver: number;
}): Promise<number> {
  const now = new Date();
  await db.delete(callQueueTable).where(
    or(
      eq(callQueueTable.userId, params.callerUserId),
      eq(callQueueTable.userId, params.receiverUserId),
    )
  );
  const [session] = await db
    .insert(callSessionsTable)
    .values({
      callerUserId:          params.callerUserId,
      receiverUserId:        params.receiverUserId,
      callType:              params.callType,
      genderFilter:          params.callerGenderFilter,
      status:                "connecting",
      roomToken:             params.roomToken,
      coinsDeductedCaller:   params.coinsDeductedCaller,
      coinsDeductedReceiver: params.coinsDeductedReceiver,
      connectedAt:           now,
    })
    .returning({ id: callSessionsTable.id });
  return session!.id;
}

/** Mark session as active (both sides joined WebRTC) */
export async function activateSession(sessionId: number): Promise<void> {
  await db
    .update(callSessionsTable)
    .set({ status: "active" })
    .where(eq(callSessionsTable.id, sessionId));
}

/** Mark session as ended */
export async function endSession(sessionId: number, reason: string): Promise<void> {
  await db
    .update(callSessionsTable)
    .set({ status: "ended", endedAt: new Date(), endReason: reason })
    .where(eq(callSessionsTable.id, sessionId));
}

/** Get active (connecting/active) session for user */
export async function getActiveCallSession(
  userId: number,
): Promise<{ id: number; roomToken: string; partnerId: number } | null> {
  const [s] = await db
    .select({
      id:             callSessionsTable.id,
      roomToken:      callSessionsTable.roomToken,
      callerUserId:   callSessionsTable.callerUserId,
      receiverUserId: callSessionsTable.receiverUserId,
    })
    .from(callSessionsTable)
    .where(
      and(
        or(
          eq(callSessionsTable.callerUserId,   userId),
          eq(callSessionsTable.receiverUserId, userId),
        ),
        or(
          eq(callSessionsTable.status, "connecting"),
          eq(callSessionsTable.status, "active"),
        ),
      )
    )
    .limit(1);
  if (!s) return null;
  return {
    id: s.id,
    roomToken: s.roomToken,
    partnerId: s.callerUserId === userId ? s.receiverUserId : s.callerUserId,
  };
}
