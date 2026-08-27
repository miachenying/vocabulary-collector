import { NextRequest, NextResponse } from "next/server";
import { ensureVocabularySchema, getVocabularyDb, migrateLegacyEmailUserId } from "@/lib/vocabulary/database";
import { parseManualSentenceSaveInput } from "@/lib/vocabulary/manual-save-input";
import { saveSentenceSuggestion } from "@/lib/vocabulary/collection-save";
import { logRequestStage, type TraceContext } from "@/lib/vocabulary/observability";
import { deleteCollectionEncounter, groupCollectionRows, listCollection } from "@/lib/vocabulary/collection";
import { authenticatedUser, authenticationRequiredBody } from "@/lib/vocabulary/request-user";
import { nullableString } from "@/lib/vocabulary/input";

export const dynamic = "force-dynamic";

function jsonWithTrace(body: unknown, status: number, trace: TraceContext) {
  return NextResponse.json(body, { status, headers: { "x-request-id": trace.requestId } });
}

export async function GET(request: NextRequest) {
  const user = authenticatedUser(request.headers);
  if (!user) return NextResponse.json(authenticationRequiredBody(), { status: 401 });
  await ensureVocabularySchema();
  const uid = user.userId;
  await migrateLegacyEmailUserId(getVocabularyDb(), user.email, uid);
  const rows = await listCollection(getVocabularyDb(), uid);
  return NextResponse.json({ items: groupCollectionRows(rows.results) });
}

export async function POST(request: NextRequest) {
  const trace: TraceContext = { requestId: crypto.randomUUID(), flow: "collection_save" };
  const startedAt = Date.now();
  logRequestStage({ trace, stage: "request", outcome: "start" });

  const user = authenticatedUser(request.headers);
  if (!user) return jsonWithTrace(authenticationRequiredBody(), 401, trace);

  await ensureVocabularySchema();
  const uid = user.userId;
  await migrateLegacyEmailUserId(getVocabularyDb(), user.email, uid);
  const body = await request.json().catch(() => null);
  const suggestion = parseManualSentenceSaveInput(body);
  if (!suggestion) {
    logRequestStage({ trace, stage: "input_validation", outcome: "failure", errorName: "InvalidSavePayload" });
    return jsonWithTrace({ error: "A complete sentence suggestion is required.", requestId: trace.requestId }, 400, trace);
  }

  try {
    const result = await saveSentenceSuggestion({
      database: getVocabularyDb(),
      userId: uid,
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

export async function DELETE(request: NextRequest) {
  const user = authenticatedUser(request.headers);
  if (!user) return NextResponse.json(authenticationRequiredBody(), { status: 401 });
  await ensureVocabularySchema();
  await migrateLegacyEmailUserId(getVocabularyDb(), user.email, user.userId);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const encounterId = nullableString(body?.encounterId);
  if (!encounterId) return NextResponse.json({ error: "An encounter is required." }, { status: 400 });
  const deleted = await deleteCollectionEncounter(getVocabularyDb(), user.userId, encounterId);
  if (!deleted) return NextResponse.json({ error: "Encounter not found." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
