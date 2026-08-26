import { createEncounter } from "./encounters";
import { findOrCreateVocabularyItem } from "./items";
import { matchSemanticSense } from "./language-judgment";
import { findLookupEventV2 } from "./lookup-history";
import { expressionAppearsInSentence, type ManualSentenceSaveInput } from "./manual-save-input";
import { createVocabularySense, findVocabularySense, listVocabularySenses } from "./senses";
import type { Db } from "./database";

function sameStoredMeaning(left: string, right: string) {
  return left.trim() === right.trim();
}

export async function saveSentenceSuggestion(input: {
  database: Db;
  userId: string;
  suggestion: ManualSentenceSaveInput;
  now: string;
}) {
  const { database, userId, suggestion, now } = input;
  const event = await findLookupEventV2(database, userId, suggestion.lookupEventId);
  if (!event || event.input_type !== "sentence") throw new Error("Sentence lookup event not found.");
  if (!expressionAppearsInSentence(suggestion.encounteredForm, event.raw_input)) {
    throw new Error("Expression does not belong to this sentence lookup.");
  }

  const itemType = /\s/.test(suggestion.canonicalForm) ? "phrase" : "word";
  const item = await findOrCreateVocabularyItem({
    database,
    userId,
    canonicalForm: suggestion.canonicalForm,
    itemType,
    now,
  });
  if (!item) throw new Error("Vocabulary item could not be created.");

  const senses = await listVocabularySenses(database, item.id);
  let sense = senses.results.find((candidate) => sameStoredMeaning(candidate.chinese_meaning, suggestion.chineseMeaning)) ?? null;
  if (!sense && senses.results.length > 0) {
    const decision = await matchSemanticSense(
      suggestion.canonicalForm,
      suggestion.chineseMeaning,
      event.raw_input,
      senses.results.map((candidate) => ({ id: candidate.id, chineseMeaning: candidate.chinese_meaning })),
    );
    if (decision.matchType === "existing") {
      sense = await findVocabularySense(database, item.id, decision.senseId);
    }
  }
  if (!sense) {
    sense = await createVocabularySense({
      database,
      vocabularyItemId: item.id,
      chineseMeaning: suggestion.chineseMeaning,
      now,
    });
  }
  if (!sense) throw new Error("Vocabulary sense could not be created.");

  const existingEncounter = await database.prepare(`SELECT id FROM encounters
    WHERE lookup_event_id = ? AND vocabulary_item_id = ? AND vocabulary_sense_id = ?
    LIMIT 1`)
    .bind(event.id, item.id, sense.id).first<{ id: string }>();

  if (!existingEncounter) {
    await createEncounter({
      database,
      vocabularyItemId: item.id,
      vocabularySenseId: sense.id,
      lookupEventId: event.id,
      encounteredForm: suggestion.encounteredForm,
      contextSentence: event.raw_input,
      sourceTitle: event.source_title,
      sourceUrl: event.source_url,
      encounteredAt: event.looked_up_at || now,
    });
  }

  return {
    saved: true as const,
    alreadySaved: Boolean(existingEncounter),
    itemId: item.id,
    senseId: sense.id,
    canonicalForm: item.canonical_form,
  };
}
