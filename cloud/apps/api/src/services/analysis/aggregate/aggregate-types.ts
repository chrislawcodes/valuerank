import type {
  AggregateMetadata,
  AggregateScenarioInput,
  AggregateWorkerInput,
  AggregateWorkerOutput,
  AggregateWorkerTranscript,
  AggregatedResult,
  RunConfig,
} from './contracts.js';

export type AggregateRecomputeClaim = {
  token: string;
  sourceFingerprint: string;
  leaseExpiresAt: string;
};

export type AggregateRunSelection = {
  preambleVersionId: string | null;
  definitionVersion: number | null;
  temperature: number | null;
};

export type AggregateRunPreparation = {
  definitionId: string;
  selection: AggregateRunSelection;
  scenarios: AggregateScenarioInput[];
  sourceRunIds: string[];
  analysisCount: number;
  sampleSize: number;
  templateRun: {
    createdByUserId: string | null;
    experimentId: string | null;
    config: RunConfig;
  };
  finalRunConfig: AggregateRunConfig;
  aggregateMetadataBase: Pick<
    AggregateMetadata,
    'aggregateEligibility' | 'aggregateIneligibilityReason' | 'sourceRunCount' | 'sourceRunIds' | 'conditionCoverage'
  >;
  aggregateWorkerInput: AggregateWorkerInput | null;
  aggregateWorkerTranscripts: AggregateWorkerTranscript[];
  aggregatedResult: AggregatedResult;
  claim: AggregateRecomputeClaim;
  sourceFingerprint: string;
};

export type AggregateClaimRecord = {
  aggregateRunId: string;
  createdNew: boolean;
  previousConfig: AggregateRunConfig | null;
  claim: AggregateRecomputeClaim;
};

export type AggregateRunConfig = RunConfig & {
  aggregateSourceFingerprint?: string;
  aggregateRecomputeClaim?: AggregateRecomputeClaim;
};

export type AggregateWorkerSuccessOutput = Extract<AggregateWorkerOutput, { success: true }>;

export class AggregateRecomputeRetryableError extends Error {
  retryable = true;
}
