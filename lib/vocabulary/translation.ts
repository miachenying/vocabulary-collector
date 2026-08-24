function geminiApiKey() {
  return (globalThis as typeof globalThis & { __GEMINI_API_KEY?: string }).__GEMINI_API_KEY;
}

export async function generateChineseDefinition(term: string, context: string | null) {
  const apiKey = geminiApiKey();
  if (!apiKey) throw new Error("Gemini API key is not configured.");

  const isSingleWord = !/\s/.test(term.trim());
  const task = isSingleWord
    ? "Define the English word in concise, natural Simplified Chinese."
    : "Translate the ENTIRE English input into natural Simplified Chinese. Preserve every clause and idea in the input. Do not extract or define only selected vocabulary words.";
  const prompt = context
    ? `Task: ${task}\nEnglish input: ${term}\nOriginal context: ${context}`
    : `Task: ${task}\nEnglish input: ${term}`;

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
            text: "You are the translation engine for a personal English vocabulary collector. Obey the explicit Task in the user message. For any multi-word English input, translate the complete input, including every clause and idea; never answer with definitions of selected words. For a single English word, give its concise most common Simplified Chinese meaning(s), using original context when provided. Reply with only the Chinese result. Do not use markdown, bullets, examples, commentary, or repeat the English input.",
          }],
        },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 300,
        },
      }),
    },
  );

  if (!response.ok) throw new Error(`Gemini request failed (${response.status}).`);
  const payload = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const definition = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!definition) throw new Error("Gemini returned an empty definition.");
  return definition;
}
