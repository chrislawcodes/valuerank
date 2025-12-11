/**
 * Import API Tests
 *
 * Tests for the markdown import functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ImportApiError } from '../../src/api/import';

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};

// Mock fetch
const mockFetch = vi.fn();

describe('importDefinitionFromMd', () => {
  let originalLocalStorage: Storage;
  let originalFetch: typeof fetch;
  let importDefinitionFromMd: (
    content: string,
    options?: { name?: string; forceAlternativeName?: boolean }
  ) => Promise<{ id: string; name: string; originalName?: string; usedAlternativeName?: boolean }>;

  beforeEach(async () => {
    // Save originals
    originalLocalStorage = global.localStorage;
    originalFetch = global.fetch;

    // Mock localStorage
    Object.defineProperty(global, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
    });

    // Mock fetch
    global.fetch = mockFetch;

    // Reset mocks
    vi.clearAllMocks();

    // Import module fresh for each test
    const module = await import('../../src/api/import');
    importDefinitionFromMd = module.importDefinitionFromMd;
  });

  afterEach(() => {
    // Restore originals
    Object.defineProperty(global, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
    });
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('throws error when not authenticated', async () => {
    mockLocalStorage.getItem.mockReturnValue(null);

    await expect(importDefinitionFromMd('# Test')).rejects.toThrow('Not authenticated');
  });

  it('makes authenticated POST request to import endpoint', async () => {
    mockLocalStorage.getItem.mockReturnValue('test-token');
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: 'def-123', name: 'Test Definition' }),
    });

    await importDefinitionFromMd('# Test Definition');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/import/definition'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          content: '# Test Definition',
          name: undefined,
          forceAlternativeName: undefined,
        }),
      })
    );
  });

  it('passes custom name option in request', async () => {
    mockLocalStorage.getItem.mockReturnValue('test-token');
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: 'def-123', name: 'Custom Name' }),
    });

    await importDefinitionFromMd('# Content', { name: 'Custom Name' });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({
          content: '# Content',
          name: 'Custom Name',
          forceAlternativeName: undefined,
        }),
      })
    );
  });

  it('passes forceAlternativeName option in request', async () => {
    mockLocalStorage.getItem.mockReturnValue('test-token');
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        id: 'def-123',
        name: 'Alternative Name',
        usedAlternativeName: true,
      }),
    });

    await importDefinitionFromMd('# Content', { forceAlternativeName: true });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({
          content: '# Content',
          name: undefined,
          forceAlternativeName: true,
        }),
      })
    );
  });

  it('returns import result on success', async () => {
    mockLocalStorage.getItem.mockReturnValue('test-token');
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        id: 'def-123',
        name: 'Imported Definition',
        originalName: 'Original',
        usedAlternativeName: true,
      }),
    });

    const result = await importDefinitionFromMd('# Test');

    expect(result).toEqual({
      id: 'def-123',
      name: 'Imported Definition',
      originalName: 'Original',
      usedAlternativeName: true,
    });
  });

  it('throws ImportApiError on validation error', async () => {
    mockLocalStorage.getItem.mockReturnValue('test-token');
    mockFetch.mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({
        error: 'VALIDATION_ERROR',
        message: 'Invalid markdown format',
        details: [
          { field: 'preamble', message: 'Missing preamble' },
          { field: 'template', message: 'Missing template' },
        ],
      }),
    });

    await expect(importDefinitionFromMd('Invalid content')).rejects.toThrow('Invalid markdown format');
  });

  it('throws ImportApiError with suggestions for duplicate name', async () => {
    mockLocalStorage.getItem.mockReturnValue('test-token');
    mockFetch.mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({
        error: 'DUPLICATE_NAME',
        message: 'Name already exists',
        suggestions: { alternativeName: 'Test Definition (2)' },
      }),
    });

    try {
      await importDefinitionFromMd('# Test');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ImportApiError);
      const apiError = error as ImportApiError;
      expect(apiError.message).toBe('Name already exists');
      expect(apiError.errorCode).toBe('DUPLICATE_NAME');
      expect(apiError.suggestions?.alternativeName).toBe('Test Definition (2)');
    }
  });

  it('handles response with default error message', async () => {
    mockLocalStorage.getItem.mockReturnValue('test-token');
    mockFetch.mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({
        error: 'UNKNOWN_ERROR',
      }),
    });

    await expect(importDefinitionFromMd('# Test')).rejects.toThrow('Import failed');
  });
});

describe('ImportApiError', () => {
  it('creates error with all properties', () => {
    const error = new ImportApiError('Test error', {
      error: 'VALIDATION_ERROR',
      message: 'Test error',
      details: [{ field: 'name', message: 'Required' }],
      suggestions: { alternativeName: 'Alternative' },
    });

    expect(error.message).toBe('Test error');
    expect(error.name).toBe('ImportApiError');
    expect(error.errorCode).toBe('VALIDATION_ERROR');
    expect(error.details).toEqual([{ field: 'name', message: 'Required' }]);
    expect(error.suggestions).toEqual({ alternativeName: 'Alternative' });
  });

  it('creates error without optional properties', () => {
    const error = new ImportApiError('Simple error', {
      error: 'GENERIC_ERROR',
      message: 'Simple error',
    });

    expect(error.message).toBe('Simple error');
    expect(error.errorCode).toBe('GENERIC_ERROR');
    expect(error.details).toBeUndefined();
    expect(error.suggestions).toBeUndefined();
  });
});
