/**
 * Unit tests for probe-scenario handler retry behavior
 *
 * Tests error classification and retry logic.
 */

import { describe, it, expect } from 'vitest';
import { isRetryableError } from '../../../src/queue/handlers/probe-scenario.js';

describe('isRetryableError', () => {
  describe('retryable errors', () => {
    it('returns true for network errors', () => {
      expect(isRetryableError(new Error('ECONNREFUSED'))).toBe(true);
      expect(isRetryableError(new Error('ENOTFOUND'))).toBe(true);
      expect(isRetryableError(new Error('ETIMEDOUT'))).toBe(true);
      expect(isRetryableError(new Error('ECONNRESET'))).toBe(true);
      expect(isRetryableError(new Error('socket hang up'))).toBe(true);
      expect(isRetryableError(new Error('Network error'))).toBe(true);
      expect(isRetryableError(new Error('fetch failed'))).toBe(true);
    });

    it('returns true for rate limit errors', () => {
      expect(isRetryableError(new Error('HTTP 429 Too Many Requests'))).toBe(true);
      expect(isRetryableError(new Error('Rate limit exceeded'))).toBe(true);
    });

    it('returns true for server errors (5xx)', () => {
      expect(isRetryableError(new Error('HTTP 500 Internal Server Error'))).toBe(true);
      expect(isRetryableError(new Error('HTTP 502 Bad Gateway'))).toBe(true);
      expect(isRetryableError(new Error('HTTP 503 Service Unavailable'))).toBe(true);
      expect(isRetryableError(new Error('HTTP 504 Gateway Timeout'))).toBe(true);
    });

    it('returns true for unknown errors (default)', () => {
      expect(isRetryableError(new Error('Something unexpected happened'))).toBe(true);
    });

    it('returns true for non-Error values', () => {
      expect(isRetryableError('string error')).toBe(true);
      expect(isRetryableError({ message: 'object error' })).toBe(true);
      expect(isRetryableError(null)).toBe(true);
      expect(isRetryableError(undefined)).toBe(true);
    });
  });

  describe('non-retryable errors', () => {
    it('returns false for validation errors', () => {
      expect(isRetryableError(new Error('Validation error: invalid input'))).toBe(false);
      expect(isRetryableError(new Error('Invalid scenario ID'))).toBe(false);
    });

    it('returns false for authentication errors', () => {
      expect(isRetryableError(new Error('HTTP 401 Unauthorized'))).toBe(false);
      expect(isRetryableError(new Error('Unauthorized access'))).toBe(false);
    });

    it('returns false for authorization errors', () => {
      expect(isRetryableError(new Error('HTTP 403 Forbidden'))).toBe(false);
      expect(isRetryableError(new Error('Forbidden resource'))).toBe(false);
    });

    it('returns false for not found errors', () => {
      expect(isRetryableError(new Error('HTTP 404 Not Found'))).toBe(false);
      expect(isRetryableError(new Error('Resource not found'))).toBe(false);
    });

    it('returns false for bad request errors', () => {
      expect(isRetryableError(new Error('HTTP 400 Bad Request'))).toBe(false);
      expect(isRetryableError(new Error('Bad request: missing field'))).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('is case insensitive', () => {
      expect(isRetryableError(new Error('VALIDATION ERROR'))).toBe(false);
      expect(isRetryableError(new Error('Econnrefused'))).toBe(true);
      expect(isRetryableError(new Error('RATE LIMIT'))).toBe(true);
    });

    it('handles mixed error messages', () => {
      // Contains both "500" and "validation" - 500 check comes first
      expect(isRetryableError(new Error('500 validation error'))).toBe(true);
    });

    it('handles empty error messages', () => {
      expect(isRetryableError(new Error(''))).toBe(true);
    });
  });
});
