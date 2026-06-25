import { pgTable, serial, bigint, integer, text, timestamp, boolean, varchar, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const reportStatusEnum = pgEnum("report_status", ["pending", "reviewed", "dismissed"]);

export const reportsTable = pgTable("reports", {
  id: serial("id").primaryKey(),
  reporterId: bigint("reporter_id", { mode: "number" }).notNull(),
  reportedId: bigint("reported_id", { mode: "number" }).notNull(),
  sessionId: integer("session_id"),
  groupId: integer("group_id"),
  reason: varchar("reason", { length: 255 }).notNull(),
  description: text("description"),
  status: reportStatusEnum("status").default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: bigint("reviewed_by", { mode: "number" }),
});

export const blocksTable = pgTable("blocks", {
  id: serial("id").primaryKey(),
  blockerId: bigint("blocker_id", { mode: "number" }).notNull(),
  blockedId: bigint("blocked_id", { mode: "number" }).notNull(),
  context: varchar("context", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const warningsTable = pgTable("warnings", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  issuedBy: bigint("issued_by", { mode: "number" }),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertReportSchema = createInsertSchema(reportsTable).omit({ id: true });
export type InsertReport = z.infer<typeof insertReportSchema>;
export type Report = typeof reportsTable.$inferSelect;
export type Block = typeof blocksTable.$inferSelect;
export type Warning = typeof warningsTable.$inferSelect;
