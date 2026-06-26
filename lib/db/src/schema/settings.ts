import { pgTable, serial, text, varchar, boolean, timestamp, bigint, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const broadcastStatusEnum = pgEnum("broadcast_status", ["pending", "running", "completed", "failed"]);
export const broadcastTargetEnum = pgEnum("broadcast_target", ["all", "active", "selected"]);

export const adminSettingsTable = pgTable("admin_settings", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/** Sub-admin permissions (super admins come from ADMIN_IDS env) */
export const adminPermissionsTable = pgTable("admin_permissions", {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull().unique(),
  username: varchar("username", { length: 255 }),
  level: varchar("level", { length: 20 }).default("moderator").notNull(), // "admin" | "moderator"
  addedBy: bigint("added_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const backupConfigTable = pgTable("backup_config", {
  id: serial("id").primaryKey(),
  chatId: bigint("chat_id", { mode: "number" }),
  verificationCode: varchar("verification_code", { length: 32 }),
  isVerified: boolean("is_verified").default(false).notNull(),
  scheduleHours: integer("schedule_hours").default(24).notNull(),
  lastBackupAt: timestamp("last_backup_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const broadcastJobsTable = pgTable("broadcast_jobs", {
  id: serial("id").primaryKey(),
  message: text("message").notNull(),
  mediaFileId: varchar("media_file_id", { length: 512 }),
  mediaType: varchar("media_type", { length: 50 }),
  target: broadcastTargetEnum("target").default("all").notNull(),
  status: broadcastStatusEnum("status").default("pending").notNull(),
  totalCount: integer("total_count").default(0).notNull(),
  sentCount: integer("sent_count").default(0).notNull(),
  failedCount: integer("failed_count").default(0).notNull(),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const badWordsTable = pgTable("bad_words", {
  id: serial("id").primaryKey(),
  word: varchar("word", { length: 255 }).notNull(),
  language: varchar("language", { length: 10 }).default("all").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const rateLimitsTable = pgTable("rate_limits", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  action: varchar("action", { length: 100 }).notNull(),
  count: integer("count").default(1).notNull(),
  windowStart: timestamp("window_start").defaultNow().notNull(),
});

export const insertAdminSettingSchema = createInsertSchema(adminSettingsTable).omit({ id: true });
export type InsertAdminSetting = z.infer<typeof insertAdminSettingSchema>;
export type AdminSetting = typeof adminSettingsTable.$inferSelect;
export type AdminPermission = typeof adminPermissionsTable.$inferSelect;
export type BackupConfig = typeof backupConfigTable.$inferSelect;
export type BroadcastJob = typeof broadcastJobsTable.$inferSelect;
