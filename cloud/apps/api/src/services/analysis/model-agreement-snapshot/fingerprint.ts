import type { PrismaClient } from '@valuerank/db';
import { resolveDomainAnalysisScopeDefinitions } from '../domain-analysis-scope-loader.js';
import { resolveDomainAnalysisSelection } from '../domain-analysis-scope.js';
import { resolveSignatureRuns } from '../../../graphql/queries/domain/shared.js';
import type { ModelAgreementSnapshotInput } from './snapshot-types.js';

type SourceRunRow = {
  count: number;
  sum: bigint;
};

function normalizeIds(ids: ReadonlyArray<string>): string[] {
  return [...new Set(ids)].sort();
}

export async function computeInputFingerprint(
  prisma: PrismaClient,
  input: ModelAgreementSnapshotInput,
): Promise<{
  sourceRunCount: number;
  sourceRunUpdatedAtSum: bigint;
}> {
  const selection = resolveDomainAnalysisSelection({
    scope: input.scope,
    domainId: input.domainId,
    domainIds: input.domainIds,
  });

  const normalizedModelIds = normalizeIds(input.modelIds);
  if (normalizedModelIds.length === 0) {
    return {
      sourceRunCount: 0,
      sourceRunUpdatedAtSum: 0n,
    };
  }

  const scopeData = await resolveDomainAnalysisScopeDefinitions({
    scope: selection.scope,
    domainId: selection.domainId,
    domainIds: selection.domainIds,
  });

  const resolvedSignatureRuns: Awaited<ReturnType<typeof resolveSignatureRuns>> = await resolveSignatureRuns(
    scopeData.latestDefinitionIds,
    input.signature,
    normalizedModelIds,
  );

  if (resolvedSignatureRuns.filteredSourceRunIds.length === 0) {
    return {
      sourceRunCount: 0,
      sourceRunUpdatedAtSum: 0n,
    };
  }

  const rows = await prisma.$queryRaw<SourceRunRow[]>`
    SELECT
      COUNT(*)::INT AS count,
      COALESCE(SUM(EXTRACT(EPOCH FROM "updated_at")::BIGINT), 0)::BIGINT AS sum
    FROM runs
    WHERE id = ANY(${resolvedSignatureRuns.filteredSourceRunIds}::text[])
  `;

  const row = rows[0];
  return {
    sourceRunCount: row?.count ?? 0,
    sourceRunUpdatedAtSum: row?.sum ?? 0n,
  };
}
