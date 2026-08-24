import type { Db } from "./database";
import { classifyInput } from "./input";

export type EntryRow = Record<string, unknown>;

export function mapEntry(row: EntryRow) {
  return {
    id: row.id,
    displayTerm: row.display_term,
    chineseDefinition: row.chinese_definition,
    contextSentence: row.context_sentence,
    sourceTitle: row.source_title,
    sourceUrl: row.source_url,
    note: row.note,
    lookupCount: row.lookup_count,
    firstLookedUpAt: row.first_looked_up_at,
    lastLookedUpAt: row.last_looked_up_at,
    periodLookupCount: row.period_lookup_count ?? row.lookup_count,
    periodFirstLookup: row.period_first_lookup ?? row.first_looked_up_at,
    periodLastLookup: row.period_last_lookup ?? row.last_looked_up_at,
    lastEventId: row.last_event_id ?? null,
    inputType: classifyInput(String(row.display_term || "")),
  };
}

export async function findEntry(database: Db, userId: string, normalizedTerm: string) {
  return database
    .prepare("SELECT * FROM vocabulary_entries WHERE user_id = ? AND normalized_term = ?")
    .bind(userId, normalizedTerm)
    .first<EntryRow>();
}

export async function findEntryById(database: Db, entryId: string) {
  return database
    .prepare("SELECT * FROM vocabulary_entries WHERE id = ?")
    .bind(entryId)
    .first<EntryRow>();
}

type UpsertLookupInput = {
  database: Db;
  existing: EntryRow | null;
  entryId: string;
  userId: string;
  normalizedTerm: string;
  displayTerm: string;
  context: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
  note: string | null;
  now: string;
};

export async function upsertLookupEntry(input: UpsertLookupInput) {
  const { database, existing, entryId, userId, normalizedTerm, displayTerm, context, sourceTitle, sourceUrl, note, now } = input;

  if (existing) {
    await database.prepare(`UPDATE vocabulary_entries SET display_term = ?, context_sentence = COALESCE(?, context_sentence),
      source_title = COALESCE(?, source_title), source_url = COALESCE(?, source_url), note = COALESCE(?, note),
      lookup_count = lookup_count + 1, last_looked_up_at = ?, updated_at = ? WHERE id = ?`)
      .bind(displayTerm, context, sourceTitle, sourceUrl, note, now, now, entryId).run();
    return;
  }

  await database.prepare(`INSERT INTO vocabulary_entries
    (id, user_id, normalized_term, display_term, context_sentence, source_title, source_url, note, lookup_count, first_looked_up_at, last_looked_up_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`)
    .bind(entryId, userId, normalizedTerm, displayTerm, context, sourceTitle, sourceUrl, note, now, now, now, now).run();
}

export async function updateChineseDefinition(database: Db, entryId: string, definition: string) {
  await database.prepare("UPDATE vocabulary_entries SET chinese_definition = ?, updated_at = ? WHERE id = ?")
    .bind(definition, new Date().toISOString(), entryId).run();
}
