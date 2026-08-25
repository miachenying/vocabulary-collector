import type { DictionaryLookup } from "./dictionary";

function geminiApiKey() {
  return (globalThis as typeof globalThis & { __GEMINI_API_KEY?: string }).__GEMINI_API_KEY;
}

async function callGemini(prompt: string, systemInstruction: string, maxOutputTokens = 300) {
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
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens },
      }),
    },
  );

  if (!response.ok) throw new Error(`Gemini request failed (${response.status}).`);
  const payload = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!text) throw new Error("Gemini returned an empty result.");
  return text;
}

export async function generateChineseDefinition(term: string, context: string | null) {
  const isSingleWord = !/\s/.test(term.trim());
  const task = isSingleWord
    ? "Define the English word in concise, natural Simplified Chinese."
    : "Translate the ENTIRE English input into natural Simplified Chinese. Preserve every clause and idea in the input. Do not extract or define only selected vocabulary words.";
  const prompt = context
    ? `Task: ${task}\nEnglish input: ${term}\nOriginal context: ${context}`
    : `Task: ${task}\nEnglish input: ${term}`;

  return callGemini(
    prompt,
    "You are the translation engine for a personal English vocabulary collector. Obey the explicit Task in the user message. For any multi-word English input, translate the complete input, including every clause and idea; never answer with definitions of selected words. For a single English word, give its concise most common Simplified Chinese meaning(s), using original context when provided. Reply with only the Chinese result. Do not use markdown, bullets, examples, commentary, or repeat the English input.",
  );
}

export async function renderDictionaryMeaningInChinese(
  term: string,
  dictionary: DictionaryLookup,
  context: string | null,
) {
  const lexicalEvidence = dictionary.senses.map((sense, index) => {
    const pos = sense.partOfSpeech ? ` [${sense.partOfSpeech}]` : "";
    const example = sense.example ? ` Example: ${sense.example}` : "";
    return `${index + 1}.${pos} ${sense.definition}${example}`;
  }).join("\n");
  const contextLine = context ? `\nOriginal context: ${context}` : "";

  return callGemini(
    `English word: ${term}${contextLine}\nDictionary evidence:\n${lexicalEvidence}\n\nReturn the concise Simplified Chinese meaning that best matches the context. If no context is provided, return the most useful common meaning(s).`,
    "You convert grounded English dictionary evidence into concise, natural Simplified Chinese for a vocabulary collector. Treat the supplied dictionary definitions as the factual source. Select the sense that matches the provided context when possible. Do not invent unsupported senses. Reply with only the Chinese meaning; no markdown, bullets, examples, commentary, or English repetition.",
    160,
  );
}
