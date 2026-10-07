CREATE TABLE `monthly_budgets` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `year_month` text NOT NULL,
  `total_cents` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `monthly_budgets_year_month_unique` ON `monthly_budgets` (`year_month`);
--> statement-breakpoint
CREATE TABLE `overtime_entries` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `work_date` text NOT NULL,
  `minutes` integer NOT NULL,
  `hourly_rate_cents` integer NOT NULL,
  `multiplier_hundredths` integer NOT NULL,
  `pay_cents` integer NOT NULL,
  `note` text DEFAULT '' NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `overtime_entries_work_date_idx` ON `overtime_entries` (`work_date`);