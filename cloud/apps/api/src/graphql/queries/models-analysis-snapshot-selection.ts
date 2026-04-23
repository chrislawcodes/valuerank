import { isVnewSignature, parseVnewTemperature } from '@valuerank/shared/trial-signature';
import { DOMAIN_ANALYSIS_ASSUMPTION_PREFIX } from '../../services/analysis/domain-analysis-cache-types.js';

const ALL_DOMAINS_ASSUMPTION_KEY = `${DOMAIN_ANALYSIS_ASSUMPTION_PREFIX}:all-domains`;

export type ModelsAnalysisSnapshotCandidate = {
  assumptionKey: string;
  configSignature: string;
};

function isDomainSnapshot(snapshot: ModelsAnalysisSnapshotCandidate): boolean {
  return snapshot.assumptionKey.startsWith(`${DOMAIN_ANALYSIS_ASSUMPTION_PREFIX}:`)
    && snapshot.assumptionKey !== ALL_DOMAINS_ASSUMPTION_KEY;
}

function getSignaturePreference(signature: string): number {
  if (!isVnewSignature(signature)) return 300;

  let temperature: number | null;
  try {
    temperature = parseVnewTemperature(signature);
  } catch {
    return 300;
  }

  if (temperature == null) return 0;
  if (temperature === 0) return 100;
  if (temperature != null) return 100 + temperature;
  return 300;
}

export function selectModelsAnalysisSnapshots<T extends ModelsAnalysisSnapshotCandidate>(
  snapshots: T[],
  requestedSignature: string | null,
): T[] {
  const selectedByAssumptionKey = new Map<string, T>();

  for (const snapshot of snapshots) {
    if (!isDomainSnapshot(snapshot)) continue;

    const current = selectedByAssumptionKey.get(snapshot.assumptionKey);
    if (current == null) {
      selectedByAssumptionKey.set(snapshot.assumptionKey, snapshot);
      continue;
    }

    if (requestedSignature != null) {
      continue;
    }

    const nextPreference = getSignaturePreference(snapshot.configSignature);
    const currentPreference = getSignaturePreference(current.configSignature);
    if (nextPreference < currentPreference) {
      selectedByAssumptionKey.set(snapshot.assumptionKey, snapshot);
    }
  }

  return [...selectedByAssumptionKey.values()];
}
