/**
 * Import API
 *
 * Functions for importing definitions from external formats.
 */

/**
 * Get the base API URL for imports.
 */
function getApiBaseUrl(): string {
  // Use environment variable or default to same origin
  return import.meta.env.VITE_API_URL || '';
}

/**
 * Get authentication token from local storage.
 */
function getAuthToken(): string | null {
  return localStorage.getItem('valuerank_token');
}

/**
 * Import validation error returned by the API.
 */
export type ImportError = {
  field: string;
  message: string;
};

/**
 * Result of importing a definition.
 */
export type ImportResult = {
  id: string;
  name: string;
  originalName?: string;
  usedAlternativeName?: boolean;
};

/**
 * Error response from import API.
 */
export type ImportErrorResponse = {
  error: string;
  message: string;
  details?: ImportError[];
  suggestions?: {
    alternativeName?: string;
  };
};

/**
 * Import a definition from markdown content.
 *
 * @param content - Raw markdown content
 * @param options - Optional import options
 * @returns Import result with definition ID and name
 */
export async function importDefinitionFromMd(
  content: string,
  options?: {
    name?: string;
    forceAlternativeName?: boolean;
  }
): Promise<ImportResult> {
  const token = getAuthToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/api/import/definition`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content,
      name: options?.name,
      forceAlternativeName: options?.forceAlternativeName,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    // Create error with additional data attached
    const error = new ImportApiError(
      data.message || 'Import failed',
      data as ImportErrorResponse
    );
    throw error;
  }

  return data as ImportResult;
}

/**
 * Custom error class for import API errors.
 * Includes structured error details.
 */
export class ImportApiError extends Error {
  public readonly errorCode: string;
  public readonly details?: ImportError[];
  public readonly suggestions?: { alternativeName?: string };

  constructor(message: string, response: ImportErrorResponse) {
    super(message);
    this.name = 'ImportApiError';
    this.errorCode = response.error;
    this.details = response.details;
    this.suggestions = response.suggestions;
  }
}
