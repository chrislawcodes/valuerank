import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useScenarioPreview } from '../../src/hooks/useScenarioPreview';
import type { DefinitionContent } from '../../src/api/operations/definitions';

function createMockContent(overrides: Partial<DefinitionContent> = {}): DefinitionContent {
  return {
    schema_version: 1,
    preamble: 'Test preamble',
    template: 'You encounter a [situation] involving [actor].',
    dimensions: [
      {
        name: 'situation',
        levels: [
          { score: 1, label: 'minor' },
          { score: 2, label: 'moderate' },
          { score: 3, label: 'severe' },
        ],
      },
      {
        name: 'actor',
        levels: [
          { score: 1, label: 'stranger' },
          { score: 2, label: 'friend' },
        ],
      },
    ],
    ...overrides,
  };
}

describe('useScenarioPreview', () => {
  it('should return error when content is null', () => {
    const { result } = renderHook(() => useScenarioPreview(null));

    expect(result.current.error).toBe('No definition content provided');
    expect(result.current.scenarios).toEqual([]);
    expect(result.current.totalCount).toBe(0);
  });

  it('should return error when template is empty', () => {
    const content = createMockContent({ template: '' });
    const { result } = renderHook(() => useScenarioPreview(content));

    expect(result.current.error).toBe('Template is empty');
  });

  it('should return error when dimensions are empty', () => {
    const content = createMockContent({ dimensions: [] });
    const { result } = renderHook(() => useScenarioPreview(content));

    expect(result.current.error).toBe('No dimensions defined');
  });

  it('should return error when a dimension has no levels', () => {
    const content = createMockContent({
      dimensions: [{ name: 'empty', levels: [] }],
    });
    const { result } = renderHook(() => useScenarioPreview(content));

    expect(result.current.error).toBe('Dimension "empty" has no levels');
  });

  it('should calculate correct total count (cartesian product)', () => {
    const content = createMockContent();
    const { result } = renderHook(() => useScenarioPreview(content));

    // 3 situation levels * 2 actor levels = 6 combinations
    expect(result.current.totalCount).toBe(6);
    expect(result.current.error).toBeNull();
  });

  it('should generate scenarios with filled templates', () => {
    const content = createMockContent();
    const { result } = renderHook(() => useScenarioPreview(content));

    expect(result.current.scenarios.length).toBeGreaterThan(0);

    // First scenario should have minor + stranger
    const firstScenario = result.current.scenarios[0];
    expect(firstScenario.filledTemplate).toContain('minor');
    expect(firstScenario.filledTemplate).toContain('stranger');
    expect(firstScenario.filledTemplate).not.toContain('[situation]');
    expect(firstScenario.filledTemplate).not.toContain('[actor]');
  });

  it('should limit scenarios to maxSamples', () => {
    const content = createMockContent();
    const { result } = renderHook(() => useScenarioPreview(content, 2));

    expect(result.current.displayedCount).toBe(2);
    expect(result.current.totalCount).toBe(6);
  });

  it('should include dimension values in scenarios', () => {
    const content = createMockContent();
    const { result } = renderHook(() => useScenarioPreview(content));

    const firstScenario = result.current.scenarios[0];
    expect(firstScenario.dimensionValues).toHaveLength(2);
    expect(firstScenario.dimensionValues[0].name).toBe('situation');
    expect(firstScenario.dimensionValues[1].name).toBe('actor');
  });

  it('should use options when available', () => {
    const content = createMockContent({
      dimensions: [
        {
          name: 'situation',
          levels: [
            { score: 1, label: 'minor', options: ['a small incident'] },
          ],
        },
      ],
      template: 'You see [situation].',
    });

    const { result } = renderHook(() => useScenarioPreview(content));

    expect(result.current.scenarios[0].filledTemplate).toContain('a small incident');
  });

  it('should handle single dimension correctly', () => {
    const content = createMockContent({
      dimensions: [
        {
          name: 'severity',
          levels: [
            { score: 1, label: 'low' },
            { score: 2, label: 'medium' },
            { score: 3, label: 'high' },
          ],
        },
      ],
      template: 'Severity is [severity].',
    });

    const { result } = renderHook(() => useScenarioPreview(content));

    expect(result.current.totalCount).toBe(3);
    expect(result.current.scenarios).toHaveLength(3);
  });

  it('should assign sequential ids to scenarios', () => {
    const content = createMockContent();
    const { result } = renderHook(() => useScenarioPreview(content));

    expect(result.current.scenarios[0].id).toBe(1);
    expect(result.current.scenarios[1].id).toBe(2);
    expect(result.current.scenarios[2].id).toBe(3);
  });
});
