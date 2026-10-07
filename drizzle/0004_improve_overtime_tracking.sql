ALTER TABLE `overtime_entries` ADD `start_time` text;
--> statement-breakpoint
ALTER TABLE `overtime_entries` ADD `end_time` text;
--> statement-breakpoint
ALTER TABLE `overtime_entries` ADD `break_minutes` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `overtime_entries` ADD `compensation_type` text DEFAULT 'pay' NOT NULL;
--> statement-breakpoint
ALTER TABLE `overtime_entries` ADD `status` text DEFAULT 'pending' NOT NULL;
