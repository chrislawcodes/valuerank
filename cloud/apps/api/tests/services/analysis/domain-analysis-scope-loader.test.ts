import { describe, expect, it } from 'vitest';
import type { AnalysisOutputRow, DomainAnalysisValuePair } from '../../../src/services/analysis/domain-analysis-cache-types.js';
import { buildContributionAndExcludedSummary } from '../../../src/services/analysis/domain-analysis-scope-loader.js';

function buildAnalysisRow(runId: string, prioritized: number): AnalysisOutputRow {
  return {
    runId,
    inputHash: 'hash',
    output: {
      perModel: {
        claude: {
          values: {
            Achievement: {
              count: {
                prioritized,
                deprioritized: 1,
                neutral: 0,
              },
            },
          },
        },
      },
    },
  };
}

describe('buildContributionAndExcludedSummary', () => {
  it('weights each contributing domain equally in all-domains mode', () => {
    const contributionSummary = buildContributionAndExcludedSummary({
      domainNameById: new Map([
        ['domain-a', 'Domain A'],
        ['domain-b', 'Domain B'],
      ]),
      definitionDomainIdById: new Map([
        ['def-a', 'domain-a'],
        ['def-b', 'domain-b'],
      ]),
      valuePairByDefinition: new Map<string, DomainAnalysisValuePair>([
        ['def-a', { valueA: 'Achievement', valueB: 'Benevolence_Dependability' }],
        ['def-b', { valueA: 'Achievement', valueB: 'Benevolence_Dependability' }],
      ]),
      analysisRows: [
        buildAnalysisRow('run-a', 9),
        buildAnalysisRow('run-b', 1),
      ],
      filteredSourceRunDefinitionById: new Map([
        ['run-a', 'def-a'],
        ['run-b', 'def-b'],
      ]),
    });

    expect(contributionSummary.contributionSummary).toEqual([
      expect.objectContaining({
        domainId: 'domain-a',
        domainName: 'Domain A',
        rawTrialCount: 10,
        share: 0.5,
      }),
      expect.objectContaining({
        domainId: 'domain-b',
        domainName: 'Domain B',
        rawTrialCount: 2,
        share: 0.5,
      }),
    ]);
  });
});
