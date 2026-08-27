import { logExternalAttempt, type TraceContext } from "./observability";
import { isRetryableHttpStatus, withRetry } from "./retry";
import { dictionaryRequestInit } from "./provider-timeout";

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

class DictionaryHttpError extends Error {
  status: number;

  constructor(status: number) {
    super(`Dictionary request failed (${status}).`);
    this.name = "DictionaryHttpError";
    this.status = status;
  }
}

export async function lookupEnglishWord(word: string, trace?: TraceContext | null): Promise<DictionaryLookup | null> {
  return withRetry(async ({ attempt, maxAttempts }) => {
    const startedAt = Date.now();
    try {
      const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, dictionaryRequestInit());
      if (response.status === 404) {
        logExternalAttempt({
          provider: "dictionaryapi.dev",
          operation: "lookup_word",
          attempt,
          maxAttempts,
          outcome: "success",
          durationMs: Date.now() - startedAt,
          status: 404,
          trace,
        });
        return null;
      }
      if (!response.ok) throw new DictionaryHttpError(response.status);

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

      logExternalAttempt({
        provider: "dictionaryapi.dev",
        operation: "lookup_word",
        attempt,
        maxAttempts,
        outcome: "success",
        durationMs: Date.now() - startedAt,
        status: response.status,
        trace,
      });

      if (senses.length === 0) return null;
      return {
        word: first.word?.trim() || word,
        phonetic: first.phonetic?.trim() || null,
        senses,
      };
    } catch (error) {
      const status = error instanceof DictionaryHttpError ? error.status : null;
      const willRetry = attempt < maxAttempts && (status === null || isRetryableHttpStatus(status));
      logExternalAttempt({
        provider: "dictionaryapi.dev",
        operation: "lookup_word",
        attempt,
        maxAttempts,
        outcome: "failure",
        durationMs: Date.now() - startedAt,
        status,
        willRetry,
        errorName: error instanceof Error ? error.name : "UnknownError",
        trace,
      });
      throw error;
    }
  }, {
    maxAttempts: 1,
    shouldRetry: () => false,
  });
}
