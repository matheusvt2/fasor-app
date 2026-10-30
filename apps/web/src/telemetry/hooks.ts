import { errorCodeSchema, screenOf, uuidV7Schema, type Screen, type UxDialogTarget, type UxOutcome, type WaitKind } from '@app/domain';
import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useMatches } from 'react-router';
import { track } from './track.ts';

/*
 * Epic 18, Story 18.1: the React side of usage events. `TelemetryRoutes` queues one
 * `screen_view` per route change, carrying only the relatório and block ids the route's
 * params name (uuid v7, nothing else of the path); `useDialogTelemetry` queues a dialog's
 * `dialog_open` and `dialog_cancel`; `startWait` times a wait; `trackError` names an api
 * error code the user saw.
 */

/** The ids a route's params name, each only when it is a kernel id. */
export function routeIdsOf(pathname: string, params: Readonly<Record<string, string | undefined>>): { relatorio_id?: string; block_id?: string } {
  const relatorio = pathname.startsWith('/relatorio/') ? params.id : undefined;
  const block = params.blockId;
  return {
    ...(relatorio !== undefined && uuidV7Schema.safeParse(relatorio).success ? { relatorio_id: relatorio } : {}),
    ...(block !== undefined && uuidV7Schema.safeParse(block).success ? { block_id: block } : {}),
  };
}

/** Rendered once at the router's root: a `screen_view` per pathname change. */
export function TelemetryRoutes(): null {
  const location = useLocation();
  const matches = useMatches();
  const params = matches.at(-1)?.params ?? {};
  const last = useRef<string | null>(null);
  const pathname = location.pathname;
  const ids = routeIdsOf(pathname, params);
  const relatorioId = ids.relatorio_id;
  const blockId = ids.block_id;
  useEffect(() => {
    if (last.current === pathname) return;
    last.current = pathname;
    track({
      name: 'screen_view',
      screen: screenOf(pathname),
      ...(relatorioId === undefined ? {} : { relatorio_id: relatorioId }),
      ...(blockId === undefined ? {} : { block_id: blockId }),
    });
  }, [pathname, relatorioId, blockId]);
  return null;
}

/** A full-surface state that replaces the routes (the 426 update screen, the eviction recovery) says it was shown. */
export function useScreenView(screen: Screen): void {
  useEffect(() => {
    track({ name: 'screen_view', screen });
  }, [screen]);
}

/**
 * Queues `dialog_open` each time `isOpen` turns true, and returns the cancel to call from the
 * dialog's cancel path (the "Cancelar" button, Escape, a tap outside): `dialog_cancel`.
 */
export function useDialogTelemetry(dialog: UxDialogTarget, isOpen: boolean = true, screen?: Screen): () => void {
  useEffect(() => {
    if (isOpen) track({ name: 'dialog_open', target: dialog, ...(screen === undefined ? {} : { screen }) });
  }, [dialog, isOpen, screen]);
  return useCallback(() => track({ name: 'dialog_cancel', target: dialog, ...(screen === undefined ? {} : { screen }) }), [dialog, screen]);
}

/** Starts timing a wait; the returned function queues its `wait` with the outcome once. */
export function startWait(kind: WaitKind, ids: { relatorio_id?: string; block_id?: string; screen?: Screen } = {}): (outcome: UxOutcome) => void {
  const started = typeof performance === 'undefined' ? Date.now() : performance.now();
  let done = false;
  return (outcome) => {
    if (done) return;
    done = true;
    const ended = typeof performance === 'undefined' ? Date.now() : performance.now();
    track({ name: 'wait', kind, outcome, duration_ms: Math.max(0, Math.round(ended - started)), ...ids });
  };
}

/** Queues an `error` with the api error code the user saw; anything that is not a kernel code is dropped. */
export function trackError(code: unknown, ids: { relatorio_id?: string; block_id?: string; screen?: Screen } = {}): void {
  const parsed = errorCodeSchema.safeParse(code);
  if (!parsed.success) return;
  track({ name: 'error', kind: parsed.data, ...ids });
}
