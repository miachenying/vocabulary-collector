# Milestone 7 — Eval, Regression, and Release Readiness

This document defines what "ready" means for Vocabulary Collector v2. Passing one layer must not be presented as passing a broader layer.

## Release gates

### Gate A — Deterministic regression

Run:

```bash
npm run check:release
```

This runs the M3–M6 deterministic suites:

- M3: input classification, normalization, canonical payload validation, semantic-sense output validation.
- M4: sentence expression validation and meaning-enrichment degradation behavior.
- M5: manual-save payload and source-sentence validation.
- M6: retry policy and observability event structure.

This gate does not call live Dictionary/Gemini services and does not prove that the app builds or renders in the production runtime.

### Gate B — Runtime/build regression

Run in a properly installed project environment:

```bash
npm run check:runtime
```

This runs Gate A, the bounded vinext build, artifact validation, and the existing rendered-HTML test.

Do not mark this gate passed unless it has actually run successfully in an environment with the repository dependencies installed.

### Gate C — Live provider/eval regression

Required before relying on semantic quality claims:

- Run the M3 Dictionary + Gemini integration eval with a real `GEMINI_API_KEY` and outbound network access.
- Run the M4 sentence cases through the live sentence pipeline and score the resulting JSON with `score:m4`.
- Review all critical meaning cases; meaning correctness remains a must-pass product criterion.

A scorer/harness passing on simulated outputs does not count as this gate passing.

### Gate D — D1/browser end-to-end

Required before deployment/merge is called release-ready:

- Fresh application runtime can initialize/migrate the v2 schema.
- Word lookup persists correctly.
- Phrase lookup canonicalizes/deduplicates correctly.
- Sentence lookup returns translation + suggestions without auto-saving suggestions.
- Manual Save creates Collection item/sense/encounter.
- Repeat Save is idempotent.
- History behavior remains intact during the transitional dual-write period.
- Failure/degraded UI states are usable.
- Request IDs can be correlated with structured logs.

## Current known status

- M3 deterministic tests: previously executed successfully, 6/6.
- M4 deterministic tests: previously executed successfully, 7/7.
- M5 deterministic tests: previously executed successfully, 4/4.
- M6 deterministic tests: previously executed successfully, 7/7.
- M4 eval scorer: validated against simulated expected outputs; this is not a live LLM quality result.
- Live Dictionary/Gemini integration/evals: not yet completed end-to-end in the current development environment.
- Full build/browser/D1 E2E: not yet completed for v2.

## Release blockers

1. `package-lock.json` is currently absent from `v2-dev`. The repository therefore cannot yet be claimed to support a reproducible fresh-clone `npm ci` workflow. Restore/regenerate the lockfile in a proper project environment and verify it matches `package.json` before release.
2. Gate B has not yet been demonstrated on the current v2 branch.
3. Gate C live semantic/provider evals have not yet been demonstrated.
4. Gate D D1/browser end-to-end behavior has not yet been demonstrated.

## Merge/deploy rule

Do not merge `v2-dev` to `main` or call v2 production-ready based only on deterministic unit tests. Minimum merge/release review should have Gate A passing on the current tip, the lockfile restored, Gate B passing, and a deliberate decision on any remaining Gate C/D failures.
