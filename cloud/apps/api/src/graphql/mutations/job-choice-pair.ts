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

type ResolvedPairInputs = {
  domainId: string;
  contextId: string;
  valueFirstId: string;
  valueSecondId: string;
  preambleVersionId: string | null;
  resolvedLevelPresetVersionId: string | null;
  levelPresetVersion: {
    l1: string; l2: string; l3: string; l4: string; l5: string;
  } | null;
  context: { id: string; text: string; domainId: string };
  valueFirst: { id: string; token: string; body: string; domainId: string };
  valueSecond: { id: string; token: string; body: string; domainId: string };
};

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

const UpdateJobChoicePairInput = builder.inputType('UpdateJobChoicePairInput', {
  fields: (t) => ({
    definitionId: t.id({ required: true }),
    name: t.string({ required: true }),
    contextId: t.id({ required: true }),
    valueFirstId: t.id({ required: true }),
    valueSecondId: t.id({ required: true }),
    preambleVersionId: t.id({ required: false }),
    levelPresetVersionId: t.id({ required: false }),
  }),
});

function buildJobChoicePairContent(
  pairKey: string,
  contextText: string,
  contextId: string,
  valueFirst: { token: string; body: string },
  valueSecond: { token: string; body: string },
) {
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

  const templateAFirst = assembleTemplate(contextText, componentsAFirst);
  const templateBFirst = assembleTemplate(contextText, componentsBFirst);
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

  return {
    contentAFirst,
    contentBFirst,
    componentsAFirst,
    componentsBFirst,
  };
}

async function createJobChoiceScenarios(
  tx: Prisma.TransactionClient,
  params: {
    definitionAId: string;
    definitionBId: string;
    contextText: string;
    componentsAFirst: DefinitionComponents;
    componentsBFirst: DefinitionComponents;
    valueFirstToken: string;
    valueSecondToken: string;
    levelPresetVersion: ResolvedPairInputs['levelPresetVersion'];
  },
) {
  const {
    definitionAId,
    definitionBId,
    contextText,
    componentsAFirst,
    componentsBFirst,
    valueFirstToken,
    valueSecondToken,
    levelPresetVersion,
  } = params;

  if (levelPresetVersion != null) {
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
        const promptA = assembleTemplate(contextText, componentsAFirst, {
          first: firstWord,
          second: secondWord,
        });
        const promptB = assembleTemplate(contextText, componentsBFirst, {
          first: secondWord,
          second: firstWord,
        });

        const scenarioContentA: ScenarioContent = {
          schema_version: 1,
          prompt: promptA,
          dimension_values: {
            [valueFirstToken]: firstWord,
            [valueSecondToken]: secondWord,
          },
        };
        const scenarioContentB: ScenarioContent = {
          schema_version: 1,
          prompt: promptB,
          dimension_values: {
            [valueSecondToken]: secondWord,
            [valueFirstToken]: firstWord,
          },
        };

        scenarioCreates.push(
          tx.scenario.create({
            data: {
              definitionId: definitionAId,
              name: `${firstWord} / ${secondWord}`,
              content: scenarioContentA as unknown as Prisma.InputJsonValue,
            },
          }),
          tx.scenario.create({
            data: {
              definitionId: definitionBId,
              name: `${secondWord} / ${firstWord}`,
              content: scenarioContentB as unknown as Prisma.InputJsonValue,
            },
          }),
        );
      }
    }

    await Promise.all(scenarioCreates);
    return;
  }

  const scenarioAFirst: ScenarioContent = {
    schema_version: 1,
    prompt: assembleTemplate(contextText, componentsAFirst).replace(/\[level\]\s*/g, ''),
    dimension_values: {},
  };
  const scenarioBFirst: ScenarioContent = {
    schema_version: 1,
    prompt: assembleTemplate(contextText, componentsBFirst).replace(/\[level\]\s*/g, ''),
    dimension_values: {},
  };

  await tx.scenario.create({
    data: {
      definitionId: definitionAId,
      name: 'Default Scenario',
      content: scenarioAFirst as unknown as Prisma.InputJsonValue,
    },
  });
  await tx.scenario.create({
    data: {
      definitionId: definitionBId,
      name: 'Default Scenario',
      content: scenarioBFirst as unknown as Prisma.InputJsonValue,
    },
  });
}

async function resolveJobChoicePairInputs(input: {
  domainId: string;
  contextId: string;
  valueFirstId: string;
  valueSecondId: string;
  preambleVersionId: string | null;
  levelPresetVersionId: string | null;
}) {
  const {
    domainId,
    contextId,
    valueFirstId,
    valueSecondId,
    preambleVersionId,
    levelPresetVersionId: inputLevelPresetVersionId,
  } = input;

  if (valueFirstId === valueSecondId) {
    throw new Error('valueFirstId and valueSecondId must be different');
  }

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

  const resolvedLevelPresetVersionId =
    inputLevelPresetVersionId ?? domain.defaultLevelPresetVersionId ?? null;

  let levelPresetVersion: ResolvedPairInputs['levelPresetVersion'] = null;

  if (resolvedLevelPresetVersionId != null) {
    levelPresetVersion = await db.levelPresetVersion.findUnique({
      where: { id: resolvedLevelPresetVersionId },
      select: { l1: true, l2: true, l3: true, l4: true, l5: true },
    });
    if (levelPresetVersion == null) {
      throw new Error(`LevelPresetVersion not found: ${resolvedLevelPresetVersionId}`);
    }
  }

  return {
    domainId,
    contextId,
    valueFirstId,
    valueSecondId,
    preambleVersionId,
    resolvedLevelPresetVersionId,
    levelPresetVersion,
    context,
    valueFirst,
    valueSecond,
  } satisfies ResolvedPairInputs;
}

async function resolveJobChoicePair(definitionId: string) {
  const definition = await db.definition.findUnique({
    where: { id: definitionId },
    select: {
      id: true,
      name: true,
      domainId: true,
      deletedAt: true,
      content: true,
    },
  });

  if (definition == null || definition.deletedAt != null) {
    throw new Error(`Definition not found: ${definitionId}`);
  }

  const contentRecord =
    definition.content != null && typeof definition.content === 'object' && !Array.isArray(definition.content)
      ? definition.content as Record<string, unknown>
      : null;
  const methodology =
    contentRecord?.methodology != null && typeof contentRecord.methodology === 'object' && !Array.isArray(contentRecord.methodology)
      ? contentRecord.methodology as Record<string, unknown>
      : null;

  if (
    methodology?.family !== 'job-choice'
    || typeof methodology.pair_key !== 'string'
    || (methodology.presentation_order !== 'A_first' && methodology.presentation_order !== 'B_first')
  ) {
    throw new Error('Definition is not a paired Job Choice vignette');
  }

  const pairDefinitions = await db.definition.findMany({
    where: {
      domainId: definition.domainId,
      deletedAt: null,
      content: {
        path: ['methodology', 'pair_key'],
        equals: methodology.pair_key,
      },
    },
    select: {
      id: true,
      name: true,
      content: true,
    },
  });

  const aFirst = pairDefinitions.find((candidate) => (
    candidate.content != null
    && typeof candidate.content === 'object'
    && !Array.isArray(candidate.content)
    && (candidate.content as Record<string, unknown>).methodology != null
    && typeof (candidate.content as Record<string, unknown>).methodology === 'object'
    && !Array.isArray((candidate.content as Record<string, unknown>).methodology)
    && ((candidate.content as Record<string, unknown>).methodology as Record<string, unknown>).presentation_order === 'A_first'
  ));
  const bFirst = pairDefinitions.find((candidate) => (
    candidate.content != null
    && typeof candidate.content === 'object'
    && !Array.isArray(candidate.content)
    && (candidate.content as Record<string, unknown>).methodology != null
    && typeof (candidate.content as Record<string, unknown>).methodology === 'object'
    && !Array.isArray((candidate.content as Record<string, unknown>).methodology)
    && ((candidate.content as Record<string, unknown>).methodology as Record<string, unknown>).presentation_order === 'B_first'
  ));

  if (aFirst == null || bFirst == null) {
    throw new Error('Paired Job Choice vignette is missing either the A-first or B-first definition');
  }

  return {
    pairKey: methodology.pair_key,
    aFirst,
    bFirst,
  };
}

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

      const preambleVersionId =
        input.preambleVersionId != null ? String(input.preambleVersionId) : null;
      const inputLevelPresetVersionId =
        input.levelPresetVersionId != null ? String(input.levelPresetVersionId) : null;
      const resolvedInputs = await resolveJobChoicePairInputs({
        domainId,
        contextId,
        valueFirstId,
        valueSecondId,
        preambleVersionId,
        levelPresetVersionId: inputLevelPresetVersionId,
      });

      const pairKey = randomUUID();
      const {
        contentAFirst,
        contentBFirst,
        componentsAFirst,
        componentsBFirst,
      } = buildJobChoicePairContent(
        pairKey,
        resolvedInputs.context.text,
        resolvedInputs.contextId,
        resolvedInputs.valueFirst,
        resolvedInputs.valueSecond,
      );

      const [defA, defB] = await db.$transaction(async (tx) => {
        const a = await tx.definition.create({
          data: {
            name: `${input.name} (A)`,
            content: contentAFirst as unknown as Prisma.InputJsonValue,
            domainId,
            domainContextId: resolvedInputs.contextId,
            preambleVersionId,
            levelPresetVersionId: resolvedInputs.resolvedLevelPresetVersionId,
            createdByUserId: ctx.user?.id ?? null,
          },
        });
        const b = await tx.definition.create({
          data: {
            name: `${input.name} (B)`,
            content: contentBFirst as unknown as Prisma.InputJsonValue,
            domainId,
            domainContextId: resolvedInputs.contextId,
            preambleVersionId,
            levelPresetVersionId: resolvedInputs.resolvedLevelPresetVersionId,
            createdByUserId: ctx.user?.id ?? null,
          },
        });
        await createJobChoiceScenarios(tx, {
          definitionAId: a.id,
          definitionBId: b.id,
          contextText: resolvedInputs.context.text,
          componentsAFirst,
          componentsBFirst,
          valueFirstToken: resolvedInputs.valueFirst.token,
          valueSecondToken: resolvedInputs.valueSecond.token,
          levelPresetVersion: resolvedInputs.levelPresetVersion,
        });

        return [a, b] as const;
      });

      ctx.log.info(
        {
          aFirstId: defA.id,
          bFirstId: defB.id,
          pairKey,
          levelPresetVersionId: resolvedInputs.resolvedLevelPresetVersionId,
          scenarioCount: resolvedInputs.levelPresetVersion != null ? 50 : 2,
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

builder.mutationField('updateJobChoicePair', (t) =>
  t.field({
    type: CreateJobChoicePairResultRef,
    args: { input: t.arg({ type: UpdateJobChoicePairInput, required: true }) },
    resolve: async (_root, { input }, ctx) => {
      const definitionId = String(input.definitionId);
      const contextId = String(input.contextId);
      const valueFirstId = String(input.valueFirstId);
      const valueSecondId = String(input.valueSecondId);
      const preambleVersionId =
        input.preambleVersionId != null ? String(input.preambleVersionId) : null;
      const inputLevelPresetVersionId =
        input.levelPresetVersionId != null ? String(input.levelPresetVersionId) : null;

      const existingPair = await resolveJobChoicePair(definitionId);
      const domainId = (
        await db.definition.findUnique({
          where: { id: existingPair.aFirst.id },
          select: { domainId: true },
        })
      )?.domainId;

      if (domainId == null) {
        throw new Error(`Definition ${definitionId} is not assigned to a domain`);
      }

      const resolvedInputs = await resolveJobChoicePairInputs({
        domainId,
        contextId,
        valueFirstId,
        valueSecondId,
        preambleVersionId,
        levelPresetVersionId: inputLevelPresetVersionId,
      });

      const {
        contentAFirst,
        contentBFirst,
        componentsAFirst,
        componentsBFirst,
      } = buildJobChoicePairContent(
        existingPair.pairKey,
        resolvedInputs.context.text,
        resolvedInputs.contextId,
        resolvedInputs.valueFirst,
        resolvedInputs.valueSecond,
      );

      const [updatedA, updatedB] = await db.$transaction(async (tx) => {
        await tx.scenario.deleteMany({
          where: { definitionId: { in: [existingPair.aFirst.id, existingPair.bFirst.id] } },
        });

        const updatedDefinitions = await Promise.all([
          tx.definition.update({
            where: { id: existingPair.aFirst.id },
            data: {
              name: `${input.name} (A)`,
              content: contentAFirst as unknown as Prisma.InputJsonValue,
              domainContextId: resolvedInputs.contextId,
              preambleVersionId,
              levelPresetVersionId: resolvedInputs.resolvedLevelPresetVersionId,
            },
          }),
          tx.definition.update({
            where: { id: existingPair.bFirst.id },
            data: {
              name: `${input.name} (B)`,
              content: contentBFirst as unknown as Prisma.InputJsonValue,
              domainContextId: resolvedInputs.contextId,
              preambleVersionId,
              levelPresetVersionId: resolvedInputs.resolvedLevelPresetVersionId,
            },
          }),
        ]);

        await createJobChoiceScenarios(tx, {
          definitionAId: existingPair.aFirst.id,
          definitionBId: existingPair.bFirst.id,
          contextText: resolvedInputs.context.text,
          componentsAFirst,
          componentsBFirst,
          valueFirstToken: resolvedInputs.valueFirst.token,
          valueSecondToken: resolvedInputs.valueSecond.token,
          levelPresetVersion: resolvedInputs.levelPresetVersion,
        });

        return [updatedDefinitions[0], updatedDefinitions[1]] as const;
      });

      void createAuditLog({
        action: 'UPDATE',
        entityType: 'Definition',
        entityId: updatedA.id,
        userId: ctx.user?.id ?? null,
        metadata: { name: updatedA.name, pairKey: existingPair.pairKey, sourceDefinitionId: definitionId },
      });
      void createAuditLog({
        action: 'UPDATE',
        entityType: 'Definition',
        entityId: updatedB.id,
        userId: ctx.user?.id ?? null,
        metadata: { name: updatedB.name, pairKey: existingPair.pairKey, sourceDefinitionId: definitionId },
      });

      ctx.log.info(
        {
          sourceDefinitionId: definitionId,
          aFirstId: updatedA.id,
          bFirstId: updatedB.id,
          pairKey: existingPair.pairKey,
          levelPresetVersionId: resolvedInputs.resolvedLevelPresetVersionId,
          scenarioCount: resolvedInputs.levelPresetVersion != null ? 50 : 2,
        },
        'Job choice pair updated',
      );

      return {
        aFirst: updatedA as DefinitionShape,
        bFirst: updatedB as DefinitionShape,
      };
    },
  }),
);
