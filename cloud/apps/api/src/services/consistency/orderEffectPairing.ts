// Narrow view of the canonical decision — only the fields this helper actually
// reads. Callers pass a value-pair object that at minimum exposes these
// properties; they may pass the repo's richer CanonicalDecision from
// graphql/queries/domain/decision-model-types.ts since extra properties are
// ignored.
type CanonicalDecisionView = {
  favoredValueKey?: string | null;
  opposedValueKey?: string | null;
  direction?: string | null;
  strength?: string | null;
};

export type OrderEffectTranscript = {
  scenarioId: string | null;
  decisionModelV2?: {
    canonical?: CanonicalDecisionView | null;
  } | null;
};

export type OrderEffectSummary = {
  samePct: number;
  flippedPct: number;
  noisyPct: number;
  notApplicable: boolean;
};

function reverseSignature(signature: string): string {
  const separator = signature.indexOf('::');
  if (separator < 0) {
    return signature === 'favor_first' ? 'favor_second' : signature === 'favor_second' ? 'favor_first' : signature;
  }

  const left = signature.slice(0, separator);
  const right = signature.slice(separator + 2);
  return `${right}::${left}`;
}

function getDecisionSignature(transcript: OrderEffectTranscript): string | null {
  const canonical = transcript.decisionModelV2?.canonical;
  if (!canonical) {
    return null;
  }

  if (canonical.strength === 'neutral' || canonical.direction === 'neutral') {
    return 'neutral';
  }

  if (
    typeof canonical.favoredValueKey === 'string'
    && canonical.favoredValueKey.trim() !== ''
    && typeof canonical.opposedValueKey === 'string'
    && canonical.opposedValueKey.trim() !== ''
  ) {
    return `${canonical.favoredValueKey}::${canonical.opposedValueKey}`;
  }

  if (canonical.direction === 'favor_first' || canonical.direction === 'favor_second') {
    return canonical.direction;
  }

  return null;
}

function classifyPair(primary: OrderEffectTranscript, companion: OrderEffectTranscript): 'same' | 'flipped' | 'noisy' {
  const primarySignature = getDecisionSignature(primary);
  const companionSignature = getDecisionSignature(companion);

  if (primarySignature === null || companionSignature === null) {
    return 'noisy';
  }
  if (primarySignature === 'neutral' || companionSignature === 'neutral') {
    return 'noisy';
  }
  if (primarySignature === companionSignature) {
    return 'same';
  }
  if (reverseSignature(primarySignature) === companionSignature) {
    return 'flipped';
  }

  return 'noisy';
}

function roundPct(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildSummary(same: number, flipped: number, noisy: number, total: number): OrderEffectSummary {
  if (total <= 0) {
    return {
      samePct: 0,
      flippedPct: 0,
      noisyPct: 0,
      notApplicable: true,
    };
  }

  const samePct = roundPct((same / total) * 100);
  const flippedPct = roundPct((flipped / total) * 100);
  const noisyPct = roundPct(100 - samePct - flippedPct);

  return {
    samePct,
    flippedPct,
    noisyPct,
    notApplicable: false,
  };
}

export function computeOrderEffect(
  primaryTranscripts: OrderEffectTranscript[],
  companionTranscripts: OrderEffectTranscript[],
): OrderEffectSummary {
  if (primaryTranscripts.length === 0 || companionTranscripts.length === 0) {
    return {
      samePct: 0,
      flippedPct: 0,
      noisyPct: 0,
      notApplicable: true,
    };
  }

  const primaryByScenario = new Map<string, OrderEffectTranscript>();
  const companionByScenario = new Map<string, OrderEffectTranscript>();

  for (const transcript of primaryTranscripts) {
    if (typeof transcript.scenarioId === 'string' && transcript.scenarioId.trim() !== '') {
      primaryByScenario.set(transcript.scenarioId, transcript);
    }
  }
  for (const transcript of companionTranscripts) {
    if (typeof transcript.scenarioId === 'string' && transcript.scenarioId.trim() !== '') {
      companionByScenario.set(transcript.scenarioId, transcript);
    }
  }

  let same = 0;
  let flipped = 0;
  let noisy = 0;
  let pairedCount = 0;

  const sharedScenarioIds = [...primaryByScenario.keys()].filter((scenarioId) => companionByScenario.has(scenarioId));
  if (sharedScenarioIds.length > 0) {
    for (const scenarioId of sharedScenarioIds) {
      const primary = primaryByScenario.get(scenarioId);
      const companion = companionByScenario.get(scenarioId);
      if (!primary || !companion) {
        continue;
      }
      pairedCount += 1;
      const classification = classifyPair(primary, companion);
      if (classification === 'same') same += 1;
      else if (classification === 'flipped') flipped += 1;
      else noisy += 1;
    }
    return buildSummary(same, flipped, noisy, pairedCount);
  }

  const pairCount = Math.min(primaryTranscripts.length, companionTranscripts.length);
  for (let index = 0; index < pairCount; index += 1) {
    const primary = primaryTranscripts[index];
    const companion = companionTranscripts[index];
    if (!primary || !companion) {
      continue;
    }
    pairedCount += 1;
    const classification = classifyPair(primary, companion);
    if (classification === 'same') same += 1;
    else if (classification === 'flipped') flipped += 1;
    else noisy += 1;
  }

  return buildSummary(same, flipped, noisy, pairedCount);
}
