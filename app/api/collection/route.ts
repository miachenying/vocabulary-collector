import { NextRequest, NextResponse } from "next/server";
import { ensureVocabularySchema, getVocabularyDb } from "@/lib/vocabulary/database";
import { parseManualSentenceSaveInput } from "@/lib/vocabulary/manual-save-input";
import { saveSentenceSuggestion } from "@/lib/vocabulary/collection-save";

export const dynamic = "force-dynamic";

function userId(request: NextRequest) {
  return request.headers.get("oai-authenticated-user-email") || "mia-local";
}

export async function POST(request: NextRequest) {
  await ensureVocabularySchema();
  const body = await request.json().catch(() => null);
  const suggestion = parseManualSentenceSaveInput(body);
  if (!suggestion) {
    return NextResponse.json({ error: "A complete sentence suggestion is required." }, { status: 400 });
  }

  try {
    const result = await saveSentenceSuggestion({
      database: getVocabularyDb(),
      userId: userId(request),
      suggestion,
      now: new Date().toISOString(),
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to save sentence suggestion", error);
    const message = error instanceof Error ? error.message : "Could not save this expression.";
    const status = message.includes("not found") || message.includes("does not belong") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
