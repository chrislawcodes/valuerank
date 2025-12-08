/**
 * MCP Response Builder Tests
 *
 * Tests for response building and token budget enforcement.
 */

import { describe, it, expect } from 'vitest';
import {
  buildMcpResponse,
  truncateArray,
  estimateBytes,
  exceedsBudget,
  TOKEN_BUDGETS,
} from '../../src/services/mcp/response.js';

describe('MCP Response Builder', () => {
  describe('TOKEN_BUDGETS', () => {
    it('defines budgets for all tools', () => {
      expect(TOKEN_BUDGETS.list_definitions).toBe(2 * 1024);
      expect(TOKEN_BUDGETS.list_runs).toBe(2 * 1024);
      expect(TOKEN_BUDGETS.get_run_summary).toBe(5 * 1024);
      expect(TOKEN_BUDGETS.get_dimension_analysis).toBe(2 * 1024);
      expect(TOKEN_BUDGETS.get_transcript_summary).toBe(1 * 1024);
      expect(TOKEN_BUDGETS.graphql_query).toBe(10 * 1024);
    });
  });

  describe('buildMcpResponse', () => {
    it('builds response with metadata', () => {
      const startTime = Date.now() - 100;
      const result = buildMcpResponse({
        toolName: 'list_runs',
        data: { items: [1, 2, 3] },
        requestId: 'test-123',
        startTime,
      });

      expect(result.data).toEqual({ items: [1, 2, 3] });
      expect(result.metadata.requestId).toBe('test-123');
      expect(result.metadata.truncated).toBe(false);
      expect(result.metadata.bytes).toBeGreaterThan(0);
      expect(result.metadata.executionMs).toBeGreaterThanOrEqual(100);
    });

    it('truncates data when exceeding budget', () => {
      const startTime = Date.now();
      // Create data that exceeds 1KB budget for transcript summary
      const largeData = {
        text: 'x'.repeat(2000),
      };

      const result = buildMcpResponse({
        toolName: 'get_transcript_summary',
        data: largeData,
        requestId: 'test-456',
        startTime,
        truncator: (data) => ({ text: data.text.slice(0, 500) }),
      });

      expect(result.metadata.truncated).toBe(true);
      expect(result.data.text.length).toBe(500);
    });

    it('does not truncate data within budget', () => {
      const startTime = Date.now();
      const smallData = { items: [1, 2, 3] };

      const result = buildMcpResponse({
        toolName: 'list_runs',
        data: smallData,
        requestId: 'test-789',
        startTime,
        truncator: () => ({ items: [] }),
      });

      expect(result.metadata.truncated).toBe(false);
      expect(result.data).toEqual(smallData);
    });

    it('sets truncated flag even without truncator', () => {
      const startTime = Date.now();
      const largeData = { text: 'x'.repeat(2000) };

      const result = buildMcpResponse({
        toolName: 'get_transcript_summary',
        data: largeData,
        requestId: 'test-101',
        startTime,
        // No truncator provided
      });

      // Should still mark as truncated even if data isn't modified
      expect(result.metadata.truncated).toBe(true);
    });
  });

  describe('truncateArray', () => {
    it('returns original array if under limit', () => {
      const items = [1, 2, 3];
      const result = truncateArray(items, 5);
      expect(result).toEqual([1, 2, 3]);
    });

    it('truncates array to max items', () => {
      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = truncateArray(items, 5);
      expect(result).toEqual([1, 2, 3, 4, 5]);
      expect(result.length).toBe(5);
    });

    it('handles empty array', () => {
      const result = truncateArray([], 5);
      expect(result).toEqual([]);
    });

    it('handles exact limit', () => {
      const items = [1, 2, 3, 4, 5];
      const result = truncateArray(items, 5);
      expect(result).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('estimateBytes', () => {
    it('estimates bytes for simple object', () => {
      const data = { key: 'value' };
      const bytes = estimateBytes(data);
      expect(bytes).toBeGreaterThan(0);
      expect(bytes).toBe(Buffer.byteLength(JSON.stringify(data), 'utf8'));
    });

    it('estimates bytes for array', () => {
      const data = [1, 2, 3, 4, 5];
      const bytes = estimateBytes(data);
      expect(bytes).toBe(Buffer.byteLength('[1,2,3,4,5]', 'utf8'));
    });

    it('estimates bytes for string', () => {
      const data = 'hello world';
      const bytes = estimateBytes(data);
      expect(bytes).toBe(Buffer.byteLength('"hello world"', 'utf8'));
    });

    it('handles unicode correctly', () => {
      const data = { emoji: '🎉🚀' };
      const bytes = estimateBytes(data);
      // Emojis are 4 bytes each in UTF-8
      expect(bytes).toBeGreaterThan(10);
    });
  });

  describe('exceedsBudget', () => {
    it('returns false for small data', () => {
      const smallData = { id: '123' };
      expect(exceedsBudget('list_runs', smallData)).toBe(false);
    });

    it('returns true for large data', () => {
      const largeData = { text: 'x'.repeat(3000) };
      expect(exceedsBudget('list_runs', largeData)).toBe(true);
    });

    it('respects different tool budgets', () => {
      const mediumData = { text: 'x'.repeat(3000) };
      // 3KB exceeds list_runs (2KB) but not graphql_query (10KB)
      expect(exceedsBudget('list_runs', mediumData)).toBe(true);
      expect(exceedsBudget('graphql_query', mediumData)).toBe(false);
    });
  });
});
