/**
 * Analysis and experiment query helpers.
 * Handles experiments, comparisons, and versioned analysis results.
 */

import { createLogger, NotFoundError, ValidationError } from '@valuerank/shared';
import { db } from '../client.js';
import { loadAnalysisOutput } from '../schema-migration.js';
import type { AnalysisPlan, AnalysisOutput, DeltaData } from '../types.js';
import type { Experiment, RunComparison, AnalysisResult, Prisma } from '@prisma/client';

const log = createLogger('db:analysis');

// ============================================================================
// INPUT TYPES
// ============================================================================

export type CreateExperimentInput = {
  name: string;
  hypothesis?: string;
  analysisPlan?: AnalysisPlan;
};

export type CreateRunComparisonInput = {
  experimentId?: string;
  baselineRunId: string;
  comparisonRunId: string;
  deltaData?: DeltaData;
};

export type CreateAnalysisResultInput = {
  runId: string;
  analysisType: string;
  inputHash: string;
  codeVersion: string;
  output: AnalysisOutput;
};

export type ExperimentFilters = {
  name?: string;
  limit?: number;
  offset?: number;
};

// ============================================================================
// OUTPUT TYPES
// ============================================================================

export type ExperimentWithRuns = Experiment & {
  runs: { id: string; status: string }[];
  comparisons: RunComparison[];
};

export type AnalysisResultWithOutput = AnalysisResult & {
  parsedOutput: AnalysisOutput;
};

// ============================================================================
// EXPERIMENT OPERATIONS
// ============================================================================

/**
 * Create a new experiment.
 */
export async function createExperiment(data: CreateExperimentInput): Promise<Experiment> {
  if (!data.name?.trim()) {
    throw new ValidationError('Experiment name is required', { field: 'name' });
  }

  log.info({ name: data.name }, 'Creating experiment');

  return db.experiment.create({
    data: {
      name: data.name,
      hypothesis: data.hypothesis,
      analysisPlan: data.analysisPlan as unknown as Prisma.InputJsonValue,
    },
  });
}

/**
 * Get an experiment by ID.
 */
export async function getExperimentById(id: string): Promise<Experiment> {
  log.debug({ id }, 'Fetching experiment');

  const experiment = await db.experiment.findUnique({ where: { id } });
  if (!experiment) {
    log.warn({ id }, 'Experiment not found');
    throw new NotFoundError('Experiment', id);
  }

  return experiment;
}

/**
 * Get an experiment with its runs and comparisons.
 */
export async function getExperimentWithRuns(id: string): Promise<ExperimentWithRuns> {
  const experiment = await db.experiment.findUnique({
    where: { id },
    include: {
      runs: { select: { id: true, status: true } },
      comparisons: true,
    },
  });

  if (!experiment) {
    throw new NotFoundError('Experiment', id);
  }

  return experiment;
}

/**
 * List experiments with optional filters.
 */
export async function listExperiments(filters?: ExperimentFilters): Promise<Experiment[]> {
  log.debug({ filters }, 'Listing experiments');

  const where: Prisma.ExperimentWhereInput = {};

  if (filters?.name) {
    where.name = { contains: filters.name, mode: 'insensitive' };
  }

  return db.experiment.findMany({
    where,
    take: filters?.limit,
    skip: filters?.offset,
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Update an experiment.
 */
export async function updateExperiment(
  id: string,
  data: { name?: string; hypothesis?: string; analysisPlan?: AnalysisPlan }
): Promise<Experiment> {
  log.info({ id }, 'Updating experiment');

  await getExperimentById(id);

  const updateData: Prisma.ExperimentUpdateInput = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.hypothesis !== undefined) updateData.hypothesis = data.hypothesis;
  if (data.analysisPlan !== undefined) {
    updateData.analysisPlan = data.analysisPlan as unknown as Prisma.InputJsonValue;
  }

  return db.experiment.update({
    where: { id },
    data: updateData,
  });
}

// ============================================================================
// RUN COMPARISON OPERATIONS
// ============================================================================

/**
 * Create a run comparison.
 */
export async function createRunComparison(data: CreateRunComparisonInput): Promise<RunComparison> {
  if (!data.baselineRunId) {
    throw new ValidationError('Baseline run ID is required', { field: 'baselineRunId' });
  }
  if (!data.comparisonRunId) {
    throw new ValidationError('Comparison run ID is required', { field: 'comparisonRunId' });
  }
  if (data.baselineRunId === data.comparisonRunId) {
    throw new ValidationError('Cannot compare a run to itself', {
      field: 'comparisonRunId',
    });
  }

  log.info(
    { baselineRunId: data.baselineRunId, comparisonRunId: data.comparisonRunId },
    'Creating run comparison'
  );

  return db.runComparison.create({
    data: {
      experimentId: data.experimentId,
      baselineRunId: data.baselineRunId,
      comparisonRunId: data.comparisonRunId,
      deltaData: data.deltaData as unknown as Prisma.InputJsonValue,
    },
  });
}

/**
 * Get a run comparison by ID.
 */
export async function getRunComparisonById(id: string): Promise<RunComparison> {
  const comparison = await db.runComparison.findUnique({ where: { id } });
  if (!comparison) {
    throw new NotFoundError('RunComparison', id);
  }
  return comparison;
}

/**
 * Get all comparisons for an experiment.
 */
export async function getComparisonsForExperiment(experimentId: string): Promise<RunComparison[]> {
  return db.runComparison.findMany({
    where: { experimentId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Update comparison delta data.
 */
export async function updateRunComparisonDelta(
  id: string,
  deltaData: DeltaData
): Promise<RunComparison> {
  log.info({ id }, 'Updating comparison delta');

  await getRunComparisonById(id);

  return db.runComparison.update({
    where: { id },
    data: { deltaData: deltaData as unknown as Prisma.InputJsonValue },
  });
}

// ============================================================================
// ANALYSIS RESULT OPERATIONS
// ============================================================================

/**
 * Create a new analysis result.
 * If an existing current result exists for this run/type, it will be superseded.
 */
export async function createAnalysisResult(
  data: CreateAnalysisResultInput
): Promise<AnalysisResult> {
  if (!data.runId) {
    throw new ValidationError('Run ID is required', { field: 'runId' });
  }
  if (!data.analysisType) {
    throw new ValidationError('Analysis type is required', { field: 'analysisType' });
  }
  if (!data.inputHash) {
    throw new ValidationError('Input hash is required', { field: 'inputHash' });
  }

  log.info({ runId: data.runId, analysisType: data.analysisType }, 'Creating analysis result');

  return db.$transaction(async (tx) => {
    // Mark existing current results as superseded
    await tx.analysisResult.updateMany({
      where: {
        runId: data.runId,
        analysisType: data.analysisType,
        status: 'CURRENT',
      },
      data: { status: 'SUPERSEDED' },
    });

    // Create new current result
    return tx.analysisResult.create({
      data: {
        runId: data.runId,
        analysisType: data.analysisType,
        inputHash: data.inputHash,
        codeVersion: data.codeVersion,
        output: data.output as unknown as Prisma.InputJsonValue,
        status: 'CURRENT',
      },
    });
  });
}

/**
 * Get the latest (current) analysis result for a run and type.
 */
export async function getLatestAnalysis(
  runId: string,
  analysisType: string
): Promise<AnalysisResultWithOutput | null> {
  log.debug({ runId, analysisType }, 'Fetching latest analysis');

  const result = await db.analysisResult.findFirst({
    where: {
      runId,
      analysisType,
      status: 'CURRENT',
    },
  });

  if (!result) {
    return null;
  }

  return {
    ...result,
    parsedOutput: loadAnalysisOutput(result.output),
  };
}

/**
 * Get all analysis results for a run.
 */
export async function getAnalysisResultsForRun(runId: string): Promise<AnalysisResult[]> {
  return db.analysisResult.findMany({
    where: { runId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Get analysis history for a run and type (including superseded).
 */
export async function getAnalysisHistory(
  runId: string,
  analysisType: string
): Promise<AnalysisResultWithOutput[]> {
  const results = await db.analysisResult.findMany({
    where: { runId, analysisType },
    orderBy: { createdAt: 'desc' },
  });

  return results.map((r) => ({
    ...r,
    parsedOutput: loadAnalysisOutput(r.output),
  }));
}

/**
 * Check if analysis result can be reused (same input hash and code version).
 */
export async function findMatchingAnalysis(
  runId: string,
  analysisType: string,
  inputHash: string,
  codeVersion: string
): Promise<AnalysisResultWithOutput | null> {
  log.debug({ runId, analysisType, inputHash }, 'Looking for matching analysis');

  const result = await db.analysisResult.findFirst({
    where: {
      runId,
      analysisType,
      inputHash,
      codeVersion,
      status: 'CURRENT',
    },
  });

  if (!result) {
    return null;
  }

  return {
    ...result,
    parsedOutput: loadAnalysisOutput(result.output),
  };
}
