export type ManualSentenceSaveInput = {
  lookupEventId: string;
  encounteredForm: string;
  canonicalForm: string;
  chineseMeaning: string;
};

function nonEmptyString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function parseManualSentenceSaveInput(body: unknown): ManualSentenceSaveInput | null {
  if (!body || typeof body !== "object") return null;
  const row = body as Record<string, unknown>;
  const lookupEventId = nonEmptyString(row.lookupEventId);
  const encounteredForm = nonEmptyString(row.encounteredForm);
  const canonicalForm = nonEmptyString(row.canonicalForm);
  const chineseMeaning = nonEmptyString(row.chineseMeaning);
  if (!lookupEventId || !encounteredForm || !canonicalForm || !chineseMeaning) return null;
  return { lookupEventId, encounteredForm, canonicalForm, chineseMeaning };
}

export function expressionAppearsInSentence(encounteredForm: string, sentence: string) {
  const normalize = (value: string) => value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
  return normalize(sentence).includes(normalize(encounteredForm));
}
