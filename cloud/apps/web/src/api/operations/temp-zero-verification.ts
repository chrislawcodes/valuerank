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
  daysLookedBack: number;
  models: TempZeroModelVerification[];
};

export type TempZeroVerificationReportQueryResult = {
  tempZeroVerificationReport: TempZeroVerificationReport;
};

export type TempZeroVerificationReportQueryVariables = {
  days?: number;
};

export const TEMP_ZERO_VERIFICATION_REPORT_QUERY = gql`
  query TempZeroVerificationReport($days: Int) {
    tempZeroVerificationReport(days: $days) {
      generatedAt
      transcriptCount
      daysLookedBack
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
