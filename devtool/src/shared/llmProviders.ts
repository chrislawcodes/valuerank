/**
 * Unified LLM Provider Configuration
 * Single source of truth for all LLM provider metadata used across the devtool.
 */

export interface LLMModelConfig {
  id: string;
  name: string;
  providerId: string;
  /** Whether this is the default model for its provider */
  isDefault?: boolean;
}

export interface LLMProviderConfig {
  id: string;
  name: string;
  envKey: string;
  /** SVG icon as a string */
  icon: string;
  /** Whether this provider is supported for scenario generation in the devtool */
  supportsGeneration: boolean;
  /** Available models for this provider */
  models: LLMModelConfig[];
}

/**
 * All supported LLM providers with their configuration.
 * Icons are simplified SVG representations of each brand's visual identity.
 */
export const LLM_PROVIDERS: LLMProviderConfig[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    supportsGeneration: true,
    models: [
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', providerId: 'anthropic', isDefault: true },
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', providerId: 'anthropic' },
      { id: 'claude-opus-4-0-20250514', name: 'Claude Opus 4', providerId: 'anthropic' },
    ],
    // Claude's official starburst logo
    icon: `<svg viewBox="0 0 136 150" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fill="#d97757" d="m 29.05,98.54 29.14,-16.35 0.49,-1.42 -0.49,-0.79 h -1.42 l -4.87,-0.3 -16.65,-0.45 -14.44,-0.6 -13.99,-0.75 -3.52,-0.75 -3.3,-4.35 0.34,-2.17 2.96,-1.99 4.24,0.37 9.37,0.64 14.06,0.97 10.2,0.6 15.11,1.57 h 2.4 l 0.34,-0.97 -0.82,-0.6 -0.64,-0.6 -14.55,-9.86 -15.75,-10.42 -8.25,-6 -4.46,-3.04 -2.25,-2.85 -0.97,-6.22 4.05,-4.46 5.44,0.37 1.39,0.37 5.51,4.24 11.77,9.11 15.37,11.32 2.25,1.87 0.9,-0.64 0.11,-0.45 -1.01,-1.69 -8.36,-15.11 -8.92,-15.37 -3.97,-6.37 -1.05,-3.82 c -0.37,-1.57 -0.64,-2.89 -0.64,-4.5 l 4.61,-6.26 2.55,-0.82 6.15,0.82 2.59,2.25 3.82,8.74 6.19,13.76 9.6,18.71 2.81,5.55 1.5,5.14 0.56,1.57 h 0.97 v -0.9 l 0.79,-10.54 1.46,-12.94 1.42,-16.65 0.49,-4.69 2.32,-5.62 4.61,-3.04 3.6,1.72 2.96,4.24 -0.41,2.74 -1.76,11.44 -3.45,17.92 -2.25,12 h 1.31 l 1.5,-1.5 6.07,-8.06 10.2,-12.75 4.5,-5.06 5.25,-5.59 3.37,-2.66 h 6.37 l 4.69,6.97 -2.1,7.2 -6.56,8.32 -5.44,7.05 -7.8,10.5 -4.87,8.4 0.45,0.67 1.16,-0.11 17.62,-3.75 9.52,-1.72 11.36,-1.95 5.14,2.4 0.56,2.44 -2.02,4.99 -12.15,3 -14.25,2.85 -21.22,5.02 -0.26,0.19 0.3,0.37 9.56,0.9 4.09,0.22 h 10.01 l 18.64,1.39 4.87,3.22 2.92,3.94 -0.49,3 -7.5,3.82 -10.12,-2.4 -23.62,-5.62 -8.1,-2.02 h -1.12 v 0.67 l 6.75,6.6 12.37,11.17 15.49,14.4 0.79,3.56 -1.99,2.81 -2.1,-0.3 -13.61,-10.24 -5.25,-4.61 -11.89,-10.01 h -0.79 v 1.05 l 2.74,4.01 14.47,21.75 0.75,6.67 -1.05,2.17 -3.75,1.31 -4.12,-0.75 -8.47,-11.89 -8.74,-13.39 -7.05,-12 -0.86,0.49 -4.16,44.81 -1.95,2.29 -4.5,1.72 -3.75,-2.85 -1.99,-4.61 1.99,-9.11 2.4,-11.89 1.95,-9.45 1.76,-11.74 1.05,-3.9 -0.07,-0.26 -0.86,0.11 -8.85,12.15 -13.46,18.19 -10.65,11.4 -2.55,1.01 -4.42,-2.29 0.41,-4.09 2.47,-3.64 14.74,-18.75 8.89,-11.62 5.74,-6.71 -0.04,-0.97 h -0.34 l -39.15,25.42 -6.97,0.9 -3,-2.81 0.37,-4.61 1.42,-1.5 11.77,-8.1 z"/>
    </svg>`,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    supportsGeneration: true,
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', providerId: 'openai', isDefault: true },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', providerId: 'openai' },
      { id: 'o1', name: 'o1', providerId: 'openai' },
      { id: 'o1-mini', name: 'o1 Mini', providerId: 'openai' },
    ],
    // OpenAI's official interlocking knot logo
    icon: `<svg viewBox="0 0 24 24" fill="#000000" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/>
    </svg>`,
  },
  {
    id: 'google',
    name: 'Google (Gemini)',
    envKey: 'GOOGLE_API_KEY',
    supportsGeneration: false,
    models: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', providerId: 'google', isDefault: true },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', providerId: 'google' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', providerId: 'google' },
    ],
    // Gemini's four-pointed star with Google colors
    icon: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2L14 10L22 12L14 14L12 22L10 14L2 12L10 10L12 2Z" fill="url(#gemini-gradient)"/>
      <defs>
        <linearGradient id="gemini-gradient" x1="2" y1="2" x2="22" y2="22">
          <stop offset="0%" stop-color="#4285F4"/>
          <stop offset="33%" stop-color="#EA4335"/>
          <stop offset="66%" stop-color="#FBBC05"/>
          <stop offset="100%" stop-color="#34A853"/>
        </linearGradient>
      </defs>
    </svg>`,
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    envKey: 'XAI_API_KEY',
    supportsGeneration: false,
    models: [
      { id: 'grok-3', name: 'Grok 3', providerId: 'xai', isDefault: true },
      { id: 'grok-3-fast', name: 'Grok 3 Fast', providerId: 'xai' },
      { id: 'grok-2', name: 'Grok 2', providerId: 'xai' },
    ],
    // xAI/Grok's official logo mark
    icon: `<svg viewBox="0 0 34 33" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M13.2371 21.0407L24.3186 12.8506C24.8619 12.4491 25.6384 12.6057 25.8973 13.2294C27.2597 16.5185 26.651 20.4712 23.9403 23.1851C21.2297 25.8989 17.4581 26.4941 14.0108 25.1386L10.2449 26.8843C15.6463 30.5806 22.2053 29.6665 26.304 25.5601C29.5551 22.3051 30.562 17.8683 29.6205 13.8673L29.629 13.8758C28.2637 7.99809 29.9647 5.64871 33.449 0.844576C33.5314 0.730667 33.6139 0.616757 33.6964 0.5L29.1113 5.09055V5.07631L13.2343 21.0436" fill="#000000"/>
      <path d="M10.9503 23.0313C7.07343 19.3235 7.74185 13.5853 11.0498 10.2763C13.4959 7.82722 17.5036 6.82767 21.0021 8.2971L24.7595 6.55998C24.0826 6.07017 23.215 5.54334 22.2195 5.17313C17.7198 3.31926 12.3326 4.24192 8.67479 7.90126C5.15635 11.4239 4.0499 16.8403 5.94992 21.4622C7.36924 24.9165 5.04257 27.3598 2.69884 29.826C1.86829 30.7002 1.0349 31.5745 0.36364 32.5L10.9474 23.0341" fill="#000000"/>
    </svg>`,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    envKey: 'DEEPSEEK_API_KEY',
    supportsGeneration: false,
    models: [
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', providerId: 'deepseek', isDefault: true },
      { id: 'deepseek-chat', name: 'DeepSeek Chat', providerId: 'deepseek' },
    ],
    // DeepSeek's official whale/dolphin logo
    icon: `<svg viewBox="0 0 512 509.64" fill-rule="evenodd" clip-rule="evenodd" xmlns="http://www.w3.org/2000/svg">
      <path fill="#4D6BFE" fill-rule="nonzero" d="M440.898 139.167c-4.001-1.961-5.723 1.776-8.062 3.673-.801.612-1.479 1.407-2.154 2.141-5.848 6.246-12.681 10.349-21.607 9.859-13.048-.734-24.192 3.368-34.04 13.348-2.093-12.307-9.048-19.658-19.635-24.37-5.54-2.449-11.141-4.9-15.02-10.227-2.708-3.795-3.447-8.021-4.801-12.185-.861-2.509-1.725-5.082-4.618-5.512-3.139-.49-4.372 2.142-5.601 4.349-4.925 9.002-6.833 18.921-6.647 28.962.432 22.597 9.972 40.597 28.932 53.397 2.154 1.47 2.707 2.939 2.032 5.082-1.293 4.41-2.832 8.695-4.186 13.105-.862 2.817-2.157 3.429-5.172 2.205-10.402-4.346-19.391-10.778-27.332-18.553-13.481-13.044-25.668-27.434-40.873-38.702a177.614 177.614 0 00-10.834-7.409c-15.512-15.063 2.032-27.434 6.094-28.902 4.247-1.532 1.478-6.797-12.251-6.736-13.727.061-26.285 4.653-42.288 10.777-2.34.92-4.801 1.593-7.326 2.142-14.527-2.756-29.608-3.368-45.367-1.593-29.671 3.305-53.368 17.329-70.788 41.272-20.928 28.785-25.854 61.482-19.821 95.59 6.34 35.943 24.683 65.704 52.876 88.974 29.239 24.123 62.911 35.943 101.32 33.677 23.329-1.346 49.307-4.468 78.607-29.27 7.387 3.673 15.142 5.144 28.008 6.246 9.911.92 19.452-.49 26.839-2.019 11.573-2.449 10.773-13.166 6.586-15.124-33.915-15.797-26.47-9.368-33.24-14.573 17.235-20.39 43.213-41.577 53.369-110.222.8-5.448.121-8.877 0-13.287-.061-2.692.553-3.734 3.632-4.041 8.494-.981 16.742-3.305 24.314-7.471 21.975-12.002 30.84-31.719 32.933-55.355.307-3.612-.061-7.348-3.879-9.245v-.003zM249.4 351.89c-32.872-25.838-48.814-34.352-55.4-33.984-6.155.368-5.048 7.41-3.694 12.002 1.415 4.532 3.264 7.654 5.848 11.634 1.785 2.634 3.017 6.551-1.784 9.493-10.587 6.55-28.993-2.205-29.856-2.635-21.421-12.614-39.334-29.269-51.954-52.047-12.187-21.924-19.267-45.435-20.435-70.542-.308-6.061 1.478-8.207 7.509-9.307 7.94-1.471 16.127-1.778 24.068-.615 33.547 4.9 62.108 19.902 86.054 43.66 13.666 13.531 24.007 29.699 34.658 45.496 11.326 16.778 23.514 32.761 39.026 45.865 5.479 4.592 9.848 8.083 14.035 10.656-12.62 1.407-33.673 1.714-48.075-9.676zm15.899-102.519c.521-2.111 2.421-3.658 4.722-3.658a4.74 4.74 0 011.661.305c.678.246 1.293.614 1.786 1.163.861.859 1.354 2.083 1.354 3.368 0 2.695-2.154 4.837-4.862 4.837a4.748 4.748 0 01-4.738-4.034 5.01 5.01 0 01.077-1.981zm47.208 26.915c-2.606.996-5.2 1.778-7.707 1.88-4.679.244-9.787-1.654-12.556-3.981-4.308-3.612-7.386-5.631-8.679-11.941-.554-2.695-.247-6.858.246-9.246 1.108-5.144-.124-8.451-3.754-11.451-2.954-2.449-6.711-3.122-10.834-3.122-1.539 0-2.954-.673-4.001-1.224-1.724-.856-3.139-3-1.785-5.634.432-.856 2.525-2.939 3.018-3.305 5.6-3.185 12.065-2.144 18.034.244 5.54 2.266 9.727 6.429 15.759 12.307 6.155 7.102 7.263 9.063 10.773 14.39 2.771 4.163 5.294 8.451 7.018 13.348.877 2.561.071 4.74-2.341 6.277-.981.625-2.109 1.044-3.191 1.458z"/>
    </svg>`,
  },
  {
    id: 'mistral',
    name: 'Mistral',
    envKey: 'MISTRAL_API_KEY',
    supportsGeneration: false,
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large', providerId: 'mistral', isDefault: true },
      { id: 'mistral-medium-latest', name: 'Mistral Medium', providerId: 'mistral' },
      { id: 'mistral-small-latest', name: 'Mistral Small', providerId: 'mistral' },
    ],
    // Mistral's official colorful "M" logo
    icon: `<svg viewBox="-77 -162 213 153" xmlns="http://www.w3.org/2000/svg">
      <path d="M-46.307-161.245h30.303v30.303h-30.303zm121.212 0h30.303v30.303H74.905z" fill="gold"/>
      <path d="M-46.307-130.942h60.606v30.303h-60.606zm90.909 0h60.606v30.303H44.602z" fill="#ffaf00"/>
      <path fill="#ff8205" d="M-46.307-100.639h151.515v30.303H-46.307z"/>
      <path d="M-46.307-70.336h30.303v30.303h-30.303zm60.606 0h30.303v30.303H14.299zm60.606 0h30.303v30.303H74.905z" fill="#fa500f"/>
      <path d="M-76.61-40.033h90.909V-9.73H-76.61zm121.212 0h90.909V-9.73H44.602z" fill="#e10500"/>
    </svg>`,
  },
];

/**
 * Get a provider by ID
 */
export function getProvider(id: string): LLMProviderConfig | undefined {
  return LLM_PROVIDERS.find(p => p.id === id);
}

/**
 * Get providers that support scenario generation
 */
export function getGenerationProviders(): LLMProviderConfig[] {
  return LLM_PROVIDERS.filter(p => p.supportsGeneration);
}

/**
 * Get all models across all providers
 */
export function getAllModels(): LLMModelConfig[] {
  return LLM_PROVIDERS.flatMap(p => p.models);
}

/**
 * Get a model by its full ID (provider:model format)
 */
export function getModelByFullId(fullId: string): { provider: LLMProviderConfig; model: LLMModelConfig } | undefined {
  const [providerId, modelId] = fullId.includes(':') ? fullId.split(':') : ['', fullId];

  for (const provider of LLM_PROVIDERS) {
    if (providerId && provider.id !== providerId) continue;
    const model = provider.models.find(m => m.id === modelId);
    if (model) {
      return { provider, model };
    }
  }
  return undefined;
}

/**
 * Get the default model for a provider
 */
export function getDefaultModel(providerId: string): LLMModelConfig | undefined {
  const provider = getProvider(providerId);
  if (!provider) return undefined;
  return provider.models.find(m => m.isDefault) || provider.models[0];
}
