/**
 * VirtualizedRunList Component
 *
 * Renders a virtualized list of runs using the generic VirtualizedList.
 */

import { useCallback } from 'react';
import type { Run } from '../../api/operations/runs';
import { RunCard } from './RunCard';
import { VirtualizedList } from '../ui/VirtualizedList';

type VirtualizedRunListProps = {
  runs: Run[];
  onRunClick: (runId: string) => void;
  hasNextPage: boolean;
  loadingMore: boolean;
  totalCount: number | null;
  onLoadMore: () => void;
};

export function VirtualizedRunList({
  runs,
  onRunClick,
  hasNextPage,
  loadingMore,
  totalCount,
  onLoadMore,
}: VirtualizedRunListProps) {
  const renderItem = useCallback(
    (run: Run) => <RunCard run={run} onClick={() => onRunClick(run.id)} />,
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
      itemLabel="runs"
    />
  );
}
