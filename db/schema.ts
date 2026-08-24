import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
