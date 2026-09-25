import { useEffect } from 'react';

/*
 * Story 12.2: a surface opened with navigation state (the Sumário from a sheet's "Voltar" or
 * setup's "Concluir"; Cadastros from setup Etapa 4) reads it once into component state, then
 * forgets it here, so a reload or a browser back onto the same entry opens the surface plain.
 *
 * It rewrites the browser history entry in place, never through the router: a router
 * `navigate(..., { replace: true })` is a second navigation that, under load, can land after
 * the person's next tap and pull them back (12.2-E2E-002). React Router keeps its state in
 * `history.state.usr` and reads it again only on a pop or a reload, which is exactly when the
 * arrival must be gone.
 */
export function useForgetArrivalState(): void {
  useEffect(() => {
    const entry: unknown = window.history.state;
    if (typeof entry !== 'object' || entry === null || !('usr' in entry) || entry.usr == null) return;
    window.history.replaceState({ ...entry, usr: null }, '');
  }, []);
}
