# Milestone 6 — Reliability & Observability

## Failure policy

| Component / failure | Retry? | Fallback / degradation | Request result | Observe |
| --- | --- | --- | --- | --- |
| Dictionary 404 | No | Treat as lexical miss; use Gemini meaning fallback | Continue | dictionary miss/fallback rate |
| Dictionary 429 / 5xx / network | Once | Gemini meaning fallback after retry exhaustion | Continue if Gemini succeeds | retry rate, fallback rate, final failure rate, latency |
| Gemini translation/meaning 429 / 5xx / network / empty result | Once | No lower-quality semantic provider currently | Meaning lookup becomes partial/failed | retry rate, failure rate, latency |
| Gemini language-judgment malformed/empty output | Once at external-call layer when parsing throws | Canonicalization uses deterministic fallback; sense matching conservatively creates new sense | Continue | judgment retry/failure rate |
| Sentence expression extraction failure | Once through Gemini call policy | Return translation with zero suggestions | Continue as degraded success | sentence_expression_extraction failure rate |
| Sentence has legitimately zero useful expressions | No failure | Return translation with zero suggestions | Success | extraction success with zero suggestions (future metric) |
| One extracted expression meaning fails | Provider retry/fallback applies | Keep other suggestions; failed one marked unavailable | Continue as degraded success | unavailable suggestion rate |
| v2 lookup-history mirror write fails | No automatic DB retry in M6 | Keep legacy flow working | Continue as partial | lookup_history_start partial rate |
| v2 collection mirror write fails | No automatic DB retry in M6 | Legacy result remains available | Continue as partial | v2_persist partial/failure rate |
| Legacy/core persistence fails | No fallback | Cannot safely claim lookup was recorded | Request fails | route/server error rate |
| Manual Save invalid payload | No | Reject | 400 | input validation failures |
| Manual Save event not owned by user / expression not in source sentence | No | Reject | 404 | collection_save validation failures |
| Manual Save semantic judgment fails | Gemini retry once | Conservatively create a new sense | Continue | judgment failure + new-sense rate |
| Manual Save DB persistence fails | No automatic DB retry in M6 | Do not claim Saved | 5xx | collection_persist failures |

## Request-level trace

Every lookup and manual Save receives a `request_id`. The same trace ID is propagated into stage logs and external provider-attempt logs. Raw vocabulary input, sentence text, source text, and user email are intentionally not emitted in structured observability events.

Important lookup stages:

- request
- input_validation
- classification
- lookup_history_start
- legacy_persist
- meaning
- sentence_expression_extraction
- sentence_analysis
- v2_persist

Important manual-save stages:

- request
- input_validation
- collection_persist

## MVP monitoring signals

Prioritize a small set of actionable metrics rather than logging everything:

1. Lookup success / partial / failure rate.
2. End-to-end lookup latency (p50 / p95 when aggregation exists).
3. Dictionary miss, retry, and Gemini-fallback rate.
4. Gemini retry and final-failure rate by operation (`generate_text`, `language_judgment`).
5. Sentence extraction failure rate, separate from legitimate zero-expression results.
6. Expression meaning `unavailable` rate.
7. v2 persistence partial/failure rate.
8. Manual Save success/failure rate and duplicate-save rate.

## Not yet implemented in M6

- Persistent metrics backend/dashboard or alerting.
- Automatic database-write retries.
- Full browser / Cloudflare D1 end-to-end verification.
- Production SLOs or alert thresholds; these should be based on observed real traffic rather than invented during MVP development.
