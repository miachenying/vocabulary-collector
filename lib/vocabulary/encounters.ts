import type { Db } from "./database";

export type EncounterRow = {
  id: string;
  vocabulary_item_id: string;
  vocabulary_sense_id: string;
  lookup_event_id: string | null;
  encountered_form: string;
  context_sentence: string | null;
  source_title: string | null;
  source_url: string | null;
  encountered_at: string;
  created_at: string;
};

type CreateEncounterInput = {
  database: Db;
  vocabularyItemId: string;
  vocabularySenseId: string;
  lookupEventId?: string | null;
  encounteredForm: string;
  contextSentence?: string | null;
  sourceTitle?: string | null;
  sourceUrl?: string | null;
  encounteredAt: string;
};

export async function createEncounter(input: CreateEncounterInput) {
  const {
    database,
    vocabularyItemId,
    vocabularySenseId,
    lookupEventId = null,
    encounteredForm,
    contextSentence = null,
    sourceTitle = null,
    sourceUrl = null,
    encounteredAt,
  } = input;

  const ownedSense = await database.prepare(
    "SELECT id FROM vocabulary_senses WHERE id = ? AND vocabulary_item_id = ?",
  ).bind(vocabularySenseId, vocabularyItemId).first<{ id: string }>();
  if (!ownedSense) throw new Error("Vocabulary sense does not belong to vocabulary item.");

  const id = crypto.randomUUID();
  await database.prepare(`INSERT INTO encounters
    (id, vocabulary_item_id, vocabulary_sense_id, lookup_event_id, encountered_form,
     context_sentence, source_title, source_url, encountered_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, vocabularyItemId, vocabularySenseId, lookupEventId, encounteredForm,
      contextSentence, sourceTitle, sourceUrl, encounteredAt, encounteredAt).run();

  return database.prepare("SELECT * FROM encounters WHERE id = ?")
    .bind(id).first<EncounterRow>();
}

export async function listEncountersForSense(database: Db, vocabularySenseId: string) {
  return database.prepare("SELECT * FROM encounters WHERE vocabulary_sense_id = ? ORDER BY encountered_at DESC")
    .bind(vocabularySenseId).all<EncounterRow>();
}
