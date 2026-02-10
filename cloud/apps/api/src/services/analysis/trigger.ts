/**
 * Analysis Trigger Service
 *
 * Queues analyze_basic jobs when a run completes.
 * Called automatically when all transcripts in a run have been summarized.
 */

import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import { getBoss } from '../../queue/boss.js';
import { DEFAULT_JOB_OPTIONS } from '../../queue/types.js';

const log = createLogger('services:analysis:trigger');

/**
 * Triggers basic analysis for a completed run.
 *
 * Fetches all transcript IDs for the run and queues an analyze_basic job.
 * The job handler will compute statistics and store results in AnalysisResult.
 *
 * @param runId - The ID of the completed run
 * @param options - Optional configuration
 * @param options.force - Force recomputation even if cached result exists
 * @returns True if job was queued, false if no transcripts to analyze
 */
export async function triggerBasicAnalysis(
  runId: string,
  options: { force?: boolean } = {}
): Promise<boolean> {
  const { force = false } = options;

  log.info({ runId, force }, 'Triggering basic analysis for run');

  // Get all successful transcripts for this run
  // Only include transcripts that have been summarized and have a decision code
  const transcripts = await db.transcript.findMany({
    where: {
      runId,
      summarizedAt: { not: null },
      decisionCode: { not: null, notIn: ['error'] },
    },
    select: { id: true },
  });

  if (transcripts.length === 0) {
    log.warn({ runId }, 'No successful transcripts to analyze');
    return false;
  }

  const transcriptIds = transcripts.map((t) => t.id);

  log.info(
    { runId, transcriptCount: transcriptIds.length, force },
    'Queueing analyze_basic job'
  );

  // Queue the analyze_basic job
  const boss = getBoss();
  if (boss === null) {
    log.error({ runId }, 'Cannot queue analysis - boss not initialized');
    return false;
  }

  const jobOptions = DEFAULT_JOB_OPTIONS['analyze_basic'];

  await boss.send('analyze_basic', {
    runId,
    transcriptIds,
    force,
  }, jobOptions);

  log.info({ runId, transcriptCount: transcriptIds.length }, 'Analyze_basic job queued');

  return true;
}

/**
 * Checks if a run has a current analysis result.
 *
 * @param runId - The ID of the run to check
 * @returns True if a current analysis exists
 */
export async function hasCurrentAnalysis(runId: string): Promise<boolean> {
  const analysis = await db.analysisResult.findFirst({
    where: {
      runId,
      status: 'CURRENT',
    },
    select: { id: true },
  });

  return analysis !== null;
}
