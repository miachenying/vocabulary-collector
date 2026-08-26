import type { Db } from "./database";

export type LookupInputType = "word" | "phrase" | "sentence";
export type LookupStatus = "success" | "partial" | "failed";

export type LookupEventV2Row = {
  id: string;
  user_id: string;
  raw_input: string;
  input_type: LookupInputType;
  status: LookupStatus;
  context_sentence: string | null;
  source_title: string | null;
  source_url: string | null;
  looked_up_at: string;
  created_at: string;
};

type CreateLookupEventV2Input = {
  database: Db;
  userId: string;
  rawInput: string;
  inputType: LookupInputType;
  status: LookupStatus;
  contextSentence?: string | null;
  sourceTitle?: string | null;
  sourceUrl?: string | null;
  lookedUpAt: string;
};

export async function createLookupEventV2(input: CreateLookupEventV2Input) {
  const {
    database,
    userId,
    rawInput,
    inputType,
    status,
    contextSentence = null,
    sourceTitle = null,
    sourceUrl = null,
    lookedUpAt,
  } = input;
  const id = crypto.randomUUID();

  await database.prepare(`INSERT INTO lookup_events_v2
    (id, user_id, raw_input, input_type, status, context_sentence, source_title, source_url, looked_up_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, userId, rawInput, inputType, status, contextSentence, sourceTitle, sourceUrl, lookedUpAt, lookedUpAt).run();

  return database.prepare("SELECT * FROM lookup_events_v2 WHERE id = ? AND user_id = ?")
    .bind(id, userId).first<LookupEventV2Row>();
}

export async function findLookupEventV2(database: Db, userId: string, eventId: string) {
  return database.prepare("SELECT * FROM lookup_events_v2 WHERE id = ? AND user_id = ?")
    .bind(eventId, userId).first<LookupEventV2Row>();
}

export async function getLookupHistoryV2(database: Db, userId: string, start: string, end: string) {
  return database.prepare(`SELECT * FROM lookup_events_v2
    WHERE user_id = ? AND looked_up_at >= ? AND looked_up_at <= ?
    ORDER BY looked_up_at DESC`)
    .bind(userId, start, end).all<LookupEventV2Row>();
}

export async function updateLookupEventStatus(database: Db, userId: string, eventId: string, status: LookupStatus) {
  await database.prepare("UPDATE lookup_events_v2 SET status = ? WHERE id = ? AND user_id = ?")
    .bind(status, eventId, userId).run();
}
