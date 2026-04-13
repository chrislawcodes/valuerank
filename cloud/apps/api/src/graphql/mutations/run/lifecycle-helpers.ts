import { db } from '@valuerank/db';
import type { Prisma } from '@valuerank/db';
import { NotFoundError, ValidationError } from '@valuerank/shared';
import type { Context } from '../../context.js';
import { findPairedCompanion, getComponentTokens } from '../../../utils/auto-pair.js';

type DefinitionMethodology = {
  family?: string;
  response_scale?: string;
  pair_key?: string;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function getDefinitionMethodology(content: unknown): DefinitionMethodology | null {
  if (content === null || content === undefined || typeof content !== 'object' || Array.isArray(content)) {
    return null;
  }

  const methodology = (content as Record<string, unknown>).methodology;
  if (methodology === null || methodology === undefined || typeof methodology !== 'object' || Array.isArray(methodology)) {
    return null;
  }

  const record = methodology as Record<string, unknown>;
  return {
    family: typeof record.family === 'string' ? record.family : undefined,
    response_scale: typeof record.response_scale === 'string' ? record.response_scale : undefined,
    pair_key: typeof record.pair_key === 'string' ? record.pair_key : undefined,
  };
}

function mergeCompanionRunId(config: unknown, companionRunId: string): Prisma.InputJsonValue {
  return {
    ...(isRecord(config) ? config : {}),
    companionRunId,
  };
}

function getConfiguredCompanionRunId(config: unknown): string | null {
  if (!isRecord(config)) {
    return null;
  }

  const raw = config.companionRunId;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : null;
}

export async function persistPairedCompanionRunIds(primaryRunId: string, companionRunId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const [primaryRun, companionRun] = await Promise.all([
      tx.run.findUnique({
        where: { id: primaryRunId },
        select: { id: true, config: true },
      }),
      tx.run.findUnique({
        where: { id: companionRunId },
        select: { id: true, config: true },
      }),
    ]);

    if (!primaryRun) {
      throw new NotFoundError('Run', primaryRunId);
    }
    if (!companionRun) {
      throw new NotFoundError('Run', companionRunId);
    }

    const primaryConfiguredCompanionRunId = getConfiguredCompanionRunId(primaryRun.config);
    if (primaryConfiguredCompanionRunId !== null && primaryConfiguredCompanionRunId !== companionRunId) {
      throw new ValidationError(`Run ${primaryRunId} is already paired with a different companion run.`);
    }

    const companionConfiguredCompanionRunId = getConfiguredCompanionRunId(companionRun.config);
    if (companionConfiguredCompanionRunId !== null && companionConfiguredCompanionRunId !== primaryRunId) {
      throw new ValidationError(`Run ${companionRunId} is already paired with a different companion run.`);
    }

    const primaryNeedsUpdate = primaryConfiguredCompanionRunId !== companionRunId;
    const companionNeedsUpdate = companionConfiguredCompanionRunId !== primaryRunId;
    if (!primaryNeedsUpdate && !companionNeedsUpdate) {
      return;
    }

    await tx.run.update({
      where: { id: primaryRunId },
      data: {
        config: mergeCompanionRunId(primaryRun.config, companionRunId),
      },
    });

    await tx.run.update({
      where: { id: companionRunId },
      data: {
        config: mergeCompanionRunId(companionRun.config, primaryRunId),
      },
    });
  });
}

export async function resolvePairedDefinition(
  definitionId: string,
): Promise<{ primary: { id: string; content: unknown }; companionId: string; companionContent: unknown; primaryValueFirst: string; companionValueFirst: string }> {
  const definition = await db.definition.findUnique({
    where: { id: definitionId },
    select: {
      id: true,
      domainId: true,
      content: true,
      deletedAt: true,
    },
  });

  if (!definition || definition.deletedAt !== null) {
    throw new NotFoundError('Definition', definitionId);
  }

  const methodology = getDefinitionMethodology(definition.content);
  if (!methodology?.pair_key) {
    throw new ValidationError('Paired batches require a vignette with a pair_key in its methodology.');
  }

  const candidates = await db.definition.findMany({
    where: {
      id: { not: definition.id },
      deletedAt: null,
      domainId: definition.domainId,
      content: {
        path: ['methodology', 'pair_key'],
        equals: methodology.pair_key,
      },
    },
    select: { id: true, content: true },
  });

  const companion = findPairedCompanion(
    { id: definition.id, content: definition.content },
    candidates,
  );

  if (companion === null || companion === undefined) {
    throw new ValidationError(
      'Paired batch launch requires a companion Job Choice definition with mirrored value tokens. Generate the companion definition first.'
    );
  }

  const primaryTokens = getComponentTokens(definition.content);
  const companionTokens = getComponentTokens(companion.content);

  if (!primaryTokens || !companionTokens) {
    throw new ValidationError(
      'Paired batch launch requires both definitions to have value_first and value_second component tokens.'
    );
  }

  return {
    primary: { id: definition.id, content: definition.content },
    companionId: companion.id,
    companionContent: companion.content,
    primaryValueFirst: primaryTokens.value_first.token,
    companionValueFirst: companionTokens.value_first.token,
  };
}

type LoadedRun = NonNullable<Awaited<ReturnType<Context['loaders']['run']['load']>>>;

export async function loadRunForResult(runId: string, ctx: Context): Promise<LoadedRun> {
  const run = await ctx.loaders.run.load(runId);
  if (run == null) {
    throw new NotFoundError('Run', runId);
  }
  return run;
}
