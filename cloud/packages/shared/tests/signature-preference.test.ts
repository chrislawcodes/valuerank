import { describe, expect, it } from 'vitest';
import { preferDefaultSignature, type AvailableSignature } from '../src/signature-preference.js';

describe('preferDefaultSignature', () => {
  it('returns null for empty input', () => {
    expect(preferDefaultSignature([])).toBeNull();
  });

  it('prefers vnewtd when available', () => {
    const options: AvailableSignature[] = [
      { signature: 'v3t0.7', isVirtual: false, temperature: 0.7 },
      { signature: 'vnewtd', isVirtual: true, temperature: null },
      { signature: 'vnewt0', isVirtual: true, temperature: 0 },
    ];

    expect(preferDefaultSignature(options)).toBe('vnewtd');
  });

  it('prefers vnewt0 when vnewtd is absent', () => {
    const options: AvailableSignature[] = [
      { signature: 'vnewt0', isVirtual: true, temperature: 0 },
      { signature: 'v2t0', isVirtual: false, temperature: 0 },
    ];

    expect(preferDefaultSignature(options)).toBe('vnewt0');
  });

  it('falls back to the highest-version exact signature', () => {
    const options: AvailableSignature[] = [
      { signature: 'v2t0.7', isVirtual: false, temperature: 0.7 },
      { signature: 'v5t0', isVirtual: false, temperature: 0 },
      { signature: 'v4t1', isVirtual: false, temperature: 1 },
    ];

    expect(preferDefaultSignature(options)).toBe('v5t0');
  });
});
