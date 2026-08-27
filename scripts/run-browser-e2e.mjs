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

  await page.route("**/api/lookups", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        requestId: "browser-e2e-lookup",
        warning: null,
        entry: {
          id: "browser-entry",
          displayTerm: sentence,
          chineseDefinition: "这个解释似乎不太说得通。",
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
        sentenceAnalysis: {
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
          encounteredAt: "2026-08-26T18:00:00.000Z", encounterCount: 2,
        }] }),
      });
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
    capture: "1",
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

  console.log("Browser E2E passed: capture prefill, sentence save, and Collection context were verified.");
} catch (error) {
  console.error(serverLog);
  throw error;
} finally {
  if (browser) await browser.close();
  await stopServer();
}
