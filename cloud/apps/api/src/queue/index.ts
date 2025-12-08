/**
 * Queue Module - Public API
 *
 * Exports queue functionality for use by the rest of the application.
 */

// Boss instance management
export { createBoss, getBoss, startBoss, stopBoss, isBossRunning } from './boss.js';

// Orchestrator
export {
  startOrchestrator,
  stopOrchestrator,
  pauseQueue,
  resumeQueue,
  getOrchestratorState,
  isOrchestratorRunning,
  isQueuePaused,
} from './orchestrator.js';

// Types
export type {
  JobType,
  JobData,
  JobOptions,
  ProbeScenarioJobData,
  AnalyzeBasicJobData,
  AnalyzeDeepJobData,
  RunProgress,
  PriorityLevel,
  TaskResult,
  JobHandler,
} from './types.js';

export {
  DEFAULT_JOB_OPTIONS,
  PRIORITY_VALUES,
} from './types.js';

// Spawn utility
export { spawnPython } from './spawn.js';
export type { SpawnPythonOptions, SpawnPythonResult } from './spawn.js';

// Handler utilities
export { getJobTypes } from './handlers/index.js';
