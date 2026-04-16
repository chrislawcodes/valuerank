import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '../ui/Button';
import type { DomainConfigSnapshotSummary } from '../../api/operations/domains';

function formatSnapshotDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return isoString;
  }
}

type Props = {
  snapshots: DomainConfigSnapshotSummary[];
};

export function ConfigHistorySection({ snapshots }: Props) {
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <div className="border-t border-gray-200 pt-4">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="flex items-center gap-1 !px-0 text-sm font-medium text-gray-600 hover:text-teal-700"
        onClick={() => setHistoryOpen((v) => !v)}
      >
        {historyOpen ? (
          <ChevronDown className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
        Config history ({snapshots.length})
      </Button>

      {historyOpen && (
        <div className="mt-3">
          {snapshots.length === 0 ? (
            <p className="text-sm text-gray-500">No history yet.</p>
          ) : (
            <div className="space-y-2">
              {snapshots.map((snap) => (
                <div
                  key={snap.id}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs space-y-0.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-700">
                      {formatSnapshotDate(snap.createdAt)}
                    </span>
                    <span className="text-gray-400">
                      {snap.valueStatementCount} value stmt{snap.valueStatementCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="text-gray-500 space-y-0.5">
                    {snap.preambleLabel != null && (
                      <div>Preamble: {snap.preambleLabel}</div>
                    )}
                    {snap.levelPresetLabel != null && (
                      <div>Level preset: {snap.levelPresetLabel}</div>
                    )}
                    {snap.contextLabel != null && (
                      <div>Context: {snap.contextLabel}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
