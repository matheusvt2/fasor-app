import 'fake-indexeddb/auto';
import { cabineOf, instantiateTemplate, SITE_ITEM_KEYS, standardTemplate, type BlockRow, type EntityState, type LocationRow } from '@app/domain';
import { portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toRecord } from '../../db/commit.ts';
import { relatorioState } from '../../db/home-store.ts';
import { relatorioSnapshotOf } from '../../db/relatorio-snapshot.ts';
import { openDatabase, type AppDatabase } from '../../db/schema.ts';
import { applyPulled } from '../../db/sync-store.ts';
import { BackTargetProvider } from '../../state/back-target.tsx';
import type { SessionState } from '../../state/session.tsx';
import { SyncContext } from '../../state/sync.tsx';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import { makeSyncState } from '../../test/sync-state.ts';
import { CabineBlock } from '../ficha/cabine-block.tsx';
import type { FichaApi } from '../ficha/ficha-api.ts';
import { SumarioSurface } from '../relatorio/sumario-surface.tsx';
import { TreeSurface } from '../relatorio/tree-surface.tsx';

/*
 * Story 14.3: the three ways into "Verificações do local", each drawn from the kernel's
 * site node or progress: the `.s9-verif` button of a local's Sumário row
 * (`40-relatorio-overview.html`), the rail's level-1 row (`shell-foot.html`) and the
 * `.ficha-local-line` under a sheet's "Do local" block (`60-ficha.html`). A relatório whose
 * seed ships no site list, a painel and a coluna offer none. Over the small Porto Seguro
 * fixture with its relatório row moved to seed v4 in the device store.
 */

const COMPANY = portoSeguroSmall.companyId;
const USER = portoSeguroSmall.userId;
const RELATORIO = portoSeguroSmall.relatorioId;
const PROJECT = portoSeguroSmall.projectId;

const id = (n: number) => `019966c1-0147-7000-8000-${n.toString(16).padStart(12, '0')}`;
const LOCAL = portoSeguroSmall.log.find((op) => op.path.startsWith('location/'))!.path.split('/')[1]!;
const PAINEL = id(1);
const COLUNA = id(2);
const SEC_TEST = portoSeguroSmall.log.filter((op) => /^block\/[^/]+$/.test(op.path))[0]!.path.split('/')[1]!;
const TARGET = `/relatorio/${RELATORIO}/local/${LOCAL}/verificacoes`;

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

vi.mock('../../state/session.tsx', () => ({ useSession: () => session() }));
vi.mock('../../state/drafts.tsx', () => ({ useDraftSource: () => () => Promise.resolve(), useDrafts: () => ({ register: () => () => undefined }) }));

configure({ asyncUtilTimeout: 5000 });

function sectionBlocksFor(relatorioId: string): BlockRow[] {
  let n = 0;
  const newId = () => `019966c1-0148-7000-8000-${(++n).toString(16).padStart(12, '0')}`;
  const { drafts } = instantiateTemplate(
    standardTemplate({ id: '019966c1-0149-7000-8000-000000000001' }),
    { id: PROJECT },
    { service_start: null, service_end: null, existingEquipment: [], responsible_user_id: null },
    { newId, actorId: USER, companyId: COMPANY },
  );
  return drafts
    .filter((d) => d.path.startsWith('block/'))
    .map((d) => d.value as unknown as BlockRow)
    .filter((b) => b.location_id === null)
    .map((b) => ({ ...b, relatorio_id: relatorioId }));
}

const cell = (value: string, n: number) => ({ value, source_suggestion_id: null, op_id: id(0x1000 + n) });

/** `answered`: how many of the 19 items the local holds an answer for (all 19: every item C). */
async function seeded(options: { seed?: string; answered?: number } = {}): Promise<AppDatabase> {
  const user = `019966c1-014a-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  await openDatabase(user).delete();
  const db = openDatabase(user);
  await applyPulled(db, portoSeguroSmall.log);
  const relatorio = (await db.entities.get(['relatorio', RELATORIO]))!;
  await db.entities.put({ ...relatorio, row: { ...(relatorio.row as object), seed_version: options.seed ?? 'v4' } as never });
  const local = (await db.entities.get(['location', LOCAL]))!;
  const checklist = Object.fromEntries(SITE_ITEM_KEYS.slice(0, options.answered ?? 0).map((key, i) => [key, { result: cell(i === 0 ? 'NC' : 'C', i) }]));
  await db.entities.put({ ...local, row: { ...(local.row as object), ...(options.answered === undefined ? {} : { checklist }) } as never });
  const base = { relatorio_id: RELATORIO, removed_at: null };
  const rows: LocationRow[] = [
    { ...base, id: PAINEL, parent_id: LOCAL, kind: 'painel', name: 'Painel de média tensão', order_key: 'a0' },
    { ...base, id: COLUNA, parent_id: PAINEL, kind: 'coluna', name: 'Coluna 5', order_key: 'a0' },
  ];
  await db.entities.bulkPut([...sectionBlocksFor(RELATORIO).map((b) => toRecord(`block:${b.id}`, b)), ...rows.map((row) => toRecord(`location:${row.id}`, row))]);
  return db;
}

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SyncContext value={makeSyncState()}>
        <ToastProvider>
          <BackTargetProvider>
            <Routes>
              <Route path="/relatorio/:id" element={<SumarioSurface />} />
              <Route path="/relatorio/:id/arvore" element={<TreeSurface />} />
              <Route path="/relatorio/:id/local/:locationId/verificacoes" element={<Where />} />
              <Route path="/relatorio/:id/ficha/:blockId" element={<p>Ficha</p>} />
            </Routes>
            <ToastOutlet />
          </BackTargetProvider>
        </ToastProvider>
      </SyncContext>
    </MemoryRouter>,
  );
}

const row = (locationId: string) => document.querySelector<HTMLElement>(`li[data-location-id="${locationId}"]`)!;

afterEach(() => {
  database?.close();
  database = null;
});

describe('14.3 entry: the local\'s Sumário row', () => {
  // Story 15.2 (the 15.1 mocks changed the markup, Bruno's answer 5): the Verificações do local is a card
  // of the sheet kind, the first under the open local; the band keeps the kicker, the name and the meta line.
  it('shows "Verificações do local" and "N de 19" as the .s9-verif card, first under the open local, and opens the surface', async () => {
    database = await seeded({ answered: 12 });
    renderAt(`/relatorio/${RELATORIO}`);
    await screen.findByRole('list', { name: 'Locais do relatório' });
    const body = row(LOCAL).querySelector(':scope > .s9-loc-row .s9-loc-body')!;
    expect([...body.children].map((el) => el.className)).toEqual(['level-kicker', 's9-loc-name', 's9-loc-meta']);
    expect(body.querySelector('.level-kicker')).toHaveTextContent('Local');
    // Collapsed, the local draws no card.
    expect(row(LOCAL).querySelector('.s9-verif')).toBeNull();
    await userEvent.click(await screen.findByRole('button', { name: 'Expandir Cabine de Testes' }));
    const list = await within(row(LOCAL)).findByRole('list', { name: 'Verificações de Cabine de Testes' });
    expect(list).toHaveClass('s9-eqs', 's9-site');
    // The first list under the band.
    expect(row(LOCAL).querySelector(':scope > ul')).toBe(list);
    const card = list.querySelector(':scope > li')!;
    expect(card).toHaveClass('s9-site-card', 'eq-card', 'block-card');
    // The fixture answers its first item NC: the badge is part of the name, as it is seen.
    const button = within(list).getByRole('button', { name: 'Verificações do local · 12 de 19 · 1 NC — Cabine de Testes' });
    expect(button).toHaveClass('s9-verif', 'eq-card-open');
    expect(button.querySelector('.eq-card-title .s9-site-name')).toHaveTextContent(/^Verificações do local$/);
    expect(button.querySelector('.eq-card-title .s9-site-count')).toHaveTextContent(/^12 de 19$/);
    expect(button.querySelector('.eq-card-title svg.ico.ico-sm use')).toHaveAttribute('href', '/sprite.svg#i-check-all');
    const state = button.querySelector('.eq-card-status .s9-state')!;
    expect(state).toHaveAttribute('data-state', 'doing');
    expect(state).toHaveTextContent('● Em preenchimento');
    expect(state.querySelector('[aria-hidden="true"]')).toHaveTextContent('●');
    // The fixture answers its first item NC: the card carries the badge (F37).
    expect(button.querySelector('.eq-card-status .nc-badge')).toHaveTextContent(/^1 NC$/);
    // The local's sheet counter stays the sheets' own.
    expect(row(LOCAL).querySelector(':scope > .s9-loc-row .progress-counter')).toHaveTextContent(/^\d+ de \d+$/);
    expect(row(LOCAL).querySelector(':scope > .s9-loc-row .progress-counter')).not.toHaveTextContent('19');
    // Left on the card, as on a sheet card, goes to its local's chevron (EXPERIENCE.md › Relatório tree).
    expect(button).toHaveAttribute('data-tree-open');
    button.focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('button', { name: 'Recolher Cabine de Testes' })).toHaveFocus();

    await userEvent.click(button);
    expect(await screen.findByTestId('where')).toHaveTextContent(TARGET);
  });

  it('a painel and a coluna carry no such button; a relatório on seed v3 or v1 shows none at all', async () => {
    database = await seeded({});
    const first = renderAt(`/relatorio/${RELATORIO}`);
    await screen.findByRole('list', { name: 'Locais do relatório' });
    await userEvent.click(await screen.findByRole('button', { name: 'Expandir Cabine de Testes' }));
    await waitFor(() => expect(row(COLUNA)).not.toBeNull());
    expect(document.querySelectorAll('.s9-verif')).toHaveLength(1);
    expect(row(PAINEL).querySelector('.s9-verif')).toBeNull();
    // Story 15.2: the card under the open local, "0 de 19" and "Vazia".
    const card = row(LOCAL).querySelector(':scope > ul.s9-site .s9-verif')!;
    expect(card.querySelector('.s9-site-count')).toHaveTextContent('0 de 19');
    expect(card.querySelector('.s9-state')).toHaveAttribute('data-state', 'empty');
    expect(card.querySelector('.s9-state')).toHaveTextContent('○ Vazia');
    first.unmount();
    database.close();

    for (const seed of ['v3', 'v1']) {
      database = await seeded({ seed });
      const view = renderAt(`/relatorio/${RELATORIO}`);
      await screen.findByRole('list', { name: 'Locais do relatório' });
      expect(row(LOCAL).querySelector('.s9-loc-name')).toHaveTextContent('Cabine de Testes');
      expect(document.querySelector('.s9-verif')).toBeNull();
      view.unmount();
      database.close();
    }
  });
});

describe('14.3 entry: the rail', () => {
  it.each([
    [0, 'vazia', '0 de 19'],
    [12, 'em-preenchimento', '12 de 19'],
    [19, 'concluida', '19 de 19'],
  ] as const)('a local opens on its "Verificações do local" row: %i answered reads %s, "%s"', async (answered, state, text) => {
    database = await seeded({ answered });
    renderAt(`/relatorio/${RELATORIO}/arvore`);
    await userEvent.click(await screen.findByRole('button', { name: 'Expandir Cabine de Testes' }));
    const group = row(LOCAL).querySelector(':scope > ul.relatorio-tree')!;
    const first = group.firstElementChild as HTMLElement;
    expect(first.dataset.siteOf).toBe(LOCAL);
    const line = first.querySelector(':scope > .tree-row')!;
    expect(line).toHaveAttribute('data-level', '1');
    // Story 15.2 (the 15.1 mocks changed the markup): a card of the sheet kind, "N de 19" as its
    // progress beside the label and the sheet's state word under it.
    expect(line).toHaveClass('eq-card', 'site-card');
    // Story 15.2: the fixture answers its first item NC once any is answered; the badge is part of the name.
    const body = within(line as HTMLElement).getByRole('button', { name: answered === 0 ? 'Verificações do local — Cabine de Testes' : 'Verificações do local · 1 NC — Cabine de Testes' });
    expect(body).toHaveClass('tree-body');
    expect(body.querySelector('.tree-id use')).toHaveAttribute('href', '/sprite.svg#i-check-all');
    expect(body.querySelector('.tree-id .tree-name')).toHaveTextContent(/^Verificações do local$/);
    expect(body.querySelector('.tree-id .tree-meta')).toHaveTextContent(new RegExp(`^${text}$`));
    const stateEl = line.querySelector('.eq-card-status .tree-state')!;
    expect(stateEl).toHaveAttribute('data-state', state);
    expect(stateEl).toHaveTextContent({ vazia: 'Vazia', 'em-preenchimento': 'Em preenchimento', concluida: 'Concluída' }[state]);
    // The painel under the local, and its coluna, have no such row.
    expect(document.querySelectorAll('li[data-site-of]')).toHaveLength(1);

    await userEvent.click(body);
    expect(await screen.findByTestId('where')).toHaveTextContent(TARGET);
  });

  it('a relatório on seed v3 has no such row', async () => {
    database = await seeded({ seed: 'v3' });
    renderAt(`/relatorio/${RELATORIO}/arvore`);
    await userEvent.click(await screen.findByRole('button', { name: 'Expandir Cabine de Testes' }));
    await waitFor(() => expect(row(LOCAL).querySelector(':scope > ul.relatorio-tree')).not.toBeNull());
    expect(document.querySelector('li[data-site-of]')).toBeNull();
  });
});

describe('14.3 entry: the line under the sheet\'s "Do local" block', () => {
  const api: FichaApi = {
    relatorioId: RELATORIO,
    projectId: PROJECT,
    blockId: SEC_TEST,
    author: { id: USER, companyId: COMPANY },
    commit: async () => undefined,
    edit: async () => null,
    undoable: () => undefined,
    announce: () => undefined,
  };

  async function renderBlock(first: boolean) {
    const state = (await relatorioState(database!, RELATORIO)) as EntityState;
    const snapshot = relatorioSnapshotOf(state, RELATORIO);
    const cabine = cabineOf(snapshot.locations, LOCAL)!;
    return render(
      <MemoryRouter initialEntries={[`/relatorio/${RELATORIO}/ficha/${SEC_TEST}`]}>
        <SyncContext value={makeSyncState()}>
          <ToastProvider>
            <Routes>
              <Route
                path="/relatorio/:id/ficha/:blockId"
                element={<CabineBlock api={api} state={state} snapshot={snapshot} cabine={cabine} first={first} envTarget={() => ({ blockId: SEC_TEST, itemKey: null, caption: null })} />}
              />
              <Route path="/relatorio/:id/local/:locationId/verificacoes" element={<Where />} />
            </Routes>
          </ToastProvider>
        </SyncContext>
      </MemoryRouter>,
    );
  }

  it.each([
    ['the collapsed line of a later sheet', false],
    ['the open block of the local\'s first sheet', true],
  ] as const)('under %s: "Verificações do local", its counter and "Abrir", which opens the surface', async (_name, first) => {
    database = await seeded({ answered: 12 });
    const { container } = await renderBlock(first);
    const line = within(container).getByRole('group', { name: 'Verificações do local' });
    expect(line).toHaveClass('cabine-line', 'ficha-local-line');
    expect(line.querySelector('svg.ico.ico-sm use')).toHaveAttribute('href', '/sprite.svg#i-check-all');
    expect(line.querySelector('.cl-name')).toHaveTextContent('Verificações do local');
    expect(line.querySelector('.cl-values')).toHaveTextContent('12 de 19');
    // Last of what the block draws, under the "Do local" line or sections.
    expect(container.lastElementChild).toBe(line);
    expect(container.querySelectorAll(first ? 'section.se-block' : '.cabine-line:not(.ficha-local-line)').length).toBeGreaterThan(0);
    await userEvent.click(within(line).getByRole('button', { name: 'Abrir' }));
    expect(await screen.findByTestId('where')).toHaveTextContent(TARGET);
  });

  it('a relatório on seed v3 has no such line', async () => {
    database = await seeded({ seed: 'v3' });
    const { container } = await renderBlock(false);
    expect(container.querySelector('.cabine-line')).not.toBeNull();
    expect(container.querySelector('.ficha-local-line')).toBeNull();
  });
});
