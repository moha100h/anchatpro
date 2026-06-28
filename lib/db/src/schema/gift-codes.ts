import { pgTable, serial, bigint, integer, boolean, varchar, timestamp } from "drizzle-orm/pg-core";

export const giftCodesTable = pgTable("gift_codes", {
  id:         serial("id").primaryKey(),
  code:       varchar("code", { length: 20 }).notNull().unique(),
  coins:      integer("coins").notNull(),
  maxUsage:   integer("max_usage").notNull(),
  usedCount:  integer("used_count").default(0).notNull(),
  isActive:   boolean("is_active").default(true).notNull(),
  createdBy:  bigint("created_by", { mode: "number" }).notNull(),
  createdAt:  timestamp("created_at").defaultNow().notNull(),
});

export const giftCodeRedemptionsTable = pgTable("gift_code_redemptions", {
  id:          serial("id").primaryKey(),
  codeId:      integer("code_id").notNull(),
  userId:      bigint("user_id", { mode: "number" }).notNull(),
  redeemedAt:  timestamp("redeemed_at").defaultNow().notNull(),
});

export type GiftCode = typeof giftCodesTable.$inferSelect;
export type GiftCodeRedemption = typeof giftCodeRedemptionsTable.$inferSelect;
