import { builder } from '../builder.js';
import { RunAnomalyRef } from './refs.js';

export const RunAnomalyTypeEnum: ReturnType<typeof builder.enumType<'RunAnomalyType', readonly ['STRANDED_TRANSCRIPT', 'ORPHAN_TRANSCRIPT', 'PAIR_ASYMMETRY', 'SUMMARIZING_STALL', 'MODEL_TRANSCRIPT_SHORTFALL', 'SCHEDULED_COUNT_MISMATCH']>> = builder.enumType('RunAnomalyType', {
  values: [
    'STRANDED_TRANSCRIPT',
    'ORPHAN_TRANSCRIPT',
    'PAIR_ASYMMETRY',
    'SUMMARIZING_STALL',
    'MODEL_TRANSCRIPT_SHORTFALL',
    'SCHEDULED_COUNT_MISMATCH',
  ] as const,
  description: 'Structured anomaly type for run state reconciliation',
});

const RunAnomalySourceEnum = builder.enumType('RunAnomalySource', {
  values: {
    DEFAULT: { value: 'default', description: 'Anomaly detected by the default reconciliation sweep' },
    AUDIT: { value: 'audit', description: 'Anomaly detected by the audit sweep' },
  },
  description: 'Source of a run anomaly record',
});

builder.objectType(RunAnomalyRef, {
  description: 'Structured anomaly record for a run',
  fields: (t) => ({
    id: t.exposeID('id'),
    runId: t.exposeString('runId'),
    type: t.field({
      type: RunAnomalyTypeEnum,
      resolve: (anomaly) => anomaly.type,
    }),
    subject: t.exposeString('subject'),
    source: t.field({
      type: RunAnomalySourceEnum,
      resolve: (anomaly) => anomaly.source,
    }),
    details: t.field({
      type: 'JSON',
      resolve: (anomaly) => anomaly.details,
    }),
    firstSeenAt: t.expose('firstSeenAt', { type: 'DateTime' }),
    lastSeenAt: t.expose('lastSeenAt', { type: 'DateTime' }),
    resolvedAt: t.expose('resolvedAt', { type: 'DateTime', nullable: true }),
    acknowledgedByUserId: t.exposeString('acknowledgedByUserId', { nullable: true }),
  }),
});
