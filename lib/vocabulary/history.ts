import type { Db } from "./database";
import type { EntryRow } from "./entries";

type CreateLookupEventInput = {
  database: Db;
  entryId: string;
  userId: string;
  lookedUpAt: string;
  context: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
};

export async function createLookupEvent(input: CreateLookupEventInput) {
  const { database, entryId, userId, lookedUpAt, context, sourceTitle, sourceUrl } = input;
  await database.prepare(`INSERT INTO lookup_events (id, entry_id, user_id, looked_up_at, context_sentence, source_title, source_url)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), entryId, userId, lookedUpAt, context, sourceTitle, sourceUrl).run();
}

export async function getHistory(database: Db, userId: string, start: string, end: string) {
  return database.prepare(`SELECT e.*, COUNT(ev.id) AS period_lookup_count,
      MIN(ev.looked_up_at) AS period_first_lookup,
      MAX(ev.looked_up_at) AS period_last_lookup,
      (SELECT ev2.id FROM lookup_events ev2 WHERE ev2.entry_id = e.id AND ev2.user_id = ?
       AND ev2.looked_up_at >= ? AND ev2.looked_up_at <= ? ORDER BY ev2.looked_up_at DESC LIMIT 1) AS last_event_id
    FROM vocabulary_entries e JOIN lookup_events ev ON ev.entry_id = e.id
    WHERE ev.user_id = ? AND ev.looked_up_at >= ? AND ev.looked_up_at <= ?
    GROUP BY e.id ORDER BY period_lookup_count DESC, MAX(ev.looked_up_at) DESC`)
    .bind(userId, start, end, userId, start, end).all<EntryRow>();
}

export async function deleteLookupEvent(database: Db, userId: string, eventId: string) {
  const event = await database.prepare("SELECT id, entry_id FROM lookup_events WHERE id = ? AND user_id = ?")
    .bind(eventId, userId).first<{ id: string; entry_id: string }>();
  if (!event) return false;

  await database.prepare("DELETE FROM lookup_events WHERE id = ? AND user_id = ?").bind(eventId, userId).run();
  const remaining = await database.prepare(`SELECT COUNT(*) AS count, MIN(looked_up_at) AS first_lookup, MAX(looked_up_at) AS last_lookup
    FROM lookup_events WHERE entry_id = ? AND user_id = ?`).bind(event.entry_id, userId)
    .first<{ count: number; first_lookup: string | null; last_lookup: string | null }>();

  const count = Number(remaining?.count || 0);
  if (count === 0) {
    await database.prepare("DELETE FROM vocabulary_entries WHERE id = ? AND user_id = ?").bind(event.entry_id, userId).run();
  } else {
    const now = new Date().toISOString();
    await database.prepare(`UPDATE vocabulary_entries SET lookup_count = ?, first_looked_up_at = ?, last_looked_up_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ?`).bind(count, remaining?.first_lookup, remaining?.last_lookup, now, event.entry_id, userId).run();
  }
  return true;
}
