type GeminiJsonPayload = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

function geminiApiKey() {
  return (globalThis as typeof globalThis & { __GEMINI_API_KEY?: string }).__GEMINI_API_KEY;
}

async function generateJson(prompt: string) {
  const apiKey = geminiApiKey();
  if (!apiKey) throw new Error("Gemini API key is not configured.");

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{
            text: "You perform narrow language-judgment tasks for a vocabulary application. Return only valid JSON matching the requested shape. Do not add markdown or commentary.",
          }],
        },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 200,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!response.ok) throw new Error(`Gemini judgment request failed (${response.status}).`);
  const payload = await response.json() as GeminiJsonPayload;
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!text) throw new Error("Gemini returned an empty language judgment.");
  return JSON.parse(text) as unknown;
}

export function canonicalFormFromPayload(payload: unknown, fallback: string) {
  const parsed = payload as { canonical_form?: unknown } | null;
  const canonical = parsed && typeof parsed.canonical_form === "string"
    ? parsed.canonical_form.trim()
    : "";
  return canonical || fallback;
}

export async function canonicalizeExpression(
  encounteredForm: string,
  context: string | null,
  fallback: string,
) {
  const prompt = `Task: Convert the encountered English expression into a concise reusable dictionary-style canonical form.\n
Rules:\n- Preserve the same semantic expression, not a broader or different phrase.\n- Normalize inflection, tense, and pronouns/placeholders when useful.\n- For idioms/phrasal expressions, prefer a reusable form such as "win someone over".\n- Do not invent words not needed for the expression.\n- If the input is already canonical, keep it.\n
Encountered form: ${encounteredForm}\n${context ? `Context: ${context}\n` : ""}Return exactly: {"canonical_form":"..."}`;

  try {
    return canonicalFormFromPayload(await generateJson(prompt), fallback);
  } catch (error) {
    console.error("Canonicalization failed; using deterministic fallback", error);
    return fallback;
  }
}

export type SenseMatchDecision =
  | { matchType: "existing"; senseId: string }
  | { matchType: "new"; senseId: null };

export type ExistingSense = {
  id: string;
  chineseMeaning: string;
};

export function senseMatchFromPayload(payload: unknown, existingSenses: ExistingSense[]): SenseMatchDecision {
  const parsed = payload as { match_type?: unknown; sense_id?: unknown } | null;
  if (parsed?.match_type === "existing" && typeof parsed.sense_id === "string") {
    const valid = existingSenses.some((sense) => sense.id === parsed.sense_id);
    if (valid) return { matchType: "existing", senseId: parsed.sense_id };
  }
  return { matchType: "new", senseId: null };
}

export async function matchSemanticSense(
  expression: string,
  newMeaning: string,
  context: string | null,
  existingSenses: ExistingSense[],
): Promise<SenseMatchDecision> {
  if (existingSenses.length === 0) return { matchType: "new", senseId: null };

  const prompt = `Task: Decide whether the new meaning expresses the same semantic sense as one existing sense for the same English expression.\n
Expression: ${expression}\nNew Chinese meaning: ${newMeaning}\n${context ? `Context: ${context}\n` : ""}
Existing senses:\n${existingSenses.map((sense) => `- ${sense.id}: ${sense.chineseMeaning}`).join("\n")}\n
Rules:\n- Match semantic sense, not exact wording.\n- Different translations can still be the same sense.\n- Different meanings/usages of a polysemous word or phrase are new senses.\n- If uncertain, choose new.\n
Return exactly one of:\n{"match_type":"existing","sense_id":"<existing id>"}\nor\n{"match_type":"new","sense_id":null}`;

  try {
    return senseMatchFromPayload(await generateJson(prompt), existingSenses);
  } catch (error) {
    console.error("Semantic sense matching failed; conservatively creating a new sense", error);
    return { matchType: "new", senseId: null };
  }
}
