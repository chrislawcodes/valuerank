import { createId } from '@paralleldrive/cuid2';
import type {
  Definition,
  Domain,
  PrismaClient,
  Run,
  Scenario,
  Transcript,
} from '@valuerank/db';
import type { DefinitionContent } from '@valuerank/db';

const DEFAULT_CREATED_AT = '2026-01-01T00:00:00Z';
const DEFAULT_COMPLETED_AT = '2026-01-01T00:01:00Z';

type DefinitionOverrides = Partial<Omit<Definition, 'content'>> & {
  content?: Partial<DefinitionContent>;
};

type TestEntityOverrides = {
  definition?: DefinitionOverrides;
  run?: Partial<Run>;
  scenario?: Partial<Scenario>;
  transcript?: Partial<Transcript>;
};

type TestDb = Pick<PrismaClient, 'definition' | 'run' | 'scenario' | 'transcript'>;

function newCreatedAt(): Date {
  return new Date(DEFAULT_CREATED_AT);
}

function newCompletedAt(): Date {
  return new Date(DEFAULT_COMPLETED_AT);
}

function createTestId(): string {
  return createId();
}

function buildDefinitionDimensions() {
  return [
    {
      name: 'ValueA',
      levels: [
        { score: 1, label: 'Low', options: ['low-a'] },
        { score: 2, label: 'High', options: ['high-a'] },
      ],
    },
    {
      name: 'ValueB',
      levels: [
        { score: 1, label: 'Low', options: ['low-b'] },
        { score: 2, label: 'High', options: ['high-b'] },
      ],
    },
  ];
}

export function buildDefinitionContent(
  overrides: Partial<DefinitionContent> = {}
): DefinitionContent {
  return {
    schema_version: 1,
    preamble: 'Test preamble',
    template: 'Choose between [ValueA] and [ValueB].',
    dimensions: buildDefinitionDimensions(),
    ...overrides,
  };
}

export function buildDefinition(overrides: DefinitionOverrides = {}): Definition {
  const { content: contentOverride, ...rest } = overrides;
  const content = contentOverride
    ? {
        ...buildDefinitionContent(),
        ...contentOverride,
      }
    : buildDefinitionContent();

  return {
    id: createTestId(),
    parentId: null,
    domainId: null,
    domainContextId: null,
    name: 'test-definition',
    content,
    expansionProgress: null,
    expansionDebug: null,
    createdAt: newCreatedAt(),
    updatedAt: newCreatedAt(),
    lastAccessedAt: null,
    deletedAt: null,
    createdByUserId: null,
    deletedByUserId: null,
    preambleVersionId: null,
    version: 1,
    levelPresetVersionId: null,
    ...rest,
  };
}

export function buildRun(overrides: Partial<Run> = {}): Run {
  return {
    id: createTestId(),
    name: null,
    definitionId: createTestId(),
    experimentId: null,
    status: 'COMPLETED',
    runCategory: 'PRODUCTION',
    config: { models: ['test-model-1'], samplesPerScenario: 1 },
    progress: { total: 10, completed: 10, failed: 0 },
    summarizeProgress: null,
    stalledModels: [],
    startedAt: newCreatedAt(),
    completedAt: newCompletedAt(),
    createdAt: newCreatedAt(),
    updatedAt: newCreatedAt(),
    lastAccessedAt: null,
    deletedAt: null,
    retentionDays: null,
    archivePermanently: true,
    createdByUserId: null,
    deletedByUserId: null,
    domainConfigSnapshotId: null,
    ...overrides,
  };
}

export function buildTranscript(overrides: Partial<Transcript> = {}): Transcript {
  return {
    id: createTestId(),
    runId: createTestId(),
    scenarioId: null,
    modelId: 'test-model-1',
    modelVersion: null,
    sampleIndex: 0,
    definitionSnapshot: null,
    content: {
      turns: [{ probePrompt: 'Test prompt', targetResponse: 'Test response about values' }],
    },
    turnCount: 1,
    tokenCount: 50,
    durationMs: 1000,
    estimatedCost: null,
    createdAt: newCreatedAt(),
    lastAccessedAt: null,
    contentExpiresAt: null,
    decisionCode: null,
    decisionCodeSource: null,
    decisionText: null,
    decisionMetadata: null,
    summarizedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

export function buildScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: createTestId(),
    definitionId: createTestId(),
    name: 'test-scenario-1',
    content: {
      prompt: 'You face a dilemma between ValueA and ValueB.',
      variables: { ValueA: 'high-a', ValueB: 'low-b' },
    },
    orientationFlipped: false,
    createdAt: newCreatedAt(),
    deletedAt: null,
    ...overrides,
  };
}

export function buildDomain(overrides: Partial<Domain> = {}): Domain {
  return {
    id: createTestId(),
    name: 'test-domain',
    normalizedName: 'test-domain',
    createdAt: newCreatedAt(),
    updatedAt: newCreatedAt(),
    defaultLevelPresetVersionId: null,
    defaultPreambleVersionId: null,
    defaultContextId: null,
    ...overrides,
  };
}

export async function createTestEntities(db: TestDb, overrides: TestEntityOverrides = {}) {
  const definition = await db.definition.create({
    data: buildDefinition(overrides.definition),
  });

  const run = await db.run.create({
    data: buildRun({
      ...overrides.run,
      definitionId: definition.id,
    }),
  });

  const scenario = await db.scenario.create({
    data: buildScenario({
      ...overrides.scenario,
      definitionId: definition.id,
    }),
  });

  const transcript = await db.transcript.create({
    data: buildTranscript({
      ...overrides.transcript,
      runId: run.id,
      scenarioId: scenario.id,
    }),
  });

  return { definition, run, scenario, transcript };
}
