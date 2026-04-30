import { db } from '@valuerank/db';
import { getModelsFromDatabase } from '../../config/models.js';
import { buildAssumptionKey, parseSnapshotOutput } from '../../services/analysis/domain-analysis-snapshot-builder.js';
import { DOMAIN_ANALYSIS_ASSUMPTION_PREFIX, DOMAIN_ANALYSIS_SNAPSHOT_TYPE } from '../../services/analysis/domain-analysis-cache-types.js';
import { DOMAIN_ANALYSIS_VALUE_KEYS, type DomainAnalysisValueKey } from './domain-analysis-values.js';
import { selectModelsAnalysisSnapshots } from './models-analysis-snapshot-selection.js';
import { computePooledWinRate, computeStabilityScore } from './models-analysis-math.js';
import { builder } from '../builder.js';
import {
  ModelsAnalysisResultRef,
  type ModelsAnalysisDomainBreakdownShape,
  type ModelsAnalysisModelResultShape,
  type ModelsAnalysisValueResultShape,
} from '../types/models-analysis.js';

type DomainContribution = ModelsAnalysisDomainBreakdownShape;
type ModelsAnalysisSnapshotRow = {
  id: string;
  assumptionKey: string;
  configSignature: string;
  output: unknown;
};

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
  const eligibleDomains = domains.filter((domain) => domain.evidenceWeight != null && domain.evidenceWeight > 0);
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
          configSignature: true,
          output: true,
        },
        orderBy: [
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
      });

      const selectedSnapshots = selectModelsAnalysisSnapshots(
        snapshots as ModelsAnalysisSnapshotRow[],
        signature,
      );

      const activeModelById = new Map(activeModels.map((model) => [model.modelId, model.displayName] as const));
      const contributionsByModel = new Map<string, Map<DomainAnalysisValueKey, DomainContribution[]>>();

      for (const model of activeModels) {
        const valueMap = new Map<DomainAnalysisValueKey, DomainContribution[]>();
        for (const valueKey of DOMAIN_ANALYSIS_VALUE_KEYS) {
          valueMap.set(valueKey, []);
        }
        contributionsByModel.set(model.modelId, valueMap);
      }

      for (const snapshot of selectedSnapshots) {
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

            const vigCount = model.vignetteCount?.[valueKey] ?? 0;
            const precomputedWinRate = model.valueWinRates?.[valueKey];

            if (vigCount > 0 && precomputedWinRate != null) {
              contributions.push({
                domainId: domainMatch ?? parsed.domainId,
                domainName: parsed.domainName,
                evidenceWeight: vigCount,
                winRate: precomputedWinRate,
              });
            } else if ((model.counts[valueKey]?.prioritized ?? 0) + (model.counts[valueKey]?.deprioritized ?? 0) + (model.counts[valueKey]?.neutral ?? 0) > 0) {
              ctx.log.warn(
                {
                  assumptionKey: snapshot.assumptionKey,
                  snapshotId: snapshot.id,
                  modelId: model.model,
                  valueKey,
                },
                'Skipping legacy models-analysis contribution without vignette-aware win rate metadata',
              );
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
