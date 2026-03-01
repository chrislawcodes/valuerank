import { gql } from 'urql';

export type AssumptionStatus = 'COMPUTED' | 'INSUFFICIENT_DATA';
export type TempZeroMismatchType = 'decision_flip' | 'missing_trial' | null;

export type TempZeroPreflightVignette = {
  vignetteId: string;
  title: string;
  conditionCount: number;
  rationale: string;
};

export type TempZeroPreflight = {
  title: string;
  projectedPromptCount: number;
  projectedComparisons: number;
  estimatedInputTokens: number | null;
  estimatedOutputTokens: number | null;
  estimatedCostUsd: number | null;
  selectedSignature: string | null;
  vignettes: TempZeroPreflightVignette[];
};

export type TempZeroSummary = {
  title: string;
  status: AssumptionStatus;
  matchRate: number | null;
  differenceRate: number | null;
  comparisons: number;
  excludedComparisons: number;
  modelsTested: number;
  vignettesTested: number;
  worstModelId: string | null;
  worstModelLabel: string | null;
  worstModelMatchRate: number | null;
};

export type TempZeroDecision = {
  label: string;
  transcriptId: string | null;
  decision: string | null;
  content: unknown;
};

export type TempZeroRow = {
  modelId: string;
  modelLabel: string;
  vignetteId: string;
  vignetteTitle: string;
  conditionKey: string;
  batch1: string | null;
  batch2: string | null;
  batch3: string | null;
  isMatch: boolean;
  mismatchType: TempZeroMismatchType;
  decisions: TempZeroDecision[];
};

export type AssumptionsTempZeroResult = {
  domainName: string;
  note: string | null;
  preflight: TempZeroPreflight;
  summary: TempZeroSummary;
  rows: TempZeroRow[];
  generatedAt: string;
};

export type AssumptionsTempZeroQueryResult = {
  assumptionsTempZero: AssumptionsTempZeroResult;
};

export type OrderInvarianceMismatchType = 'decision_flip' | 'missing_pair' | null;

export type OrderInvarianceRow = {
  modelId: string;
  modelLabel: string;
  vignetteId: string;
  vignetteTitle: string;
  conditionKey: string;
  baselineDecision: string | null;
  flippedDecision: string | null;
  normalizedFlippedDecision: string | null;
  isMatch: boolean;
  mismatchType: OrderInvarianceMismatchType;
  decisions: TempZeroDecision[];
};

export type AssumptionsOrderInvarianceResult = {
  domainName: string;
  note: string | null;
  preflight: TempZeroPreflight;
  summary: TempZeroSummary;
  rows: OrderInvarianceRow[];
  generatedAt: string;
};

export type AssumptionsOrderInvarianceQueryResult = {
  assumptionsOrderInvariance: AssumptionsOrderInvarianceResult;
};

export const ASSUMPTIONS_TEMP_ZERO_QUERY = gql`
  query AssumptionsTempZero {
    assumptionsTempZero {
      domainName
      note
      generatedAt
      preflight {
        title
        projectedPromptCount
        projectedComparisons
        estimatedInputTokens
        estimatedOutputTokens
        estimatedCostUsd
        selectedSignature
        vignettes {
          vignetteId
          title
          conditionCount
          rationale
        }
      }
      summary {
        title
        status
        matchRate
        differenceRate
        comparisons
        excludedComparisons
        modelsTested
        vignettesTested
        worstModelId
        worstModelLabel
        worstModelMatchRate
      }
      rows {
        modelId
        modelLabel
        vignetteId
        vignetteTitle
        conditionKey
        batch1
        batch2
        batch3
        isMatch
        mismatchType
        decisions {
          label
          transcriptId
          decision
          content
        }
      }
    }
  }
`;

export const ASSUMPTIONS_ORDER_INVARIANCE_QUERY = gql`
  query AssumptionsOrderInvariance {
    assumptionsOrderInvariance {
      domainName
      note
      generatedAt
      preflight {
        title
        projectedPromptCount
        projectedComparisons
        estimatedInputTokens
        estimatedOutputTokens
        estimatedCostUsd
        selectedSignature
        vignettes {
          vignetteId
          title
          conditionCount
          rationale
        }
      }
      summary {
        title
        status
        matchRate
        differenceRate
        comparisons
        excludedComparisons
        modelsTested
        vignettesTested
        worstModelId
        worstModelLabel
        worstModelMatchRate
      }
      rows {
        modelId
        modelLabel
        vignetteId
        vignetteTitle
        conditionKey
        baselineDecision
        flippedDecision
        normalizedFlippedDecision
        isMatch
        mismatchType
        decisions {
          label
          transcriptId
          decision
          content
        }
      }
    }
  }
`;
