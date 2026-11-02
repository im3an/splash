import type { ContentInsets } from './types';

/**
 * The assistants the AI panel can show. Each is the provider's own web app,
 * signed in with the same cookies as any page in Splash.
 */
export const AI_PROVIDERS = [
  { id: 'claude', name: 'Claude', url: 'https://claude.ai/new' },
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/' },
  { id: 'perplexity', name: 'Perplexity', url: 'https://www.perplexity.ai/' },
  { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com/app' },
  { id: 'mistral', name: 'Le Chat', url: 'https://chat.mistral.ai/chat' },
] as const;

export type AiProviderId = (typeof AI_PROVIDERS)[number]['id'];
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const AI_PROVIDER_IDS = AI_PROVIDERS.map((provider) => provider.id) as [
  AiProviderId,
  ...AiProviderId[],
];

export function aiProvider(id: AiProviderId): AiProvider {
  return AI_PROVIDERS.find((provider) => provider.id === id) ?? AI_PROVIDERS[0];
}

/**
 * Where the panel sits: its distance from each window edge in CSS pixels,
 * so the main process can follow a live resize on its own.
 */
export interface AiPanelPlacement {
  provider: AiProviderId;
  insets: ContentInsets;
}

/** What the panel's header shows about the assistant on screen. */
export interface AiPanelState {
  provider: AiProviderId;
  isLoading: boolean;
  canGoBack: boolean;
  /** Site icons of the assistants opened so far, for the picker. */
  icons: Partial<Record<AiProviderId, string>>;
  /** The assistant couldn't load; the panel offers to try again. */
  failed: boolean;
}

export type AiPanelAction = 'back' | 'reload' | 'home' | 'open-as-page';
