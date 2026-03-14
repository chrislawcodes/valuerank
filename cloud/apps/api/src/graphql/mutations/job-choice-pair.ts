import { randomUUID } from 'node:crypto';
import {
  Prisma,
  db,
  type DefinitionComponents,
  type DefinitionContentV1,
  type ScenarioContent,
} from '@valuerank/db';
import { assembleTemplate } from '@valuerank/shared';
import { builder } from '../builder.js';
import { DefinitionRef } from '../types/refs.js';
import type { DefinitionShape } from '../types/refs.js';
import { createAuditLog } from '../../services/audit/index.js';

type JobChoiceDefinitionContent = DefinitionContentV1 & {
  components: DefinitionComponents;
};

type JobChoicePairResult = { aFirst: DefinitionShape; bFirst: DefinitionShape };

const CreateJobChoicePairResultRef =
  builder.objectRef<JobChoicePairResult>('CreateJobChoicePairResult');

builder.objectType(CreateJobChoicePairResultRef, {
  fields: (t) => ({
    aFirst: t.field({ type: DefinitionRef, resolve: (result) => result.aFirst }),
    bFirst: t.field({ type: DefinitionRef, resolve: (result) => result.bFirst }),
  }),
});

const CreateJobChoicePairInput = builder.inputType('CreateJobChoicePairInput', {
  fields: (t) => ({
    name: t.string({ required: true }),
    domainId: t.id({ required: true }),
    contextId: t.id({ required: true }),
    valueFirstId: t.id({ required: true }),
    valueSecondId: t.id({ required: true }),
    preambleVersionId: t.id({ required: false }),
  }),
});

builder.mutationField('createJobChoicePair', (t) =>
  t.field({
    type: CreateJobChoicePairResultRef,
    args: { input: t.arg({ type: CreateJobChoicePairInput, required: true }) },
    resolve: async (_root, { input }, ctx) => {
      const domainId = String(input.domainId);
      const contextId = String(input.contextId);
      const valueFirstId = String(input.valueFirstId);
      const valueSecondId = String(input.valueSecondId);

      ctx.log.info({ domainId, contextId, valueFirstId, valueSecondId }, 'Creating job choice pair');

      if (valueFirstId === valueSecondId) {
        throw new Error('valueFirstId and valueSecondId must be different');
      }

      const preambleVersionId =
        input.preambleVersionId != null ? String(input.preambleVersionId) : null;

      const [context, valueFirst, valueSecond, preambleVersion] = await Promise.all([
        db.domainContext.findUnique({ where: { id: contextId } }),
        db.valueStatement.findUnique({ where: { id: valueFirstId } }),
        db.valueStatement.findUnique({ where: { id: valueSecondId } }),
        preambleVersionId == null
          ? Promise.resolve(null)
          : db.preambleVersion.findUnique({ where: { id: preambleVersionId } }),
      ]);

      if (context == null) throw new Error(`DomainContext not found: ${contextId}`);
      if (context.domainId !== domainId) {
        throw new Error(`DomainContext ${contextId} does not belong to domain ${domainId}`);
      }
      if (valueFirst == null) throw new Error(`ValueStatement not found: ${valueFirstId}`);
      if (valueFirst.domainId !== domainId) {
        throw new Error(`ValueStatement ${valueFirstId} does not belong to domain ${domainId}`);
      }
      if (valueSecond == null) throw new Error(`ValueStatement not found: ${valueSecondId}`);
      if (valueSecond.domainId !== domainId) {
        throw new Error(`ValueStatement ${valueSecondId} does not belong to domain ${domainId}`);
      }
      if (preambleVersionId != null && preambleVersion == null) {
        throw new Error(`Preamble version not found: ${preambleVersionId}`);
      }

      const pairKey = randomUUID();

      const componentsAFirst: DefinitionComponents = {
        context_id: contextId,
        value_first: { token: valueFirst.token, body: valueFirst.body },
        value_second: { token: valueSecond.token, body: valueSecond.body },
      };
      const componentsBFirst: DefinitionComponents = {
        context_id: contextId,
        value_first: { token: valueSecond.token, body: valueSecond.body },
        value_second: { token: valueFirst.token, body: valueFirst.body },
      };

      const templateAFirst = assembleTemplate(context.text, componentsAFirst);
      const templateBFirst = assembleTemplate(context.text, componentsBFirst);

      const dimensions = [{ name: valueFirst.token }, { name: valueSecond.token }];

      const contentAFirst: JobChoiceDefinitionContent = {
        schema_version: 1,
        template: templateAFirst,
        dimensions,
        methodology: {
          family: 'job-choice',
          response_scale: 'option_text',
          presentation_order: 'A_first',
          pair_key: pairKey,
        },
        components: componentsAFirst,
      };
      const contentBFirst: JobChoiceDefinitionContent = {
        schema_version: 1,
        template: templateBFirst,
        dimensions,
        methodology: {
          family: 'job-choice',
          response_scale: 'option_text',
          presentation_order: 'B_first',
          pair_key: pairKey,
        },
        components: componentsBFirst,
      };

      const scenarioAFirst: ScenarioContent = {
        schema_version: 1,
        prompt: templateAFirst,
        dimension_values: {},
      };
      const scenarioBFirst: ScenarioContent = {
        schema_version: 1,
        prompt: templateBFirst,
        dimension_values: {},
      };

      const [defA, defB] = await db.$transaction(async (tx) => {
        const a = await tx.definition.create({
          data: {
            name: `${input.name} (A)`,
            content: contentAFirst as unknown as Prisma.InputJsonValue,
            domainId,
            domainContextId: contextId,
            preambleVersionId,
            createdByUserId: ctx.user?.id ?? null,
          },
        });
        const b = await tx.definition.create({
          data: {
            name: `${input.name} (B)`,
            content: contentBFirst as unknown as Prisma.InputJsonValue,
            domainId,
            domainContextId: contextId,
            preambleVersionId,
            createdByUserId: ctx.user?.id ?? null,
          },
        });

        await tx.scenario.create({
          data: {
            definitionId: a.id,
            name: 'Default Scenario',
            content: scenarioAFirst as unknown as Prisma.InputJsonValue,
          },
        });
        await tx.scenario.create({
          data: {
            definitionId: b.id,
            name: 'Default Scenario',
            content: scenarioBFirst as unknown as Prisma.InputJsonValue,
          },
        });

        return [a, b] as const;
      });

      ctx.log.info({ aFirstId: defA.id, bFirstId: defB.id, pairKey }, 'Job choice pair created');

      void createAuditLog({
        action: 'CREATE',
        entityType: 'Definition',
        entityId: defA.id,
        userId: ctx.user?.id ?? null,
        metadata: { name: defA.name, pairKey },
      });
      void createAuditLog({
        action: 'CREATE',
        entityType: 'Definition',
        entityId: defB.id,
        userId: ctx.user?.id ?? null,
        metadata: { name: defB.name, pairKey },
      });

      return {
        aFirst: defA as DefinitionShape,
        bFirst: defB as DefinitionShape,
      };
    },
  }),
);
