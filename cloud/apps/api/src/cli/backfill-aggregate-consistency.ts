#!/usr/bin/env tsx

import { fileURLToPath } from 'url';
import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { updateAggregateRun } from '../services/analysis/aggregate.js';
import { zRunConfig } from '../services/analysis/aggregate/contracts.js';
import { isRecord } from '../utils/isRecord.js';

const log = createLogger('cli:backfill-aggregate-consistency');
const BATCH_SIZE = 100;

type CliOptions = {
  dryRun: boolean;
  force: boolean;
  definitionId: string | null;
  domainId: string | null;
};

type BackfillRow = {
  id: string;
  runId: string;
  output: unknown;
  run: {
    definitionId: string;
    config: unknown;
    definition: {
      domainId: string | null;
    } | null;
  };
};

function readOptionValue(argv: string[], flag: string): string | null {
  const direct = argv.find((arg) => arg.startsWith(`${flag}=`));
  if (direct != null) {
    const value = direct.slice(flag.length + 1).trim();
    return value === '' ? null : value;
  }

  const index = argv.indexOf(flag);
  if (index === -1) return null;
  const value = argv[index + 1];
  if (value == null || value.startsWith('--')) return null;
  return value.trim() === '' ? null : value;
}

export function parseOptions(argv: string[]): CliOptions {
  return {
    dryRun: argv.includes('--dry-run'),
    force: argv.includes('--force'),
    definitionId: readOptionValue(argv, '--definition-id'),
    domainId: readOptionValue(argv, '--domain-id'),
  };
}

function hasUpgradedReliabilityShape(output: unknown): boolean {
  if (!isRecord(output)) return false;
  const reliabilitySummary = output.reliabilitySummary;
  if (!isRecord(reliabilitySummary)) return false;
  const perModel = reliabilitySummary.perModel;
  if (!isRecord(perModel)) return false;

  const modelEntries = Object.values(perModel);
  if (modelEntries.length === 0) return false;

  return modelEntries.every((entry) => {
    if (!isRecord(entry)) return false;
    const perPair = entry.perPair;
    if (!isRecord(perPair)) return false;
    return Object.keys(perPair).length > 0;
  });
}

function parseSelection(config: unknown): {
  preambleVersionId: string | null;
  definitionVersion: number | null;
  temperature: number | null;
} | null {
  const parsed = zRunConfig.safeParse(config);
  if (!parsed.success) return null;

  const snapshot = parsed.data.definitionSnapshot;
  const meta = isRecord(snapshot) && isRecord(snapshot._meta) ? snapshot._meta : null;
  const rawDefinitionVersion = meta == null ? undefined : meta.definitionVersion;

  const preambleVersionId =
    meta != null && typeof meta.preambleVersionId === 'string' && meta.preambleVersionId.trim() !== ''
      ? meta.preambleVersionId
      : null;
  const definitionVersion =
    typeof rawDefinitionVersion === 'number' && Number.isFinite(rawDefinitionVersion)
      ? rawDefinitionVersion
      : typeof rawDefinitionVersion === 'string' && rawDefinitionVersion.trim() !== '' && Number.isFinite(Number(rawDefinitionVersion))
        ? Number(rawDefinitionVersion)
        : null;
  const temperature = typeof parsed.data.temperature === 'number' && Number.isFinite(parsed.data.temperature)
    ? parsed.data.temperature
    : null;

  return {
    preambleVersionId,
    definitionVersion,
    temperature,
  };
}

export async function runBackfill(options: CliOptions): Promise<{
  inspected: number;
  upgraded: number;
  skipped: number;
  failed: number;
  failedRowIds: string[];
}> {
  let inspected = 0;
  let upgraded = 0;
  let skipped = 0;
  let failed = 0;
  const failedRowIds: string[] = [];

  let cursor: string | undefined;
  let hasNextPage = true;

  while (hasNextPage) {
    const runWhere = {
      ...(options.definitionId != null ? { definitionId: options.definitionId } : {}),
      ...(options.domainId != null ? { definition: { domainId: options.domainId } } : {}),
    };

    const rows: BackfillRow[] = await db.analysisResult.findMany({
      where: {
        analysisType: 'AGGREGATE',
        status: 'CURRENT',
        ...(Object.keys(runWhere).length > 0 ? { run: runWhere } : {}),
      },
      select: {
        id: true,
        runId: true,
        output: true,
        run: {
          select: {
            definitionId: true,
            config: true,
            definition: {
              select: {
                domainId: true,
              },
            },
          },
        },
      },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      ...(cursor != null ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      inspected += 1;

      if (!options.force && hasUpgradedReliabilityShape(row.output)) {
        skipped += 1;
        log.info({ analysisId: row.id, runId: row.runId }, 'backfill:skipped');
        continue;
      }

      const selection = parseSelection(row.run.config);
      if (selection == null) {
        failed += 1;
        failedRowIds.push(row.id);
        log.error({ analysisId: row.id, runId: row.runId }, 'backfill:failed (malformed config)');
        continue;
      }

      if (options.dryRun) {
        upgraded += 1;
        log.info({ analysisId: row.id, runId: row.runId, definitionId: row.run.definitionId }, 'backfill:would-upgrade');
        continue;
      }

      try {
        await updateAggregateRun(
          row.run.definitionId,
          selection.preambleVersionId,
          selection.definitionVersion,
          selection.temperature,
        );
        upgraded += 1;
        log.info({ analysisId: row.id, runId: row.runId, definitionId: row.run.definitionId }, 'backfill:upgraded');
      } catch (error) {
        failed += 1;
        failedRowIds.push(row.id);
        log.error({ analysisId: row.id, runId: row.runId, err: error }, 'backfill:failed');
      }
    }

    cursor = rows[rows.length - 1]?.id;
    hasNextPage = rows.length === BATCH_SIZE && cursor != null;
  }

  return { inspected, upgraded, skipped, failed, failedRowIds };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  log.info(
    {
      dryRun: options.dryRun,
      definitionId: options.definitionId,
      domainId: options.domainId,
    },
    'Starting aggregate consistency backfill',
  );

  const summary = await runBackfill(options);

  log.info(summary, 'Aggregate consistency backfill complete');
  if (summary.failedRowIds.length > 0) {
    log.error({ failedRowIds: summary.failedRowIds }, 'Some aggregate rows failed to backfill');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    log.error({ err: error }, 'Fatal error');
    process.exit(1);
  });
}
