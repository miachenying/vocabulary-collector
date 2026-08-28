import assert from "node:assert/strict";
import test from "node:test";
import { expressionAppearsInSentence, parseManualSentenceSaveInput } from "../lib/vocabulary/manual-save-input.ts";
import { sentenceAroundSelection, shareShortcutBaseUrl } from "../lib/vocabulary/reading.ts";
import { groupCollectionRows } from "../lib/vocabulary/collection.ts";
import { extractFocusedContext } from "../extensions/chrome/context.js";

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
    chinese_meaning: "说服某人；赢得某人的支持", encounter_id: "encounter-1", encountered_form: "won them over",
    context_sentence: "She eventually won them over.", source_title: "Article",
    source_url: "https://example.com", note: "Useful in persuasion contexts", encountered_at: "2026-08-26T18:00:00.000Z",
    saved_at: "2026-08-26T18:01:00.000Z",
  }]);
  assert.deepEqual(items[0], {
    id: "item-1:sense-1", canonicalForm: "win someone over", itemType: "phrase",
    createdAt: "2026-08-26T18:00:00.000Z", chineseMeaning: "说服某人；赢得某人的支持",
    encounteredForm: "won them over", contextSentence: "She eventually won them over.",
    sourceTitle: "Article", sourceUrl: "https://example.com", note: "Useful in persuasion contexts",
    encounteredAt: "2026-08-26T18:00:00.000Z", encounterCount: 1,
    encounters: [{
      id: "encounter-1", encounteredForm: "won them over", contextSentence: "She eventually won them over.",
      sourceTitle: "Article", sourceUrl: "https://example.com", note: "Useful in persuasion contexts",
      encounteredAt: "2026-08-26T18:00:00.000Z",
    }],
  });
});

test("collection groups repeated encounters and keeps the latest context", () => {
  const base = {
    item_id: "item-1", canonical_form: "add up", item_type: "phrase", item_created_at: "2026-08-25T18:00:00.000Z",
    sense_id: "sense-1", chinese_meaning: "说得通", encountered_form: "added up", context_sentence: null,
    source_title: null, source_url: null, note: null, saved_at: "2026-08-27T18:00:00.000Z",
  };
  const items = groupCollectionRows([
    { ...base, encounter_id: "encounter-2", encountered_at: "2026-08-27T18:00:00.000Z" },
    { ...base, encounter_id: "encounter-1", encountered_form: "add up", encountered_at: "2026-08-26T18:00:00.000Z" },
  ]);
  assert.equal(items[0].encounterCount, 2);
  assert.equal(items[0].encounteredAt, "2026-08-27T18:00:00.000Z");
  assert.equal(items[0].encounteredForm, "added up");
  assert.equal(items[0].encounters.length, 2);
});

test("browser capture keeps the selected sentence instead of the surrounding paragraph", () => {
  const paragraph = "A long introduction comes first. The announcement caught everyone off guard! A later sentence should not be included.";
  assert.equal(extractFocusedContext(paragraph, "caught everyone off guard"), "The announcement caught everyone off guard!");
});

test("browser capture supports question marks and selected headings", () => {
  assert.equal(
    extractFocusedContext("Before this. How can spirituality help us cultivate resilience, equanimity, and balance? Read on.", "spirituality"),
    "How can spirituality help us cultivate resilience, equanimity, and balance?",
  );
  assert.equal(extractFocusedContext("A heading without punctuation", "heading"), "A heading without punctuation");
});

test("reading selection captures the containing sentence", () => {
  assert.equal(
    sentenceAroundSelection("The opening was simple. Her explanation did not add up. Then everyone left.", "add up"),
    "Her explanation did not add up.",
  );
});

test("share shortcut URL targets the authenticated lookup entry", () => {
  assert.equal(
    shareShortcutBaseUrl("https://vocabulary.example/"),
    "https://vocabulary.example/?share=1&term=",
  );
});
