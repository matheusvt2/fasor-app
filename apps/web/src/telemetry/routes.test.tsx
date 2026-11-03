import 'fake-indexeddb/auto';
import { screenOf } from '@app/domain';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryRouter, Outlet, RouterProvider, type RouteObject } from 'react-router';
import { appRoutes } from '../app.tsx';
import { openDatabase, type AppDatabase } from '../db/schema.ts';
import { queuedUxEvents } from '../db/ux-events-store.ts';
import { routeIdsOf, TelemetryRoutes, useScreenView } from './hooks.ts';
import { configureTelemetry, resetTelemetryForTests, whenTelemetryWritten } from './track.ts';

/*
 * E18-A1 (A2, R-V6): the kernel's route-to-screen list (`SCREEN_ROUTES` behind `screenOf`) and
 * the app's router table name the same routes separately. Every route of the table maps to a
 * screen, so a route added without its screen fails here rather than reading `other` in the
 * funnel. Then the hooks that turn routes into `screen_view` events.
 */

const DEVICE = '019966b0-0035-7000-8000-0000000000dd';
const RELATORIO = '019966b0-0035-7000-8000-000000000071';
const BLOCK = '019966b0-0035-7000-8000-000000000072';
const SAMPLE_ID = '019966b0-0035-7000-8000-0000000000aa';

/** The routes that read `other` on purpose: the section text, the dev fixture and the catch-all. */
const OTHER_ON_PURPOSE = new Set(['/relatorio/:id/secao/:blockId', '/__fixture/field', '*']);

function pathsOf(routes: readonly RouteObject[], parent = ''): string[] {
  return routes.flatMap((route) => {
    const own = route.path === undefined ? parent : route.path.startsWith('/') || route.path === '*' ? route.path : `${parent.replace(/\/$/, '')}/${route.path}`;
    return [...(route.path === undefined ? [] : [own]), ...pathsOf(route.children ?? [], own)];
  });
}

let counter = 0;
let db: AppDatabase;

beforeEach(async () => {
  resetTelemetryForTests();
  db = openDatabase(`019966b0-0035-7000-8000-${(++counter).toString(16).padStart(12, '0')}`);
  await db.open();
  configureTelemetry({ db, deviceId: DEVICE });
});

afterEach(() => {
  cleanup();
  configureTelemetry(null);
  db.close();
});

async function views() {
  await whenTelemetryWritten();
  return (await queuedUxEvents(db)).filter((e) => e.name === 'screen_view').map(({ screen, relatorio_id, block_id }) => ({ screen, relatorio_id, block_id }));
}

describe("the router table and the kernel's screens (A2)", () => {
  const paths = pathsOf(appRoutes);

  it('walks a table of every route', () => {
    expect(paths).toContain('/');
    expect(paths).toContain('/relatorio/:id/ficha/:blockId');
    expect(paths.length).toBeGreaterThanOrEqual(18);
  });

  it('maps every route to a screen other than `other`, but the section text, the dev fixture and the catch-all', () => {
    const unmapped = paths.filter((path) => !OTHER_ON_PURPOSE.has(path)).filter((path) => screenOf(path.replace(/:[A-Za-z]+/g, SAMPLE_ID)) === 'other');
    expect(unmapped).toEqual([]);
    expect(screenOf('/relatorio/:id/secao/:blockId'.replace(/:[A-Za-z]+/g, SAMPLE_ID))).toBe('other');
  });
});

describe('routeIdsOf (R-V6)', () => {
  it('keeps only uuid v7 ids, and the relatório id only on a /relatorio/ route', () => {
    expect(routeIdsOf(`/relatorio/${RELATORIO}/ficha/${BLOCK}`, { id: RELATORIO, blockId: BLOCK })).toEqual({ relatorio_id: RELATORIO, block_id: BLOCK });
    expect(routeIdsOf(`/project/${RELATORIO}`, { id: RELATORIO })).toEqual({});
    expect(routeIdsOf(`/templates/${RELATORIO}`, { id: RELATORIO })).toEqual({});
    expect(routeIdsOf('/relatorio/Cabine 1', { id: 'Cabine 1' })).toEqual({});
    // A uuid that is not v7 is not a kernel id.
    expect(routeIdsOf('/relatorio/x', { id: '6f1c0a3e-1d2b-4c5d-8e9f-0a1b2c3d4e5f', blockId: 'TAG-1' })).toEqual({});
  });
});

describe('TelemetryRoutes (R-V6)', () => {
  it('queues one screen_view per pathname change, with the ids the route names', async () => {
    const Leaf = () => null;
    const router = createMemoryRouter(
      [
        {
          element: (
            <>
              <TelemetryRoutes />
              <Outlet />
            </>
          ),
          children: [
            { path: '/', element: <Leaf /> },
            { path: '/project/:id', element: <Leaf /> },
            { path: '/relatorio/:id', element: <Leaf /> },
            { path: '/relatorio/:id/ficha/:blockId', element: <Leaf /> },
          ],
        },
      ],
      { initialEntries: ['/'] },
    );
    render(<RouterProvider router={router} />);
    await act(async () => {
      await router.navigate(`/relatorio/${RELATORIO}`);
    });
    await act(async () => {
      await router.navigate(`/relatorio/${RELATORIO}/ficha/${BLOCK}`);
    });
    // The same pathname again (a search change) is no new view.
    await act(async () => {
      await router.navigate(`/relatorio/${RELATORIO}/ficha/${BLOCK}?x=1`);
    });
    await act(async () => {
      await router.navigate(`/project/${SAMPLE_ID}`);
    });
    expect(await views()).toEqual([
      { screen: 'home', relatorio_id: undefined, block_id: undefined },
      { screen: 'sumario', relatorio_id: RELATORIO, block_id: undefined },
      { screen: 'ficha', relatorio_id: RELATORIO, block_id: BLOCK },
      { screen: 'project', relatorio_id: undefined, block_id: undefined },
    ]);
  });
});

describe('useScreenView (R-V6)', () => {
  it('queues the update and the recovery screens', async () => {
    renderHook(() => useScreenView('update'));
    renderHook(() => useScreenView('recovery'));
    expect(await views()).toEqual([
      { screen: 'update', relatorio_id: undefined, block_id: undefined },
      { screen: 'recovery', relatorio_id: undefined, block_id: undefined },
    ]);
  });
});
