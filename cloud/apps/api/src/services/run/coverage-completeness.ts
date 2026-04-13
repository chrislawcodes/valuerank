import { db } from '@valuerank/db';

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
  return JSON.stringify({ scenarioId, modelId, sampleIndex });
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

/**
 * Finds which (scenarioId × modelId × sampleIndex) tuples are missing transcripts
 * for a given run, by reading the run's config and scenario selections from the DB.
 *
 * Returns [] if the run does not exist or has no expected probes.
 */
export async function findMissingProbes(runId: string): Promise<TranscriptKey[]> {
  const run = await db.run.findUnique({
    where: { id: runId },
    select: {
      config: true,
      scenarioSelections: {
        select: { scenarioId: true },
      },
    },
  });

  if (run === null) {
    return [];
  }

  const config =
    run.config != null && typeof run.config === 'object'
      ? (run.config as { models?: string[]; samplesPerScenario?: number })
      : {};
  const models = config.models ?? [];
  const samplesPerScenario = normalizeSamplesPerScenario(config.samplesPerScenario);
  const scenarioIds = run.scenarioSelections.map((s) => s.scenarioId);

  const existingTranscripts = await db.transcript.findMany({
    where: { runId },
    select: { scenarioId: true, modelId: true, sampleIndex: true },
  });

  const existing = existingTranscripts
    .filter((t): t is TranscriptKey => t.scenarioId !== null)
    .map(({ scenarioId, modelId, sampleIndex }) => ({ scenarioId, modelId, sampleIndex }));

  return findMissingTranscriptKeys({
    scenarioIds,
    models,
    samplesPerScenario,
    existingTranscripts: existing,
  });
}
