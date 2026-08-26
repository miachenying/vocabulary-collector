import fs from "node:fs/promises";

const [casesPath = "evals/m4-sentence-cases.json", resultsPath] = process.argv.slice(2);
if (!resultsPath) {
  console.error("Usage: node scripts/score-m4-eval-results.mjs [cases.json] <results.json>");
  process.exit(2);
}

const cases = JSON.parse(await fs.readFile(casesPath, "utf8"));
const results = JSON.parse(await fs.readFile(resultsPath, "utf8"));
const byId = new Map(results.map((row) => [row.id, row]));

let failed = 0;
for (const testCase of cases) {
  const result = byId.get(testCase.id);
  if (!result || !Array.isArray(result.expressions)) {
    console.log(`FAIL ${testCase.id}: missing result`);
    failed += 1;
    continue;
  }

  const canonicalForms = result.expressions
    .map((row) => String(row.canonicalForm ?? row.canonical_form ?? "").trim().toLocaleLowerCase("en-US"))
    .filter(Boolean);

  const missing = testCase.must_include.filter((value) => !canonicalForms.includes(value.toLocaleLowerCase("en-US")));
  const forbidden = testCase.must_exclude.filter((value) => canonicalForms.includes(value.toLocaleLowerCase("en-US")));
  const tooMany = canonicalForms.length > testCase.max_expressions;

  if (missing.length || forbidden.length || tooMany) {
    console.log(`FAIL ${testCase.id}:`, {
      missing,
      forbidden,
      count: canonicalForms.length,
      max: testCase.max_expressions,
      actual: canonicalForms,
    });
    failed += 1;
  } else {
    console.log(`PASS ${testCase.id}: ${canonicalForms.join(", ") || "0 expressions"}`);
  }
}

if (failed) {
  console.error(`\n${failed}/${cases.length} M4 eval cases failed.`);
  process.exit(1);
}

console.log(`\n${cases.length}/${cases.length} M4 eval cases passed.`);
