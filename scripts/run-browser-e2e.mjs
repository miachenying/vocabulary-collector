import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chromium } from "playwright";

const baseUrl = "http://127.0.0.1:5173";
const sentence = "The explanation doesn't quite add up.";

async function waitForServer(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl, { headers: { accept: "text/html" } });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Timed out waiting for local Vocabulary Collector server.");
}

const server = spawn("./node_modules/.bin/vite", [], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, GEMINI_API_KEY: "", WRANGLER_LOG_PATH: ".wrangler/wrangler.log" },
});
let serverLog = "";
server.stdout.on("data", (chunk) => { serverLog += chunk; });
server.stderr.on("data", (chunk) => { serverLog += chunk; });

async function stopServer() {
  if (server.exitCode !== null) return;
  server.kill("SIGTERM");
  const closed = await Promise.race([
    once(server, "close").then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 5_000)),
  ]);
  if (!closed && server.exitCode === null) {
    server.kill("SIGKILL");
    await once(server, "close").catch(() => {});
  }
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(10_000);
  let savedPayload = null;
  let deletedEncounterId = null;
  let lastLookupPayload = null;

  await page.route("**/api/lookups", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    lastLookupPayload = route.request().postDataJSON();
    const isReadingLookup = lastLookupPayload.term?.toLowerCase() === "resilience";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        requestId: "browser-e2e-lookup",
        warning: null,
        entry: {
          id: "browser-entry",
          displayTerm: isReadingLookup ? "resilience" : sentence,
          chineseDefinition: isReadingLookup ? "韧性；复原力" : "这个解释似乎不太说得通。",
          contextSentence: null,
          sourceTitle: null,
          sourceUrl: null,
          note: null,
          lookupCount: 1,
          firstLookedUpAt: "2026-08-26T18:00:00.000Z",
          lastLookedUpAt: "2026-08-26T18:00:00.000Z",
          periodLookupCount: 1,
          periodFirstLookup: "2026-08-26T18:00:00.000Z",
          periodLastLookup: "2026-08-26T18:00:00.000Z",
          lastEventId: "browser-event",
          inputType: "sentence",
        },
        sentenceAnalysis: isReadingLookup ? null : {
          lookupEventId: "browser-lookup-event",
          translation: "这个解释似乎不太说得通。",
          expressions: [{
            encounteredForm: "doesn't quite add up",
            canonicalForm: "add up",
            reason: "phrasal_verb",
            chineseMeaning: "说得通；合乎情理",
            meaningStatus: "ready",
          }],
        },
      }),
    });
  });

  await page.route("**/api/collection", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [{
          id: "browser-item:browser-sense", canonicalForm: "add up", itemType: "phrase",
          createdAt: "2026-08-26T18:00:00.000Z", chineseMeaning: "说得通；合乎情理",
          encounteredForm: "doesn't quite add up", contextSentence: sentence,
          sourceTitle: "Browser E2E", sourceUrl: "https://example.com/browser",
          note: "Remember this reasoning pattern.", encounteredAt: "2026-08-26T18:00:00.000Z", encounterCount: 2,
          encounters: [
            { id: "encounter-new", encounteredForm: "doesn't quite add up", contextSentence: sentence, sourceTitle: "Browser E2E", sourceUrl: "https://example.com/browser", note: "Remember this reasoning pattern.", encounteredAt: "2026-08-26T18:00:00.000Z" },
            { id: "encounter-old", encounteredForm: "add up", contextSentence: "The figures add up.", sourceTitle: "Earlier source", sourceUrl: null, note: null, encounteredAt: "2026-08-25T18:00:00.000Z" },
          ],
        }] }),
      });
    }
    if (route.request().method() === "DELETE") {
      deletedEncounterId = route.request().postDataJSON().encounterId;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ deleted: true }) });
    }
    savedPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        saved: true,
        alreadySaved: false,
        itemId: "browser-item",
        senseId: "browser-sense",
        canonicalForm: "add up",
        requestId: "browser-e2e-save",
      }),
    });
  });

  const captureQuery = new URLSearchParams({
    share: "1",
    term: "caught off guard",
    context: "The announcement caught everyone off guard.",
    sourceTitle: "Captured Article",
    sourceUrl: "https://example.com/article",
  });
  await page.goto(`${baseUrl}/?${captureQuery}`, { waitUntil: "networkidle" });
  await page.getByText("Captured from your browser", { exact: false }).waitFor();
  assert.equal(await page.locator("#term").inputValue(), "caught off guard");
  assert.equal(await page.getByLabel("Original sentence").inputValue(), "The announcement caught everyone off guard.");
  assert.equal(await page.getByLabel("Source name").inputValue(), "Captured Article");
  assert.equal(await page.getByLabel("Source URL").inputValue(), "https://example.com/article");

  await page.goto(baseUrl, { waitUntil: "networkidle" });

  await page.goto(`${baseUrl}/?share=1&term=resilience`, { waitUntil: "networkidle" });
  assert.equal(await page.locator("#term").inputValue(), "resilience");
  await page.getByText("Captured from your browser", { exact: false }).waitFor();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  await page.getByLabel("Article title").fill("Reading E2E");
  await page.getByLabel("Source URL").fill("https://example.com/reading");
  await page.getByLabel("Article text").fill("The first paragraph is ordinary.\n\nResilience helps people recover after difficult experiences.");
  await page.getByRole("button", { name: "Start reading", exact: true }).click();
  await page.locator(".reader-article p").last().evaluate((paragraph) => {
    const node = paragraph.firstChild;
    const text = node?.textContent ?? "";
    const start = text.indexOf("Resilience");
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + "resilience".length);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    paragraph.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  });
  await page.locator(".selection-lookup").click();
  await page.getByText("韧性；复原力", { exact: true }).waitFor();
  assert.equal(lastLookupPayload.term, "Resilience");
  assert.equal(lastLookupPayload.context, "Resilience helps people recover after difficult experiences.");
  assert.equal(lastLookupPayload.sourceTitle, "Reading E2E");
  assert.equal(lastLookupPayload.sourceUrl, "https://example.com/reading");

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator("#term").fill(sentence);
  await page.getByRole("button", { name: "Look up" }).click();

  await page.getByRole("heading", { name: "Expressions worth keeping" }).waitFor();
  await page.getByText("doesn't quite add up", { exact: true }).waitFor();
  await page.getByText("说得通；合乎情理", { exact: true }).waitFor();

  const saveButton = page.getByRole("button", { name: "Save", exact: true });
  await saveButton.click();
  await page.getByRole("button", { name: "Saved", exact: true }).waitFor();

  assert.deepEqual(savedPayload, {
    lookupEventId: "browser-lookup-event",
    encounteredForm: "doesn't quite add up",
    canonicalForm: "add up",
    chineseMeaning: "说得通；合乎情理",
  });
  assert.equal(await page.getByRole("button", { name: "Saved", exact: true }).isDisabled(), true);

  await page.getByRole("button", { name: "Collection", exact: true }).click();
  await page.getByRole("heading", { name: "add up", exact: true }).waitFor();
  await page.getByText("Encountered as: doesn't quite add up", { exact: true }).waitFor();
  await page.getByText("Browser E2E", { exact: true }).waitFor();
  await page.getByText("2 encounters", { exact: true }).waitFor();
  await page.getByRole("button", { name: "View 2 encounters", exact: true }).click();
  await page.getByText("Remember this reasoning pattern.", { exact: false }).last().waitFor();
  await page.getByText("Earlier source", { exact: false }).waitFor();
  const encounterDeletes = page.getByRole("button", { name: "Delete", exact: true });
  await encounterDeletes.first().click();
  assert.equal(deletedEncounterId, "encounter-new");

  console.log("Browser E2E passed: share prefill, Reading View selection lookup, capture context, encounter notes, expansion, and deletion were verified.");
} catch (error) {
  console.error(serverLog);
  throw error;
} finally {
  if (browser) await browser.close();
  await stopServer();
}
