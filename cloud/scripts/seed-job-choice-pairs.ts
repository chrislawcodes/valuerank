/**
 * Seed all missing job-choice vignette pairs for the 10 canonical value statements.
 *
 * Usage (from cloud/apps/api/):
 *   npx tsx --env-file=../../.env ../../scripts/seed-job-choice-pairs.ts            # dry-run
 *   npx tsx --env-file=../../.env ../../scripts/seed-job-choice-pairs.ts --apply    # write to DB
 *
 * Inside Railway container:
 *   cd apps/api && npx tsx ../../scripts/seed-job-choice-pairs.ts --apply
 */
import { randomUUID } from 'node:crypto';
import {
  db,
  type DefinitionComponents,
  type DefinitionContentV1,
  type Prisma,
  type ScenarioContent,
} from '@valuerank/db';
import { createLogger, assembleTemplate, getJobChoiceValueStatementBody } from '@valuerank/shared';

const log = createLogger('scripts:seed-job-choice-pairs');

// ---------------------------------------------------------------------------
// Inlined from apps/api/src/utils/definition-level-preset.ts (not a package)
// ---------------------------------------------------------------------------
type LevelPresetWords = { l1: string; l2: string; l3: string; l4: string; l5: string };

function hasMissingDimensionLevels(content: unknown): content is Record<string, unknown> & { dimensions: Array<Record<string, unknown>> } {
  if (content == null || typeof content !== 'object' || Array.isArray(content)) return false;
  const dimensions = (content as { dimensions?: unknown }).dimensions;
  if (!Array.isArray(dimensions) || dimensions.length === 0) return false;
  return dimensions.some((d) => {
    if (d == null || typeof d !== 'object' || Array.isArray(d)) return false;
    const levels = (d as { levels?: unknown }).levels;
    return !Array.isArray(levels) || levels.length === 0;
  });
}

function applyLevelPreset<T>(content: T, words: LevelPresetWords | null): T {
  if (words == null || !hasMissingDimensionLevels(content)) return content;
  const presetLevels = [
    { score: 1, label: words.l1 },
    { score: 2, label: words.l2 },
    { score: 3, label: words.l3 },
    { score: 4, label: words.l4 },
    { score: 5, label: words.l5 },
  ];
  return {
    ...(content as Record<string, unknown>),
    dimensions: content.dimensions.map((d) => {
      const levels = (d as { levels?: unknown }).levels;
      if (Array.isArray(levels) && levels.length > 0) return d;
      return { ...d, levels: presetLevels };
    }),
  } as T;
}
// ---------------------------------------------------------------------------

type JobChoiceContent = DefinitionContentV1 & { components: DefinitionComponents };

function formatToken(token: string): string {
  return token
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter((p) => p.length > 0)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');
}

function definitionName(firstToken: string, secondToken: string): string {
  return `${formatToken(firstToken)} -> ${formatToken(secondToken)}`;
}

function buildPairContent(
  pairKey: string,
  contextText: string,
  contextId: string,
  valueFirst: { token: string; body: string },
  valueSecond: { token: string; body: string },
  levelPreset: LevelPresetWords | null,
): { aFirst: JobChoiceContent; bFirst: JobChoiceContent; compA: DefinitionComponents; compB: DefinitionComponents } {
  const compA: DefinitionComponents = {
    context_id: contextId,
    value_first: { token: valueFirst.token, body: valueFirst.body },
    value_second: { token: valueSecond.token, body: valueSecond.body },
  };
  const compB: DefinitionComponents = {
    context_id: contextId,
    value_first: { token: valueSecond.token, body: valueSecond.body },
    value_second: { token: valueFirst.token, body: valueFirst.body },
  };
  const dimensions = [{ name: valueFirst.token }, { name: valueSecond.token }];
  const aFirst = applyLevelPreset<JobChoiceContent>({
    schema_version: 1,
    template: assembleTemplate(contextText, compA),
    dimensions,
    methodology: { family: 'job-choice', response_scale: 'option_text', presentation_order: 'A_first', pair_key: pairKey },
    components: compA,
  }, levelPreset);
  const bFirst = applyLevelPreset<JobChoiceContent>({
    schema_version: 1,
    template: assembleTemplate(contextText, compB),
    dimensions,
    methodology: { family: 'job-choice', response_scale: 'option_text', presentation_order: 'B_first', pair_key: pairKey },
    components: compB,
  }, levelPreset);
  return { aFirst, bFirst, compA, compB };
}

async function createVignettes(
  tx: Prisma.TransactionClient,
  defAId: string,
  defBId: string,
  contextText: string,
  compA: DefinitionComponents,
  compB: DefinitionComponents,
  firstToken: string,
  secondToken: string,
  levelPreset: LevelPresetWords | null,
): Promise<number> {
  if (levelPreset == null) {
    const contentA: ScenarioContent = { schema_version: 1, prompt: assembleTemplate(contextText, compA).replace(/\[level\]\s*/g, ''), dimension_values: {} };
    const contentB: ScenarioContent = { schema_version: 1, prompt: assembleTemplate(contextText, compB).replace(/\[level\]\s*/g, ''), dimension_values: {} };
    await tx.scenario.create({ data: { definitionId: defAId, name: 'Default Vignette', content: contentA as unknown as Prisma.InputJsonValue } });
    await tx.scenario.create({ data: { definitionId: defBId, name: 'Default Vignette', content: contentB as unknown as Prisma.InputJsonValue, orientationFlipped: true } });
    return 2;
  }

  const words = [levelPreset.l1, levelPreset.l2, levelPreset.l3, levelPreset.l4, levelPreset.l5];
  const creates: Promise<unknown>[] = [];
  for (const firstWord of words) {
    for (const secondWord of words) {
      const promptA = assembleTemplate(contextText, compA, { first: firstWord, second: secondWord });
      const promptB = assembleTemplate(contextText, compB, { first: secondWord, second: firstWord });
      const contentA: ScenarioContent = {
        schema_version: 1,
        prompt: promptA,
        dimension_values: { [firstToken]: firstWord, [secondToken]: secondWord },
      };
      const contentB: ScenarioContent = {
        schema_version: 1,
        prompt: promptB,
        dimension_values: { [secondToken]: secondWord, [firstToken]: firstWord },
      };
      creates.push(
        tx.scenario.create({ data: { definitionId: defAId, name: `${firstWord} / ${secondWord}`, content: contentA as unknown as Prisma.InputJsonValue } }),
        tx.scenario.create({ data: { definitionId: defBId, name: `${secondWord} / ${firstWord}`, content: contentB as unknown as Prisma.InputJsonValue, orientationFlipped: true } }),
      );
    }
  }
  await Promise.all(creates);
  return words.length * words.length * 2;
}

// All 45 canonical pairs from the 10 job-choice values (ordered to avoid duplicates).
// Pairs already in production are skipped at runtime via existing-pair detection.
const ALL_PAIRS: [string, string][] = [
  ['achievement',              'benevolence_dependability'],
  ['achievement',              'conformity_interpersonal'],
  ['achievement',              'hedonism'],
  ['achievement',              'power_dominance'],
  ['achievement',              'security_personal'],
  ['achievement',              'self_direction_action'],
  ['achievement',              'stimulation'],
  ['achievement',              'tradition'],
  ['achievement',              'universalism_nature'],
  ['benevolence_dependability','conformity_interpersonal'],
  ['benevolence_dependability','hedonism'],
  ['benevolence_dependability','power_dominance'],
  ['benevolence_dependability','security_personal'],
  ['benevolence_dependability','self_direction_action'],
  ['benevolence_dependability','stimulation'],
  ['benevolence_dependability','tradition'],
  ['benevolence_dependability','universalism_nature'],
  ['conformity_interpersonal', 'hedonism'],
  ['conformity_interpersonal', 'power_dominance'],
  ['conformity_interpersonal', 'security_personal'],
  ['conformity_interpersonal', 'self_direction_action'],
  ['conformity_interpersonal', 'stimulation'],
  ['conformity_interpersonal', 'tradition'],
  ['conformity_interpersonal', 'universalism_nature'],
  ['hedonism',                 'power_dominance'],
  ['hedonism',                 'security_personal'],
  ['hedonism',                 'self_direction_action'],
  ['hedonism',                 'stimulation'],
  ['hedonism',                 'tradition'],
  ['hedonism',                 'universalism_nature'],
  ['power_dominance',          'security_personal'],
  ['power_dominance',          'self_direction_action'],
  ['power_dominance',          'stimulation'],
  ['power_dominance',          'tradition'],
  ['power_dominance',          'universalism_nature'],
  ['security_personal',        'self_direction_action'],
  ['security_personal',        'stimulation'],
  ['security_personal',        'tradition'],
  ['security_personal',        'universalism_nature'],
  ['self_direction_action',    'stimulation'],
  ['self_direction_action',    'tradition'],
  ['self_direction_action',    'universalism_nature'],
  ['stimulation',              'tradition'],
  ['stimulation',              'universalism_nature'],
  ['tradition',                'universalism_nature'],
];

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');

  if (!apply) {
    log.info('DRY RUN — pass --apply to write to the database');
  }

  // ── Load domain ──────────────────────────────────────────────────────────
  const domain = await db.domain.findUnique({
    where: { normalizedName: 'job-choice' },
    select: { id: true, defaultLevelPresetVersionId: true },
  });
  if (domain == null) throw new Error('job-choice domain not found');

  // ── Load default context ──────────────────────────────────────────────────
  const context = await db.domainContext.findFirst({
    where: { domainId: domain.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, text: true },
  });
  if (context == null) throw new Error('No domain context found for job-choice domain');

  // ── Load level preset ─────────────────────────────────────────────────────
  const levelPreset = domain.defaultLevelPresetVersionId != null
    ? await db.levelPresetVersion.findUnique({
        where: { id: domain.defaultLevelPresetVersionId },
        select: { l1: true, l2: true, l3: true, l4: true, l5: true },
      })
    : null;

  // ── Load preamble version from an existing pair ───────────────────────────
  const existingSample = await db.definition.findFirst({
    where: { domainId: domain.id, deletedAt: null },
    select: { preambleVersionId: true },
  });
  const preambleVersionId = existingSample?.preambleVersionId ?? null;

  // ── Load value statements ─────────────────────────────────────────────────
  const valueStatements = await db.valueStatement.findMany({
    where: { domainId: domain.id },
    select: { id: true, token: true, body: true },
  });
  const vsMap = new Map(valueStatements.map((vs) => [vs.token, vs]));

  // ── Find already-existing pairs ───────────────────────────────────────────
  const existingDefs = await db.definition.findMany({
    where: { domainId: domain.id, deletedAt: null },
    select: { content: true },
  });

  // Build a set of canonical sorted token pairs that already exist
  const existingPairs = new Set<string>();
  for (const def of existingDefs) {
    const content = def.content as Record<string, unknown> | null;
    if (content == null || typeof content !== 'object') continue;
    const components = content['components'] as Record<string, unknown> | undefined;
    if (components == null) continue;
    const vf = (components['value_first'] as Record<string, unknown> | undefined)?.['token'] as string | undefined;
    const vs = (components['value_second'] as Record<string, unknown> | undefined)?.['token'] as string | undefined;
    if (vf != null && vs != null) {
      existingPairs.add([vf, vs].sort().join('|'));
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const toCreate = ALL_PAIRS.filter(([a, b]) => !existingPairs.has([a, b].sort().join('|')));
  const vignetteCount = (levelPreset != null ? 25 * 2 : 2);

  log.info(
    {
      domain: domain.id,
      context: context.id,
      levelPreset: domain.defaultLevelPresetVersionId ?? 'none',
      preambleVersionId,
      existingPairs: existingPairs.size,
      pairsToCreate: toCreate.length,
      vignettePerPair: vignetteCount,
      totalVignettes: toCreate.length * vignetteCount,
      apply,
    },
    'Seed plan',
  );

  if (toCreate.length === 0) {
    log.info('All pairs already exist — nothing to do');
    return;
  }

  // ── Create missing pairs ──────────────────────────────────────────────────
  let created = 0;
  let skipped = 0;

  for (const [tokenA, tokenB] of toCreate) {
    const vsA = vsMap.get(tokenA);
    const vsB = vsMap.get(tokenB);

    if (vsA == null || vsB == null) {
      log.warn({ tokenA, tokenB }, 'Value statement not found — skipping');
      skipped += 1;
      continue;
    }

    const bodyA = getJobChoiceValueStatementBody(tokenA) ?? vsA.body;
    const bodyB = getJobChoiceValueStatementBody(tokenB) ?? vsB.body;

    const name = `${formatToken(tokenA)} x ${formatToken(tokenB)}`;

    if (!apply) {
      log.info({ pair: name, vignetteCount }, 'Would create pair (dry-run)');
      created += 1;
      continue;
    }

    const pairKey = randomUUID();
    const { aFirst, bFirst, compA, compB } = buildPairContent(
      pairKey,
      context.text,
      context.id,
      { token: tokenA, body: bodyA },
      { token: tokenB, body: bodyB },
      levelPreset,
    );

    await db.$transaction(async (tx) => {
      const defA = await tx.definition.create({
        data: {
          name: definitionName(tokenA, tokenB),
          content: aFirst as unknown as Prisma.InputJsonValue,
          domainId: domain.id,
          domainContextId: context.id,
          preambleVersionId,
          levelPresetVersionId: domain.defaultLevelPresetVersionId ?? null,
          createdByUserId: null,
        },
      });
      const defB = await tx.definition.create({
        data: {
          name: definitionName(tokenB, tokenA),
          content: bFirst as unknown as Prisma.InputJsonValue,
          domainId: domain.id,
          domainContextId: context.id,
          preambleVersionId,
          levelPresetVersionId: domain.defaultLevelPresetVersionId ?? null,
          createdByUserId: null,
        },
      });
      const vCount = await createVignettes(tx, defA.id, defB.id, context.text, compA, compB, tokenA, tokenB, levelPreset);
      log.info({ pair: name, aFirstId: defA.id, bFirstId: defB.id, pairKey, vignettes: vCount }, 'Created pair');
    });

    created += 1;
  }

  log.info({ created, skipped, apply }, apply ? 'Done' : 'Dry-run complete');
}

main()
  .catch((err) => {
    log.error({ err }, 'Seed failed');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
