"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { safariCaptureScript, sentenceAroundSelection } from "@/lib/vocabulary/reading";

type Entry = {
  id: string;
  displayTerm: string;
  chineseDefinition: string | null;
  contextSentence: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
  note: string | null;
  lookupCount: number;
  firstLookedUpAt: string;
  lastLookedUpAt: string;
  periodLookupCount: number;
  periodFirstLookup: string;
  periodLastLookup: string;
  lastEventId: string | null;
  inputType: "vocabulary" | "sentence";
};

type SentenceExpression = {
  encounteredForm: string;
  canonicalForm: string;
  reason: "idiom" | "phrasal_verb" | "fixed_expression" | "contextual_expression";
  chineseMeaning: string | null;
  meaningStatus: "ready" | "unavailable";
};

type SentenceAnalysis = {
  lookupEventId: string | null;
  translation: string;
  expressions: SentenceExpression[];
  status?: "ready" | "degraded";
};

type DictionaryPreview = {
  word: string;
  phonetic: string | null;
  senses: Array<{ partOfSpeech: string | null; definition: string; example: string | null }>;
};

type CollectionItem = {
  id: string;
  canonicalForm: string;
  itemType: "word" | "phrase";
  createdAt: string;
  chineseMeaning: string;
  encounteredForm: string;
  contextSentence: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
  note: string | null;
  encounteredAt: string;
  encounterCount: number;
  encounters: Array<{
    id: string;
    encounteredForm: string;
    contextSentence: string | null;
    sourceTitle: string | null;
    sourceUrl: string | null;
    note: string | null;
    encounteredAt: string;
  }>;
};

type HistoryResponse = {
  entries: Entry[];
  stats: { newWords: number; repeatedWords: number; totalLookups: number };
};

const emptyHistory: HistoryResponse = {
  entries: [],
  stats: { newWords: 0, repeatedWords: 0, totalLookups: 0 },
};

function dateInputValue(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function rangeFor(kind: "today" | "week" | "month") {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (kind === "week") {
    const mondayOffset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - mondayOffset);
  }
  if (kind === "month") start.setDate(1);
  return { start: dateInputValue(start), end: dateInputValue(now) };
}

function toIsoBounds(start: string, end: string) {
  return {
    start: new Date(`${start}T00:00:00`).toISOString(),
    end: new Date(`${end}T23:59:59.999`).toISOString(),
  };
}

export default function Home() {
  const today = rangeFor("today");
  const [view, setView] = useState<"lookup" | "reading" | "collection" | "history">("lookup");
  const [term, setTerm] = useState("");
  const [context, setContext] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [note, setNote] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Entry | null>(null);
  const [sentenceAnalysis, setSentenceAnalysis] = useState<SentenceAnalysis | null>(null);
  const [savingCanonical, setSavingCanonical] = useState<string | null>(null);
  const [savedCanonicalForms, setSavedCanonicalForms] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [range, setRange] = useState(today);
  const [history, setHistory] = useState<HistoryResponse>(emptyHistory);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyType, setHistoryType] = useState<"all" | "vocabulary" | "sentence">("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "az" | "most">("newest");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [collection, setCollection] = useState<CollectionItem[]>([]);
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [expandedCollectionIds, setExpandedCollectionIds] = useState<string[]>([]);
  const [deletingEncounterId, setDeletingEncounterId] = useState<string | null>(null);
  const [capturedFromPage, setCapturedFromPage] = useState(false);
  const [dictionaryPreview, setDictionaryPreview] = useState<DictionaryPreview | null>(null);
  const [readerDraft, setReaderDraft] = useState("");
  const [readerTitle, setReaderTitle] = useState("");
  const [readerUrl, setReaderUrl] = useState("");
  const [readerActive, setReaderActive] = useState(false);
  const [readerSelection, setReaderSelection] = useState<{ term: string; context: string; top: number; left: number } | null>(null);
  const [readerResult, setReaderResult] = useState<Entry | null>(null);
  const [readerPreview, setReaderPreview] = useState<DictionaryPreview | null>(null);
  const [readerLoading, setReaderLoading] = useState(false);
  const [readerMessage, setReaderMessage] = useState<string | null>(null);
  const [shareHelpOpen, setShareHelpOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const readerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const capturedTerm = params.get("term")?.trim();
    if (params.get("captureError") === "no-selection") {
      const timer = window.setTimeout(() => {
        setCapturedFromPage(true);
        setMessage("No selected text was found. Return to Safari, select a word, then run the shortcut again.");
      }, 0);
      return () => window.clearTimeout(timer);
    }
    if (!capturedTerm) return;
    const timer = window.setTimeout(() => {
      setTerm(capturedTerm.slice(0, 2000));
      setContext((params.get("context") ?? "").slice(0, 5000));
      setSourceTitle((params.get("sourceTitle") ?? "").slice(0, 500));
      setSourceUrl((params.get("sourceUrl") ?? "").slice(0, 2000));
      setDetailsOpen(Boolean(params.get("context") || params.get("sourceTitle") || params.get("sourceUrl")));
      setCapturedFromPage(params.get("capture") === "1");
      if (params.get("share") === "1") setCapturedFromPage(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function redirectToSignIn(response: Response, payload: { code?: string }) {
    if (response.status !== 401 || payload.code !== "authentication_required") return false;
    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.assign(`/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`);
    return true;
  }

  const readerParagraphs = useMemo(() => readerDraft.trim().split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean), [readerDraft]);

  function captureReaderSelection() {
    window.setTimeout(() => {
      const selection = window.getSelection();
      const selectedText = selection?.toString().trim() ?? "";
      if (!selection || selection.isCollapsed || !selectedText || selectedText.length > 200) {
        setReaderSelection(null);
        return;
      }
      const anchor = selection.anchorNode;
      const focus = selection.focusNode;
      if (!anchor || !focus || !readerRef.current?.contains(anchor) || !readerRef.current.contains(focus)) return;
      const paragraph = anchor.nodeType === Node.TEXT_NODE ? anchor.parentElement?.closest("p") : (anchor as Element).closest?.("p");
      const paragraphText = paragraph?.textContent?.trim() || readerDraft;
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      setReaderSelection({
        term: selectedText,
        context: sentenceAroundSelection(paragraphText, selectedText),
        top: Math.max(76, rect.top - 54),
        left: Math.min(window.innerWidth - 86, Math.max(12, rect.left + rect.width / 2 - 40)),
      });
    }, 20);
  }

  async function lookupReaderSelection() {
    if (!readerSelection || readerLoading) return;
    const selected = readerSelection;
    setReaderLoading(true);
    setReaderResult(null);
    setReaderPreview(null);
    setReaderMessage(null);
    setReaderSelection(null);
    window.getSelection()?.removeAllRanges();
    try {
      void fetch("/api/lookups/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ term: selected.term }),
      }).then(async (response) => {
        const payload = await response.json() as { preview?: DictionaryPreview | null };
        if (response.ok && payload.preview) setReaderPreview(payload.preview);
      }).catch(() => undefined);

      const response = await fetch("/api/lookups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          term: selected.term,
          context: selected.context,
          sourceTitle: readerTitle || "Reading View",
          sourceUrl: readerUrl || null,
        }),
      });
      const payload = await response.json();
      if (redirectToSignIn(response, payload)) return;
      if (!response.ok && !payload.entry) throw new Error(payload.error || "Lookup failed");
      setReaderResult(payload.entry);
      if (payload.warning) setReaderMessage(payload.warning);
    } catch {
      setReaderMessage("This selection could not be looked up. Please try again.");
    } finally {
      setReaderLoading(false);
    }
  }

  async function copySafariScript() {
    try {
      await navigator.clipboard.writeText(safariCaptureScript(window.location.origin));
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 1800);
    } catch {
      setReaderMessage("The Safari capture script could not be copied. Please try again.");
    }
  }

  async function loadCollection() {
    setCollectionLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/collection");
      const payload = await response.json() as { items?: CollectionItem[]; code?: string };
      if (redirectToSignIn(response, payload)) return;
      if (!response.ok) throw new Error("Could not load collection");
      setCollection(payload.items ?? []);
    } catch {
      setMessage("Collection is temporarily unavailable. Please try again.");
    } finally {
      setCollectionLoading(false);
    }
  }

  function openCollection() {
    setView("collection");
    void loadCollection();
  }

  function toggleCollectionItem(itemId: string) {
    setExpandedCollectionIds((current) => current.includes(itemId)
      ? current.filter((id) => id !== itemId)
      : [...current, itemId]);
  }

  async function deleteEncounter(encounterId: string) {
    if (deletingEncounterId) return;
    setDeletingEncounterId(encounterId);
    setMessage(null);
    try {
      const response = await fetch("/api/collection", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ encounterId }),
      });
      const payload = await response.json();
      if (redirectToSignIn(response, payload)) return;
      if (!response.ok) throw new Error(payload.error || "Delete failed");
      await loadCollection();
    } catch {
      setMessage("This encounter could not be deleted. Please try again.");
    } finally {
      setDeletingEncounterId(null);
    }
  }

  async function loadHistory(nextRange = range) {
    setHistoryLoading(true);
    try {
      const bounds = toIsoBounds(nextRange.start, nextRange.end);
      const qs = new URLSearchParams(bounds);
      const response = await fetch(`/api/lookups?${qs}`);
      const payload = await response.json();
      if (redirectToSignIn(response, payload)) return;
      if (!response.ok) throw new Error("Could not load history");
      setHistory(payload);
    } catch {
      setMessage("History is temporarily unavailable. Please try again.");
    } finally {
      setHistoryLoading(false);
    }
  }

  function openHistory() {
    setView("history");
    void loadHistory();
  }

  async function lookup(event: FormEvent) {
    event.preventDefault();
    if (!term.trim() || loading) return;
    setLoading(true);
    setMessage(null);
    setResult(null);
    setSentenceAnalysis(null);
    setDictionaryPreview(null);
    setSavedCanonicalForms([]);
    setSavingCanonical(null);
    try {
      const lookupTerm = term;
      void fetch("/api/lookups/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ term: lookupTerm }),
      }).then(async (previewResponse) => {
        const previewPayload = await previewResponse.json() as { preview?: DictionaryPreview | null };
        if (previewResponse.ok && previewPayload.preview) setDictionaryPreview(previewPayload.preview);
      }).catch(() => undefined);

      const response = await fetch("/api/lookups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ term, context, sourceTitle, sourceUrl, note }),
      });
      const payload = await response.json();
      if (redirectToSignIn(response, payload)) return;
      if (!response.ok && !payload.entry) throw new Error(payload.error || "Lookup failed");
      setResult(payload.entry);
      setSentenceAnalysis(payload.sentenceAnalysis ?? null);
      if (payload.warning) setMessage(payload.warning);
      setTerm("");
    } catch {
      setMessage("This lookup could not be completed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function pasteAndFocus() {
    try {
      const pasted = (await navigator.clipboard.readText()).trim();
      if (!pasted) {
        setMessage("Your clipboard is empty.");
        return;
      }
      setTerm(pasted.slice(0, 2000));
      setMessage(null);
      document.querySelector<HTMLInputElement>("#term")?.focus();
    } catch {
      setMessage("Press and hold in the lookup box, then choose Paste.");
      document.querySelector<HTMLInputElement>("#term")?.focus();
    }
  }

  async function saveSentenceExpression(expression: SentenceExpression) {
    if (!sentenceAnalysis?.lookupEventId || !expression.chineseMeaning || savingCanonical) return;
    setSavingCanonical(expression.canonicalForm);
    setMessage(null);
    try {
      const response = await fetch("/api/collection", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lookupEventId: sentenceAnalysis.lookupEventId,
          encounteredForm: expression.encounteredForm,
          canonicalForm: expression.canonicalForm,
          chineseMeaning: expression.chineseMeaning,
        }),
      });
      const payload = await response.json();
      if (redirectToSignIn(response, payload)) return;
      if (!response.ok) throw new Error(payload.error || "Save failed");
      setSavedCanonicalForms((current) => current.includes(expression.canonicalForm)
        ? current
        : [...current, expression.canonicalForm]);
    } catch {
      setMessage("This expression could not be saved. Please try again.");
    } finally {
      setSavingCanonical(null);
    }
  }

  function applyQuick(kind: "today" | "week" | "month") {
    const next = rangeFor(kind);
    setRange(next);
    void loadHistory(next);
  }

  async function deleteHistoryRecord(entry: Entry) {
    if (!entry.lastEventId || deletingId) return;
    setDeletingId(entry.lastEventId);
    setMessage(null);
    try {
      const response = await fetch("/api/lookups", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId: entry.lastEventId }),
      });
      const payload = await response.json();
      if (redirectToSignIn(response, payload)) return;
      if (!response.ok) throw new Error("Delete failed");
      await loadHistory();
    } catch {
      setMessage("This history record could not be deleted. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  const visibleEntries = useMemo(() => {
    const filtered = historyType === "all" ? history.entries : history.entries.filter((entry) => entry.inputType === historyType);
    return [...filtered].sort((a, b) => {
      if (sortBy === "oldest") return new Date(a.periodLastLookup).getTime() - new Date(b.periodLastLookup).getTime();
      if (sortBy === "az") return a.displayTerm.localeCompare(b.displayTerm, "en", { sensitivity: "base" });
      if (sortBy === "most") return b.periodLookupCount - a.periodLookupCount || new Date(b.periodLastLookup).getTime() - new Date(a.periodLastLookup).getTime();
      return new Date(b.periodLastLookup).getTime() - new Date(a.periodLastLookup).getTime();
    });
  }, [history.entries, historyType, sortBy]);

  const visibleStats = useMemo(() => ({
    newWords: visibleEntries.filter((entry) => entry.firstLookedUpAt >= toIsoBounds(range.start, range.end).start && entry.firstLookedUpAt <= toIsoBounds(range.start, range.end).end).length,
    repeatedWords: visibleEntries.filter((entry) => entry.periodLookupCount > 1).length,
    totalLookups: visibleEntries.reduce((sum, entry) => sum + Number(entry.periodLookupCount || 0), 0),
  }), [visibleEntries, range]);

  const rangeLabel = useMemo(() => {
    if (range.start === range.end) return range.start;
    return `${range.start} → ${range.end}`;
  }, [range]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView("lookup")} aria-label="Vocabulary Collector home">
          <span className="brand-mark">V</span>
          <span>Vocabulary Collector</span>
        </button>
        <nav className="nav-tabs" aria-label="Primary navigation">
          <button className={view === "lookup" ? "active" : ""} onClick={() => setView("lookup")}>Lookup</button>
          <button className={view === "reading" ? "active" : ""} onClick={() => setView("reading")}>Reading</button>
          <button className={view === "collection" ? "active" : ""} onClick={openCollection}>Collection</button>
          <button className={view === "history" ? "active" : ""} onClick={openHistory}>History</button>
        </nav>
      </header>

      {view === "lookup" ? (
        <section className="lookup-layout">
          <div className="lookup-copy">
            <p className="eyebrow">YOUR REAL-LIFE VOCABULARY</p>
            <h1>Look it up.<br />Make it yours.</h1>
            <p className="lede">Turn the English you encounter into a vocabulary collection built from real context.</p>
          </div>

          <div className="lookup-card">
            {capturedFromPage && <p className="capture-banner">Captured from your browser — review the context, then look it up.</p>}
            <form onSubmit={lookup}>
              <label htmlFor="term">English word, phrase, or sentence</label>
              <div className="lookup-row">
                <input id="term" autoFocus value={term} onChange={(e) => setTerm(e.target.value)} placeholder="e.g. serendipity or paste a sentence" autoComplete="off" />
                <button className="paste-button" type="button" onClick={() => void pasteAndFocus()}>Paste</button>
                <button className="primary" type="submit" disabled={loading || !term.trim()}>{loading ? "Looking…" : "Look up"}</button>
              </div>

              <button className="details-toggle" type="button" onClick={() => setDetailsOpen(!detailsOpen)} aria-expanded={detailsOpen}>
                <span>{detailsOpen ? "−" : "+"}</span> Add context or source <small>optional</small>
              </button>
              {detailsOpen && (
                <div className="details-grid">
                  <label>Original sentence<textarea value={context} onChange={(e) => setContext(e.target.value)} placeholder="Paste the sentence where you found it" /></label>
                  <label>Source name<input value={sourceTitle} onChange={(e) => setSourceTitle(e.target.value)} placeholder="Book, article, video…" /></label>
                  <label>Source URL<input type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://" /></label>
                  <label>Note<textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything you want to remember" /></label>
                </div>
              )}
            </form>

            {dictionaryPreview && (
              <article className="dictionary-preview" aria-live="polite">
                <div className="preview-heading">
                  <div><strong>{dictionaryPreview.word}</strong>{dictionaryPreview.phonetic && <span>{dictionaryPreview.phonetic}</span>}</div>
                  {loading && <small>Adding Chinese meaning…</small>}
                </div>
                {dictionaryPreview.senses.slice(0, 2).map((sense, index) => (
                  <p key={`${sense.partOfSpeech}-${index}`}><em>{sense.partOfSpeech || "meaning"}</em> {sense.definition}</p>
                ))}
              </article>
            )}

            {result && (
              <article className="result-card" aria-live="polite">
                <div><p className="result-term">{result.displayTerm}</p><p className="definition">{result.chineseDefinition || "Meaning unavailable"}</p></div>
                <span className="count-pill">{result.lookupCount === 1 ? "New" : `${result.lookupCount}× looked up`}</span>
              </article>
            )}

            {sentenceAnalysis && (
              <section className="sentence-suggestions" aria-live="polite">
                <div className="sentence-suggestions-heading">
                  <div><p>USEFUL EXPRESSIONS</p><h2>Expressions worth keeping</h2></div>
                  <span>{sentenceAnalysis.expressions.length}</span>
                </div>
                {sentenceAnalysis.expressions.length === 0 ? (
                  <p className="sentence-empty">{sentenceAnalysis.status === "degraded" ? "Expression analysis is temporarily unavailable." : "No reusable expressions found in this sentence."}</p>
                ) : (
                  <div className="expression-list">
                    {sentenceAnalysis.expressions.map((expression) => {
                      const saved = savedCanonicalForms.includes(expression.canonicalForm);
                      const saving = savingCanonical === expression.canonicalForm;
                      const meaningReady = expression.meaningStatus === "ready" && Boolean(expression.chineseMeaning);
                      return (
                        <article className="expression-card" key={expression.canonicalForm}>
                          <div>
                            <strong>{expression.encounteredForm}</strong>
                            {expression.canonicalForm !== expression.encounteredForm && <small>{expression.canonicalForm}</small>}
                            <p>{expression.chineseMeaning || "Meaning temporarily unavailable"}</p>
                          </div>
                          <button
                            type="button"
                            className={saved ? "save-expression saved" : "save-expression"}
                            disabled={!meaningReady || saved || Boolean(savingCanonical)}
                            onClick={() => void saveSentenceExpression(expression)}
                          >
                            {saved ? "Saved" : saving ? "Saving…" : meaningReady ? "Save" : "Unavailable"}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
            {message && <p className="message" role="status">{message}</p>}
          </div>
        </section>
      ) : view === "reading" ? (
        <section className="reading-layout">
          {!readerActive ? (
            <div className="reading-setup">
              <div className="reading-heading">
                <p className="eyebrow">READ & LOOK UP</p>
                <h1>Read naturally.<br />Keep what matters.</h1>
                <p>Paste an article, then select any word or phrase without leaving the page.</p>
              </div>
              <div className="reading-form">
                <label>Article title <input value={readerTitle} onChange={(event) => setReaderTitle(event.target.value)} placeholder="Optional" /></label>
                <label>Source URL <input type="url" value={readerUrl} onChange={(event) => setReaderUrl(event.target.value)} placeholder="https://medium.com/…" /></label>
                <label>Article text <textarea value={readerDraft} onChange={(event) => setReaderDraft(event.target.value)} placeholder="Paste the article text here…" /></label>
                <button className="primary reading-start" type="button" disabled={!readerDraft.trim()} onClick={() => setReaderActive(true)}>Start reading</button>
                <button className="shortcut-toggle" type="button" onClick={() => setShareHelpOpen(!shareHelpOpen)}>Set up iPhone Share menu</button>
                {shareHelpOpen && (
                  <div className="shortcut-help">
                    <h2>Safari setup — context included</h2>
                    <ol>
                      <li>Open your “Vocabulary Collector” shortcut. Keep Show in Share Sheet on, then change Receive to Safari Web Pages only.</li>
                      <li>Delete the old URL Encode, URL, and Open URL actions.</li>
                      <li>Add Run JavaScript on Web Page. Copy the script below and paste it into that action; run it on Shortcut Input.</li>
                      <li>Add Open URLs and set its input to JavaScript Result.</li>
                      <li>In Safari, select text, keep it highlighted, tap Safari’s toolbar Share button, then choose Vocabulary Collector.</li>
                    </ol>
                    <p className="shortcut-note">This captures the selected text, its sentence, the page title, and the page URL. Medium’s iPhone app may still share only its article URL.</p>
                    <button type="button" onClick={() => void copySafariScript()}>{shareCopied ? "Script copied" : "Copy Safari capture script"}</button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="reader-shell">
              <header className="reader-toolbar">
                <div><small>READING VIEW</small><strong>{readerTitle || "Untitled article"}</strong></div>
                <button type="button" onClick={() => { setReaderActive(false); setReaderSelection(null); setReaderResult(null); setReaderPreview(null); }}>Edit article</button>
              </header>
              <p className="reader-tip">Select a word or phrase, then tap Lookup.</p>
              <article ref={readerRef} className="reader-article" onPointerUp={captureReaderSelection} onTouchEnd={captureReaderSelection} onKeyUp={captureReaderSelection}>
                {readerParagraphs.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>)}
              </article>
              {readerSelection && (
                <button className="selection-lookup" style={{ top: readerSelection.top, left: readerSelection.left }} type="button" onClick={() => void lookupReaderSelection()}>Lookup</button>
              )}
              {(readerLoading || readerPreview || readerResult || readerMessage) && (
                <aside className="reader-result-sheet" aria-live="polite">
                  <button className="sheet-close" type="button" aria-label="Close lookup result" onClick={() => { setReaderResult(null); setReaderPreview(null); setReaderMessage(null); }}>×</button>
                  {readerLoading && <small className="sheet-status">Looking up selection…</small>}
                  {readerPreview && <div className="sheet-preview"><strong>{readerPreview.word}</strong>{readerPreview.phonetic && <span>{readerPreview.phonetic}</span>}<p>{readerPreview.senses[0]?.definition}</p></div>}
                  {readerResult && <div className="sheet-result"><strong>{readerResult.displayTerm}</strong><p>{readerResult.chineseDefinition || "Meaning unavailable"}</p><small>Saved with this sentence and source.</small></div>}
                  {readerMessage && <p className="message">{readerMessage}</p>}
                </aside>
              )}
            </div>
          )}
        </section>
      ) : view === "collection" ? (
        <section className="history-layout collection-layout">
          <div className="history-heading">
            <div><p className="eyebrow">YOUR COLLECTION</p><h1>Your vocabulary,<br />ready to revisit.</h1></div>
            <p>{collection.length} saved</p>
          </div>
          <p className="collection-intro">The words and expressions you chose to keep. Lookup activity stays in History.</p>
          <div className="history-list collection-list" aria-live="polite">
            {collectionLoading ? <p className="empty">Loading collection…</p> : collection.length === 0 ? (
              <p className="empty">Nothing saved yet. Look up a word or save an expression to start your collection.</p>
            ) : collection.map((item) => {
              const expanded = expandedCollectionIds.includes(item.id);
              return (
              <article className="history-item collection-item" key={item.id}>
                <div className="item-main">
                  <div className="term-line"><h2>{item.canonicalForm}</h2><span className="repeat-badge">{item.itemType}</span></div>
                  <p>{item.chineseMeaning}</p>
                  {item.encounteredForm !== item.canonicalForm && <small>Encountered as: {item.encounteredForm}</small>}
                  {item.contextSentence && <blockquote>“{item.contextSentence}”</blockquote>}
                  {(item.sourceTitle || item.sourceUrl) && <small>Source: {item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer">{item.sourceTitle || item.sourceUrl}</a> : item.sourceTitle}</small>}
                  {item.note && <p className="encounter-note">Note: {item.note}</p>}
                  <button className="encounter-toggle" type="button" onClick={() => toggleCollectionItem(item.id)} aria-expanded={expanded}>
                    {expanded ? "Hide encounters" : `View ${item.encounterCount} ${item.encounterCount === 1 ? "encounter" : "encounters"}`}
                  </button>
                  {expanded && (
                    <div className="encounter-list">
                      {item.encounters.map((encounter) => (
                        <section className="encounter-row" key={encounter.id}>
                          <div>
                            <strong>{encounter.encounteredForm}</strong>
                            {encounter.contextSentence && <blockquote>“{encounter.contextSentence}”</blockquote>}
                            {(encounter.sourceTitle || encounter.sourceUrl) && <small>Source: {encounter.sourceUrl ? <a href={encounter.sourceUrl} target="_blank" rel="noreferrer">{encounter.sourceTitle || encounter.sourceUrl}</a> : encounter.sourceTitle}</small>}
                            {encounter.note && <p className="encounter-note">Note: {encounter.note}</p>}
                            <time>{new Date(encounter.encounteredAt).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</time>
                          </div>
                          <button className="delete-button" type="button" disabled={Boolean(deletingEncounterId)} onClick={() => void deleteEncounter(encounter.id)}>
                            {deletingEncounterId === encounter.id ? "Deleting…" : "Delete"}
                          </button>
                        </section>
                      ))}
                    </div>
                  )}
                </div>
                <div className="collection-times">
                  <span className="encounter-count">{item.encounterCount} {item.encounterCount === 1 ? "encounter" : "encounters"}</span>
                  <time>Last seen {new Date(item.encounteredAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time>
                </div>
              </article>
            );})}
          </div>
          {message && <p className="message" role="status">{message}</p>}
        </section>
      ) : (
        <section className="history-layout">
          <div className="history-heading">
            <div><p className="eyebrow">VOCABULARY HISTORY</p><h1>Every lookup,<br />in one place.</h1></div>
            <p>{rangeLabel}</p>
          </div>

          <div className="filters">
            <div className="quick-filters">
              <button onClick={() => applyQuick("today")}>Today</button>
              <button onClick={() => applyQuick("week")}>This Week</button>
              <button onClick={() => applyQuick("month")}>This Month</button>
            </div>
            <div className="date-fields">
              <label>Start Date<input type="date" value={range.start} onChange={(e) => setRange({ ...range, start: e.target.value })} /></label>
              <span>→</span>
              <label>End Date<input type="date" value={range.end} onChange={(e) => setRange({ ...range, end: e.target.value })} /></label>
              <button className="secondary" onClick={() => void loadHistory()}>Apply</button>
            </div>
          </div>

          <div className="history-controls">
            <div className="type-filters" aria-label="Filter history by type">
              <button className={historyType === "all" ? "selected" : ""} onClick={() => setHistoryType("all")}>All</button>
              <button className={historyType === "vocabulary" ? "selected" : ""} onClick={() => setHistoryType("vocabulary")}>Words & Phrases</button>
              <button className={historyType === "sentence" ? "selected" : ""} onClick={() => setHistoryType("sentence")}>Sentences</button>
            </div>
            <label className="sort-control">Sort
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="az">A–Z</option>
                <option value="most">Most looked up</option>
              </select>
            </label>
          </div>

          <div className="stats-grid">
            <div><strong>{visibleStats.newWords}</strong><span>New words</span></div>
            <div><strong>{visibleStats.repeatedWords}</strong><span>Repeated words</span></div>
            <div><strong>{visibleStats.totalLookups}</strong><span>Total lookups</span></div>
          </div>

          <div className="history-list" aria-live="polite">
            {historyLoading ? <p className="empty">Loading history…</p> : visibleEntries.length === 0 ? (
              <p className="empty">No lookups match these filters.</p>
            ) : visibleEntries.map((entry) => (
              <article className="history-item" key={entry.id}>
                <div className="item-main">
                  <div className="term-line"><h2>{entry.displayTerm}</h2>{entry.lookupCount > 1 && <span className="repeat-badge">{entry.lookupCount}×</span>}</div>
                  <p>{entry.chineseDefinition || "Meaning unavailable"}</p>
                  {entry.contextSentence && <blockquote>“{entry.contextSentence}”</blockquote>}
                  {(entry.sourceTitle || entry.note) && <small>{[entry.sourceTitle, entry.note].filter(Boolean).join(" · ")}</small>}
                </div>
                <div className="item-actions">
                  <time>{new Date(entry.periodLastLookup).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time>
                  <button className="delete-button" onClick={() => void deleteHistoryRecord(entry)} disabled={!entry.lastEventId || deletingId === entry.lastEventId} aria-label={`Delete latest lookup for ${entry.displayTerm}`}>
                    {deletingId === entry.lastEventId ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
