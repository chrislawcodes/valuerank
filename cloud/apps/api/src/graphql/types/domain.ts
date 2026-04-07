import { builder } from '../builder.js';
import {
  db,
  type LevelPresetVersion,
  type PreambleVersion,
  type DomainContext,
} from '@valuerank/db';
import {
  DomainRef,
  DefinitionRef,
  LevelPresetVersionRef,
  PreambleVersionRef,
  DomainContextRef,
  ValueStatementVersionRef,
  DomainConfigSnapshotRef,
} from './refs.js';

export { DomainRef };

type DomainWithDefaults = {
  defaultLevelPresetVersion?: LevelPresetVersion | null;
  defaultPreambleVersion?: PreambleVersion | null;
  defaultContext?: DomainContext | null;
};

builder.objectType(DomainRef, {
  description: 'A single domain used to group vignettes',
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    normalizedName: t.exposeString('normalizedName'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    defaultLevelPresetVersionId: t.exposeString('defaultLevelPresetVersionId', { nullable: true }),
    defaultLevelPresetVersion: t.field({
      type: LevelPresetVersionRef,
      nullable: true,
      resolve: async (domain) => {
        const preloaded = (domain as DomainWithDefaults).defaultLevelPresetVersion;
        if (preloaded !== undefined) return preloaded;
        if (domain.defaultLevelPresetVersionId == null) return null;
        return db.levelPresetVersion.findUnique({ where: { id: domain.defaultLevelPresetVersionId } });
      },
    }),
    defaultPreambleVersionId: t.exposeString('defaultPreambleVersionId', { nullable: true }),
    defaultPreambleVersion: t.field({
      type: PreambleVersionRef,
      nullable: true,
      resolve: async (domain) => {
        const preloaded = (domain as DomainWithDefaults).defaultPreambleVersion;
        if (preloaded !== undefined) return preloaded;
        if (domain.defaultPreambleVersionId == null) return null;
        return db.preambleVersion.findUnique({ where: { id: domain.defaultPreambleVersionId } });
      },
    }),
    defaultModelIds: t.exposeStringList('defaultModelIds'),
    defaultContextId: t.exposeString('defaultContextId', { nullable: true }),
    defaultContext: t.field({
      type: DomainContextRef,
      nullable: true,
      resolve: async (domain) => {
        const preloaded = (domain as DomainWithDefaults).defaultContext;
        if (preloaded !== undefined) return preloaded;
        if (domain.defaultContextId == null) return null;
        return db.domainContext.findUnique({ where: { id: domain.defaultContextId } });
      },
    }),
    definitionCount: t.field({
      type: 'Int',
      resolve: async (domain) => {
        if ('definitionCount' in domain && typeof domain.definitionCount === 'number') {
          return domain.definitionCount;
        }
        return db.definition.count({
          where: { domainId: domain.id, deletedAt: null },
        });
      },
    }),
    definitions: t.field({
      type: [DefinitionRef],
      resolve: async (domain) => {
        return db.definition.findMany({
          where: { domainId: domain.id, deletedAt: null },
          orderBy: { createdAt: 'desc' },
        });
      },
    }),
  }),
});

// T012: ValueStatementVersion objectType
builder.objectType(ValueStatementVersionRef, {
  description: 'A versioned snapshot of a value statement content',
  fields: (t) => ({
    id: t.exposeID('id'),
    statementId: t.exposeString('statementId'),
    content: t.exposeString('content'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
  }),
});

// T013: DomainConfigSnapshot objectType
builder.objectType(DomainConfigSnapshotRef, {
  description: 'A snapshot of all domain config at a point in time',
  fields: (t) => ({
    id: t.exposeID('id'),
    domainId: t.exposeString('domainId'),
    preambleVersionId: t.exposeString('preambleVersionId', { nullable: true }),
    levelPresetVersionId: t.exposeString('levelPresetVersionId', { nullable: true }),
    contextId: t.exposeString('contextId', { nullable: true }),
    valueStatementVersionIds: t.exposeStringList('valueStatementVersionIds'),
    fingerprint: t.exposeString('fingerprint'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
  }),
});

// T014-T015: Custom shape types for domain settings

export type ValueStatementWithVersions = {
  id: string;
  token: string;
  currentContent: string;
  previousContent: string | null;
};

export type DomainSettingsShape = {
  domainId: string;
  preambleVersionId: string | null;
  levelPresetVersionId: string | null;
  contextId: string | null;
  defaultModelIds: string[];
  sentencePrefix: string | null;
  labelPrefix: string | null;
  valueStatements: ValueStatementWithVersions[];
};

// DomainConfigSnapshotSummary is a computed shape with resolved labels
export type DomainConfigSnapshotSummaryShape = {
  id: string;
  createdAt: Date;
  preambleLabel: string | null;
  levelPresetLabel: string | null;
  contextLabel: string | null;
  valueStatementCount: number;
};

export const ValueStatementWithVersionsRef =
  builder.objectRef<ValueStatementWithVersions>('ValueStatementWithVersions');

export const DomainSettingsRef = builder.objectRef<DomainSettingsShape>('DomainSettings');

export const DomainConfigSnapshotSummaryRef =
  builder.objectRef<DomainConfigSnapshotSummaryShape>('DomainConfigSnapshotSummary');

builder.objectType(ValueStatementWithVersionsRef, {
  description: 'A value statement with its current and previous content for diff display',
  fields: (t) => ({
    id: t.exposeID('id'),
    token: t.exposeString('token'),
    currentContent: t.exposeString('currentContent'),
    previousContent: t.exposeString('previousContent', { nullable: true }),
  }),
});

builder.objectType(DomainSettingsRef, {
  description: 'Current domain settings: pickers and value statements with versions',
  fields: (t) => ({
    domainId: t.exposeID('domainId'),
    preambleVersionId: t.exposeString('preambleVersionId', { nullable: true }),
    levelPresetVersionId: t.exposeString('levelPresetVersionId', { nullable: true }),
    contextId: t.exposeString('contextId', { nullable: true }),
    defaultModelIds: t.exposeStringList('defaultModelIds'),
    sentencePrefix: t.exposeString('sentencePrefix', { nullable: true }),
    labelPrefix: t.exposeString('labelPrefix', { nullable: true }),
    valueStatements: t.expose('valueStatements', {
      type: [ValueStatementWithVersionsRef],
    }),
  }),
});

// T016: DomainConfigSnapshotSummary objectType with field resolvers
builder.objectType(DomainConfigSnapshotSummaryRef, {
  description: 'Summary of a domain config snapshot for history display',
  fields: (t) => ({
    id: t.exposeID('id'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    preambleLabel: t.exposeString('preambleLabel', { nullable: true }),
    levelPresetLabel: t.exposeString('levelPresetLabel', { nullable: true }),
    contextLabel: t.exposeString('contextLabel', { nullable: true }),
    valueStatementCount: t.exposeInt('valueStatementCount'),
  }),
});
