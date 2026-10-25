import {
  filterCompactRules,
  type IndexedCMPRuleset,
} from '@duckduckgo/autoconsent';
import compactRules from '@duckduckgo/autoconsent/rules/compact-rules.json';

/**
 * Only ever rejects. Known banners are answered with their own "Reject"
 * steps; unknown ones only if a reject button can be told apart. A banner
 * with no way to reject stays for the user to answer.
 */
export const AUTOCONSENT_CONFIG = {
  enabled: true,
  autoAction: 'optOut',
  // Hides every Sourcepoint banner in the page, "consent or pay" walls
  // included. Those must stay visible; the frame rule still rejects real
  // banners from inside them.
  disabledCmps: ['sourcepoint-top'],
  enablePrehide: true,
  enableCosmeticRules: true,
  enableGeneratedRules: true,
  enableHeuristicDetection: true,
  enablePopupMutationObserver: true,
  heuristicMode: 'reject',
  detectRetries: 20,
  isMainWorld: false,
  prehideTimeout: 2000,
  heuristicPopupSearchTimeout: 5000,
  visualTest: false,
  performanceLoggingEnabled: false,
  logs: {
    lifecycle: false,
    rulesteps: false,
    detectionsteps: false,
    evals: false,
    errors: false,
    messages: false,
    waits: false,
  },
} as const;

/** Where a message came from, as the main process knows it. */
export interface FrameContext {
  frameUrl: string;
  isMainFrame: boolean;
  /** Whether cookie notices are handled on the page the frame is in. */
  enabled: boolean;
  /** Runs code in the frame's own page context. */
  evaluate(code: string): Promise<unknown>;
}

/**
 * The answer to one message from autoconsent in a frame, or `null` for
 * messages that need none. Messages come from web content, so anything
 * malformed is ignored.
 */
export async function autoconsentReply(
  message: unknown,
  frame: FrameContext,
): Promise<unknown> {
  if (typeof message !== 'object' || message === null) return null;
  const { type, id, code } = message as Record<string, unknown>;
  if (type === 'init') {
    return {
      type: 'initResp',
      config: { ...AUTOCONSENT_CONFIG, enabled: frame.enabled },
      rules: frame.enabled
        ? {
            autoconsent: [],
            compact: filterCompactRules(compactRules as IndexedCMPRuleset, {
              url: frame.frameUrl,
              mainFrame: frame.isMainFrame,
            }),
          }
        : { autoconsent: [] },
    };
  }
  if (type === 'eval' && typeof id === 'string' && typeof code === 'string') {
    if (!frame.enabled) return null;
    const result = await frame.evaluate(code).catch(() => false);
    return { type: 'evalResp', id, result };
  }
  return null;
}
