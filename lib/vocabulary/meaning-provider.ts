import { lookupEnglishWord, type DictionaryLookup } from "./dictionary";
import { generateChineseDefinition, renderDictionaryMeaningInChinese } from "./translation";
import type { LookupInputType } from "./lookup-history";

export type VocabularyMeaningResult = {
  chineseMeaning: string;
  provider: "dictionary+gemini" | "gemini";
  dictionary: DictionaryLookup | null;
};

export async function getVocabularyMeaning(
  input: string,
  inputType: LookupInputType,
  context: string | null,
): Promise<VocabularyMeaningResult> {
  if (inputType === "word") {
    try {
      const dictionary = await lookupEnglishWord(input.trim());
      if (dictionary) {
        const chineseMeaning = await renderDictionaryMeaningInChinese(input, dictionary, context);
        return { chineseMeaning, provider: "dictionary+gemini", dictionary };
      }
    } catch (error) {
      console.error("Dictionary lookup failed; falling back to Gemini", error);
    }
  }

  const chineseMeaning = await generateChineseDefinition(input, context);
  return { chineseMeaning, provider: "gemini", dictionary: null };
}
