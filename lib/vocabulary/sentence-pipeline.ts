import { generateLanguageJson } from "./language-judgment";

export type ExtractedExpression = {
  encounteredForm: string;
  canonicalForm: string;
  reason: "idiom" | "phrasal_verb" | "fixed_expression" | "contextual_expression";
};

function normalizeForMatch(value: string) {
  return value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

function isReason(value: unknown): value is ExtractedExpression["reason"] {
  return value === "idiom"
    || value === "phrasal_verb"
    || value === "fixed_expression"
    || value === "contextual_expression";
}

export function expressionsFromPayload(payload: unknown, sentence: string): ExtractedExpression[] {
  const parsed = payload as { expressions?: unknown } | null;
  if (!parsed || !Array.isArray(parsed.expressions)) return [];

  const normalizedSentence = normalizeForMatch(sentence);
  const output: ExtractedExpression[] = [];
  const seen = new Set<string>();

  for (const candidate of parsed.expressions) {
    if (output.length >= 3 || !candidate || typeof candidate !== "object") break;
    const row = candidate as Record<string, unknown>;
    const encounteredForm = typeof row.encountered_form === "string" ? row.encountered_form.trim() : "";
    const canonicalForm = typeof row.canonical_form === "string" ? row.canonical_form.trim() : "";
    if (!encounteredForm || !canonicalForm || !isReason(row.reason)) continue;

    const encounteredNormalized = normalizeForMatch(encounteredForm);
    if (!normalizedSentence.includes(encounteredNormalized)) continue;
    if (seen.has(canonicalForm.toLocaleLowerCase("en-US"))) continue;

    seen.add(canonicalForm.toLocaleLowerCase("en-US"));
    output.push({ encounteredForm, canonicalForm, reason: row.reason });
  }

  return output;
}

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
