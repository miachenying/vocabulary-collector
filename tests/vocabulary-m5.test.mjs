import assert from "node:assert/strict";
import test from "node:test";
import { expressionAppearsInSentence, parseManualSentenceSaveInput } from "../lib/vocabulary/manual-save-input.ts";
import { groupCollectionRows } from "../lib/vocabulary/collection.ts";

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

test("collection rows expose saved vocabulary separately from lookup history", () => {
  const items = groupCollectionRows([{
    item_id: "item-1", canonical_form: "win someone over", item_type: "phrase",
    item_created_at: "2026-08-26T18:00:00.000Z", sense_id: "sense-1",
    chinese_meaning: "说服某人；赢得某人的支持", encountered_form: "won them over",
    context_sentence: "She eventually won them over.", source_title: "Article",
    source_url: "https://example.com", encountered_at: "2026-08-26T18:00:00.000Z",
    saved_at: "2026-08-26T18:01:00.000Z",
  }]);
  assert.deepEqual(items[0], {
    id: "item-1:sense-1", canonicalForm: "win someone over", itemType: "phrase",
    createdAt: "2026-08-26T18:00:00.000Z", chineseMeaning: "说服某人；赢得某人的支持",
    encounteredForm: "won them over", contextSentence: "She eventually won them over.",
    sourceTitle: "Article", sourceUrl: "https://example.com", encounteredAt: "2026-08-26T18:00:00.000Z",
    savedAt: "2026-08-26T18:01:00.000Z",
  });
});
