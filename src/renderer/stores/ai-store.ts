import { create } from 'zustand';
import type { AiPanelState } from '../../shared/ai';
import type { SplashApi } from '../../shared/api';

interface AiPanelStore {
  open: boolean;
  /** What the assistant on screen is doing, as the main process reports it. */
  state: AiPanelState | null;
  toggle(): void;
  close(): void;
}

/** The AI panel beside the page: open or not, for this window. */
export const useAiPanel = create<AiPanelStore>()((set) => ({
  open: false,
  state: null,
  toggle: () => set((store) => ({ open: !store.open })),
  close: () => set({ open: false }),
}));

export function connectAiPanel(splash: SplashApi): () => void {
  const offState = splash.onAiPanel((state) => useAiPanel.setState({ state }));
  const offCommands = splash.onUiCommand((command) => {
    if (command.type === 'toggle-ai-panel') useAiPanel.getState().toggle();
  });
  return () => {
    offState();
    offCommands();
  };
}
