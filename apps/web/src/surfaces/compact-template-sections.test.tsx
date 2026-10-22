import 'fake-indexeddb/auto';
import { instantiateTemplate, standardTemplate, type BlockRow } from '@app/domain';
import { BLOCK_CHAVE_ID, BLOCK_DISJUNTOR_ID, portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { cleanup, configure, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toRecord } from '../db/commit.ts';
import { openDatabase, type AppDatabase } from '../db/schema.ts';
import { applyPulled } from '../db/sync-store.ts';
import { BackTargetProvider } from '../state/back-target.tsx';
import { ExtraBannerProvider } from '../state/extra-banner.tsx';
import type { SessionState } from '../state/session.tsx';
import { SyncContext } from '../state/sync.tsx';
import { ToastOutlet, ToastProvider } from '../state/toast.tsx';
import { makeSyncState } from '../test/sync-state.ts';
import { FichaSurface } from './ficha/ficha-surface.tsx';
import { GallerySurface } from './photos/gallery-surface.tsx';
import { PointsSurface } from './points/points-surface.tsx';

/*
 * UX pass 2026-10-22 (F43, coordinator review): the surfaces that name a section, over the
 * small Porto Seguro fixture with the section blocks of a compact template (sections 1, 5, 7,
 * 8, 9 and 10, so Registro fotográfico is row 3, Pontos de atenção 4, Relatórios dos ensaios 5,
 * Conclusão e parecer 6). Every number a person reads is the Sumário position; no FO.SERV-03
 * 9, 10 or 11 is left on the page.
 */

const COMPANY = portoSeguroSmall.companyId;
const USER = portoSeguroSmall.userId;
const RELATORIO = portoSeguroSmall.relatorioId;

let database: AppDatabase | null = null;
let counter = 0;

const session = (): SessionState => ({
  status: 'signed-in',
  user: { id: USER, name: 'Bento Braga', email: 'b@teste.local', companyId: COMPANY, companyName: 'Empresa B de Teste', council: null, registrationNumber: null, title: null },
  online: true,
  reAuthRequired: false,
  aiFeatures: true,
  database,
  signIn: vi.fn(),
  signOut: vi.fn(async () => {}),
  saveRegistration: vi.fn(async () => {}),
  savePhotoLocation: vi.fn(async () => {}),
  recoveryNeeded: false,
  dismissRecovery: vi.fn(),
});

vi.mock('../state/session.tsx', () => ({ useSession: () => session() }));
vi.mock('../state/drafts.tsx', () => ({ useDraftSource: () => async () => undefined, useDrafts: () => ({ register: () => () => undefined, persistOne: async () => undefined }) }));

configure({ asyncUtilTimeout: 5000 });

const NO_FO_SERV_NUMBER = /[Ss]eção (9|10|11)\b/;

/** The section blocks of a compact template, retargeted at the fixture's relatório. */
function compactSectionBlocks(): BlockRow[] {
  let n = 0;
  const { drafts } = instantiateTemplate(
    standardTemplate({ id: '019966c1-00f2-7000-8000-000000000001' }),
    { id: portoSeguroSmall.projectId },
    { service_start: null, service_end: null, existingEquipment: [], responsible_user_id: null },
    { newId: () => `019966c1-00f3-7000-8000-${(++n).toString(16).padStart(12, '0')}`, actorId: USER, companyId: COMPANY },
  );
  return drafts
    .filter((d) => d.path.startsWith('block/'))
    .map((d) => d.value as unknown as BlockRow)
    .filter((b) => b.location_id === null && !['section_2', 'section_3', 'section_4', 'section_6', 'section_11'].includes(b.block_type))
    .map((b) => ({ ...b, relatorio_id: RELATORIO, created_by: USER }));
}

async function compactDb(): Promise<AppDatabase> {
  const user = `019966c1-00f4-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  await openDatabase(user).delete();
  const db = openDatabase(user);
  await applyPulled(db, portoSeguroSmall.log);
  await db.entities.bulkPut(compactSectionBlocks().map((b) => toRecord(`block:${b.id}`, b)));
  return db;
}

function renderAt(path: string, route: string, element: ReactElement) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SyncContext value={makeSyncState()}>
        <ToastProvider>
          <BackTargetProvider>
            <ExtraBannerProvider>
              <Routes>
                <Route path={route} element={element} />
              </Routes>
              <ToastOutlet />
            </ExtraBannerProvider>
          </BackTargetProvider>
        </ToastProvider>
      </SyncContext>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  database?.close();
  database = null;
});

describe('F43 (UX pass 2026-10-22): a compact template, surface by surface', () => {
  it('Pontos de atenção: the note, the list, a new point\'s order and the remove confirm say "seção 4"', async () => {
    database = await compactDb();
    const { container } = renderAt(`/relatorio/${RELATORIO}/pontos`, '/relatorio/:id/pontos', <PointsSurface />);
    await waitFor(() => expect(container.querySelector('.section-note')).toHaveTextContent(/^A ordem aqui é a ordem da seção 4 do relatório\..*a seção 4 imprime, depois dos pontos/));
    expect(screen.getByRole('group', { name: 'Pontos de atenção da seção 4' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Criar$/ }));
    await waitFor(() => expect(container.querySelector('.poa-order')).toHaveTextContent('Novo ponto · entra no fim da seção 4'));
    expect(container.textContent).not.toMatch(NO_FO_SERV_NUMBER);
  });

  it('Pontos de atenção: removing a point says it leaves "seção 4"', async () => {
    database = await compactDb();
    const id = '019966c1-00f5-7000-8000-000000000001';
    await database.entities.put(
      toRecord(`point:${id}`, { id, relatorio_id: RELATORIO, text: 'Detector de tensão inoperante.', equipment_id: null, origin: 'manual', order_key: 'a0', removed_at: null, action: null, priority: null, deadline: null, owner: null }),
    );
    renderAt(`/relatorio/${RELATORIO}/pontos`, '/relatorio/:id/pontos', <PointsSurface />);
    await userEvent.click(await screen.findByRole('button', { name: /^Editar o ponto 1/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Remover ponto' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remover este ponto de atenção?' });
    expect(dialog).toHaveTextContent('Ele sai da seção 4. Um toque em Desfazer o traz de volta.');
    expect(document.body.textContent).not.toMatch(NO_FO_SERV_NUMBER);
  });

  it('Fotos: the note says "seção 3 do relatório"', async () => {
    database = await compactDb();
    const { container } = renderAt(`/relatorio/${RELATORIO}/fotos`, '/relatorio/:id/fotos', <GallerySurface />);
    await waitFor(() => expect(container.querySelector('.section-note')).toHaveTextContent('Os números são provisórios até a exportação (seção 3 do relatório).'));
    expect(container.textContent).not.toMatch(NO_FO_SERV_NUMBER);
  });

  it('a ficha: its conclusion helper names "seção 5", through the ficha surface', async () => {
    database = await compactDb();
    const { container } = renderAt(`/relatorio/${RELATORIO}/ficha/${BLOCK_CHAVE_ID}`, '/relatorio/:id/ficha/:blockId', <FichaSurface />);
    await waitFor(() => expect(container.querySelector('.ficha-conc-text')).toHaveTextContent(/linha Conclusão da (ficha \()?seção 5/));
    expect(container.textContent).not.toMatch(NO_FO_SERV_NUMBER);
  });

  it('a ficha marked not tested: its band says it "entra na seção 4"', async () => {
    database = await compactDb();
    const { container } = renderAt(`/relatorio/${RELATORIO}/ficha/${BLOCK_DISJUNTOR_ID}`, '/relatorio/:id/ficha/:blockId', <FichaSurface />);
    await waitFor(() => expect(container.querySelector('.not-tested-band')).toHaveTextContent('e entra na seção 4 automaticamente.'));
    expect(container.textContent).not.toMatch(NO_FO_SERV_NUMBER);
  });
});
