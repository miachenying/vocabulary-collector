const SITE_ORIGIN = "https://vocabulary-collector.miachenying.chatgpt.site";
const MENU_ID = "vocabulary-collector-lookup";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: MENU_ID, title: "Look up “%s” in Vocabulary Collector", contexts: ["selection"] });
});

async function selectionCapture(tab, selectionText) {
  let context = "";
  if (tab?.id) {
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const selection = window.getSelection();
          const selected = selection?.toString().trim() ?? "";
          const container = selection?.rangeCount ? selection.getRangeAt(0).commonAncestorContainer : null;
          const text = (container?.nodeType === Node.TEXT_NODE ? container.parentElement?.innerText : container?.textContent) ?? "";
          if (!selected || !text) return "";
          const normalized = text.replace(/\s+/g, " ").trim();
          const index = normalized.toLocaleLowerCase().indexOf(selected.toLocaleLowerCase());
          if (index < 0) return normalized.slice(0, 500);
          const before = normalized.lastIndexOf(". ", index);
          const after = normalized.indexOf(". ", index + selected.length);
          return normalized.slice(before < 0 ? Math.max(0, index - 180) : before + 2, after < 0 ? Math.min(normalized.length, index + selected.length + 180) : after + 1).slice(0, 700);
        },
      });
      context = result ?? "";
    } catch {
      // Restricted pages still work without surrounding context.
    }
  }

  const query = new URLSearchParams({
    capture: "1",
    term: selectionText.trim(),
    sourceTitle: tab?.title ?? "Web page",
    sourceUrl: tab?.url ?? "",
  });
  if (context && context !== selectionText.trim()) query.set("context", context);
  await chrome.windows.create({ url: `${SITE_ORIGIN}/?${query}`, type: "popup", width: 560, height: 760 });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID && info.selectionText) void selectionCapture(tab, info.selectionText);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "capture-selection") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.getSelection()?.toString().trim() ?? "" }).catch(() => [{ result: "" }]);
  if (result) await selectionCapture(tab, result);
});
