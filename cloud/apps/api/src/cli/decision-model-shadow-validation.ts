#!/usr/bin/env tsx

import { fileURLToPath } from 'url';
import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { buildDecisionModelShadowValidationReport } from '../services/decision-model-shadow-validation.js';

const log = createLogger('cli:decision-model-shadow-validation');

type ParsedArgs = {
  days: number;
};

function parseArgs(argv: string[]): ParsedArgs {
  const defaultDays = 30;
  const args = [...argv];
  let days = defaultDays;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--days') {
      const value = args[index + 1];
      if (value === undefined) {
        throw new Error('--days requires a numeric value');
      }
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error('--days must be a positive integer');
      }
      days = parsed;
      index += 1;
    }
  }

  return { days };
}

async function main(): Promise<void> {
  const { days } = parseArgs(process.argv.slice(2));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const transcripts = await db.transcript.findMany({
    where: {
      deletedAt: null,
      createdAt: { gte: since },
      run: {
        status: 'COMPLETED',
      },
    },
    select: {
      id: true,
      runId: true,
      modelId: true,
      scenarioId: true,
      decisionMetadata: true,
      definitionSnapshot: true,
      scenario: {
        select: {
          orientationFlipped: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  const report = buildDecisionModelShadowValidationReport(
    transcripts.map((transcript) => ({
      transcriptId: transcript.id,
      runId: transcript.runId,
      modelId: transcript.modelId,
      scenarioId: transcript.scenarioId,
      decisionMetadata: transcript.decisionMetadata,
      definitionSnapshot: transcript.definitionSnapshot,
      orientationFlipped: transcript.scenario?.orientationFlipped,
    })),
    new Date(),
  );

  log.info(
    {
      days,
      transcriptCount: report.transcriptCount,
      exactCount: report.exactCount,
      fallbackResolvedCount: report.fallbackResolvedCount,
      ambiguousCount: report.ambiguousCount,
      unparseableCount: report.unparseableCount,
      missingMetadataCount: report.missingMetadataCount,
      comparisonEligibleCount: report.comparisonEligibleCount,
      comparisonMismatchCount: report.comparisonMismatchCount,
    },
    'Decision model shadow validation summary',
  );
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    log.error({ err: error as Error }, 'Decision model shadow validation failed');
    process.exit(1);
  });
}
