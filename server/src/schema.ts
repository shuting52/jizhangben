import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind", { enum: ["expense", "income"] }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    category: text("category").notNull(),
    note: text("note").notNull().default(""),
    spokenText: text("spoken_text"),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("transactions_occurred_at_idx").on(table.occurredAt)],
);

export const monthlyBudgets = sqliteTable(
  "monthly_budgets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    yearMonth: text("year_month").notNull(),
    totalCents: integer("total_cents").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex("monthly_budgets_year_month_unique").on(table.yearMonth)],
);

export const overtimeEntries = sqliteTable(
  "overtime_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workDate: text("work_date").notNull(),
    minutes: integer("minutes").notNull(),
    hourlyRateCents: integer("hourly_rate_cents").notNull(),
    multiplierHundredths: integer("multiplier_hundredths").notNull(),
    payCents: integer("pay_cents").notNull(),
    note: text("note").notNull().default(""),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("overtime_entries_work_date_idx").on(table.workDate)],
);
