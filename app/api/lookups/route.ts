import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Db = {
  prepare(sql: string): {
    bind(...values: unknown[]): { run(): Promise<unknown>; first<T>(): Promise<T | null>; all<T>(): Promise<{ results: T[] }> };
    run(): Promise<unknown>;
  };
  batch(statements: unknown[]): Promise<unknown>;
};

const db = () => {
  const binding = (globalThis as typeof globalThis & { __VOCAB_DB?: Db }).__VOCAB_DB;
  if (!binding) throw new Error("Vocabulary database binding is unavailable.");
  return binding;
};

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

async function ensureSchema() {
  if (initialized) return;
  const database = db();
  await database.batch([
    database.prepare(createEntries),
    database.prepare(createEvents),
    database.prepare("CREATE INDEX IF NOT EXISTS event_user_time_idx ON lookup_events(user_id, looked_up_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS event_entry_time_idx ON lookup_events(entry_id, looked_up_at)"),
    database.prepare("CREATE INDEX IF NOT EXISTS entry_user_last_lookup_idx ON vocabulary_entries(user_id, last_looked_up_at)"),
  ]);
  initialized = true;
}

function normalizeTerm(input: string) {
  return input.trim().toLocaleLowerCase("en-US").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").replace(/[.,!?;:]+$/g, "");
}

function inputType(input: string) {
  const trimmed = input.trim();
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  return /[.!?;]\s*$/.test(trimmed) || wordCount >= 6 ? "sentence" : "vocabulary";
}

function userId(request: NextRequest) {
  return request.headers.get("oai-authenticated-user-email") || "mia-local";
}

function nullable(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function geminiApiKey() {
  return (globalThis as typeof globalThis & { __GEMINI_API_KEY?: string }).__GEMINI_API_KEY;
}

async function generateChineseDefinition(term: string, context: string | null) {
  const apiKey = geminiApiKey();
  if (!apiKey) throw new Error("Gemini API key is not configured.");

  const isSingleWord = !/\s/.test(term.trim());
  const task = isSingleWord
    ? "Define the English word in concise, natural Simplified Chinese."
    : "Translate the ENTIRE English input into natural Simplified Chinese. Preserve every clause and idea in the input. Do not extract or define only selected vocabulary words.";
  const prompt = context
    ? `Task: ${task}\nEnglish input: ${term}\nOriginal context: ${context}`
    : `Task: ${task}\nEnglish input: ${term}`;

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{
            text: "You are the translation engine for a personal English vocabulary collector. Obey the explicit Task in the user message. For any multi-word English input, translate the complete input, including every clause and idea; never answer with definitions of selected words. For a single English word, give its concise most common Simplified Chinese meaning(s), using original context when provided. Reply with only the Chinese result. Do not use markdown, bullets, examples, commentary, or repeat the English input.",
          }],
        },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 300,
        },
      }),
    },
  );

  if (!response.ok) throw new Error(`Gemini request failed (${response.status}).`);
  const payload = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const definition = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!definition) throw new Error("Gemini returned an empty definition.");
  return definition;
}

function mapEntry(row: Record<string, unknown>) {
  return {
    id: row.id, displayTerm: row.display_term, chineseDefinition: row.chinese_definition,
    contextSentence: row.context_sentence, sourceTitle: row.source_title, sourceUrl: row.source_url, note: row.note,
    lookupCount: row.lookup_count, firstLookedUpAt: row.first_looked_up_at, lastLookedUpAt: row.last_looked_up_at,
    periodLookupCount: row.period_lookup_count ?? row.lookup_count,
    periodFirstLookup: row.period_first_lookup ?? row.first_looked_up_at,
    periodLastLookup: row.period_last_lookup ?? row.last_looked_up_at,
    lastEventId: row.last_event_id ?? null,
    inputType: inputType(String(row.display_term || "")),
  };
}

export async function POST(request: NextRequest) {
  await ensureSchema();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const displayTerm = nullable(body?.term);
  if (!displayTerm) return NextResponse.json({ error: "Please enter a word, phrase, or sentence." }, { status: 400 });
  const normalized = normalizeTerm(displayTerm);
  if (!normalized) return NextResponse.json({ error: "Please enter a word, phrase, or sentence." }, { status: 400 });

  const database = db();
  const uid = userId(request);
  const now = new Date().toISOString();
  const context = nullable(body?.context);
  const sourceTitle = nullable(body?.sourceTitle);
  const sourceUrl = nullable(body?.sourceUrl);
  const note = nullable(body?.note);
  const existing = await database.prepare("SELECT * FROM vocabulary_entries WHERE user_id = ? AND normalized_term = ?").bind(uid, normalized).first<Record<string, unknown>>();
  const entryId = existing?.id as string | undefined ?? crypto.randomUUID();

  if (existing) {
    await database.prepare(`UPDATE vocabulary_entries SET display_term = ?, context_sentence = COALESCE(?, context_sentence),
      source_title = COALESCE(?, source_title), source_url = COALESCE(?, source_url), note = COALESCE(?, note),
      lookup_count = lookup_count + 1, last_looked_up_at = ?, updated_at = ? WHERE id = ?`)
      .bind(displayTerm, context, sourceTitle, sourceUrl, note, now, now, entryId).run();
  } else {
    await database.prepare(`INSERT INTO vocabulary_entries
      (id, user_id, normalized_term, display_term, context_sentence, source_title, source_url, note, lookup_count, first_looked_up_at, last_looked_up_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`)
      .bind(entryId, uid, normalized, displayTerm, context, sourceTitle, sourceUrl, note, now, now, now, now).run();
  }
  await database.prepare(`INSERT INTO lookup_events (id, entry_id, user_id, looked_up_at, context_sentence, source_title, source_url)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), entryId, uid, now, context, sourceTitle, sourceUrl).run();

  let warning: string | null = null;
  let definition = existing?.chinese_definition as string | null | undefined;
  // Multi-word inputs are always regenerated. This both makes sentence
  // translation deterministic and repairs any older cached entry that was
  // mistakenly stored as a single-word definition.
  const isMultiWord = /\s/.test(displayTerm.trim());
  if (!definition || context || isMultiWord) {
    try {
      definition = await generateChineseDefinition(displayTerm, context);
      await database.prepare("UPDATE vocabulary_entries SET chinese_definition = ?, updated_at = ? WHERE id = ?")
        .bind(definition, new Date().toISOString(), entryId).run();
    } catch {
      warning = "词已经保存，但这次中文解释暂时没有生成。请稍后再查一次。";
    }
  }

  const entry = await database.prepare("SELECT * FROM vocabulary_entries WHERE id = ?").bind(entryId).first<Record<string, unknown>>();
  return NextResponse.json({
    entry: entry ? mapEntry(entry) : null,
    warning,
  }, { status: warning ? 202 : 200 });
}

export async function GET(request: NextRequest) {
  await ensureSchema();
  const start = request.nextUrl.searchParams.get("start");
  const end = request.nextUrl.searchParams.get("end");
  if (!start || !end || Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) {
    return NextResponse.json({ error: "Valid start and end dates are required." }, { status: 400 });
  }
  const uid = userId(request);
  const database = db();
  const rows = await database.prepare(`SELECT e.*, COUNT(ev.id) AS period_lookup_count,
      MIN(ev.looked_up_at) AS period_first_lookup,
      MAX(ev.looked_up_at) AS period_last_lookup,
      (SELECT ev2.id FROM lookup_events ev2 WHERE ev2.entry_id = e.id AND ev2.user_id = ?
       AND ev2.looked_up_at >= ? AND ev2.looked_up_at <= ? ORDER BY ev2.looked_up_at DESC LIMIT 1) AS last_event_id
    FROM vocabulary_entries e JOIN lookup_events ev ON ev.entry_id = e.id
    WHERE ev.user_id = ? AND ev.looked_up_at >= ? AND ev.looked_up_at <= ?
    GROUP BY e.id ORDER BY period_lookup_count DESC, MAX(ev.looked_up_at) DESC`)
    .bind(uid, start, end, uid, start, end).all<Record<string, unknown>>();
  const totalLookups = rows.results.reduce((sum, row) => sum + Number(row.period_lookup_count || 0), 0);
  const repeatedWords = rows.results.filter((row) => Number(row.period_lookup_count) > 1).length;
  const newWords = rows.results.filter((row) => {
    const first = String(row.first_looked_up_at);
    return first >= start && first <= end;
  }).length;
  return NextResponse.json({ entries: rows.results.map(mapEntry), stats: { newWords, repeatedWords, totalLookups } });
}

export async function DELETE(request: NextRequest) {
  await ensureSchema();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const eventId = nullable(body?.eventId);
  if (!eventId) return NextResponse.json({ error: "A history record is required." }, { status: 400 });

  const uid = userId(request);
  const database = db();
  const event = await database.prepare("SELECT id, entry_id FROM lookup_events WHERE id = ? AND user_id = ?")
    .bind(eventId, uid).first<{ id: string; entry_id: string }>();
  if (!event) return NextResponse.json({ error: "History record not found." }, { status: 404 });

  await database.prepare("DELETE FROM lookup_events WHERE id = ? AND user_id = ?").bind(eventId, uid).run();
  const remaining = await database.prepare(`SELECT COUNT(*) AS count, MIN(looked_up_at) AS first_lookup, MAX(looked_up_at) AS last_lookup
    FROM lookup_events WHERE entry_id = ? AND user_id = ?`).bind(event.entry_id, uid)
    .first<{ count: number; first_lookup: string | null; last_lookup: string | null }>();

  const count = Number(remaining?.count || 0);
  if (count === 0) {
    await database.prepare("DELETE FROM vocabulary_entries WHERE id = ? AND user_id = ?").bind(event.entry_id, uid).run();
  } else {
    const now = new Date().toISOString();
    await database.prepare(`UPDATE vocabulary_entries SET lookup_count = ?, first_looked_up_at = ?, last_looked_up_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ?`).bind(count, remaining?.first_lookup, remaining?.last_lookup, now, event.entry_id, uid).run();
  }

  return NextResponse.json({ deleted: true });
}
