/**
 * useComparisonState Hook Tests
 *
 * Tests for URL-based comparison state management.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useComparisonState } from '../../src/hooks/useComparisonState';

function createWrapper(initialPath = '/compare') {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return createElement(
      MemoryRouter,
      { initialEntries: [initialPath] },
      createElement(
        Routes,
        {},
        createElement(Route, { path: '/compare', element: children })
      )
    );
  };
}

describe('useComparisonState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should parse empty URL params', () => {
      const { result } = renderHook(() => useComparisonState(), {
        wrapper: createWrapper('/compare'),
      });

      expect(result.current.selectedRunIds).toEqual([]);
      expect(result.current.visualization).toBe('overview');
      expect(result.current.filters.displayMode).toBe('overlay');
      expect(result.current.filters.model).toBeUndefined();
      expect(result.current.filters.value).toBeUndefined();
    });

    it('should parse run IDs from URL', () => {
      const { result } = renderHook(() => useComparisonState(), {
        wrapper: createWrapper('/compare?runs=id1,id2,id3'),
      });

      expect(result.current.selectedRunIds).toEqual(['id1', 'id2', 'id3']);
    });

    it('should parse visualization from URL', () => {
      const { result } = renderHook(() => useComparisonState(), {
        wrapper: createWrapper('/compare?viz=decisions'),
      });

      expect(result.current.visualization).toBe('decisions');
    });

    it('should parse display mode from URL', () => {
      const { result } = renderHook(() => useComparisonState(), {
        wrapper: createWrapper('/compare?display=side-by-side'),
      });

      expect(result.current.filters.displayMode).toBe('side-by-side');
    });

    it('should parse model filter from URL', () => {
      const { result } = renderHook(() => useComparisonState(), {
        wrapper: createWrapper('/compare?model=gpt-4o'),
      });

      expect(result.current.filters.model).toBe('gpt-4o');
    });

    it('should parse value filter from URL', () => {
      const { result } = renderHook(() => useComparisonState(), {
        wrapper: createWrapper('/compare?value=Freedom'),
      });

      expect(result.current.filters.value).toBe('Freedom');
    });

    it('should default to overview for invalid visualization', () => {
      const { result } = renderHook(() => useComparisonState(), {
        wrapper: createWrapper('/compare?viz=invalid'),
      });

      expect(result.current.visualization).toBe('overview');
    });

    it('should limit run IDs to max 10', () => {
      const ids = Array.from({ length: 15 }, (_, i) => `id${i}`);
      const { result } = renderHook(() => useComparisonState(), {
        wrapper: createWrapper(`/compare?runs=${ids.join(',')}`),
      });

      expect(result.current.selectedRunIds).toHaveLength(10);
    });

    it('should handle empty run ID in comma-separated list', () => {
      const { result } = renderHook(() => useComparisonState(), {
        wrapper: createWrapper('/compare?runs=id1,,id2'),
      });

      expect(result.current.selectedRunIds).toEqual(['id1', 'id2']);
    });
  });

  describe('setSelectedRunIds', () => {
    it('should update selected run IDs', () => {
      const { result } = renderHook(() => useComparisonState(), {
        wrapper: createWrapper('/compare'),
      });

      act(() => {
        result.current.setSelectedRunIds(['run-1', 'run-2']);
      });

      expect(result.current.selectedRunIds).toEqual(['run-1', 'run-2']);
    });

    it('should limit to 10 runs', () => {
      const { result } = renderHook(() => useComparisonState(), {
        wrapper: createWrapper('/compare'),
      });

      const ids = Array.from({ length: 15 }, (_, i) => `run-${i}`);
      act(() => {
        result.current.setSelectedRunIds(ids);
      });

      expect(result.current.selectedRunIds).toHaveLength(10);
    });
  });

  describe('toggleRunSelection', () => {
    it('should add run when not selected', () => {
      const { result } = renderHook(() => useComparisonState(), {
        wrapper: createWrapper('/compare?runs=run-1'),
      });

      act(() => {
        result.current.toggleRunSelection('run-2');
      });

      expect(result.current.selectedRunIds).toContain('run-2');
    });

    it('should remove run when already selected', () => {
      const { result } = renderHook(() => useComparisonState(), {
        wrapper: createWrapper('/compare?runs=run-1,run-2'),
      });

      act(() => {
        result.current.toggleRunSelection('run-1');
      });

      expect(result.current.selectedRunIds).not.toContain('run-1');
      expect(result.current.selectedRunIds).toContain('run-2');
    });
  });

  describe('clearSelection', () => {
    it('should clear all selected runs', () => {
      const { result } = renderHook(() => useComparisonState(), {
        wrapper: createWrapper('/compare?runs=run-1,run-2,run-3'),
      });

      expect(result.current.selectedRunIds).toHaveLength(3);

      act(() => {
        result.current.clearSelection();
      });

      expect(result.current.selectedRunIds).toEqual([]);
    });
  });

  describe('setVisualization', () => {
    it('should update visualization type', () => {
      const { result } = renderHook(() => useComparisonState(), {
        wrapper: createWrapper('/compare'),
      });

      act(() => {
        result.current.setVisualization('values');
      });

      expect(result.current.visualization).toBe('values');
    });
  });

  describe('updateFilters', () => {
    it('should update model filter', () => {
      const { result } = renderHook(() => useComparisonState(), {
        wrapper: createWrapper('/compare'),
      });

      act(() => {
        result.current.updateFilters({ model: 'claude-3' });
      });

      expect(result.current.filters.model).toBe('claude-3');
    });

    it('should update display mode', () => {
      const { result } = renderHook(() => useComparisonState(), {
        wrapper: createWrapper('/compare'),
      });

      act(() => {
        result.current.updateFilters({ displayMode: 'side-by-side' });
      });

      expect(result.current.filters.displayMode).toBe('side-by-side');
    });

    it('should clear filter when set to undefined', () => {
      const { result } = renderHook(() => useComparisonState(), {
        wrapper: createWrapper('/compare?model=gpt-4'),
      });

      expect(result.current.filters.model).toBe('gpt-4');

      act(() => {
        result.current.updateFilters({ model: undefined });
      });

      expect(result.current.filters.model).toBeUndefined();
    });
  });

  describe('config object', () => {
    it('should provide combined config', () => {
      const { result } = renderHook(() => useComparisonState(), {
        wrapper: createWrapper('/compare?runs=a,b&viz=decisions&model=gpt-4&display=side-by-side'),
      });

      expect(result.current.config).toEqual({
        runIds: ['a', 'b'],
        visualization: 'decisions',
        filters: {
          model: 'gpt-4',
          value: undefined,
          displayMode: 'side-by-side',
        },
      });
    });
  });
});
