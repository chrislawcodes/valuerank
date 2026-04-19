import type { ModelsConsistencyInsufficient } from '../../api/operations/modelsConsistency';

type Props = {
  insufficient: ModelsConsistencyInsufficient[];
};

// The GraphQL schema types `reason` as String; the backend emits one of these
// three values. Unknown values fall through to a readable default.
const labels: Record<string, string> = {
  'no-repeat-coverage': 'No repeat coverage available',
  'invalid-summary-shape': 'Invalid summary shape',
  'below-min-scenarios': 'Below min n',
};

function labelFor(reason: string): string {
  return labels[reason] ?? reason;
}

export function InsufficientCoverageFooter({ insufficient }: Props) {
  if (insufficient.length === 0) {
    return null;
  }

  const grouped = insufficient.reduce<Record<string, ModelsConsistencyInsufficient[]>>((acc, row) => {
    const key = row.reason;
    (acc[key] ??= []).push(row);
    return acc;
  }, {});

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
      <h2 className="text-lg font-semibold text-gray-900">Insufficient coverage</h2>
      <div className="mt-3 space-y-3">
        {Object.entries(grouped).map(([reason, rows]) => (
          <div key={reason} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="text-sm font-medium text-gray-900">{labelFor(reason)}</div>
            <div className="mt-1 space-y-1 text-xs text-gray-600">
              {rows.map((row) => (
                <div key={row.modelId} className="flex items-start justify-between gap-3">
                  <span>{row.label}</span>
                  <span>{row.providerName}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
