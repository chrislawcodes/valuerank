import { gql } from 'urql';

export type TempZeroModelVerification = {
  modelId: string;
  transcriptCount: number;
  adapterModes: string[];
  promptHashStabilityPct: number | null;
  fingerprintDriftPct: number | null;
  decisionMatchRatePct: number | null;
};

export type TempZeroVerificationReport = {
  generatedAt: string;
  transcriptCount: number;
  batchTimestamp: string | null;
  models: TempZeroModelVerification[];
};

export type TempZeroVerificationReportQueryResult = {
  tempZeroVerificationReport: TempZeroVerificationReport | null;
};

export type TempZeroVerificationReportQueryVariables = Record<string, never>;

export const TEMP_ZERO_VERIFICATION_REPORT_QUERY = gql`
  query TempZeroVerificationReport {
    tempZeroVerificationReport {
      generatedAt
      transcriptCount
      batchTimestamp
      models {
        modelId
        transcriptCount
        adapterModes
        promptHashStabilityPct
        fingerprintDriftPct
        decisionMatchRatePct
      }
    }
  }
`;
