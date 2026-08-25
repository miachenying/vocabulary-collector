import { generateLanguageJson } from "./language-judgment";
import { expressionsFromPayload, type ExtractedExpression } from "./sentence-expressions";

export type { ExtractedExpression } from "./sentence-expressions";

export async function extractSentenceExpressions(sentence: string): Promise<ExtractedExpression[]> {
  const prompt = `Task: Select up to 3 useful reusable English expressions from the sentence for a personal vocabulary collector.\n
Sentence: ${sentence}\n
Selection criteria:\n- Prefer idioms, fixed expressions, phrasal verbs, or concise contextually meaningful reusable expressions.\n- Avoid ordinary collocations, basic words, random noun phrases, and expressions that are only mildly advanced.\n- Returning zero expressions is correct when nothing is worth saving.\n- Every encountered_form must appear verbatim in the sentence.\n- canonical_form should be a concise reusable dictionary-style form; normalize tense/inflection/pronouns when useful.\n- Never return more than 3 expressions.\n
Return exactly this shape:\n{"expressions":[{"encountered_form":"...","canonical_form":"...","reason":"idiom|phrasal_verb|fixed_expression|contextual_expression"}]}`;

  try {
    return expressionsFromPayload(await generateLanguageJson(prompt, 420), sentence);
  } catch (error) {
    console.error("Sentence expression extraction failed; returning no suggestions", error);
    return [];
  }
}
