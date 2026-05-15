// Bump AGREEMENT_ALGORITHM_VERSION whenever the agreement computation changes -
// it is part of the snapshot freshness check and old rows become stale on read
// when this changes.

export type ModelAgreementSnapshotInput = {
  modelIds: readonly string[];
  domainId: string | null;
  domainIds: readonly string[];
  scope: 'DOMAIN' | 'ALL_DOMAINS' | 'DOMAIN_SET';
  signature: string;
};

export type ModelAgreementSnapshotPayload = {
  pending: boolean;
  buildProgress: {
    completedRuns: number;
    totalRuns: number;
    currentRunId: string | null;
    updatedAt: string;
  } | null;
  models: Array<{
    modelId: string;
    label: string;
  }>;
  unavailableModels: Array<{
    modelId: string;
    label: string;
    reason: string;
  }>;
  excludedNonBinaryCells: number;
  tiedCells: number;
  pairwiseAgreementMatrix: Array<{
    modelAId: string;
    modelALabel: string;
    modelBId: string;
    modelBLabel: string;
    totalCells: number;
    percentAgreement: number | null;
    cohensKappa: number | null;
    kappaInterpretation: string | null;
    meanAbsoluteDivergence: number | null;
    cohensKappaConfidenceLow: number | null;
    cohensKappaConfidenceHigh: number | null;
    cohensKappaConfidenceIsSymmetric: boolean;
  }>;
  trialConsistency: Array<{
    modelId: string;
    modelLabel: string;
    cellsObserved: number;
    meanTrialConsistency: number | null;
    noisy: boolean;
  }>;
};

export type ModelAgreementSnapshotSource = 'CACHE_HIT' | 'CACHE_HIT_STALE' | 'LIVE_NON_CANONICAL' | 'BUILDING';

export const AGREEMENT_ALGORITHM_VERSION = 1;
