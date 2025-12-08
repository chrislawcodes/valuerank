/**
 * Test Fixtures for Import Services
 *
 * Provides consistent test data for import service tests.
 */

import type { DefinitionContent } from '@valuerank/db';
import type { ParsedMDDefinition } from '../../../src/services/import/types.js';

// ============================================================================
// VALID MD FIXTURES
// ============================================================================

/**
 * Valid MD file content with all sections.
 */
export const VALID_MD_FULL = `---
name: complete-definition
base_id: scenario_complete
category: FullTest
---

# Preamble

You are evaluating a complex ethical scenario involving multiple stakeholders.

# Template

Consider this situation: [Stakeholder] faces [Dilemma] with [Outcome] at stake.

# Dimensions

## Stakeholder

| Score | Label | Options |
|-------|-------|---------|
| 1 | Individual | single person, lone actor |
| 2 | Group | small team, community |
| 3 | Society | entire population, all citizens |

## Dilemma

| Score | Label | Options |
|-------|-------|---------|
| 1 | Minor | small inconvenience, slight issue |
| 2 | Moderate | significant challenge, real problem |
| 3 | Major | crisis level, life-changing |

# Matching Rules

Individual stakeholders should not face society-level outcomes.
`;

/**
 * Expected parsed result for VALID_MD_FULL.
 */
export const EXPECTED_PARSED_FULL: ParsedMDDefinition = {
  name: 'complete-definition',
  baseId: 'scenario_complete',
  category: 'FullTest',
  content: {
    schema_version: 1,
    preamble: 'You are evaluating a complex ethical scenario involving multiple stakeholders.',
    template: 'Consider this situation: [Stakeholder] faces [Dilemma] with [Outcome] at stake.',
    dimensions: [
      {
        name: 'Stakeholder',
        levels: [
          { score: 1, label: 'Individual', options: ['single person', 'lone actor'] },
          { score: 2, label: 'Group', options: ['small team', 'community'] },
          { score: 3, label: 'Society', options: ['entire population', 'all citizens'] },
        ],
      },
      {
        name: 'Dilemma',
        levels: [
          { score: 1, label: 'Minor', options: ['small inconvenience', 'slight issue'] },
          { score: 2, label: 'Moderate', options: ['significant challenge', 'real problem'] },
          { score: 3, label: 'Major', options: ['crisis level', 'life-changing'] },
        ],
      },
    ],
    matching_rules: 'Individual stakeholders should not face society-level outcomes.',
  },
};

/**
 * Valid MD without matching rules (optional section).
 */
export const VALID_MD_NO_RULES = `---
name: simple-definition
base_id: scenario_simple
---

# Preamble

Simple test preamble.

# Template

Simple [Test] template.

# Dimensions

## Test

| Score | Label | Options |
|-------|-------|---------|
| 1 | Low | low option |
| 2 | High | high option |
`;

/**
 * Valid MD without frontmatter category.
 */
export const VALID_MD_NO_CATEGORY = `---
name: no-category-def
base_id: scenario_nocat
---

# Preamble

Preamble text.

# Template

Template with [Dim].

# Dimensions

## Dim

| Score | Label | Options |
|-------|-------|---------|
| 1 | A | option a |
| 2 | B | option b |
`;

// ============================================================================
// INVALID MD FIXTURES
// ============================================================================

/**
 * MD missing preamble section.
 */
export const INVALID_MD_NO_PREAMBLE = `---
name: missing-preamble
---

# Template

Template text.

# Dimensions

## Dim

| Score | Label | Options |
|-------|-------|---------|
| 1 | A | opt |
`;

/**
 * MD missing template section.
 */
export const INVALID_MD_NO_TEMPLATE = `---
name: missing-template
---

# Preamble

Preamble text.

# Dimensions

## Dim

| Score | Label | Options |
|-------|-------|---------|
| 1 | A | opt |
`;

/**
 * MD missing dimensions section.
 */
export const INVALID_MD_NO_DIMENSIONS = `---
name: missing-dimensions
---

# Preamble

Preamble text.

# Template

Template text.
`;

/**
 * MD with malformed dimension table.
 */
export const INVALID_MD_BAD_TABLE = `---
name: bad-table
---

# Preamble

Preamble.

# Template

Template.

# Dimensions

## BadDim

This is not a table format
just plain text
`;

/**
 * MD with no frontmatter.
 */
export const INVALID_MD_NO_FRONTMATTER = `# Preamble

Preamble text.

# Template

Template text.

# Dimensions

## Dim

| Score | Label | Options |
|-------|-------|---------|
| 1 | A | opt |
`;

// ============================================================================
// EDGE CASE FIXTURES
// ============================================================================

/**
 * MD with empty dimensions (valid but edge case).
 */
export const MD_EMPTY_DIMENSIONS = `---
name: empty-dimensions
---

# Preamble

Preamble text.

# Template

Template without placeholders.

# Dimensions
`;

/**
 * MD with special characters that need escaping.
 */
export const MD_SPECIAL_CHARS = `---
name: special-chars
---

# Preamble

Content with "quotes" and | pipes | and > arrows.

# Template

Template with [Dimension] and special chars: "quoted".

# Dimensions

## Dimension

| Score | Label | Options |
|-------|-------|---------|
| 1 | "Label One" | option, with, commas |
| 2 | Label Two | simple option |
`;

/**
 * MD with very long content (stress test).
 */
export const MD_LONG_CONTENT = `---
name: long-content
---

# Preamble

${'This is a very long preamble. '.repeat(100)}

# Template

${'Long template content. '.repeat(50)}[Dim]

# Dimensions

## Dim

| Score | Label | Options |
|-------|-------|---------|
| 1 | A | opt1 |
| 2 | B | opt2 |
`;
