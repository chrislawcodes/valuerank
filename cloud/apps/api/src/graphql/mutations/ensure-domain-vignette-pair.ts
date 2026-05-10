import { db } from '@valuerank/db';
import { NotFoundError, ValidationError } from '@valuerank/shared';
import { builder } from '../builder.js';
import {
  buildPairedVignetteContent,
  buildPairedDefinitionName,
  createPairedScenarios,
} from './paired-vignette-helpers.js';
import { getComponentTokens } from '../../utils/auto-pair.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const VignettePairStatusEnum = builder.enumType('VignettePairStatus', {
  values: {
    CREATED: { value: 'CREATED' },
    UPDATED: { value: 'UPDATED' },
    SKIPPED: { value: 'SKIPPED' },
    SKIPPED_HAS_RUNS: { value: 'SKIPPED_HAS_RUNS' },
  },
});

type VignettePairStatusValue = 'CREATED' | 'UPDATED' | 'SKIPPED' | 'SKIPPED_HAS_RUNS';

const EnsureDomainVignettePairResultRef = builder.objectRef<{
  status: VignettePairStatusValue;
  definitionAId: string | null;
  definitionBId: string | null;
}>('EnsureDomainVignettePairResult');

builder.objectType(EnsureDomainVignettePairResultRef, {
  fields: (t) => ({
    status: t.field({ type: VignettePairStatusEnum, resolve: (r) => r.status }),
    definitionAId: t.string({ nullable: true, resolve: (r) => r.definitionAId }),
    definitionBId: t.string({ nullable: true, resolve: (r) => r.definitionBId }),
  }),
});

const EnsureDomainVignettePairInput = builder.inputType('EnsureDomainVignettePairInput', {
  fields: (t) => ({
    domainId: t.id({ required: true }),
    valueFirstId: t.id({ required: true }),
    valueSecondId: t.id({ required: true }),
  }),
});

function buildVignettePairResult(
  status: VignettePairStatusValue,
  definitionAId: string | null,
  definitionBId: string | null,
) {
  return { status, definitionAId, definitionBId };
}

// ---------------------------------------------------------------------------
// Mutation
// ---------------------------------------------------------------------------

builder.mutationField('ensureDomainVignettePair', (t) =>
  t.field({
    type: EnsureDomainVignettePairResultRef,
    args: { input: t.arg({ type: EnsureDomainVignettePairInput, required: true }) },
    resolve: async (_root, { input }, ctx) => {
      const domainId = String(input.domainId);
      const valueFirstId = String(input.valueFirstId);
      const valueSecondId = String(input.valueSecondId);

      if (valueFirstId === valueSecondId) {
        throw new ValidationError('valueFirstId and valueSecondId must be different');
      }

      // 1. Load domain config
      const domain = await db.domain.findUnique({
        where: { id: domainId },
        select: {
          id: true,
          normalizedName: true,
          sentencePrefix: true,
          labelPrefix: true,
          defaultContextId: true,
          defaultLevelPresetVersionId: true,
          defaultPreambleVersionId: true,
        },
      });
      if (domain == null) throw new NotFoundError('Domain', domainId);
      if (domain.defaultContextId == null) {
        throw new ValidationError(
          'Domain has no default context. Set a default context before creating vignettes.',
        );
      }

      // 2. Load context, value statements, level preset in parallel
      const [context, valueFirst, valueSecond, levelPresetVersion] = await Promise.all([
        db.domainContext.findUnique({ where: { id: domain.defaultContextId } }),
        db.valueStatement.findUnique({ where: { id: valueFirstId } }),
        db.valueStatement.findUnique({ where: { id: valueSecondId } }),
        domain.defaultLevelPresetVersionId != null
          ? db.levelPresetVersion.findUnique({
              where: { id: domain.defaultLevelPresetVersionId },
              select: { l1: true, l2: true, l3: true, l4: true, l5: true },
            })
          : Promise.resolve(null),
      ]);

      if (context == null) throw new NotFoundError('DomainContext', domain.defaultContextId);
      if (valueFirst == null) throw new NotFoundError('ValueStatement', valueFirstId);
      if (valueFirst.domainId !== domainId) {
        throw new ValidationError(`ValueStatement ${valueFirstId} does not belong to domain ${domainId}`);
      }
      if (valueSecond == null) throw new NotFoundError('ValueStatement', valueSecondId);
      if (valueSecond.domainId !== domainId) {
        throw new ValidationError(`ValueStatement ${valueSecondId} does not belong to domain ${domainId}`);
      }

      ctx.log.info({ domainId, valueFirstId, valueSecondId }, 'ensureDomainVignettePair');

      const templateConfig = {
        sentencePrefix: domain.sentencePrefix ?? undefined,
        labelPrefix: domain.labelPrefix ?? undefined,
      };

      // Use DB bodies directly - NOT the hardcoded job-choice lookup
      const vf = { token: valueFirst.token, body: valueFirst.body };
      const vs = { token: valueSecond.token, body: valueSecond.body };

      // 3. Find existing pair definitions for this domain
      const allDefs = await db.definition.findMany({
        where: { domainId, deletedAt: null },
        select: { id: true, content: true, preambleVersionId: true, levelPresetVersionId: true },
      });

      let defA: (typeof allDefs)[0] | undefined;
      let defB: (typeof allDefs)[0] | undefined;
      for (const def of allDefs) {
        const tokens = getComponentTokens(def.content);
        if (tokens == null) continue;
        if (tokens.value_first.token === vf.token && tokens.value_second.token === vs.token) defA = def;
        if (tokens.value_first.token === vs.token && tokens.value_second.token === vf.token) defB = def;
      }

      // 4. Assemble expected pair content
      const { contentAFirst, contentBFirst, componentsAFirst, componentsBFirst } =
        buildPairedVignetteContent(
          context.text,
          context.id,
          vf,
          vs,
          levelPresetVersion,
          domain.normalizedName,
          templateConfig,
        );

      const preambleVersionId = domain.defaultPreambleVersionId ?? null;
      const levelPresetVersionId = domain.defaultLevelPresetVersionId ?? null;

      // 5a. Neither exists -> create both
      if (defA == null && defB == null) {
        const [newDefA, newDefB] = await db.$transaction(async (tx) => {
          const a = await tx.definition.create({
            data: {
              name: buildPairedDefinitionName('', vf.token, vs.token),
              content: contentAFirst,
              domainId,
              domainContextId: context.id,
              preambleVersionId,
              levelPresetVersionId,
              createdByUserId: null,
            },
          });
          const b = await tx.definition.create({
            data: {
              name: buildPairedDefinitionName('', vs.token, vf.token),
              content: contentBFirst,
              domainId,
              domainContextId: context.id,
              preambleVersionId,
              levelPresetVersionId,
              createdByUserId: null,
            },
          });
          await createPairedScenarios(tx, {
            definitionAId: a.id,
            definitionBId: b.id,
            contextText: context.text,
            componentsAFirst,
            componentsBFirst,
            valueFirstToken: vf.token,
            valueSecondToken: vs.token,
            levelPresetVersion,
            templateConfig,
          });
          return [a, b] as const;
        });
        ctx.log.info({ defAId: newDefA.id, defBId: newDefB.id }, 'Created vignette pair');
        return buildVignettePairResult('CREATED', newDefA.id, newDefB.id);
      }

      // 5b. Orphan: only one exists -> create the missing companion
      if (defA == null || defB == null) {
        const existingDef = (defA ?? defB)!;
        const missingIsA = defA == null;
        const newDef = await db.$transaction(async (tx) => {
          const created = await tx.definition.create({
            data: {
              name: missingIsA
                ? buildPairedDefinitionName('', vf.token, vs.token)
                : buildPairedDefinitionName('', vs.token, vf.token),
              content: missingIsA ? contentAFirst : contentBFirst,
              domainId,
              domainContextId: context.id,
              preambleVersionId: existingDef.preambleVersionId ?? preambleVersionId,
              levelPresetVersionId: existingDef.levelPresetVersionId ?? levelPresetVersionId,
              createdByUserId: null,
            },
          });
          // Create scenarios for new definition only; leave existing definition's scenarios intact
          const newDefId = created.id;
          const existingDefId = existingDef.id;
          await createPairedScenarios(tx, {
            definitionAId: missingIsA ? newDefId : existingDefId,
            definitionBId: missingIsA ? existingDefId : newDefId,
            contextText: context.text,
            componentsAFirst,
            componentsBFirst,
            valueFirstToken: vf.token,
            valueSecondToken: vs.token,
            levelPresetVersion,
            templateConfig,
          });
          return created;
        });
        ctx.log.info({ existingId: existingDef.id, newId: newDef.id }, 'Created orphan vignette companion');
        return buildVignettePairResult(
          'CREATED',
          missingIsA ? newDef.id : (defA?.id ?? null),
          missingIsA ? (defB?.id ?? null) : newDef.id,
        );
      }

      // 5c. Both exist -> staleness check (compare assembled template with stored template)
      const storedContent = defA.content as Record<string, unknown>;
      const storedTemplate =
        typeof storedContent?.['template'] === 'string' ? storedContent['template'] : null;
      const expectedTemplate = (contentAFirst as Record<string, unknown>)['template'] as string;

      if (storedTemplate === expectedTemplate) {
        return buildVignettePairResult('SKIPPED', defA.id, defB.id);
      }

      // Stale -> check for run data before updating
      const [defAScenarios, defBScenarios] = await Promise.all([
        db.scenario.findMany({ where: { definitionId: defA.id }, select: { id: true } }),
        db.scenario.findMany({ where: { definitionId: defB.id }, select: { id: true } }),
      ]);
      const allScenarioIds = [...defAScenarios.map((s) => s.id), ...defBScenarios.map((s) => s.id)];
      const transcriptCount =
        allScenarioIds.length > 0
          ? await db.transcript.count({ where: { scenarioId: { in: allScenarioIds } } })
          : 0;

      if (transcriptCount > 0) {
        return buildVignettePairResult('SKIPPED_HAS_RUNS', defA.id, defB.id);
      }

      // Safe to update: delete scenarios and recreate, update content
      await db.$transaction(async (tx) => {
        const definitionAId = defA.id;
        const definitionBId = defB.id;

        await tx.scenario.deleteMany({ where: { definitionId: { in: [definitionAId, definitionBId] } } });
        await tx.definition.update({
          where: { id: definitionAId },
          data: { content: contentAFirst },
        });
        await tx.definition.update({
          where: { id: definitionBId },
          data: { content: contentBFirst },
        });
        await createPairedScenarios(tx, {
          definitionAId,
          definitionBId,
          contextText: context.text,
          componentsAFirst,
          componentsBFirst,
          valueFirstToken: vf.token,
          valueSecondToken: vs.token,
          levelPresetVersion,
          templateConfig,
        });
      });
      ctx.log.info({ defAId: defA.id, defBId: defB.id }, 'Updated stale vignette pair');
      return buildVignettePairResult('UPDATED', defA.id, defB.id);
    },
  }),
);
