/**
 * Resolver helper for `Definition.pairedSibling`.
 *
 * Extracted out of `definition.ts` to keep that file under the prod-warn
 * file-size threshold. Reuses `findPairedCompanion` from `utils/auto-pair`
 * so callers do not duplicate the canonical token-mirror companion logic.
 */

import { db } from '@valuerank/db';
import { findPairedCompanion } from '../../utils/auto-pair.js';

type DefinitionInput = {
  id: string;
  domainId: string | null;
  content: unknown;
};

type DefinitionRow = Awaited<ReturnType<typeof db.definition.findFirst>>;

export async function resolveDefinitionPairedSibling(
  definition: DefinitionInput,
): Promise<DefinitionRow> {
  const candidates = await db.definition.findMany({
    where: {
      id: { not: definition.id },
      domainId: definition.domainId,
      deletedAt: null,
    },
    select: { id: true, content: true },
  });

  if (candidates.length === 0) return null;

  const companion = findPairedCompanion(
    { id: definition.id, content: definition.content },
    candidates.map((row) => ({ id: row.id, content: row.content })),
  );
  if (companion === null || companion === undefined) return null;

  return db.definition.findUnique({
    where: { id: companion.id },
  });
}
