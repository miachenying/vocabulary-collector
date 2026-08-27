const SENTENCE_END = /[.!?。！？]/;

export function extractFocusedContext(rawText, rawSelection, maxLength = 700) {
  const text = rawText.replace(/\s+/g, " ").trim();
  const selection = rawSelection.replace(/\s+/g, " ").trim();
  if (!text || !selection) return "";
  const index = text.toLocaleLowerCase().indexOf(selection.toLocaleLowerCase());
  if (index < 0) return selection.slice(0, maxLength);

  let start = index;
  while (start > 0 && !SENTENCE_END.test(text[start - 1])) start -= 1;
  while (start < index && /\s/.test(text[start])) start += 1;

  let end = index + selection.length;
  while (end < text.length && !SENTENCE_END.test(text[end])) end += 1;
  if (end < text.length) end += 1;

  const focused = text.slice(start, end).trim();
  if (focused.length <= maxLength) return focused;
  const relativeIndex = index - start;
  const windowStart = Math.max(0, Math.min(relativeIndex - 220, focused.length - maxLength));
  return focused.slice(windowStart, windowStart + maxLength).trim();
}
