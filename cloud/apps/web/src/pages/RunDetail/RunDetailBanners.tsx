import type * as React from 'react';
import type { Run } from '../../api/operations/runs';

export function formatRunDate(dateString: string | Date): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getDisplaySignature(signature: string): string {
  return signature !== 'v?td' ? signature : 'Unknown Signature';
}

export function StalledModelsBanner({ run }: { run: Run }): React.ReactNode {
  if (run.status !== 'RUNNING') return null;
  if (run.stalledModels == null || run.stalledModels.length === 0) return null;
  const count = run.stalledModels.length;
  const label = count === 1 ? 'model is' : 'models are';
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
      <p className="text-sm font-medium text-amber-800">
        {`${count} ${label} stalled (no progress for 3+ minutes): ${run.stalledModels.join(', ')}`}
      </p>
    </div>
  );
}

export function UnresolvableBanner({
  data,
}: {
  data: { total: number; byModel: { modelId: string; count: number }[] } | null | undefined;
}): React.ReactNode {
  if (data == null || data.total === 0) return null;
  return (
    <div className="border border-amber-400 bg-amber-50 rounded-lg p-4 mb-4">
      <p className="font-medium text-amber-800">
        {data.total} transcript{data.total !== 1 ? 's' : ''} could not be scored —
        manual adjudication required before analysis results are reliable.
      </p>
      {data.byModel.length > 0 && (
        <ul className="mt-2 text-sm text-amber-700 list-disc list-inside">
          {data.byModel.map((m) => (
            <li key={m.modelId}>{m.modelId}: {m.count}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
