export const DOMAIN_ANALYSIS_VALUE_KEYS = [
  'Self_Direction_Action',
  'Universalism_Nature',
  'Benevolence_Dependability',
  'Security_Personal',
  'Power_Dominance',
  'Achievement',
  'Tradition',
  'Stimulation',
  'Hedonism',
  'Conformity_Interpersonal',
] as const;

export type DomainAnalysisValueKey = (typeof DOMAIN_ANALYSIS_VALUE_KEYS)[number];

export type DomainAnalysisValuePair = {
  valueA: DomainAnalysisValueKey;
  valueB: DomainAnalysisValueKey;
};

function isDomainAnalysisValueKey(value: string): value is DomainAnalysisValueKey {
  return (DOMAIN_ANALYSIS_VALUE_KEYS as readonly string[]).includes(value);
}

export function toPascalCaseKey(name: string): string {
  return name
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('_');
}

export function extractValuePair(content: unknown): DomainAnalysisValuePair | null {
  if (content === null || typeof content !== 'object' || Array.isArray(content)) return null;
  const dims = (content as { dimensions?: unknown }).dimensions;
  if (!Array.isArray(dims) || dims.length !== 2) return null;
  const nameA =
    typeof (dims[0] as { name?: unknown }).name === 'string'
      ? (dims[0] as { name: string }).name
      : null;
  const nameB =
    typeof (dims[1] as { name?: unknown }).name === 'string'
      ? (dims[1] as { name: string }).name
      : null;
  if (nameA == null || nameB == null) return null;
  const normalizedA = toPascalCaseKey(nameA);
  const normalizedB = toPascalCaseKey(nameB);
  if (!isDomainAnalysisValueKey(normalizedA) || !isDomainAnalysisValueKey(normalizedB)) return null;
  return { valueA: normalizedA, valueB: normalizedB };
}
