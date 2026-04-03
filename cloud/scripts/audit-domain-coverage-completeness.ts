#!/usr/bin/env tsx
/**
 * Read-only audit for runs that are processing-complete but coverage-incomplete.
 *
 * Usage:
 *   npm run audit:domain-coverage-completeness
 *   npm run audit:domain-coverage-completeness -- --limit 25
 *   npx tsx scripts/audit-domain-coverage-completeness.ts --help
 */

import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { db } from '../packages/db/src/index.js';
import {
  findMissingTranscriptKeys,
  normalizeSamplesPerScenario,
  type TranscriptKey,
} from '../apps/api/src/services/run/coverage-completeness.js';

type CliOptions = {
  help: boolean;
  limit: number | null;
};

type AuditRun = {
  id: string;
  definitionId: string;
  createdAt: Date;
  config: unknown;
  definition: {
    name: string;
    version: number;
  };
  scenarioSelections: Array<{ scenarioId: string }>;
  transcripts: Array<{
    scenarioId: string | null;
    modelId: string;
    sampleIndex: number;
  }>;
};

type CoverageState = 'COMPLETE' | 'INCOMPLETE' | 'LEGACY_UNAVAILABLE' | 'EMPTY_EXPECTATION';

type AuditRow = {
  runId: string;
  definitionId: string;
  definitionName: string;
  definitionVersion: number;
  createdAt: string;
  coverageState: CoverageState;
  expectedKeyCount: number;
  presentKeyCount: number;
  missingKeyCount: number;
  duplicateKeyCount: number;
  missingModelIds: string[];
};

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    help: false,
    limit: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--limit') {
      const raw = args[index + 1];
      if (raw === undefined) {
        throw new Error('--limit requires a value');
      }
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error('--limit must be a non-negative integer');
      }
      options.limit = parsed;
      index += 1;
    }
  }

  return options;
}

function printUsage(): void {
  console.log(
    [
      'Usage: npm run audit:domain-coverage-completeness -- [--limit N]',
      '',
      'Prints runs that are processing-complete but coverage-incomplete.',
      'The output is read-only and safe to inspect before any repair work.',
    ].join('\n'),
  );
}

function toTranscriptKey(transcript: {
  scenarioId: string | null;
  modelId: string;
  sampleIndex: number;
}): TranscriptKey | null {
  if (transcript.scenarioId === null) return null;
  return {
    scenarioId: transcript.scenarioId,
    modelId: transcript.modelId,
    sampleIndex: transcript.sampleIndex,
  };
}

function summarizeRun(run: AuditRun): AuditRow {
  const runConfig = run.config as { models?: unknown; samplesPerScenario?: unknown } | null;
  const scenarioIds = run.scenarioSelections.map((selection) => selection.scenarioId);
  const models = Array.isArray(runConfig?.models)
    ? runConfig.models.filter((value): value is string => typeof value === 'string')
    : [];
  const samplesPerScenario = normalizeSamplesPerScenario(runConfig?.samplesPerScenario);

  const presentTranscripts = run.transcripts
    .map(toTranscriptKey)
    .filter((transcript): transcript is TranscriptKey => transcript !== null);
  const presentKeySet = new Set(
    presentTranscripts.map((key) => `${key.scenarioId}:${key.modelId}:${key.sampleIndex}`),
  );

  const expectedKeyCount = scenarioIds.length * models.length * samplesPerScenario;
  const presentKeyCount = presentKeySet.size;
  const missingKeys = scenarioIds.length === 0 || models.length === 0
    ? []
    : findMissingTranscriptKeys({
      scenarioIds,
      models,
      samplesPerScenario,
      existingTranscripts: presentTranscripts,
    });

  const missingKeyCount = missingKeys.length;
  const duplicateKeyCount = run.transcripts.length - presentKeyCount;
  const missingModelIds = Array.from(new Set(missingKeys.map((key) => key.modelId))).sort();

  let coverageState: CoverageState;
  if (scenarioIds.length === 0) {
    coverageState = 'LEGACY_UNAVAILABLE';
  } else if (expectedKeyCount === 0) {
    coverageState = 'EMPTY_EXPECTATION';
  } else if (missingKeyCount > 0) {
    coverageState = 'INCOMPLETE';
  } else {
    coverageState = 'COMPLETE';
  }

  return {
    runId: run.id,
    definitionId: run.definitionId,
    definitionName: run.definition.name,
    definitionVersion: run.definition.version,
    createdAt: run.createdAt.toISOString(),
    coverageState,
    expectedKeyCount,
    presentKeyCount,
    missingKeyCount,
    duplicateKeyCount,
    missingModelIds,
  };
}

function formatRow(row: AuditRow): string {
  return JSON.stringify(row);
}

async function main(): Promise<void> {
  const { help, limit } = parseArgs();
  if (help) {
    printUsage();
    return;
  }

  const runs = await db.run.findMany({
    where: {
      status: 'COMPLETED',
      deletedAt: null,
    },
    orderBy: [
      { definitionId: 'asc' },
      { createdAt: 'asc' },
    ],
    select: {
      id: true,
      definitionId: true,
      createdAt: true,
      config: true,
      definition: {
        select: {
          name: true,
          version: true,
        },
      },
      scenarioSelections: {
        select: {
          scenarioId: true,
        },
      },
      transcripts: {
        where: {
          deletedAt: null,
        },
        select: {
          scenarioId: true,
          modelId: true,
          sampleIndex: true,
        },
      },
    },
  });

  const auditRows = runs
    .map(summarizeRun)
    .filter((row) => row.coverageState !== 'COMPLETE');

  console.log('# Domain Coverage Completeness Audit');
  console.log(`Completed runs scanned: ${runs.length}`);
  console.log(`Coverage-complete runs: ${runs.length - auditRows.length}`);
  console.log(`Coverage-incomplete runs: ${auditRows.length}`);

  const stateCounts = new Map<CoverageState, number>();
  for (const row of auditRows) {
    stateCounts.set(row.coverageState, (stateCounts.get(row.coverageState) ?? 0) + 1);
  }
  console.log(`Legacy-unavailable runs: ${stateCounts.get('LEGACY_UNAVAILABLE') ?? 0}`);
  console.log(`Empty-expectation runs: ${stateCounts.get('EMPTY_EXPECTATION') ?? 0}`);
  console.log('');

  if (auditRows.length === 0) {
    console.log('No coverage-incomplete completed runs found.');
    return;
  }

  const visibleRows = limit === null ? auditRows : auditRows.slice(0, limit);
  for (const row of visibleRows) {
    console.log(formatRow(row));
  }

  if (limit !== null && auditRows.length > limit) {
    console.log(`... truncated ${auditRows.length - limit} additional row(s)`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
