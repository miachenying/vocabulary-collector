import { NextRequest, NextResponse } from "next/server";
import { completeV2Lookup, failV2Lookup, startV2Lookup } from "@/lib/vocabulary/compatibility";
import { ensureVocabularySchema, getVocabularyDb, migrateLegacyEmailUserId } from "@/lib/vocabulary/database";
import { findEntry, findEntryById, mapEntry, updateChineseDefinition, upsertLookupEntry } from "@/lib/vocabulary/entries";
import { createLookupEvent, deleteLookupEvent, getHistory } from "@/lib/vocabulary/history";
import { classifyInputV2, normalizeTerm, nullableString } from "@/lib/vocabulary/input";
import { canonicalizeExpression } from "@/lib/vocabulary/language-judgment";
import { getVocabularyMeaning } from "@/lib/vocabulary/meaning-provider";
import { findCachedMeaning, storeCachedMeaning } from "@/lib/vocabulary/meaning-cache";
import { logRequestStage, type TraceContext } from "@/lib/vocabulary/observability";
import { analyzeSentence, type EnrichedSentenceExpression } from "@/lib/vocabulary/sentence-pipeline";
import { authenticatedUser, authenticationRequiredBody } from "@/lib/vocabulary/request-user";

export const dynamic = "force-dynamic";

function jsonWithTrace(body: unknown, status: number, trace: TraceContext) {
  return NextResponse.json(body, { status, headers: { "x-request-id": trace.requestId } });
}

export async function POST(request: NextRequest) {
  const trace: TraceContext = { requestId: crypto.randomUUID(), flow: "lookup" };
  const requestStartedAt = Date.now();
  logRequestStage({ trace, stage: "request", outcome: "start" });

  const user = authenticatedUser(request.headers);
  if (!user) return jsonWithTrace(authenticationRequiredBody(), 401, trace);

  await ensureVocabularySchema();
  const uid = user.userId;
  await migrateLegacyEmailUserId(getVocabularyDb(), user.email, uid);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const displayTerm = nullableString(body?.term);
  if (!displayTerm) {
    logRequestStage({ trace, stage: "input_validation", outcome: "failure", errorName: "MissingInput" });
    return jsonWithTrace({ error: "Please enter a word, phrase, or sentence.", requestId: trace.requestId }, 400, trace);
  }
  const normalized = normalizeTerm(displayTerm);
  if (!normalized) {
    logRequestStage({ trace, stage: "input_validation", outcome: "failure", errorName: "EmptyNormalizedInput" });
    return jsonWithTrace({ error: "Please enter a word, phrase, or sentence.", requestId: trace.requestId }, 400, trace);
  }

  const database = getVocabularyDb();
  const now = new Date().toISOString();
  const context = nullableString(body?.context);
  const sourceTitle = nullableString(body?.sourceTitle);
  const sourceUrl = nullableString(body?.sourceUrl);
  const note = nullableString(body?.note);
  const inputTypeV2 = classifyInputV2(displayTerm);
  logRequestStage({ trace, stage: "classification", outcome: "success", inputType: inputTypeV2 });

  let v2LookupEventId: string | null = null;
  try {
    v2LookupEventId = await startV2Lookup({
      database,
      userId: uid,
      rawInput: displayTerm,
      inputType: inputTypeV2,
      contextSentence: context,
      sourceTitle,
      sourceUrl,
      note,
      lookedUpAt: now,
    });
    logRequestStage({ trace, stage: "lookup_history_start", outcome: "success", inputType: inputTypeV2 });
  } catch (error) {
    console.error("Failed to start v2 lookup mirror", error);
    logRequestStage({ trace, stage: "lookup_history_start", outcome: "partial", inputType: inputTypeV2, errorName: error instanceof Error ? error.name : "UnknownError" });
  }

  const existing = await findEntry(database, uid, normalized);
  const entryId = existing?.id as string | undefined ?? crypto.randomUUID();

  await upsertLookupEntry({
    database,
    existing,
    entryId,
    userId: uid,
    normalizedTerm: normalized,
    displayTerm,
    context,
    sourceTitle,
    sourceUrl,
    note,
    now,
  });

  await createLookupEvent({
    database,
    entryId,
    userId: uid,
    lookedUpAt: now,
    context,
    sourceTitle,
    sourceUrl,
  });
  logRequestStage({ trace, stage: "legacy_persist", outcome: "success", inputType: inputTypeV2 });

  let warning: string | null = null;
  let definition = existing?.chinese_definition as string | null | undefined;
  let sentenceExpressions: EnrichedSentenceExpression[] = [];
  let sentenceAnalysisDegraded = false;
  const isMultiWord = /\s/.test(displayTerm.trim());
  if (inputTypeV2 === "sentence") {
    const sentenceStartedAt = Date.now();
    const analysis = await analyzeSentence(displayTerm, trace);
    if (analysis.status === "success") {
      definition = analysis.translation;
      sentenceExpressions = analysis.expressions;
      sentenceAnalysisDegraded = sentenceExpressions.some((expression) => expression.meaningStatus === "unavailable");
      await updateChineseDefinition(database, entryId, definition);
      logRequestStage({ trace, stage: "meaning", outcome: "success", durationMs: Date.now() - sentenceStartedAt, inputType: inputTypeV2, provider: "gemini" });
    } else {
      sentenceAnalysisDegraded = true;
      try {
        const meaning = await getVocabularyMeaning(displayTerm, inputTypeV2, context, trace);
        definition = meaning.chineseMeaning;
        await updateChineseDefinition(database, entryId, definition);
        logRequestStage({ trace, stage: "meaning_fallback", outcome: "partial", durationMs: Date.now() - sentenceStartedAt, inputType: inputTypeV2, provider: meaning.provider });
      } catch (error) {
        console.error("Sentence meaning fallback failed", error);
        warning = "词已经保存，但这次中文解释暂时没有生成。请稍后再查一次。";
      }
    }
  } else if (!definition || context || isMultiWord) {
    const meaningStartedAt = Date.now();
    try {
      const cached = context ? null : await findCachedMeaning(database, normalized, inputTypeV2);
      const meaning = cached ? null : await getVocabularyMeaning(displayTerm, inputTypeV2, context, trace);
      definition = cached?.chinese_meaning ?? meaning!.chineseMeaning;
      await updateChineseDefinition(database, entryId, definition);
      if (!cached && !context) await storeCachedMeaning(database, normalized, inputTypeV2, definition, meaning!.provider);
      logRequestStage({ trace, stage: "meaning", outcome: "success", durationMs: Date.now() - meaningStartedAt, inputType: inputTypeV2, provider: cached ? "cache" : meaning!.provider });
    } catch (error) {
      console.error("Meaning provider failed", error);
      warning = "词已经保存，但这次中文解释暂时没有生成。请稍后再查一次。";
      logRequestStage({ trace, stage: "meaning", outcome: "failure", durationMs: Date.now() - meaningStartedAt, inputType: inputTypeV2, errorName: error instanceof Error ? error.name : "UnknownError" });
    }
  } else {
    logRequestStage({ trace, stage: "meaning", outcome: "success", inputType: inputTypeV2, provider: "stored" });
  }

  if (v2LookupEventId) {
    if (definition && !warning) {
      try {
        const canonicalForm = inputTypeV2 === "phrase"
          ? await canonicalizeExpression(displayTerm, context, normalized, trace)
          : normalized;

        await completeV2Lookup({
          database,
          userId: uid,
          rawInput: displayTerm,
          inputType: inputTypeV2,
          contextSentence: context,
          sourceTitle,
          sourceUrl,
          note,
          lookedUpAt: now,
          lookupEventId: v2LookupEventId,
          canonicalForm,
          chineseMeaning: definition,
        });
        logRequestStage({ trace, stage: "v2_persist", outcome: "success", inputType: inputTypeV2 });
      } catch (error) {
        console.error("Failed to complete v2 lookup mirror", error);
        logRequestStage({ trace, stage: "v2_persist", outcome: "partial", inputType: inputTypeV2, errorName: error instanceof Error ? error.name : "UnknownError" });
      }
    } else {
      try {
        await failV2Lookup(database, uid, v2LookupEventId);
        logRequestStage({ trace, stage: "v2_persist", outcome: "partial", inputType: inputTypeV2 });
      } catch (error) {
        console.error("Failed to mark v2 lookup mirror as failed", error);
        logRequestStage({ trace, stage: "v2_persist", outcome: "failure", inputType: inputTypeV2, errorName: error instanceof Error ? error.name : "UnknownError" });
      }
    }
  }

  const entry = await findEntryById(database, entryId);
  const requestPartial = Boolean(warning) || sentenceAnalysisDegraded;
  const status = warning ? 202 : 200;
  logRequestStage({ trace, stage: "request", outcome: requestPartial ? "partial" : "success", durationMs: Date.now() - requestStartedAt, inputType: inputTypeV2 });
  return jsonWithTrace({
    entry: entry ? mapEntry(entry) : null,
    warning,
    requestId: trace.requestId,
    sentenceAnalysis: inputTypeV2 === "sentence" && definition
      ? { lookupEventId: v2LookupEventId, translation: definition, expressions: sentenceExpressions, status: sentenceAnalysisDegraded ? "degraded" : "ready" }
      : null,
  }, status, trace);
}

export async function GET(request: NextRequest) {
  const user = authenticatedUser(request.headers);
  if (!user) return NextResponse.json(authenticationRequiredBody(), { status: 401 });
  await ensureVocabularySchema();
  const uid = user.userId;
  await migrateLegacyEmailUserId(getVocabularyDb(), user.email, uid);
  const start = request.nextUrl.searchParams.get("start");
  const end = request.nextUrl.searchParams.get("end");
  if (!start || !end || Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) {
    return NextResponse.json({ error: "Valid start and end dates are required." }, { status: 400 });
  }

  const database = getVocabularyDb();
  const rows = await getHistory(database, uid, start, end);
  const totalLookups = rows.results.reduce((sum, row) => sum + Number(row.period_lookup_count || 0), 0);
  const repeatedWords = rows.results.filter((row) => Number(row.period_lookup_count) > 1).length;
  const newWords = rows.results.filter((row) => {
    const first = String(row.first_looked_up_at);
    return first >= start && first <= end;
  }).length;

  return NextResponse.json({ entries: rows.results.map(mapEntry), stats: { newWords, repeatedWords, totalLookups } });
}

export async function DELETE(request: NextRequest) {
  const user = authenticatedUser(request.headers);
  if (!user) return NextResponse.json(authenticationRequiredBody(), { status: 401 });
  await ensureVocabularySchema();
  const uid = user.userId;
  await migrateLegacyEmailUserId(getVocabularyDb(), user.email, uid);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const eventId = nullableString(body?.eventId);
  if (!eventId) return NextResponse.json({ error: "A history record is required." }, { status: 400 });

  const deleted = await deleteLookupEvent(getVocabularyDb(), uid, eventId);
  if (!deleted) return NextResponse.json({ error: "History record not found." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
