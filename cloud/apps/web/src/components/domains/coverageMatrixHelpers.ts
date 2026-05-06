import type { DomainAvailableSignature } from '../../api/operations/domainAnalysis';
import { preferDefaultSignature } from '@valuerank/shared';

export function parseSignatureVersion(signature: string): number | null {
  const match = signature.match(/^v(\d+)/i);
  if (!match) return null;
  const version = Number.parseInt(match[1] ?? '', 10);
  return Number.isFinite(version) ? version : null;
}

export function selectPreferredSignature(options: DomainAvailableSignature[]): string {
  return preferDefaultSignature(options) ?? '';
}
