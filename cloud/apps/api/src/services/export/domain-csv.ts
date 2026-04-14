import type { Transcript, Scenario } from '@prisma/client';
import { db } from '@valuerank/db';

import {
  escapeCSV,
  getModelName,
  getProbePrompt,
  getTargetResponse,
  extractTrialSignature,
  type TranscriptWithScenario,
} from './csv.js';
import {
  formatDecisionDisplay,
  getDecisionPreferenceScore,
} from './decision-display.js';

export const DOMAIN_CSV_BATCH_SIZE = 1000;

export const DOMAIN_CSV_HEADERS = [
  'AI Model Name',
  'Vignette Name',
  'Trial Signature',
  'Value 1',
  'Value 2',
  'Value Chosen',
  'Decision Strength',
  'Transcript ID',
  'Probe Prompt',
  'Target Response',
] as const;

const LEVEL_LABEL_TO_SCORE: Record<string, number> = {
  negligible: 1,
  minimal: 2,
  moderate: 3,
  substantial: 4,
  full: 5,
};

type DomainTranscriptWithScenario = Transcript & {
  scenario: (Scenario & {
    definition: { name: string } | null;
  }) | null;
  run?: {
    name?: string | null;
    config?: unknown;
    definition?: { version?: number | null } | null;
  } | null;
};

type DefinitionSnapshotComponents = {
  value_first?: { token?: string };
  value_second?: { token?: string };
};

function getPromptOrderTokens(
  definitionSnapshot: unknown,
  orientationFlipped: boolean,
): { firstToken: string | null; secondToken: string | null } {
  if (definitionSnapshot == null || typeof definitionSnapshot !== 'object' || Array.isArray(definitionSnapshot)) {
    return { firstToken: null, secondToken: null };
  }

  const snapshot = definitionSnapshot as { components?: DefinitionSnapshotComponents };
  const canonicalFirst = snapshot.components?.value_first?.token ?? null;
  const canonicalSecond = snapshot.components?.value_second?.token ?? null;

  if (canonicalFirst == null || canonicalSecond == null) {
    return { firstToken: null, secondToken: null };
  }

  return orientationFlipped
    ? { firstToken: canonicalSecond, secondToken: canonicalFirst }
    : { firstToken: canonicalFirst, secondToken: canonicalSecond };
}

function getDimensionValues(scenarioContent: unknown): Record<string, string> {
  if (scenarioContent == null || typeof scenarioContent !== 'object' || Array.isArray(scenarioContent)) {
    return {};
  }

  const content = scenarioContent as { dimension_values?: unknown };
  if (
    content.dimension_values == null ||
    typeof content.dimension_values !== 'object' ||
    Array.isArray(content.dimension_values)
  ) {
    return {};
  }

  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(content.dimension_values as Record<string, unknown>)) {
    if (typeof val === 'string') {
      result[key] = val;
    }
  }
  return result;
}

function formatLeveledValue(token: string, label: string | undefined): string {
  if (label == null || label === '') {
    return token;
  }
  const score = LEVEL_LABEL_TO_SCORE[label];
  if (score == null) {
    return `${label} (${token})`;
  }
  return `${score} - ${label} (${token})`;
}

function domainTranscriptToRow(transcript: DomainTranscriptWithScenario): string[] {
  const modelName = getModelName(transcript.modelId);
  const vignetteName = transcript.scenario?.definition?.name ?? '';
  const trialSignature = extractTrialSignature(
    transcript.run?.definition?.version,
    transcript.run?.config,
  );

  const orientationFlipped = transcript.scenario?.orientationFlipped ?? false;
  const { firstToken, secondToken } = getPromptOrderTokens(
    transcript.definitionSnapshot,
    orientationFlipped,
  );

  const dimensionValues = getDimensionValues(transcript.scenario?.content);

  const value1 = firstToken != null
    ? formatLeveledValue(firstToken, dimensionValues[firstToken])
    : '';
  const value2 = secondToken != null
    ? formatLeveledValue(secondToken, dimensionValues[secondToken])
    : '';

  const decisionDisplay = formatDecisionDisplay(transcript);
  const valueChosen = decisionDisplay.favoredValueKey ?? '';
  const strengthScore = getDecisionPreferenceScore(decisionDisplay);
  const decisionStrength = strengthScore != null ? String(strengthScore) : '';

  const probePrompt = getProbePrompt(transcript as TranscriptWithScenario);
  const targetResponse = getTargetResponse(transcript as TranscriptWithScenario);

  return [
    modelName,
    vignetteName,
    trialSignature,
    value1,
    value2,
    valueChosen,
    decisionStrength,
    transcript.id,
    probePrompt,
    targetResponse,
  ];
}

export function getDomainCSVHeader(): string {
  return DOMAIN_CSV_HEADERS.join(',');
}

export function formatDomainCSVRow(transcript: DomainTranscriptWithScenario): string {
  const values = domainTranscriptToRow(transcript);
  return values.map((v) => escapeCSV(v)).join(',');
}

async function fetchTranscriptPage(
  runIds: string[],
  skip: number,
  take: number,
): Promise<DomainTranscriptWithScenario[]> {
  if (runIds.length === 0) {
    return [];
  }

  return db.transcript.findMany({
    where: {
      runId: { in: runIds },
      deletedAt: null,
    },
    include: {
      scenario: {
        include: {
          definition: {
            select: { name: true },
          },
        },
      },
      run: {
        select: {
          name: true,
          config: true,
          definition: {
            select: { version: true },
          },
        },
      },
    },
    orderBy: [{ modelId: 'asc' }, { scenarioId: 'asc' }, { id: 'asc' }],
    skip,
    take,
  });
}

export async function* iterateDomainCsvTranscriptPages(
  runIds: string[],
  batchSize: number = DOMAIN_CSV_BATCH_SIZE,
): AsyncGenerator<DomainTranscriptWithScenario[], void, void> {
  let skip = 0;
  let hasMorePages = true;

  while (hasMorePages) {
    const page = await fetchTranscriptPage(runIds, skip, batchSize);
    hasMorePages = page.length > 0;
    if (!hasMorePages) return;

    yield page;
    skip += page.length;
  }
}
