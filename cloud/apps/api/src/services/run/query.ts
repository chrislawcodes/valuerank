import { db, type AnalysisStatus, type Prisma, type RunStatus } from '@valuerank/db';

export type RunTypeFilter = 'ALL' | 'SURVEY' | 'NON_SURVEY';

export type RunQueryFilters = {
  definitionId?: string;
  experimentId?: string | null;
  status?: RunStatus;
  hasAnalysis?: boolean;
  analysisStatus?: AnalysisStatus;
  runType?: RunTypeFilter;
};

type ResolvedRunWhere = {
  where: Prisma.RunWhereInput;
  noMatches: boolean;
};

const RUN_STATUS_VALUES = new Set<RunStatus>([
  'PENDING',
  'RUNNING',
  'PAUSED',
  'SUMMARIZING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);

const ANALYSIS_STATUS_VALUES = new Set<AnalysisStatus>(['CURRENT', 'SUPERSEDED']);

export function parseRunStatus(value: string | null | undefined): RunStatus | undefined {
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }
  return RUN_STATUS_VALUES.has(value as RunStatus) ? (value as RunStatus) : undefined;
}

export function parseAnalysisStatus(value: string | null | undefined): AnalysisStatus | undefined {
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }
  return ANALYSIS_STATUS_VALUES.has(value as AnalysisStatus)
    ? (value as AnalysisStatus)
    : undefined;
}

export function parseRunType(value: string | null | undefined): RunTypeFilter {
  if (value === 'SURVEY' || value === 'NON_SURVEY') {
    return value;
  }
  return 'ALL';
}

async function getRunIdsWithAnalysis(analysisStatus?: AnalysisStatus): Promise<string[]> {
  const analysisResults = await db.analysisResult.findMany({
    where: {
      deletedAt: null,
      ...(analysisStatus !== undefined ? { status: analysisStatus } : {}),
    },
    select: { runId: true },
    distinct: ['runId'],
  });

  return analysisResults.map((analysisResult) => analysisResult.runId);
}

export async function buildRunWhere(filters: RunQueryFilters): Promise<ResolvedRunWhere> {
  const where: Prisma.RunWhereInput = {
    deletedAt: null,
  };

  if (filters.definitionId !== undefined && filters.definitionId !== '') {
    where.definitionId = filters.definitionId;
  }

  if (filters.experimentId !== undefined && filters.experimentId !== null && filters.experimentId !== '') {
    where.experimentId = filters.experimentId;
  }

  if (filters.status !== undefined) {
    where.status = filters.status;
  }

  const runType = filters.runType ?? 'ALL';
  if (runType === 'SURVEY') {
    where.definition = {
      is: {
        name: {
          startsWith: '[Survey]',
        },
      },
    };
  } else if (runType === 'NON_SURVEY') {
    where.definition = {
      is: {
        name: {
          not: {
            startsWith: '[Survey]',
          },
        },
      },
    };
  }

  if (filters.hasAnalysis === true || filters.analysisStatus !== undefined) {
    const runIdsWithAnalysis = await getRunIdsWithAnalysis(filters.analysisStatus);
    if (runIdsWithAnalysis.length === 0) {
      return { where, noMatches: true };
    }
    where.id = { in: runIdsWithAnalysis };
  }

  return { where, noMatches: false };
}
