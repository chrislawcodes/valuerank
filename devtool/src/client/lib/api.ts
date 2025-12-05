const API_BASE = '/api';

export interface Scenario {
  base_id: string;
  category: string;
  subject: string;
  body: string;
  preference_frame?: string;
  preference_value_tilt?: string;
}

export interface ScenarioFile {
  preamble: string;
  scenarios: Record<string, Scenario>;
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || error.details || 'Request failed');
  }
  return res.json();
}

// Scenarios API
export const scenarios = {
  getFolders: () => fetchJson<{ folders: string[] }>(`${API_BASE}/scenarios/folders`),

  getFiles: (folder: string) =>
    fetchJson<{ files: string[]; definitions: string[] }>(`${API_BASE}/scenarios/files/${encodeURIComponent(folder)}`),

  getFile: (folder: string, filename: string) =>
    fetchJson<ScenarioFile>(`${API_BASE}/scenarios/file/${encodeURIComponent(folder)}/${encodeURIComponent(filename)}`),

  updateFile: (folder: string, filename: string, data: ScenarioFile) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/scenarios/file/${encodeURIComponent(folder)}/${encodeURIComponent(filename)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  createFile: (folder: string, filename: string, data: ScenarioFile) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/scenarios/file/${encodeURIComponent(folder)}/${encodeURIComponent(filename)}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteFile: (folder: string, filename: string) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/scenarios/file/${encodeURIComponent(folder)}/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    }),

  createFolder: (name: string) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/scenarios/folder`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
};

// Canonical dimension types
export interface DimensionLevel {
  score: number;
  label: string;
  options: string[];
}

export interface CanonicalDimension {
  description: string;
  levels: DimensionLevel[];
}

export interface CanonicalDimensions {
  dimensions: Record<string, CanonicalDimension>;
}

// Config API
export const config = {
  getRuntime: () => fetchJson<unknown>(`${API_BASE}/config/runtime`),
  updateRuntime: (data: unknown) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/config/runtime`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  getValuesRubric: () => fetchJson<unknown>(`${API_BASE}/config/values-rubric`),
  getValues: () => fetchJson<{ values: string[] }>(`${API_BASE}/config/values`),
  getModelCosts: () => fetchJson<unknown>(`${API_BASE}/config/model-costs`),
  getCanonicalDimensions: () => fetchJson<CanonicalDimensions>(`${API_BASE}/config/canonical-dimensions`),
};

// Runner API
export interface RunResult {
  runId: string;
  command: string;
  args: string[];
}

export const runner = {
  start: (command: string, args: Record<string, string> = {}) =>
    fetchJson<RunResult>(`${API_BASE}/runner/start`, {
      method: 'POST',
      body: JSON.stringify({ command, args }),
    }),

  stop: (runId: string) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/runner/stop/${runId}`, {
      method: 'POST',
    }),

  getStatus: () => fetchJson<{ running: string[] }>(`${API_BASE}/runner/status`),

  getRuns: () => fetchJson<{ runs: string[] }>(`${API_BASE}/runner/runs`),

  streamOutput: (runId: string, onData: (type: string, data: string) => void) => {
    const eventSource = new EventSource(`${API_BASE}/runner/output/${runId}`);

    eventSource.addEventListener('stdout', (e) => onData('stdout', JSON.parse(e.data)));
    eventSource.addEventListener('stderr', (e) => onData('stderr', JSON.parse(e.data)));
    eventSource.addEventListener('exit', (e) => {
      onData('exit', JSON.parse(e.data));
      eventSource.close();
    });

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => eventSource.close();
  },
};

// Scenario Definition (generator .md files)
export interface ScenarioDefinition {
  name: string;
  base_id: string;
  category: string;
  preamble: string;
  template: string;
  dimensions: {
    name: string;
    values: { score: number; label: string; options: string[] }[];
  }[];
  matchingRules: string;
}

export const generator = {
  getDefinition: (folder: string, name: string) =>
    fetchJson<ScenarioDefinition>(`${API_BASE}/generator/definition/${encodeURIComponent(folder)}/${encodeURIComponent(name)}`),

  saveDefinition: (folder: string, name: string, definition: ScenarioDefinition) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/generator/definition/${encodeURIComponent(folder)}/${encodeURIComponent(name)}`, {
      method: 'PUT',
      body: JSON.stringify(definition),
    }),

  createDefinition: (folder: string, name: string, definition: ScenarioDefinition) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/generator/definition/${encodeURIComponent(folder)}/${encodeURIComponent(name)}`, {
      method: 'POST',
      body: JSON.stringify(definition),
    }),

  deleteDefinition: (folder: string, name: string) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/generator/definition/${encodeURIComponent(folder)}/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }),

  renameDefinition: (folder: string, name: string, newName: string) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/generator/definition/${encodeURIComponent(folder)}/${encodeURIComponent(name)}/rename`, {
      method: 'POST',
      body: JSON.stringify({ newName }),
    }),

  generate: (folder: string, name: string) =>
    fetchJson<{ success: boolean; yaml: string }>(`${API_BASE}/generator/generate/${encodeURIComponent(folder)}/${encodeURIComponent(name)}`, {
      method: 'POST',
    }),

  getProviders: () => fetchJson<{ available: string[] }>(`${API_BASE}/generator/providers`),
};
