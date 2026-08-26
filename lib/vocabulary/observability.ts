type ExternalAttemptEvent = {
  provider: string;
  operation: string;
  attempt: number;
  maxAttempts: number;
  outcome: "success" | "failure";
  durationMs: number;
  status?: number | null;
  willRetry?: boolean;
  errorName?: string | null;
};

export function buildExternalAttemptEvent(input: ExternalAttemptEvent) {
  return {
    event: "external_call_attempt",
    provider: input.provider,
    operation: input.operation,
    attempt: input.attempt,
    max_attempts: input.maxAttempts,
    outcome: input.outcome,
    duration_ms: Math.max(0, Math.round(input.durationMs)),
    status: input.status ?? null,
    will_retry: input.willRetry ?? false,
    error_name: input.errorName ?? null,
  };
}

export function logExternalAttempt(input: ExternalAttemptEvent) {
  console.info(JSON.stringify(buildExternalAttemptEvent(input)));
}
