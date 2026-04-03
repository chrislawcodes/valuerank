import type { DomainAvailableSignature } from '../../api/operations/domainAnalysis';

export function parseSignatureVersion(signature: string): number | null {
  const match = signature.match(/^v(\d+)/i);
  if (!match) return null;
  const version = Number.parseInt(match[1] ?? '', 10);
  return Number.isFinite(version) ? version : null;
}

export function selectPreferredSignature(options: DomainAvailableSignature[]): string {
  // Virtual signatures ("Latest @ X") always beat exact versioned ones.
  // Among virtuals, prefer default temperature (vnewtd) then temp-zero (vnewt0).
  const virtualDefault = options.find((o) => o.isVirtual && o.signature === 'vnewtd');
  if (virtualDefault) return virtualDefault.signature;
  const virtualT0 = options.find((o) => o.isVirtual && o.signature === 'vnewt0');
  if (virtualT0) return virtualT0.signature;
  const anyVirtual = options.find((o) => o.isVirtual);
  if (anyVirtual) return anyVirtual.signature;

  // Fall back to highest-version exact signature
  const sorted = [...options].sort((left, right) => {
    const leftVersion = parseSignatureVersion(left.signature) ?? -1;
    const rightVersion = parseSignatureVersion(right.signature) ?? -1;
    if (leftVersion !== rightVersion) return rightVersion - leftVersion;
    return right.signature.localeCompare(left.signature);
  });
  return sorted[0]?.signature ?? '';
}
