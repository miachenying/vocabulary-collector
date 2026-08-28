import { NextRequest, NextResponse } from "next/server";
import { lookupEnglishWord } from "@/lib/vocabulary/dictionary";
import { classifyInputV2, nullableString } from "@/lib/vocabulary/input";
import { authenticatedUser, authenticationRequiredBody } from "@/lib/vocabulary/request-user";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!authenticatedUser(request.headers)) {
    return NextResponse.json(authenticationRequiredBody(), { status: 401 });
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const term = nullableString(body?.term);
  if (!term) return NextResponse.json({ preview: null });
  if (classifyInputV2(term) !== "word") return NextResponse.json({ preview: null });

  try {
    const preview = await lookupEnglishWord(term.trim());
    return NextResponse.json({ preview });
  } catch {
    return NextResponse.json({ preview: null });
  }
}
