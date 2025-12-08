import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getEnv, getEnvRequired, getEnvOptional } from '../src/env.js';

describe('env utilities', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getEnv', () => {
    it('returns environment variable when set', () => {
      process.env.TEST_VAR = 'test_value';
      expect(getEnv('TEST_VAR')).toBe('test_value');
    });

    it('returns default value when not set', () => {
      delete process.env.TEST_VAR;
      expect(getEnv('TEST_VAR', 'default')).toBe('default');
    });

    it('throws when required and not set', () => {
      delete process.env.TEST_VAR;
      expect(() => getEnv('TEST_VAR')).toThrow('Required environment variable TEST_VAR is not set');
    });
  });

  describe('getEnvRequired', () => {
    it('returns value when set', () => {
      process.env.REQUIRED_VAR = 'required_value';
      expect(getEnvRequired('REQUIRED_VAR')).toBe('required_value');
    });

    it('throws when not set', () => {
      delete process.env.REQUIRED_VAR;
      expect(() => getEnvRequired('REQUIRED_VAR')).toThrow(
        'Required environment variable REQUIRED_VAR is not set'
      );
    });
  });

  describe('getEnvOptional', () => {
    it('returns value when set', () => {
      process.env.OPTIONAL_VAR = 'optional_value';
      expect(getEnvOptional('OPTIONAL_VAR')).toBe('optional_value');
    });

    it('returns undefined when not set', () => {
      delete process.env.OPTIONAL_VAR;
      expect(getEnvOptional('OPTIONAL_VAR')).toBeUndefined();
    });

    it('returns empty string when set to empty', () => {
      process.env.OPTIONAL_VAR = '';
      expect(getEnvOptional('OPTIONAL_VAR')).toBe('');
    });
  });
});
