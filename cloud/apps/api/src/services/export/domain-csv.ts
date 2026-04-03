import { db } from '@valuerank/db';

import {
  POST_VARIABLE_HEADERS,
  POST_VARIABLE_HEADERS_WITH_METADATA,
  PRE_VARIABLE_HEADERS,
  type TranscriptWithScenario,
} from './csv.js';
import {
  collectVisibleDimensionColumns,
  type DimensionColumnMap,
} from './decision-display.js';

export const DOMAIN_CSV_BATCH_SIZE = 1000;

type TranscriptDimensionSource = {
  scenario: {
    content?: unknown;
  } | null;
};

function getFixedHeaders(includeDecisionMetadata: boolean): string[] {
  return includeDecisionMetadata
    ? [...PRE_VARIABLE_HEADERS, ...POST_VARIABLE_HEADERS_WITH_METADATA]
    : [...PRE_VARIABLE_HEADERS, ...POST_VARIABLE_HEADERS];
}

async function fetchTranscriptDimensionPage(
  runIds: string[],
  skip: number,
  take: number,
): Promise<TranscriptDimensionSource[]> {
  if (runIds.length === 0) {
    return [];
  }

  const transcripts = await db.transcript.findMany({
    where: {
      runId: { in: runIds },
      deletedAt: null,
    },
    select: {
      scenario: {
        select: {
          content: true,
        },
      },
    },
    orderBy: [{ modelId: 'asc' }, { scenarioId: 'asc' }, { id: 'asc' }],
    skip,
    take,
  });

  return transcripts;
}

export async function collectDomainCsvDimensionColumns(
  runIds: string[],
  includeDecisionMetadata: boolean,
  batchSize: number = DOMAIN_CSV_BATCH_SIZE,
): Promise<DimensionColumnMap> {
  const sources: TranscriptDimensionSource[] = [];
  let skip = 0;
  let hasMorePages = true;

  while (hasMorePages) {
    const page = await fetchTranscriptDimensionPage(runIds, skip, batchSize);
    hasMorePages = page.length > 0;
    if (!hasMorePages) break;

    sources.push(...page);
    skip += page.length;
  }

  return collectVisibleDimensionColumns(sources, getFixedHeaders(includeDecisionMetadata));
}

async function fetchTranscriptPage(
  runIds: string[],
  skip: number,
  take: number,
): Promise<TranscriptWithScenario[]> {
  if (runIds.length === 0) {
    return [];
  }

  return db.transcript.findMany({
    where: {
      runId: { in: runIds },
      deletedAt: null,
    },
    include: {
      scenario: true,
      run: {
        select: {
          name: true,
          config: true,
          definition: {
            select: {
              version: true,
            },
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
): AsyncGenerator<TranscriptWithScenario[], void, void> {
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
