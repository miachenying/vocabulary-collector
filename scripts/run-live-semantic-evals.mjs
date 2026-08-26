import assert from "node:assert/strict";
import { Miniflare } from "miniflare";
import fs from "node:fs/promises";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY is required for live semantic evals.");
  process.exit(2);
}

const cases = JSON.parse(await fs.readFile("evals/m4-sentence-cases.json", "utf8"));
const miniflare = new Miniflare({
  modules: true,
  script: "export default { async fetch() { return new Response('ok'); } }",
  compatibilityDate: "2026-05-22",
  d1Databases: ["DB"],
});

const database = await miniflare.getD1Database("DB");
const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("live-eval", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

const env = {
  DB: database,
  GEMINI_API_KEY: apiKey,
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  IMAGES: { input() { throw new Error("Image binding is not used by semantic evals."); } },
};
const ctx = { waitUntil() {}, passThroughOnException() {} };
const userId = "semantic-eval@example.com";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function lookupOnce(term) {
  const response = await worker.fetch(new Request("http://localhost/api/lookups", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "oai-authenticated-user-email": userId,
    },
    body: JSON.stringify({ term }),
  }), env, ctx);
  return { response, payload: await response.json() };
}

async function lookup(term, { retryPartial = false } = {}) {
  let result = await lookupOnce(term);
  if (retryPartial && result.response.status === 202) {
    console.log("Provider-limited partial response; cooling down 30s before one case retry.");
    await sleep(30_000);
    result = await lookupOnce(term);
  }
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  return result.payload;
}

function normalize(value) {
  return String(value ?? "").trim().toLocaleLowerCase("en-US");
}

function containsAny(value, expected) {
  return expected.some((candidate) => String(value ?? "").includes(candidate));
}

const canonicalAliases = new Map([
  ["be met with skepticism", ["be met with skepticism", "meet with skepticism"]],
]);

function canonicalMatches(actualForms, expected) {
  const normalizedExpected = normalize(expected);
  const accepted = canonicalAliases.get(normalizedExpected) ?? [normalizedExpected];
  return accepted.some((candidate) => actualForms.includes(candidate));
}

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, passed: false, error: error instanceof Error ? error.message : String(error) });
    console.error(`FAIL ${name}:`, error);
  }
}

try {
  await check("word reluctant returns correct Chinese meaning", async () => {
    const payload = await lookup("reluctant");
    const meaning = payload.entry?.chineseDefinition ?? "";
    assert.ok(containsAny(meaning, ["不情愿", "不愿", "勉强"]), meaning);
  });
  await sleep(5_000);

  await check("word scrutinize returns correct Chinese meaning", async () => {
    const payload = await lookup("scrutinize");
    const meaning = payload.entry?.chineseDefinition ?? "";
    assert.ok(containsAny(meaning, ["仔细审查", "仔细检查", "细看", "审视"]), meaning);
  });
  await sleep(5_000);

  await check("phrase leave much to be desired returns correct Chinese meaning", async () => {
    const payload = await lookup("leave much to be desired");
    const meaning = payload.entry?.chineseDefinition ?? "";
    assert.ok(containsAny(meaning, ["不尽如人意", "不尽人意", "有待改进", "改进空间"]), meaning);
  });

  for (const testCase of cases) {
    // Sentence lookups can fan out into translation, extraction, and enrichment calls.
    // Space cases so provider quota does not masquerade as a semantic regression.
    await sleep(20_000);
    await check(`sentence extraction ${testCase.id}`, async () => {
      const payload = await lookup(testCase.sentence, { retryPartial: true });
      assert.equal(payload.sentenceAnalysis?.translation ? true : false, true, "missing sentence translation");
      const expressions = payload.sentenceAnalysis?.expressions ?? [];
      const canonicalForms = expressions.map((row) => normalize(row.canonicalForm)).filter(Boolean);
      const missing = testCase.must_include.filter((value) => !canonicalMatches(canonicalForms, value));
      const forbidden = testCase.must_exclude.filter((value) => canonicalForms.includes(normalize(value)));
      assert.deepEqual(missing, [], `missing ${missing.join(", ")}; actual=${canonicalForms.join(", ")}`);
      assert.deepEqual(forbidden, [], `forbidden ${forbidden.join(", ")}; actual=${canonicalForms.join(", ")}`);
      assert.ok(canonicalForms.length <= testCase.max_expressions, `too many expressions: ${canonicalForms.join(", ")}`);
    });
  }
} finally {
  await miniflare.dispose();
}

const failed = results.filter((result) => !result.passed);
console.log(`\nLive semantic eval summary: ${results.length - failed.length}/${results.length} passed.`);
if (failed.length) process.exit(1);
