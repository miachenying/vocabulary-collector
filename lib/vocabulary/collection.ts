import type { Db } from "./database";

export type CollectionRow = {
  item_id: string;
  canonical_form: string;
  item_type: "word" | "phrase";
  item_created_at: string;
  sense_id: string;
  chinese_meaning: string;
  encountered_form: string;
  context_sentence: string | null;
  source_title: string | null;
  source_url: string | null;
  encountered_at: string;
  saved_at: string;
};

export async function listCollection(database: Db, userId: string) {
  return database.prepare(`SELECT
      vi.id AS item_id, vi.canonical_form, vi.item_type, vi.created_at AS item_created_at,
      vs.id AS sense_id, vs.chinese_meaning,
      e.encountered_form, e.context_sentence, e.source_title, e.source_url,
      e.encountered_at, e.created_at AS saved_at
    FROM vocabulary_items vi
    JOIN vocabulary_senses vs ON vs.vocabulary_item_id = vi.id
    JOIN encounters e ON e.vocabulary_item_id = vi.id AND e.vocabulary_sense_id = vs.id
    WHERE vi.user_id = ?
    ORDER BY e.created_at DESC, vi.canonical_form ASC`)
    .bind(userId).all<CollectionRow>();
}

export function groupCollectionRows(rows: CollectionRow[]) {
  const items = new Map<string, {
    id: string; canonicalForm: string; itemType: "word" | "phrase"; createdAt: string;
    chineseMeaning: string; encounteredForm: string; contextSentence: string | null;
    sourceTitle: string | null; sourceUrl: string | null; encounteredAt: string; encounterCount: number;
  }>();
  for (const row of rows) {
    const key = `${row.item_id}:${row.sense_id}`;
    const existing = items.get(key);
    if (existing) {
      existing.encounterCount += 1;
      continue;
    }
    items.set(key, {
      id: key, canonicalForm: row.canonical_form, itemType: row.item_type, createdAt: row.item_created_at,
      chineseMeaning: row.chinese_meaning, encounteredForm: row.encountered_form,
      contextSentence: row.context_sentence, sourceTitle: row.source_title, sourceUrl: row.source_url,
      encounteredAt: row.encountered_at, encounterCount: 1,
    });
  }
  return [...items.values()];
}
