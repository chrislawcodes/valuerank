export const ANALYSIS_BASE_PATH = '/analysis';

export type AnalysisBasePath = typeof ANALYSIS_BASE_PATH;

export function buildAnalysisDetailPath(basePath: AnalysisBasePath, runId: string): string {
  return `${basePath}/${runId}`;
}

export function buildAnalysisTranscriptsPath(
  basePath: AnalysisBasePath,
  runId: string,
  search: URLSearchParams | string,
): string {
  const serialized = typeof search === 'string' ? search : search.toString();
  return serialized.length > 0
    ? `${basePath}/${runId}/transcripts?${serialized}`
    : `${basePath}/${runId}/transcripts`;
}

export function isAggregateAnalysis(
  isTaggedAggregate: boolean,
  analysisType: string | null | undefined,
): boolean {
  return isTaggedAggregate || analysisType === 'AGGREGATE';
}
