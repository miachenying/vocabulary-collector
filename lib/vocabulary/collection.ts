import type { Db } from "./database";

export type CollectionRow = {
  item_id: string;
  canonical_form: string;
  item_type: "word" | "phrase";
  item_created_at: string;
  sense_id: string;
  chinese_meaning: string;
  encounter_id: string;
  encountered_form: string;
  context_sentence: string | null;
  source_title: string | null;
  source_url: string | null;
  note: string | null;
  encountered_at: string;
  saved_at: string;
};

export type CollectionEncounter = {
  id: string;
  encounteredForm: string;
  contextSentence: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
  note: string | null;
  encounteredAt: string;
};

export async function listCollection(database: Db, userId: string) {
  return database.prepare(`SELECT
      vi.id AS item_id, vi.canonical_form, vi.item_type, vi.created_at AS item_created_at,
      vs.id AS sense_id, vs.chinese_meaning,
      e.id AS encounter_id, e.encountered_form, e.context_sentence, e.source_title, e.source_url, e.note,
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
    sourceTitle: string | null; sourceUrl: string | null; note: string | null;
    encounteredAt: string; encounterCount: number; encounters: CollectionEncounter[];
  }>();
  for (const row of rows) {
    const key = `${row.item_id}:${row.sense_id}`;
    const encounter = {
      id: row.encounter_id, encounteredForm: row.encountered_form,
      contextSentence: row.context_sentence, sourceTitle: row.source_title,
      sourceUrl: row.source_url, note: row.note, encounteredAt: row.encountered_at,
    };
    const existing = items.get(key);
    if (existing) {
      existing.encounters.push(encounter);
      existing.encounterCount = existing.encounters.length;
      continue;
    }
    items.set(key, {
      id: key, canonicalForm: row.canonical_form, itemType: row.item_type, createdAt: row.item_created_at,
      chineseMeaning: row.chinese_meaning, encounteredForm: row.encountered_form,
      contextSentence: row.context_sentence, sourceTitle: row.source_title, sourceUrl: row.source_url,
      note: row.note, encounteredAt: row.encountered_at, encounterCount: 1, encounters: [encounter],
    });
  }
  return [...items.values()];
}

export async function deleteCollectionEncounter(database: Db, userId: string, encounterId: string) {
  const owned = await database.prepare(`SELECT e.id, e.vocabulary_item_id, e.vocabulary_sense_id
    FROM encounters e JOIN vocabulary_items vi ON vi.id = e.vocabulary_item_id
    WHERE e.id = ? AND vi.user_id = ?`)
    .bind(encounterId, userId)
    .first<{ id: string; vocabulary_item_id: string; vocabulary_sense_id: string }>();
  if (!owned) return false;

  await database.prepare("DELETE FROM encounters WHERE id = ?").bind(encounterId).run();
  const senseEncounters = await database.prepare("SELECT COUNT(*) AS count FROM encounters WHERE vocabulary_sense_id = ?")
    .bind(owned.vocabulary_sense_id).first<{ count: number }>();
  if (Number(senseEncounters?.count || 0) === 0) {
    await database.prepare("DELETE FROM vocabulary_senses WHERE id = ? AND vocabulary_item_id = ?")
      .bind(owned.vocabulary_sense_id, owned.vocabulary_item_id).run();
  }
  const itemEncounters = await database.prepare("SELECT COUNT(*) AS count FROM encounters WHERE vocabulary_item_id = ?")
    .bind(owned.vocabulary_item_id).first<{ count: number }>();
  if (Number(itemEncounters?.count || 0) === 0) {
    await database.prepare("DELETE FROM vocabulary_items WHERE id = ? AND user_id = ?")
      .bind(owned.vocabulary_item_id, userId).run();
  }
  return true;
}
