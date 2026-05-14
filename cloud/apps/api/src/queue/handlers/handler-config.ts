/**
 * Handler configuration — queue names, types, and registration table.
 * Extracted from index.ts to keep it under the 400-line file size limit.
 */

import type { PgBoss } from 'pg-boss';
import type {
  JobType,
  ProbeScenarioJobData,
  SummarizeTranscriptJobData,
  AnalyzeBasicJobData,
  ExpandScenariosJobData,
  ComputeTokenStatsJobData,
  RunStateReconcileJobData,
  RunStateAuditJobData,
  AnalysisResultJanitorJobData,
  ProbeDeadLetterJobData,
  AggregateAnalysisJobData,
  RefreshDomainAnalysisSnapshotJobData,
  RefreshPressureSensitivitySnapshotJobData,
  RefreshWinRateStabilitySnapshotJobData,
  StartDomainLaunchJobData,
} from '../types.js';
import { createProbeScenarioHandler } from './probe-scenario/index.js';
import { createSummarizeTranscriptHandler } from './summarize-transcript.js';
import { createAnalyzeBasicHandler } from './analyze-basic.js';
import { createExpandScenariosHandler } from './expand-scenarios.js';
import { createComputeTokenStatsHandler } from './compute-token-stats.js';
import { createProbeDeadLetterHandler } from './probe-dead-letter.js';
import { createRunStateReconcileHandler } from './run-state-reconcile.js';
import { createRunStateAuditHandler } from './run-state-audit.js';
import { createAnalysisResultJanitorHandler } from './analysis-result-janitor.js';
import { createAggregateAnalysisHandler } from './aggregate-analysis.js';
import { createRefreshDomainAnalysisSnapshotHandler } from './refresh-domain-analysis-snapshot.js';
import { createRefreshPressureSensitivitySnapshotHandler } from './refresh-pressure-sensitivity-snapshot.js';
import { createRefreshWinRateStabilitySnapshotHandler } from './refresh-win-rate-stability-snapshot.js';
import { createStartDomainLaunchHandler } from './start-domain-launch.js';

// Re-export job data types for handlers
export type {
  ProbeScenarioJobData,
  SummarizeTranscriptJobData,
  AnalyzeBasicJobData,
  ExpandScenariosJobData,
  ComputeTokenStatsJobData,
  RunStateReconcileJobData,
  RunStateAuditJobData,
  AnalysisResultJanitorJobData,
  ProbeDeadLetterJobData,
  AggregateAnalysisJobData,
  RefreshDomainAnalysisSnapshotJobData,
  RefreshPressureSensitivitySnapshotJobData,
  RefreshWinRateStabilitySnapshotJobData,
  StartDomainLaunchJobData,
};

// Dead letter queue name for probe jobs
export const PROBE_DEAD_LETTER_QUEUE = 'probe_dead_letter';

// Handler registration info
export type HandlerRegistration = {
  name: JobType;
  register: (boss: PgBoss, batchSize: number) => Promise<void>;
};

export const handlerRegistrations: HandlerRegistration[] = [
  {
    name: 'probe_scenario',
    register: async (boss, batchSize) => {
      // Register for the default probe_scenario queue (fallback)
      await boss.work<ProbeScenarioJobData>(
        'probe_scenario',
        { batchSize },
        createProbeScenarioHandler()
      );
    },
  },
  {
    name: 'summarize_transcript',
    register: async (boss, batchSize) => {
      await boss.work<SummarizeTranscriptJobData>(
        'summarize_transcript',
        { batchSize },
        createSummarizeTranscriptHandler()
      );
    },
  },
  {
    name: 'analyze_basic',
    register: async (boss, batchSize) => {
      await boss.work<AnalyzeBasicJobData>(
        'analyze_basic',
        { batchSize },
        createAnalyzeBasicHandler()
      );
    },
  },
  {
    name: 'expand_scenarios',
    register: async (boss, batchSize) => {
      await boss.work<ExpandScenariosJobData>(
        'expand_scenarios',
        { batchSize },
        createExpandScenariosHandler()
      );
    },
  },
  {
    name: 'compute_token_stats',
    register: async (boss, batchSize) => {
      await boss.work<ComputeTokenStatsJobData>(
        'compute_token_stats',
        { batchSize },
        createComputeTokenStatsHandler()
      );
    },
  },
  {
    name: 'run_state_reconcile',
    register: async (boss, batchSize) => {
      await boss.work<RunStateReconcileJobData>(
        'run_state_reconcile',
        { batchSize },
        createRunStateReconcileHandler()
      );
    },
  },
  {
    name: 'run_state_audit',
    register: async (boss, batchSize) => {
      await boss.work<RunStateAuditJobData>(
        'run_state_audit',
        { batchSize },
        createRunStateAuditHandler()
      );
    },
  },
  {
    name: 'analysis_result_janitor',
    register: async (boss, batchSize) => {
      await boss.work<AnalysisResultJanitorJobData>(
        'analysis_result_janitor',
        { batchSize },
        createAnalysisResultJanitorHandler()
      );
    },
  },
  {
    name: 'probe_dead_letter',
    register: async (boss, batchSize) => {
      await boss.work<ProbeDeadLetterJobData>(
        PROBE_DEAD_LETTER_QUEUE,
        { batchSize },
        createProbeDeadLetterHandler()
      );
    },
  },
  {
    name: 'aggregate_analysis',
    register: async (boss, batchSize) => {
      await boss.work<AggregateAnalysisJobData>(
        'aggregate_analysis',
        { batchSize }, // Usually batchSize=1 effectively for aggregation if we want strict serial per worker
        createAggregateAnalysisHandler()
      );
    },
  },
  {
    name: 'refresh_domain_analysis_snapshot',
    register: async (boss, batchSize) => {
      await boss.work<RefreshDomainAnalysisSnapshotJobData>(
        'refresh_domain_analysis_snapshot',
        { batchSize },
        createRefreshDomainAnalysisSnapshotHandler()
      );
    },
  },
  {
    name: 'refresh_pressure_sensitivity_snapshot',
    register: async (boss, batchSize) => {
      await boss.work<RefreshPressureSensitivitySnapshotJobData>(
        'refresh_pressure_sensitivity_snapshot',
        { batchSize },
        createRefreshPressureSensitivitySnapshotHandler()
      );
    },
  },
  {
    name: 'refresh_win_rate_stability_snapshot',
    register: async (boss, batchSize) => {
      await boss.work<RefreshWinRateStabilitySnapshotJobData>(
        'refresh_win_rate_stability_snapshot',
        { batchSize },
        createRefreshWinRateStabilitySnapshotHandler()
      );
    },
  },
  {
    name: 'start_domain_launch',
    register: async (boss, _batchSize) => {
      const handler = createStartDomainLaunchHandler();
      await boss.work<StartDomainLaunchJobData>(
        'start_domain_launch',
        // Multiple handlers can run in parallel — each one paces itself
        // against the probe queue. batchSize=1 keeps retry semantics clean.
        { batchSize: 1 },
        async (jobs) => {
          for (const job of jobs) {
            await handler(job.data);
          }
        }
      );
    },
  },
];
