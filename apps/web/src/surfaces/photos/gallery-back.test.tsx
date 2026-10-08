import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { BackTargetProvider, exportDialogPath, useBackTargetValue } from '../../state/back-target.tsx';
import { SyncContext } from '../../state/sync.tsx';
import { ToastProvider } from '../../state/toast.tsx';
import { makeSyncState } from '../../test/sync-state.ts';
import { GallerySurface } from './gallery-surface.tsx';

/*
 * Review F-11: the gallery opened from the Export dialog's audit "Ver" (`?volta=exportar`)
 * sends its App bar "Voltar" back to the dialog (`/relatorio/{id}?exportar=1`); opened
 * otherwise, it leaves the route's own back alone.
 */

vi.mock('../../state/session.tsx', () => ({ useSession: () => ({ database: null, user: null, online: true }) }));

const ID = '019966c1-0000-7000-8000-000000000007';

function BackProbe() {
  return <p data-testid="back-target">{useBackTargetValue() ?? 'route'}</p>;
}

function renderGallery(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/relatorio/${ID}/fotos${search}`]}>
      <SyncContext value={makeSyncState()}>
        <ToastProvider>
          <BackTargetProvider>
            <BackProbe />
            <Routes>
              <Route path="/relatorio/:id/fotos" element={<GallerySurface />} />
            </Routes>
          </BackTargetProvider>
        </ToastProvider>
      </SyncContext>
    </MemoryRouter>,
  );
}

afterEach(() => cleanup());

describe('review F-11 the gallery\'s back from the Export dialog', () => {
  it('under ?volta=exportar the back target is the Sumário with the dialog open', async () => {
    renderGallery('?volta=exportar');
    await waitFor(() => expect(screen.getByTestId('back-target')).toHaveTextContent(`/relatorio/${ID}?exportar=1`));
    expect(exportDialogPath(ID)).toBe(`/relatorio/${ID}?exportar=1`);
  });

  it('without it the route\'s own back applies', async () => {
    renderGallery('');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByTestId('back-target')).toHaveTextContent('route');
  });
});
