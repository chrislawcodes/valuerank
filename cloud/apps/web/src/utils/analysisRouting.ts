export const ANALYSIS_BASE_PATH = '/analysis';

export type AnalysisBasePath = typeof ANALYSIS_BASE_PATH;

export function buildAnalysisDetailPath(basePath: AnalysisBasePath, runId: string): string {
  return `${basePath}/${runId}`;
}

export function buildAnalysisTranscriptsPath(
  basePath: AnalysisBasePath,
  runId: string,
  search: URLSearchParams | string,
  extraSearch?: URLSearchParams | string,
): string {
  const serialized = typeof search === 'string' ? search : search.toString();
  const params = new URLSearchParams(serialized.startsWith('?') ? serialized.slice(1) : serialized);

  if (extraSearch) {
    const extra = typeof extraSearch === 'string'
      ? new URLSearchParams(extraSearch.startsWith('?') ? extraSearch.slice(1) : extraSearch)
      : extraSearch;
    extra.forEach((value, key) => {
      params.set(key, value);
    });
  }

  const merged = params.toString();
  return merged.length > 0
    ? `${basePath}/${runId}/transcripts?${merged}`
    : `${basePath}/${runId}/transcripts`;
}

export function isAggregateAnalysis(
  isTaggedAggregate: boolean,
  analysisType: string | null | undefined,
): boolean {
  return isTaggedAggregate || analysisType === 'AGGREGATE';
}
