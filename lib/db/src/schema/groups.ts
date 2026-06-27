import { pgTable, serial, bigint, integer, boolean, timestamp, pgEnum, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const groupStatusEnum = pgEnum("group_status", ["forming", "active", "ended"]);

export const groupChatsTable = pgTable("group_chats", {
  id: serial("id").primaryKey(),
  creatorId: bigint("creator_id", { mode: "number" }),          // telegram ID of creator (null = public)
  name: varchar("name", { length: 100 }),                       // group display name (set by creator)
  inviteToken: varchar("invite_token", { length: 32 }).unique(), // unique token for invite link (?start=g_{token})
  status: groupStatusEnum("status").default("forming").notNull(),
  memberCount: integer("member_count").default(0).notNull(),
  maxMembers: integer("max_members").default(10).notNull(),
  joinCost: integer("join_cost").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
});

export const groupMembersTable = pgTable("group_members", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  isCreator: boolean("is_creator").default(false).notNull(),     // group owner
  isAdmin: boolean("is_admin").default(false).notNull(),         // promoted admin (up to 2 per group)
  isBanned: boolean("is_banned").default(false).notNull(),       // banned by creator (cannot rejoin this group)
  dismissed: boolean("dismissed").default(false).notNull(),       // user hid this group from their list
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  leftAt: timestamp("left_at"),
});

export const insertGroupChatSchema = createInsertSchema(groupChatsTable).omit({ id: true });
export type InsertGroupChat = z.infer<typeof insertGroupChatSchema>;
export type GroupChat = typeof groupChatsTable.$inferSelect;
export type GroupMember = typeof groupMembersTable.$inferSelect;
