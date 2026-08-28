import type { Db } from "./database";
import type { LookupInputType } from "./lookup-history";

export async function findCachedMeaning(database: Db, normalizedTerm: string, inputType: LookupInputType) {
  return database.prepare(`SELECT chinese_meaning, provider FROM meaning_cache
    WHERE normalized_term = ? AND input_type = ?`)
    .bind(normalizedTerm, inputType)
    .first<{ chinese_meaning: string; provider: string }>();
}

export async function storeCachedMeaning(
  database: Db,
  normalizedTerm: string,
  inputType: LookupInputType,
  chineseMeaning: string,
  provider: string,
) {
  await database.prepare(`INSERT INTO meaning_cache
    (normalized_term, input_type, chinese_meaning, provider, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(normalized_term) DO UPDATE SET input_type = excluded.input_type,
      chinese_meaning = excluded.chinese_meaning, provider = excluded.provider, updated_at = excluded.updated_at`)
    .bind(normalizedTerm, inputType, chineseMeaning, provider, new Date().toISOString()).run();
}
