import { pgTable, serial, bigint, integer, text, timestamp, varchar, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const txTypeEnum = pgEnum("tx_type", [
  "referral_reward",
  "chat_cost",
  "group_cost",
  "admin_add",
  "admin_remove",
  "payment",
  "refund",
  "magic_spend",
  "unlock_restriction",
  "daily_spin",
]);

export const coinTransactionsTable = pgTable("coin_transactions", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  amount: integer("amount").notNull(),
  type: txTypeEnum("type").notNull(),
  description: text("description"),
  balanceBefore: integer("balance_before").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const referralsTable = pgTable("referrals", {
  id: serial("id").primaryKey(),
  referrerId: bigint("referrer_id", { mode: "number" }).notNull(),
  referredId: bigint("referred_id", { mode: "number" }).notNull().unique(),
  rewarded: integer("rewarded").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCoinTxSchema = createInsertSchema(coinTransactionsTable).omit({ id: true });
export type InsertCoinTx = z.infer<typeof insertCoinTxSchema>;
export type CoinTransaction = typeof coinTransactionsTable.$inferSelect;
export type Referral = typeof referralsTable.$inferSelect;
