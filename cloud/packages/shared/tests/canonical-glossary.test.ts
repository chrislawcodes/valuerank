import { describe, expect, it } from 'vitest';
import {
  CANONICAL_GLOSSARY_MAPPING_TABLE,
  CANONICAL_GLOSSARY_SECTIONS,
  CANONICAL_GLOSSARY_USAGE,
} from '../src/canonical-glossary.js';

describe('canonical-glossary', () => {
  it('includes the four glossary sections used across the product', () => {
    expect(CANONICAL_GLOSSARY_SECTIONS.map((section) => section.id)).toEqual([
      'core',
      'execution',
      'analysis',
      'deprecated',
    ]);
  });

  it('includes the canonical terminology mappings for legacy names', () => {
    expect(CANONICAL_GLOSSARY_MAPPING_TABLE).toEqual([
      {
        legacyTerm: 'definition',
        canonicalTerm: 'vignette',
        notes: 'Main Vignettes tab object',
      },
      {
        legacyTerm: 'dimension',
        canonicalTerm: 'attribute',
        notes: 'User-facing axis',
      },
      {
        legacyTerm: 'scenario',
        canonicalTerm: 'condition or narrative',
        notes: 'Resolve by meaning, not blind rename',
      },
    ]);
  });

  it('keeps usage guidance available for docs and UI surfaces', () => {
    expect(CANONICAL_GLOSSARY_USAGE).toHaveLength(3);
    expect(CANONICAL_GLOSSARY_USAGE[0]).toContain('new product docs');
  });

  it('includes preferred replacements for deprecated terms', () => {
    const deprecatedTerms = CANONICAL_GLOSSARY_SECTIONS.find((section) => section.id === 'deprecated');

    expect(deprecatedTerms?.terms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Definition', preferredTerm: 'vignette' }),
        expect.objectContaining({ name: 'Dimension', preferredTerm: 'attribute' }),
        expect.objectContaining({
          name: 'Scenario',
          preferredReplacement: 'Use vignette, condition, or narrative depending on what is actually meant.',
        }),
      ])
    );
  });
});
