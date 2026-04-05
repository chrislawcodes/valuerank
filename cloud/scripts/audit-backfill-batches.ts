#!/usr/bin/env tsx
/**
 * Read-only audit for completed runs that still need backfill work.
 *
 * This report splits the work into three buckets:
 * - missing transcripts
 * - missing summaries
 * - missing analysis
 *
 * Usage:
 *   npm run audit:backfill-batches
 *   npm run audit:backfill-batches -- --output ../docs/feature-runs/domain-coverage-completeness-guard/backfill-audit.md
 *   npm run audit:backfill-batches -- --limit 25
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { db } from '../packages/db/src/index.js';
import {
  findMissingTranscriptKeys,
  normalizeSamplesPerScenario,
  type TranscriptKey,
} from '../apps/api/src/services/run/coverage-completeness.js';

type CliOptions = {
  help: boolean;
  limit: number | null;
  output: string | null;
};

type BackfillRun = {
  id: string;
  definitionId: string;
  status: string;
  runCategory: string;
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
    summarizedAt: Date | null;
    decisionMetadata: unknown | null;
  }>;
  analysisResults: Array<{
    analysisType: string;
  }>;
};

type BackfillRow = {
  runId: string;
  definitionId: string;
  definitionName: string;
  definitionVersion: number;
  runCategory: string;
  createdAt: string;
  issueCategories: Array<'transcripts' | 'summaries' | 'analysis'>;
  missingTranscriptKeyCount: number;
  unsummarizedTranscriptCount: number;
  failedSummaryTranscriptCount: number;
  currentAnalysisTypes: string[];
  missingTranscriptModels: string[];
};

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    help: false,
    limit: null,
    output: null,
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
      continue;
    }
    if (arg === '--output') {
      const raw = args[index + 1];
      if (raw === undefined) {
        throw new Error('--output requires a value');
      }
      options.output = raw;
      index += 1;
    }
  }

  return options;
}

function printUsage(): void {
  console.log(
    [
      'Usage: npm run audit:backfill-batches -- [--limit N] [--output FILE]',
      '',
      'Prints completed runs that still need backfill work.',
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

function stringifyCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function formatTable(rows: string[][]): string {
  if (rows.length === 0) {
    return '_None_';
  }

  const widths = rows[0]!.map((_, columnIndex) =>
    Math.max(...rows.map((row) => row[columnIndex]?.length ?? 0)),
  );

  const renderRow = (row: string[]): string =>
    `| ${row.map((cell, columnIndex) => cell.padEnd(widths[columnIndex] ?? cell.length)).join(' | ')} |`;

  const header = renderRow(rows[0]!);
  const separator = `| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`;
  const body = rows.slice(1).map(renderRow).join('\n');

  return [header, separator, body].filter(Boolean).join('\n');
}

function summarizeRun(run: BackfillRun): BackfillRow | null {
  const runConfig = run.config as { models?: unknown; samplesPerScenario?: unknown } | null;
  const scenarioIds = run.scenarioSelections.map((selection) => selection.scenarioId);
  const models = Array.isArray(runConfig?.models)
    ? runConfig.models.filter((value): value is string => typeof value === 'string')
    : [];
  const samplesPerScenario = normalizeSamplesPerScenario(runConfig?.samplesPerScenario);

  const presentTranscripts = run.transcripts
    .map(toTranscriptKey)
    .filter((transcript): transcript is TranscriptKey => transcript !== null);

  const missingTranscriptKeys = scenarioIds.length === 0 || models.length === 0
    ? []
    : findMissingTranscriptKeys({
      scenarioIds,
      models,
      samplesPerScenario,
      existingTranscripts: presentTranscripts,
    });

  const unsummarizedTranscriptCount = run.transcripts.filter((transcript) => transcript.summarizedAt === null).length;
  const failedSummaryTranscriptCount = run.transcripts.filter(
    (transcript) => transcript.summarizedAt !== null && transcript.decisionMetadata === null,
  ).length;
  const currentAnalysisTypes = Array.from(new Set(run.analysisResults.map((analysis) => analysis.analysisType))).sort();

  const issueCategories: Array<'transcripts' | 'summaries' | 'analysis'> = [];
  if (missingTranscriptKeys.length > 0) issueCategories.push('transcripts');
  if (unsummarizedTranscriptCount > 0 || failedSummaryTranscriptCount > 0) issueCategories.push('summaries');
  if (currentAnalysisTypes.length === 0) issueCategories.push('analysis');

  if (issueCategories.length === 0) {
    return null;
  }

  const missingTranscriptModels = Array.from(new Set(missingTranscriptKeys.map((key) => key.modelId))).sort();

  return {
    runId: run.id,
    definitionId: run.definitionId,
    definitionName: run.definition.name,
    definitionVersion: run.definition.version,
    runCategory: run.runCategory,
    createdAt: run.createdAt.toISOString(),
    issueCategories,
    missingTranscriptKeyCount: missingTranscriptKeys.length,
    unsummarizedTranscriptCount,
    failedSummaryTranscriptCount,
    currentAnalysisTypes,
    missingTranscriptModels,
  };
}

function formatReport(rows: BackfillRow[], totals: {
  scanned: number;
  transcriptBackfillRuns: number;
  transcriptBackfillKeys: number;
  summaryBackfillRuns: number;
  summaryBackfillTranscripts: number;
  analysisBackfillRuns: number;
}): string {
  const combinedRows = rows.map((row) => [
    row.createdAt,
    row.runId,
    row.definitionName,
    `v${row.definitionVersion}`,
    row.runCategory,
    row.issueCategories.join(', '),
    row.missingTranscriptKeyCount.toString(),
    row.unsummarizedTranscriptCount.toString(),
    row.failedSummaryTranscriptCount.toString(),
    row.currentAnalysisTypes.length > 0 ? row.currentAnalysisTypes.join(', ') : 'none',
  ]);

  const transcriptRows = rows
    .filter((row) => row.issueCategories.includes('transcripts'))
    .map((row) => [
      row.createdAt,
      row.runId,
      row.definitionName,
      `v${row.definitionVersion}`,
      row.runCategory,
      row.missingTranscriptKeyCount.toString(),
      row.missingTranscriptModels.length > 0 ? row.missingTranscriptModels.join(', ') : 'unknown',
    ]);

  const summaryRows = rows
    .filter((row) => row.issueCategories.includes('summaries'))
    .map((row) => [
      row.createdAt,
      row.runId,
      row.definitionName,
      `v${row.definitionVersion}`,
      row.runCategory,
      row.unsummarizedTranscriptCount.toString(),
      row.failedSummaryTranscriptCount.toString(),
      (row.unsummarizedTranscriptCount + row.failedSummaryTranscriptCount).toString(),
    ]);

  const analysisRows = rows
    .filter((row) => row.issueCategories.includes('analysis'))
    .map((row) => [
      row.createdAt,
      row.runId,
      row.definitionName,
      `v${row.definitionVersion}`,
      row.runCategory,
      row.currentAnalysisTypes.length > 0 ? row.currentAnalysisTypes.join(', ') : 'none',
    ]);

  return [
    '# Backfill Audit',
    '',
    'Scope: completed, non-deleted runs in the current local production dump.',
    '',
    '## Summary',
    '',
    `- Runs scanned: ${totals.scanned}`,
    `- Runs needing any backfill: ${rows.length}`,
    `- Runs missing transcripts: ${totals.transcriptBackfillRuns}`,
    `- Missing transcript keys: ${totals.transcriptBackfillKeys}`,
    `- Runs missing summaries: ${totals.summaryBackfillRuns}`,
    `- Missing summary transcripts: ${totals.summaryBackfillTranscripts}`,
    `- Runs missing analysis: ${totals.analysisBackfillRuns}`,
    '',
    '## Combined Backfill Queue',
    '',
    formatTable([
      ['createdAt', 'runId', 'definition', 'version', 'category', 'issues', 'missingTranscripts', 'unsummarized', 'failedSummaries', 'currentAnalysisTypes'],
      ...combinedRows,
    ]),
    '',
    '## Missing Transcripts',
    '',
    formatTable([
      ['createdAt', 'runId', 'definition', 'version', 'category', 'missingKeys', 'missingModels'],
      ...transcriptRows,
    ]),
    '',
    '## Missing Summaries',
    '',
    formatTable([
      ['createdAt', 'runId', 'definition', 'version', 'category', 'unsummarized', 'failed', 'totalSummaryIssues'],
      ...summaryRows,
    ]),
    '',
    '## Missing Analysis',
    '',
    formatTable([
      ['createdAt', 'runId', 'definition', 'version', 'category', 'currentAnalysisTypes'],
      ...analysisRows,
    ]),
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  const { help, limit, output } = parseArgs();
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
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
    select: {
      id: true,
      definitionId: true,
      runCategory: true,
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
          summarizedAt: true,
          decisionMetadata: true,
        },
      },
      analysisResults: {
        where: {
          deletedAt: null,
          status: 'CURRENT',
        },
        select: {
          analysisType: true,
        },
      },
    },
  });

  const auditRows = runs
    .map(summarizeRun)
    .filter((row): row is BackfillRow => row !== null);

  const visibleRows = limit === null ? auditRows : auditRows.slice(0, limit);

  const totals = {
    scanned: runs.length,
    transcriptBackfillRuns: auditRows.filter((row) => row.issueCategories.includes('transcripts')).length,
    transcriptBackfillKeys: auditRows.reduce((sum, row) => sum + row.missingTranscriptKeyCount, 0),
    summaryBackfillRuns: auditRows.filter((row) => row.issueCategories.includes('summaries')).length,
    summaryBackfillTranscripts: auditRows.reduce((sum, row) => sum + row.unsummarizedTranscriptCount + row.failedSummaryTranscriptCount, 0),
    analysisBackfillRuns: auditRows.filter((row) => row.issueCategories.includes('analysis')).length,
  };

  const report = formatReport(visibleRows, totals);

  if (output) {
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, `${report}\n`, 'utf8');
    console.log(`Wrote ${visibleRows.length} backfill row(s) to ${output}`);
  } else {
    console.log(report);
  }
}

await main();
