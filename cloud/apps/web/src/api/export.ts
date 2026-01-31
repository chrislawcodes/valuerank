/**
 * Export API
 *
 * Functions for exporting run data as CSV/JSON/XLSX and definitions as MD/YAML.
 * Also provides OData URL generation for live Excel connections.
 */

/**
 * Get the base API URL for exports.
 */
function getApiBaseUrl(): string {
  // Use environment variable or default to same origin
  return import.meta.env.VITE_API_URL || '';
}

/**
 * Get the OData feed URL for a run.
 * This URL can be used in Excel's "From OData Feed" to connect directly to run data.
 *
 * @param runId - The run ID
 * @returns The OData feed URL for the run's transcripts
 */
export function getODataFeedUrl(runId: string): string {
  // Get base URL - use VITE_API_URL if set, otherwise use current origin
  const baseUrl = import.meta.env.VITE_API_URL || window.location.origin;
  // Return the Transcripts entity set URL - this is what Excel needs
  return `${baseUrl}/api/odata/runs/${runId}/Transcripts`;
}

/**
 * Get the CSV feed URL for a run.
 * This URL allows direct import into Google Sheets via IMPORTDATA.
 *
 * @param runId - The run ID
 * @returns The CSV feed URL template (user needs to append api key)
 */
export function getCSVFeedUrl(runId: string): string {
  const baseUrl = import.meta.env.VITE_API_URL || window.location.origin;
  return `${baseUrl}/api/csv/runs/${runId}`;
}

/**
 * Get authentication token from local storage.
 */
function getAuthToken(): string | null {
  return localStorage.getItem('valuerank_token');
}

/**
 * Export run results as CSV and trigger download.
 *
 * @param runId - The run ID to export
 * @returns Promise that resolves when download starts
 */
export async function exportRunAsCSV(runId: string): Promise<void> {
  const token = getAuthToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/api/export/runs/${runId}/csv`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Export failed: ${response.status} ${errorText}`);
  }

  // Get filename from Content-Disposition header or generate one
  const contentDisposition = response.headers.get('Content-Disposition');
  let filename = `run-${runId.slice(0, 8)}-export.csv`;

  if (contentDisposition) {
    const match = contentDisposition.match(/filename="?([^"]+)"?/);
    if (match?.[1]) {
      filename = match[1];
    }
  }

  // Convert response to blob and trigger download
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);

  // Create temporary link and click it
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();

  // Cleanup
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);
}

/**
 * Export run results as Excel (XLSX) with charts and trigger download.
 *
 * @param runId - The run ID to export
 * @returns Promise that resolves when download starts
 */
export async function exportRunAsXLSX(runId: string): Promise<void> {
  const token = getAuthToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/api/export/runs/${runId}/xlsx`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Export failed: ${response.status} ${errorText}`);
  }

  // Get filename from Content-Disposition header or generate one
  const contentDisposition = response.headers.get('Content-Disposition');
  let filename = `valuerank-${runId.slice(0, 8)}-export.xlsx`;

  if (contentDisposition) {
    const match = contentDisposition.match(/filename="?([^"]+)"?/);
    if (match?.[1]) {
      filename = match[1];
    }
  }

  // Convert response to blob and trigger download
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);

  // Create temporary link and click it
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();

  // Cleanup
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);
}

/**
 * Export all transcripts for a run as JSON and trigger download.
 *
 * @param runId - The run ID to export transcripts for
 * @returns Promise that resolves when download starts
 */
export async function exportTranscriptsAsJSON(runId: string): Promise<void> {
  const token = getAuthToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/api/export/runs/${runId}/transcripts.json`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Export failed: ${response.status} ${errorText}`);
  }

  // Get filename from Content-Disposition header or generate one
  const contentDisposition = response.headers.get('Content-Disposition');
  let filename = `transcripts-${runId.slice(0, 8)}.json`;

  if (contentDisposition) {
    const match = contentDisposition.match(/filename="?([^"]+)"?/);
    if (match?.[1]) {
      filename = match[1];
    }
  }

  // Convert response to blob and trigger download
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);

  // Create temporary link and click it
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();

  // Cleanup
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);
}

/**
 * Export definition as Markdown and trigger download.
 *
 * @param definitionId - The definition ID to export
 * @returns Promise that resolves when download starts
 */
export async function exportDefinitionAsMd(definitionId: string): Promise<void> {
  const token = getAuthToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/api/export/definitions/${definitionId}/md`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Export failed: ${response.status} ${errorText}`);
  }

  // Get filename from Content-Disposition header or generate one
  const contentDisposition = response.headers.get('Content-Disposition');
  let filename = `definition-${definitionId.slice(0, 8)}.md`;

  if (contentDisposition) {
    const match = contentDisposition.match(/filename="?([^"]+)"?/);
    if (match?.[1]) {
      filename = match[1];
    }
  }

  // Convert response to blob and trigger download
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);

  // Create temporary link and click it
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();

  // Cleanup
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);
}

/**
 * Export scenarios as CLI-compatible YAML and trigger download.
 *
 * @param definitionId - The definition ID to export scenarios for
 * @returns Promise that resolves when download starts
 */
export async function exportScenariosAsYaml(definitionId: string): Promise<void> {
  const token = getAuthToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/api/export/definitions/${definitionId}/scenarios.yaml`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Export failed: ${response.status} ${errorText}`);
  }

  // Get filename from Content-Disposition header or generate one
  const contentDisposition = response.headers.get('Content-Disposition');
  let filename = `definition-${definitionId.slice(0, 8)}.scenarios.yaml`;

  if (contentDisposition) {
    const match = contentDisposition.match(/filename="?([^"]+)"?/);
    if (match?.[1]) {
      filename = match[1];
    }
  }

  // Convert response to blob and trigger download
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);

  // Create temporary link and click it
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();

  // Cleanup
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);
}
