import { describe, it, expect } from 'vitest';
import {
  TEMP_ZERO_VERIFICATION_REPORT_QUERY,
  type TempZeroModelVerification,
  type TempZeroVerificationReport,
  type TempZeroVerificationReportQueryResult,
  type TempZeroVerificationReportQueryVariables,
} from '../../../src/api/operations/temp-zero-verification';

describe('Temp Zero Verification Operations', () => {
  it('should export TEMP_ZERO_VERIFICATION_REPORT_QUERY', () => {
    expect(TEMP_ZERO_VERIFICATION_REPORT_QUERY).toBeDefined();
    expect(TEMP_ZERO_VERIFICATION_REPORT_QUERY.kind).toBe('Document');
  });

  it('should have correct types for report result and variables', () => {
    const model: TempZeroModelVerification = {
      modelId: 'openai:gpt-4o',
      transcriptCount: 8,
      adapterModes: ['chat', 'responses'],
      promptHashStabilityPct: 88.84,
      fingerprintDriftPct: 12.35,
      decisionMatchRatePct: 99.94,
    };

    const report: TempZeroVerificationReport = {
      generatedAt: '2026-03-02T18:00:00Z',
      transcriptCount: 8,
      batchTimestamp: '2026-03-02T18:00:00Z',
      models: [model],
    };

    const result: TempZeroVerificationReportQueryResult = {
      tempZeroVerificationReport: report,
    };

    const variables: TempZeroVerificationReportQueryVariables = {};

    expect(result.tempZeroVerificationReport?.models[0]).toEqual(model);
    expect(variables).toEqual({});
  });

  it('should allow a null report result', () => {
    const result: TempZeroVerificationReportQueryResult = {
      tempZeroVerificationReport: null,
    };

    expect(result.tempZeroVerificationReport).toBeNull();
  });
});
