ALTER TABLE `traces` ADD `spans` text;--> statement-breakpoint
ALTER TABLE `traces` ADD `total_tokens` integer;--> statement-breakpoint
ALTER TABLE `traces` ADD `total_duration_ms` integer;--> statement-breakpoint
ALTER TABLE `traces` ADD `span_count` integer;