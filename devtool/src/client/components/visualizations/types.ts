import type { AggregateData } from '../../lib/api';

export type VisualizationType = 'decision-dist' | 'model-variance' | 'scenario-heatmap' | 'dimension-analysis' | 'deep-analysis';
export type DataSource = 'server' | 'file';

// Extended aggregate data that includes raw rows for dimension analysis
export interface ExtendedAggregateData extends AggregateData {
  rawRows: Record<string, string>[];
}
