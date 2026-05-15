import type { PrismaClient } from '@valuerank/db';
import { describe, expect, it, vi } from 'vitest';
import { computeModelAgreement } from '../../../src/services/model-agreement/compute.js';

describe('computeModelAgreement', () => {
  it('returns the expected pairwise matrix for a seeded snapshot fixture', async () => {
    const getModelsFromDatabase = vi.fn().mockResolvedValue([
      { modelId: 'model-a', displayName: 'Model A' },
      { modelId: 'model-b', displayName: 'Model B' },
    ] as never);

    const resolveDomainAnalysisScopeDefinitions = vi.fn().mockResolvedValue({
      scope: 'ALL_DOMAINS',
      domain: { id: 'all-domains', name: 'All domains', defaultModelIds: ['model-a', 'model-b'] },
      domainIds: [],
      domains: [],
      definitions: [],
      latestDefinitions: [
        {
          id: 'def-1',
          domainId: 'domain-1',
          name: 'Definition 1',
          parentId: null,
          version: 1,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
      latestDefinitionIds: ['def-1'],
      definitionNameById: new Map([['def-1', 'Definition 1']]),
      definitionDomainIdById: new Map([['def-1', 'domain-1']]),
    } as never);

    const resolveSignatureRuns = vi.fn().mockResolvedValue({
      selectedSignature: 'sig-1',
      filteredSourceRunIds: ['run-1'],
      filteredSourceRunDefinitionById: new Map([['run-1', 'def-1']]),
      coveredDefinitionIds: new Set(['def-1']),
      missingReasonByDefinitionId: new Map(),
    } as never);

    const readModelAgreementSnapshotStateFromSnapshot = vi.fn().mockResolvedValue({
      cellLevelOutcomes: {
        'def-1::model-a::Achievement::Tradition::1::2': { aChoices: 4, bChoices: 0, neutrals: 0 },
        'def-1::model-b::Achievement::Tradition::1::2': { aChoices: 0, bChoices: 4, neutrals: 0 },
      },
      buildProgress: null,
      inputHash: 'hash-1',
    } as never);

    const queueDomainAnalysisRefresh = vi.fn().mockResolvedValue(false);
    const log = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };

    const result = await computeModelAgreement(
      {} as PrismaClient,
      {
        scope: 'ALL_DOMAINS',
        signature: 'sig-1',
        modelIds: ['model-b', 'model-a'],
        domainIds: [],
      },
      {
        getModelsFromDatabase,
        resolveDomainAnalysisScopeDefinitions,
        resolveSignatureRuns,
        readModelAgreementSnapshotStateFromSnapshot,
        queueDomainAnalysisRefresh,
        log,
      },
    );

    expect(getModelsFromDatabase).toHaveBeenCalledWith({ activeOnly: true, availableOnly: false });
    expect(resolveDomainAnalysisScopeDefinitions).toHaveBeenCalledWith({
      scope: 'ALL_DOMAINS',
      domainId: 'all-domains',
      domainIds: [],
    });
    expect(resolveSignatureRuns).toHaveBeenCalledWith(['def-1'], 'sig-1', ['model-a', 'model-b']);
    expect(readModelAgreementSnapshotStateFromSnapshot).toHaveBeenCalledWith('ALL_DOMAINS', 'all-domains', 'sig-1');
    expect(queueDomainAnalysisRefresh).not.toHaveBeenCalled();

    expect(result).toMatchObject({
      pending: false,
      buildProgress: null,
      tiedCells: 0,
      excludedNonBinaryCells: 0,
      models: [
        { modelId: 'model-a', label: 'Model A' },
        { modelId: 'model-b', label: 'Model B' },
      ],
      pairwiseAgreementMatrix: [
        {
          modelAId: 'model-a',
          modelALabel: 'Model A',
          modelBId: 'model-b',
          modelBLabel: 'Model B',
          totalCells: 1,
          percentAgreement: 0,
          cohensKappa: 0,
          kappaInterpretation: 'Slight',
          meanAbsoluteDivergence: 1,
          cohensKappaConfidenceLow: 0,
          cohensKappaConfidenceHigh: 0,
          cohensKappaConfidenceIsSymmetric: true,
        },
      ],
    });
  });
});
