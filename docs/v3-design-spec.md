# Vocabulary Collector V3 design spec

## Goal

Move Vocabulary Collector from a paste-first website to a secure capture system that collects English where the user encounters it.

## V3 scope

### M8 — Identity and isolation

- Require ChatGPT sign-in for lookup, History, Collection, and Save APIs.
- Use the stable authenticated ChatGPT user ID for every user-owned database read and write.
- Migrate records previously keyed by the signed-in user's email to that stable ID without losing the existing Collection or History.
- Never fall back anonymous traffic to a shared database user.
- Reject unauthenticated API requests with a structured `401 authentication_required` response.
- Preserve source context only inside the authenticated user's records.

### M9 — Chrome selection capture MVP

- Accept selected words, phrases, or sentences from ordinary web pages.
- Capture nearby text, page title, and page URL when browser permissions allow it.
- Open Vocabulary Collector in a compact window with captured fields prefilled.
- Reuse Sites' ChatGPT sign-in; do not store authentication secrets in the extension.
- Require the user to review context and submit before data is written.

## Explicitly deferred

- Chrome Web Store packaging and review.
- Inline definition overlays that call the API directly.
- Automatic scraping of non-selectable video captions.
- Native iOS/Android share sheets, Kindle integration, OCR, and screenshot lookup.
- Review scheduling and spaced repetition.

## Acceptance criteria

1. Anonymous API calls cannot read or write vocabulary data.
2. A request authenticated as one user cannot retrieve another user's History or Collection.
3. Selecting text in Chrome opens a prefilled lookup with context and source metadata.
4. Restricted pages degrade to selection-only capture.
5. Existing signed-in web lookup, Collection, History, and manual Save behavior remains intact.
