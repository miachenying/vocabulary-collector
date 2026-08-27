export type Db = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      run(): Promise<unknown>;
      first<T>(): Promise<T | null>;
      all<T>(): Promise<{ results: T[] }>;
    };
    run(): Promise<unknown>;
  };
  batch(statements: unknown[]): Promise<unknown>;
};

export function getVocabularyDb() {
  const binding = (globalThis as typeof globalThis & { __VOCAB_DB?: Db }).__VOCAB_DB;
  if (!binding) throw new Error("Vocabulary database binding is unavailable.");
  return binding;
}

export async function migrateLegacyEmailUserId(database: Db, email: string | null, stableUserId: string) {
  if (!email || email === stableUserId) return;
  await database.batch([
    database.prepare("UPDATE vocabulary_entries SET user_id = ? WHERE user_id = ?").bind(stableUserId, email),
    database.prepare("UPDATE lookup_events SET user_id = ? WHERE user_id = ?").bind(stableUserId, email),
    database.prepare("UPDATE lookup_events_v2 SET user_id = ? WHERE user_id = ?").bind(stableUserId, email),
    database.prepare("UPDATE vocabulary_items SET user_id = ? WHERE user_id = ?").bind(stableUserId, email),
  ]);
}

// Version 6 historically initialized its schema at runtime. During Milestone 2
// we keep the legacy tables intact and add the v2 model alongside them. This
// makes the migration additive and keeps the current UI/data-access layer usable.
const createEntries = `CREATE TABLE IF NOT EXISTS vocabulary_entries (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, normalized_term TEXT NOT NULL, display_term TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'English', chinese_definition TEXT, part_of_speech TEXT,
  context_sentence TEXT, source_title TEXT, source_url TEXT, note TEXT, lookup_count INTEGER NOT NULL DEFAULT 1,
  first_looked_up_at TEXT NOT NULL, last_looked_up_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(user_id, normalized_term)
)`;

const createEvents = `CREATE TABLE IF NOT EXISTS lookup_events (
  id TEXT PRIMARY KEY, entry_id TEXT NOT NULL, user_id TEXT NOT NULL, looked_up_at TEXT NOT NULL,
  context_sentence TEXT, source_title TEXT, source_url TEXT
)`;

const createLookupEventsV2 = `CREATE TABLE IF NOT EXISTS lookup_events_v2 (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, raw_input TEXT NOT NULL, input_type TEXT NOT NULL,
  status TEXT NOT NULL, context_sentence TEXT, source_title TEXT, source_url TEXT, note TEXT,
  looked_up_at TEXT NOT NULL, created_at TEXT NOT NULL
)`;

const createVocabularyItems = `CREATE TABLE IF NOT EXISTS vocabulary_items (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, canonical_form TEXT NOT NULL, item_type TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(user_id, canonical_form)
)`;

const createVocabularySenses = `CREATE TABLE IF NOT EXISTS vocabulary_senses (
  id TEXT PRIMARY KEY, vocabulary_item_id TEXT NOT NULL, chinese_meaning TEXT NOT NULL,
  part_of_speech TEXT, usage_note TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
)`;

const createEncounters = `CREATE TABLE IF NOT EXISTS encounters (
  id TEXT PRIMARY KEY, vocabulary_item_id TEXT NOT NULL, vocabulary_sense_id TEXT NOT NULL,
  lookup_event_id TEXT, encountered_form TEXT NOT NULL, context_sentence TEXT, source_title TEXT,
  source_url TEXT, note TEXT, encountered_at TEXT NOT NULL, created_at TEXT NOT NULL
)`;

const backfillLookupEventsV2 = `INSERT OR IGNORE INTO lookup_events_v2 (
  id, user_id, raw_input, input_type, status, context_sentence, source_title, source_url, note, looked_up_at, created_at
)
SELECT le.id, le.user_id, ve.display_term,
  CASE
    WHEN substr(trim(ve.display_term), -1, 1) IN ('.', '!', '?', ';')
      OR (length(trim(ve.normalized_term)) - length(replace(trim(ve.normalized_term), ' ', '')) + 1) >= 6
      THEN 'sentence'
    WHEN instr(trim(ve.normalized_term), ' ') > 0 THEN 'phrase'
    ELSE 'word'
  END,
  CASE WHEN ve.chinese_definition IS NOT NULL AND trim(ve.chinese_definition) <> '' THEN 'success' ELSE 'failed' END,
  le.context_sentence, le.source_title, le.source_url, ve.note, le.looked_up_at, le.looked_up_at
FROM lookup_events le
JOIN vocabulary_entries ve ON ve.id = le.entry_id`;

const backfillVocabularyItems = `INSERT OR IGNORE INTO vocabulary_items (
  id, user_id, canonical_form, item_type, created_at, updated_at
)
SELECT 'item_' || ve.id, ve.user_id, ve.normalized_term,
  CASE WHEN instr(trim(ve.normalized_term), ' ') > 0 THEN 'phrase' ELSE 'word' END,
  ve.created_at, ve.updated_at
FROM vocabulary_entries ve
WHERE ve.chinese_definition IS NOT NULL AND trim(ve.chinese_definition) <> ''
  AND NOT (
    substr(trim(ve.display_term), -1, 1) IN ('.', '!', '?', ';')
    OR (length(trim(ve.normalized_term)) - length(replace(trim(ve.normalized_term), ' ', '')) + 1) >= 6
  )`;

const backfillVocabularySenses = `INSERT OR IGNORE INTO vocabulary_senses (
  id, vocabulary_item_id, chinese_meaning, part_of_speech, usage_note, created_at, updated_at
)
SELECT 'sense_' || ve.id, 'item_' || ve.id, ve.chinese_definition, ve.part_of_speech, ve.note, ve.created_at, ve.updated_at
FROM vocabulary_entries ve
WHERE ve.chinese_definition IS NOT NULL AND trim(ve.chinese_definition) <> ''
  AND NOT (
    substr(trim(ve.display_term), -1, 1) IN ('.', '!', '?', ';')
    OR (length(trim(ve.normalized_term)) - length(replace(trim(ve.normalized_term), ' ', '')) + 1) >= 6
  )`;

const backfillEncounters = `INSERT OR IGNORE INTO encounters (
  id, vocabulary_item_id, vocabulary_sense_id, lookup_event_id, encountered_form,
  context_sentence, source_title, source_url, note, encountered_at, created_at
)
SELECT 'enc_' || le.id, 'item_' || ve.id, 'sense_' || ve.id, le.id, ve.display_term,
  le.context_sentence, le.source_title, le.source_url, ve.note, le.looked_up_at, le.looked_up_at
FROM lookup_events le
JOIN vocabulary_entries ve ON ve.id = le.entry_id
WHERE ve.chinese_definition IS NOT NULL AND trim(ve.chinese_definition) <> ''
  AND NOT (
    substr(trim(ve.display_term), -1, 1) IN ('.', '!', '?', ';')
    OR (length(trim(ve.normalized_term)) - length(replace(trim(ve.normalized_term), ' ', '')) + 1) >= 6
  )`;

let initialized = false;

async function ensureTextColumn(database: Db, table: string, column: string) {
  const columns = await database.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  if (columns.results.some((candidate) => candidate.name === column)) return;
  try {
    await database.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT`).run();
  } catch (error) {
    const refreshed = await database.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
    if (!refreshed.results.some((candidate) => candidate.name === column)) throw error;
  }
}

export async function ensureVocabularySchema() {
  if (initialized) return;
  const database = getVocabularyDb();
  await database.batch([
    database.prepare(createEntries),
    database.prepare(createEvents),
    database.prepare("CREATE INDEX IF NOT EXISTS event_user_time_idx ON lookup_events(user_id, looked_up_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS event_entry_time_idx ON lookup_events(entry_id, looked_up_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS entry_user_last_lookup_idx ON vocabulary_entries(user_id, last_looked_up_at)"),
    database.prepare(createLookupEventsV2),
    database.prepare(createVocabularyItems),
    database.prepare(createVocabularySenses),
    database.prepare(createEncounters),
  ]);
  await ensureTextColumn(database, "lookup_events_v2", "note");
  await ensureTextColumn(database, "encounters", "note");
  await database.batch([
    database.prepare("CREATE INDEX IF NOT EXISTS lookup_v2_user_time_idx ON lookup_events_v2(user_id, looked_up_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS lookup_v2_user_type_time_idx ON lookup_events_v2(user_id, input_type, looked_up_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS vocabulary_item_user_updated_idx ON vocabulary_items(user_id, updated_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS sense_item_idx ON vocabulary_senses(vocabulary_item_id)"),
    database.prepare("CREATE INDEX IF NOT EXISTS encounter_item_time_idx ON encounters(vocabulary_item_id, encountered_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS encounter_sense_time_idx ON encounters(vocabulary_sense_id, encountered_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS encounter_lookup_idx ON encounters(lookup_event_id)"),
    database.prepare(backfillLookupEventsV2),
    database.prepare(backfillVocabularyItems),
    database.prepare(backfillVocabularySenses),
    database.prepare(backfillEncounters),
  ]);
  initialized = true;
}
