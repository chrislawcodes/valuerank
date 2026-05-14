export type PvqParseResult = {
  scores: Record<string, number | null>;
  refused: boolean;
  parseWarnings: string[];
};

function createEmptyScores(): Record<string, number | null> {
  const scores: Record<string, number | null> = {};
  for (let questionNumber = 1; questionNumber <= 40; questionNumber += 1) {
    scores[`q${questionNumber}`] = null;
  }
  return scores;
}

function extractResponseText(content: unknown): string | null {
  if (content === null || content === undefined || typeof content !== 'object' || Array.isArray(content)) {
    return null;
  }

  const record = content as Record<string, unknown>;
  const turns = record.turns;
  if (!Array.isArray(turns) || turns.length === 0) {
    return null;
  }

  const firstTurn = turns[0];
  if (firstTurn === null || firstTurn === undefined || typeof firstTurn !== 'object' || Array.isArray(firstTurn)) {
    return null;
  }

  const response = (firstTurn as Record<string, unknown>).targetResponse;
  return typeof response === 'string' ? response : null;
}

export function parseFullPvqScores(content: unknown): PvqParseResult {
  const emptyScores = createEmptyScores();
  const responseText = extractResponseText(content);
  if (responseText === null) {
    return {
      scores: emptyScores,
      refused: true,
      parseWarnings: ['Could not extract response text from transcript content'],
    };
  }

  const scores = createEmptyScores();
  const parseWarnings: string[] = [];
  const seen = new Set<string>();
  const pattern = /^Q(\d+):\s*([1-6])$/gim;
  let match: RegExpExecArray | null = pattern.exec(responseText);
  while (match !== null) {
    const questionNumberText = match[1];
    const scoreText = match[2];
    if (questionNumberText !== undefined && scoreText !== undefined) {
      const questionNumber = Number.parseInt(questionNumberText, 10);
      if (Number.isInteger(questionNumber) && questionNumber >= 1 && questionNumber <= 40) {
        const key = `q${questionNumber}`;
        if (seen.has(key)) {
          parseWarnings.push(`Duplicate Q${questionNumber} detected — used last occurrence`);
        }
        seen.add(key);
        scores[key] = Number.parseInt(scoreText, 10);
      }
    }
    match = pattern.exec(responseText);
  }

  const refused = Object.keys(scores).some((key) => scores[key] === null);
  return {
    scores,
    refused,
    parseWarnings,
  };
}
