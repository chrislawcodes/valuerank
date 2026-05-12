import { describe, expect, it } from 'vitest';
import {
  buildDomainAnalysisDomainSetId,
  normalizeDomainIds,
  resolveDomainAnalysisSelection,
} from '../../../src/services/analysis/domain-analysis-scope.js';

describe('domain-analysis scope selection', () => {
  it('normalizes selected domain IDs and builds stable selected-domain-set IDs', () => {
    const ids = ['domain-b', 'domain-a', 'domain-b', ''];

    expect(normalizeDomainIds(ids)).toEqual(['domain-a', 'domain-b']);
    expect(buildDomainAnalysisDomainSetId(ids)).toBe(buildDomainAnalysisDomainSetId(['domain-a', 'domain-b']));
  });

  it('treats multiple selected domains as a selected-domain-set scope', () => {
    const selection = resolveDomainAnalysisSelection({ domainIds: ['domain-b', 'domain-a'] });

    expect(selection.scope).toBe('DOMAIN_SET');
    expect(selection.domainIds).toEqual(['domain-a', 'domain-b']);
    expect(selection.domainId).toMatch(/^domain-set:/);
  });
});
