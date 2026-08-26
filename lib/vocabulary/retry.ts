export type RetryAttempt = {
  attempt: number;
  maxAttempts: number;
};

type RetryOptions = {
  maxAttempts?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
};

export function isRetryableHttpStatus(status: number) {
  return status === 429 || status >= 500;
}

export async function withRetry<T>(
  operation: (attempt: RetryAttempt) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 2);
  const shouldRetry = options.shouldRetry ?? (() => true);
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation({ attempt, maxAttempts });
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !shouldRetry(error, attempt)) throw error;
    }
  }

  throw lastError;
}
