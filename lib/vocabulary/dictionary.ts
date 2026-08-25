export type DictionarySense = {
  partOfSpeech: string | null;
  definition: string;
  example: string | null;
};

export type DictionaryLookup = {
  word: string;
  phonetic: string | null;
  senses: DictionarySense[];
};

type DictionaryApiEntry = {
  word?: string;
  phonetic?: string;
  meanings?: Array<{
    partOfSpeech?: string;
    definitions?: Array<{
      definition?: string;
      example?: string;
    }>;
  }>;
};

export async function lookupEnglishWord(word: string): Promise<DictionaryLookup | null> {
  const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Dictionary request failed (${response.status}).`);

  const payload = await response.json() as DictionaryApiEntry[];
  const first = payload[0];
  if (!first) return null;

  const senses = (first.meanings ?? []).flatMap((meaning) =>
    (meaning.definitions ?? [])
      .filter((item) => typeof item.definition === "string" && item.definition.trim())
      .slice(0, 3)
      .map((item) => ({
        partOfSpeech: meaning.partOfSpeech?.trim() || null,
        definition: item.definition!.trim(),
        example: item.example?.trim() || null,
      })),
  ).slice(0, 8);

  if (senses.length === 0) return null;
  return {
    word: first.word?.trim() || word,
    phonetic: first.phonetic?.trim() || null,
    senses,
  };
}
