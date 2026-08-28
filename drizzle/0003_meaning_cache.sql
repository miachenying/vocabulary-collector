CREATE TABLE `meaning_cache` (
	`normalized_term` text PRIMARY KEY NOT NULL,
	`input_type` text NOT NULL,
	`chinese_meaning` text NOT NULL,
	`provider` text NOT NULL,
	`updated_at` text NOT NULL
);
