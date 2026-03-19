export const ANALYSIS_BASE_PATH = '/analysis';

export type AnalysisBasePath = typeof ANALYSIS_BASE_PATH;

function mergeSearchParams(
  search?: URLSearchParams | string,
  extraSearch?: URLSearchParams | string,
): URLSearchParams {
  const params = new URLSearchParams();

  if (search) {
    const serialized = typeof search === 'string' ? search : search.toString();
    const next = new URLSearchParams(serialized.startsWith('?') ? serialized.slice(1) : serialized);
    next.forEach((value, key) => {
      params.set(key, value);
    });
  }

  if (extraSearch) {
    const extra = typeof extraSearch === 'string'
      ? new URLSearchParams(extraSearch.startsWith('?') ? extraSearch.slice(1) : extraSearch)
      : extraSearch;
    extra.forEach((value, key) => {
      params.set(key, value);
    });
  }

  return params;
}

export function buildAnalysisDetailPath(basePath: AnalysisBasePath, runId: string): string {
  return `${basePath}/${runId}`;
}

export function buildConditionKey(row: string, col: string): string {
  return encodeURIComponent(`${row}||${col}`);
}

export function parseConditionKey(conditionKey: string): { row: string; col: string } | null {
  try {
    const decoded = decodeURIComponent(conditionKey);
    const separatorIndex = decoded.indexOf('||');
    if (separatorIndex < 0) {
      return null;
    }

    return {
      row: decoded.slice(0, separatorIndex),
      col: decoded.slice(separatorIndex + 2),
    };
  } catch {
    return null;
  }
}

export function buildAnalysisConditionDetailPath(
  basePath: AnalysisBasePath,
  runId: string,
  conditionKey: string,
  search?: URLSearchParams | string,
  extraSearch?: URLSearchParams | string,
): string {
  const merged = mergeSearchParams(search, extraSearch).toString();
  return merged.length > 0
    ? `${basePath}/${runId}/conditions/${conditionKey}?${merged}`
    : `${basePath}/${runId}/conditions/${conditionKey}`;
}

export function buildAnalysisTranscriptsPath(
  basePath: AnalysisBasePath,
  runId: string,
  search: URLSearchParams | string,
  extraSearch?: URLSearchParams | string,
): string {
  const merged = mergeSearchParams(search, extraSearch).toString();
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
