export type SentenceExpressionForMeaning = {
  encounteredForm: string;
  canonicalForm: string;
  reason: "idiom" | "phrasal_verb" | "fixed_expression" | "contextual_expression";
};

export type EnrichedSentenceExpression = SentenceExpressionForMeaning & {
  chineseMeaning: string | null;
  meaningStatus: "ready" | "unavailable";
};

export type ExpressionMeaningResolver = (
  expression: SentenceExpressionForMeaning,
  sentence: string,
) => Promise<string>;

export async function enrichSentenceExpressionsWith(
  expressions: SentenceExpressionForMeaning[],
  sentence: string,
  resolveMeaning: ExpressionMeaningResolver,
): Promise<EnrichedSentenceExpression[]> {
  return Promise.all(expressions.map(async (expression) => {
    try {
      const chineseMeaning = (await resolveMeaning(expression, sentence)).trim();
      if (!chineseMeaning) throw new Error("Empty expression meaning");
      return { ...expression, chineseMeaning, meaningStatus: "ready" as const };
    } catch {
      return { ...expression, chineseMeaning: null, meaningStatus: "unavailable" as const };
    }
  }));
}
