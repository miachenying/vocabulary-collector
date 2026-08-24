CREATE TABLE `lookup_events` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`user_id` text NOT NULL,
	`looked_up_at` text NOT NULL,
	`context_sentence` text,
	`source_title` text,
	`source_url` text
);
--> statement-breakpoint
CREATE INDEX `event_user_time_idx` ON `lookup_events` (`user_id`,`looked_up_at`);--> statement-breakpoint
CREATE INDEX `event_entry_time_idx` ON `lookup_events` (`entry_id`,`looked_up_at`);--> statement-breakpoint
CREATE TABLE `vocabulary_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`normalized_term` text NOT NULL,
	`display_term` text NOT NULL,
	`language` text DEFAULT 'English' NOT NULL,
	`chinese_definition` text,
	`part_of_speech` text,
	`context_sentence` text,
	`source_title` text,
	`source_url` text,
	`note` text,
	`lookup_count` integer DEFAULT 1 NOT NULL,
	`first_looked_up_at` text NOT NULL,
	`last_looked_up_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entry_user_term_unique` ON `vocabulary_entries` (`user_id`,`normalized_term`);--> statement-breakpoint
CREATE INDEX `entry_user_last_lookup_idx` ON `vocabulary_entries` (`user_id`,`last_looked_up_at`);
