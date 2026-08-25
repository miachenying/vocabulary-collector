import { createEncounter } from "./encounters";
import { findOrCreateVocabularyItem } from "./items";
import { createLookupEventV2, updateLookupEventStatus, type LookupInputType } from "./lookup-history";
import { createVocabularySense, listVocabularySenses } from "./senses";
import type { Db } from "./database";

type LookupMetadata = {
  database: Db;
  userId: string;
  rawInput: string;
  inputType: LookupInputType;
  contextSentence: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
  lookedUpAt: string;
};

export async function startV2Lookup(input: LookupMetadata) {
  const event = await createLookupEventV2({
    ...input,
    status: "partial",
  });
  return event?.id ?? null;
}

type CompleteV2LookupInput = LookupMetadata & {
  lookupEventId: string;
  canonicalForm: string;
  chineseMeaning: string;
};

function sameStoredMeaning(left: string, right: string) {
  return left.trim() === right.trim();
}

export async function completeV2Lookup(input: CompleteV2LookupInput) {
  const {
    database,
    userId,
    rawInput,
    inputType,
    contextSentence,
    sourceTitle,
    sourceUrl,
    lookedUpAt,
    lookupEventId,
    canonicalForm,
    chineseMeaning,
  } = input;

  if (inputType === "sentence") {
    await updateLookupEventStatus(database, userId, lookupEventId, "success");
    return;
  }

  try {
    const item = await findOrCreateVocabularyItem({
      database,
      userId,
      canonicalForm,
      itemType: inputType,
      now: lookedUpAt,
    });
    if (!item) throw new Error("Vocabulary item could not be created.");

    // Milestone 2 compatibility rule: reuse an exact stored Chinese meaning.
    // Semantic-equivalence matching remains an application/LLM responsibility
    // and will replace this conservative fallback in the later vocabulary pipeline.
    const senses = await listVocabularySenses(database, item.id);
    let sense = senses.results.find((candidate) => sameStoredMeaning(candidate.chinese_meaning, chineseMeaning)) ?? null;
    if (!sense) {
      sense = await createVocabularySense({
        database,
        vocabularyItemId: item.id,
        chineseMeaning,
        now: lookedUpAt,
      });
    }
    if (!sense) throw new Error("Vocabulary sense could not be created.");

    await createEncounter({
      database,
      vocabularyItemId: item.id,
      vocabularySenseId: sense.id,
      lookupEventId,
      encounteredForm: rawInput,
      contextSentence,
      sourceTitle,
      sourceUrl,
      encounteredAt: lookedUpAt,
    });

    await updateLookupEventStatus(database, userId, lookupEventId, "success");
  } catch (error) {
    await updateLookupEventStatus(database, userId, lookupEventId, "partial");
    throw error;
  }
}

export async function failV2Lookup(database: Db, userId: string, lookupEventId: string) {
  await updateLookupEventStatus(database, userId, lookupEventId, "failed");
}
