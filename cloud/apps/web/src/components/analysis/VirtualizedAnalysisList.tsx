/**
 * VirtualizedAnalysisList Component
 *
 * Renders a virtualized list of analysis results using the generic VirtualizedList.
 */

import { useCallback } from 'react';
import type { Run } from '../../api/operations/runs';
import { AnalysisCard } from './AnalysisCard';
import { VirtualizedList } from '../ui/VirtualizedList';

type VirtualizedAnalysisListProps = {
  runs: Run[];
  onRunClick: (runId: string) => void;
  hasNextPage: boolean;
  loadingMore: boolean;
  totalCount: number | null;
  onLoadMore: () => void;
};

export function VirtualizedAnalysisList({
  runs,
  onRunClick,
  hasNextPage,
  loadingMore,
  totalCount,
  onLoadMore,
}: VirtualizedAnalysisListProps) {
  const renderItem = useCallback(
    (run: Run) => <AnalysisCard run={run} onClick={() => onRunClick(run.id)} />,
    [onRunClick]
  );

  return (
    <VirtualizedList
      items={runs}
      renderItem={renderItem}
      hasNextPage={hasNextPage}
      loadingMore={loadingMore}
      totalCount={totalCount}
      onLoadMore={onLoadMore}
      itemLabel="analysis results"
    />
  );
}
