import { NextRequest, NextResponse } from "next/server";
import { ensureVocabularySchema, getVocabularyDb } from "@/lib/vocabulary/database";
import { parseManualSentenceSaveInput } from "@/lib/vocabulary/manual-save-input";
import { saveSentenceSuggestion } from "@/lib/vocabulary/collection-save";
import { logRequestStage, type TraceContext } from "@/lib/vocabulary/observability";
import { groupCollectionRows, listCollection } from "@/lib/vocabulary/collection";

export const dynamic = "force-dynamic";

function userId(request: NextRequest) {
  return request.headers.get("oai-authenticated-user-email") || "mia-local";
}

function jsonWithTrace(body: unknown, status: number, trace: TraceContext) {
  return NextResponse.json(body, { status, headers: { "x-request-id": trace.requestId } });
}

export async function GET(request: NextRequest) {
  await ensureVocabularySchema();
  const rows = await listCollection(getVocabularyDb(), userId(request));
  return NextResponse.json({ items: groupCollectionRows(rows.results) });
}

export async function POST(request: NextRequest) {
  const trace: TraceContext = { requestId: crypto.randomUUID(), flow: "collection_save" };
  const startedAt = Date.now();
  logRequestStage({ trace, stage: "request", outcome: "start" });

  await ensureVocabularySchema();
  const body = await request.json().catch(() => null);
  const suggestion = parseManualSentenceSaveInput(body);
  if (!suggestion) {
    logRequestStage({ trace, stage: "input_validation", outcome: "failure", errorName: "InvalidSavePayload" });
    return jsonWithTrace({ error: "A complete sentence suggestion is required.", requestId: trace.requestId }, 400, trace);
  }

  try {
    const result = await saveSentenceSuggestion({
      database: getVocabularyDb(),
      userId: userId(request),
      suggestion,
      now: new Date().toISOString(),
      trace,
    });
    logRequestStage({ trace, stage: "collection_persist", outcome: "success" });
    logRequestStage({ trace, stage: "request", outcome: "success", durationMs: Date.now() - startedAt });
    return jsonWithTrace({ ...result, requestId: trace.requestId }, 200, trace);
  } catch (error) {
    console.error("Failed to save sentence suggestion", error);
    const message = error instanceof Error ? error.message : "Could not save this expression.";
    const status = message.includes("not found") || message.includes("does not belong") ? 404 : 500;
    logRequestStage({ trace, stage: "collection_persist", outcome: "failure", errorName: error instanceof Error ? error.name : "UnknownError" });
    logRequestStage({ trace, stage: "request", outcome: "failure", durationMs: Date.now() - startedAt, errorName: error instanceof Error ? error.name : "UnknownError" });
    return jsonWithTrace({ error: message, requestId: trace.requestId }, status, trace);
  }
}
