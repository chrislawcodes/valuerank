/**
 * Run Service Index
 *
 * Re-exports all run service functions.
 */

export { startRun } from './start.js';
export type { StartRunInput, StartRunResult } from './start.js';

export {
  maybeAdvanceRunStatus,
  getProgress,
  calculatePercentComplete,
} from './progress.js';
export type { ProgressData } from './progress.js';
export { computeRunProgress } from './derived-progress.js';
export type { RunProgress } from './derived-progress.js';
export { getRunExecutionBottleneck, getRunModelExecutionBottlenecks } from './bottleneck.js';
export type {
  RunExecutionBottleneck,
  ModelExecutionBottleneck,
  StageSummary,
  TimingSummary,
  BottleneckStage,
  BottleneckAction,
  BottleneckConfidence,
} from './bottleneck.js';

export {
  pauseRun,
  resumeRun,
  cancelRun,
  isRunPaused,
  isRunTerminal,
} from './control.js';

export {
  detectOrphanedRuns,
  recoverOrphanedRun,
  recoverOrphanedRuns,
  runStartupRecovery,
  RECOVERY_INTERVAL_MS,
} from './recovery.js';
export type { OrphanedRunInfo, RecoveryResult } from './recovery.js';

export {
  startRecoveryScheduler,
  stopRecoveryScheduler,
  isRecoverySchedulerRunning,
  triggerRecovery,
  signalRunActivity,
  RECOVERY_ACTIVITY_WINDOW_MS,
} from './scheduler.js';

export {
  cancelSummarization,
  restartSummarization,
} from './summarization.js';
export type {
  SummarizeProgress,
  CancelSummarizationResult,
  RestartSummarizationResult,
} from './summarization.js';

// Job Queue Service (Feature #018)
export { getJobQueueStatus } from './job-queue.js';
export type {
  JobQueueStatus,
  JobQueueStatusOptions,
  JobTypeCounts,
  JobFailure,
} from './types.js';

export {
  DOMAIN_TRIAL_DEFAULT_SAMPLE_PERCENTAGE,
  DOMAIN_TRIAL_DEFAULT_SAMPLES_PER_SCENARIO,
} from './config.js';
