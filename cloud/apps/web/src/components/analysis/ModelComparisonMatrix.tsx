/**
 * ModelComparisonMatrix Component
 *
 * Displays a heatmap/matrix of pairwise model agreement scores.
 * Shows Spearman's rho correlation and highlights outlier models.
 */

import { useMemo } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import type { ModelAgreement, PerModelStats, PairwiseAgreement } from '../../api/operations/analysis';

type ModelComparisonMatrixProps = {
  modelAgreement: ModelAgreement;
  perModel: Record<string, PerModelStats>;
};

type MatrixCell = {
  model1: string;
  model2: string;
  agreement: PairwiseAgreement | null;
};

/**
 * Generate a pairwise key in consistent format.
 */
function getPairKey(model1: string, model2: string): string {
  return [model1, model2].sort().join('|');
}

/**
 * Get color for correlation value.
 * Uses a gradient from red (negative) through white (zero) to green (positive).
 */
function getCorrelationColor(rho: number): string {
  if (rho >= 0.8) return 'bg-green-600 text-white';
  if (rho >= 0.6) return 'bg-green-400 text-white';
  if (rho >= 0.4) return 'bg-green-200 text-green-900';
  if (rho >= 0.2) return 'bg-green-100 text-green-800';
  if (rho >= -0.2) return 'bg-gray-100 text-gray-800';
  if (rho >= -0.4) return 'bg-red-100 text-red-800';
  if (rho >= -0.6) return 'bg-red-200 text-red-900';
  if (rho >= -0.8) return 'bg-red-400 text-white';
  return 'bg-red-600 text-white';
}

/**
 * Format correlation coefficient for display.
 */
function formatRho(rho: number): string {
  return rho.toFixed(2);
}

/**
 * Truncate model name for display.
 */
function truncateModel(name: string, maxLen: number = 12): string {
  if (name.length <= maxLen) return name;
  return `${name.slice(0, maxLen - 3)}...`;
}

/**
 * Cell tooltip content.
 */
function CellTooltip({ agreement }: { agreement: PairwiseAgreement }) {
  return (
    <div className="text-xs space-y-1">
      <p>Spearman's ρ: <span className="font-medium">{formatRho(agreement.spearmanRho)}</span></p>
      <p>Effect Size: <span className="font-medium">{agreement.effectSize.toFixed(2)}</span></p>
      <p>Effect: {agreement.effectInterpretation}</p>
      <p className={agreement.significant ? 'text-green-600' : 'text-gray-400'}>
        {agreement.significant ? 'Statistically significant' : 'Not significant'}
      </p>
    </div>
  );
}

export function ModelComparisonMatrix({ modelAgreement, perModel }: ModelComparisonMatrixProps) {
  const models = useMemo(() => Object.keys(perModel).sort(), [perModel]);

  // Build matrix data
  const matrixData = useMemo(() => {
    const matrix: MatrixCell[][] = [];

    for (const row of models) {
      const rowData: MatrixCell[] = [];
      for (const col of models) {
        if (row === col) {
          rowData.push({ model1: row, model2: col, agreement: null });
        } else {
          const key = getPairKey(row, col);
          const agreement = modelAgreement.pairwise[key] || null;
          rowData.push({ model1: row, model2: col, agreement });
        }
      }
      matrix.push(rowData);
    }

    return matrix;
  }, [models, modelAgreement]);

  // Handle single model case
  if (models.length < 2) {
    return (
      <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
        <Info className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-gray-700">Model Comparison Unavailable</p>
          <p className="text-xs text-gray-500 mt-1">
            Model comparison requires at least two models. Run the evaluation with multiple models to see how they agree.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Overall agreement */}
      <div className="flex items-center justify-between text-sm">
        <div className="text-gray-600">
          <span className="font-medium">Overall Agreement:</span>{' '}
          {(modelAgreement.overallAgreement * 100).toFixed(1)}%
        </div>
        {modelAgreement.outlierModels.length > 0 && (
          <div className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">
              Outlier{modelAgreement.outlierModels.length > 1 ? 's' : ''}: {modelAgreement.outlierModels.join(', ')}
            </span>
          </div>
        )}
      </div>

      {/* Matrix */}
      <div className="overflow-x-auto">
        <table className="border-collapse">
          <thead>
            <tr>
              <th className="w-24"></th>
              {models.map((model) => (
                <th
                  key={model}
                  className={`p-2 text-xs font-medium text-gray-700 border border-gray-200 ${
                    modelAgreement.outlierModels.includes(model) ? 'bg-amber-50' : ''
                  }`}
                  title={model}
                >
                  {truncateModel(model)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrixData.map((row, rowIndex) => (
              <tr key={models[rowIndex]}>
                <td
                  className={`p-2 text-xs font-medium text-gray-700 border border-gray-200 ${
                    modelAgreement.outlierModels.includes(models[rowIndex]) ? 'bg-amber-50' : ''
                  }`}
                  title={models[rowIndex]}
                >
                  {truncateModel(models[rowIndex])}
                </td>
                {row.map((cell, colIndex) => (
                  <td
                    key={`${cell.model1}-${cell.model2}`}
                    className={`p-2 text-center border border-gray-200 ${
                      cell.agreement
                        ? getCorrelationColor(cell.agreement.spearmanRho)
                        : 'bg-gray-300 text-gray-500'
                    }`}
                    title={
                      cell.agreement
                        ? `${cell.model1} vs ${cell.model2}: ρ=${formatRho(cell.agreement.spearmanRho)}`
                        : 'Self'
                    }
                  >
                    {cell.agreement ? (
                      <div className="group relative cursor-help">
                        <span className="text-xs font-medium">
                          {formatRho(cell.agreement.spearmanRho)}
                        </span>
                        {/* Tooltip */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                          <div className="bg-white p-2 shadow-lg rounded-lg border border-gray-200 whitespace-nowrap">
                            <CellTooltip agreement={cell.agreement} />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs">—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
        <span className="font-medium">Spearman's ρ:</span>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-red-400"></div>
          <span>&lt; -0.4</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-gray-100 border border-gray-200"></div>
          <span>~0</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-green-400"></div>
          <span>&gt; 0.4</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded bg-green-600"></div>
          <span>&gt; 0.8</span>
        </div>
        {modelAgreement.outlierModels.length > 0 && (
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-amber-50 border border-amber-200"></div>
            <span>Outlier model</span>
          </div>
        )}
      </div>
    </div>
  );
}
