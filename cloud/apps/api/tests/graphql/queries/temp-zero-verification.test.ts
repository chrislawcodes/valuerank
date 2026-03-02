import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createServer } from '../../../src/server.js';
import { getAuthHeader } from '../../test-utils.js';
import { AuthenticationError } from '@valuerank/shared';

// Mock PgBoss since server creation needs it
vi.mock('../../../src/queue/boss.js', () => ({
  getBoss: vi.fn(() => ({
    send: vi.fn().mockResolvedValue('mock-job-id'),
  })),
  createBoss: vi.fn(() => ({
    send: vi.fn().mockResolvedValue('mock-job-id'),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  })),
  startBoss: vi.fn().mockResolvedValue(undefined),
  stopBoss: vi.fn().mockResolvedValue(undefined),
  isBossRunning: vi.fn().mockReturnValue(false),
}));

vi.mock('@valuerank/db', () => ({
  db: {
    run: {
      findMany: vi.fn(),
    },
    transcript: {
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

import { db } from '@valuerank/db';

const app = createServer();

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
    const response = await request(app)
      .post('/graphql')
      .send({ query });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Authentication required');
    expect(db.run.findMany).not.toHaveBeenCalled();
    expect(db.transcript.findMany).not.toHaveBeenCalled();
  });

  it('returns an empty report shape when no temp=0 runs or transcripts exist', async () => {
    vi.mocked(db.run.findMany).mockResolvedValue([] as never);
    vi.mocked(db.transcript.findMany).mockResolvedValue([] as never);
    vi.mocked(db.user.findUnique).mockResolvedValue({ passwordChangedAt: null } as never);

    const response = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({ query, variables: { days: 7 } });

    expect(response.status).toBe(200);
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data).toMatchObject({
      tempZeroVerificationReport: {
        transcriptCount: 0,
        daysLookedBack: 7,
        models: [],
      },
    });
    expect(response.body.data.tempZeroVerificationReport.generatedAt).toBeTruthy();
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
    vi.mocked(db.user.findUnique).mockResolvedValue({ passwordChangedAt: null } as never);
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

    const response = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({ query });

    expect(response.status).toBe(200);
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data).toMatchObject({
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

    const report = response.body.data.tempZeroVerificationReport;

    type ReportModel = { modelId: string; fingerprintDriftPct: number | null };
    const modelA = (report.models as ReportModel[]).find((model) => model.modelId === 'model-a');
    expect(modelA).toBeDefined();
    expect(modelA?.fingerprintDriftPct).toBeCloseTo(33.3333333333, 5);
  });
});
