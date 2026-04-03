import type {
  TempZeroModelVerification as GeneratedTempZeroModelVerification,
  TempZeroVerificationReport as GeneratedTempZeroVerificationReport,
  TempZeroVerificationReportQueryVariables as GeneratedTempZeroVerificationReportQueryVariables,
} from '../../generated/graphql';

type Defined<T> = Exclude<T, undefined>;

export type TempZeroModelVerification = {
  modelId: GeneratedTempZeroModelVerification['modelId'];
  transcriptCount: GeneratedTempZeroModelVerification['transcriptCount'];
  adapterModes: GeneratedTempZeroModelVerification['adapterModes'];
  promptHashStabilityPct: Defined<GeneratedTempZeroModelVerification['promptHashStabilityPct']>;
  fingerprintDriftPct: Defined<GeneratedTempZeroModelVerification['fingerprintDriftPct']>;
  decisionMatchRatePct: Defined<GeneratedTempZeroModelVerification['decisionMatchRatePct']>;
};

export type TempZeroVerificationReport = {
  generatedAt: Defined<GeneratedTempZeroVerificationReport['generatedAt']>;
  transcriptCount: GeneratedTempZeroVerificationReport['transcriptCount'];
  batchTimestamp: Defined<GeneratedTempZeroVerificationReport['batchTimestamp']>;
  models: Array<TempZeroModelVerification>;
};

export type TempZeroVerificationReportQueryResult = {
  tempZeroVerificationReport: TempZeroVerificationReport | null;
};

export type TempZeroVerificationReportQueryVariables = GeneratedTempZeroVerificationReportQueryVariables;

export { TempZeroVerificationReportDocument as TEMP_ZERO_VERIFICATION_REPORT_QUERY } from '../../generated/graphql';
