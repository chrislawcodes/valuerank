import { db } from '@valuerank/db';
import { SCHWARTZ_CIRCULAR_ORDER } from '@valuerank/shared/schwartz';
import { getModelsFromDatabase } from '../../config/models.js';
import { aggregatePairwiseWinRates } from '../../services/circumplex/aggregation.js';
import { builder } from '../builder.js';
import { PairwiseWinRatesResultRef } from '../types/pairwise-win-rates.js';

builder.queryField('pairwiseWinRates', (t) =>
  t.field({
    type: PairwiseWinRatesResultRef,
    args: {
      domainId: t.arg.id({
        required: false,
        description: 'Optional domain ID to scope results to a single domain',
      }),
      signature: t.arg.string({
        required: false,
        description: 'Batch signature to filter runs (e.g. vnewtd)',
      }),
      modelIds: t.arg.stringList({
        required: false,
        description: 'Model IDs to include. Defaults to all active models when omitted.',
      }),
    },
    resolve: async (_root, args) => {
      const domainId = args.domainId != null ? String(args.domainId) : null;
      const signature = args.signature != null ? String(args.signature) : null;

      const activeModels = await getModelsFromDatabase({
        activeOnly: true,
        availableOnly: false,
      });

      const requestedIds = args.modelIds != null ? new Set(args.modelIds) : null;
      const filteredModels = requestedIds != null
        ? activeModels.filter((m) => requestedIds.has(m.modelId))
        : activeModels;
      const modelIds = filteredModels.map((m) => m.modelId);

      let domainDefinitionIds: Set<string> | null = null;
      if (domainId != null) {
        const definitions = await db.definition.findMany({
          where: { domainId, deletedAt: null },
          select: { id: true },
        });
        domainDefinitionIds = new Set(definitions.map((d) => d.id));
      }

      // signature is required by aggregatePairwiseWinRates — fall back to a
      // broad match when none is provided so the query still returns data.
      const effectiveSignature = signature ?? 'vnewtd';

      const pairwiseMap = await aggregatePairwiseWinRates({
        modelIds,
        signature: effectiveSignature,
        domainDefinitionIds,
      });

      const models = filteredModels.map((model) => {
        const matrix = pairwiseMap.get(model.modelId);
        const winRateMatrix = (matrix ?? []).map((row) => row.map((cell) => cell.winRate));
        const trialCountMatrix = (matrix ?? []).map((row) => row.map((cell) => cell.trials));

        return {
          modelId: model.modelId,
          label: model.displayName,
          valueOrder: [...SCHWARTZ_CIRCULAR_ORDER],
          winRateMatrix,
          trialCountMatrix,
        };
      });

      return { models };
    },
  }),
);
