import { createContext, useContext } from 'react';

/**
 * Story 11.8 follow-up: whether the AI entry points render (`SessionState.aiFeatures`, the
 * server's `AI_FEATURES` flag). `SessionProvider` provides it; outside one (a surface rendered
 * alone in a test) the entry points render, as on a server with the flag on. While false every
 * entry point of a reading kind `readingNeedsAi` names is hidden, not drawn disabled.
 */
export const AiFeaturesContext = createContext<boolean>(true);

export function useAiFeatures(): boolean {
  return useContext(AiFeaturesContext);
}
