import type { Db } from "./database";

export type VocabularySenseRow = {
  id: string;
  vocabulary_item_id: string;
  chinese_meaning: string;
  part_of_speech: string | null;
  usage_note: string | null;
  created_at: string;
  updated_at: string;
};

export async function listVocabularySenses(database: Db, vocabularyItemId: string) {
  return database
    .prepare("SELECT * FROM vocabulary_senses WHERE vocabulary_item_id = ? ORDER BY created_at ASC")
    .bind(vocabularyItemId)
    .all<VocabularySenseRow>();
}

export async function findVocabularySense(database: Db, vocabularyItemId: string, senseId: string) {
  return database
    .prepare("SELECT * FROM vocabulary_senses WHERE id = ? AND vocabulary_item_id = ?")
    .bind(senseId, vocabularyItemId)
    .first<VocabularySenseRow>();
}

type CreateVocabularySenseInput = {
  database: Db;
  vocabularyItemId: string;
  chineseMeaning: string;
  partOfSpeech?: string | null;
  usageNote?: string | null;
  now: string;
};

// Semantic equivalence is intentionally decided outside the repository layer.
// Call this only after the application/LLM has decided the meaning is a new sense.
export async function createVocabularySense(input: CreateVocabularySenseInput) {
  const { database, vocabularyItemId, chineseMeaning, partOfSpeech = null, usageNote = null, now } = input;
  const id = crypto.randomUUID();

  await database.prepare(`INSERT INTO vocabulary_senses
    (id, vocabulary_item_id, chinese_meaning, part_of_speech, usage_note, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, vocabularyItemId, chineseMeaning, partOfSpeech, usageNote, now, now).run();

  return findVocabularySense(database, vocabularyItemId, id);
}
