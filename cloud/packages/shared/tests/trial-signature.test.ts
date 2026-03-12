import { describe, expect, it } from 'vitest';
import {
  formatTrialSignature,
  formatVnewLabel,
  formatVnewSignature,
  isVnewSignature,
  parseVnewTemperature,
} from '../src/trial-signature.js';
import {
  formatTrialSignature as exportedFormatTrialSignature,
  formatVnewLabel as exportedFormatVnewLabel,
  formatVnewSignature as exportedFormatVnewSignature,
  isVnewSignature as exportedIsVnewSignature,
  parseVnewTemperature as exportedParseVnewTemperature,
} from '@valuerank/shared/trial-signature';

describe('formatTrialSignature', () => {
  it('formats zero temperature explicitly', () => {
    expect(formatTrialSignature(2, 0)).toBe('v2t0');
  });

  it('formats default temperature token', () => {
    expect(formatTrialSignature(3, null)).toBe('v3td');
  });

  it('formats unknown version token', () => {
    expect(formatTrialSignature(null, 0.7)).toBe('v?t0.7');
  });

  it('trims trailing zeros', () => {
    expect(formatTrialSignature(2, 1.25)).toBe('v2t1.25');
  });

  it('treats non-finite temperature as default', () => {
    expect(formatTrialSignature(4, Number.NaN)).toBe('v4td');
  });

  it('formats fully unknown signature tokens', () => {
    expect(formatTrialSignature(null, null)).toBe('v?td');
  });
});

describe('vnew signature helpers', () => {
  it('formats vnew signatures', () => {
    expect(formatVnewSignature(null)).toBe('vnewtd');
    expect(formatVnewSignature(0)).toBe('vnewt0');
    expect(formatVnewSignature(0.7)).toBe('vnewt0.7');
    expect(formatVnewSignature(1.25)).toBe('vnewt1.25');
  });

  it('parses vnew signatures', () => {
    expect(parseVnewTemperature('vnewtd')).toBeNull();
    expect(parseVnewTemperature('vnewt0')).toBe(0);
    expect(parseVnewTemperature('vnewt0.7')).toBeCloseTo(0.7, 8);
    expect(parseVnewTemperature(formatVnewSignature(0.7))).toBeCloseTo(0.7, 8);
  });

  it('detects vnew signatures', () => {
    expect(isVnewSignature('vnewtd')).toBe(true);
    expect(isVnewSignature('vnewt0')).toBe(true);
    expect(isVnewSignature('v2t0')).toBe(false);
    expect(isVnewSignature(null)).toBe(false);
    expect(isVnewSignature(undefined)).toBe(false);
  });

  it('throws on invalid vnew signatures', () => {
    expect(() => parseVnewTemperature('v2t0')).toThrow();
    expect(() => parseVnewTemperature('vnewt')).toThrow();
    expect(() => parseVnewTemperature('vnewtabc')).toThrow();
  });

  it('formats vnew labels', () => {
    expect(formatVnewLabel(null)).toBe('Latest @ default');
    expect(formatVnewLabel(0)).toBe('Latest @ t=0');
    expect(formatVnewLabel(0.75)).toBe('Latest @ t=0.75');
  });
});

describe('package export surface', () => {
  it('matches the source helper behavior', () => {
    expect(exportedFormatTrialSignature(2, 0)).toBe(formatTrialSignature(2, 0));
    expect(exportedFormatTrialSignature(null, null)).toBe(formatTrialSignature(null, null));
    expect(exportedFormatVnewSignature(0.7)).toBe(formatVnewSignature(0.7));
    expect(exportedFormatVnewLabel(0.75)).toBe(formatVnewLabel(0.75));
    expect(exportedIsVnewSignature('vnewt0')).toBe(isVnewSignature('vnewt0'));
    expect(exportedParseVnewTemperature('vnewt0.7')).toBe(parseVnewTemperature('vnewt0.7'));
  });
});
