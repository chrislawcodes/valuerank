import { builder } from '../../builder.js';
import { db } from '@valuerank/db';
import { DomainRef } from '../../types/domain.js';
import { ensureDomainConfigSnapshot } from '../../../services/domain-config/snapshot.js';
import { createLogger } from '@valuerank/shared';

const log = createLogger('graphql:mutations:domain-settings');

const ValueStatementInput = builder.inputType('ValueStatementInput', {
  fields: (t) => ({
    token: t.string({ required: true }),
    content: t.string({ required: true }),
  }),
});

builder.mutationField('setDomainDefaults', (t) =>
  t.field({
    type: DomainRef,
    args: {
      id: t.arg.id({ required: true }),
      defaultLevelPresetVersionId: t.arg.id({ required: false }),
      defaultPreambleVersionId: t.arg.id({ required: false }),
      defaultContextId: t.arg.id({ required: false }),
      defaultModelIds: t.arg.stringList({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      const id = String(args.id);
      const existing = await db.domain.findUnique({ where: { id } });
      if (!existing) throw new Error(`Domain not found: ${id}`);

      const newDefaultModelIds = args.defaultModelIds != null ? args.defaultModelIds.map(String) : null;

      if (newDefaultModelIds != null && newDefaultModelIds.length > 0) {
        const activeModels = await db.llmModel.findMany({
          where: { modelId: { in: newDefaultModelIds }, status: 'ACTIVE' },
          select: { modelId: true },
        });
        const activeModelIds = new Set(activeModels.map((m) => m.modelId));
        const invalidIds = newDefaultModelIds.filter((mid) => !activeModelIds.has(mid));
        if (invalidIds.length > 0) {
          throw new Error(`Invalid or inactive model IDs: ${invalidIds.join(', ')}`);
        }
      }

      const updated = await db.domain.update({
        where: { id },
        data: {
          defaultLevelPresetVersionId: args.defaultLevelPresetVersionId !== undefined
            ? (args.defaultLevelPresetVersionId === null ? null : String(args.defaultLevelPresetVersionId))
            : undefined,
          defaultPreambleVersionId: args.defaultPreambleVersionId !== undefined
            ? (args.defaultPreambleVersionId === null ? null : String(args.defaultPreambleVersionId))
            : undefined,
          defaultContextId: args.defaultContextId !== undefined
            ? (args.defaultContextId === null ? null : String(args.defaultContextId))
            : undefined,
          ...(newDefaultModelIds != null ? { defaultModelIds: newDefaultModelIds } : {}),
        },
      });

      ctx.log.info({ domainId: updated.id }, 'Domain defaults updated');

      return updated;
    },
  })
);

builder.mutationField('setDomainSettings', (t) =>
  t.field({
    type: DomainRef,
    args: {
      domainId: t.arg.id({ required: true }),
      preambleVersionId: t.arg.id({ required: false }),
      levelPresetVersionId: t.arg.id({ required: false }),
      contextId: t.arg.id({ required: false }),
      defaultModelIds: t.arg.stringList({ required: false }),
      sentencePrefix: t.arg.string({ required: false }),
      labelPrefix: t.arg.string({ required: false }),
      valueStatements: t.arg({ type: [ValueStatementInput], required: true }),
    },
    resolve: async (_root, args) => {
      const domainId = args.domainId as string;
      const newDefaultModelIds = args.defaultModelIds != null ? args.defaultModelIds.map(String) : null;

      if (newDefaultModelIds != null && newDefaultModelIds.length > 0) {
        const activeModels = await db.llmModel.findMany({
          where: { modelId: { in: newDefaultModelIds }, status: 'ACTIVE' },
          select: { modelId: true },
        });
        const activeModelIds = new Set(activeModels.map((m) => m.modelId));
        const invalidIds = newDefaultModelIds.filter((mid) => !activeModelIds.has(mid));
        if (invalidIds.length > 0) {
          throw new Error(`Invalid or inactive model IDs: ${invalidIds.join(', ')}`);
        }
      }

      const updatedDomain = await db.$transaction(async (tx) => {
        const currentStatements = await tx.valueStatement.findMany({
          where: { domainId },
          select: {
            id: true,
            token: true,
            versions: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { id: true, content: true },
            },
          },
        });

        const statementByToken = new Map(currentStatements.map((s) => [s.token, s]));

        const changedVersions: { statementId: string; content: string }[] = [];

        for (const input of args.valueStatements) {
          const existing = statementByToken.get(input.token);
          if (!existing) {
            log.warn('setDomainSettings: unknown token, skipping', { token: input.token });
            continue;
          }

          const latestContent = existing.versions[0]?.content ?? '';
          if (input.content !== latestContent) {
            changedVersions.push({ statementId: existing.id, content: input.content });
          }
        }

        if (changedVersions.length > 0) {
          await tx.valueStatementVersion.createMany({
            data: changedVersions.map((v) => ({
              statementId: v.statementId,
              content: v.content,
            })),
          });
        }

        await tx.domain.update({
          where: { id: domainId },
          data: {
            defaultPreambleVersionId: args.preambleVersionId != null ? String(args.preambleVersionId) : null,
            defaultLevelPresetVersionId: args.levelPresetVersionId != null ? String(args.levelPresetVersionId) : null,
            defaultContextId: args.contextId != null ? String(args.contextId) : null,
            ...(newDefaultModelIds != null ? { defaultModelIds: newDefaultModelIds } : {}),
            // Empty string → null (revert to default); undefined → skip (no change)
            ...(args.sentencePrefix !== undefined
              ? { sentencePrefix: args.sentencePrefix === '' ? null : args.sentencePrefix }
              : {}),
            ...(args.labelPrefix !== undefined
              ? { labelPrefix: args.labelPrefix === '' ? null : args.labelPrefix }
              : {}),
          },
        });

        await ensureDomainConfigSnapshot(domainId, tx);

        return tx.domain.findUniqueOrThrow({ where: { id: domainId } });
      });

      return updatedDomain;
    },
  })
);
