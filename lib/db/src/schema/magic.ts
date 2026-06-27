import {
  pgTable, serial, bigint, integer, text,
  timestamp, varchar, boolean,
} from "drizzle-orm/pg-core";

// ─── پیام در بطری ─────────────────────────────────────────────────────────────
export const bottleMessagesTable = pgTable("bottle_messages", {
  id:          serial("id").primaryKey(),
  senderId:    bigint("sender_id", { mode: "number" }).notNull(),
  recipientId: bigint("recipient_id", { mode: "number" }),
  message:     text("message").notNull(),
  // floating | delivered | replied | expired | ignored
  status:      varchar("status", { length: 20 }).default("floating").notNull(),
  deliveredAt: timestamp("delivered_at"),
  expiresAt:   timestamp("expires_at"),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
});

// ─── زنجیر احساس ─────────────────────────────────────────────────────────────
export const chainsTable = pgTable("chains", {
  id:              serial("id").primaryKey(),
  // active | completed | expired
  status:          varchar("status", { length: 20 }).default("active").notNull(),
  maxSteps:        integer("max_steps").default(10).notNull(),
  currentStep:     integer("current_step").default(1).notNull(),
  currentHolder:   bigint("current_holder", { mode: "number" }),
  createdAt:       timestamp("created_at").defaultNow().notNull(),
  completedAt:     timestamp("completed_at"),
});

export const chainLinksTable = pgTable("chain_links", {
  id:        serial("id").primaryKey(),
  chainId:   integer("chain_id").notNull(),
  userId:    bigint("user_id", { mode: "number" }).notNull(),
  step:      integer("step").notNull(),
  message:   text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── نامه به آینده ────────────────────────────────────────────────────────────
export const futureLettersTable = pgTable("future_letters", {
  id:        serial("id").primaryKey(),
  userId:    bigint("user_id", { mode: "number" }).notNull(),
  message:   text("message").notNull(),
  deliverAt: timestamp("deliver_at").notNull(),
  delivered: boolean("delivered").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── فرکانس ناشناس ────────────────────────────────────────────────────────────
// Mood-based matching queue
export const frequencyQueueTable = pgTable("frequency_queue", {
  id:       serial("id").primaryKey(),
  userId:   bigint("user_id", { mode: "number" }).notNull().unique(),
  mood:     varchar("mood", { length: 30 }).notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
});

// ─── ردیابی استفاده روزانه ────────────────────────────────────────────────────
export const magicUsageTable = pgTable("magic_usage", {
  id:      serial("id").primaryKey(),
  userId:  bigint("user_id", { mode: "number" }).notNull(),
  // bottle | chain | letter | frequency
  feature: varchar("feature", { length: 30 }).notNull(),
  usedAt:  timestamp("used_at").defaultNow().notNull(),
});

export type BottleMessage  = typeof bottleMessagesTable.$inferSelect;
export type Chain          = typeof chainsTable.$inferSelect;
export type ChainLink      = typeof chainLinksTable.$inferSelect;
export type FutureLetter   = typeof futureLettersTable.$inferSelect;
export type FrequencyEntry = typeof frequencyQueueTable.$inferSelect;
