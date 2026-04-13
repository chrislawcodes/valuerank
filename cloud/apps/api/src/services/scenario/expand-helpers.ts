export type ScenarioContent = {
  preamble?: string;
  prompt: string;
  followups?: Array<{ label: string; prompt: string }>;
  dimensions: Record<string, number>;
};

export type GenerateScenariosInput = {
  definitionId: string;
  modelId: string;
  content: {
    preamble?: string;
    template: string;
    dimensions: unknown[];
    matching_rules?: string;
  };
  config: {
    temperature: number;
    maxTokens: number;
  };
  modelConfig?: Record<string, unknown>;
};

export type ExpansionDebugInfo = {
  rawResponse: string | null;
  extractedYaml: string | null;
  parseError: string | null;
  partialTokens?: number;
  modelId?: string;
  timestamp?: string;
  stderr?: string;
  errorDetails?: string;
  method?: string;
  scenariosCreated?: number;
};

export type GenerateScenariosOutput = {
  success: true;
  scenarios: Array<{
    name: string;
    content: {
      preamble?: string;
      prompt: string;
      dimensions: Record<string, number>;
    };
  }>;
  metadata: {
    inputTokens: number;
    outputTokens: number;
    modelVersion: string | null;
  };
  debug?: ExpansionDebugInfo;
} | {
  success: false;
  error: {
    message: string;
    code: string;
    retryable: boolean;
    details?: string;
  };
  debug?: ExpansionDebugInfo;
};

export type ExpandScenariosResult = {
  created: number;
  deleted: number;
};

const DEFAULT_MAX_TOKENS = 8192;

export function normalizePreamble(preamble: string | undefined): string | undefined {
  if (preamble === undefined || preamble === null || preamble === '' || preamble.trim().length === 0) {
    return undefined;
  }
  return preamble;
}

export function getMaxTokensFromConfig(apiConfig: Record<string, unknown> | null | undefined): number {
  if (!apiConfig) {
    return DEFAULT_MAX_TOKENS;
  }

  const maxTokens = apiConfig.maxTokens;
  if (typeof maxTokens === 'number' && maxTokens > 0) {
    return maxTokens;
  }

  return DEFAULT_MAX_TOKENS;
}
