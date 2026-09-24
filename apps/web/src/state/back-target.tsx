import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/*
 * Where the App bar's back button goes when the route alone cannot say (Story 4.3: the
 * Sumário goes back to its project, which only the relatório row names). A surface sets
 * it while mounted and clears it on unmount; the shell reads it over the route's own
 * `handle.back`.
 */

interface BackTargetState {
  target: string | null;
  setTarget: (target: string | null) => void;
}

const BackTargetContext = createContext<BackTargetState | null>(null);

export function BackTargetProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<string | null>(null);
  const value = useMemo(() => ({ target, setTarget }), [target]);
  return <BackTargetContext value={value}>{children}</BackTargetContext>;
}

/** The current override, null when the route's own back applies. */
export function useBackTargetValue(): string | null {
  return useContext(BackTargetContext)?.target ?? null;
}

/** Sets the App bar's back destination while the caller is mounted. */
export function useBackTarget(target: string | null): void {
  const context = useContext(BackTargetContext);
  const setTarget = context?.setTarget;
  useEffect(() => {
    if (setTarget === undefined) return;
    setTarget(target);
    return () => setTarget(null);
  }, [setTarget, target]);
}
