import { describe, expect, it } from 'vitest';
import {
  formatVnewLabel,
  formatVnewSignature,
  isVnewSignature,
  parseVnewTemperature,
} from '../../src/utils/vnew-signature.js';

describe('vnew-signature utils', () => {
  it('formats signatures', () => {
    expect(formatVnewSignature(null)).toBe('vnewtd');
    expect(formatVnewSignature(0)).toBe('vnewt0');
    expect(formatVnewSignature(0.7)).toBe('vnewt0.7');
    expect(formatVnewSignature(1.25)).toBe('vnewt1.25');
  });

  it('parses signatures', () => {
    expect(parseVnewTemperature('vnewtd')).toBeNull();
    expect(parseVnewTemperature('vnewt0')).toBe(0);
    expect(parseVnewTemperature('vnewt0.7')).toBeCloseTo(0.7, 8);
  });

  it('detects vnew token', () => {
    expect(isVnewSignature('vnewtd')).toBe(true);
    expect(isVnewSignature('vnewt0')).toBe(true);
    expect(isVnewSignature('v2t0')).toBe(false);
    expect(isVnewSignature(null)).toBe(false);
  });

  it('throws for invalid vnew signatures', () => {
    expect(() => parseVnewTemperature('v2t0')).toThrow();
    expect(() => parseVnewTemperature('vnewtabc')).toThrow();
  });

  it('formats labels', () => {
    expect(formatVnewLabel(null)).toBe('Latest @ default');
    expect(formatVnewLabel(0)).toBe('Latest @ t=0');
    expect(formatVnewLabel(0.75)).toBe('Latest @ t=0.75');
  });
});
