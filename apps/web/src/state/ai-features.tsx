import { createContext, useContext } from 'react';
import { readAiFeatures } from './last-session.ts';

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

/**
 * The same value outside React (a photo create in `db/file-commit.ts`, a batch in
 * `photo-ops.ts`): the session's setter writes it (`setAiFeaturesValue`) beside its state, so
 * the two never diverge, even when storage is blocked; before any session read it is the
 * cached server fact, else on.
 */
let current: boolean | null = null;

export function aiFeaturesOn(): boolean {
  return current ?? readAiFeatures() ?? true;
}

/** Called by the session only; null forgets the value (sign-out). */
export function setAiFeaturesValue(on: boolean | null): void {
  current = on;
}
