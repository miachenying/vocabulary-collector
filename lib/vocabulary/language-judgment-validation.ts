export function canonicalFormFromPayload(payload: unknown, fallback: string) {
  const parsed = payload as { canonical_form?: unknown } | null;
  const canonical = parsed && typeof parsed.canonical_form === "string"
    ? parsed.canonical_form.trim()
    : "";
  return canonical || fallback;
}

export type SenseMatchDecision =
  | { matchType: "existing"; senseId: string }
  | { matchType: "new"; senseId: null };

export type ExistingSense = {
  id: string;
  chineseMeaning: string;
};

export function senseMatchFromPayload(payload: unknown, existingSenses: ExistingSense[]): SenseMatchDecision {
  const parsed = payload as { match_type?: unknown; sense_id?: unknown } | null;
  if (parsed?.match_type === "existing" && typeof parsed.sense_id === "string") {
    const valid = existingSenses.some((sense) => sense.id === parsed.sense_id);
    if (valid) return { matchType: "existing", senseId: parsed.sense_id };
  }
  return { matchType: "new", senseId: null };
}
