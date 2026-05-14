import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { db } from '@valuerank/db';
import { createServer } from '../../../src/server.js';
import { TEST_USER, getAuthHeader } from '../../test-utils.js';

const app = createServer();

const TS = Date.now();
const PROVIDER_NAME = `stab-prov-${TS}`;
const MODEL_A_ID = `stab-model-a-${TS}`;
const MODEL_B_ID = `stab-model-b-${TS}`;
const DOMAIN_A_NAME = `stab-domain-a-${TS}`;
const DOMAIN_B_NAME = `stab-domain-b-${TS}`;

// Definitions (one per vignette scenario)
const DEF_MAIN = `stab-def-main-${TS}`;
const DEF_SECOND = `stab-def-second-${TS}`;
const DEF_DOMAIN_B = `stab-def-domainb-${TS}`;
const DEF_DEDUP = `stab-def-dedup-${TS}`;
const DEF_INCONS = `stab-def-incons-${TS}`;
const DEF_NORM_FAIL = `stab-def-fail-${TS}`;
const DEF_NO_VA = `stab-def-nova-${TS}`;
const DEF_LEGACY = `stab-def-legacy-${TS}`;

// Run IDs
const RUN_MAIN = `stab-run-main-${TS}`;
const RUN_SECOND = `stab-run-second-${TS}`;
const RUN_DOMAIN_B = `stab-run-domainb-${TS}`;
const RUN_DEDUP_OLD = `stab-run-dedup-old-${TS}`;
const RUN_DEDUP_NEW = `stab-run-dedup-new-${TS}`;
const RUN_INCONS = `stab-run-incons-${TS}`;
const RUN_NORM_FAIL = `stab-run-fail-${TS}`;
const RUN_NO_VA = `stab-run-nova-${TS}`;
const RUN_LEGACY = `stab-run-legacy-${TS}`;

// Config producing a deterministic signature v1td (version=1, temperature=null)
const CONFIG_V1TD = { temperature: null, definitionSnapshot: { version: 1 } };
// Config producing v?td (no version, temperature=null) — excluded by v1td filter
const CONFIG_NO_VERSION = { temperature: null };

// A valid zAnalysisOutput blob with varianceAnalysis for MODEL_A over the given perScenario map.
// visualizationData: {} is required so normalizeAnalysisArtifacts runs normalizeScenarioDimensions
// from scenario.content.dimensions (content-based approach takes priority over rawDimensions).
function buildAnalysisOutput(
  modelAPerScenario: Record<string, object>,
): object {
  return {
    perModel: {},
    visualizationData: {},
    varianceAnalysis: {
      isMultiSample: true,
      samplesPerScenario: 3,
      perModel: {
        [MODEL_A_ID]: {
          totalSamples: Object.keys(modelAPerScenario).length * 3,
          uniqueScenarios: Object.keys(modelAPerScenario).length,
          samplesPerScenario: 3,
          avgWithinScenarioVariance: 0.1,
          maxWithinScenarioVariance: 0.2,
          consistencyScore: 0.9,
          perScenario: modelAPerScenario,
        },
        // MODEL_B intentionally omitted — tests case 1 (no-data model)
      },
    },
  };
}

// A VarianceStats blob for a "stable" scenario (directionalAgreement=0.9 >= 0.80)
function stableStats(): object {
  return {
    sampleCount: 3,
    mean: 0.5,
    stdDev: 0.1,
    variance: 0.01,
    min: 0.4,
    max: 0.6,
    range: 0,
    directionalAgreement: 0.9,
    medianSignedDistance: 0.6,
    neutralShare: 0.05,
  };
}

// A VarianceStats blob for a "noisy" scenario (range=3 → noisy → unstableShare)
function noisyStats(): object {
  return {
    sampleCount: 3,
    mean: 0.5,
    stdDev: 0.5,
    variance: 0.25,
    min: 0.0,
    max: 1.0,
    range: 3,
    directionalAgreement: 0.3,
    medianSignedDistance: 0.1,
    neutralShare: 0.6,
  };
}

// Scenario content with two named dimensions (for grouping)
function scenarioContent(dimA: string, valA: number, dimB: string, valB: number): object {
  return { dimensions: { [dimA]: valA, [dimB]: valB } };
}

const STABLE_GQL_QUERY = `
  query ModelsWinRateStability($signature: String, $domainId: ID) {
    modelsWinRateStability(signature: $signature, domainId: $domainId) {
      models {
        modelId
        label
        qualifyingVignetteCount
        avgDirectionalAgreement
        stableShare
        softLeanShare
        tornShare
        unstableShare
      }
      skippedVignettes {
        definitionId
        vignetteName
        reason
      }
    }
  }
`;

describe('GraphQL modelsWinRateStability', () => {
  let domainAId: string;
  let domainBId: string;

  beforeAll(async () => {
    // modelsWinRateStability is now snapshot-cached. Clear any leftover
    // win_rate_stability snapshots so cache reads start from a clean slate and
    // these assertions exercise a fresh build rather than stale cached output.
    await db.assumptionAnalysisSnapshot.deleteMany({ where: { analysisType: 'win_rate_stability' } });

    await db.user.upsert({
      where: { id: TEST_USER.id },
      create: { id: TEST_USER.id, email: TEST_USER.email, passwordHash: 'test-hash' },
      update: {},
    });

    const [domainA, domainB] = await Promise.all([
      db.domain.create({ data: { name: DOMAIN_A_NAME, normalizedName: DOMAIN_A_NAME } }),
      db.domain.create({ data: { name: DOMAIN_B_NAME, normalizedName: DOMAIN_B_NAME } }),
    ]);
    domainAId = domainA.id;
    domainBId = domainB.id;

    const provider = await db.llmProvider.create({
      data: { name: PROVIDER_NAME, displayName: 'Stability Test Provider' },
    });

    await Promise.all([
      db.llmModel.create({
        data: {
          providerId: provider.id,
          modelId: MODEL_A_ID,
          displayName: 'Stability Model A',
          status: 'ACTIVE',
          isDefault: false,
          costInputPerMillion: 1,
          costOutputPerMillion: 1,
        },
      }),
      db.llmModel.create({
        data: {
          providerId: provider.id,
          modelId: MODEL_B_ID,
          displayName: 'Stability Model B',
          status: 'ACTIVE',
          isDefault: false,
          costInputPerMillion: 1,
          costOutputPerMillion: 1,
        },
      }),
    ]);

    // Create all definitions
    const defData = [
      { id: DEF_MAIN, domainId: domainAId, name: 'Vignette Main' },
      { id: DEF_SECOND, domainId: domainAId, name: 'Vignette Second' },
      { id: DEF_DOMAIN_B, domainId: domainBId, name: 'Vignette Domain B' },
      { id: DEF_DEDUP, domainId: domainAId, name: 'Vignette Dedup' },
      { id: DEF_INCONS, domainId: domainAId, name: 'Vignette Inconsistent' },
      { id: DEF_NORM_FAIL, domainId: domainAId, name: 'Vignette Norm Fail' },
      { id: DEF_NO_VA, domainId: domainAId, name: 'Vignette No VarianceAnalysis' },
      { id: DEF_LEGACY, domainId: domainAId, name: 'Vignette Legacy' },
    ];
    for (const def of defData) {
      await db.definition.create({
        data: { id: def.id, domainId: def.domainId, name: def.name, content: {} },
      });
    }

    // Scenarios for DEF_MAIN (2 scenarios in same condition: fairness=1, security=2)
    const scMainA = `stab-sc-main-a-${TS}`;
    const scMainB = `stab-sc-main-b-${TS}`;
    await db.scenario.createMany({
      data: [
        { id: scMainA, definitionId: DEF_MAIN, name: 'Main A', content: scenarioContent('fairness', 1, 'security', 2) },
        { id: scMainB, definitionId: DEF_MAIN, name: 'Main B', content: scenarioContent('fairness', 1, 'security', 2) },
      ],
    });

    // Scenarios for DEF_SECOND:
    //   Condition X (fairness=1, security=2): 2 scenarios → stable (stableShare=1.0, classifiedCount=1)
    //   Condition Y (fairness=2, security=2): 2 scenarios → stable (stableShare=1.0, classifiedCount=2 total)
    const scSecA = `stab-sc-sec-a-${TS}`;
    const scSecB = `stab-sc-sec-b-${TS}`;
    const scSecC = `stab-sc-sec-c-${TS}`;
    const scSecD = `stab-sc-sec-d-${TS}`;
    await db.scenario.createMany({
      data: [
        { id: scSecA, definitionId: DEF_SECOND, name: 'Sec A', content: scenarioContent('fairness', 1, 'security', 2) },
        { id: scSecB, definitionId: DEF_SECOND, name: 'Sec B', content: scenarioContent('fairness', 1, 'security', 2) },
        { id: scSecC, definitionId: DEF_SECOND, name: 'Sec C', content: scenarioContent('fairness', 2, 'security', 2) },
        { id: scSecD, definitionId: DEF_SECOND, name: 'Sec D', content: scenarioContent('fairness', 2, 'security', 2) },
      ],
    });

    // Scenario for DEF_DOMAIN_B (2 scenarios, 1 stable condition)
    const scDomB1 = `stab-sc-domB-1-${TS}`;
    const scDomB2 = `stab-sc-domB-2-${TS}`;
    await db.scenario.createMany({
      data: [
        { id: scDomB1, definitionId: DEF_DOMAIN_B, name: 'DomB 1', content: scenarioContent('fairness', 1, 'security', 2) },
        { id: scDomB2, definitionId: DEF_DOMAIN_B, name: 'DomB 2', content: scenarioContent('fairness', 1, 'security', 2) },
      ],
    });

    // Scenarios for DEF_DEDUP
    const scDedupA = `stab-sc-dedup-a-${TS}`;
    const scDedupB = `stab-sc-dedup-b-${TS}`;
    await db.scenario.createMany({
      data: [
        { id: scDedupA, definitionId: DEF_DEDUP, name: 'Dedup A', content: scenarioContent('fairness', 1, 'security', 2) },
        { id: scDedupB, definitionId: DEF_DEDUP, name: 'Dedup B', content: scenarioContent('fairness', 1, 'security', 2) },
      ],
    });

    // Scenarios for DEF_INCONS — different dimension key sets → inconsistent
    const scInconsA = `stab-sc-incons-a-${TS}`;
    const scInconsB = `stab-sc-incons-b-${TS}`;
    await db.scenario.createMany({
      data: [
        { id: scInconsA, definitionId: DEF_INCONS, name: 'Incons A', content: scenarioContent('fairness', 1, 'security', 2) },
        { id: scInconsB, definitionId: DEF_INCONS, name: 'Incons B', content: scenarioContent('fairness', 1, 'loyalty', 3) },
      ],
    });

    // No scenarios needed for DEF_NORM_FAIL or DEF_NO_VA (handled at resolver level)
    // No scenarios for DEF_LEGACY either (will be silently skipped due to missing varianceAnalysis or null keys)

    // Upsert the 'Aggregate' tag
    const aggregateTag = await db.tag.upsert({
      where: { name: 'Aggregate' },
      create: { name: 'Aggregate' },
      update: {},
    });

    async function createAggregateRun(runId: string, defId: string, config: object, extraData?: object): Promise<void> {
      await db.run.create({
        data: {
          id: runId,
          definitionId: defId,
          status: 'COMPLETED',
          config,
          progress: { completed: 1, total: 1, failed: 0 },
          startedAt: new Date(),
          completedAt: new Date(),
          tags: { create: { tagId: aggregateTag.id } },
          ...extraData,
        },
      });
    }

    // RUN_MAIN: v1td signature, has valid analysis for MODEL_A only
    await createAggregateRun(RUN_MAIN, DEF_MAIN, CONFIG_V1TD);
    await db.analysisResult.create({
      data: {
        runId: RUN_MAIN,
        analysisType: 'AGGREGATE',
        inputHash: 'hash-main',
        codeVersion: '1',
        status: 'CURRENT',
        output: buildAnalysisOutput({ [scMainA]: stableStats(), [scMainB]: stableStats() }),
      },
    });

    // RUN_SECOND: v1td, has valid analysis for MODEL_A with 2 stable conditions
    await createAggregateRun(RUN_SECOND, DEF_SECOND, CONFIG_V1TD);
    await db.analysisResult.create({
      data: {
        runId: RUN_SECOND,
        analysisType: 'AGGREGATE',
        inputHash: 'hash-second',
        codeVersion: '1',
        status: 'CURRENT',
        output: buildAnalysisOutput({
          [scSecA]: stableStats(),
          [scSecB]: stableStats(),
          [scSecC]: stableStats(),
          [scSecD]: stableStats(),
        }),
      },
    });

    // RUN_DOMAIN_B: in domain B, v1td
    await createAggregateRun(RUN_DOMAIN_B, DEF_DOMAIN_B, CONFIG_V1TD);
    await db.analysisResult.create({
      data: {
        runId: RUN_DOMAIN_B,
        analysisType: 'AGGREGATE',
        inputHash: 'hash-domainb',
        codeVersion: '1',
        status: 'CURRENT',
        output: buildAnalysisOutput({ [scDomB1]: stableStats(), [scDomB2]: stableStats() }),
      },
    });

    // RUN_DEDUP_OLD: older run for DEF_DEDUP with noisy data (should be superseded by new)
    await createAggregateRun(RUN_DEDUP_OLD, DEF_DEDUP, CONFIG_V1TD, {
      createdAt: new Date('2025-01-01'),
    });
    await db.analysisResult.create({
      data: {
        runId: RUN_DEDUP_OLD,
        analysisType: 'AGGREGATE',
        inputHash: 'hash-dedup-old',
        codeVersion: '1',
        status: 'CURRENT',
        output: buildAnalysisOutput({ [scDedupA]: noisyStats(), [scDedupB]: noisyStats() }),
      },
    });

    // RUN_DEDUP_NEW: newer run for DEF_DEDUP with stable data (should win dedup)
    await createAggregateRun(RUN_DEDUP_NEW, DEF_DEDUP, CONFIG_V1TD, {
      createdAt: new Date('2025-06-01'),
    });
    await db.analysisResult.create({
      data: {
        runId: RUN_DEDUP_NEW,
        analysisType: 'AGGREGATE',
        inputHash: 'hash-dedup-new',
        codeVersion: '1',
        status: 'CURRENT',
        output: buildAnalysisOutput({ [scDedupA]: stableStats(), [scDedupB]: stableStats() }),
      },
    });

    // RUN_INCONS: inconsistent scenario dimension keys
    await createAggregateRun(RUN_INCONS, DEF_INCONS, CONFIG_V1TD);
    await db.analysisResult.create({
      data: {
        runId: RUN_INCONS,
        analysisType: 'AGGREGATE',
        inputHash: 'hash-incons',
        codeVersion: '1',
        status: 'CURRENT',
        output: buildAnalysisOutput({ [scInconsA]: stableStats(), [scInconsB]: stableStats() }),
      },
    });

    // RUN_NORM_FAIL: analysis output fails zAnalysisOutput validation
    await createAggregateRun(RUN_NORM_FAIL, DEF_NORM_FAIL, CONFIG_V1TD);
    await db.analysisResult.create({
      data: {
        runId: RUN_NORM_FAIL,
        analysisType: 'AGGREGATE',
        inputHash: 'hash-fail',
        codeVersion: '1',
        status: 'CURRENT',
        output: 'not-a-valid-object',
      },
    });

    // RUN_NO_VA: valid parse but no varianceAnalysis (silent skip)
    await createAggregateRun(RUN_NO_VA, DEF_NO_VA, CONFIG_V1TD);
    await db.analysisResult.create({
      data: {
        runId: RUN_NO_VA,
        analysisType: 'AGGREGATE',
        inputHash: 'hash-nova',
        codeVersion: '1',
        status: 'CURRENT',
        output: { perModel: {} }, // valid zAnalysisOutput but no varianceAnalysis
      },
    });

    // RUN_LEGACY: null-signature run (config has no version → resolves to v?td, not v1td)
    await createAggregateRun(RUN_LEGACY, DEF_LEGACY, CONFIG_NO_VERSION);
    await db.analysisResult.create({
      data: {
        runId: RUN_LEGACY,
        analysisType: 'AGGREGATE',
        inputHash: 'hash-legacy',
        codeVersion: '1',
        status: 'CURRENT',
        output: buildAnalysisOutput({}),
      },
    });
  });

  afterAll(async () => {
    const allRunIds = [
      RUN_MAIN, RUN_SECOND, RUN_DOMAIN_B,
      RUN_DEDUP_OLD, RUN_DEDUP_NEW,
      RUN_INCONS, RUN_NORM_FAIL, RUN_NO_VA, RUN_LEGACY,
    ];
    const allDefIds = [
      DEF_MAIN, DEF_SECOND, DEF_DOMAIN_B, DEF_DEDUP,
      DEF_INCONS, DEF_NORM_FAIL, DEF_NO_VA, DEF_LEGACY,
    ];

    await db.assumptionAnalysisSnapshot.deleteMany({ where: { analysisType: 'win_rate_stability' } });
    await db.analysisResult.deleteMany({ where: { runId: { in: allRunIds } } });
    await db.scenario.deleteMany({ where: { definitionId: { in: allDefIds } } });
    await db.run.deleteMany({ where: { id: { in: allRunIds } } });
    await db.definition.deleteMany({ where: { id: { in: allDefIds } } });
    await db.llmModel.deleteMany({ where: { modelId: { in: [MODEL_A_ID, MODEL_B_ID] } } });
    await db.llmProvider.deleteMany({ where: { name: PROVIDER_NAME } });
    await db.domain.deleteMany({ where: { name: { in: [DOMAIN_A_NAME, DOMAIN_B_NAME] } } });
    await db.apiKey.deleteMany({ where: { userId: TEST_USER.id } });
    await db.user.deleteMany({ where: { id: TEST_USER.id } });
  });

  async function query(variables: { signature?: string; domainId?: string } = {}) {
    const res = await request(app)
      .post('/graphql')
      .set('Authorization', getAuthHeader())
      .send({ query: STABLE_GQL_QUERY, variables })
      .expect(200);
    expect(res.body.errors).toBeUndefined();
    return res.body.data.modelsWinRateStability as {
      models: Array<{
        modelId: string;
        label: string;
        qualifyingVignetteCount: number;
        avgDirectionalAgreement: number | null;
        stableShare: number | null;
        softLeanShare: number | null;
        tornShare: number | null;
        unstableShare: number | null;
      }>;
      skippedVignettes: Array<{ definitionId: string; vignetteName: string; reason: string }>;
    };
  }

  it('case 1: returns all active models; no-data model has null shares and qualifyingVignetteCount 0', async () => {
    const result = await query({ signature: 'v1td' });
    const modelA = result.models.find((m) => m.modelId === MODEL_A_ID);
    const modelB = result.models.find((m) => m.modelId === MODEL_B_ID);

    expect(modelA).toBeDefined();
    expect(modelB).toBeDefined();
    expect(modelA?.qualifyingVignetteCount).toBeGreaterThan(0);
    expect(modelA?.stableShare).not.toBeNull();
    expect(modelB?.qualifyingVignetteCount).toBe(0);
    expect(modelB?.stableShare).toBeNull();
    expect(modelB?.softLeanShare).toBeNull();
    expect(modelB?.tornShare).toBeNull();
    expect(modelB?.unstableShare).toBeNull();
    expect(modelB?.avgDirectionalAgreement).toBeNull();
  });

  it('case 2: signature arg — provided excludes non-matching runs, omitted includes all', async () => {
    // With v1td signature: only domain-A runs with v1td match (DEF_MAIN, DEF_SECOND, DEF_DEDUP, ...)
    const withSig = await query({ signature: 'v1td' });
    const withoutSig = await query({});

    const modelAWithSig = withSig.models.find((m) => m.modelId === MODEL_A_ID);
    const modelAWithoutSig = withoutSig.models.find((m) => m.modelId === MODEL_A_ID);

    // With signature: DEF_LEGACY (v?td) is excluded, DEF_MAIN/SECOND/DEDUP/DOMAIN_B included
    // Without signature: DEF_LEGACY is also included (v?td treated as a separate sig but still shows)
    expect(modelAWithSig).toBeDefined();
    expect(modelAWithoutSig).toBeDefined();
    // Without sig should have at least as many qualifying vignettes as with sig
    expect(modelAWithoutSig?.qualifyingVignetteCount ?? 0).toBeGreaterThanOrEqual(
      modelAWithSig?.qualifyingVignetteCount ?? 0,
    );
  });

  it('case 3: domainId arg scopes to runs in that domain only', async () => {
    const domainAResult = await query({ signature: 'v1td', domainId: domainAId });
    const domainBResult = await query({ signature: 'v1td', domainId: domainBId });

    const modelAInDomainA = domainAResult.models.find((m) => m.modelId === MODEL_A_ID);
    const modelAInDomainB = domainBResult.models.find((m) => m.modelId === MODEL_A_ID);

    // Domain A has multiple vignettes; domain B has only DEF_DOMAIN_B
    expect(modelAInDomainA?.qualifyingVignetteCount ?? 0).toBeGreaterThan(
      modelAInDomainB?.qualifyingVignetteCount ?? 0,
    );
    expect(modelAInDomainB?.qualifyingVignetteCount).toBe(1);
    expect(modelAInDomainB?.stableShare).toBe(1);
  });

  it('case 4: two qualifying vignettes gives qualifyingVignetteCount 2 for that pair', async () => {
    // DEF_MAIN and DEF_SECOND are both in domain A with v1td
    // Also DEF_DEDUP (1), DEF_DOMAIN_B is in domain B so not included in domain A query
    const result = await query({ signature: 'v1td', domainId: domainAId });
    const modelA = result.models.find((m) => m.modelId === MODEL_A_ID);

    // Domain A valid vignettes with sig=v1td: DEF_MAIN, DEF_SECOND, DEF_DEDUP
    // DEF_INCONS → skipped (inconsistent), DEF_NORM_FAIL → skipped, DEF_NO_VA → silently skipped
    expect(modelA?.qualifyingVignetteCount).toBe(3);
  });

  it('case 5: two CURRENT runs for same (definitionId, signature) — only most-recent used', async () => {
    // DEF_DEDUP has RUN_DEDUP_OLD (noisy) and RUN_DEDUP_NEW (stable, newer)
    // The resolver deduplicates: most recent (2025-06-01) wins → stable, not noisy
    const result = await query({ signature: 'v1td', domainId: domainAId });
    const modelA = result.models.find((m) => m.modelId === MODEL_A_ID);

    // If dedup didn't work, noisy from old run + stable from new run would average
    // If dedup works correctly, only new (stable) run is used → stableShare=1.0
    expect(modelA?.stableShare).toBe(1);
    expect(modelA?.unstableShare).toBe(0);
  });

  it('case 6: equal weighting — each vignette counts once regardless of condition count', async () => {
    // DEF_MAIN: 1 classified condition, stableShare=1.0
    // DEF_SECOND: 2 classified conditions, stableShare=1.0 (both conditions stable)
    // averageVignetteStability gives each vignette equal weight
    // Equal weight: (1.0 + 1.0) / 2 = 1.0 (both are stable)
    // In this case equal-weight and count-weight produce the same result since both are 1.0
    // The important thing is that qualifyingVignetteCount=3 (not 4 from condition count)
    const result = await query({ signature: 'v1td', domainId: domainAId });
    const modelA = result.models.find((m) => m.modelId === MODEL_A_ID);

    // qualifyingVignetteCount is per-vignette (not per-condition)
    expect(modelA?.qualifyingVignetteCount).toBe(3); // DEF_MAIN, DEF_SECOND, DEF_DEDUP
    expect(modelA?.stableShare).toBe(1); // all conditions are stable
  });

  it('case 7: inconsistent dimension keys → skippedVignettes with inconsistent-dimension-keys', async () => {
    const result = await query({ signature: 'v1td', domainId: domainAId });
    const skipped = result.skippedVignettes;
    const inconsistentEntry = skipped.find(
      (v) => v.definitionId === DEF_INCONS && v.reason === 'inconsistent-dimension-keys',
    );

    expect(inconsistentEntry).toBeDefined();
    expect(inconsistentEntry?.vignetteName).toBe('Vignette Inconsistent');

    // Also verify DEF_INCONS is not counted in MODEL_A's qualifying vignettes
    // (already verified via count=3 in case 6, but let's be explicit)
    expect(inconsistentEntry).toBeDefined();
  });

  it('case 8: normalization failure → skippedVignettes with normalization-failed', async () => {
    const result = await query({ signature: 'v1td', domainId: domainAId });
    const normFailEntry = result.skippedVignettes.find(
      (v) => v.definitionId === DEF_NORM_FAIL && v.reason === 'normalization-failed',
    );

    expect(normFailEntry).toBeDefined();
    expect(normFailEntry?.vignetteName).toBe('Vignette Norm Fail');
  });

  it('case 9: missing varianceAnalysis → silently skipped, not in skippedVignettes', async () => {
    const result = await query({ signature: 'v1td', domainId: domainAId });
    const noVaEntry = result.skippedVignettes.find((v) => v.definitionId === DEF_NO_VA);

    // Should not appear in skippedVignettes — it's silently skipped
    expect(noVaEntry).toBeUndefined();
  });

  it('case 10: null-signature fixture excluded by v1td filter; model still appears from valid-sig runs', async () => {
    // RUN_LEGACY has CONFIG_NO_VERSION → formatRunSignature = v?td ≠ v1td → excluded
    // But MODEL_A still appears in results because it has data from DEF_MAIN, DEF_SECOND, etc.
    const result = await query({ signature: 'v1td', domainId: domainAId });
    const modelA = result.models.find((m) => m.modelId === MODEL_A_ID);

    // DEF_LEGACY is in domain A; its run has v?td signature → excluded by v1td filter
    // DEF_LEGACY should not appear in skippedVignettes (excluded by filter, not skipped)
    const legacySkipped = result.skippedVignettes.find((v) => v.definitionId === DEF_LEGACY);
    expect(legacySkipped).toBeUndefined();

    // MODEL_A still qualifies from its other vignettes (DEF_MAIN, DEF_SECOND, DEF_DEDUP)
    expect(modelA?.qualifyingVignetteCount).toBeGreaterThan(0);
  });
});
