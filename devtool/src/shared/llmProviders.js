/**
 * Unified LLM Provider Configuration
 * Single source of truth for all LLM provider metadata used across the devtool.
 */
/**
 * All supported LLM providers with their configuration.
 * Icons are simplified SVG representations of each brand's visual identity.
 */
export const LLM_PROVIDERS = [
    {
        id: 'anthropic',
        name: 'Anthropic',
        envKey: 'ANTHROPIC_API_KEY',
        supportsGeneration: true,
        // Claude's distinctive coral/orange spark shape
        icon: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.5 3.5L12 12L17.5 20.5" stroke="#D97757" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M6.5 3.5L12 12L6.5 20.5" stroke="#D97757" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
    },
    {
        id: 'openai',
        name: 'OpenAI',
        envKey: 'OPENAI_API_KEY',
        supportsGeneration: true,
        // OpenAI's hexagonal flower/atom shape
        icon: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2L12 8M12 16L12 22M2 12L8 12M16 12L22 12M4.93 4.93L9.17 9.17M14.83 14.83L19.07 19.07M4.93 19.07L9.17 14.83M14.83 9.17L19.07 4.93" stroke="#10A37F" stroke-width="2" stroke-linecap="round"/>
      <circle cx="12" cy="12" r="3" fill="#10A37F"/>
    </svg>`,
    },
    {
        id: 'google',
        name: 'Google (Gemini)',
        envKey: 'GOOGLE_API_KEY',
        supportsGeneration: false,
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
        // xAI's X symbol
        icon: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 4L20 20M20 4L4 20" stroke="#000000" stroke-width="3" stroke-linecap="round"/>
    </svg>`,
    },
    {
        id: 'deepseek',
        name: 'DeepSeek',
        envKey: 'DEEPSEEK_API_KEY',
        supportsGeneration: false,
        // DeepSeek's whale tail/wave shape
        icon: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 12C3 12 6 6 12 6C18 6 21 12 21 12" stroke="#4D6BFE" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M7 12C7 12 9 16 12 16C15 16 17 12 17 12" stroke="#4D6BFE" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="12" cy="9" r="1.5" fill="#4D6BFE"/>
    </svg>`,
    },
    {
        id: 'mistral',
        name: 'Mistral',
        envKey: 'MISTRAL_API_KEY',
        supportsGeneration: false,
        // Mistral's orange flame/wind swirl
        icon: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 4H8V8H4V4Z" fill="#F7D046"/>
      <path d="M10 4H14V8H10V4Z" fill="#F7D046"/>
      <path d="M16 4H20V8H16V4Z" fill="#000000"/>
      <path d="M4 10H8V14H4V10Z" fill="#F7D046"/>
      <path d="M10 10H14V14H10V10Z" fill="#FF7000"/>
      <path d="M16 10H20V14H16V10Z" fill="#F7D046"/>
      <path d="M4 16H8V20H4V16Z" fill="#000000"/>
      <path d="M10 16H14V20H10V16Z" fill="#F7D046"/>
      <path d="M16 16H20V20H16V16Z" fill="#F7D046"/>
    </svg>`,
    },
];
/**
 * Get a provider by ID
 */
export function getProvider(id) {
    return LLM_PROVIDERS.find(p => p.id === id);
}
/**
 * Get providers that support scenario generation
 */
export function getGenerationProviders() {
    return LLM_PROVIDERS.filter(p => p.supportsGeneration);
}
