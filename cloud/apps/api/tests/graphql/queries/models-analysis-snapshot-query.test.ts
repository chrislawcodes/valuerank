import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@valuerank/db';
import {
  DOMAIN_ANALYSIS_ASSUMPTION_PREFIX,
  DOMAIN_ANALYSIS_SNAPSHOT_TYPE,
} from '../../../src/services/analysis/domain-analysis-cache-types.js';

// Guards the JSONB minus-key projection in models-analysis.ts. The resolver
// fetches `(output - 'cellLevelOutcomes') AS output` so the heaviest field
// never crosses the wire at ALL_DOMAINS scope. SQL template literals are not
// type-checked, so this test catches syntax / operator / mapping regressions.

const TS = Date.now();
const ASSUMPTION_KEY = `${DOMAIN_ANALYSIS_ASSUMPTION_PREFIX}:mq-test-${TS}`;
const CONFIG_SIGNATURE = `mq-test-sig-${TS}`;

const SAMPLE_OUTPUT = {
  scope: 'DOMAIN',
  domainId: 'mq-test-domain',
  domainName: 'MQ Test Domain',
  totalDefinitions: 1,
  targetedDefinitions: 1,
  coveredDefinitions: 1,
  definitionsWithAnalysis: 1,
  missingDefinitions: [],
  contributionSummary: [],
  excludedDataSummary: [],
  models: [
    {
      model: 'mq-test-model',
      counts: { Achievement: { prioritized: 1, deprioritized: 0, neutral: 0 } },
      valueWinRates: { Achievement: 100 },
      vignetteCount: { Achievement: 1 },
    },
  ],
  cellLevelOutcomes: {
    'def-1::mq-test-model::Achievement::Hedonism::0::0': { aChoices: 1, bChoices: 0, neutrals: 0 },
    'def-1::mq-test-model::Achievement::Tradition::0::0': { aChoices: 1, bChoices: 0, neutrals: 0 },
  },
};

describe('models-analysis snapshot query (cellLevelOutcomes stripped server-side)', () => {
  let snapshotId: string;

  beforeAll(async () => {
    const created = await db.assumptionAnalysisSnapshot.create({
      data: {
        assumptionKey: ASSUMPTION_KEY,
        analysisType: DOMAIN_ANALYSIS_SNAPSHOT_TYPE,
        inputHash: `mq-test-hash-${TS}`,
        codeVersion: 'mq-test',
        configSignature: CONFIG_SIGNATURE,
        config: {},
        output: SAMPLE_OUTPUT,
        status: 'CURRENT',
      },
    });
    snapshotId = created.id;
  });

  afterAll(async () => {
    await db.assumptionAnalysisSnapshot.deleteMany({ where: { id: snapshotId } });
  });

  it('returns the snapshot output with cellLevelOutcomes stripped but other fields intact', async () => {
    const rows = await db.$queryRaw<Array<{ id: string; assumptionKey: string; configSignature: string; output: Record<string, unknown> }>>`
      SELECT
        id,
        assumption_key AS "assumptionKey",
        config_signature AS "configSignature",
        (output - 'cellLevelOutcomes') AS output
      FROM assumption_analysis_snapshots
      WHERE assumption_key = ${ASSUMPTION_KEY}
        AND analysis_type = ${DOMAIN_ANALYSIS_SNAPSHOT_TYPE}
        AND config_signature = ${CONFIG_SIGNATURE}
        AND status = 'CURRENT'
        AND deleted_at IS NULL
    `;

    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.assumptionKey).toBe(ASSUMPTION_KEY);
    expect(row.configSignature).toBe(CONFIG_SIGNATURE);
    expect(row.output).not.toHaveProperty('cellLevelOutcomes');
    // The fields modelsAnalysis actually reads must survive the projection:
    expect(row.output.domainId).toBe('mq-test-domain');
    expect(row.output.domainName).toBe('MQ Test Domain');
    expect(Array.isArray(row.output.models)).toBe(true);
    expect((row.output.models as Array<{ model: string }>)[0]?.model).toBe('mq-test-model');
  });

  it('matches the ALL_DOMAINS startsWith pattern used by the resolver', async () => {
    const prefix = `${DOMAIN_ANALYSIS_ASSUMPTION_PREFIX}:%`;
    const rows = await db.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM assumption_analysis_snapshots
      WHERE assumption_key LIKE ${prefix}
        AND assumption_key = ${ASSUMPTION_KEY}
        AND analysis_type = ${DOMAIN_ANALYSIS_SNAPSHOT_TYPE}
        AND status = 'CURRENT'
        AND deleted_at IS NULL
    `;
    expect(rows.some((r) => r.id === snapshotId)).toBe(true);
  });
});

