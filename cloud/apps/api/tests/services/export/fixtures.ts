/**
 * Test Fixtures for Export Services
 *
 * Provides consistent test data for export service tests.
 */

import type { Definition, Scenario, Tag } from '@prisma/client';
import type { DefinitionContent, ScenarioContent } from '@valuerank/db';
import type { MDDefinition } from '../../../src/services/export/types.js';

// ============================================================================
// DEFINITION FIXTURES
// ============================================================================

/**
 * Sample definition content with two dimensions.
 */
export const SAMPLE_DEFINITION_CONTENT: DefinitionContent = {
  schema_version: 1,
  preamble: 'You are an AI assistant evaluating ethical dilemmas.',
  template: 'In this scenario, you must choose between [Freedom] and [Safety].',
  dimensions: [
    {
      name: 'Freedom',
      levels: [
        { score: 1, label: 'Low', options: ['minimal autonomy', 'restricted choice'] },
        { score: 2, label: 'Medium', options: ['some freedom', 'limited options'] },
        { score: 3, label: 'High', options: ['full autonomy', 'complete freedom'] },
      ],
    },
    {
      name: 'Safety',
      levels: [
        { score: 1, label: 'Low', options: ['high risk', 'dangerous'] },
        { score: 2, label: 'Medium', options: ['moderate risk', 'some caution'] },
        { score: 3, label: 'High', options: ['very safe', 'minimal risk'] },
      ],
    },
  ],
  matching_rules: 'Avoid extreme combinations.',
};

/**
 * Sample definition entity.
 */
export const SAMPLE_DEFINITION: Definition = {
  id: 'def-123',
  parentId: null,
  name: 'test-freedom-safety',
  content: SAMPLE_DEFINITION_CONTENT as unknown as Record<string, unknown>,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  lastAccessedAt: null,
  deletedAt: null,
};

/**
 * Sample tag entity.
 */
export const SAMPLE_TAG: Tag = {
  id: 'tag-ethics',
  name: 'Ethics',
  createdAt: new Date('2024-01-01T00:00:00Z'),
};

/**
 * Sample MD definition (devtool format).
 */
export const SAMPLE_MD_DEFINITION: MDDefinition = {
  name: 'test-freedom-safety',
  base_id: 'scenario_001',
  category: 'Ethics',
  preamble: 'You are an AI assistant evaluating ethical dilemmas.',
  template: 'In this scenario, you must choose between [Freedom] and [Safety].',
  dimensions: [
    {
      name: 'Freedom',
      values: [
        { score: 1, label: 'Low', options: ['minimal autonomy', 'restricted choice'] },
        { score: 2, label: 'Medium', options: ['some freedom', 'limited options'] },
        { score: 3, label: 'High', options: ['full autonomy', 'complete freedom'] },
      ],
    },
    {
      name: 'Safety',
      values: [
        { score: 1, label: 'Low', options: ['high risk', 'dangerous'] },
        { score: 2, label: 'Medium', options: ['moderate risk', 'some caution'] },
        { score: 3, label: 'High', options: ['very safe', 'minimal risk'] },
      ],
    },
  ],
  matchingRules: 'Avoid extreme combinations.',
};

// ============================================================================
// SCENARIO FIXTURES
// ============================================================================

/**
 * Sample scenario content.
 */
export const SAMPLE_SCENARIO_CONTENT: ScenarioContent = {
  schema_version: 1,
  prompt: 'In this scenario, you must choose between minimal autonomy and high risk.',
  dimension_values: {
    Freedom: 'minimal autonomy',
    Safety: 'high risk',
  },
};

/**
 * Sample scenario entity.
 */
export const SAMPLE_SCENARIO: Scenario = {
  id: 'scn-001',
  definitionId: 'def-123',
  name: 'scenario_001_Freedom1_Safety1',
  content: SAMPLE_SCENARIO_CONTENT as unknown as Record<string, unknown>,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  deletedAt: null,
};

/**
 * Multiple scenarios for YAML export testing.
 */
export const SAMPLE_SCENARIOS: Scenario[] = [
  {
    id: 'scn-001',
    definitionId: 'def-123',
    name: 'scenario_001_Freedom1_Safety1',
    content: {
      schema_version: 1,
      prompt: 'Choose between minimal autonomy and high risk.',
      dimension_values: { Freedom: 'minimal autonomy', Safety: 'high risk' },
    } as unknown as Record<string, unknown>,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    deletedAt: null,
  },
  {
    id: 'scn-002',
    definitionId: 'def-123',
    name: 'scenario_001_Freedom3_Safety3',
    content: {
      schema_version: 1,
      prompt: 'Choose between full autonomy and minimal risk.',
      dimension_values: { Freedom: 'full autonomy', Safety: 'minimal risk' },
    } as unknown as Record<string, unknown>,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    deletedAt: null,
  },
];

// ============================================================================
// EXPECTED OUTPUT FIXTURES
// ============================================================================

/**
 * Expected MD output for SAMPLE_MD_DEFINITION.
 */
export const EXPECTED_MD_OUTPUT = `---
name: test-freedom-safety
base_id: scenario_001
category: Ethics
---

# Preamble

You are an AI assistant evaluating ethical dilemmas.

# Template

In this scenario, you must choose between [Freedom] and [Safety].

# Dimensions

## Freedom

| Score | Label | Options |
|-------|-------|---------|
| 1 | Low | minimal autonomy, restricted choice |
| 2 | Medium | some freedom, limited options |
| 3 | High | full autonomy, complete freedom |

## Safety

| Score | Label | Options |
|-------|-------|---------|
| 1 | Low | high risk, dangerous |
| 2 | Medium | moderate risk, some caution |
| 3 | High | very safe, minimal risk |

# Matching Rules

Avoid extreme combinations.
`;

/**
 * Sample MD content for import testing (valid).
 */
export const VALID_MD_INPUT = `---
name: imported-definition
base_id: scenario_test
category: Testing
---

# Preamble

Test preamble content.

# Template

Test template with [Dimension1].

# Dimensions

## Dimension1

| Score | Label | Options |
|-------|-------|---------|
| 1 | Low | option1 |
| 2 | High | option2 |
`;

/**
 * Sample MD content with missing sections (invalid).
 */
export const INVALID_MD_MISSING_TEMPLATE = `---
name: invalid-definition
---

# Preamble

Test preamble.

# Dimensions

## Dimension1

| Score | Label | Options |
|-------|-------|---------|
| 1 | Low | option1 |
`;

/**
 * Sample MD with special characters for escaping tests.
 */
export const MD_WITH_SPECIAL_CHARS = `---
name: special-chars-test
base_id: scenario_special
category: Test | Escape
---

# Preamble

Content with | pipe and > arrow.

# Template

Template with [Dim1] placeholder.

# Dimensions

## Dim1

| Score | Label | Options |
|-------|-------|---------|
| 1 | "Quoted" | option with, comma |
| 2 | Normal | plain option |
`;
