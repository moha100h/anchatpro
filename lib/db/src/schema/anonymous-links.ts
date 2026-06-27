import { pgTable, serial, bigint, text, timestamp, boolean, varchar, pgEnum, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const anonMsgStatusEnum = pgEnum("anon_msg_status", ["pending", "replied", "blocked"]);
export const proLinkTierEnum = pgEnum("pro_link_tier", ["permanent", "inapp"]);

export const anonymousMessagesTable = pgTable("anonymous_messages", {
  id: serial("id").primaryKey(),
  receiverId: bigint("receiver_id", { mode: "number" }).notNull(),
  senderId: bigint("sender_id", { mode: "number" }),
  content: text("content"),
  fileId: varchar("file_id", { length: 512 }),
  fileType: varchar("file_type", { length: 50 }),
  replyContent: text("reply_content"),
  status: anonMsgStatusEnum("status").default("pending").notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  linkType: varchar("link_type", { length: 20 }).default("standard").notNull(),
  proLinkId: integer("pro_link_id"),
  senderRevealedAt: timestamp("sender_revealed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  repliedAt: timestamp("replied_at"),
});

export const timedAnonLinksTable = pgTable("timed_anon_links", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  token: varchar("token", { length: 24 }).notNull().unique(),
  coinsCost: integer("coins_cost").default(0).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  notified: boolean("notified").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const proAnonLinksTable = pgTable("pro_anon_links", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  tier: proLinkTierEnum("tier").notNull(),
  token: varchar("token", { length: 32 }).notNull().unique(),
  alias: varchar("alias", { length: 32 }).unique(),
  displayName: varchar("display_name", { length: 100 }),
  welcomeMessage: text("welcome_message"),
  isEnabled: boolean("is_enabled").default(true).notNull(),
  linkChangesToday: integer("link_changes_today").default(0).notNull(),
  lastLinkChangeDate: varchar("last_link_change_date", { length: 10 }),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAnonMsgSchema = createInsertSchema(anonymousMessagesTable).omit({ id: true });
export type InsertAnonMsg = z.infer<typeof insertAnonMsgSchema>;
export type AnonMessage = typeof anonymousMessagesTable.$inferSelect;
export type TimedAnonLink = typeof timedAnonLinksTable.$inferSelect;
export type ProAnonLink = typeof proAnonLinksTable.$inferSelect;
