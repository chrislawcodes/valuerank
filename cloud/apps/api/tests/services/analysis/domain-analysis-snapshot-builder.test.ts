import { describe, expect, it, vi } from 'vitest';
import { writeSnapshot } from '../../../src/services/analysis/domain-analysis-snapshot-builder.js';

describe('writeSnapshot', () => {
  it('supersedes the prior current snapshot before creating a replacement', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const create = vi.fn().mockResolvedValue({ id: 'snapshot-next' });

    const result = await writeSnapshot({
      client: {
        assumptionAnalysisSnapshot: {
          updateMany,
          create,
        },
      } as never,
      scope: 'DOMAIN',
      domainId: 'domain-1',
      configSignature: 'vnewtd',
      inputHash: 'hash-2',
      output: {
        domainId: 'domain-1',
        domainName: 'National Priorities',
        scope: 'DOMAIN',
        totalDefinitions: 90,
        targetedDefinitions: 90,
        coveredDefinitions: 90,
        definitionsWithAnalysis: 90,
        missingDefinitions: [],
        models: [],
        contributionSummary: [],
        excludedDataSummary: [],
      },
    });

    expect(updateMany).toHaveBeenCalledOnce();
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        assumptionKey: 'domain-analysis:domain-1',
        analysisType: 'domain_overview',
        status: 'CURRENT',
        deletedAt: null,
        OR: [
          { configSignature: 'vnewtd' },
          { inputHash: 'hash-2' },
        ],
      },
      data: {
        status: 'SUPERSEDED',
      },
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        assumptionKey: 'domain-analysis:domain-1',
        configSignature: 'vnewtd',
        inputHash: 'hash-2',
        status: 'CURRENT',
      }),
    }));
    expect(result).toEqual({ id: 'snapshot-next' });
  });
});
