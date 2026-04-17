import { formatDisplayLabel } from '../../utils/displayLabels';

export type ModelHeader = {
  familyKey: string;
  familyLabel: string;
  modelId: string;
  variantLabel: string;
};

export function inferModelFamily(modelId: string): { key: string; label: string } {
  const normalized = modelId.toLowerCase().replace(/^[^:]+:/, '');

  if (normalized.includes('deepseek')) {
    return { key: 'deepseek', label: 'DeepSeek' };
  }
  if (normalized.includes('claude')) {
    if (normalized.includes('sonnet')) {
      return { key: 'claude-sonnet', label: 'Sonnet' };
    }
    if (normalized.includes('haiku')) {
      return { key: 'claude-haiku', label: 'Haiku' };
    }
    if (normalized.includes('opus')) {
      return { key: 'claude-opus', label: 'Opus' };
    }
    return { key: 'claude', label: 'Claude' };
  }
  if (normalized.includes('gemini')) {
    return { key: 'gemini', label: 'Gemini' };
  }
  if (normalized.includes('grok')) {
    return { key: 'grok', label: 'Grok' };
  }
  if (normalized.includes('gpt')) {
    return { key: 'gpt', label: 'GPT' };
  }
  if (normalized.startsWith('o1') || normalized.startsWith('o3') || normalized.startsWith('o4')) {
    const familyToken = normalized.split(/[-_\s.]/, 1)[0] ?? normalized;
    return { key: familyToken, label: familyToken.toUpperCase() };
  }
  if (normalized.includes('mistral')) {
    return { key: 'mistral', label: 'Mistral' };
  }

  return { key: normalized || modelId, label: formatModelDisplayName(normalized || modelId) };
}

export function formatModelDisplayName(label: string): string {
  return formatDisplayLabel(label)
    .split(/([-\s]+)/)
    .map((part) => {
      if (/^[-\s]+$/.test(part)) return part;

      const normalized = part.toLowerCase();
      if (normalized === 'gpt') return 'GPT';
      if (normalized === 'xai') return 'xAI';
      if (normalized === 'openai') return 'OpenAI';
      if (normalized === 'anthropic') return 'Anthropic';
      if (normalized === 'google') return 'Google';
      if (normalized === 'deepseek') return 'DeepSeek';
      if (normalized === 'mistral') return 'Mistral';
      if (normalized === 'claude') return 'Claude';
      if (normalized === 'gemini') return 'Gemini';
      if (normalized === 'grok') return 'Grok';
      if (normalized === 'chat') return 'Chat';
      if (normalized === 'reasoner') return 'Reasoner';
      if (normalized === 'flash') return 'Flash';
      if (normalized === 'pro') return 'Pro';
      if (normalized === 'mini') return 'Mini';
      if (normalized === 'fast') return 'Fast';
      if (normalized === 'sonnet') return 'Sonnet';
      if (normalized === 'haiku') return 'Haiku';
      if (normalized === 'opus') return 'Opus';

      if (/^[a-z]/.test(part)) {
        return part.charAt(0).toUpperCase() + part.slice(1);
      }

      return part;
    })
    .join('');
}

function formatClaudeVariantLabel(variant: string): string {
  const tokens = variant
    .toLowerCase()
    .split(/[-_\s]+/)
    .filter(Boolean);

  const style = tokens.find((token) => token === 'sonnet' || token === 'haiku' || token === 'opus');
  if (!style) {
    return formatModelDisplayName(variant);
  }

  const numericTokens = tokens.filter((token) => /^\d+$/.test(token));
  let version = '';
  if (numericTokens.length >= 2) {
    version = `${numericTokens[0]}.${numericTokens[1]}`;
  } else if (numericTokens.length === 1) {
    version = numericTokens[0] ?? '';
  }

  const styleLabel = formatModelDisplayName(style);
  return version ? `${styleLabel} ${version}` : styleLabel;
}

function formatClaudeVersionLabel(variant: string): string {
  const tokens = variant
    .toLowerCase()
    .split(/[-_\s]+/)
    .filter(Boolean);

  const numericTokens = tokens.filter((token) => /^\d+$/.test(token));
  if (numericTokens.length >= 2) {
    return `${numericTokens[0]}.${numericTokens[1]}`;
  }
  if (numericTokens.length === 1) {
    return numericTokens[0] ?? '';
  }

  return formatModelDisplayName(variant);
}

function formatGrokVariantLabel(variant: string): string {
  const tokens = variant
    .toLowerCase()
    .split(/[-_\s]+/)
    .filter(Boolean);

  const numericTokens = tokens.filter((token) => /^\d+$/.test(token));
  let version = '';
  if (numericTokens.length >= 2) {
    version = `${numericTokens[0]}.${numericTokens[1]}`;
  } else if (numericTokens.length === 1) {
    version = numericTokens[0] ?? '';
  }

  if (tokens.includes('fast') && tokens.includes('reasoning')) {
    return `${version ? `${version} ` : ''}Fast\nReasoning`;
  }

  return formatModelDisplayName(variant);
}

function formatModelVariantLabel(modelId: string, familyKey: string): string {
  let variant = modelId.replace(/^[^:]+:/, '');

  if (familyKey === 'deepseek') {
    variant = variant.replace(/^deepseek[-_ ]*/i, '');
  } else if (familyKey === 'claude' || familyKey.startsWith('claude-')) {
    variant = variant.replace(/^(anthropic[-_ ]*)?claude[-_ ]*/i, '');
  } else if (familyKey === 'gemini') {
    variant = variant.replace(/^(google[-_ ]*)?gemini[-_ ]*/i, '');
  } else if (familyKey === 'grok') {
    variant = variant.replace(/^(xai[-_ ]*)?grok[-_ ]*/i, '');
  } else if (familyKey === 'gpt') {
    variant = variant.replace(/^(openai[-_ ]*)?gpt[-_ ]*/i, '');
  } else if (/^o[134]/.test(familyKey)) {
    variant = variant.replace(new RegExp(`^${familyKey}[-_ ]*`, 'i'), '');
  } else if (familyKey === 'mistral') {
    variant = variant.replace(/^mistral[-_ ]*/i, '');
  }

  if (!variant.trim()) {
    variant = modelId;
  }

  if (familyKey === 'claude') {
    return formatClaudeVariantLabel(variant);
  }
  if (familyKey.startsWith('claude-')) {
    return formatClaudeVersionLabel(variant);
  }
  if (familyKey === 'grok') {
    return formatGrokVariantLabel(variant);
  }

  return formatModelDisplayName(variant);
}

export function buildModelHeaders(modelIds: string[]): ModelHeader[] {
  return modelIds.map((modelId) => {
    const family = inferModelFamily(modelId);
    return {
      familyKey: family.key,
      familyLabel: family.label,
      modelId,
      variantLabel: formatModelVariantLabel(modelId, family.key),
    };
  });
}

export type ModelHeaderGroup = {
  familyKey: string;
  familyLabel: string;
  models: ModelHeader[];
};

export function groupModelHeadersByFamily(modelHeaders: ModelHeader[]): ModelHeaderGroup[] {
  const groups: ModelHeaderGroup[] = [];
  const byFamily = new Map<string, ModelHeaderGroup>();

  modelHeaders.forEach((header) => {
    const existing = byFamily.get(header.familyKey);
    if (existing) {
      existing.models.push(header);
      return;
    }
    const nextGroup: ModelHeaderGroup = {
      familyKey: header.familyKey,
      familyLabel: header.familyLabel,
      models: [header],
    };
    groups.push(nextGroup);
    byFamily.set(header.familyKey, nextGroup);
  });

  return groups;
}

export function hasGroupedFamilyVariants(groups: ModelHeaderGroup[]): boolean {
  return groups.some((group) =>
    group.models.some((header) => header.variantLabel !== group.familyLabel),
  );
}
