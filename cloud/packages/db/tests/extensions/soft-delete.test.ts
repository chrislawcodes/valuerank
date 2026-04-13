import { describe, it, expect } from 'vitest';
import {
  SOFT_DELETABLE_MODELS,
  injectDeletedAtNull,
} from '../../src/extensions/soft-delete.js';

describe('softDeleteExtension', () => {
  describe('SOFT_DELETABLE_MODELS', () => {
    it('includes all expected models', () => {
      const expected = [
        'Definition',
        'DefinitionTag',
        'Scenario',
        'Transcript',
        'AnalysisResult',
        'AssumptionAnalysisSnapshot',
        'ProbeResult',
        'DomainEvaluation',
        'DomainEvaluationRun',
      ];
      for (const model of expected) {
        expect(SOFT_DELETABLE_MODELS.has(model)).toBe(true);
      }
      expect(SOFT_DELETABLE_MODELS.size).toBe(expected.length);
    });

    it('does not include non-soft-deletable models', () => {
      expect(SOFT_DELETABLE_MODELS.has('User')).toBe(false);
      expect(SOFT_DELETABLE_MODELS.has('Run')).toBe(false);
      expect(SOFT_DELETABLE_MODELS.has('LlmModel')).toBe(false);
      expect(SOFT_DELETABLE_MODELS.has('Domain')).toBe(false);
    });
  });

  describe('injectDeletedAtNull', () => {
    it('returns { deletedAt: null } when where is undefined', () => {
      expect(injectDeletedAtNull(undefined)).toEqual({ deletedAt: null });
    });

    it('returns { deletedAt: null } when where is null', () => {
      expect(injectDeletedAtNull(null as unknown as undefined)).toEqual({ deletedAt: null });
    });

    it('adds deletedAt: null to existing where clause', () => {
      const where = { domainId: 'abc', status: 'COMPLETED' };
      expect(injectDeletedAtNull(where)).toEqual({
        domainId: 'abc',
        status: 'COMPLETED',
        deletedAt: null,
      });
    });

    it('preserves caller-specified deletedAt (bypass)', () => {
      const where = { domainId: 'abc', deletedAt: { not: null } };
      expect(injectDeletedAtNull(where)).toEqual({
        domainId: 'abc',
        deletedAt: { not: null },
      });
    });

    it('preserves deletedAt: null (idempotent with existing manual filters)', () => {
      const where = { domainId: 'abc', deletedAt: null };
      expect(injectDeletedAtNull(where)).toEqual({
        domainId: 'abc',
        deletedAt: null,
      });
    });

    it('preserves deletedAt when set to a Date (query for deleted-at-specific-time)', () => {
      const date = new Date('2026-01-01');
      const where = { deletedAt: date };
      expect(injectDeletedAtNull(where)).toEqual({ deletedAt: date });
    });

    it('does not mutate the original where object', () => {
      const where = { domainId: 'abc' };
      const result = injectDeletedAtNull(where);
      expect(result).not.toBe(where);
      expect(where).toEqual({ domainId: 'abc' });
    });
  });
});
