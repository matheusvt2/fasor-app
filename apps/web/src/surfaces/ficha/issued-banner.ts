import { fichaIssuedBannerText, latestRevision, localIssuedBannerText, type EntityState, type RelatorioStatus, type RevisionRow } from '@app/domain';
import { useMemo } from 'react';
import type { Banner } from '../../state/banner-slot.tsx';

/**
 * Status flow 2026-10-10: on an Emitido relatório the sheet says that editing reopens it (Em
 * revisão, the next revision). The revisions are read straight off `EntityState`; the text is
 * the kernel's (`fichaIssuedBannerText`), null in every other status and with no revision.
 */
export function useFichaIssuedBanner(state: EntityState, relatorioId: string, status: RelatorioStatus): Banner | null {
  return useIssuedBanner(state, relatorioId, status, fichaIssuedBannerText);
}

/**
 * Story 14.3: the same banner on "Verificações do local", with the kernel's own sentence for
 * it (`localIssuedBannerText`, "estas verificações" where the sheet's says "esta ficha").
 */
export function useLocalIssuedBanner(state: EntityState, relatorioId: string, status: RelatorioStatus): Banner | null {
  return useIssuedBanner(state, relatorioId, status, localIssuedBannerText);
}

function useIssuedBanner(
  state: EntityState,
  relatorioId: string,
  status: RelatorioStatus,
  textOf: (status: RelatorioStatus, revision: Pick<RevisionRow, 'number'> | null) => string | null,
): Banner | null {
  const text = useMemo(() => {
    const revisions = [...state.entries()].filter(([key]) => key.startsWith('revision:')).map(([, row]) => row as RevisionRow);
    return textOf(status, latestRevision(revisions.filter((row) => row.relatorio_id === relatorioId)));
  }, [state, status, relatorioId, textOf]);
  return useMemo<Banner | null>(() => (text === null ? null : { kind: 'relatorio-exported', variant: 'warning', role: 'region', text }), [text]);
}
