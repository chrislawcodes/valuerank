import { isVnewSignature, parseVnewTemperature } from '@valuerank/shared/trial-signature';
import type { DomainAvailableSignature } from '../api/operations/domainAnalysis';

type TranscriptCountModel = {
  model: string;
  values: Array<{
    totalComparisons?: number | null;
  }>;
};

export function parseTemperatureFromSignature(signature: string): number | null {
  if (signature.trim() === '') return null;
  if (isVnewSignature(signature)) {
    try {
      return parseVnewTemperature(signature);
    } catch {
      return null;
    }
  }
  const match = signature.match(/t(.+)$/);
  if (match != null) {
    const token = match[1] ?? '';
    if (token === 'd') return null;
    const parsed = Number.parseFloat(token);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function getSignaturePriority(option: DomainAvailableSignature): number {
  if (option.signature === 'vnewtd') return 0;
  if (!option.isVirtual && /td$/i.test(option.signature)) return 1;
  if (option.isVirtual) return 2;
  return 3;
}

export function formatSignatureOptionLabel(option: DomainAvailableSignature): string {
  if (option.isVirtual) return option.label;
  const defaultMatch = option.signature.match(/^v(\d+)td$/i);
  if (defaultMatch != null) return `v${defaultMatch[1]} @ default`;
  const tempMatch = option.signature.match(/^v(\d+)t(.+)$/i);
  if (tempMatch != null) return `v${tempMatch[1]} @ t=${tempMatch[2]}`;
  return option.label;
}

export function countAnalyzedTranscripts(
  models: TranscriptCountModel[],
  selectedModelIds?: string[],
): number {
  const selectedModels = selectedModelIds != null && selectedModelIds.length > 0
    ? models.filter((model) => selectedModelIds.includes(model.model))
    : models;

  const totalComparisons = selectedModels.reduce((modelTotal, model) => (
    modelTotal + model.values.reduce((valueTotal, value) => valueTotal + (value.totalComparisons ?? 0), 0)
  ), 0);

  return Math.round(totalComparisons / 2);
}

function formatTranscriptCount(transcriptCount: number): string {
  return `${transcriptCount} transcript${transcriptCount === 1 ? '' : 's'} analyzed.`;
}

export function getCacheStatusCopy(
  cacheStatus: 'FRESH' | 'UPDATING' | 'OUT_OF_DATE' | undefined,
  generatedAt: string | undefined,
  transcriptCount: number,
): {
  badgeLabel: string;
  badgeClassName: string;
  detail: string;
} | null {
  if (cacheStatus == null || generatedAt == null) return null;
  const generatedLabel = new Date(generatedAt).toLocaleString();
  const transcriptLabel = formatTranscriptCount(transcriptCount);

  if (cacheStatus === 'FRESH') {
    return {
      badgeLabel: 'Fresh',
      badgeClassName: 'border-green-200 bg-green-50 text-green-800',
      detail: `Updated ${generatedLabel}. ${transcriptLabel}`,
    };
  }

  if (cacheStatus === 'UPDATING') {
    return {
      badgeLabel: 'Cached',
      badgeClassName: 'border-amber-200 bg-amber-50 text-amber-800',
      detail: `Showing saved results from ${generatedLabel}. ${transcriptLabel} A refresh is running in the background.`,
    };
  }

  return {
    badgeLabel: 'Out of date',
    badgeClassName: 'border-gray-300 bg-gray-50 text-gray-700',
    detail: `Showing saved results from ${generatedLabel}. ${transcriptLabel} Refresh was not started automatically.`,
  };
}
