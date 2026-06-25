import { pgTable, serial, bigint, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const groupStatusEnum = pgEnum("group_status", ["forming", "active", "ended"]);

export const groupChatsTable = pgTable("group_chats", {
  id: serial("id").primaryKey(),
  status: groupStatusEnum("status").default("forming").notNull(),
  memberCount: integer("member_count").default(0).notNull(),
  maxMembers: integer("max_members").default(10).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
});

export const groupMembersTable = pgTable("group_members", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  leftAt: timestamp("left_at"),
});

export const insertGroupChatSchema = createInsertSchema(groupChatsTable).omit({ id: true });
export type InsertGroupChat = z.infer<typeof insertGroupChatSchema>;
export type GroupChat = typeof groupChatsTable.$inferSelect;
export type GroupMember = typeof groupMembersTable.$inferSelect;
