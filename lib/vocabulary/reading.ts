const SENTENCE_BOUNDARY = /[.!?。！？\n]/;

export function sentenceAroundSelection(text: string, selectedText: string) {
  const source = text.trim();
  const selected = selectedText.trim();
  if (!source || !selected) return source;
  const index = source.toLocaleLowerCase("en-US").indexOf(selected.toLocaleLowerCase("en-US"));
  if (index < 0) return source.slice(0, 500);

  let start = index;
  while (start > 0 && !SENTENCE_BOUNDARY.test(source[start - 1])) start -= 1;
  while (start < index && /\s/.test(source[start])) start += 1;

  let end = index + selected.length;
  while (end < source.length && !SENTENCE_BOUNDARY.test(source[end])) end += 1;
  if (end < source.length) end += 1;
  return source.slice(start, end).trim().slice(0, 1000);
}

export function shareShortcutBaseUrl(origin: string) {
  return `${origin.replace(/\/$/, "")}/?share=1&term=`;
}
