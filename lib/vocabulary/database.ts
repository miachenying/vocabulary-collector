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

// Version 6 historically initialized its schema at runtime. Keep this behavior
// during Milestone 1 so the refactor does not change deployment behavior.
// A later migration milestone can make Drizzle migrations the single schema source.
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

let initialized = false;

export async function ensureVocabularySchema() {
  if (initialized) return;
  const database = getVocabularyDb();
  await database.batch([
    database.prepare(createEntries),
    database.prepare(createEvents),
    database.prepare("CREATE INDEX IF NOT EXISTS event_user_time_idx ON lookup_events(user_id, looked_up_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS event_entry_time_idx ON lookup_events(entry_id, looked_up_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS entry_user_last_lookup_idx ON vocabulary_entries(user_id, last_looked_up_at)"),
  ]);
  initialized = true;
}
