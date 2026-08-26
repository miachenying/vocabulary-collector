"use client";

import { FormEvent, useMemo, useState } from "react";

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
  const [view, setView] = useState<"lookup" | "history">("lookup");
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

  async function loadHistory(nextRange = range) {
    setHistoryLoading(true);
    try {
      const bounds = toIsoBounds(nextRange.start, nextRange.end);
      const qs = new URLSearchParams(bounds);
      const response = await fetch(`/api/lookups?${qs}`);
      if (!response.ok) throw new Error("Could not load history");
      setHistory(await response.json());
    } catch {
      setMessage("History 暂时无法读取，请稍后重试。");
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
    setSavedCanonicalForms([]);
    setSavingCanonical(null);
    try {
      const response = await fetch("/api/lookups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ term, context, sourceTitle, sourceUrl, note }),
      });
      const payload = await response.json();
      if (!response.ok && !payload.entry) throw new Error(payload.error || "Lookup failed");
      setResult(payload.entry);
      setSentenceAnalysis(payload.sentenceAnalysis ?? null);
      if (payload.warning) setMessage(payload.warning);
      setTerm("");
    } catch {
      setMessage("这次查询没有完成。原词会在服务可用后再保存，请重试一次。");
    } finally {
      setLoading(false);
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
      if (!response.ok) throw new Error(payload.error || "Save failed");
      setSavedCanonicalForms((current) => current.includes(expression.canonicalForm)
        ? current
        : [...current, expression.canonicalForm]);
    } catch {
      setMessage("这个表达暂时没有保存成功，请稍后重试。");
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
      if (!response.ok) throw new Error("Delete failed");
      await loadHistory();
    } catch {
      setMessage("这条记录暂时无法删除，请稍后重试。");
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
          <button className={view === "history" ? "active" : ""} onClick={openHistory}>History</button>
        </nav>
      </header>

      {view === "lookup" ? (
        <section className="lookup-layout">
          <div className="lookup-copy">
            <p className="eyebrow">YOUR REAL-LIFE VOCABULARY</p>
            <h1>遇到一个词，<br />现在就收下来。</h1>
            <p className="lede">查中文意思的同时自动保存。下次再遇到它，我们会记得。</p>
          </div>

          <div className="lookup-card">
            <form onSubmit={lookup}>
              <label htmlFor="term">English word, phrase, or sentence</label>
              <div className="lookup-row">
                <input id="term" autoFocus value={term} onChange={(e) => setTerm(e.target.value)} placeholder="e.g. serendipity or paste a sentence" autoComplete="off" />
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

            {result && (
              <article className="result-card" aria-live="polite">
                <div><p className="result-term">{result.displayTerm}</p><p className="definition">{result.chineseDefinition || "解释待生成"}</p></div>
                <span className="count-pill">{result.lookupCount === 1 ? "New" : `${result.lookupCount}× looked up`}</span>
              </article>
            )}

            {sentenceAnalysis && (
              <section className="sentence-suggestions" aria-live="polite">
                <div className="sentence-suggestions-heading">
                  <div><p>USEFUL EXPRESSIONS</p><h2>值得收下来的表达</h2></div>
                  <span>{sentenceAnalysis.expressions.length}</span>
                </div>
                {sentenceAnalysis.expressions.length === 0 ? (
                  <p className="sentence-empty">这句话里没有特别值得单独保存的表达。</p>
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
                            <p>{expression.chineseMeaning || "中文意思暂时不可用"}</p>
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
      ) : (
        <section className="history-layout">
          <div className="history-heading">
            <div><p className="eyebrow">VOCABULARY HISTORY</p><h1>你真正遇到过的词。</h1></div>
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
              <p className="empty">这个筛选条件下还没有记录。</p>
            ) : visibleEntries.map((entry) => (
              <article className="history-item" key={entry.id}>
                <div className="item-main">
                  <div className="term-line"><h2>{entry.displayTerm}</h2>{entry.lookupCount > 1 && <span className="repeat-badge">{entry.lookupCount}×</span>}</div>
                  <p>{entry.chineseDefinition || "解释待生成"}</p>
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
