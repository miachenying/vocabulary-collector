export type InputType = "sentence" | "vocabulary";

export function normalizeTerm(input: string) {
  return input
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/[.,!?;:]+$/g, "");
}

export function classifyInput(input: string): InputType {
  const trimmed = input.trim();
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  return /[.!?;]\s*$/.test(trimmed) || wordCount >= 6 ? "sentence" : "vocabulary";
}

export function nullableString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}
