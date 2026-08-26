import assert from "node:assert/strict";
import { Miniflare } from "miniflare";

const lookupEventId = `e2e-lookup-${Date.now()}`;
const userId = "e2e@example.com";

const miniflare = new Miniflare({
  modules: true,
  script: "export default { async fetch() { return new Response('ok'); } }",
  compatibilityDate: "2026-08-01",
  d1Databases: ["DB"],
});

const database = await miniflare.getD1Database("DB");
const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("e2e", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

const env = {
  DB: database,
  GEMINI_API_KEY: undefined,
  ASSETS: {
    fetch: async () => new Response("Not found", { status: 404 }),
  },
  IMAGES: {
    input() {
      throw new Error("Image binding is not used by this E2E test.");
    },
  },
};
const ctx = {
  waitUntil() {},
  passThroughOnException() {},
};

async function appFetch(path, init = {}) {
  return worker.fetch(new Request(`http://localhost${path}`, init), env, ctx);
}

try {
  // The lookup route initializes both legacy and v2 schema before validating dates.
  const initResponse = await appFetch("/api/lookups?start=bad&end=bad", {
    headers: { "oai-authenticated-user-email": userId },
  });
  assert.equal(initResponse.status, 400);

  await database.prepare(`INSERT INTO lookup_events_v2 (
    id, user_id, raw_input, input_type, status, context_sentence, source_title, source_url, looked_up_at, created_at
  ) VALUES (?, ?, ?, 'sentence', 'success', NULL, 'E2E', 'https://example.com/e2e', ?, ?)`)
    .bind(
      lookupEventId,
      userId,
      "The explanation doesn't quite add up.",
      "2026-08-26T18:00:00.000Z",
      "2026-08-26T18:00:00.000Z",
    )
    .run();

  const body = {
    lookupEventId,
    encounteredForm: "doesn't quite add up",
    canonicalForm: "add up",
    chineseMeaning: "说得通；合乎情理",
  };

  const firstResponse = await appFetch("/api/collection", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "oai-authenticated-user-email": userId,
    },
    body: JSON.stringify(body),
  });
  assert.equal(firstResponse.status, 200);
  const first = await firstResponse.json();
  assert.equal(first.saved, true);
  assert.equal(first.alreadySaved, false);
  assert.ok(first.itemId);
  assert.ok(first.senseId);

  const secondResponse = await appFetch("/api/collection", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "oai-authenticated-user-email": userId,
    },
    body: JSON.stringify(body),
  });
  assert.equal(secondResponse.status, 200);
  const second = await secondResponse.json();
  assert.equal(second.saved, true);
  assert.equal(second.alreadySaved, true);
  assert.equal(second.itemId, first.itemId);
  assert.equal(second.senseId, first.senseId);

  const row = await database.prepare(`SELECT
    (SELECT COUNT(*) FROM vocabulary_items WHERE user_id = ? AND canonical_form = 'add up') AS items,
    (SELECT COUNT(*) FROM vocabulary_senses WHERE vocabulary_item_id = ?) AS senses,
    (SELECT COUNT(*) FROM encounters WHERE lookup_event_id = ?) AS encounters`)
    .bind(userId, first.itemId, lookupEventId)
    .first();

  assert.equal(Number(row?.items), 1);
  assert.equal(Number(row?.senses), 1);
  assert.equal(Number(row?.encounters), 1);

  console.log("D1 E2E passed: built Worker persisted one item/sense/encounter and repeat save was idempotent.");
} finally {
  await miniflare.dispose();
}
