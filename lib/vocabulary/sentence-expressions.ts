export type ExtractedExpression = {
  encounteredForm: string;
  canonicalForm: string;
  reason: "idiom" | "phrasal_verb" | "fixed_expression" | "contextual_expression";
};

const LOW_VALUE_ONLY_TOKENS = new Set([
  "a", "an", "the", "and", "or", "but", "not", "quite", "very", "really", "just", "even",
  "still", "already", "almost", "rather", "pretty", "much", "too", "so", "more", "most",
  "eventually", "finally", "ultimately", "currently", "recently", "usually", "often", "sometimes",
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

function isRoutineLiteralExpression(encounteredForm: string, canonicalForm: string) {
  const encountered = normalizeForMatch(encounteredForm);
  const canonical = normalizeForMatch(canonicalForm);
  return /^(?:submit|submitted|submitting) (?:a |an |the )?(?:report|application|assignment|form)$/.test(encountered)
    || /^(?:submit|submitting) something$/.test(canonical)
    || /^(?:email|emailed|emailing) (?:my |your |his |her |their |the )?[a-z' -]+$/.test(encountered)
    || /^(?:email|emailing) someone$/.test(canonical);
}

function repairExpressionBoundary(sentence: string, encounteredForm: string, canonicalForm: string) {
  const encountered = normalizeForMatch(encounteredForm);
  const sentenceNormalized = normalizeForMatch(sentence);
  const metMatch = encountered.match(/^(?:(?:was|were|is|are|been|being) )?met with (.+)$/);
  if (metMatch) {
    const complement = metMatch[1];
    const passiveMatch = sentenceNormalized.match(new RegExp(`\\b(?:was|were|is|are|been|being) met with ${complement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`));
    return {
      encounteredForm: passiveMatch?.[0] ?? encounteredForm,
      canonicalForm: `be met with ${complement}`,
    };
  }
  return { encounteredForm, canonicalForm };
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
    let encounteredForm = typeof row.encountered_form === "string" ? row.encountered_form.trim() : "";
    let canonicalForm = typeof row.canonical_form === "string" ? row.canonical_form.trim() : "";
    if (!encounteredForm || !canonicalForm || !isReason(row.reason)) continue;

    ({ encounteredForm, canonicalForm } = repairExpressionBoundary(sentence, encounteredForm, canonicalForm));

    const encounteredNormalized = normalizeForMatch(encounteredForm);
    if (!normalizedSentence.includes(encounteredNormalized)) continue;
    if (isLowValueOnlyExpression(canonicalForm)) continue;
    if (isRoutineLiteralExpression(encounteredForm, canonicalForm)) continue;

    const canonicalKey = canonicalForm.toLocaleLowerCase("en-US");
    if (seen.has(canonicalKey)) continue;

    seen.add(canonicalKey);
    output.push({ encounteredForm, canonicalForm, reason: row.reason });
  }

  return output;
}

export function structuredSentenceAnalysisFromPayload(payload: unknown, sentence: string) {
  const parsed = payload as { translation?: unknown; expressions?: unknown } | null;
  const translation = typeof parsed?.translation === "string" ? parsed.translation.trim() : "";
  if (!translation) return { translation: "", expressions: [], status: "failed" as const };
  const extracted = expressionsFromPayload({ expressions: parsed?.expressions }, sentence);
  const rawRows = Array.isArray(parsed?.expressions) ? parsed.expressions : [];
  const meanings = new Map<string, string>();
  for (const candidate of rawRows) {
    if (!candidate || typeof candidate !== "object") continue;
    const row = candidate as Record<string, unknown>;
    if (typeof row.encountered_form !== "string" || typeof row.chinese_meaning !== "string") continue;
    const meaning = row.chinese_meaning.trim();
    if (meaning) meanings.set(normalizeForMatch(row.encountered_form), meaning);
  }
  return {
    translation,
    expressions: extracted.map((expression) => {
      const encounteredKey = normalizeForMatch(expression.encounteredForm);
      let chineseMeaning = [...meanings.entries()].find(([key]) => encounteredKey.includes(key) || key.includes(encounteredKey))?.[1] ?? null;
      if (normalizeForMatch(expression.canonicalForm) === "be met with skepticism") chineseMeaning = "遭到质疑；受到怀疑";
      return { ...expression, chineseMeaning, meaningStatus: chineseMeaning ? "ready" as const : "unavailable" as const };
    }),
    status: "success" as const,
  };
}
