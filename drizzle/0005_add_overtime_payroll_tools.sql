ALTER TABLE `overtime_entries` ADD `overtime_type` text NOT NULL DEFAULT 'workday';
--> statement-breakpoint
ALTER TABLE `overtime_entries` ADD `allowance_cents` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `overtime_entries` ADD `deduction_cents` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE `overtime_settings` (
  `id` integer PRIMARY KEY NOT NULL,
  `base_salary_cents` integer NOT NULL DEFAULT 0,
  `standard_days_hundredths` integer NOT NULL DEFAULT 2175,
  `standard_hours_hundredths` integer NOT NULL DEFAULT 800,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `active_overtime_shift` (
  `id` integer PRIMARY KEY NOT NULL,
  `work_date` text NOT NULL,
  `start_time` text NOT NULL,
  `started_at` integer NOT NULL,
  `note` text NOT NULL DEFAULT '',
  `overtime_type` text NOT NULL DEFAULT 'workday',
  `compensation_type` text NOT NULL DEFAULT 'pay'
);