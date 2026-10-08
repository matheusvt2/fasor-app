import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';

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

/** The query a surface opened from the Export dialog carries (`?volta=exportar`; the setup's precedent). */
export const RETURN_PARAM = 'volta';
export const RETURN_TO_EXPORT = 'exportar';

/** The Sumário with its Export dialog open (`?exportar=1`, `EXPORT_PARAM` of `generate-action.tsx`). */
export function exportDialogPath(relatorioId: string): string {
  return `/relatorio/${relatorioId}?exportar=1`;
}

/**
 * Review F-11: a sheet or the gallery opened from the Export dialog's audit "Ver"
 * (`?volta=exportar`) sends its App bar "Voltar" back to that dialog; otherwise the route's
 * own back applies.
 */
export function useBackToExport(relatorioId: string): void {
  const [search] = useSearchParams();
  useBackTarget(search.get(RETURN_PARAM) === RETURN_TO_EXPORT ? exportDialogPath(relatorioId) : null);
}
