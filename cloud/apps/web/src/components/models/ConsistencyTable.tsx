import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/Table';
import { MetricDisclosure } from './MetricDisclosure';
import type { ModelsConsistencyModel } from '../../api/operations/modelsConsistency';
import { ANALYSIS_BASE_PATH, buildAnalysisTranscriptsPath } from '../../utils/analysisRouting';

type SortKey = 'model' | 'provider' | 'repeatability' | 'coherence' | 'scenarios';

type ConsistencyTableProps = {
  models: ModelsConsistencyModel[];
  onSelectModel: (modelId: string) => void;
  selectedModelId: string | null;
};

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function sortValue(model: ModelsConsistencyModel, key: SortKey): number | string {
  switch (key) {
    case 'provider':
      return model.providerName;
    case 'repeatability':
      return model.repeatability.value;
    case 'coherence':
      return model.coherence.value;
    case 'scenarios':
      return model.repeatability.scenariosMeasured;
    case 'model':
    default:
      return model.label;
  }
}

export function ConsistencyTable({ models, onSelectModel, selectedModelId }: ConsistencyTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('repeatability');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    return [...models].sort((left, right) => {
      const a = sortValue(left, sortKey);
      const b = sortValue(right, sortKey);
      const delta = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b));
      return direction === 'asc' ? delta : -delta;
    });
  }, [direction, models, sortKey]);

  const toggle = (next: SortKey) => {
    if (next === sortKey) {
      setDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(next);
    setDirection(next === 'model' || next === 'provider' ? 'asc' : 'desc');
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Model ranking</h2>
          <p className="text-sm text-gray-600">Click a header to sort. Click a row to open the drill-down.</p>
        </div>
      </div>
      <Table variant="bordered">
        <TableHeader variant="bordered">
          <TableRow>
            {[
              ['model', 'Model'],
              ['provider', 'Provider'],
              ['repeatability', 'Repeatability'],
              ['coherence', 'Coherence'],
              ['scenarios', 'n scenarios'],
            ].map(([key, label]) => (
              <TableHead
                key={key}
                className="cursor-pointer select-none"
                onClick={() => toggle(key as SortKey)}
              >
                {label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((model) => (
            <TableRow
              key={model.modelId}
              hoverable
              className={model.modelId === selectedModelId ? 'bg-teal-50' : 'cursor-pointer'}
              onClick={() => onSelectModel(model.modelId)}
            >
              <TableCell className="font-medium text-gray-900">{model.label}</TableCell>
              <TableCell>{model.providerName}</TableCell>
              <TableCell>
                <MetricDisclosure
                  title="Repeatability"
                  summary={`${formatPercent(model.repeatability.value)} ± ${formatPercent((model.repeatability.ciHigh - model.repeatability.ciLow) / 2)}`}
                  definition="Repeatability asks whether the model gives the same answer when we ask the same question again in the same vignette."
                  formula="Repeatability = random-effects pooled match rate from scenario Wilson intervals."
                  rows={model.repeatability.perScenario}
                  rowLabel={(row) => row.scenarioId}
                  renderRow={(row) => `${row.scenarioId} - ${row.matches}/${row.trials} (${formatPercent(row.p)})`}
                  renderRowDetail={(row) => `Wilson CI: ${formatPercent(row.ciLow)} to ${formatPercent(row.ciHigh)}.`}
                />
              </TableCell>
              <TableCell>
                <MetricDisclosure
                  title="Coherence"
                  summary={`${model.coherence.coherentPairs} / ${model.coherence.determinatePairs} pairs`}
                  definition="Coherence asks whether win rate rises as pressure to favor a value rises."
                  formula="Coherence = coherent pairs / determinate pairs, where coherent means rho >= 0.8 and p < 0.05."
                  rows={model.coherence.perPair}
                  rowLabel={(row) => `${row.domainId} / ${row.valueKey}`}
                  renderRow={(row) => `${row.valueKey} - ρ ${row.rho == null ? '—' : row.rho.toFixed(3)}; p ${row.pValue == null ? '—' : row.pValue.toFixed(3)}`}
                  renderRowDetail={(row) => (
                    <div className="space-y-2">
                      <div>coherent: {row.coherent ? 'yes' : 'no'}; determinate: {row.determinate ? 'yes' : 'no'}</div>
                      {row.targetAnalysisRunId != null && row.targetCompanionRunId != null && (
                        <Link
                          to={buildAnalysisTranscriptsPath(
                            ANALYSIS_BASE_PATH,
                            row.targetAnalysisRunId,
                            new URLSearchParams({
                              modelId: model.modelId,
                              repeatPattern: 'noisy',
                              companionRunId: row.targetCompanionRunId,
                              primaryConditionIds: row.primaryConditionIds.join(','),
                              companionConditionIds: row.companionConditionIds.join(','),
                            }),
                          )}
                          className="font-medium text-teal-700 hover:underline"
                          onClick={(event) => event.stopPropagation()}
                        >
                          View transcripts →
                        </Link>
                      )}
                    </div>
                  )}
                />
              </TableCell>
              <TableCell>{model.repeatability.scenariosMeasured}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
