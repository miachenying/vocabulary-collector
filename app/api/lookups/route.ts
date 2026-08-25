import { NextRequest, NextResponse } from "next/server";
import { completeV2Lookup, failV2Lookup, startV2Lookup } from "@/lib/vocabulary/compatibility";
import { ensureVocabularySchema, getVocabularyDb } from "@/lib/vocabulary/database";
import { findEntry, findEntryById, mapEntry, updateChineseDefinition, upsertLookupEntry } from "@/lib/vocabulary/entries";
import { createLookupEvent, deleteLookupEvent, getHistory } from "@/lib/vocabulary/history";
import { classifyInputV2, normalizeTerm, nullableString } from "@/lib/vocabulary/input";
import { canonicalizeExpression } from "@/lib/vocabulary/language-judgment";
import { getVocabularyMeaning } from "@/lib/vocabulary/meaning-provider";

export const dynamic = "force-dynamic";

function userId(request: NextRequest) {
  return request.headers.get("oai-authenticated-user-email") || "mia-local";
}

export async function POST(request: NextRequest) {
  await ensureVocabularySchema();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const displayTerm = nullableString(body?.term);
  if (!displayTerm) return NextResponse.json({ error: "Please enter a word, phrase, or sentence." }, { status: 400 });
  const normalized = normalizeTerm(displayTerm);
  if (!normalized) return NextResponse.json({ error: "Please enter a word, phrase, or sentence." }, { status: 400 });

  const database = getVocabularyDb();
  const uid = userId(request);
  const now = new Date().toISOString();
  const context = nullableString(body?.context);
  const sourceTitle = nullableString(body?.sourceTitle);
  const sourceUrl = nullableString(body?.sourceUrl);
  const note = nullableString(body?.note);
  const inputTypeV2 = classifyInputV2(displayTerm);

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
      lookedUpAt: now,
    });
  } catch (error) {
    console.error("Failed to start v2 lookup mirror", error);
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

  let warning: string | null = null;
  let definition = existing?.chinese_definition as string | null | undefined;
  const isMultiWord = /\s/.test(displayTerm.trim());
  if (!definition || context || isMultiWord) {
    try {
      const meaning = await getVocabularyMeaning(displayTerm, inputTypeV2, context);
      definition = meaning.chineseMeaning;
      await updateChineseDefinition(database, entryId, definition);
    } catch (error) {
      console.error("Meaning provider failed", error);
      warning = "词已经保存，但这次中文解释暂时没有生成。请稍后再查一次。";
    }
  }

  if (v2LookupEventId) {
    if (definition && !warning) {
      try {
        const canonicalForm = inputTypeV2 === "phrase"
          ? await canonicalizeExpression(displayTerm, context, normalized)
          : normalized;

        await completeV2Lookup({
          database,
          userId: uid,
          rawInput: displayTerm,
          inputType: inputTypeV2,
          contextSentence: context,
          sourceTitle,
          sourceUrl,
          lookedUpAt: now,
          lookupEventId: v2LookupEventId,
          canonicalForm,
          chineseMeaning: definition,
        });
      } catch (error) {
        console.error("Failed to complete v2 lookup mirror", error);
      }
    } else {
      try {
        await failV2Lookup(database, uid, v2LookupEventId);
      } catch (error) {
        console.error("Failed to mark v2 lookup mirror as failed", error);
      }
    }
  }

  const entry = await findEntryById(database, entryId);
  return NextResponse.json({
    entry: entry ? mapEntry(entry) : null,
    warning,
  }, { status: warning ? 202 : 200 });
}

export async function GET(request: NextRequest) {
  await ensureVocabularySchema();
  const start = request.nextUrl.searchParams.get("start");
  const end = request.nextUrl.searchParams.get("end");
  if (!start || !end || Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) {
    return NextResponse.json({ error: "Valid start and end dates are required." }, { status: 400 });
  }

  const uid = userId(request);
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
  await ensureVocabularySchema();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const eventId = nullableString(body?.eventId);
  if (!eventId) return NextResponse.json({ error: "A history record is required." }, { status: 400 });

  const deleted = await deleteLookupEvent(getVocabularyDb(), userId(request), eventId);
  if (!deleted) return NextResponse.json({ error: "History record not found." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
