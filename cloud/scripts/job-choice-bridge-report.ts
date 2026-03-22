import { promises as fs } from 'node:fs';
import path from 'node:path';

import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';

import {
  buildJobChoiceBridgeReport,
  renderJobChoiceBridgeMarkdown,
  type BridgeRunInput,
} from './job-choice-bridge-report-lib.js';

const log = createLogger('scripts:job-choice-bridge-report');

type ParsedArgs = {
  runIds: string[];
  runIdsFile: string | null;
  outputDir: string;
  baseUrl: string;
};

function parseArgs(argv: string[]): ParsedArgs {
  const runIds: string[] = [];
  let runIdsFile: string | null = null;
  let outputDir = path.resolve('output/bridge-report');
  let baseUrl = 'http://localhost:3030';

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--run-id') {
      const next = argv[index + 1];
      if (!next) throw new Error('--run-id requires a value');
      runIds.push(next);
      index += 1;
      continue;
    }
    if (arg === '--run-ids-file') {
      const next = argv[index + 1];
      if (!next) throw new Error('--run-ids-file requires a path');
      runIdsFile = next;
      index += 1;
      continue;
    }
    if (arg === '--output-dir') {
      const next = argv[index + 1];
      if (!next) throw new Error('--output-dir requires a path');
      outputDir = path.resolve(next);
      index += 1;
      continue;
    }
    if (arg === '--base-url') {
      const next = argv[index + 1];
      if (!next) throw new Error('--base-url requires a value');
      baseUrl = next;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { runIds, runIdsFile, outputDir, baseUrl };
}

async function loadRunIds(args: ParsedArgs): Promise<string[]> {
  const ids = new Set(args.runIds);

  if (args.runIdsFile) {
    const fileContent = await fs.readFile(args.runIdsFile, 'utf8');
    for (const line of fileContent.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.length > 0) {
        ids.add(trimmed);
      }
    }
  }

  return [...ids];
}

function getMethodology(content: unknown): {
  family: string | null;
  responseScale: string | null;
  pairKey: string | null;
  presentationOrder: string | null;
} {
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    return { family: null, responseScale: null, pairKey: null, presentationOrder: null };
  }

  const record = content as Record<string, unknown>;
  const methodology = record.methodology;
  if (!methodology || typeof methodology !== 'object' || Array.isArray(methodology)) {
    return { family: null, responseScale: null, pairKey: null, presentationOrder: null };
  }

  const parsed = methodology as Record<string, unknown>;
  return {
    family: typeof parsed.family === 'string' ? parsed.family : null,
    responseScale: typeof parsed.response_scale === 'string' ? parsed.response_scale : null,
    pairKey: typeof parsed.pair_key === 'string' ? parsed.pair_key : null,
    presentationOrder: typeof parsed.presentation_order === 'string' ? parsed.presentation_order : null,
  };
}

function extractTrialSignature(run: {
  definitionVersion: number | null;
  definition?: { version: number | null } | null;
  config: unknown;
}): string {
  const config = run.config as {
    definitionSnapshot?: { _meta?: { definitionVersion?: unknown }; version?: unknown };
    temperature?: unknown;
  } | null;

  const version = typeof run.definitionVersion === 'number'
    ? run.definitionVersion
    : typeof run.definition?.version === 'number'
      ? run.definition.version
      : typeof config?.definitionSnapshot?._meta?.definitionVersion === 'number'
        ? config.definitionSnapshot._meta.definitionVersion
        : typeof config?.definitionSnapshot?.version === 'number'
          ? config.definitionSnapshot.version
          : null;

  const temperature = typeof config?.temperature === 'number' ? config.temperature : null;
  const versionToken = version === null ? '?' : String(version);
  const tempToken = temperature === null ? 'd' : temperature.toFixed(3).replace(/\.?0+$/, '');
  return `v${versionToken}t${tempToken}`;
}

function extractResponseExcerpt(content: unknown): string | null {
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    return null;
  }

  const record = content as Record<string, unknown>;
  const turns = Array.isArray(record.turns) ? record.turns : [];
  for (const turn of turns) {
    if (!turn || typeof turn !== 'object' || Array.isArray(turn)) continue;
    const turnRecord = turn as Record<string, unknown>;
    if (typeof turnRecord.targetResponse === 'string' && turnRecord.targetResponse.trim().length > 0) {
      return turnRecord.targetResponse.slice(0, 240);
    }
    if (turnRecord.role === 'assistant' && typeof turnRecord.content === 'string' && turnRecord.content.trim().length > 0) {
      return turnRecord.content.slice(0, 240);
    }
  }

  return null;
}

function getDecisionMetadata(decisionMetadata: unknown): {
  parseClass: 'exact' | 'fallback_resolved' | 'ambiguous' | null;
  matchedLabel: string | null;
  responseExcerpt: string | null;
  parsePath: string | null;
} {
  if (!decisionMetadata || typeof decisionMetadata !== 'object' || Array.isArray(decisionMetadata)) {
    return { parseClass: null, matchedLabel: null, responseExcerpt: null, parsePath: null };
  }

  const record = decisionMetadata as Record<string, unknown>;
  return {
    parseClass:
      record.parseClass === 'exact' || record.parseClass === 'fallback_resolved' || record.parseClass === 'ambiguous'
        ? record.parseClass
        : null,
    matchedLabel: typeof record.matchedLabel === 'string' ? record.matchedLabel : null,
    responseExcerpt: typeof record.responseExcerpt === 'string' ? record.responseExcerpt : null,
    parsePath: typeof record.parsePath === 'string' ? record.parsePath : null,
  };
}

async function loadRuns(runIds: string[]): Promise<BridgeRunInput[]> {
  const runs = await db.run.findMany({
    where: {
      id: { in: runIds },
    },
    include: {
      definition: true,
      transcripts: {
        include: {
          scenario: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  return runs.map((run) => {
    const methodology = getMethodology(run.definition.content);
    const config = run.config as { jobChoiceLaunchMode?: unknown; methodologySafe?: unknown } | null;
    return {
      runId: run.id,
      runName: run.name,
      definitionId: run.definitionId,
      definitionName: run.definition.name,
      definitionVersion: run.definitionVersion,
      scenarioCount: run.transcripts.reduce((unique, transcript) => {
        if (transcript.scenarioId) unique.add(transcript.scenarioId);
        return unique;
      }, new Set<string>()).size,
      launchMode: typeof config?.jobChoiceLaunchMode === 'string' ? config.jobChoiceLaunchMode : null,
      methodologySafe: typeof config?.methodologySafe === 'boolean' ? config.methodologySafe : null,
      responseScale: methodology.responseScale,
      family: methodology.family,
      pairKey: methodology.pairKey,
      presentationOrder: methodology.presentationOrder,
      trialSignature: extractTrialSignature(run),
      transcripts: run.transcripts.map((transcript) => {
        const metadata = getDecisionMetadata(transcript.decisionMetadata);
        return {
          transcriptId: transcript.id,
          scenarioId: transcript.scenarioId,
          scenarioName: transcript.scenario?.name ?? null,
          modelId: transcript.modelId,
          decisionCode: transcript.decisionCode,
          decisionCodeSource: transcript.decisionCodeSource,
          parseClass: metadata.parseClass,
          matchedLabel: metadata.matchedLabel,
          responseExcerpt: metadata.responseExcerpt ?? extractResponseExcerpt(transcript.content),
          parsePath: metadata.parsePath,
        };
      }),
    };
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const runIds = await loadRunIds(args);
  if (runIds.length === 0) {
    throw new Error('Provide at least one --run-id or --run-ids-file');
  }

  const runs = await loadRuns(runIds);
  const report = buildJobChoiceBridgeReport(runs, args.baseUrl);

  await fs.mkdir(args.outputDir, { recursive: true });
  const jsonPath = path.join(args.outputDir, 'job-choice-bridge-report.json');
  const markdownPath = path.join(args.outputDir, 'job-choice-bridge-report.md');

  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(markdownPath, `${renderJobChoiceBridgeMarkdown(report)}\n`, 'utf8');

  log.info(
    {
      runCount: report.totalRuns,
      transcriptCount: report.totalTranscripts,
      jsonPath,
      markdownPath,
    },
    'Wrote Job Choice bridge report',
  );
}

main()
  .catch((error) => {
    log.error({ err: error }, 'Failed to build Job Choice bridge report');
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
