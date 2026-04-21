import { db } from '@valuerank/db';
import { getModelsFromDatabase } from '../../config/models.js';
import { buildAssumptionKey, parseSnapshotOutput } from '../../services/analysis/domain-analysis-snapshot-builder.js';
import { DOMAIN_ANALYSIS_ASSUMPTION_PREFIX, DOMAIN_ANALYSIS_SNAPSHOT_TYPE } from '../../services/analysis/domain-analysis-cache-types.js';
import { DOMAIN_ANALYSIS_VALUE_KEYS, type DomainAnalysisValueKey } from './domain-analysis-values.js';
import { builder } from '../builder.js';
import {
  ModelsAnalysisResultRef,
  type ModelsAnalysisDomainBreakdownShape,
  type ModelsAnalysisModelResultShape,
  type ModelsAnalysisValueResultShape,
} from '../types/models-analysis.js';

type DomainContribution = ModelsAnalysisDomainBreakdownShape;

// Honest denominator: includes neutral outcomes so win rate is consistent with
// the rest of the product (matches aggregate-logic.ts). Excluding neutrals would
// inflate win rates and make evidence weights inconsistent with scenario counts.
function computeDomainWinRate(prioritized: number, deprioritized: number, neutral: number): number | null {
  const evidenceWeight = prioritized + deprioritized + neutral;
  if (evidenceWeight <= 0) return null;
  return (prioritized / evidenceWeight) * 100;
}

// Equal-weight pooled win rate: each domain counts once regardless of vignette count.
function computePooledWinRate(domains: DomainContribution[]): number | null {
  if (domains.length === 0) return null;
  const sum = domains.reduce((acc, d) => acc + d.winRate, 0);
  return sum / domains.length;
}

// Unweighted MAD stability score: each domain counts equally.
function computeStabilityScore(domains: DomainContribution[]): number | null {
  if (domains.length < 2) return null;
  const mean = computePooledWinRate(domains);
  if (mean === null) return null;
  const mad = domains.reduce((acc, d) => acc + Math.abs(d.winRate - mean), 0) / domains.length;
  return Math.max(0, 100 * (1 - mad / 50));
}

function buildEmptyValueResult(valueKey: DomainAnalysisValueKey): ModelsAnalysisValueResultShape {
  return {
    valueKey,
    pooledWinRate: null,
    stabilityScore: null,
    eligibleDomainCount: 0,
    domains: [],
  };
}

function buildValueResult(valueKey: DomainAnalysisValueKey, domains: DomainContribution[]): ModelsAnalysisValueResultShape {
  // Null evidenceWeight means the snapshot predates the vignetteCount field (pre-v1.2.0) but the
  // win rate is still valid — include those domains in the pool. Exclude only genuine zero-evidence entries.
  const eligibleDomains = domains.filter((domain) => domain.evidenceWeight == null || domain.evidenceWeight > 0);
  return {
    valueKey,
    pooledWinRate: computePooledWinRate(eligibleDomains),
    stabilityScore: computeStabilityScore(eligibleDomains),
    eligibleDomainCount: eligibleDomains.length,
    domains: eligibleDomains,
  };
}

builder.queryField('modelsAnalysis', (t) =>
  t.field({
    type: ModelsAnalysisResultRef,
    args: {
      domainId: t.arg.id({
        required: false,
        description: 'Optional domain ID to scope the matrix to a single domain',
      }),
      signature: t.arg.string({
        required: false,
        description: 'Optional batch signature to filter snapshots (e.g. vnewtd, vnewt0)',
      }),
    },
    resolve: async (_root, args, ctx) => {
      const domainId = args.domainId != null ? String(args.domainId) : null;
      const signature = args.signature != null ? String(args.signature) : null;
      const activeModels = await getModelsFromDatabase({
        activeOnly: true,
        availableOnly: false,
      });

      const snapshots = await db.assumptionAnalysisSnapshot.findMany({
        where: {
          assumptionKey: domainId != null
            ? buildAssumptionKey('DOMAIN', domainId)
            : {
                startsWith: `${DOMAIN_ANALYSIS_ASSUMPTION_PREFIX}:`,
              },
          analysisType: DOMAIN_ANALYSIS_SNAPSHOT_TYPE,
          ...(signature != null ? { configSignature: signature } : {}),
          status: 'CURRENT',
          deletedAt: null,
        },
        select: {
          id: true,
          assumptionKey: true,
          output: true,
        },
        orderBy: [
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
      });

      const latestSnapshotByAssumptionKey = new Map<string, typeof snapshots[number]>();
      for (const snapshot of snapshots) {
        if (!latestSnapshotByAssumptionKey.has(snapshot.assumptionKey)) {
          latestSnapshotByAssumptionKey.set(snapshot.assumptionKey, snapshot);
        }
      }

      const activeModelById = new Map(activeModels.map((model) => [model.modelId, model.displayName] as const));
      const contributionsByModel = new Map<string, Map<DomainAnalysisValueKey, DomainContribution[]>>();

      for (const model of activeModels) {
        const valueMap = new Map<DomainAnalysisValueKey, DomainContribution[]>();
        for (const valueKey of DOMAIN_ANALYSIS_VALUE_KEYS) {
          valueMap.set(valueKey, []);
        }
        contributionsByModel.set(model.modelId, valueMap);
      }

      for (const snapshot of latestSnapshotByAssumptionKey.values()) {
        const parsed = parseSnapshotOutput(snapshot.output);
        if (parsed == null) {
          ctx.log.warn({ assumptionKey: snapshot.assumptionKey, snapshotId: snapshot.id }, 'Skipping unparsable models analysis snapshot');
          continue;
        }

        const domainMatch = snapshot.assumptionKey.startsWith('domain-analysis:')
          ? snapshot.assumptionKey.slice('domain-analysis:'.length)
          : null;

        for (const model of parsed.models) {
          if (!activeModelById.has(model.model)) continue;
          const valueMap = contributionsByModel.get(model.model);
          if (valueMap == null) continue;

          for (const valueKey of DOMAIN_ANALYSIS_VALUE_KEYS) {
            const contributions = valueMap.get(valueKey);
            if (contributions == null) continue;

            // Prefer pre-computed equal-weight fields from snapshots v1.2.0+.
            // Fall back to raw counts for older snapshots (before the version bump).
            const vigCount = model.vignetteCount?.[valueKey] ?? 0;
            const precomputedWinRate = model.valueWinRates?.[valueKey];

            if (vigCount > 0 && precomputedWinRate != null) {
              contributions.push({
                domainId: domainMatch ?? parsed.domainId,
                domainName: parsed.domainName,
                evidenceWeight: vigCount,
                winRate: precomputedWinRate,
              });
            } else {
              // Fallback: snapshot predates vignetteCount (pre-v1.2.0). Compute win rate from
              // accumulated counts but do NOT use the raw count total as evidenceWeight — that
              // number is total scenario outcomes (not vignette count) and would be misleading.
              // Set evidenceWeight to null so the UI can show "—" until the snapshot rebuilds.
              const counts = model.counts[valueKey] ?? { prioritized: 0, deprioritized: 0, neutral: 0 };
              const rawTotal = counts.prioritized + counts.deprioritized + counts.neutral;
              if (rawTotal <= 0) continue;
              const winRate = computeDomainWinRate(counts.prioritized, counts.deprioritized, counts.neutral);
              if (winRate == null) continue;
              contributions.push({
                domainId: domainMatch ?? parsed.domainId,
                domainName: parsed.domainName,
                evidenceWeight: null,
                winRate,
              });
            }
          }
        }
      }

      const models: ModelsAnalysisModelResultShape[] = activeModels.map((model) => {
        const valueMap = contributionsByModel.get(model.modelId) ?? new Map<DomainAnalysisValueKey, DomainContribution[]>();
        return {
          modelId: model.modelId,
          label: model.displayName,
          values: DOMAIN_ANALYSIS_VALUE_KEYS.map((valueKey) => {
            const domains = valueMap.get(valueKey) ?? [];
            return domains.length === 0
              ? buildEmptyValueResult(valueKey)
              : buildValueResult(valueKey, domains);
          }),
        };
      });

      return {
        models,
      };
    },
  }),
);
