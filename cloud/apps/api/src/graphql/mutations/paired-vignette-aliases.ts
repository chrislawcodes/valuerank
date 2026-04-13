import { randomUUID } from 'node:crypto';
import { db, type Prisma } from '@valuerank/db';
import { ValidationError, type TemplateConfig } from '@valuerank/shared';
import { builder } from '../builder.js';
import type { DefinitionShape } from '../types/refs.js';
import { createAuditLog } from '../../services/audit/index.js';
import {
  CreatePairedVignetteInput,
  CreatePairedVignetteResultRef,
  UpdatePairedVignetteInput,
} from './paired-vignette-schema.js';
import {
  buildPairedDefinitionName,
  buildPairedVignetteContent,
  createPairedScenarios,
  resolvePairedVignette,
  resolvePairedVignetteInputs,
} from './paired-vignette-helpers.js';

builder.mutationField('createJobChoicePair', (t) =>
  t.field({
    type: CreatePairedVignetteResultRef,
    deprecationReason: 'Renamed to createPairedVignette',
    args: { input: t.arg({ type: CreatePairedVignetteInput, required: true }) },
    resolve: async (_root, { input }, ctx) => {
      const domainId = String(input.domainId);
      const contextId = String(input.contextId);
      const valueFirstId = String(input.valueFirstId);
      const valueSecondId = String(input.valueSecondId);
      const preambleVersionId = input.preambleVersionId != null ? String(input.preambleVersionId) : null;
      const inputLevelPresetVersionId = input.levelPresetVersionId != null ? String(input.levelPresetVersionId) : null;

      ctx.log.warn({ domainId, deprecatedAlias: 'createJobChoicePair' }, 'Deprecated alias called — migrate to createPairedVignette');

      const resolvedInputs = await resolvePairedVignetteInputs({
        domainId, contextId, valueFirstId, valueSecondId, preambleVersionId,
        levelPresetVersionId: inputLevelPresetVersionId, applyDomainDefault: true,
      });
      const domainTemplateConfig: TemplateConfig = {
        sentencePrefix: resolvedInputs.domainSentencePrefix,
        labelPrefix: resolvedInputs.domainLabelPrefix,
      };
      const pairKey = randomUUID();
      const { contentAFirst, contentBFirst, componentsAFirst, componentsBFirst } = buildPairedVignetteContent(
        pairKey, resolvedInputs.context.text, resolvedInputs.contextId,
        resolvedInputs.valueFirst, resolvedInputs.valueSecond, resolvedInputs.levelPresetVersion,
        resolvedInputs.domainNormalizedName, domainTemplateConfig,
      );
      const [defA, defB] = await db.$transaction(async (tx) => {
        const a = await tx.definition.create({
          data: {
            name: buildPairedDefinitionName(input.name, resolvedInputs.valueFirst.token, resolvedInputs.valueSecond.token),
            content: contentAFirst as unknown as Prisma.InputJsonValue, domainId,
            domainContextId: resolvedInputs.contextId, preambleVersionId,
            levelPresetVersionId: resolvedInputs.resolvedLevelPresetVersionId, createdByUserId: ctx.user?.id ?? null,
          },
        });
        const b = await tx.definition.create({
          data: {
            name: buildPairedDefinitionName(input.name, resolvedInputs.valueSecond.token, resolvedInputs.valueFirst.token),
            content: contentBFirst as unknown as Prisma.InputJsonValue, domainId,
            domainContextId: resolvedInputs.contextId, preambleVersionId,
            levelPresetVersionId: resolvedInputs.resolvedLevelPresetVersionId, createdByUserId: ctx.user?.id ?? null,
          },
        });
        await createPairedScenarios(tx, {
          definitionAId: a.id, definitionBId: b.id, contextText: resolvedInputs.context.text,
          componentsAFirst, componentsBFirst, valueFirstToken: resolvedInputs.valueFirst.token,
          valueSecondToken: resolvedInputs.valueSecond.token, levelPresetVersion: resolvedInputs.levelPresetVersion,
        });
        return [a, b] as const;
      });
      void createAuditLog({ action: 'CREATE', entityType: 'Definition', entityId: defA.id, userId: ctx.user?.id ?? null, metadata: { name: defA.name, pairKey } });
      void createAuditLog({ action: 'CREATE', entityType: 'Definition', entityId: defB.id, userId: ctx.user?.id ?? null, metadata: { name: defB.name, pairKey } });
      return { definitionA: defA as DefinitionShape, definitionB: defB as DefinitionShape };
    },
  }),
);

builder.mutationField('updateJobChoicePair', (t) =>
  t.field({
    type: CreatePairedVignetteResultRef,
    deprecationReason: 'Renamed to updatePairedVignette',
    args: { input: t.arg({ type: UpdatePairedVignetteInput, required: true }) },
    resolve: async (_root, { input }, ctx) => {
      const definitionId = String(input.definitionId);
      const contextId = String(input.contextId);
      const valueFirstId = String(input.valueFirstId);
      const valueSecondId = String(input.valueSecondId);
      const preambleVersionId = input.preambleVersionId != null ? String(input.preambleVersionId) : null;
      const inputLevelPresetVersionId = input.levelPresetVersionId != null ? String(input.levelPresetVersionId) : null;

      ctx.log.warn({ definitionId, deprecatedAlias: 'updateJobChoicePair' }, 'Deprecated alias called — migrate to updatePairedVignette');

      const existingPair = await resolvePairedVignette(definitionId);
      const domainId = (await db.definition.findUnique({ where: { id: existingPair.definitionA.id }, select: { domainId: true } }))?.domainId;
      if (domainId == null) throw new ValidationError(`Definition ${definitionId} is not assigned to a domain`);
      const resolvedInputs = await resolvePairedVignetteInputs({
        domainId, contextId, valueFirstId, valueSecondId, preambleVersionId,
        levelPresetVersionId: inputLevelPresetVersionId,
      });
      const domainTemplateConfig: TemplateConfig = {
        sentencePrefix: resolvedInputs.domainSentencePrefix,
        labelPrefix: resolvedInputs.domainLabelPrefix,
      };
      const { contentAFirst, contentBFirst, componentsAFirst, componentsBFirst } = buildPairedVignetteContent(
        existingPair.pairKey, resolvedInputs.context.text, resolvedInputs.contextId,
        resolvedInputs.valueFirst, resolvedInputs.valueSecond, resolvedInputs.levelPresetVersion,
        resolvedInputs.domainNormalizedName, domainTemplateConfig,
      );
      const [updatedA, updatedB] = await db.$transaction(async (tx) => {
        await tx.scenario.deleteMany({ where: { definitionId: { in: [existingPair.definitionA.id, existingPair.definitionB.id] } } });
        const defs = await Promise.all([
          tx.definition.update({
            where: { id: existingPair.definitionA.id },
            data: {
              name: buildPairedDefinitionName(input.name, resolvedInputs.valueFirst.token, resolvedInputs.valueSecond.token),
              content: contentAFirst as unknown as Prisma.InputJsonValue, domainContextId: resolvedInputs.contextId,
              preambleVersionId, levelPresetVersionId: resolvedInputs.resolvedLevelPresetVersionId,
            },
          }),
          tx.definition.update({
            where: { id: existingPair.definitionB.id },
            data: {
              name: buildPairedDefinitionName(input.name, resolvedInputs.valueSecond.token, resolvedInputs.valueFirst.token),
              content: contentBFirst as unknown as Prisma.InputJsonValue, domainContextId: resolvedInputs.contextId,
              preambleVersionId, levelPresetVersionId: resolvedInputs.resolvedLevelPresetVersionId,
            },
          }),
        ]);
        await createPairedScenarios(tx, {
          definitionAId: existingPair.definitionA.id, definitionBId: existingPair.definitionB.id,
          contextText: resolvedInputs.context.text, componentsAFirst, componentsBFirst,
          valueFirstToken: resolvedInputs.valueFirst.token, valueSecondToken: resolvedInputs.valueSecond.token,
          levelPresetVersion: resolvedInputs.levelPresetVersion,
          templateConfig: domainTemplateConfig,
        });
        return [defs[0], defs[1]] as const;
      });
      void createAuditLog({ action: 'UPDATE', entityType: 'Definition', entityId: updatedA.id, userId: ctx.user?.id ?? null, metadata: { name: updatedA.name, pairKey: existingPair.pairKey, sourceDefinitionId: definitionId } });
      void createAuditLog({ action: 'UPDATE', entityType: 'Definition', entityId: updatedB.id, userId: ctx.user?.id ?? null, metadata: { name: updatedB.name, pairKey: existingPair.pairKey, sourceDefinitionId: definitionId } });
      return { definitionA: updatedA as DefinitionShape, definitionB: updatedB as DefinitionShape };
    },
  }),
);
