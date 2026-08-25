import assert from "node:assert/strict";

import { lookupEnglishWord } from "../lib/vocabulary/dictionary.ts";
import { canonicalizeExpression, matchSemanticSense } from "../lib/vocabulary/language-judgment.ts";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY is required for M3 LLM evals.");
  process.exit(2);
}
globalThis.__GEMINI_API_KEY = apiKey;

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

await check("dictionary finds reluctant with lexical senses", async () => {
  const result = await lookupEnglishWord("reluctant");
  assert.ok(result);
  assert.ok(result.senses.length > 0);
});

await check("dictionary finds scrutinize with lexical senses", async () => {
  const result = await lookupEnglishWord("scrutinize");
  assert.ok(result);
  assert.ok(result.senses.length > 0);
});

await check("canonicalizes won them over to a reusable form", async () => {
  const canonical = await canonicalizeExpression(
    "won them over",
    "The team was skeptical at first, but the demo eventually won them over.",
    "won them over",
  );
  assert.match(canonical.toLowerCase(), /win .* over|win someone over/);
});

await check("canonicalizes brushed it off to brush off", async () => {
  const canonical = await canonicalizeExpression(
    "brushed it off",
    "She brushed the criticism off and carried on working.",
    "brushed it off",
  );
  assert.match(canonical.toLowerCase(), /brush .*off|brush off/);
});

const takeOffSenses = [
  { id: "sense-growth", chineseMeaning: "快速发展；迅速走红" },
  { id: "sense-flight", chineseMeaning: "起飞" },
];

await check("take off growth context matches growth sense", async () => {
  const decision = await matchSemanticSense(
    "take off",
    "迅速发展",
    "The startup really took off after the product launch.",
    takeOffSenses,
  );
  assert.deepEqual(decision, { matchType: "existing", senseId: "sense-growth" });
});

await check("take off flight context matches flight sense", async () => {
  const decision = await matchSemanticSense(
    "take off",
    "飞机起飞",
    "The plane took off twenty minutes late.",
    takeOffSenses,
  );
  assert.deepEqual(decision, { matchType: "existing", senseId: "sense-flight" });
});

const failed = results.filter((result) => !result.passed);
console.log(`\nM3 eval summary: ${results.length - failed.length}/${results.length} passed.`);
if (failed.length) process.exit(1);
