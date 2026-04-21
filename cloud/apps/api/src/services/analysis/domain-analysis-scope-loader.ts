import { db } from '@valuerank/db';
import { NotFoundError } from '@valuerank/shared';
import { hydrateDefinitionAncestors, selectLatestDefinitionPerLineage } from '../../graphql/queries/domain/shared.js';
import type { AnalysisOutputRow, DomainAnalysisContributionSummary, DomainAnalysisExcludedDataSummary } from './domain-analysis-cache-types.js';
import {
  type DomainAnalysisScope,
  DOMAIN_ANALYSIS_ALL_DOMAINS_SCOPE,
} from './domain-analysis-scope.js';
import type { DomainAnalysisValuePair } from '../../graphql/queries/domain-analysis-values.js';

export type DomainAnalysisScopeDefinitionSet = {
  scope: DomainAnalysisScope;
  domain: { id: string; name: string; defaultModelIds: string[] };
  domains: Array<{ id: string; name: string; defaultModelIds: string[] }>;
  definitions: Array<{
    id: string;
    domainId: string | null;
    name: string;
    parentId: string | null;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  }>;
  latestDefinitions: Array<{
    id: string;
    domainId: string | null;
    name: string;
    parentId: string | null;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  }>;
  latestDefinitionIds: string[];
  definitionNameById: Map<string, string>;
  definitionDomainIdById: Map<string, string>;
};

function parseCount(raw: unknown) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { prioritized: 0, deprioritized: 0, neutral: 0 };
  }
  const record = raw as Record<string, unknown>;
  const prioritized = typeof record.prioritized === 'number' && Number.isFinite(record.prioritized) ? record.prioritized : 0;
  const deprioritized = typeof record.deprioritized === 'number' && Number.isFinite(record.deprioritized) ? record.deprioritized : 0;
  const neutral = typeof record.neutral === 'number' && Number.isFinite(record.neutral) ? record.neutral : 0;
  return { prioritized, deprioritized, neutral };
}

function getValueCountsFromAnalysis(output: unknown, modelId: string, valueKey: string) {
  if (output == null || typeof output !== 'object' || Array.isArray(output)) {
    return { prioritized: 0, deprioritized: 0, neutral: 0 };
  }
  const perModel = (output as { perModel?: unknown }).perModel;
  if (perModel == null || typeof perModel !== 'object' || Array.isArray(perModel)) {
    return { prioritized: 0, deprioritized: 0, neutral: 0 };
  }
  const modelData = (perModel as Record<string, unknown>)[modelId];
  if (modelData == null || typeof modelData !== 'object' || Array.isArray(modelData)) {
    return { prioritized: 0, deprioritized: 0, neutral: 0 };
  }
  const values = (modelData as { values?: unknown }).values;
  if (values == null || typeof values !== 'object' || Array.isArray(values)) {
    return { prioritized: 0, deprioritized: 0, neutral: 0 };
  }

  const valuesRecord = values as Record<string, unknown>;
  const keyLower = valueKey.toLowerCase();
  const valueData = valuesRecord[valueKey]
    ?? Object.entries(valuesRecord).find(([k]) => k.toLowerCase() === keyLower)?.[1];
  if (valueData == null || typeof valueData !== 'object' || Array.isArray(valueData)) {
    return { prioritized: 0, deprioritized: 0, neutral: 0 };
  }
  return parseCount((valueData as { count?: unknown }).count);
}

function getRawTrialCountFromAnalysisRow(output: unknown, pair: DomainAnalysisValuePair): number {
  if (output == null || typeof output !== 'object' || Array.isArray(output)) return 0;
  const perModel = (output as { perModel?: unknown }).perModel;
  if (perModel == null || typeof perModel !== 'object' || Array.isArray(perModel)) return 0;

  let total = 0;
  for (const modelId of Object.keys(perModel as Record<string, unknown>)) {
    const counts = getValueCountsFromAnalysis(output, modelId, pair.valueA);
    total += counts.prioritized + counts.deprioritized + counts.neutral;
  }
  return total;
}

export function buildContributionAndExcludedSummary(params: {
  domainNameById: Map<string, string>;
  definitionDomainIdById: Map<string, string>;
  valuePairByDefinition: Map<string, DomainAnalysisValuePair>;
  analysisRows: AnalysisOutputRow[];
  filteredSourceRunDefinitionById: Map<string, string>;
}): {
  contributionSummary: DomainAnalysisContributionSummary[];
  excludedDataSummary: DomainAnalysisExcludedDataSummary[];
} {
  const analysisRowsByRunId = new Map(params.analysisRows.map((row) => [row.runId, row]));
  const contributionByDomain = new Map<string, number>();
  const excludedByDomainReason = new Map<string, number>();

  const addExcluded = (domainId: string, reasonCode: DomainAnalysisExcludedDataSummary['reasonCode']) => {
    const key = `${domainId}::${reasonCode}`;
    excludedByDomainReason.set(key, (excludedByDomainReason.get(key) ?? 0) + 1);
  };

  for (const [runId, definitionId] of params.filteredSourceRunDefinitionById.entries()) {
    const domainId = params.definitionDomainIdById.get(definitionId);
    if (domainId == null) continue;
    const pair = params.valuePairByDefinition.get(definitionId);
    const analysisRow = analysisRowsByRunId.get(runId);

    if (pair == null) {
      addExcluded(domainId, 'SCHEMA_INCOMPATIBLE');
      continue;
    }

    if (analysisRow == null) {
      addExcluded(domainId, 'NO_ANALYSIS');
      continue;
    }

    const rawTrialCount = getRawTrialCountFromAnalysisRow(analysisRow.output, pair);
    if (rawTrialCount <= 0) {
      addExcluded(domainId, 'NO_ANALYSIS');
      continue;
    }

    contributionByDomain.set(domainId, (contributionByDomain.get(domainId) ?? 0) + rawTrialCount);
  }

  const domainNameById = params.domainNameById;
  const totalContribution = Array.from(contributionByDomain.values()).reduce((sum, value) => sum + value, 0);
  const sortedContributions = Array.from(contributionByDomain.entries())
    .map(([domainId, rawTrialCount]) => ({
      domainId,
      domainName: domainNameById.get(domainId) ?? domainId,
      rawTrialCount,
    }))
    .sort((left, right) => right.rawTrialCount - left.rawTrialCount || left.domainName.localeCompare(right.domainName));

  const topContributions = sortedContributions.slice(0, 5);
  const remainingContribution = sortedContributions.slice(5).reduce((sum, entry) => sum + entry.rawTrialCount, 0);

  const contributionSummary: DomainAnalysisContributionSummary[] = totalContribution > 0
    ? [
        ...topContributions.map((entry) => ({
          domainId: entry.domainId,
          domainName: entry.domainName,
          rawTrialCount: entry.rawTrialCount,
          share: entry.rawTrialCount / totalContribution,
        })),
        ...(remainingContribution > 0
          ? [{
              domainId: 'other-domains',
              domainName: 'Other domains',
              rawTrialCount: remainingContribution,
              share: remainingContribution / totalContribution,
            }]
          : []),
      ]
    : [];

  const excludedDataSummary: DomainAnalysisExcludedDataSummary[] = Array.from(excludedByDomainReason.entries())
    .map(([key, count]) => {
      const [domainId, reasonCode] = key.split('::') as [string, DomainAnalysisExcludedDataSummary['reasonCode']];
      const domainName = domainNameById.get(domainId) ?? domainId;
      return {
        domainId,
        domainName,
        reasonCode,
        count,
      };
    })
    .sort((left, right) => right.count - left.count || left.domainName.localeCompare(right.domainName) || left.reasonCode.localeCompare(right.reasonCode));

  return { contributionSummary, excludedDataSummary };
}

export async function resolveDomainAnalysisScopeDefinitions(params: {
  scope: DomainAnalysisScope;
  domainId: string;
}): Promise<DomainAnalysisScopeDefinitionSet> {
  if (params.scope === 'ALL_DOMAINS') {
    const domains = await db.domain.findMany({
      select: { id: true, name: true, defaultModelIds: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });

    const definitions = domains.length === 0
      ? []
      : await db.definition.findMany({
          where: { domainId: { in: domains.map((domain) => domain.id) }, deletedAt: null },
          select: {
            id: true,
            domainId: true,
            name: true,
            parentId: true,
            version: true,
            createdAt: true,
            updatedAt: true,
          },
        });

    const definitionsById = await hydrateDefinitionAncestors(definitions);
    const latestDefinitions = selectLatestDefinitionPerLineage(definitions, definitionsById).filter((definition) => definition.domainId != null) as Array<{
      id: string;
      domainId: string;
      name: string;
      parentId: string | null;
      version: number;
      createdAt: Date;
      updatedAt: Date;
    }>;
    const latestDefinitionIds = latestDefinitions.map((definition) => definition.id);
    const definitionNameById = new Map<string, string>(
      definitions.map((definition) => [definition.id, definition.name ?? definition.id]),
    );
    const definitionsWithDomainId = definitions.filter((definition) => definition.domainId != null) as Array<{
      id: string;
      domainId: string;
      name: string;
      parentId: string | null;
      version: number;
      createdAt: Date;
      updatedAt: Date;
    }>;
    const definitionDomainIdById = new Map<string, string>(
      definitionsWithDomainId.map((definition) => [definition.id, definition.domainId]),
    );

    return {
      scope: 'ALL_DOMAINS',
      domain: { id: DOMAIN_ANALYSIS_ALL_DOMAINS_SCOPE, name: 'All domains', defaultModelIds: [] },
      domains,
      definitions,
      latestDefinitions,
      latestDefinitionIds,
      definitionNameById,
      definitionDomainIdById,
    };
  }

  const domain = await db.domain.findUnique({
    where: { id: params.domainId },
    select: { id: true, name: true, defaultModelIds: true },
  });
  if (!domain) {
    throw new NotFoundError('Domain', params.domainId);
  }

  const definitions = await db.definition.findMany({
    where: { domainId: params.domainId, deletedAt: null },
    select: {
      id: true,
      domainId: true,
      name: true,
      parentId: true,
      version: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const definitionsById = await hydrateDefinitionAncestors(definitions);
  const latestDefinitions = selectLatestDefinitionPerLineage(definitions, definitionsById).filter((definition) => definition.domainId != null) as Array<{
    id: string;
    domainId: string;
    name: string;
    parentId: string | null;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  }>;
  const latestDefinitionIds = latestDefinitions.map((definition) => definition.id);
  const definitionNameById = new Map<string, string>(
    definitions.map((definition) => [definition.id, definition.name ?? definition.id]),
  );
  const definitionsWithDomainId = definitions.filter((definition) => definition.domainId != null) as Array<{
    id: string;
    domainId: string;
    name: string;
    parentId: string | null;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  }>;
  const definitionDomainIdById = new Map<string, string>(
    definitionsWithDomainId.map((definition) => [definition.id, definition.domainId]),
  );

  return {
    scope: 'DOMAIN',
    domain,
    domains: [domain],
    definitions,
    latestDefinitions,
    latestDefinitionIds,
    definitionNameById,
    definitionDomainIdById,
  };
}
