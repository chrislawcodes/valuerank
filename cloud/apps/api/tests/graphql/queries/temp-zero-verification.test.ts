import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthenticationError } from '@valuerank/shared';

vi.mock('@valuerank/db', () => ({
  db: {
    run: {
      findMany: vi.fn(),
    },
    transcript: {
      findMany: vi.fn(),
    },
  },
}));

import { db } from '@valuerank/db';
import { executeGraphQL } from '../../../src/graphql/index.js';

const query = `
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

function buildContent(values: {
  adapterMode?: string;
  promptHash?: string;
  systemFingerprint?: string;
}): unknown {
  const providerMetadata: Record<string, unknown> = {};

  if (values.adapterMode !== undefined) {
    providerMetadata.adapterMode = values.adapterMode;
  }

  if (values.promptHash !== undefined) {
    providerMetadata.promptHash = values.promptHash;
  }

  if (values.systemFingerprint !== undefined) {
    providerMetadata.raw = {
      system_fingerprint: values.systemFingerprint,
    };
  }

  return {
    turns: [
      {
        providerMetadata,
      },
    ],
  };
}

describe('tempZeroVerificationReport query', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an AuthenticationError when no user is present', async () => {
    const result = await executeGraphQL({
      source: query,
      contextValue: {
        user: null,
      },
    });

    expect(result.data).toMatchObject({
      tempZeroVerificationReport: null,
    });
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0]?.message).toBe('Authentication required');
    expect(result.errors?.[0]?.originalError).toBeInstanceOf(AuthenticationError);
    expect(db.run.findMany).not.toHaveBeenCalled();
    expect(db.transcript.findMany).not.toHaveBeenCalled();
  });

  it('returns an empty report shape when no temp=0 runs or transcripts exist', async () => {
    vi.mocked(db.run.findMany).mockResolvedValue([] as never);
    vi.mocked(db.transcript.findMany).mockResolvedValue([] as never);

    const result = await executeGraphQL({
      source: query,
      variableValues: { days: 7 },
      contextValue: {
        user: { id: 'user-1', email: 'user@example.com' },
      },
    });

    expect(result.errors).toBeUndefined();
    expect(result.data).toMatchObject({
      tempZeroVerificationReport: {
        transcriptCount: 0,
        daysLookedBack: 7,
        models: [],
      },
    });
    expect((result.data as { tempZeroVerificationReport: { generatedAt: string } }).tempZeroVerificationReport.generatedAt).toBeTruthy();
    expect(db.run.findMany).toHaveBeenCalledTimes(1);
    expect(db.transcript.findMany).toHaveBeenCalledWith({
      where: {
        runId: { in: [] },
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        modelId: true,
        scenarioId: true,
        decisionCode: true,
        content: true,
        createdAt: true,
      },
    });
  });

  it('groups transcripts by scenario and applies the 2-vs-3 transcript thresholds correctly', async () => {
    vi.mocked(db.run.findMany).mockResolvedValue([{ id: 'run-1' }] as never);
    vi.mocked(db.transcript.findMany).mockResolvedValue([
      {
        id: 't-a-1',
        modelId: 'model-a',
        scenarioId: 'scenario-1',
        decisionCode: 'ALLOW',
        content: buildContent({ adapterMode: 'chat', promptHash: 'prompt-1', systemFingerprint: 'fp-1' }),
        createdAt: new Date('2026-03-02T10:00:00.000Z'),
      },
      {
        id: 't-a-2',
        modelId: 'model-a',
        scenarioId: 'scenario-1',
        decisionCode: 'ALLOW',
        content: buildContent({ adapterMode: 'chat', promptHash: 'prompt-1', systemFingerprint: 'fp-2' }),
        createdAt: new Date('2026-03-02T09:00:00.000Z'),
      },
      {
        id: 't-a-3',
        modelId: 'model-a',
        scenarioId: 'scenario-1',
        decisionCode: 'ALLOW',
        content: buildContent({ adapterMode: 'chat', promptHash: 'prompt-1', systemFingerprint: 'fp-1' }),
        createdAt: new Date('2026-03-02T08:00:00.000Z'),
      },
      {
        id: 't-a-4',
        modelId: 'model-a',
        scenarioId: 'scenario-2',
        decisionCode: 'BLOCK',
        content: buildContent({ adapterMode: 'legacy', promptHash: 'prompt-2', systemFingerprint: 'fp-9' }),
        createdAt: new Date('2026-03-02T07:00:00.000Z'),
      },
      {
        id: 't-a-5',
        modelId: 'model-a',
        scenarioId: 'scenario-2',
        decisionCode: 'ALLOW',
        content: buildContent({ adapterMode: 'legacy', promptHash: 'prompt-3', systemFingerprint: 'fp-9' }),
        createdAt: new Date('2026-03-02T06:00:00.000Z'),
      },
      {
        id: 't-a-6',
        modelId: 'model-a',
        scenarioId: 'scenario-3',
        decisionCode: 'ALLOW',
        content: buildContent({ adapterMode: 'batch', systemFingerprint: 'fp-3' }),
        createdAt: new Date('2026-03-02T05:00:00.000Z'),
      },
      {
        id: 't-a-7',
        modelId: 'model-a',
        scenarioId: 'scenario-3',
        decisionCode: 'BLOCK',
        content: buildContent({ adapterMode: 'batch', promptHash: 'prompt-4', systemFingerprint: 'fp-3' }),
        createdAt: new Date('2026-03-02T04:00:00.000Z'),
      },
      {
        id: 't-a-8',
        modelId: 'model-a',
        scenarioId: 'scenario-3',
        decisionCode: 'ALLOW',
        content: buildContent({ adapterMode: 'batch', promptHash: 'prompt-4', systemFingerprint: 'fp-3' }),
        createdAt: new Date('2026-03-02T03:00:00.000Z'),
      },
      {
        id: 't-b-1',
        modelId: 'model-b',
        scenarioId: 'scenario-1',
        decisionCode: 'ALLOW',
        content: buildContent({ adapterMode: 'solo', promptHash: 'prompt-b', systemFingerprint: 'fp-b' }),
        createdAt: new Date('2026-03-02T02:00:00.000Z'),
      },
    ] as never);

    const result = await executeGraphQL({
      source: query,
      contextValue: {
        user: { id: 'user-1', email: 'user@example.com' },
      },
    });

    expect(result.errors).toBeUndefined();
    expect(result.data).toMatchObject({
      tempZeroVerificationReport: {
        transcriptCount: 9,
        daysLookedBack: 30,
        models: [
          {
            modelId: 'model-a',
            transcriptCount: 8,
            adapterModes: ['batch', 'chat', 'legacy'],
            promptHashStabilityPct: 50,
            decisionMatchRatePct: 50,
          },
          {
            modelId: 'model-b',
            transcriptCount: 1,
            adapterModes: ['solo'],
            promptHashStabilityPct: null,
            fingerprintDriftPct: null,
            decisionMatchRatePct: null,
          },
        ],
      },
    });

    const report = (result.data as {
      tempZeroVerificationReport: {
        models: Array<{
          modelId: string;
          fingerprintDriftPct: number | null;
        }>;
      };
    }).tempZeroVerificationReport;

    const modelA = report.models.find((model) => model.modelId === 'model-a');
    expect(modelA).toBeDefined();
    expect(modelA?.fingerprintDriftPct).toBeCloseTo(33.3333333333, 5);
  });
});
