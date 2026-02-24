export type DomainTrialCellModelStatus = {
  generationCompleted: number;
  generationFailed: number;
  generationTotal: number;
  summarizationCompleted: number;
  summarizationFailed: number;
  summarizationTotal: number;
  latestErrorMessage: string | null;
};

export type DomainTrialCellStatus = {
  runId: string | null;
  runStatus: { status: string } | null;
  modelStatus: DomainTrialCellModelStatus | null;
};

export function formatCost(cost: number): string {
  if (!Number.isFinite(cost) || cost <= 0) return '$0.00';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

export function cellKey(definitionId: string, modelId: string): string {
  return `${definitionId}::${modelId}`;
}

export function downloadCsv(filename: string, rows: string[][]): void {
  const escaped = rows.map((row) =>
    row
      .map((cell) => `"${cell.split('"').join('""')}"`)
      .join(',')
  );
  const csv = `${escaped.join('\n')}\n`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function getCellTone(status: DomainTrialCellStatus): { container: string; text: string } {
  if (!status.runId) {
    return { container: 'bg-gray-50 border-gray-200', text: 'text-gray-700' };
  }

  const model = status.modelStatus;
  const runStatus = status.runStatus?.status ?? 'PENDING';
  const hasFailure = runStatus === 'FAILED'
    || runStatus === 'CANCELLED'
    || (model !== null && (model.generationFailed > 0 || model.summarizationFailed > 0));

  if (hasFailure) {
    return { container: 'bg-red-100 border-red-300', text: 'text-red-900' };
  }

  if (runStatus === 'COMPLETED') {
    return { container: 'bg-green-700 border-green-800', text: 'text-white' };
  }

  return { container: 'bg-green-100 border-green-300', text: 'text-green-900' };
}

export function getStageText(status: DomainTrialCellStatus): string {
  if (!status.runId) return 'Waiting to start';
  if (!status.runStatus || !status.modelStatus) return 'Updating...';

  const run = status.runStatus;
  const model = status.modelStatus;
  const generation = `${model.generationCompleted + model.generationFailed}/${model.generationTotal}`;
  const summarization = `${model.summarizationCompleted + model.summarizationFailed}/${model.summarizationTotal}`;

  if (run.status === 'FAILED' || run.status === 'CANCELLED') {
    return `Failed (gen ${generation})`;
  }
  if (run.status === 'SUMMARIZING') {
    return `Summarizing ${summarization}`;
  }
  if (run.status === 'COMPLETED') {
    return `Complete (sum ${summarization})`;
  }
  return `Generating ${generation}`;
}

