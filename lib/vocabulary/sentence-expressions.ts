export type ExtractedExpression = {
  encounteredForm: string;
  canonicalForm: string;
  reason: "idiom" | "phrasal_verb" | "fixed_expression" | "contextual_expression";
};

const LOW_VALUE_ONLY_TOKENS = new Set([
  "a", "an", "the", "and", "or", "but", "not", "quite", "very", "really", "just", "even",
  "still", "already", "almost", "rather", "pretty", "much", "too", "so", "more", "most",
]);

function normalizeForMatch(value: string) {
  return value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

function isReason(value: unknown): value is ExtractedExpression["reason"] {
  return value === "idiom"
    || value === "phrasal_verb"
    || value === "fixed_expression"
    || value === "contextual_expression";
}

function isLowValueOnlyExpression(value: string) {
  const tokens = normalizeForMatch(value).match(/[a-z']+/g) ?? [];
  return tokens.length > 0 && tokens.every((token) => LOW_VALUE_ONLY_TOKENS.has(token));
}

export function expressionsFromPayload(payload: unknown, sentence: string): ExtractedExpression[] {
  const parsed = payload as { expressions?: unknown } | null;
  if (!parsed || !Array.isArray(parsed.expressions)) return [];

  const normalizedSentence = normalizeForMatch(sentence);
  const output: ExtractedExpression[] = [];
  const seen = new Set<string>();

  for (const candidate of parsed.expressions) {
    if (output.length >= 3) break;
    if (!candidate || typeof candidate !== "object") continue;
    const row = candidate as Record<string, unknown>;
    const encounteredForm = typeof row.encountered_form === "string" ? row.encountered_form.trim() : "";
    const canonicalForm = typeof row.canonical_form === "string" ? row.canonical_form.trim() : "";
    if (!encounteredForm || !canonicalForm || !isReason(row.reason)) continue;

    const encounteredNormalized = normalizeForMatch(encounteredForm);
    if (!normalizedSentence.includes(encounteredNormalized)) continue;
    if (isLowValueOnlyExpression(canonicalForm)) continue;

    const canonicalKey = canonicalForm.toLocaleLowerCase("en-US");
    if (seen.has(canonicalKey)) continue;

    seen.add(canonicalKey);
    output.push({ encounteredForm, canonicalForm, reason: row.reason });
  }

  return output;
}
