import { pgTable, serial, bigint, integer, text, timestamp, varchar, pgEnum } from "drizzle-orm/pg-core";

export const callTypeEnum         = pgEnum("call_type",          ["voice", "video"]);
export const callGenderFilterEnum = pgEnum("call_gender_filter",  ["male", "female", "random"]);
export const callStatusEnum       = pgEnum("call_status",        ["waiting", "connecting", "active", "ended", "failed"]);
export const callQueueStatusEnum  = pgEnum("call_queue_status",  ["waiting", "matched", "cancelled", "timeout"]);

/** One slot per user — upserted on join, deleted on match/cancel */
export const callQueueTable = pgTable("call_queue", {
  id:           serial("id").primaryKey(),
  userId:       bigint("user_id",    { mode: "number" }).notNull().unique(),
  callType:     callTypeEnum("call_type").notNull(),
  genderFilter: callGenderFilterEnum("gender_filter").notNull(),
  roomToken:    varchar("room_token", { length: 64 }).notNull().unique(),
  status:       callQueueStatusEnum("status").default("waiting").notNull(),
  createdAt:    timestamp("created_at").defaultNow().notNull(),
  matchedAt:    timestamp("matched_at"),
});

/** Persistent record of every call attempt */
export const callSessionsTable = pgTable("call_sessions", {
  id:                    serial("id").primaryKey(),
  callerUserId:          bigint("caller_user_id",    { mode: "number" }).notNull(),
  receiverUserId:        bigint("receiver_user_id",  { mode: "number" }).notNull(),
  callType:              callTypeEnum("call_type").notNull(),
  genderFilter:          callGenderFilterEnum("gender_filter").notNull(),
  status:                callStatusEnum("status").default("waiting").notNull(),
  roomToken:             varchar("room_token", { length: 64 }).notNull().unique(),
  coinsDeductedCaller:   integer("coins_deducted_caller").default(0).notNull(),
  coinsDeductedReceiver: integer("coins_deducted_receiver").default(0).notNull(),
  createdAt:             timestamp("created_at").defaultNow().notNull(),
  connectedAt:           timestamp("connected_at"),
  endedAt:               timestamp("ended_at"),
  endReason:             text("end_reason"),
});

export type CallQueue   = typeof callQueueTable.$inferSelect;
export type CallSession = typeof callSessionsTable.$inferSelect;
