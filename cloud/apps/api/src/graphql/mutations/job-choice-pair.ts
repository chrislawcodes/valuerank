import { randomUUID } from 'node:crypto';
import {
  db,
  type DefinitionComponents,
  type DefinitionContentV1,
  type Prisma,
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
    levelPresetVersionId: t.id({ required: false }),
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
      const inputLevelPresetVersionId =
        input.levelPresetVersionId != null ? String(input.levelPresetVersionId) : null;

      const [context, valueFirst, valueSecond, preambleVersion, domain] = await Promise.all([
        db.domainContext.findUnique({ where: { id: contextId } }),
        db.valueStatement.findUnique({ where: { id: valueFirstId } }),
        db.valueStatement.findUnique({ where: { id: valueSecondId } }),
        preambleVersionId == null
          ? Promise.resolve(null)
          : db.preambleVersion.findUnique({ where: { id: preambleVersionId } }),
        db.domain.findUnique({ where: { id: domainId } }),
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
      if (domain == null) throw new Error(`Domain not found: ${domainId}`);

      // Resolve level preset: explicit input → domain default → null (backward compat)
      const resolvedLevelPresetVersionId =
        inputLevelPresetVersionId ?? domain.defaultLevelPresetVersionId ?? null;

      let levelPresetVersion: {
        l1: string; l2: string; l3: string; l4: string; l5: string;
      } | null = null;

      if (resolvedLevelPresetVersionId != null) {
        levelPresetVersion = await db.levelPresetVersion.findUnique({
          where: { id: resolvedLevelPresetVersionId },
          select: { l1: true, l2: true, l3: true, l4: true, l5: true },
        });
        if (levelPresetVersion == null) {
          throw new Error(`LevelPresetVersion not found: ${resolvedLevelPresetVersionId}`);
        }
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

      // Base template (no level substitution) — used for definition content and
      // as fallback when no level preset is resolved.
      const templateAFirst = assembleTemplate(context.text, componentsAFirst);
      const templateBFirst = assembleTemplate(context.text, componentsBFirst);

      const dimensions = [
        { name: valueFirst.token },
        { name: valueSecond.token },
      ];

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

      const [defA, defB] = await db.$transaction(async (tx) => {
        const a = await tx.definition.create({
          data: {
            name: `${input.name} (A)`,
            content: contentAFirst as unknown as Prisma.InputJsonValue,
            domainId,
            domainContextId: contextId,
            preambleVersionId,
            levelPresetVersionId: resolvedLevelPresetVersionId,
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
            levelPresetVersionId: resolvedLevelPresetVersionId,
            createdByUserId: ctx.user?.id ?? null,
          },
        });

        if (levelPresetVersion != null) {
          // 25-condition expansion: 5 levels for value_first × 5 levels for value_second
          const words = [
            levelPresetVersion.l1,
            levelPresetVersion.l2,
            levelPresetVersion.l3,
            levelPresetVersion.l4,
            levelPresetVersion.l5,
          ];

          const scenarioCreates: Promise<unknown>[] = [];

          for (const firstWord of words) {
            for (const secondWord of words) {
              const promptA = assembleTemplate(context.text, componentsAFirst, {
                first: firstWord,
                second: secondWord,
              });
              const promptB = assembleTemplate(context.text, componentsBFirst, {
                first: secondWord,
                second: firstWord,
              });

              const scenarioContentA: ScenarioContent = {
                schema_version: 1,
                prompt: promptA,
                dimension_values: {
                  [valueFirst.token]: firstWord,
                  [valueSecond.token]: secondWord,
                },
              };
              const scenarioContentB: ScenarioContent = {
                schema_version: 1,
                prompt: promptB,
                dimension_values: {
                  [valueSecond.token]: secondWord,
                  [valueFirst.token]: firstWord,
                },
              };

              scenarioCreates.push(
                tx.scenario.create({
                  data: {
                    definitionId: a.id,
                    name: `${firstWord} / ${secondWord}`,
                    content: scenarioContentA as unknown as Prisma.InputJsonValue,
                  },
                }),
                tx.scenario.create({
                  data: {
                    definitionId: b.id,
                    name: `${secondWord} / ${firstWord}`,
                    content: scenarioContentB as unknown as Prisma.InputJsonValue,
                  },
                }),
              );
            }
          }

          await Promise.all(scenarioCreates);
        } else {
          // Backward-compatible fallback: single scenario — strip [level] token since
          // no level word was chosen (value statement bodies now contain [level]).
          const scenarioAFirst: ScenarioContent = {
            schema_version: 1,
            prompt: templateAFirst.replace(/\[level\]\s*/g, ''),
            dimension_values: {},
          };
          const scenarioBFirst: ScenarioContent = {
            schema_version: 1,
            prompt: templateBFirst.replace(/\[level\]\s*/g, ''),
            dimension_values: {},
          };

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
        }

        return [a, b] as const;
      });

      ctx.log.info(
        {
          aFirstId: defA.id,
          bFirstId: defB.id,
          pairKey,
          levelPresetVersionId: resolvedLevelPresetVersionId,
          scenarioCount: levelPresetVersion != null ? 50 : 2,
        },
        'Job choice pair created',
      );

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
