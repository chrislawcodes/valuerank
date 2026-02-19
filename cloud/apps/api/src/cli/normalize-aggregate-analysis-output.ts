#!/usr/bin/env tsx

import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import type { Prisma } from '@valuerank/db';
import { normalizeAnalysisArtifacts } from '../services/analysis/normalize-analysis-output.js';

const log = createLogger('cli:normalize-aggregate-analysis-output');

type CliOptions = {
  dryRun: boolean;
};

function parseOptions(argv: string[]): CliOptions {
  return {
    dryRun: argv.includes('--dry-run'),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  log.info({ dryRun: options.dryRun }, 'Starting aggregate analysis output normalization');

  const analyses = await db.analysisResult.findMany({
    where: { analysisType: 'AGGREGATE' },
    select: {
      id: true,
      runId: true,
      output: true,
    },
  });

  if (analyses.length === 0) {
    log.info('No aggregate analysis results found');
    return;
  }

  const runs = await db.run.findMany({
    where: { id: { in: analyses.map((analysis) => analysis.runId) } },
    select: {
      id: true,
      definitionId: true,
    },
  });
  const definitionByRun = new Map(runs.map((run) => [run.id, run.definitionId]));

  const uniqueDefinitionIds = Array.from(new Set(runs.map((run) => run.definitionId)));
  const scenarioMap = new Map<string, Array<{ id: string; name: string; content: unknown }>>();
  await Promise.all(uniqueDefinitionIds.map(async (definitionId) => {
    const scenarios = await db.scenario.findMany({
      where: { definitionId },
      select: { id: true, name: true, content: true },
    });
    scenarioMap.set(definitionId, scenarios);
  }));

  let inspected = 0;
  let updated = 0;
  let skipped = 0;

  for (const analysis of analyses) {
    inspected += 1;
    if (!isRecord(analysis.output)) {
      skipped += 1;
      continue;
    }

    const definitionId = definitionByRun.get(analysis.runId);
    if (!definitionId) {
      skipped += 1;
      continue;
    }

    const scenarios = scenarioMap.get(definitionId) ?? [];
    const originalViz = analysis.output.visualizationData;
    const originalVariance = analysis.output.varianceAnalysis;

    const normalized = normalizeAnalysisArtifacts({
      visualizationData: originalViz,
      varianceAnalysis: originalVariance,
      scenarios,
    });

    const vizChanged = JSON.stringify(originalViz ?? null) !== JSON.stringify(normalized.visualizationData ?? null);
    const varianceChanged = JSON.stringify(originalVariance ?? null) !== JSON.stringify(normalized.varianceAnalysis ?? null);

    if (!vizChanged && !varianceChanged) {
      continue;
    }

    updated += 1;
    if (options.dryRun) {
      log.info({ analysisId: analysis.id, runId: analysis.runId, vizChanged, varianceChanged }, 'Would normalize analysis output');
      continue;
    }

    await db.analysisResult.update({
      where: { id: analysis.id },
      data: {
        output: {
          ...analysis.output,
          visualizationData: normalized.visualizationData,
          varianceAnalysis: normalized.varianceAnalysis,
        } as Prisma.InputJsonValue,
      },
    });

    log.info({ analysisId: analysis.id, runId: analysis.runId, vizChanged, varianceChanged }, 'Normalized analysis output');
  }

  log.info({ inspected, updated, skipped, dryRun: options.dryRun }, 'Aggregate analysis output normalization complete');
}

import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    log.error({ err: err as Error }, 'Fatal error');
    process.exit(1);
  });
}
