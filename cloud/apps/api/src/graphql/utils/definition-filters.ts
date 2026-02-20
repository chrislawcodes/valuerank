import { db, Prisma } from '@valuerank/db';

export type DefinitionFilterArgs = {
  rootOnly?: boolean | null;
  search?: string | null;
  tagIds?: readonly (string | number)[] | null;
  hasRuns?: boolean | null;
  domainId?: string | number | null;
  withoutDomain?: boolean | null;
};

type ParsedSearch = {
  terms: string[];
  operator: 'AND' | 'OR';
};

function parseDefinitionSearch(search?: string | null): ParsedSearch | null {
  if (search === undefined || search === null) return null;
  const trimmed = search.trim();
  if (trimmed.length === 0) return null;

  const hasExplicitOr = /\s+or\s+/i.test(trimmed);
  const rawTerms = hasExplicitOr ? trimmed.split(/\s+or\s+/i) : trimmed.split(/\s+/);
  const terms = [...new Set(rawTerms.map((term) => term.trim()).filter((term) => term.length > 0))];
  if (terms.length === 0) return null;

  return {
    terms,
    operator: hasExplicitOr ? 'OR' : 'AND',
  };
}

async function findDefinitionIdsByMetadataSearch(parsed: ParsedSearch): Promise<string[]> {
  const termClauses = parsed.terms.map((term) => {
    const pattern = `%${term}%`;
    return Prisma.sql`(
      d.id::text ILIKE ${pattern}
      OR d.name ILIKE ${pattern}
      OR COALESCE(d.content::text, '') ILIKE ${pattern}
      OR EXISTS (
        SELECT 1
        FROM definition_tags dt
        INNER JOIN tags t ON t.id = dt.tag_id
        WHERE dt.definition_id = d.id
          AND dt.deleted_at IS NULL
          AND t.name ILIKE ${pattern}
      )
    )`;
  });

  const matches = await db.$queryRaw<{ id: string }[]>`
    SELECT DISTINCT d.id
    FROM definitions d
    WHERE d.deleted_at IS NULL
      AND (${Prisma.join(termClauses, parsed.operator === 'OR' ? ' OR ' : ' AND ')})
  `;

  return matches.map((row) => row.id);
}

async function findDefinitionIdsByTags(tagIds: readonly string[]): Promise<string[]> {
  const matchingDefinitions = await db.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE
    direct_tagged AS (
      SELECT DISTINCT dt.definition_id as id
      FROM definition_tags dt
      WHERE dt.tag_id = ANY(${tagIds}::text[])
      AND dt.deleted_at IS NULL
    ),
    inherited AS (
      SELECT d.id, d.parent_id
      FROM definitions d
      JOIN direct_tagged dt ON d.id = dt.id
      WHERE d.deleted_at IS NULL
      UNION ALL
      SELECT d.id, d.parent_id
      FROM definitions d
      JOIN inherited i ON d.parent_id = i.id
      WHERE d.deleted_at IS NULL
    )
    SELECT DISTINCT id FROM inherited
  `;
  return matchingDefinitions.map((d) => d.id);
}

function intersectIds(currentIds: string[] | null, nextIds: string[]): string[] {
  if (currentIds === null) return nextIds;
  const nextSet = new Set(nextIds);
  return currentIds.filter((id) => nextSet.has(id));
}

function parseOptionalId(value: string | number | null | undefined, argName: string): string | null {
  if (value === undefined || value === null) return null;
  const id = String(value).trim();
  if (id === '') {
    throw new Error(`${argName} cannot be an empty string. Use null to indicate no selection.`);
  }
  return id;
}

export async function buildDefinitionWhere(args: DefinitionFilterArgs): Promise<{
  where: Prisma.DefinitionWhereInput;
  empty: boolean;
}> {
  const where: Prisma.DefinitionWhereInput = {
    deletedAt: null,
  };

  if (args.rootOnly === true) {
    where.parentId = null;
  }

  const domainId = parseOptionalId(args.domainId, 'domainId');
  if (domainId !== null) {
    where.domainId = domainId;
  }
  if (args.withoutDomain === true) {
    if (where.domainId !== undefined) {
      throw new Error('Cannot combine domainId and withoutDomain filters');
    }
    where.domainId = null;
  }

  let constrainedIds: string[] | null = null;

  const parsedSearch = parseDefinitionSearch(args.search);
  if (parsedSearch !== null) {
    const searchMatchingIds = await findDefinitionIdsByMetadataSearch(parsedSearch);
    constrainedIds = intersectIds(constrainedIds, searchMatchingIds);
  }

  if (args.tagIds !== undefined && args.tagIds !== null && args.tagIds.length > 0) {
    const tagIdStrings = args.tagIds.map(String);
    const tagMatchingIds = await findDefinitionIdsByTags(tagIdStrings);
    constrainedIds = intersectIds(constrainedIds, tagMatchingIds);
  }

  if (constrainedIds !== null) {
    if (constrainedIds.length === 0) {
      return { where, empty: true };
    }
    where.id = { in: constrainedIds };
  }

  if (args.hasRuns === true) {
    where.runs = { some: {} };
  }

  return { where, empty: false };
}
