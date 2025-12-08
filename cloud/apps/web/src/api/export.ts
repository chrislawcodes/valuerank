/**
 * Export API
 *
 * Functions for exporting run data as CSV.
 */

/**
 * Get the base API URL for exports.
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
