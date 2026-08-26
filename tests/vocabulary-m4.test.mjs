import assert from "node:assert/strict";
import test from "node:test";
import { enrichSentenceExpressionsWith } from "../lib/vocabulary/sentence-enrichment.ts";
import { expressionsFromPayload } from "../lib/vocabulary/sentence-expressions.ts";

test("keeps up to three valid reusable expressions from the sentence", () => {
  const sentence = "The proposal was met with skepticism, but she addressed the concerns head-on and eventually won them over.";
  const expressions = expressionsFromPayload({
    expressions: [
      { encountered_form: "was met with skepticism", canonical_form: "be met with skepticism", reason: "fixed_expression" },
      { encountered_form: "head-on", canonical_form: "head-on", reason: "contextual_expression" },
      { encountered_form: "won them over", canonical_form: "win someone over", reason: "idiom" },
      { encountered_form: "addressed the concerns", canonical_form: "address concerns", reason: "contextual_expression" },
    ],
  }, sentence);

  assert.deepEqual(expressions, [
    { encounteredForm: "was met with skepticism", canonicalForm: "be met with skepticism", reason: "fixed_expression" },
    { encounteredForm: "head-on", canonicalForm: "head-on", reason: "contextual_expression" },
    { encounteredForm: "won them over", canonicalForm: "win someone over", reason: "idiom" },
  ]);
});

test("returns zero when the model finds nothing useful", () => {
  assert.deepEqual(expressionsFromPayload({ expressions: [] }, "I submitted the report and emailed my manager."), []);
});

test("rejects hallucinated expressions that do not occur in the sentence", () => {
  const sentence = "Her explanation doesn't quite add up.";
  assert.deepEqual(expressionsFromPayload({
    expressions: [
      { encountered_form: "add up", canonical_form: "add up", reason: "phrasal_verb" },
      { encountered_form: "brush off", canonical_form: "brush off", reason: "phrasal_verb" },
    ],
  }, sentence), [
    { encounteredForm: "add up", canonicalForm: "add up", reason: "phrasal_verb" },
  ]);
});

test("rejects low-value modifier-only expressions", () => {
  const sentence = "Her explanation doesn't quite add up.";
  assert.deepEqual(expressionsFromPayload({
    expressions: [
      { encountered_form: "add up", canonical_form: "add up", reason: "phrasal_verb" },
      { encountered_form: "not quite", canonical_form: "not quite", reason: "contextual_expression" },
    ],
  }, sentence), [
    { encounteredForm: "add up", canonicalForm: "add up", reason: "phrasal_verb" },
  ]);
});

test("skips malformed rows without discarding later valid expressions", () => {
  const sentence = "She brushed the criticism off and carried on.";
  assert.deepEqual(expressionsFromPayload({
    expressions: [
      null,
      { encountered_form: "brushed the criticism off", canonical_form: "brush off", reason: "phrasal_verb" },
      { encountered_form: "carried on", canonical_form: "carry on", reason: "phrasal_verb" },
    ],
  }, sentence), [
    { encounteredForm: "brushed the criticism off", canonicalForm: "brush off", reason: "phrasal_verb" },
    { encounteredForm: "carried on", canonicalForm: "carry on", reason: "phrasal_verb" },
  ]);
});

test("rejects malformed rows and duplicate canonical forms", () => {
  const sentence = "She brushed the criticism off and carried on.";
  assert.deepEqual(expressionsFromPayload({
    expressions: [
      { encountered_form: "brushed the criticism off", canonical_form: "brush off", reason: "phrasal_verb" },
      { encountered_form: "brushed the criticism off", canonical_form: "brush off", reason: "phrasal_verb" },
      { encountered_form: "carried on", canonical_form: "carry on", reason: "not_valid" },
      { encountered_form: "carried on", canonical_form: "carry on", reason: "phrasal_verb" },
    ],
  }, sentence), [
    { encounteredForm: "brushed the criticism off", canonicalForm: "brush off", reason: "phrasal_verb" },
    { encounteredForm: "carried on", canonicalForm: "carry on", reason: "phrasal_verb" },
  ]);
});

test("attaches Chinese meanings to extracted expressions", async () => {
  const expressions = [
    { encounteredForm: "won them over", canonicalForm: "win someone over", reason: "idiom" },
    { encounteredForm: "head-on", canonicalForm: "head-on", reason: "contextual_expression" },
  ];
  const enriched = await enrichSentenceExpressionsWith(expressions, "She faced it head-on and won them over.", async (expression) => {
    return expression.canonicalForm === "win someone over" ? "赢得某人的支持；说服某人" : "正面地；迎面地";
  });

  assert.deepEqual(enriched, [
    { ...expressions[0], chineseMeaning: "赢得某人的支持；说服某人", meaningStatus: "ready" },
    { ...expressions[1], chineseMeaning: "正面地；迎面地", meaningStatus: "ready" },
  ]);
});

test("one expression meaning failure does not remove other suggestions", async () => {
  const expressions = [
    { encounteredForm: "brushed it off", canonicalForm: "brush off", reason: "phrasal_verb" },
    { encounteredForm: "carried on", canonicalForm: "carry on", reason: "phrasal_verb" },
  ];
  const enriched = await enrichSentenceExpressionsWith(expressions, "She brushed it off and carried on.", async (expression) => {
    if (expression.canonicalForm === "brush off") throw new Error("provider unavailable");
    return "继续进行";
  });

  assert.deepEqual(enriched, [
    { ...expressions[0], chineseMeaning: null, meaningStatus: "unavailable" },
    { ...expressions[1], chineseMeaning: "继续进行", meaningStatus: "ready" },
  ]);
});

test("blank provider output is treated as unavailable", async () => {
  const expressions = [
    { encounteredForm: "add up", canonicalForm: "add up", reason: "phrasal_verb" },
  ];
  const enriched = await enrichSentenceExpressionsWith(expressions, "It doesn't add up.", async () => "   ");
  assert.equal(enriched[0].chineseMeaning, null);
  assert.equal(enriched[0].meaningStatus, "unavailable");
});
