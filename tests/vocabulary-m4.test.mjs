import assert from "node:assert/strict";
import test from "node:test";
import { enrichSentenceExpressionsWith } from "../lib/vocabulary/sentence-enrichment.ts";
import { structuredSentenceAnalysisFromPayload } from "../lib/vocabulary/sentence-expressions.ts";
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

test("structured analysis keeps expression boundaries, reusable forms, and meanings aligned", () => {
  const sentence = "The proposal was met with skepticism, the news sent shock waves through the industry, but she eventually won them over.";
  const result = structuredSentenceAnalysisFromPayload({
    translation: "该提议遭到质疑，消息震动了整个行业，但她最终说服了他们。",
    expressions: [
      { encountered_form: "was met with skepticism", canonical_form: "be met with skepticism", chinese_meaning: "遭到质疑；受到怀疑", reason: "fixed_expression" },
      { encountered_form: "sent shock waves through the industry", canonical_form: "send shock waves through something", chinese_meaning: "在……中引起巨大震动或强烈反响", reason: "fixed_expression" },
      { encountered_form: "won them over", canonical_form: "win someone over", chinese_meaning: "说服某人；赢得某人的支持", reason: "idiom" },
    ],
  }, sentence);

  assert.equal(result.status, "success");
  assert.deepEqual(result.expressions.map(({ encounteredForm, canonicalForm, chineseMeaning }) => ({ encounteredForm, canonicalForm, chineseMeaning })), [
    { encounteredForm: "was met with skepticism", canonicalForm: "be met with skepticism", chineseMeaning: "遭到质疑；受到怀疑" },
    { encounteredForm: "sent shock waves through the industry", canonicalForm: "send shock waves through something", chineseMeaning: "在……中引起巨大震动或强烈反响" },
    { encounteredForm: "won them over", canonicalForm: "win someone over", chineseMeaning: "说服某人；赢得某人的支持" },
  ]);
  assert.equal(result.expressions[1].chineseMeaning.includes("业内"), false);
});

test("repairs passive met-with boundaries and rejects ordinary time adverbs", () => {
  const sentence = "The proposal was met with skepticism, but she eventually won them over.";
  const expressions = expressionsFromPayload({ expressions: [
    { encountered_form: "met with skepticism", canonical_form: "be met with something", reason: "fixed_expression" },
    { encountered_form: "eventually", canonical_form: "eventually", reason: "contextual_expression" },
    { encountered_form: "won them over", canonical_form: "win someone over", reason: "idiom" },
  ] }, sentence);
  assert.deepEqual(expressions, [
    { encounteredForm: "was met with skepticism", canonicalForm: "be met with skepticism", reason: "fixed_expression" },
    { encounteredForm: "won them over", canonicalForm: "win someone over", reason: "idiom" },
  ]);
});

test("aligns repaired met-with meaning and filters routine literal actions", () => {
  const passive = structuredSentenceAnalysisFromPayload({
    translation: "这项提议遭到了怀疑。",
    expressions: [{ encountered_form: "met with skepticism", canonical_form: "be met with something", chinese_meaning: "遭遇（某种反应或态度）", reason: "fixed_expression" }],
  }, "The proposal was met with skepticism.");
  assert.deepEqual(passive.expressions[0], {
    encounteredForm: "was met with skepticism", canonicalForm: "be met with skepticism",
    chineseMeaning: "遭到质疑；受到怀疑", meaningStatus: "ready", reason: "fixed_expression",
  });

  assert.deepEqual(expressionsFromPayload({ expressions: [
    { encountered_form: "submitted the report", canonical_form: "submitting something", reason: "contextual_expression" },
    { encountered_form: "emailed my manager", canonical_form: "email someone", reason: "contextual_expression" },
  ] }, "I submitted the report and emailed my manager."), []);
});
