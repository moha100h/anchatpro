import { pgTable, serial, bigint, text, timestamp, boolean, varchar, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const anonMsgStatusEnum = pgEnum("anon_msg_status", ["pending", "replied", "blocked"]);

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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  repliedAt: timestamp("replied_at"),
});

export const insertAnonMsgSchema = createInsertSchema(anonymousMessagesTable).omit({ id: true });
export type InsertAnonMsg = z.infer<typeof insertAnonMsgSchema>;
export type AnonMessage = typeof anonymousMessagesTable.$inferSelect;
