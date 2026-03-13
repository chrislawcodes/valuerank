import { db, resolveDefinitionContent, type Definition } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';

import {
  transformJobChoiceDefinition,
  isTransformableJobChoiceTemplate,
  type JobChoicePresentationOrder,
} from './job-choice-transform.js';
import { expandScenarios } from '../apps/api/src/services/scenario/expand.js';

const log = createLogger('scripts:create-job-choice-vignettes');

type ParsedArgs = {
  apply: boolean;
  limit: number | null;
  preambleVersionId: string | null;
  definitionId: string | null;
};

function parseArgs(argv: string[]): ParsedArgs {
  let apply = false;
  let limit: number | null = null;
  let preambleVersionId: string | null = null;
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
    if (arg === '--preamble-version-id') {
      const next = argv[index + 1];
      if (!next) throw new Error('--preamble-version-id requires a value');
      preambleVersionId = next;
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

  return { apply, limit, preambleVersionId, definitionId };
}

async function ensureDomain(apply: boolean): Promise<{ id: string; name: string } | null> {
  const existing = await db.domain.findUnique({ where: { normalizedName: 'job-choice' } });
  if (existing) {
    return existing;
  }
  if (!apply) {
    return null;
  }
  return db.domain.create({
    data: {
      name: 'Job Choice',
      normalizedName: 'job-choice',
    },
  });
}

async function ensureTag(apply: boolean): Promise<{ id: string; name: string } | null> {
  const existing = await db.tag.findUnique({ where: { name: 'job-choice' } });
  if (existing) {
    return existing;
  }
  if (!apply) {
    return null;
  }
  return db.tag.create({ data: { name: 'job-choice' } });
}

async function fetchProfessionalRootDefinitions(limit: number | null, definitionId: string | null): Promise<Definition[]> {
  const domain = await db.domain.findUnique({ where: { normalizedName: 'professional' } });
  if (!domain) {
    throw new Error('Professional domain not found');
  }

  return db.definition.findMany({
    where: {
      domainId: domain.id,
      parentId: null,
      deletedAt: null,
      ...(definitionId ? { id: definitionId } : {}),
    },
    orderBy: { name: 'asc' },
    take: limit ?? undefined,
  });
}

async function createJobChoiceDefinition(
  sourceDefinition: Definition,
  targetDomainId: string,
  tagId: string,
  preambleVersionIdOverride: string | null,
  presentationOrder: JobChoicePresentationOrder,
  pairKey: string,
): Promise<string> {
  const resolved = await resolveDefinitionContent(sourceDefinition.id);
  if (!isTransformableJobChoiceTemplate(resolved.resolvedContent.template)) {
    throw new Error(`Definition is not transformable as a Jobs vignette: ${sourceDefinition.name}`);
  }

  const transformed = transformJobChoiceDefinition(resolved.resolvedContent, {
    presentationOrder,
    pairKey,
  });
  const preambleVersionId = preambleVersionIdOverride ?? sourceDefinition.preambleVersionId ?? null;
  const variantName = `${sourceDefinition.name} [Job Choice ${presentationOrder === 'A_first' ? 'A First' : 'B First'}]`;

  const created = await db.$transaction(async (tx) => {
    const definition = await tx.definition.create({
      data: {
        name: variantName,
        content: transformed.content,
        domainId: targetDomainId,
        preambleVersionId,
      },
    });

    await tx.definitionTag.create({
      data: {
        definitionId: definition.id,
        tagId,
      },
    });

    return definition;
  });

  await expandScenarios(created.id, transformed.content);
  return created.id;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const sourceDefinitions = await fetchProfessionalRootDefinitions(args.limit, args.definitionId);
  const targetDomain = await ensureDomain(args.apply);
  const jobChoiceTag = await ensureTag(args.apply);

  const summary = {
    inspected: sourceDefinitions.length,
    skippedExisting: 0,
    transformable: 0,
    created: 0,
  };

  for (const definition of sourceDefinitions) {
    const resolved = await resolveDefinitionContent(definition.id);
    const transformable = isTransformableJobChoiceTemplate(resolved.resolvedContent.template);
    if (!transformable) {
      log.warn({ definitionId: definition.id, name: definition.name }, 'Skipping non-transformable definition');
      continue;
    }

    summary.transformable += 1;
    const pairKey = `job-choice:${definition.id}`;

    for (const presentationOrder of ['A_first', 'B_first'] as const) {
      const variantName = `${definition.name} [Job Choice ${presentationOrder === 'A_first' ? 'A First' : 'B First'}]`;
      const existing = await db.definition.findFirst({
        where: {
          name: variantName,
          domain: { normalizedName: 'job-choice' },
          deletedAt: null,
        },
        select: { id: true },
      });
      if (existing) {
        summary.skippedExisting += 1;
        continue;
      }

      if (!args.apply || !targetDomain || !jobChoiceTag) {
        continue;
      }

      const createdId = await createJobChoiceDefinition(
        definition,
        targetDomain.id,
        jobChoiceTag.id,
        args.preambleVersionId,
        presentationOrder,
        pairKey,
      );
      summary.created += 1;
      log.info(
        { sourceDefinitionId: definition.id, createdId, name: variantName, presentationOrder },
        'Created Job Choice definition'
      );
    }
  }

  log.info({ ...summary, apply: args.apply, definitionId: args.definitionId }, 'Job Choice vignette duplication complete');
}

main()
  .catch((error) => {
    log.error({ err: error }, 'Failed to create Job Choice vignettes');
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
