import { lookupEnglishWord, type DictionaryLookup } from "./dictionary";
import { generateChineseDefinition, renderDictionaryMeaningInChinese } from "./translation";
import type { LookupInputType } from "./lookup-history";
import type { TraceContext } from "./observability";

export type VocabularyMeaningResult = {
  chineseMeaning: string;
  provider: "dictionary+gemini" | "gemini";
  dictionary: DictionaryLookup | null;
};

export async function getVocabularyMeaning(
  input: string,
  inputType: LookupInputType,
  context: string | null,
  trace?: TraceContext | null,
): Promise<VocabularyMeaningResult> {
  if (inputType === "word") {
    try {
      const dictionary = await lookupEnglishWord(input.trim(), trace);
      if (dictionary) {
        const chineseMeaning = await renderDictionaryMeaningInChinese(input, dictionary, context, trace);
        return { chineseMeaning, provider: "dictionary+gemini", dictionary };
      }
    } catch (error) {
      console.error("Dictionary lookup failed; falling back to Gemini", error);
    }
  }

  const chineseMeaning = await generateChineseDefinition(input, context, trace);
  return { chineseMeaning, provider: "gemini", dictionary: null };
}
