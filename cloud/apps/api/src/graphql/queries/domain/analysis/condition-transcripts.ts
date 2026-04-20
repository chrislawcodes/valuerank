import { db } from '@valuerank/db';
import { ValidationError } from '@valuerank/shared';
import { builder } from '../../../builder.js';
import {
  DomainAnalysisConditionTranscriptRef,
} from '../types.js';
import {
  isDomainAnalysisValueKey,
  resolveEffectiveDefaultModelIds,
  resolveSignatureRuns,
  resolveValuePairsInChunks,
} from '../shared.js';

builder.queryField('domainAnalysisConditionTranscripts', (t) =>
  t.field({
    type: [DomainAnalysisConditionTranscriptRef],
    args: {
      domainId: t.arg.id({ required: true }),
      modelId: t.arg.string({ required: true }),
      valueKey: t.arg.string({ required: true }),
      definitionId: t.arg.id({ required: true }),
      scenarioId: t.arg.id({ required: false }),
      limit: t.arg.int({ required: false }),
      signature: t.arg.string({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      const domainId = String(args.domainId);
      const modelId = args.modelId;
      const definitionId = String(args.definitionId);
      const rawValueKey = args.valueKey;
      if (!isDomainAnalysisValueKey(rawValueKey)) {
        throw new ValidationError(`Unsupported value key: ${rawValueKey}`);
      }
      const valueKey = rawValueKey;
      const limit = Math.max(1, Math.min(args.limit ?? 50, 200));
      const scenarioId = args.scenarioId != null && args.scenarioId !== '' ? String(args.scenarioId) : null;
      const requestedSignature = typeof args.signature === 'string' && args.signature.trim() !== ''
        ? args.signature.trim()
        : null;
      if (requestedSignature === null) {
        ctx.log.warn({ domainId, definitionId, modelId, valueKey }, 'domainAnalysisConditionTranscripts called without signature; defaulting to first vnew signature');
      }

      const domain = await db.domain.findUnique({ where: { id: domainId } });
      if (!domain) return [];

      const definition = await db.definition.findFirst({
        where: { id: definitionId, domainId, deletedAt: null },
        select: { id: true },
      });
      if (!definition) return [];

      const pairMap = await resolveValuePairsInChunks([definitionId]);
      const pair = pairMap.get(definitionId);
      if (!pair) return [];
      if (pair.valueA !== valueKey && pair.valueB !== valueKey) return [];

      const resolvedSignatureRuns = await resolveSignatureRuns([definitionId], requestedSignature, await resolveEffectiveDefaultModelIds(domain.defaultModelIds));
      const sourceRunIds = resolvedSignatureRuns.filteredSourceRunIds;
      if (sourceRunIds.length === 0) return [];

      return db.transcript.findMany({
        where: {
          runId: { in: sourceRunIds },
          modelId,
          ...(scenarioId === null ? {} : { scenarioId }),
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          runId: true,
          scenarioId: true,
          modelId: true,
          decisionCodeSource: true,
          decisionMetadata: true,
          turnCount: true,
          tokenCount: true,
          durationMs: true,
          createdAt: true,
          content: true,
        },
      }).then((transcripts) =>
        transcripts.map((transcript) => ({
          ...transcript,
          pairOverride: pair,
        })),
      );
    },
  }),
);
