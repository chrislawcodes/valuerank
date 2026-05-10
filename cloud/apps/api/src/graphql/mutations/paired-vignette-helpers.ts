import {
  db,
  type DefinitionComponents,
  type DefinitionContentV1,
  type Prisma,
  type ScenarioContent,
} from '@valuerank/db';
import {
  AppError,
  assembleTemplate,
  getJobChoiceValueStatementBody,
  getSoftwareApproachValueStatementBody,
  NotFoundError,
  ValidationError,
  type TemplateConfig,
} from '@valuerank/shared';
import { applyLevelPresetToDefinitionContent } from '../../utils/definition-level-preset.js';
import { findPairedCompanion, getComponentTokens } from '../../utils/auto-pair.js';

export type PairedVignetteContent = DefinitionContentV1 & {
  components: DefinitionComponents;
};

export type ResolvedPairInputs = {
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

export function buildPairedDefinitionName(_baseName: string, firstToken: string, secondToken: string): string {
  return buildValueOrderLabel(firstToken, secondToken);
}

export function buildPairedVignetteContent(
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

export async function createPairedScenarios(
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

export async function resolvePairedVignetteInputs(input: {
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
    throw new ValidationError('valueFirstId and valueSecondId must be different');
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

  if (context == null) throw new NotFoundError('DomainContext', contextId);
  if (context.domainId !== domainId) {
    throw new ValidationError(`DomainContext ${contextId} does not belong to domain ${domainId}`);
  }
  if (valueFirst == null) throw new NotFoundError('ValueStatement', valueFirstId);
  if (valueFirst.domainId !== domainId) {
    throw new ValidationError(`ValueStatement ${valueFirstId} does not belong to domain ${domainId}`);
  }
  if (valueSecond == null) throw new NotFoundError('ValueStatement', valueSecondId);
  if (valueSecond.domainId !== domainId) {
    throw new ValidationError(`ValueStatement ${valueSecondId} does not belong to domain ${domainId}`);
  }
  if (preambleVersionId != null && preambleVersion == null) {
    throw new NotFoundError('Preamble version', preambleVersionId);
  }
  if (domain == null) throw new NotFoundError('Domain', domainId);

  const resolvedLevelPresetVersionId =
    inputLevelPresetVersionId ?? (applyDomainDefault ? (domain.defaultLevelPresetVersionId ?? null) : null);

  let levelPresetVersion: ResolvedPairInputs['levelPresetVersion'] = null;

  if (resolvedLevelPresetVersionId != null) {
    levelPresetVersion = await db.levelPresetVersion.findUnique({
      where: { id: resolvedLevelPresetVersionId },
      select: { l1: true, l2: true, l3: true, l4: true, l5: true },
    });
    if (levelPresetVersion == null) {
      throw new NotFoundError('LevelPresetVersion', resolvedLevelPresetVersionId);
    }
  }

  const bodyLookup = domain.normalizedName === 'software-approach-choice'
    ? getSoftwareApproachValueStatementBody
    : getJobChoiceValueStatementBody;
  const normalizedValueFirst = {
    ...valueFirst,
    body: bodyLookup(valueFirst.token) ?? valueFirst.body,
  };
  const normalizedValueSecond = {
    ...valueSecond,
    body: bodyLookup(valueSecond.token) ?? valueSecond.body,
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

export async function resolvePairedVignette(definitionId: string) {
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
    throw new NotFoundError('Definition', definitionId);
  }

  const contentRecord =
    definition.content != null && typeof definition.content === 'object' && !Array.isArray(definition.content)
      ? definition.content as Record<string, unknown>
      : null;
  const methodology =
    contentRecord?.methodology != null && typeof contentRecord.methodology === 'object' && !Array.isArray(contentRecord.methodology)
      ? contentRecord.methodology as Record<string, unknown>
      : null;

  if (typeof methodology?.family !== 'string' || methodology.family === '') {
    throw new ValidationError('Definition is not a paired vignette');
  }

  const primaryTokens = getComponentTokens(definition.content);
  if (primaryTokens == null) {
    throw new ValidationError('Definition is not a paired vignette');
  }

  const candidates = await db.definition.findMany({
    where: {
      id: { not: definition.id },
      domainId: definition.domainId,
      deletedAt: null,
    },
    select: { id: true, name: true, content: true },
  });

  const companion = findPairedCompanion(
    { id: definition.id, content: definition.content },
    candidates,
  );

  if (companion == null) {
    throw new AppError('Paired vignette is missing its companion with mirrored value tokens', 'DATA_INTEGRITY');
  }

  const definitionB = companion as { id: string; name: string; content: unknown };

  return {
    definitionA: { id: definition.id, name: definition.name, content: definition.content },
    definitionB,
  };
}
