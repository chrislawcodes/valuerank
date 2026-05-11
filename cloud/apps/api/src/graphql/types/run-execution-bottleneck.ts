import { builder } from '../builder.js';
import type {
  RunExecutionBottleneck as RunExecutionBottleneckShape,
  ModelExecutionBottleneck as ModelExecutionBottleneckShape,
  StageSummary,
  TimingSummary,
} from '../../services/run/bottleneck.js';

export const TimingSummaryRef = builder.objectRef<TimingSummary>('TimingSummary').implement({
  description: 'Timing statistics for a set of queue wait or execution samples',
  fields: (t) => ({
    sampleCount: t.exposeInt('sampleCount', {
      description: 'Number of timing samples included in the summary',
    }),
    averageMs: t.exposeInt('averageMs', {
      nullable: true,
      description: 'Average duration in milliseconds',
    }),
    p95Ms: t.exposeInt('p95Ms', {
      nullable: true,
      description: '95th percentile duration in milliseconds',
    }),
    maxMs: t.exposeInt('maxMs', {
      nullable: true,
      description: 'Maximum duration in milliseconds',
    }),
  }),
});

export const StageSummaryRef = builder.objectRef<StageSummary>('StageSummary').implement({
  description: 'Timing summary for one run stage',
  fields: (t) => ({
    totalCount: t.exposeInt('totalCount', {
      description: 'Total rows considered for this stage',
    }),
    failedCount: t.exposeInt('failedCount', {
      description: 'Number of failed rows in this stage',
    }),
    queueWait: t.field({
      type: TimingSummaryRef,
      resolve: (stage) => stage.queueWait,
    }),
    execution: t.field({
      type: TimingSummaryRef,
      resolve: (stage) => stage.execution,
    }),
  }),
});

export const RunExecutionBottleneckRef = builder.objectRef<RunExecutionBottleneckShape>('RunExecutionBottleneck').implement({
  description: 'Derived bottleneck diagnosis for probe and summarize work on a run',
  fields: (t) => ({
    stage: t.exposeString('stage', {
      description: 'Likely bottleneck stage',
    }),
    action: t.exposeString('action', {
      description: 'Recommended tuning action',
    }),
    confidence: t.exposeString('confidence', {
      description: 'Confidence in the diagnosis',
    }),
    recommendation: t.exposeString('recommendation', {
      description: 'Human-readable recommendation',
    }),
    probe: t.field({
      type: StageSummaryRef,
      resolve: (summary) => summary.probe,
    }),
    summarize: t.field({
      type: StageSummaryRef,
      resolve: (summary) => summary.summarize,
    }),
  }),
});

export const ModelExecutionBottleneckRef = builder.objectRef<ModelExecutionBottleneckShape>('ModelExecutionBottleneck').implement({
  description: 'Derived bottleneck diagnosis for a specific model within a run',
  fields: (t) => ({
    modelId: t.exposeString('modelId', {
      description: 'Model identifier',
    }),
    displayName: t.exposeString('displayName', {
      nullable: true,
      description: 'Human-readable model name if available',
    }),
    providerName: t.exposeString('providerName', {
      nullable: true,
      description: 'Provider name if available',
    }),
    pressureMs: t.exposeInt('pressureMs', {
      description: 'Dominant timing pressure for this model in milliseconds',
    }),
    stage: t.exposeString('stage', {
      description: 'Likely bottleneck stage for this model',
    }),
    action: t.exposeString('action', {
      description: 'Recommended tuning action for this model',
    }),
    confidence: t.exposeString('confidence', {
      description: 'Confidence in the diagnosis',
    }),
    recommendation: t.exposeString('recommendation', {
      description: 'Human-readable recommendation',
    }),
    probe: t.field({
      type: StageSummaryRef,
      resolve: (summary) => summary.probe,
    }),
    summarize: t.field({
      type: StageSummaryRef,
      resolve: (summary) => summary.summarize,
    }),
  }),
});
