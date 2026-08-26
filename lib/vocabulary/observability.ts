export type TraceContext = {
  requestId: string;
  flow: "lookup" | "collection_save";
};

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
  trace?: TraceContext | null;
};

type RequestStageEvent = {
  trace: TraceContext;
  stage: string;
  outcome: "start" | "success" | "failure" | "partial";
  durationMs?: number | null;
  inputType?: "word" | "phrase" | "sentence" | null;
  provider?: string | null;
  errorName?: string | null;
};

export function buildExternalAttemptEvent(input: ExternalAttemptEvent) {
  return {
    event: "external_call_attempt",
    request_id: input.trace?.requestId ?? null,
    flow: input.trace?.flow ?? null,
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

export function buildRequestStageEvent(input: RequestStageEvent) {
  return {
    event: "request_stage",
    request_id: input.trace.requestId,
    flow: input.trace.flow,
    stage: input.stage,
    outcome: input.outcome,
    duration_ms: input.durationMs == null ? null : Math.max(0, Math.round(input.durationMs)),
    input_type: input.inputType ?? null,
    provider: input.provider ?? null,
    error_name: input.errorName ?? null,
  };
}

export function logRequestStage(input: RequestStageEvent) {
  console.info(JSON.stringify(buildRequestStageEvent(input)));
}
