import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";

const baseUrl = "http://127.0.0.1:5173";
const lookupEventId = `e2e-lookup-${Date.now()}`;
const sentence = "The explanation doesn't quite add up.";
const wranglerConfig = ".wrangler/e2e-config.json";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], ...options });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} ${args.join(" ")} failed (${code})\n${stdout}\n${stderr}`));
    });
  });
}

async function waitForServer(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl, { headers: { accept: "text/html" } });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Timed out waiting for local Vocabulary Collector server.");
}

async function d1(command) {
  const { stdout } = await run("npx", [
    "wrangler", "d1", "execute", "site-creator-d1",
    "--local", "--config", wranglerConfig,
    "--command", command,
    "--json",
  ]);
  return JSON.parse(stdout);
}

await fs.mkdir(".wrangler", { recursive: true });
await fs.writeFile(wranglerConfig, JSON.stringify({
  name: "vocabulary-collector-e2e",
  main: "worker/index.ts",
  compatibility_date: "2026-08-01",
  d1_databases: [{
    binding: "DB",
    database_name: "site-creator-d1",
    database_id: "00000000-0000-4000-8000-000000000000",
  }],
}, null, 2));

const server = spawn("npm", ["run", "dev"], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, GEMINI_API_KEY: "" },
});
let serverLog = "";
server.stdout.on("data", (chunk) => { serverLog += chunk; });
server.stderr.on("data", (chunk) => { serverLog += chunk; });

try {
  await waitForServer();

  // Any lookup API request initializes the runtime schema before validating dates.
  await fetch(`${baseUrl}/api/lookups?start=bad&end=bad`, {
    headers: { "oai-authenticated-user-email": "e2e@example.com" },
  });

  await d1(`INSERT INTO lookup_events_v2 (
    id, user_id, raw_input, input_type, status, context_sentence, source_title, source_url, looked_up_at, created_at
  ) VALUES (
    '${lookupEventId}', 'e2e@example.com', 'The explanation doesn''t quite add up.', 'sentence', 'success',
    NULL, 'E2E', 'https://example.com/e2e', '2026-08-26T18:00:00.000Z', '2026-08-26T18:00:00.000Z'
  )`);

  const body = {
    lookupEventId,
    encounteredForm: "doesn't quite add up",
    canonicalForm: "add up",
    chineseMeaning: "说得通；合乎情理",
  };

  const firstResponse = await fetch(`${baseUrl}/api/collection`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "oai-authenticated-user-email": "e2e@example.com",
    },
    body: JSON.stringify(body),
  });
  assert.equal(firstResponse.status, 200);
  const first = await firstResponse.json();
  assert.equal(first.saved, true);
  assert.equal(first.alreadySaved, false);

  const secondResponse = await fetch(`${baseUrl}/api/collection`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "oai-authenticated-user-email": "e2e@example.com",
    },
    body: JSON.stringify(body),
  });
  assert.equal(secondResponse.status, 200);
  const second = await secondResponse.json();
  assert.equal(second.saved, true);
  assert.equal(second.alreadySaved, true);
  assert.equal(second.itemId, first.itemId);
  assert.equal(second.senseId, first.senseId);

  const query = await d1(`SELECT
    (SELECT COUNT(*) FROM vocabulary_items WHERE user_id = 'e2e@example.com' AND canonical_form = 'add up') AS items,
    (SELECT COUNT(*) FROM vocabulary_senses WHERE vocabulary_item_id = '${first.itemId}') AS senses,
    (SELECT COUNT(*) FROM encounters WHERE lookup_event_id = '${lookupEventId}') AS encounters`);
  const row = query?.[0]?.results?.[0];
  assert.equal(Number(row?.items), 1);
  assert.equal(Number(row?.senses), 1);
  assert.equal(Number(row?.encounters), 1);

  console.log("D1 E2E passed: first save persisted one item/sense/encounter and repeat save was idempotent.");
} catch (error) {
  console.error(serverLog);
  throw error;
} finally {
  server.kill("SIGTERM");
  await fs.rm(wranglerConfig, { force: true });
}
