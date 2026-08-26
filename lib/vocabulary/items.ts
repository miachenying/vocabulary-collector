import type { Db } from "./database";

export type VocabularyItemRow = {
  id: string;
  user_id: string;
  canonical_form: string;
  item_type: "word" | "phrase";
  created_at: string;
  updated_at: string;
};

type FindOrCreateVocabularyItemInput = {
  database: Db;
  userId: string;
  canonicalForm: string;
  itemType: "word" | "phrase";
  now: string;
};

export async function findVocabularyItem(database: Db, userId: string, canonicalForm: string) {
  return database
    .prepare("SELECT * FROM vocabulary_items WHERE user_id = ? AND canonical_form = ?")
    .bind(userId, canonicalForm)
    .first<VocabularyItemRow>();
}

export async function findVocabularyItemById(database: Db, userId: string, itemId: string) {
  return database
    .prepare("SELECT * FROM vocabulary_items WHERE id = ? AND user_id = ?")
    .bind(itemId, userId)
    .first<VocabularyItemRow>();
}

export async function findOrCreateVocabularyItem(input: FindOrCreateVocabularyItemInput) {
  const { database, userId, canonicalForm, itemType, now } = input;
  const existing = await findVocabularyItem(database, userId, canonicalForm);
  if (existing) return existing;

  const id = crypto.randomUUID();
  await database.prepare(`INSERT OR IGNORE INTO vocabulary_items
    (id, user_id, canonical_form, item_type, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(id, userId, canonicalForm, itemType, now, now).run();

  // Re-read by the unique business key instead of the generated id. If two
  // concurrent requests raced, one insert may be ignored and both callers
  // should converge on the same stored item.
  return findVocabularyItem(database, userId, canonicalForm);
}
