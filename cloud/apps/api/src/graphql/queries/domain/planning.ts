import { db } from '@valuerank/db';
import { AuthenticationError } from '@valuerank/shared';
import { builder } from '../../builder.js';
import { estimateCost as estimateCostService } from '../../../services/cost/estimate.js';
import {
  DomainAvailableSignatureRef,
  DomainTrialPlanResultRef,
  DomainTrialRunStatusRef,
} from './types.js';
import {
  DomainTrialPlanCellEstimate,
  formatRunSignature,
  formatVnewLabel,
  formatVnewSignature,
  hydrateDefinitionAncestors,
  selectLatestDefinitionPerLineage,
  supportsTemperature,
} from './shared.js';
import { formatTrialSignature } from '@valuerank/shared/trial-signature';
import { parseTemperature } from '../../../utils/temperature.js';

const DOMAIN_TRIAL_PLAN_COST_CHUNK_SIZE = 5;

builder.queryField('domainTrialsPlan', (t) =>
  t.field({
    type: DomainTrialPlanResultRef,
    args: {
      domainId: t.arg.id({ required: true }),
      temperature: t.arg.float({ required: false }),
      definitionIds: t.arg.idList({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }
      const domainId = String(args.domainId);
      const domain = await db.domain.findUnique({ where: { id: domainId } });
      if (!domain) throw new Error(`Domain not found: ${domainId}`);

      const definitions = await db.definition.findMany({
        where: { domainId, deletedAt: null },
        select: {
          id: true,
          name: true,
          version: true,
          parentId: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (definitions.length === 0) {
        return {
          domainId,
          domainName: domain.name,
          vignettes: [],
          models: [],
          cellEstimates: [],
          totalEstimatedCost: 0,
          existingTemperatures: [],
          defaultTemperature: args.temperature ?? null,
          temperatureWarning: null,
        };
      }

      const definitionsById = await hydrateDefinitionAncestors(definitions);
      const latestDefinitions = selectLatestDefinitionPerLineage(definitions, definitionsById);
      const requestedDefinitionIds = args.definitionIds?.map(String) ?? [];
      const latestDefinitionById = new Map(latestDefinitions.map((definition) => [definition.id, definition]));
      const selectedDefinitions = requestedDefinitionIds.length > 0
        ? requestedDefinitionIds
          .map((definitionId) => latestDefinitionById.get(definitionId))
          .filter((definition): definition is (typeof latestDefinitions)[number] => definition !== undefined)
        : latestDefinitions;
      const latestDefinitionIds = selectedDefinitions.map((definition) => definition.id);

      const scenarioCounts = await db.scenario.groupBy({
        by: ['definitionId'],
        where: { definitionId: { in: latestDefinitionIds }, deletedAt: null },
        _count: { _all: true },
      });
      const scenarioCountByDefinition = new Map(
        scenarioCounts.map((row) => [row.definitionId, row._count._all]),
      );

      const activeModels = await db.llmModel.findMany({
        where: { status: 'ACTIVE' },
        select: {
          modelId: true,
          displayName: true,
          isDefault: true,
          apiConfig: true,
        },
        orderBy: { displayName: 'asc' },
      });
      const defaultModels = activeModels.filter((model) => model.isDefault);
      const selectedModels = defaultModels.length > 0 ? defaultModels : activeModels;

      const modelIds = selectedModels.map((model) => model.modelId);
      const cellEstimates: DomainTrialPlanCellEstimate[] = [];
      let totalEstimatedCost = 0;

      if (modelIds.length > 0) {
        for (let offset = 0; offset < selectedDefinitions.length; offset += DOMAIN_TRIAL_PLAN_COST_CHUNK_SIZE) {
          const chunk = selectedDefinitions.slice(offset, offset + DOMAIN_TRIAL_PLAN_COST_CHUNK_SIZE);
          const estimates = await Promise.all(
            chunk.map(async (definition) => {
              const estimate = await estimateCostService({
                definitionId: definition.id,
                modelIds,
                samplePercentage: 100,
                samplesPerScenario: 1,
              });
              return { definitionId: definition.id, estimate };
            }),
          );

          for (const { definitionId, estimate } of estimates) {
            for (const modelEstimate of estimate.perModel) {
              cellEstimates.push({
                definitionId,
                modelId: modelEstimate.modelId,
                estimatedCost: modelEstimate.totalCost,
              });
              totalEstimatedCost += modelEstimate.totalCost;
            }
          }
        }
      }

      const existingRuns = await db.run.findMany({
        where: {
          definitionId: { in: latestDefinitionIds },
          deletedAt: null,
        },
        select: { config: true },
      });
      const existingTemperatureSet = new Set<number>();
      for (const run of existingRuns) {
        const config = run.config as { temperature?: unknown } | null;
        const parsed = parseTemperature(config?.temperature);
        if (parsed !== null) {
          existingTemperatureSet.add(parsed);
        }
      }
      const existingTemperatures = Array.from(existingTemperatureSet.values()).sort((a, b) => a - b);

      const selectedTemperature = args.temperature ?? null;
      let temperatureWarning: string | null = null;
      if (existingTemperatures.length > 0) {
        if (selectedTemperature === null) {
          temperatureWarning = 'Existing domain trials include explicit temperatures. Running with provider default may produce separate versions.';
        } else if (!existingTemperatures.includes(selectedTemperature)) {
          temperatureWarning = `Selected temperature (${selectedTemperature}) differs from existing temperatures (${existingTemperatures.join(', ')}).`;
        }
      }

      return {
        domainId,
        domainName: domain.name,
        vignettes: selectedDefinitions.map((definition) => ({
          definitionId: definition.id,
          definitionName: definition.name ?? 'Untitled vignette',
          definitionVersion: definition.version,
          signature: formatTrialSignature(definition.version, selectedTemperature),
          scenarioCount: scenarioCountByDefinition.get(definition.id) ?? 0,
        })),
        models: selectedModels.map((model) => ({
          modelId: model.modelId,
          label: model.displayName,
          isDefault: model.isDefault,
          supportsTemperature: supportsTemperature(model.apiConfig),
        })),
        cellEstimates,
        totalEstimatedCost,
        existingTemperatures,
        defaultTemperature: selectedTemperature,
        temperatureWarning,
      };
    },
  }),
);

builder.queryField('domainTrialRunsStatus', (t) =>
  t.field({
    type: [DomainTrialRunStatusRef],
    args: {
      runIds: t.arg.idList({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }
      const runIds = args.runIds.map(String);
      if (runIds.length === 0) return [];

      const runs = await db.run.findMany({
        where: {
          id: { in: runIds },
          deletedAt: null,
        },
        select: {
          id: true,
          definitionId: true,
          status: true,
          config: true,
        },
      });

      const probeRows = await db.probeResult.groupBy({
        by: ['runId', 'modelId', 'status'],
        where: { runId: { in: runIds } },
        _count: { _all: true },
      });
      const transcripts = await db.transcript.groupBy({
        by: ['runId', 'modelId'],
        where: { runId: { in: runIds }, deletedAt: null },
        _count: { _all: true },
      });
      const summarizedRows = await db.transcript.groupBy({
        by: ['runId', 'modelId'],
        where: { runId: { in: runIds }, deletedAt: null, summarizedAt: { not: null } },
        _count: { _all: true },
      });
      const summarizeFailedRows = await db.transcript.groupBy({
        by: ['runId', 'modelId'],
        where: { runId: { in: runIds }, deletedAt: null, decisionCode: 'error' },
        _count: { _all: true },
      });
      const selectedScenarioCounts = await db.runScenarioSelection.groupBy({
        by: ['runId'],
        where: { runId: { in: runIds } },
        _count: { _all: true },
      });
      const failedProbeRows = await db.probeResult.findMany({
        where: {
          runId: { in: runIds },
          status: 'FAILED',
        },
        select: {
          runId: true,
          modelId: true,
          errorCode: true,
          errorMessage: true,
          completedAt: true,
          createdAt: true,
        },
        orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
      });

      const probeByKey = new Map<string, { completed: number; failed: number }>();
      for (const row of probeRows) {
        const key = `${row.runId}::${row.modelId}`;
        const existing = probeByKey.get(key) ?? { completed: 0, failed: 0 };
        if (row.status === 'SUCCESS') {
          existing.completed = row._count._all;
        } else if (row.status === 'FAILED') {
          existing.failed = row._count._all;
        }
        probeByKey.set(key, existing);
      }

      const transcriptTotalByKey = new Map<string, number>();
      for (const row of transcripts) {
        transcriptTotalByKey.set(`${row.runId}::${row.modelId}`, row._count._all);
      }
      const summarizedByKey = new Map<string, number>();
      for (const row of summarizedRows) {
        summarizedByKey.set(`${row.runId}::${row.modelId}`, row._count._all);
      }
      const summarizeFailedByKey = new Map<string, number>();
      for (const row of summarizeFailedRows) {
        summarizeFailedByKey.set(`${row.runId}::${row.modelId}`, row._count._all);
      }
      const latestErrorByKey = new Map<string, string>();
      for (const row of failedProbeRows) {
        const key = `${row.runId}::${row.modelId}`;
        if (latestErrorByKey.has(key)) continue;
        const messageParts = [row.errorCode, row.errorMessage].filter(
          (part): part is string => typeof part === 'string' && part.trim() !== '',
        );
        latestErrorByKey.set(key, messageParts.length > 0 ? messageParts.join(' - ') : 'Model probe failed.');
      }

      const scenarioCountByRun = new Map(
        selectedScenarioCounts.map((row) => [row.runId, row._count._all]),
      );

      return runs.map((run) => {
        const runConfig = run.config as { models?: unknown; samplesPerScenario?: unknown } | null;
        const models = Array.isArray(runConfig?.models)
          ? runConfig.models.filter((model): model is string => typeof model === 'string')
          : [];
        const samplesPerScenario = typeof runConfig?.samplesPerScenario === 'number' && Number.isFinite(runConfig.samplesPerScenario)
          ? runConfig.samplesPerScenario
          : 1;
        const generationTotal = (scenarioCountByRun.get(run.id) ?? 0) * samplesPerScenario;

        const modelStatuses = models.map((modelId) => {
          const key = `${run.id}::${modelId}`;
          const probe = probeByKey.get(key) ?? { completed: 0, failed: 0 };
          const summarizationTotal = transcriptTotalByKey.get(key) ?? 0;
          return {
            modelId,
            generationCompleted: probe.completed,
            generationFailed: probe.failed,
            generationTotal,
            summarizationCompleted: summarizedByKey.get(key) ?? 0,
            summarizationFailed: summarizeFailedByKey.get(key) ?? 0,
            summarizationTotal,
            latestErrorMessage: latestErrorByKey.get(key) ?? null,
          };
        });

        return {
          runId: run.id,
          definitionId: run.definitionId,
          status: run.status,
          modelStatuses,
        };
      });
    },
  }),
);

builder.queryField('domainAvailableSignatures', (t) =>
  t.field({
    type: [DomainAvailableSignatureRef],
    args: {
      domainId: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }
      const domainId = String(args.domainId);
      const domain = await db.domain.findUnique({ where: { id: domainId } });
      if (!domain) throw new Error(`Domain not found: ${domainId}`);

      const definitions = await db.definition.findMany({
        where: { domainId, deletedAt: null },
        select: {
          id: true,
          name: true,
          parentId: true,
          version: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      if (definitions.length === 0) return [];

      const definitionsById = await hydrateDefinitionAncestors(definitions);
      const latestDefinitions = selectLatestDefinitionPerLineage(definitions, definitionsById);
      const latestDefinitionIds = latestDefinitions.map((definition) => definition.id);

      const runs = await db.run.findMany({
        where: {
          definitionId: { in: latestDefinitionIds },
          status: 'COMPLETED',
          deletedAt: null,
        },
        select: {
          config: true,
        },
      });

      const exactSignatureSet = new Set<string>();
      const temperatureCounts = new Map<string, { temperature: number | null; count: number }>();
      for (const run of runs) {
        exactSignatureSet.add(formatRunSignature(run.config));
        const runConfig = run.config as { temperature?: unknown } | null;
        const temperature = parseTemperature(runConfig?.temperature);
        const key = temperature === null ? 'd' : temperature.toString();
        const existing = temperatureCounts.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          temperatureCounts.set(key, { temperature, count: 1 });
        }
      }

      const vnewCandidates = Array.from(temperatureCounts.values())
        .sort((left, right) => {
          const leftIsZero = left.temperature === 0;
          const rightIsZero = right.temperature === 0;
          if (leftIsZero !== rightIsZero) return leftIsZero ? -1 : 1;
          if (left.count !== right.count) return right.count - left.count;
          if (left.temperature === null) return 1;
          if (right.temperature === null) return -1;
          return left.temperature - right.temperature;
        });

      const virtualSignatures = vnewCandidates.map((entry) => ({
        signature: formatVnewSignature(entry.temperature),
        label: formatVnewLabel(entry.temperature),
        isVirtual: true,
        temperature: entry.temperature,
      }));
      const exactSignatures = Array.from(exactSignatureSet.values())
        .sort((left, right) => left.localeCompare(right))
        .map((signature) => ({
          signature,
          label: signature,
          isVirtual: false,
          temperature: null,
        }));

      return [...virtualSignatures, ...exactSignatures];
    },
  }),
);
