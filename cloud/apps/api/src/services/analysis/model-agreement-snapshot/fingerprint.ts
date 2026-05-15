import type { Prisma } from '@valuerank/db';
import { resolveDomainAnalysisScopeDefinitions } from '../domain-analysis-scope-loader.js';
import { resolveDomainAnalysisSelection } from '../domain-analysis-scope.js';
import { resolveSignatureRuns } from '../../../graphql/queries/domain/shared.js';
import { normalizeCanonicalIds } from './canonical-key.js';
import type { ModelAgreementSnapshotInput } from './snapshot-types.js';

type SourceRunRow = {
  count: number;
  sum: bigint;
};

// Accepts a PrismaClient or any TransactionClient so the resolver and the
// snapshot-cache reader (which runs inside a $transaction) can both call this.
export async function computeInputFingerprint(
  prisma: Prisma.TransactionClient,
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

  // Normalize the model IDs to ensure logically identical selections (different
  // input orders / duplicates) compute the same fingerprint. The hashed form
  // is not used here, but invoking the normalizer keeps the canonical-input
  // contract consistent across reader and writer.
  normalizeCanonicalIds(input.modelIds);

  const scopeData = await resolveDomainAnalysisScopeDefinitions({
    scope: selection.scope,
    domainId: selection.domainId,
    domainIds: selection.domainIds,
  });

  const resolvedSignatureRuns: Awaited<ReturnType<typeof resolveSignatureRuns>> = await resolveSignatureRuns(
    scopeData.latestDefinitionIds,
    input.signature,
    scopeData.domain.defaultModelIds,
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
      COALESCE(SUM(EXTRACT(EPOCH FROM "updated_at")), 0)::BIGINT AS sum
    FROM runs
    WHERE id = ANY(${resolvedSignatureRuns.filteredSourceRunIds}::text[])
  `;

  const row = rows[0];
  return {
    sourceRunCount: row?.count ?? 0,
    sourceRunUpdatedAtSum: row?.sum ?? 0n,
  };
}
