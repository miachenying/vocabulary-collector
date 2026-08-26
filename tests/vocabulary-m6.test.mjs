import assert from "node:assert/strict";
import test from "node:test";
import { isRetryableHttpStatus, withRetry } from "../lib/vocabulary/retry.ts";

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
