import {
  db,
  resolveDefinitionContent,
  type DefinitionComponents,
  type DefinitionContent,
  type Prisma,
} from '@valuerank/db';
import {
  assembleTemplate,
  createLogger,
  getJobChoiceValueStatementBody,
} from '@valuerank/shared';

import { buildJobChoiceScenarios } from './job-choice-vignette-utils.js';

const log = createLogger('scripts:update-job-choice-vignettes');

type ParsedArgs = {
  apply: boolean;
  limit: number | null;
  definitionId: string | null;
};

function parseArgs(argv: string[]): ParsedArgs {
  let apply = false;
  let limit: number | null = null;
  let definitionId: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') {
      apply = true;
      continue;
    }
    if (arg === '--limit') {
      const next = argv[index + 1];
      if (!next) throw new Error('--limit requires a number');
      limit = Number.parseInt(next, 10);
      if (!Number.isFinite(limit) || limit <= 0) {
        throw new Error('--limit must be a positive integer');
      }
      index += 1;
      continue;
    }
    if (arg === '--definition-id') {
      const next = argv[index + 1];
      if (!next) throw new Error('--definition-id requires a value');
      definitionId = next;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { apply, limit, definitionId };
}

function extractJobChoiceIntro(template: string): string {
  for (const marker of ['\n\nOne job offers ', '\n\nIn one role, this job offers ']) {
    const markerIndex = template.indexOf(marker);
    if (markerIndex >= 0) {
      return template.slice(0, markerIndex).trimEnd();
    }
  }
  throw new Error('Template does not contain the expected job-choice sentence structure');
}

function normalizeComponents(components: DefinitionComponents): DefinitionComponents {
  const valueFirstBody = getJobChoiceValueStatementBody(components.value_first.token);
  if (valueFirstBody == null) {
    throw new Error(`No job-choice value statement body found for token: ${components.value_first.token}`);
  }

  const valueSecondBody = getJobChoiceValueStatementBody(components.value_second.token);
  if (valueSecondBody == null) {
    throw new Error(`No job-choice value statement body found for token: ${components.value_second.token}`);
  }

  return {
    context_id: components.context_id,
    value_first: {
      token: components.value_first.token,
      body: valueFirstBody,
    },
    value_second: {
      token: components.value_second.token,
      body: valueSecondBody,
    },
  };
}

function buildUpdatedContent(content: DefinitionContent, contextText: string): DefinitionContent {
  const components = content.components;
  if (components == null) {
    throw new Error('Job-choice definition is missing components');
  }

  const normalizedComponents = normalizeComponents(components);
  const updatedTemplate = assembleTemplate(contextText, normalizedComponents);

  return {
    ...content,
    template: updatedTemplate,
    components: normalizedComponents,
  };
}

async function rewriteDefinition(definitionId: string): Promise<{
  updatedTemplate: string;
  scenarioCount: number;
}> {
  const definition = await db.definition.findUnique({
    where: { id: definitionId },
    include: {
      domainContext: true,
      levelPresetVersion: true,
    },
  });
  if (definition == null) {
    throw new Error(`Definition not found: ${definitionId}`);
  }

  const content = await resolveDefinitionContent(definitionId);
  if (content.resolvedContent.methodology?.family !== 'job-choice') {
    throw new Error(`Definition is not a job-choice vignette: ${definitionId}`);
  }

  const components = content.resolvedContent.components;
  if (components?.context_id == null) {
    throw new Error(`Job-choice definition is missing context_id: ${definitionId}`);
  }

  const contextText =
    definition.domainContext?.text ??
    (await db.domainContext.findUnique({
      where: { id: components.context_id },
      select: { text: true },
    }))?.text;
  if (contextText == null) {
    throw new Error(`Domain context not found for job-choice definition: ${definitionId}`);
  }

  const updatedContent = buildUpdatedContent(content.resolvedContent, contextText);
  const updatedScenarios = buildJobChoiceScenarios({
    definitionId,
    contextText,
    components: updatedContent.components!,
    levelPresetVersion: definition.levelPresetVersion == null
      ? null
      : {
          l1: definition.levelPresetVersion.l1,
          l2: definition.levelPresetVersion.l2,
          l3: definition.levelPresetVersion.l3,
          l4: definition.levelPresetVersion.l4,
          l5: definition.levelPresetVersion.l5,
        },
  });

  await db.$transaction(async (tx) => {
    await tx.definition.update({
      where: { id: definitionId },
      data: {
        content: updatedContent as unknown as Prisma.InputJsonValue,
      },
    });

    await tx.scenario.updateMany({
      where: { definitionId, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    for (const scenario of updatedScenarios) {
      await tx.scenario.create({
        data: {
          definitionId,
          name: scenario.name,
          content: scenario.content as unknown as Prisma.InputJsonValue,
        },
      });
    }
  });

  return {
    updatedTemplate: updatedContent.template,
    scenarioCount: updatedScenarios.length,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const jobChoiceDomain = await db.domain.findUnique({
    where: { normalizedName: 'job-choice' },
    select: { id: true },
  });

  if (jobChoiceDomain == null) {
    throw new Error('Job-choice domain not found');
  }

  const definitions = await db.definition.findMany({
    where: {
      domainId: jobChoiceDomain.id,
      deletedAt: null,
      ...(args.definitionId != null ? { id: args.definitionId } : {}),
    },
    orderBy: { name: 'asc' },
    take: args.limit ?? undefined,
    select: { id: true, name: true },
  });

  const summary = {
    inspected: definitions.length,
    updated: 0,
    skipped: 0,
  };

  for (const definition of definitions) {
    const resolved = await resolveDefinitionContent(definition.id);
    if (resolved.resolvedContent.methodology?.family !== 'job-choice') {
      summary.skipped += 1;
      continue;
    }

    const intro = extractJobChoiceIntro(resolved.resolvedContent.template);
    const normalizedComponents = normalizeComponents(resolved.resolvedContent.components!);
    const expectedTemplate = assembleTemplate(intro, normalizedComponents);
    const alreadyNormalized =
      resolved.resolvedContent.template === expectedTemplate &&
      resolved.resolvedContent.components?.value_first.body === normalizedComponents.value_first.body &&
      resolved.resolvedContent.components?.value_second.body === normalizedComponents.value_second.body;

    if (alreadyNormalized) {
      summary.skipped += 1;
      continue;
    }

    if (!args.apply) {
      summary.updated += 1;
      log.info({ definitionId: definition.id, name: definition.name }, 'Would update job-choice vignette');
      continue;
    }

    const result = await rewriteDefinition(definition.id);
    summary.updated += 1;
    log.info(
      {
        definitionId: definition.id,
        name: definition.name,
        scenarioCount: result.scenarioCount,
      },
      'Updated job-choice vignette',
    );
  }

  log.info({ ...summary, apply: args.apply }, 'Job-choice vignette update complete');
}

main()
  .catch((error) => {
    log.error({ err: error }, 'Failed to update job-choice vignettes');
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
