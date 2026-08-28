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

export function safariCaptureScript(origin: string) {
  const lookupUrl = `${origin.replace(/\/$/, "")}/`;
  const noSelectionUrl = `${lookupUrl}?share=1&captureError=no-selection`;

  return `const selection = window.getSelection();
const term = selection ? selection.toString().trim() : "";

if (!term) {
  completion(${JSON.stringify(noSelectionUrl)});
} else {
  const range = selection.getRangeAt(0);
  const commonNode = range.commonAncestorContainer;
  const commonElement = commonNode.nodeType === Node.ELEMENT_NODE
    ? commonNode
    : commonNode.parentElement;
  const container = commonElement?.closest("p, li, blockquote, h1, h2, h3, h4, h5, h6") || document.body;
  const blockText = (container.innerText || container.textContent || term).trim();
  let selectedIndex = blockText.toLocaleLowerCase("en-US").indexOf(term.toLocaleLowerCase("en-US"));

  try {
    const beforeSelection = document.createRange();
    beforeSelection.selectNodeContents(container);
    beforeSelection.setEnd(range.startContainer, range.startOffset);
    selectedIndex = beforeSelection.toString().length;
  } catch (error) {
    // Fall back to the first matching term in the nearest text block.
  }

  if (selectedIndex < 0) selectedIndex = 0;
  const boundary = /[.!?。！？\\n]/;
  let sentenceStart = selectedIndex;
  while (sentenceStart > 0 && !boundary.test(blockText[sentenceStart - 1])) sentenceStart -= 1;
  while (sentenceStart < selectedIndex && /\\s/.test(blockText[sentenceStart])) sentenceStart += 1;
  let sentenceEnd = Math.min(blockText.length, selectedIndex + term.length);
  while (sentenceEnd < blockText.length && !boundary.test(blockText[sentenceEnd])) sentenceEnd += 1;
  if (sentenceEnd < blockText.length) sentenceEnd += 1;

  const context = blockText.slice(sentenceStart, sentenceEnd).trim().slice(0, 5000);
  const pageTitle = (
    document.querySelector('meta[property="og:title"]')?.content ||
    document.title ||
    ""
  ).trim().slice(0, 500);
  const target = new URL(${JSON.stringify(lookupUrl)});
  target.searchParams.set("share", "1");
  target.searchParams.set("term", term.slice(0, 2000));
  if (context) target.searchParams.set("context", context);
  if (pageTitle) target.searchParams.set("sourceTitle", pageTitle);
  target.searchParams.set("sourceUrl", window.location.href.slice(0, 2000));
  completion(target.toString());
}`;
}
