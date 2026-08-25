CREATE TABLE `lookup_events_v2` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `raw_input` text NOT NULL,
  `input_type` text NOT NULL,
  `status` text NOT NULL,
  `context_sentence` text,
  `source_title` text,
  `source_url` text,
  `looked_up_at` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lookup_v2_user_time_idx` ON `lookup_events_v2` (`user_id`,`looked_up_at`);
--> statement-breakpoint
CREATE INDEX `lookup_v2_user_type_time_idx` ON `lookup_events_v2` (`user_id`,`input_type`,`looked_up_at`);
--> statement-breakpoint
CREATE TABLE `vocabulary_items` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `canonical_form` text NOT NULL,
  `item_type` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vocabulary_item_user_canonical_unique` ON `vocabulary_items` (`user_id`,`canonical_form`);
--> statement-breakpoint
CREATE INDEX `vocabulary_item_user_updated_idx` ON `vocabulary_items` (`user_id`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `vocabulary_senses` (
  `id` text PRIMARY KEY NOT NULL,
  `vocabulary_item_id` text NOT NULL,
  `chinese_meaning` text NOT NULL,
  `part_of_speech` text,
  `usage_note` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sense_item_idx` ON `vocabulary_senses` (`vocabulary_item_id`);
--> statement-breakpoint
CREATE TABLE `encounters` (
  `id` text PRIMARY KEY NOT NULL,
  `vocabulary_item_id` text NOT NULL,
  `vocabulary_sense_id` text NOT NULL,
  `lookup_event_id` text,
  `encountered_form` text NOT NULL,
  `context_sentence` text,
  `source_title` text,
  `source_url` text,
  `encountered_at` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `encounter_item_time_idx` ON `encounters` (`vocabulary_item_id`,`encountered_at`);
--> statement-breakpoint
CREATE INDEX `encounter_sense_time_idx` ON `encounters` (`vocabulary_sense_id`,`encountered_at`);
--> statement-breakpoint
CREATE INDEX `encounter_lookup_idx` ON `encounters` (`lookup_event_id`);
--> statement-breakpoint

-- Backfill Lookup History from Version 6 without mutating the legacy tables.
INSERT OR IGNORE INTO `lookup_events_v2` (
  `id`, `user_id`, `raw_input`, `input_type`, `status`, `context_sentence`,
  `source_title`, `source_url`, `looked_up_at`, `created_at`
)
SELECT
  le.`id`,
  le.`user_id`,
  ve.`display_term`,
  CASE
    WHEN substr(trim(ve.`display_term`), -1, 1) IN ('.', '!', '?', ';')
      OR (length(trim(ve.`normalized_term`)) - length(replace(trim(ve.`normalized_term`), ' ', '')) + 1) >= 6
      THEN 'sentence'
    WHEN instr(trim(ve.`normalized_term`), ' ') > 0 THEN 'phrase'
    ELSE 'word'
  END,
  CASE
    WHEN ve.`chinese_definition` IS NOT NULL AND trim(ve.`chinese_definition`) <> '' THEN 'success'
    ELSE 'failed'
  END,
  le.`context_sentence`, le.`source_title`, le.`source_url`, le.`looked_up_at`, le.`looked_up_at`
FROM `lookup_events` le
JOIN `vocabulary_entries` ve ON ve.`id` = le.`entry_id`;
--> statement-breakpoint

-- Version 6 did not store canonical forms separately. Preserve its normalized
-- term as the initial canonical form; future lookups can improve canonicalization.
INSERT OR IGNORE INTO `vocabulary_items` (
  `id`, `user_id`, `canonical_form`, `item_type`, `created_at`, `updated_at`
)
SELECT
  'item_' || ve.`id`,
  ve.`user_id`,
  ve.`normalized_term`,
  CASE WHEN instr(trim(ve.`normalized_term`), ' ') > 0 THEN 'phrase' ELSE 'word' END,
  ve.`created_at`,
  ve.`updated_at`
FROM `vocabulary_entries` ve
WHERE ve.`chinese_definition` IS NOT NULL
  AND trim(ve.`chinese_definition`) <> ''
  AND NOT (
    substr(trim(ve.`display_term`), -1, 1) IN ('.', '!', '?', ';')
    OR (length(trim(ve.`normalized_term`)) - length(replace(trim(ve.`normalized_term`), ' ', '')) + 1) >= 6
  );
--> statement-breakpoint

INSERT OR IGNORE INTO `vocabulary_senses` (
  `id`, `vocabulary_item_id`, `chinese_meaning`, `part_of_speech`, `usage_note`, `created_at`, `updated_at`
)
SELECT
  'sense_' || ve.`id`,
  'item_' || ve.`id`,
  ve.`chinese_definition`,
  ve.`part_of_speech`,
  ve.`note`,
  ve.`created_at`,
  ve.`updated_at`
FROM `vocabulary_entries` ve
WHERE ve.`chinese_definition` IS NOT NULL
  AND trim(ve.`chinese_definition`) <> ''
  AND NOT (
    substr(trim(ve.`display_term`), -1, 1) IN ('.', '!', '?', ';')
    OR (length(trim(ve.`normalized_term`)) - length(replace(trim(ve.`normalized_term`), ' ', '')) + 1) >= 6
  );
--> statement-breakpoint

INSERT OR IGNORE INTO `encounters` (
  `id`, `vocabulary_item_id`, `vocabulary_sense_id`, `lookup_event_id`, `encountered_form`,
  `context_sentence`, `source_title`, `source_url`, `encountered_at`, `created_at`
)
SELECT
  'enc_' || le.`id`,
  'item_' || ve.`id`,
  'sense_' || ve.`id`,
  le.`id`,
  ve.`display_term`,
  le.`context_sentence`, le.`source_title`, le.`source_url`, le.`looked_up_at`, le.`looked_up_at`
FROM `lookup_events` le
JOIN `vocabulary_entries` ve ON ve.`id` = le.`entry_id`
WHERE ve.`chinese_definition` IS NOT NULL
  AND trim(ve.`chinese_definition`) <> ''
  AND NOT (
    substr(trim(ve.`display_term`), -1, 1) IN ('.', '!', '?', ';')
    OR (length(trim(ve.`normalized_term`)) - length(replace(trim(ve.`normalized_term`), ' ', '')) + 1) >= 6
  );
