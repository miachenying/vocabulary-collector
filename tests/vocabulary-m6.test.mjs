import assert from "node:assert/strict";
import test from "node:test";
import { buildExternalAttemptEvent, buildRequestStageEvent } from "../lib/vocabulary/observability.ts";
import { isRetryableHttpStatus, retryDelayMs, withRetry } from "../lib/vocabulary/retry.ts";

test("returns immediately when the first attempt succeeds", async () => {
  let calls = 0;
  const value = await withRetry(async ({ attempt, maxAttempts }) => {
    calls += 1;
    assert.equal(attempt, 1);
    assert.equal(maxAttempts, 2);
    return "ok";
  });
  assert.equal(value, "ok");
  assert.equal(calls, 1);
});

test("retries once after a transient failure", async () => {
  let calls = 0;
  const value = await withRetry(async () => {
    calls += 1;
    if (calls === 1) throw new Error("temporary");
    return "recovered";
  }, { maxAttempts: 2 });
  assert.equal(value, "recovered");
  assert.equal(calls, 2);
});

test("does not retry when policy rejects the error", async () => {
  let calls = 0;
  await assert.rejects(() => withRetry(async () => {
    calls += 1;
    throw new Error("bad request");
  }, { maxAttempts: 2, shouldRetry: () => false }), /bad request/);
  assert.equal(calls, 1);
});

test("stops after the configured maximum attempts", async () => {
  let calls = 0;
  await assert.rejects(() => withRetry(async () => {
    calls += 1;
    throw new Error("still unavailable");
  }, { maxAttempts: 2 }), /still unavailable/);
  assert.equal(calls, 2);
});

test("HTTP retry policy retries 429 and 5xx but not ordinary 4xx", () => {
  assert.equal(isRetryableHttpStatus(429), true);
  assert.equal(isRetryableHttpStatus(500), true);
  assert.equal(isRetryableHttpStatus(503), true);
  assert.equal(isRetryableHttpStatus(400), false);
  assert.equal(isRetryableHttpStatus(404), false);
});

test("429 backoff is longer than 5xx backoff", () => {
  assert.equal(retryDelayMs({ status: 429 }, 1), 2000);
  assert.equal(retryDelayMs({ status: 500 }, 1), 500);
  assert.equal(retryDelayMs(new Error("network"), 1), 0);
});

test("retry delay can be overridden for deterministic callers", async () => {
  let calls = 0;
  let delayCalls = 0;
  const value = await withRetry(async () => {
    calls += 1;
    if (calls === 1) throw { status: 429 };
    return "ok";
  }, {
    maxAttempts: 2,
    delayMs: () => {
      delayCalls += 1;
      return 0;
    },
  });
  assert.equal(value, "ok");
  assert.equal(delayCalls, 1);
});

test("request-stage events preserve one request id across stages without user content", () => {
  const trace = { requestId: "req-123", flow: "lookup" };
  const event = buildRequestStageEvent({ trace, stage: "meaning", outcome: "success", inputType: "sentence", provider: "gemini", durationMs: 12.8 });
  assert.equal(event.request_id, "req-123");
  assert.equal(event.flow, "lookup");
  assert.equal(event.stage, "meaning");
  assert.equal(event.duration_ms, 13);
  assert.equal("raw_input" in event, false);
  assert.equal("sentence" in event, false);
});

test("external-call events carry the request trace id", () => {
  const event = buildExternalAttemptEvent({
    provider: "gemini",
    operation: "generate_text",
    attempt: 2,
    maxAttempts: 2,
    outcome: "success",
    durationMs: 50,
    status: 200,
    trace: { requestId: "req-456", flow: "lookup" },
  });
  assert.equal(event.request_id, "req-456");
  assert.equal(event.flow, "lookup");
  assert.equal(event.attempt, 2);
});
