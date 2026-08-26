import { generateLanguageJson } from "./language-judgment";
import { getVocabularyMeaning } from "./meaning-provider";
import { logRequestStage, type TraceContext } from "./observability";
import { expressionsFromPayload, type ExtractedExpression } from "./sentence-expressions";
import { enrichSentenceExpressionsWith, type EnrichedSentenceExpression } from "./sentence-enrichment";

export type { ExtractedExpression } from "./sentence-expressions";
export type { EnrichedSentenceExpression } from "./sentence-enrichment";

export type SentenceExtractionResult = {
  expressions: ExtractedExpression[];
  status: "success" | "failed";
};

export async function extractSentenceExpressions(
  sentence: string,
  trace?: TraceContext | null,
): Promise<SentenceExtractionResult> {
  const prompt = `Task: Select up to 3 useful reusable English expressions from the sentence for a personal vocabulary collector.\n
Sentence: ${sentence}\n
Selection criteria:\n- Prefer idioms, fixed expressions, phrasal verbs, or concise contextually meaningful reusable expressions.\n- Avoid ordinary collocations, basic words, random noun phrases, and expressions that are only mildly advanced.\n- Returning zero expressions is correct when nothing is worth saving.\n- Every encountered_form must appear verbatim in the sentence.\n- canonical_form should be a concise reusable dictionary-style form; normalize tense/inflection/pronouns when useful.\n- Never return more than 3 expressions.\n
Return exactly this shape:\n{"expressions":[{"encountered_form":"...","canonical_form":"...","reason":"idiom|phrasal_verb|fixed_expression|contextual_expression"}]}`;

  const startedAt = Date.now();
  try {
    const expressions = expressionsFromPayload(await generateLanguageJson(prompt, 420, trace), sentence);
    if (trace) {
      logRequestStage({
        trace,
        stage: "sentence_expression_extraction",
        outcome: "success",
        durationMs: Date.now() - startedAt,
        inputType: "sentence",
        provider: "gemini",
      });
    }
    return { expressions, status: "success" };
  } catch (error) {
    console.error("Sentence expression extraction failed; returning no suggestions", error);
    if (trace) {
      logRequestStage({
        trace,
        stage: "sentence_expression_extraction",
        outcome: "failure",
        durationMs: Date.now() - startedAt,
        inputType: "sentence",
        provider: "gemini",
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }
    return { expressions: [], status: "failed" };
  }
}

export async function enrichSentenceExpressions(
  sentence: string,
  expressions: ExtractedExpression[],
  trace?: TraceContext | null,
): Promise<EnrichedSentenceExpression[]> {
  return enrichSentenceExpressionsWith(expressions, sentence, async (expression, originalSentence) => {
    const inputType = /\s/.test(expression.canonicalForm.trim()) ? "phrase" : "word";
    const meaning = await getVocabularyMeaning(expression.canonicalForm, inputType, originalSentence, trace);
    return meaning.chineseMeaning;
  });
}
