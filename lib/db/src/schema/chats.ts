import { pgTable, serial, bigint, text, timestamp, varchar, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const chatStatusEnum = pgEnum("chat_status", ["waiting", "active", "ended"]);
export const messageTypeEnum = pgEnum("message_type", ["text", "photo", "video", "audio", "document", "sticker", "voice", "video_note", "animation"]);
export const genderPrefEnum = pgEnum("gender_pref", ["male", "female", "any"]);

export const chatSessionsTable = pgTable("chat_sessions", {
  id: serial("id").primaryKey(),
  user1Id: bigint("user1_id", { mode: "number" }).notNull(),
  user2Id: bigint("user2_id", { mode: "number" }).notNull(),
  status: chatStatusEnum("status").default("active").notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
  endedBy: bigint("ended_by", { mode: "number" }),
});

export const matchingQueueTable = pgTable("matching_queue", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull().unique(),
  genderPreference: genderPrefEnum("gender_preference").default("any").notNull(),
  userGender: varchar("user_gender", { length: 10 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertChatSessionSchema = createInsertSchema(chatSessionsTable).omit({ id: true });
export type InsertChatSession = z.infer<typeof insertChatSessionSchema>;
export type ChatSession = typeof chatSessionsTable.$inferSelect;
export type MatchingQueue = typeof matchingQueueTable.$inferSelect;
