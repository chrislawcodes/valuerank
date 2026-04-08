import { randomUUID } from 'node:crypto';
import {
  db,
  type DefinitionComponents,
  type DefinitionContentV1,
  type Prisma,
  type ScenarioContent,
} from '@valuerank/db';
import { assembleTemplate, getJobChoiceValueStatementBody, type TemplateConfig } from '@valuerank/shared';
import { builder } from '../builder.js';
import { DefinitionRef } from '../types/refs.js';
import type { DefinitionShape } from '../types/refs.js';
import { createAuditLog } from '../../services/audit/index.js';
import { applyLevelPresetToDefinitionContent } from '../../utils/definition-level-preset.js';
import { findPairedCompanion } from '../../utils/auto-pair.js';

type PairedVignetteContent = DefinitionContentV1 & {
  components: DefinitionComponents;
};

type PairedVignetteResult = { definitionA: DefinitionShape; definitionB: DefinitionShape };

type ResolvedPairInputs = {
  domainId: string;
  domainNormalizedName: string;
  domainSentencePrefix: string | null;
  domainLabelPrefix: string | null;
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

const CreatePairedVignetteResultRef =
  builder.objectRef<PairedVignetteResult>('CreatePairedVignetteResult');

builder.objectType(CreatePairedVignetteResultRef, {
  fields: (t) => ({
    definitionA: t.field({ type: DefinitionRef, resolve: (result) => result.definitionA }),
    definitionB: t.field({ type: DefinitionRef, resolve: (result) => result.definitionB }),
  }),
});

const CreatePairedVignetteInput = builder.inputType('CreatePairedVignetteInput', {
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

const UpdatePairedVignetteInput = builder.inputType('UpdatePairedVignetteInput', {
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

function formatValueOrderToken(value: string): string {
  const normalized = value.trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  if (normalized.length === 0) {
    return value;
  }

  if (!/^[a-z0-9 ]+$/i.test(normalized)) {
    return normalized;
  }

  return normalized
    .split(' ')
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function buildValueOrderLabel(firstToken: string, secondToken: string): string {
  return `${formatValueOrderToken(firstToken)} -> ${formatValueOrderToken(secondToken)}`;
}

function buildPairedDefinitionName(_baseName: string, firstToken: string, secondToken: string): string {
  return buildValueOrderLabel(firstToken, secondToken);
}

function buildPairedVignetteContent(
  pairKey: string,
  contextText: string,
  contextId: string,
  valueFirst: { token: string; body: string },
  valueSecond: { token: string; body: string },
  levelPresetVersion: ResolvedPairInputs['levelPresetVersion'],
  familyName: string,
  templateConfig?: TemplateConfig,
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

  const templateAFirst = assembleTemplate(contextText, componentsAFirst, undefined, templateConfig);
  const templateBFirst = assembleTemplate(contextText, componentsBFirst, undefined, templateConfig);
  const dimensions = [{ name: valueFirst.token }, { name: valueSecond.token }];

  const contentAFirst: PairedVignetteContent = applyLevelPresetToDefinitionContent({
    schema_version: 1,
    template: templateAFirst,
    dimensions,
    methodology: {
      family: familyName,
      response_scale: 'option_text',
      pair_key: pairKey,
    },
    components: componentsAFirst,
  }, levelPresetVersion);
  const contentBFirst: PairedVignetteContent = applyLevelPresetToDefinitionContent({
    schema_version: 1,
    template: templateBFirst,
    dimensions,
    methodology: {
      family: familyName,
      response_scale: 'option_text',
      pair_key: pairKey,
    },
    components: componentsBFirst,
  }, levelPresetVersion);

  return {
    contentAFirst,
    contentBFirst,
    componentsAFirst,
    componentsBFirst,
  };
}

async function createPairedScenarios(
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
    templateConfig?: TemplateConfig;
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
    templateConfig,
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
        }, templateConfig);
        const promptB = assembleTemplate(contextText, componentsBFirst, {
          first: secondWord,
          second: firstWord,
        }, templateConfig);

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
              orientationFlipped: true,
            },
          }),
        );
      }
    }

    await Promise.all(scenarioCreates);
    return;
  }

  // No level preset — strip [level] from the final prompt since it won't be substituted.
  const scenarioAFirst: ScenarioContent = {
    schema_version: 1,
    prompt: assembleTemplate(contextText, componentsAFirst, undefined, templateConfig).replace(/\[level\]\s*/g, ''),
    dimension_values: {},
  };
  const scenarioBFirst: ScenarioContent = {
    schema_version: 1,
    prompt: assembleTemplate(contextText, componentsBFirst, undefined, templateConfig).replace(/\[level\]\s*/g, ''),
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
      orientationFlipped: true,
    },
  });
}

async function resolvePairedVignetteInputs(input: {
  domainId: string;
  contextId: string;
  valueFirstId: string;
  valueSecondId: string;
  preambleVersionId: string | null;
  levelPresetVersionId: string | null;
  applyDomainDefault?: boolean;
}) {
  const {
    domainId,
    contextId,
    valueFirstId,
    valueSecondId,
    preambleVersionId,
    levelPresetVersionId: inputLevelPresetVersionId,
    applyDomainDefault = false,
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
    db.domain.findUnique({ where: { id: domainId }, select: { id: true, normalizedName: true, sentencePrefix: true, labelPrefix: true, defaultLevelPresetVersionId: true } }),
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
    inputLevelPresetVersionId ?? (applyDomainDefault ? (domain.defaultLevelPresetVersionId ?? null) : null);

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

  const normalizedValueFirst = {
    ...valueFirst,
    body: getJobChoiceValueStatementBody(valueFirst.token) ?? valueFirst.body,
  };
  const normalizedValueSecond = {
    ...valueSecond,
    body: getJobChoiceValueStatementBody(valueSecond.token) ?? valueSecond.body,
  };

  return {
    domainId,
    domainNormalizedName: domain.normalizedName,
    domainSentencePrefix: domain.sentencePrefix,
    domainLabelPrefix: domain.labelPrefix,
    contextId,
    valueFirstId,
    valueSecondId,
    preambleVersionId,
    resolvedLevelPresetVersionId,
    levelPresetVersion,
    context,
    valueFirst: normalizedValueFirst,
    valueSecond: normalizedValueSecond,
  } satisfies ResolvedPairInputs;
}

async function resolvePairedVignette(definitionId: string) {
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

  if (typeof methodology?.family !== 'string' || methodology.family === '' || typeof methodology.pair_key !== 'string') {
    throw new Error('Definition is not a paired vignette');
  }

  const candidates = await db.definition.findMany({
    where: {
      id: { not: definition.id },
      domainId: definition.domainId,
      deletedAt: null,
      content: {
        path: ['methodology', 'pair_key'],
        equals: methodology.pair_key,
      },
    },
    select: { id: true, name: true, content: true },
  });

  const companion = findPairedCompanion(
    { id: definition.id, content: definition.content },
    candidates,
  );

  if (companion == null) {
    throw new Error('Paired vignette is missing its companion with mirrored value tokens');
  }

  const definitionB = companion as { id: string; name: string; content: unknown };

  return {
    pairKey: methodology.pair_key,
    definitionA: { id: definition.id, name: definition.name, content: definition.content },
    definitionB,
  };
}

builder.mutationField('createPairedVignette', (t) =>
  t.field({
    type: CreatePairedVignetteResultRef,
    args: { input: t.arg({ type: CreatePairedVignetteInput, required: true }) },
    resolve: async (_root, { input }, ctx) => {
      const domainId = String(input.domainId);
      const contextId = String(input.contextId);
      const valueFirstId = String(input.valueFirstId);
      const valueSecondId = String(input.valueSecondId);

      ctx.log.info({ domainId, contextId, valueFirstId, valueSecondId }, 'Creating paired vignette');

      const preambleVersionId =
        input.preambleVersionId != null ? String(input.preambleVersionId) : null;
      const inputLevelPresetVersionId =
        input.levelPresetVersionId != null ? String(input.levelPresetVersionId) : null;
      const resolvedInputs = await resolvePairedVignetteInputs({
        domainId,
        contextId,
        valueFirstId,
        valueSecondId,
        preambleVersionId,
        levelPresetVersionId: inputLevelPresetVersionId,
        applyDomainDefault: true,
      });

      const pairKey = randomUUID();
      const domainTemplateConfig: TemplateConfig = {
        sentencePrefix: resolvedInputs.domainSentencePrefix,
        labelPrefix: resolvedInputs.domainLabelPrefix,
      };
      const {
        contentAFirst,
        contentBFirst,
        componentsAFirst,
        componentsBFirst,
      } = buildPairedVignetteContent(
        pairKey,
        resolvedInputs.context.text,
        resolvedInputs.contextId,
        resolvedInputs.valueFirst,
        resolvedInputs.valueSecond,
        resolvedInputs.levelPresetVersion,
        resolvedInputs.domainNormalizedName,
        domainTemplateConfig,
      );

      const [defA, defB] = await db.$transaction(async (tx) => {
        const a = await tx.definition.create({
          data: {
            name: buildPairedDefinitionName(
              input.name,
              resolvedInputs.valueFirst.token,
              resolvedInputs.valueSecond.token,
            ),
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
            name: buildPairedDefinitionName(
              input.name,
              resolvedInputs.valueSecond.token,
              resolvedInputs.valueFirst.token,
            ),
            content: contentBFirst as unknown as Prisma.InputJsonValue,
            domainId,
            domainContextId: resolvedInputs.contextId,
            preambleVersionId,
            levelPresetVersionId: resolvedInputs.resolvedLevelPresetVersionId,
            createdByUserId: ctx.user?.id ?? null,
          },
        });
        await createPairedScenarios(tx, {
          definitionAId: a.id,
          definitionBId: b.id,
          contextText: resolvedInputs.context.text,
          componentsAFirst,
          componentsBFirst,
          valueFirstToken: resolvedInputs.valueFirst.token,
          valueSecondToken: resolvedInputs.valueSecond.token,
          levelPresetVersion: resolvedInputs.levelPresetVersion,
          templateConfig: domainTemplateConfig,
        });

        return [a, b] as const;
      });

      ctx.log.info(
        {
          definitionAId: defA.id,
          definitionBId: defB.id,
          pairKey,
          levelPresetVersionId: resolvedInputs.resolvedLevelPresetVersionId,
          scenarioCount: resolvedInputs.levelPresetVersion != null ? 50 : 2,
        },
        'Paired vignette created',
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
        definitionA: defA as DefinitionShape,
        definitionB: defB as DefinitionShape,
      };
    },
  }),
);

builder.mutationField('updatePairedVignette', (t) =>
  t.field({
    type: CreatePairedVignetteResultRef,
    args: { input: t.arg({ type: UpdatePairedVignetteInput, required: true }) },
    resolve: async (_root, { input }, ctx) => {
      const definitionId = String(input.definitionId);
      const contextId = String(input.contextId);
      const valueFirstId = String(input.valueFirstId);
      const valueSecondId = String(input.valueSecondId);
      const preambleVersionId =
        input.preambleVersionId != null ? String(input.preambleVersionId) : null;
      const inputLevelPresetVersionId =
        input.levelPresetVersionId != null ? String(input.levelPresetVersionId) : null;

      const existingPair = await resolvePairedVignette(definitionId);
      const domainId = (
        await db.definition.findUnique({
          where: { id: existingPair.definitionA.id },
          select: { domainId: true },
        })
      )?.domainId;

      if (domainId == null) {
        throw new Error(`Definition ${definitionId} is not assigned to a domain`);
      }

      const resolvedInputs = await resolvePairedVignetteInputs({
        domainId,
        contextId,
        valueFirstId,
        valueSecondId,
        preambleVersionId,
        levelPresetVersionId: inputLevelPresetVersionId,
      });

      const domainTemplateConfig: TemplateConfig = {
        sentencePrefix: resolvedInputs.domainSentencePrefix,
        labelPrefix: resolvedInputs.domainLabelPrefix,
      };
      const {
        contentAFirst,
        contentBFirst,
        componentsAFirst,
        componentsBFirst,
      } = buildPairedVignetteContent(
        existingPair.pairKey,
        resolvedInputs.context.text,
        resolvedInputs.contextId,
        resolvedInputs.valueFirst,
        resolvedInputs.valueSecond,
        resolvedInputs.levelPresetVersion,
        resolvedInputs.domainNormalizedName,
        domainTemplateConfig,
      );

      const [updatedA, updatedB] = await db.$transaction(async (tx) => {
        await tx.scenario.deleteMany({
          where: { definitionId: { in: [existingPair.definitionA.id, existingPair.definitionB.id] } },
        });

        const updatedDefinitions = await Promise.all([
          tx.definition.update({
            where: { id: existingPair.definitionA.id },
            data: {
              name: buildPairedDefinitionName(
                input.name,
                resolvedInputs.valueFirst.token,
                resolvedInputs.valueSecond.token,
              ),
              content: contentAFirst as unknown as Prisma.InputJsonValue,
              domainContextId: resolvedInputs.contextId,
              preambleVersionId,
              levelPresetVersionId: resolvedInputs.resolvedLevelPresetVersionId,
            },
          }),
          tx.definition.update({
            where: { id: existingPair.definitionB.id },
            data: {
              name: buildPairedDefinitionName(
                input.name,
                resolvedInputs.valueSecond.token,
                resolvedInputs.valueFirst.token,
              ),
              content: contentBFirst as unknown as Prisma.InputJsonValue,
              domainContextId: resolvedInputs.contextId,
              preambleVersionId,
              levelPresetVersionId: resolvedInputs.resolvedLevelPresetVersionId,
            },
          }),
        ]);

        await createPairedScenarios(tx, {
          definitionAId: existingPair.definitionA.id,
          definitionBId: existingPair.definitionB.id,
          contextText: resolvedInputs.context.text,
          componentsAFirst,
          componentsBFirst,
          valueFirstToken: resolvedInputs.valueFirst.token,
          valueSecondToken: resolvedInputs.valueSecond.token,
          levelPresetVersion: resolvedInputs.levelPresetVersion,
          templateConfig: domainTemplateConfig,
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
          definitionAId: updatedA.id,
          definitionBId: updatedB.id,
          pairKey: existingPair.pairKey,
          levelPresetVersionId: resolvedInputs.resolvedLevelPresetVersionId,
          scenarioCount: resolvedInputs.levelPresetVersion != null ? 50 : 2,
        },
        'Paired vignette updated',
      );

      return {
        definitionA: updatedA as DefinitionShape,
        definitionB: updatedB as DefinitionShape,
      };
    },
  }),
);

// ---------------------------------------------------------------------------
// Deprecated aliases — old names resolve identically to the new ones.
// Remove in a future cleanup PR once all clients have migrated.
// ---------------------------------------------------------------------------
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
      if (domainId == null) throw new Error(`Definition ${definitionId} is not assigned to a domain`);
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

