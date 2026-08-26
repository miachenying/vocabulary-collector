export type RetryAttempt = {
  attempt: number;
  maxAttempts: number;
};

type RetryOptions = {
  maxAttempts?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  delayMs?: (error: unknown, attempt: number) => number;
};

export function isRetryableHttpStatus(status: number) {
  return status === 429 || status >= 500;
}

function errorStatus(error: unknown) {
  if (!error || typeof error !== "object" || !("status" in error)) return null;
  const status = Number((error as { status?: unknown }).status);
  return Number.isFinite(status) ? status : null;
}

export function retryDelayMs(error: unknown, attempt: number) {
  const status = errorStatus(error);
  if (status === 429) return Math.min(8_000, 2_000 * Math.max(1, attempt));
  if (status !== null && status >= 500) return 500 * Math.max(1, attempt);
  return 0;
}

function sleep(ms: number) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

export async function withRetry<T>(
  operation: (attempt: RetryAttempt) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 2);
  const shouldRetry = options.shouldRetry ?? (() => true);
  const delayMs = options.delayMs ?? retryDelayMs;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation({ attempt, maxAttempts });
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !shouldRetry(error, attempt)) throw error;
      await sleep(Math.max(0, delayMs(error, attempt)));
    }
  }

  throw lastError;
}
