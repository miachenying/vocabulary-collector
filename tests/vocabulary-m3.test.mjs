import assert from "node:assert/strict";
import test from "node:test";

import { classifyInputV2, normalizeTerm } from "../lib/vocabulary/input.ts";
import {
  canonicalFormFromPayload,
  senseMatchFromPayload,
} from "../lib/vocabulary/language-judgment-validation.ts";

test("classifies word, phrase, and sentence inputs", () => {
  assert.equal(classifyInputV2("reluctant"), "word");
  assert.equal(classifyInputV2("won them over"), "phrase");
  assert.equal(classifyInputV2("This is a complete sentence."), "sentence");
  assert.equal(classifyInputV2("one two three four five six"), "sentence");
});

test("normalizes lookup text deterministically", () => {
  assert.equal(normalizeTerm("  Won   Them Over!  "), "won them over");
  assert.equal(normalizeTerm("Take Off"), "take off");
});

test("canonicalization payload accepts a usable canonical form", () => {
  assert.equal(
    canonicalFormFromPayload({ canonical_form: " win someone over " }, "won them over"),
    "win someone over",
  );
});

test("canonicalization payload falls back when malformed or empty", () => {
  assert.equal(canonicalFormFromPayload({}, "won them over"), "won them over");
  assert.equal(canonicalFormFromPayload({ canonical_form: "   " }, "brush it off"), "brush it off");
  assert.equal(canonicalFormFromPayload({ canonical_form: 123 }, "take off"), "take off");
});

test("sense matching only accepts an existing sense id that belongs to the item", () => {
  const senses = [
    { id: "sense-growth", chineseMeaning: "快速发展" },
    { id: "sense-flight", chineseMeaning: "起飞" },
  ];
  assert.deepEqual(
    senseMatchFromPayload({ match_type: "existing", sense_id: "sense-growth" }, senses),
    { matchType: "existing", senseId: "sense-growth" },
  );
  assert.deepEqual(
    senseMatchFromPayload({ match_type: "existing", sense_id: "sense-other-user" }, senses),
    { matchType: "new", senseId: null },
  );
});

test("sense matching conservatively creates a new sense for malformed or uncertain output", () => {
  const senses = [{ id: "sense-growth", chineseMeaning: "快速发展" }];
  assert.deepEqual(senseMatchFromPayload({ match_type: "new", sense_id: null }, senses), {
    matchType: "new",
    senseId: null,
  });
  assert.deepEqual(senseMatchFromPayload({ match_type: "existing" }, senses), {
    matchType: "new",
    senseId: null,
  });
  assert.deepEqual(senseMatchFromPayload("bad-output", senses), {
    matchType: "new",
    senseId: null,
  });
});
