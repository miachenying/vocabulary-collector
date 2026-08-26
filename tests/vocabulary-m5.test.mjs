import assert from "node:assert/strict";
import test from "node:test";
import { expressionAppearsInSentence, parseManualSentenceSaveInput } from "../lib/vocabulary/manual-save-input.ts";

test("parses a complete manual sentence save payload", () => {
  assert.deepEqual(parseManualSentenceSaveInput({
    lookupEventId: "event-1",
    encounteredForm: "won them over",
    canonicalForm: "win someone over",
    chineseMeaning: "赢得某人的支持；说服某人",
  }), {
    lookupEventId: "event-1",
    encounteredForm: "won them over",
    canonicalForm: "win someone over",
    chineseMeaning: "赢得某人的支持；说服某人",
  });
});

test("rejects an incomplete manual sentence save payload", () => {
  assert.equal(parseManualSentenceSaveInput({
    lookupEventId: "event-1",
    encounteredForm: "won them over",
    canonicalForm: "win someone over",
    chineseMeaning: "   ",
  }), null);
});

test("accepts an encountered expression that appears in the source sentence", () => {
  assert.equal(expressionAppearsInSentence(
    "won them over",
    "She addressed the concerns head-on and eventually won them over.",
  ), true);
});

test("rejects an expression that was not in the source sentence", () => {
  assert.equal(expressionAppearsInSentence(
    "brush off",
    "She addressed the concerns head-on and eventually won them over.",
  ), false);
});
