import { pgTable, bigint, text, integer, boolean, timestamp, varchar, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const genderEnum = pgEnum("gender", ["male", "female", "other"]);
export const languageEnum = pgEnum("language", ["fa", "en"]);
export const userStatusEnum = pgEnum("user_status", ["active", "banned", "restricted"]);

export const usersTable = pgTable("users", {
  telegramId: bigint("telegram_id", { mode: "number" }).primaryKey(),
  username: varchar("username", { length: 255 }),
  firstName: varchar("first_name", { length: 255 }),
  lastName: varchar("last_name", { length: 255 }),
  gender: genderEnum("gender"),
  age: integer("age"),
  language: languageEnum("language").default("fa").notNull(),
  coins: integer("coins").default(0).notNull(),
  referralCode: varchar("referral_code", { length: 32 }).unique().notNull(),
  referredBy: bigint("referred_by", { mode: "number" }),
  status: userStatusEnum("status").default("active").notNull(),
  warningCount: integer("warning_count").default(0).notNull(),
  isInQueue: boolean("is_in_queue").default(false).notNull(),
  isInChat: boolean("is_in_chat").default(false).notNull(),
  isInGroup: boolean("is_in_group").default(false).notNull(),
  setupStep: varchar("setup_step", { length: 50 }),
  anonymousToken: varchar("anonymous_token", { length: 64 }).unique(),
  restrictedUntil: timestamp("restricted_until"),
  lastSeen: timestamp("last_seen").defaultNow(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable);
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
