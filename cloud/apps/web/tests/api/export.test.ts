/**
 * Export API Tests
 *
 * Tests for the CSV export functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

// Mock URL.createObjectURL and URL.revokeObjectURL
const mockCreateObjectURL = vi.fn();
const mockRevokeObjectURL = vi.fn();

// Mock document methods
const mockClick = vi.fn();
const mockAppendChild = vi.fn();
const mockRemoveChild = vi.fn();

describe('exportRunAsCSV', () => {
  let originalLocalStorage: Storage;
  let originalFetch: typeof fetch;
  let originalURL: typeof URL;
  let exportRunAsCSV: (runId: string) => Promise<void>;

  beforeEach(async () => {
    // Save originals
    originalLocalStorage = global.localStorage;
    originalFetch = global.fetch;
    originalURL = global.URL;

    // Mock localStorage
    Object.defineProperty(global, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
    });

    // Mock fetch
    global.fetch = mockFetch;

    // Mock URL
    mockCreateObjectURL.mockReturnValue('blob:test-url');
    global.URL.createObjectURL = mockCreateObjectURL;
    global.URL.revokeObjectURL = mockRevokeObjectURL;

    // Mock document.createElement
    const mockLink = {
      href: '',
      download: '',
      click: mockClick,
    };
    vi.spyOn(document, 'createElement').mockReturnValue(mockLink as unknown as HTMLElement);
    vi.spyOn(document.body, 'appendChild').mockImplementation(mockAppendChild);
    vi.spyOn(document.body, 'removeChild').mockImplementation(mockRemoveChild);

    // Reset mocks
    vi.clearAllMocks();

    // Import module fresh for each test
    const module = await import('../../src/api/export');
    exportRunAsCSV = module.exportRunAsCSV;
  });

  afterEach(() => {
    // Restore originals
    Object.defineProperty(global, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
    });
    global.fetch = originalFetch;
    global.URL = originalURL;
    vi.restoreAllMocks();
  });

  it('throws error when not authenticated', async () => {
    mockLocalStorage.getItem.mockReturnValue(null);

    await expect(exportRunAsCSV('run-123')).rejects.toThrow('Not authenticated');
  });

  it('makes authenticated request to export endpoint', async () => {
    mockLocalStorage.getItem.mockReturnValue('test-token');
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Headers(),
      blob: vi.fn().mockResolvedValue(new Blob(['test,data'])),
    });

    await exportRunAsCSV('run-123');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/export/runs/run-123/csv'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      })
    );
  });

  it('throws error when request fails', async () => {
    mockLocalStorage.getItem.mockReturnValue('test-token');
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: vi.fn().mockResolvedValue('Run not found'),
    });

    await expect(exportRunAsCSV('run-123')).rejects.toThrow('Export failed: 404 Run not found');
  });

  it('triggers download with correct filename from header', async () => {
    mockLocalStorage.getItem.mockReturnValue('test-token');
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Headers({
        'Content-Disposition': 'attachment; filename="custom-export.csv"',
      }),
      blob: vi.fn().mockResolvedValue(new Blob(['test,data'])),
    });

    await exportRunAsCSV('run-123');

    expect(mockCreateObjectURL).toHaveBeenCalled();
    expect(mockClick).toHaveBeenCalled();
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:test-url');
  });

  it('uses default filename when Content-Disposition header is missing', async () => {
    mockLocalStorage.getItem.mockReturnValue('test-token');
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Headers(),
      blob: vi.fn().mockResolvedValue(new Blob(['test,data'])),
    });

    await exportRunAsCSV('run-12345678');

    // Default filename uses first 8 chars of run ID
    expect(mockClick).toHaveBeenCalled();
  });

  it('cleans up after download', async () => {
    mockLocalStorage.getItem.mockReturnValue('test-token');
    mockFetch.mockResolvedValue({
      ok: true,
      headers: new Headers(),
      blob: vi.fn().mockResolvedValue(new Blob(['test,data'])),
    });

    await exportRunAsCSV('run-123');

    // Should remove the temporary link
    expect(mockRemoveChild).toHaveBeenCalled();
    // Should revoke the blob URL
    expect(mockRevokeObjectURL).toHaveBeenCalled();
  });
});
