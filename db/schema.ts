import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Version 6 legacy storage. Milestone 2 keeps these tables intact so the
// existing lookup/history UI continues to work while v2 data is backfilled.
export const vocabularyEntries = sqliteTable("vocabulary_entries", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  normalizedTerm: text("normalized_term").notNull(),
  displayTerm: text("display_term").notNull(),
  language: text("language").notNull().default("English"),
  chineseDefinition: text("chinese_definition"),
  partOfSpeech: text("part_of_speech"),
  contextSentence: text("context_sentence"),
  sourceTitle: text("source_title"),
  sourceUrl: text("source_url"),
  note: text("note"),
  lookupCount: integer("lookup_count").notNull().default(1),
  firstLookedUpAt: text("first_looked_up_at").notNull(),
  lastLookedUpAt: text("last_looked_up_at").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("entry_user_term_unique").on(table.userId, table.normalizedTerm),
  index("entry_user_last_lookup_idx").on(table.userId, table.lastLookedUpAt),
]);

export const lookupEvents = sqliteTable("lookup_events", {
  id: text("id").primaryKey(),
  entryId: text("entry_id").notNull(),
  userId: text("user_id").notNull(),
  lookedUpAt: text("looked_up_at").notNull(),
  contextSentence: text("context_sentence"),
  sourceTitle: text("source_title"),
  sourceUrl: text("source_url"),
}, (table) => [
  index("event_user_time_idx").on(table.userId, table.lookedUpAt),
  index("event_entry_time_idx").on(table.entryId, table.lookedUpAt),
]);

// Transitional physical name: lookup_events_v2 avoids breaking Version 6
// readers during Milestone 2. The logical v2 entity is Lookup History; the
// final cutover can rename it after all readers use the new data-access layer.
export const lookupEventsV2 = sqliteTable("lookup_events_v2", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  rawInput: text("raw_input").notNull(),
  inputType: text("input_type").notNull(),
  status: text("status").notNull(),
  contextSentence: text("context_sentence"),
  sourceTitle: text("source_title"),
  sourceUrl: text("source_url"),
  note: text("note"),
  lookedUpAt: text("looked_up_at").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("lookup_v2_user_time_idx").on(table.userId, table.lookedUpAt),
  index("lookup_v2_user_type_time_idx").on(table.userId, table.inputType, table.lookedUpAt),
]);

export const vocabularyItems = sqliteTable("vocabulary_items", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  canonicalForm: text("canonical_form").notNull(),
  itemType: text("item_type").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("vocabulary_item_user_canonical_unique").on(table.userId, table.canonicalForm),
  index("vocabulary_item_user_updated_idx").on(table.userId, table.updatedAt),
]);

export const vocabularySenses = sqliteTable("vocabulary_senses", {
  id: text("id").primaryKey(),
  vocabularyItemId: text("vocabulary_item_id").notNull(),
  chineseMeaning: text("chinese_meaning").notNull(),
  partOfSpeech: text("part_of_speech"),
  usageNote: text("usage_note"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("sense_item_idx").on(table.vocabularyItemId),
]);

export const encounters = sqliteTable("encounters", {
  id: text("id").primaryKey(),
  vocabularyItemId: text("vocabulary_item_id").notNull(),
  vocabularySenseId: text("vocabulary_sense_id").notNull(),
  lookupEventId: text("lookup_event_id"),
  encounteredForm: text("encountered_form").notNull(),
  contextSentence: text("context_sentence"),
  sourceTitle: text("source_title"),
  sourceUrl: text("source_url"),
  note: text("note"),
  encounteredAt: text("encountered_at").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("encounter_item_time_idx").on(table.vocabularyItemId, table.encounteredAt),
  index("encounter_sense_time_idx").on(table.vocabularySenseId, table.encounteredAt),
  index("encounter_lookup_idx").on(table.lookupEventId),
]);

export const meaningCache = sqliteTable("meaning_cache", {
  normalizedTerm: text("normalized_term").primaryKey(),
  inputType: text("input_type").notNull(),
  chineseMeaning: text("chinese_meaning").notNull(),
  provider: text("provider").notNull(),
  updatedAt: text("updated_at").notNull(),
});
