import process from 'node:process';

// NOTE: This script intentionally mirrors signature and lineage selection logic from:
// - cloud/apps/api/src/graphql/queries/domain.ts (resolveSignatureRuns + latest lineage selection)
// - cloud/apps/api/src/utils/trial-signature.ts
// - cloud/apps/api/src/utils/vnew-signature.ts
// Keep these in sync when signature semantics change.

type LoginResponse = { token?: string; error?: string; message?: string };

type DefinitionRun = {
  id: string;
  status: string;
  createdAt: string;
  config: unknown;
};

type DefinitionRecord = {
  id: string;
  name: string;
  version: number;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  runs: DefinitionRun[];
};

type DomainAnalysisResponse = {
  targetedDefinitions: number;
  coveredDefinitions: number;
  definitionsWithAnalysis: number;
  missingDefinitions: Array<{ definitionId: string; reasonCode?: string }>;
};

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed: { domainId?: string; signature?: string; apiUrl: string } = {
    apiUrl: process.env.VALUERANK_API_URL ?? 'https://api.valuerank.org/graphql',
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--domainId') parsed.domainId = args[i + 1];
    if (arg === '--signature') parsed.signature = args[i + 1];
    if (arg === '--apiUrl') parsed.apiUrl = args[i + 1];
  }
  return parsed;
}

function parseTemperature(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseDefinitionVersion(config: unknown): number | null {
  if (config == null || typeof config !== 'object') return null;
  const runConfig = config as {
    definitionSnapshot?: {
      _meta?: { definitionVersion?: unknown };
      version?: unknown;
    };
  };
  const versionCandidate = runConfig.definitionSnapshot?._meta?.definitionVersion ?? runConfig.definitionSnapshot?.version;
  if (typeof versionCandidate === 'number' && Number.isFinite(versionCandidate)) {
    return versionCandidate;
  }
  if (typeof versionCandidate === 'string' && versionCandidate.trim() !== '') {
    const parsed = Number(versionCandidate);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeTemperatureToken(temperature: number | null): string {
  if (temperature === null) return 'd';
  return Number.isInteger(temperature) ? temperature.toString() : temperature.toString();
}

function formatSignature(version: number | null, temperature: number | null): string {
  const versionToken = version === null ? 'v?' : `v${version}`;
  return `${versionToken}t${normalizeTemperatureToken(temperature)}`;
}

function formatVnewSignature(temperature: number | null): string {
  return `vnewt${normalizeTemperatureToken(temperature)}`;
}

function chooseDefaultVnewSignature(runs: DefinitionRun[]): string | null {
  const temperatureCounts = new Map<string, { temperature: number | null; count: number }>();
  for (const run of runs) {
    if (run.status !== 'COMPLETED') continue;
    const temperature = parseTemperature((run.config as { temperature?: unknown } | null)?.temperature);
    const key = temperature === null ? 'd' : temperature.toString();
    const current = temperatureCounts.get(key);
    if (current) {
      current.count += 1;
    } else {
      temperatureCounts.set(key, { temperature, count: 1 });
    }
  }
  const winner = Array.from(temperatureCounts.values())
    .sort((left, right) => {
      const leftIsZero = left.temperature === 0;
      const rightIsZero = right.temperature === 0;
      if (leftIsZero !== rightIsZero) return leftIsZero ? -1 : 1;
      if (left.count !== right.count) return right.count - left.count;
      if (left.temperature === null) return 1;
      if (right.temperature === null) return -1;
      return left.temperature - right.temperature;
    })[0];
  return winner ? formatVnewSignature(winner.temperature) : null;
}

function runMatchesSignature(run: DefinitionRun, signature: string): boolean {
  const runConfig = run.config as { temperature?: unknown } | null;
  const temperature = parseTemperature(runConfig?.temperature);
  if (signature.startsWith('vnewt')) {
    const token = signature.slice('vnewt'.length);
    if (token === 'd') return temperature === null;
    return temperature === Number(token);
  }
  const version = parseDefinitionVersion(run.config);
  return formatSignature(version, temperature) === signature;
}

function isNewer(left: DefinitionRecord, right: DefinitionRecord): boolean {
  if (left.version !== right.version) return left.version > right.version;
  const leftUpdated = new Date(left.updatedAt).getTime();
  const rightUpdated = new Date(right.updatedAt).getTime();
  if (leftUpdated !== rightUpdated) return leftUpdated > rightUpdated;
  return new Date(left.createdAt).getTime() > new Date(right.createdAt).getTime();
}

function selectLatestDefinitions(definitions: DefinitionRecord[]): DefinitionRecord[] {
  const byId = new Map(definitions.map((d) => [d.id, d]));
  const latestByRoot = new Map<string, DefinitionRecord>();

  for (const definition of definitions) {
    let current = definition;
    const visited = new Set<string>([current.id]);
    while (current.parentId !== null) {
      const parent = byId.get(current.parentId);
      if (!parent || visited.has(parent.id)) break;
      visited.add(parent.id);
      current = parent;
    }
    const rootId = current.id;
    const existing = latestByRoot.get(rootId);
    if (!existing || isNewer(definition, existing)) {
      latestByRoot.set(rootId, definition);
    }
  }
  return Array.from(latestByRoot.values());
}

async function graphql<T>(apiUrl: string, token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const payload = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (payload.errors && payload.errors.length > 0) {
    throw new Error(payload.errors.map((entry) => entry.message).join('; '));
  }
  if (!payload.data) {
    throw new Error('No data returned from GraphQL request');
  }
  return payload.data;
}

async function login(apiUrl: string, email: string, password: string): Promise<string> {
  const baseUrl = apiUrl.replace(/\/graphql$/, '');
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const payload = (await response.json()) as LoginResponse;
  if (!payload.token) {
    throw new Error(payload.message ?? payload.error ?? 'Failed to authenticate');
  }
  return payload.token;
}

async function main() {
  const { domainId, signature, apiUrl } = parseArgs();
  if (!domainId) {
    throw new Error('Missing --domainId');
  }
  const email = process.env.VALUERANK_EMAIL;
  const password = process.env.VALUERANK_PASSWORD;
  if (!email || !password) {
    throw new Error('Missing VALUERANK_EMAIL or VALUERANK_PASSWORD');
  }

  const token = await login(apiUrl, email, password);
  const definitionsData = await graphql<{ definitions: DefinitionRecord[] }>(
    apiUrl,
    token,
    `
      query DomainDefinitionsForAudit($domainId: ID!) {
        definitions(domainId: $domainId, limit: 1000) {
          id
          name
          version
          parentId
          createdAt
          updatedAt
          runs(limit: 300) {
            id
            status
            createdAt
            config
          }
        }
      }
    `,
    { domainId },
  );

  const latestDefinitions = selectLatestDefinitions(definitionsData.definitions);
  const allLatestRuns = latestDefinitions.flatMap((definition) => definition.runs);
  const effectiveSignature = signature ?? chooseDefaultVnewSignature(allLatestRuns);

  const perDefinition = latestDefinitions.map((definition) => {
    const completedRuns = definition.runs
      .filter((run) => run.status === 'COMPLETED')
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
    const matchingRuns = effectiveSignature === null
      ? completedRuns
      : completedRuns.filter((run) => runMatchesSignature(run, effectiveSignature));
    const reason = completedRuns.length === 0
      ? 'NO_COMPLETED_RUNS'
      : matchingRuns.length === 0
        ? 'NO_SIGNATURE_MATCH'
        : 'MATCHED';

    return {
      definitionId: definition.id,
      definitionName: definition.name,
      version: definition.version,
      completedRunCount: completedRuns.length,
      matchingRunCount: matchingRuns.length,
      latestCompletedRunId: completedRuns[0]?.id ?? null,
      latestMatchingRunId: matchingRuns[0]?.id ?? null,
      reason,
    };
  });

  let analysisData: { domainAnalysis: DomainAnalysisResponse };
  try {
    analysisData = await graphql<{ domainAnalysis: DomainAnalysisResponse }>(
      apiUrl,
      token,
      `
        query DomainAnalysisAudit($domainId: ID!, $scoreMethod: String, $signature: String) {
          domainAnalysis(domainId: $domainId, scoreMethod: $scoreMethod, signature: $signature) {
            targetedDefinitions
            coveredDefinitions
            definitionsWithAnalysis
            missingDefinitions {
              definitionId
              reasonCode
            }
          }
        }
      `,
      {
        domainId,
        scoreMethod: 'FULL_BT',
        signature: effectiveSignature,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('Cannot query field "reasonCode"')) {
      throw error;
    }
    analysisData = await graphql<{ domainAnalysis: DomainAnalysisResponse }>(
      apiUrl,
      token,
      `
        query DomainAnalysisAuditLegacy($domainId: ID!, $scoreMethod: String, $signature: String) {
          domainAnalysis(domainId: $domainId, scoreMethod: $scoreMethod, signature: $signature) {
            targetedDefinitions
            coveredDefinitions
            definitionsWithAnalysis
            missingDefinitions {
              definitionId
            }
          }
        }
      `,
      {
        domainId,
        scoreMethod: 'FULL_BT',
        signature: effectiveSignature,
      },
    );
  }

  const output = {
    auditedAt: new Date().toISOString(),
    domainId,
    requestedSignature: signature ?? null,
    effectiveSignature,
    latestDefinitionCount: latestDefinitions.length,
    matchingDefinitionCount: perDefinition.filter((entry) => entry.reason === 'MATCHED').length,
    noCompletedRunsCount: perDefinition.filter((entry) => entry.reason === 'NO_COMPLETED_RUNS').length,
    noSignatureMatchCount: perDefinition.filter((entry) => entry.reason === 'NO_SIGNATURE_MATCH').length,
    analysis: {
      targetedDefinitions: analysisData.domainAnalysis.targetedDefinitions,
      coveredDefinitions: analysisData.domainAnalysis.coveredDefinitions,
      definitionsWithAnalysis: analysisData.domainAnalysis.definitionsWithAnalysis,
      missingReasonCounts: analysisData.domainAnalysis.missingDefinitions.reduce<Record<string, number>>((acc, missing) => {
        const key = missing.reasonCode ?? 'UNKNOWN';
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {}),
    },
    perDefinition,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
