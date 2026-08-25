import assert from "node:assert/strict";
import test from "node:test";
import { expressionsFromPayload } from "../lib/vocabulary/sentence-pipeline.ts";

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
