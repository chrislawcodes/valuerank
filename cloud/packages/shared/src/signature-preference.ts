export type AvailableSignature = {
  signature: string;
  isVirtual: boolean;
  temperature: number | null;
  mostRecentRunAt?: Date | string | null;
};

function parseSignatureVersion(signature: string): number | null {
  const match = signature.match(/^v(\d+)/i);
  if (!match) return null;
  const version = Number.parseInt(match[1] ?? '', 10);
  return Number.isFinite(version) ? version : null;
}

function compareMostRecentRunAt(left: AvailableSignature, right: AvailableSignature): number {
  const leftTime = left.mostRecentRunAt == null ? Number.NEGATIVE_INFINITY : new Date(left.mostRecentRunAt).getTime();
  const rightTime = right.mostRecentRunAt == null ? Number.NEGATIVE_INFINITY : new Date(right.mostRecentRunAt).getTime();
  if (leftTime !== rightTime) return rightTime - leftTime;
  return 0;
}

export function preferDefaultSignature(available: AvailableSignature[]): string | null {
  if (available.length === 0) {
    return null;
  }

  const vnewDefault = available.find((option) => option.isVirtual && option.signature === 'vnewtd');
  if (vnewDefault) return vnewDefault.signature;

  const vnewT0 = available.find((option) => option.isVirtual && option.signature === 'vnewt0');
  if (vnewT0) return vnewT0.signature;

  const virtuals = available.filter((option) => option.isVirtual);
  if (virtuals.length > 0) {
    const sortedVirtuals = [...virtuals].sort(compareMostRecentRunAt);
    return sortedVirtuals[0]?.signature ?? null;
  }

  const exactSignatures = [...available].sort((left, right) => {
    const leftVersion = parseSignatureVersion(left.signature) ?? -1;
    const rightVersion = parseSignatureVersion(right.signature) ?? -1;
    if (leftVersion !== rightVersion) {
      return rightVersion - leftVersion;
    }

    if (left.temperature != null && right.temperature != null && left.temperature !== right.temperature) {
      return left.temperature - right.temperature;
    }

    if (left.temperature == null && right.temperature != null) return 1;
    if (left.temperature != null && right.temperature == null) return -1;

    return left.signature.localeCompare(right.signature);
  });

  return exactSignatures[0]?.signature ?? null;
}
