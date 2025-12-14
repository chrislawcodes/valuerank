/**
 * Run Service Index
 *
 * Re-exports all run service functions.
 */

export { startRun } from './start.js';
export type { StartRunInput, StartRunResult } from './start.js';

export {
  updateProgress,
  incrementCompleted,
  incrementFailed,
  getProgress,
  calculatePercentComplete,
  updateSummarizeProgress,
  incrementSummarizeCompleted,
  incrementSummarizeFailed,
} from './progress.js';
export type { ProgressUpdate, ProgressData } from './progress.js';

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
