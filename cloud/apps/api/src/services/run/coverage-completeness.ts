export type TranscriptKey = {
  scenarioId: string;
  modelId: string;
  sampleIndex: number;
};

export type TranscriptExpectation = {
  scenarioIds: string[];
  models: string[];
  samplesPerScenario?: number | null;
};

function transcriptKeyToString({ scenarioId, modelId, sampleIndex }: TranscriptKey): string {
  return JSON.stringify([scenarioId, modelId, sampleIndex]);
}

export function normalizeSamplesPerScenario(samplesPerScenario: unknown): number {
  return Number.isInteger(samplesPerScenario) && (samplesPerScenario as number) >= 1
    ? (samplesPerScenario as number)
    : 1;
}

export function findMissingTranscriptKeys({
  scenarioIds,
  models,
  samplesPerScenario,
  existingTranscripts,
}: TranscriptExpectation & {
  existingTranscripts: TranscriptKey[];
}): TranscriptKey[] {
  const normalizedSamplesPerScenario = normalizeSamplesPerScenario(samplesPerScenario);
  const existingKeys = new Set(existingTranscripts.map(transcriptKeyToString));
  const missing: TranscriptKey[] = [];

  for (const modelId of models) {
    for (const scenarioId of scenarioIds) {
      for (let sampleIndex = 0; sampleIndex < normalizedSamplesPerScenario; sampleIndex++) {
        const key: TranscriptKey = { scenarioId, modelId, sampleIndex };
        if (!existingKeys.has(transcriptKeyToString(key))) {
          missing.push(key);
        }
      }
    }
  }

  return missing;
}
