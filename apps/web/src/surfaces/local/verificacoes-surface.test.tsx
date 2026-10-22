import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { siteItems, type LocationRow, type PointRow, type RelatorioRow, type RevisionRow } from '@app/domain';

import { portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from '../../test-axe.ts';
import { toRecord } from '../../db/commit.ts';
import { commitPhotoCapture } from '../../db/file-commit.ts';
import { openDatabase, type AppDatabase } from '../../db/schema.ts';
import { applyPulled } from '../../db/sync-store.ts';
import { ExtraBannerProvider, useExtraBannerValue } from '../../state/extra-banner.tsx';
import type { SessionState } from '../../state/session.tsx';
import { StatusToaster } from '../../state/status-toaster.tsx';
import { SyncContext } from '../../state/sync.tsx';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import { makeSyncState } from '../../test/sync-state.ts';
import { VerificacoesSurface } from './verificacoes-surface.tsx';

/** The v4 site list these tests run on (19 keys; seed v9 appends two, Story 15.3). */
const SITE_ITEM_KEYS = siteItems('v4').map((item) => item.key);

/*
 * Story 14.3: "Verificações do local" (`61-verificacoes-local.html`) over the small Porto
 * Seguro fixture, its relatório row moved to seed v4 in the device store (the fixture's own
 * log stays v1): the local "Cabine de Testes", plus a second local, a painel and a coluna
 * where a test needs them. Every write is read back from the outbox.
 */

const COMPANY = portoSeguroSmall.companyId;
const USER = portoSeguroSmall.userId;
const RELATORIO = portoSeguroSmall.relatorioId;

const id = (n: number) => `019966c1-0143-7000-8000-${n.toString(16).padStart(12, '0')}`;
const LOCAL = portoSeguroSmall.log.find((op) => op.path.startsWith('location/'))!.path.split('/')[1]!;
const OTHER_LOCAL = id(1);
const PAINEL = id(2);
const COLUNA = id(3);
const PHOTO = id(4);
const REVISION = id(5);

const LUVAS = 'luvas_isolantes_compativeis_com_a_tensao_com_ensaio_dieletrico_valido';
const TAPETE = 'tapete_ou_estrado_isolante';
const EXTINTOR = 'extintor_de_incendio_carregado_lacrado_dentro_da_validade_sinalizado_e_desobstruido';
const EMERGENCIA = 'iluminacao_de_emergencia_autonomia_minima_de_2_h';
const ROUTE = '/relatorio/:id/local/:locationId/verificacoes';

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
// The typed observation and the point editor are draft sources; drafts have their own suite.
vi.mock('../../state/drafts.tsx', () => ({ useDraftSource: () => () => Promise.resolve(), useDrafts: () => ({ register: () => () => undefined }) }));

configure({ asyncUtilTimeout: 5000 });

interface Seeded {
  seed?: string;
  status?: RelatorioRow['status'];
  funcao?: string;
  /** The checklist cells the local starts with (as a pulled row holds them). */
  checklist?: Record<string, { result?: string | null; observation?: string | null }>;
  second?: boolean;
  revision?: number;
  /** The local was removed in the tree (`removed_at` set): its answers stay on the row, hidden. */
  removed?: boolean;
}

const cell = (value: string | null, n: number) => ({ value, source_suggestion_id: null, op_id: id(0x1000 + n) });

async function seeded(options: Seeded = {}): Promise<AppDatabase> {
  const user = `019966c1-0144-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  await openDatabase(user).delete();
  const db = openDatabase(user);
  await applyPulled(db, portoSeguroSmall.log);
  const relatorio = (await db.entities.get(['relatorio', RELATORIO]))!;
  await db.entities.put({ ...relatorio, row: { ...(relatorio.row as object), seed_version: options.seed ?? 'v4', status: options.status ?? 'em_campo' } as never });
  const local = (await db.entities.get(['location', LOCAL]))!;
  let n = 0;
  const checklist = Object.fromEntries(
    Object.entries(options.checklist ?? {}).map(([key, entry]) => [
      key,
      {
        ...(entry.result === undefined ? {} : { result: cell(entry.result, ++n) }),
        ...(entry.observation === undefined ? {} : { observation: cell(entry.observation, ++n) }),
      },
    ]),
  );
  await db.entities.put({
    ...local,
    ...(options.removed === true ? { removed_at: '2026-09-08T10:00:00.000Z' } : {}),
    row: {
      ...(local.row as object),
      ...(options.funcao === undefined ? {} : { funcao: options.funcao }),
      ...(options.checklist === undefined ? {} : { checklist }),
      ...(options.removed === true ? { removed_at: '2026-09-08T10:00:00.000Z' } : {}),
    } as never,
  });
  const base = { relatorio_id: RELATORIO, removed_at: null };
  const rows: LocationRow[] = [
    { ...base, id: PAINEL, parent_id: LOCAL, kind: 'painel', name: 'Painel de média tensão', order_key: 'a0' },
    { ...base, id: COLUNA, parent_id: PAINEL, kind: 'coluna', name: 'Coluna 5', order_key: 'a0' },
  ];
  if (options.second === true) {
    rows.push({
      ...(local.row as LocationRow),
      id: OTHER_LOCAL,
      name: 'Cubículo Enel',
      order_key: 'z0',
      checklist: { [EMERGENCIA]: { result: cell('NC', 90), observation: cell('Bateria da luminária vencida', 91) } },
    } as LocationRow);
  }
  await db.entities.bulkPut(rows.map((row) => toRecord(`location:${row.id}`, row)));
  if (options.revision !== undefined) {
    const row: RevisionRow = { id: REVISION, relatorio_id: RELATORIO, number: options.revision, snapshot_seq: 10, created_by: USER, docx_file_id: id(6), pdf_file_id: id(7), created_at: '2026-09-10T12:00:00.000Z' };
    await db.entities.put(toRecord(`revision:${REVISION}`, row as never));
  }
  return db;
}

function BannerProbe() {
  return <p data-testid="banner">{useExtraBannerValue()?.text ?? ''}</p>;
}

function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname} ${JSON.stringify(location.state)}`}</p>;
}

function renderAt(locationId: string) {
  return render(
    <MemoryRouter initialEntries={[`/relatorio/${RELATORIO}/local/${locationId}/verificacoes`]}>
      <SyncContext value={makeSyncState()}>
        <ToastProvider>
          <ExtraBannerProvider>
            <StatusToaster />
            <BannerProbe />
            <Routes>
              <Route path={ROUTE} element={<VerificacoesSurface />} />
              <Route path="/relatorio/:id" element={<Where />} />
            </Routes>
            <ToastOutlet />
          </ExtraBannerProvider>
        </ToastProvider>
      </SyncContext>
    </MemoryRouter>,
  );
}

async function open(options: Seeded = {}, locationId = LOCAL) {
  database = await seeded(options);
  const view = renderAt(locationId);
  await screen.findByRole('heading', { level: 2, name: /^Verificações do local — / });
  return view;
}

const rowOf = (itemKey: string) => document.querySelector<HTMLElement>(`li.checklist-row[data-item-key="${itemKey}"]`)!;
const seg = (itemKey: string, name: 'Conforme' | 'Não conforme' | 'Não se aplica') => within(rowOf(itemKey)).getByRole('radio', { name });
const counter19 = () => screen.getByTestId('local-progress');
const toastText = () => screen.queryByTestId('toast')?.textContent ?? '';
const outbox = async () =>
  (await database!.outbox.toArray())
    .sort((a, b) => (a.client_ts < b.client_ts ? -1 : a.client_ts > b.client_ts ? 1 : a.op_id < b.op_id ? -1 : 1))
    .map((op) => ({ path: op.path, kind: op.kind, value: op.value, batch: op.batch_id }));
const localRow = async () => (await database!.entities.get(['location', LOCAL]))!.row as Extract<LocationRow, { kind: 'cabine' }>;
const relatorioRow = async () => (await database!.entities.get(['relatorio', RELATORIO]))!.row as RelatorioRow;
const resultPath = (itemKey: string) => `location/${LOCAL}/checklist/${itemKey}/result`;
const observationPath = (itemKey: string) => `location/${LOCAL}/checklist/${itemKey}/observation`;

afterEach(() => {
  database?.close();
  database = null;
});

describe('14.3 "Verificações do local": the surface', () => {
  it('draws the header, the intro and the 19 items under their six groups, with the mock\'s class names', async () => {
    const { container } = await open({ funcao: 'primaria' });
    const header = container.querySelector('.sheet-header')!;
    expect(header.querySelector('.sheet-title')).toHaveTextContent('Verificações do local — Cabine de Testes');
    expect([...header.querySelectorAll('.sheet-meta')].map((el) => el.textContent?.trim())).toEqual(['Função: Primária', '']);
    expect(header.querySelector('.sheet-summary')).toHaveTextContent('Uma vez por local, vale para todos os equipamentos dele.');
    expect(header.querySelector('.vl-head-side .progress-counter')).toHaveAttribute('data-state', 'pending');
    expect(counter19()).toHaveTextContent('0 de 19');

    const intro = container.querySelector('.content > .vl-intro')!;
    const bar = within(intro as HTMLElement).getByRole('group', { name: 'Ações em lote das verificações do local' });
    expect(bar).toHaveClass('bulk-action-bar');
    expect(within(bar).getAllByRole('button').map((el) => el.textContent)).toEqual(['Marcar os restantes como Conforme']);
    expect(intro.querySelector('p.checklist-legend')).toHaveTextContent('C Conforme · NC Não conforme · NA Não se aplica');

    const groups = [...container.querySelectorAll('.content > section.section.vl-group')];
    expect(groups.map((group) => [group.querySelector('h3.vl-group-title')!.textContent, group.querySelector('.section-head .btn-reason')!.textContent, group.querySelectorAll('ul.checklist > li.checklist-row').length])).toEqual([
      ['Segurança e EPC no local', '0 de 7', 7],
      ['Combate a incêndio', '0 de 2', 2],
      ['Iluminação', '0 de 2', 2],
      ['Aterramento', '0 de 2', 2],
      ['Sinalização e documentação', '0 de 3', 3],
      ['Ambiente', '0 de 3', 3],
    ]);
    for (const group of groups) expect(group).toHaveAccessibleName(group.querySelector('h3')!.textContent!);
    const rows = [...container.querySelectorAll<HTMLElement>('li.checklist-row')];
    expect(rows.map((row) => row.dataset.itemKey)).toEqual(SITE_ITEM_KEYS);
    expect(rows.map((row) => row.querySelector('.row-num')!.textContent)).toEqual(Array.from({ length: 19 }, (_, i) => `${i + 1}.`));
    // The seed's labels as approved, sentence case, an acronym kept.
    expect(rowOf('epi_disponivel').querySelector('.row-label')).toHaveTextContent('6.EPI disponível');
    expect(within(rowOf(EMERGENCIA)).getByRole('radiogroup', { name: '11. Iluminação de emergência (autonomia mínima de 2 h)' })).toHaveClass('tri-state');
    expect(container.querySelectorAll('[role="radio"][aria-checked="true"]')).toHaveLength(0);

    const sticky = container.querySelector('.sticky-action-bar .bar-buttons')!;
    expect([...sticky.querySelectorAll('button')].map((el) => [el.textContent, el.className])).toEqual([
      ['Ver árvore', 'btn btn-secondary'],
      ['Concluir verificações', 'btn btn-primary'],
    ]);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('a local with no Função has no Função line; a second local\'s header names that local', async () => {
    const { container } = await open({ second: true }, OTHER_LOCAL);
    expect(container.querySelector('.sheet-title')).toHaveTextContent('Verificações do local — Cubículo Enel');
    expect(container.querySelector('.sheet-header')).not.toHaveTextContent('Função:');
    expect(counter19()).toHaveTextContent('1 de 19');
  });

  it('an answer is one location/{id}/checklist/{item}/result put; the counters and the attribution follow', async () => {
    await open();
    await userEvent.click(seg(LUVAS, 'Conforme'));
    await waitFor(() => expect(counter19()).toHaveTextContent('1 de 19'));
    expect(seg(LUVAS, 'Conforme')).toHaveAttribute('aria-checked', 'true');
    expect(rowOf(LUVAS).closest('section')!.querySelector('.section-head .btn-reason')).toHaveTextContent('1 de 7');
    expect(await outbox()).toEqual([{ path: resultPath(LUVAS), kind: 'put', value: 'C', batch: expect.any(String) }]);
    expect((await localRow()).checklist?.[LUVAS]?.result).toMatchObject({ value: 'C' });
    await waitFor(() => expect(screen.getByTestId('local-filled-by')).toHaveTextContent(/^Preenchido por Bento Braga · \d{2}\/\d{2} \d{2}:\d{2}$/));

    // NA on another item, then "Limpar" from the row's Overflow: null is the unanswered value.
    await userEvent.click(seg(TAPETE, 'Não se aplica'));
    await waitFor(() => expect(counter19()).toHaveTextContent('2 de 19'));
    await userEvent.click(within(rowOf(TAPETE)).getByRole('button', { name: 'Mais opções de Tapete ou estrado isolante' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Limpar' }));
    await waitFor(() => expect(counter19()).toHaveTextContent('1 de 19'));
    expect((await outbox()).slice(1).map((op) => [op.path, op.value])).toEqual([
      [resultPath(TAPETE), 'NA'],
      [resultPath(TAPETE), null],
    ]);
  });

  it('an NC item opens its chips, its required observation, "Adicionar foto" and "Criar ponto de atenção"; a chip writes the observation', async () => {
    await open({ second: true });
    await userEvent.click(seg(EMERGENCIA, 'Não conforme'));
    const row = rowOf(EMERGENCIA);
    const chips = await within(row).findByRole('group', { name: 'Observações sugeridas do item 11' });
    // The seed's phrases, then the observation typed for this item on the relatório's other local.
    expect(within(chips).getAllByRole('button').map((el) => el.textContent)).toEqual([
      'Luminária de emergência inoperante',
      'Autonomia abaixo de 2 h',
      'Sem iluminação de emergência',
      'Bateria da luminária vencida',
    ]);
    const field = within(row).getByRole('textbox', { name: 'Observação do item 11' });
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(within(row).getByText('Obrigatória em item não conforme')).toBeVisible();
    expect(within(row).getByRole('button', { name: 'Adicionar foto' })).toBeVisible();
    expect(within(row).getByText('Recomendada para não conforme')).toBeVisible();
    expect(within(row).getByRole('button', { name: 'Criar ponto de atenção' })).toBeVisible();

    await userEvent.click(within(chips).getByRole('button', { name: 'Autonomia abaixo de 2 h' }));
    fireEvent.blur(field);
    await waitFor(async () => expect((await outbox()).map((op) => [op.path, op.value])).toEqual([[resultPath(EMERGENCIA), 'NC'], [observationPath(EMERGENCIA), 'Autonomia abaixo de 2 h']]));
    await waitFor(() => expect(within(rowOf(EMERGENCIA)).getByRole('textbox', { name: 'Observação do item 11' })).not.toHaveAttribute('aria-invalid'));
    expect((await localRow()).checklist?.[EMERGENCIA]).toMatchObject({ result: { value: 'NC' }, observation: { value: 'Autonomia abaixo de 2 h' } });
  });

  it('an answered C or NA row with an observation shows the .vl-obs-line; "Editar" opens the field in its place', async () => {
    await open({ checklist: { [EXTINTOR]: { result: 'C', observation: 'CO2 6 kg · validade 03/2027' }, [TAPETE]: { result: 'C' } } });
    const row = rowOf(EXTINTOR);
    const line = row.querySelector('.vl-obs-line')!;
    expect(line.querySelector('.vl-obs-label')).toHaveTextContent('Observação');
    expect(line.querySelector('.vl-obs-text')).toHaveTextContent('CO2 6 kg · validade 03/2027');
    expect(row.querySelector('.row-expand')).toBeNull();
    // A C row with no observation has neither the line nor the field.
    expect(rowOf(TAPETE).querySelector('.vl-obs-line, .row-expand')).toBeNull();

    const edit = within(row).getByRole('button', { name: 'Editar a observação do item 8' });
    expect(edit).toHaveTextContent('Editar');
    await userEvent.click(edit);
    const field = await within(row).findByRole('textbox', { name: 'Observação do item 8' });
    expect(field).toHaveValue('CO2 6 kg · validade 03/2027');
    expect(field).not.toHaveAttribute('aria-invalid');
    expect(row.querySelector('.vl-obs-line')).toBeNull();
    // Nothing on a C row asks for a photo or a point.
    expect(within(row).queryByRole('button', { name: 'Adicionar foto' })).toBeNull();
    expect(within(row).queryByRole('button', { name: 'Criar ponto de atenção' })).toBeNull();

    await userEvent.clear(field);
    await userEvent.type(field, 'PQS 4 kg');
    fireEvent.blur(field);
    await waitFor(async () => expect((await outbox()).map((op) => [op.path, op.value])).toEqual([[observationPath(EXTINTOR), 'PQS 4 kg']]));
  });

  it('"Marcar os restantes como Conforme" writes one C put per unanswered item in one batch; "Desfazer" writes the inverses in a new batch', async () => {
    await open({ checklist: { [LUVAS]: { result: 'NC', observation: 'Luvas vencidas' }, [TAPETE]: { result: 'NA' } } });
    expect(counter19()).toHaveTextContent('2 de 19');
    await userEvent.click(screen.getByRole('button', { name: 'Marcar os restantes como Conforme' }));
    await waitFor(() => expect(counter19()).toHaveTextContent('19 de 19'));
    expect(counter19()).toHaveAttribute('data-state', 'complete');
    const written = await outbox();
    expect(written.map((op) => [op.path, op.value])).toEqual(SITE_ITEM_KEYS.filter((key) => key !== LUVAS && key !== TAPETE).map((key) => [resultPath(key), 'C']));
    expect(new Set(written.map((op) => op.batch)).size).toBe(1);
    // The answers that stood are untouched.
    expect(seg(LUVAS, 'Não conforme')).toHaveAttribute('aria-checked', 'true');
    expect(seg(TAPETE, 'Não se aplica')).toHaveAttribute('aria-checked', 'true');
    await waitFor(() => expect(toastText()).toContain('17 itens marcados Conforme'));
    // Nothing is left to mark: the action says why it is disabled.
    expect(screen.getByRole('button', { name: 'Marcar os restantes como Conforme' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Todos os itens já estão marcados')).toBeVisible();

    await userEvent.click(within(screen.getByTestId('toast')).getByRole('button', { name: 'Desfazer' }));
    await waitFor(() => expect(counter19()).toHaveTextContent('2 de 19'));
    const after = await outbox();
    expect(after).toHaveLength(34);
    const inverses = after.slice(17);
    expect(new Set(inverses.map((op) => op.batch)).size).toBe(1);
    expect(inverses[0]!.batch).not.toBe(written[0]!.batch);
    expect(inverses.every((op) => op.kind === 'put' && op.value === null)).toBe(true);
    expect(inverses.map((op) => op.path).sort()).toEqual(written.map((op) => op.path).sort());
  });

  it('the first site answer on a Rascunho relatório carries the Em campo status op in its batch and says "Relatório em campo"', async () => {
    await open({ status: 'rascunho' });
    await userEvent.click(seg(LUVAS, 'Não se aplica'));
    await waitFor(async () => expect((await relatorioRow()).status).toBe('em_campo'));
    const written = await outbox();
    expect(written.map((op) => [op.path, op.value])).toEqual(expect.arrayContaining([[resultPath(LUVAS), 'NA'], ['relatorio/status', 'em_campo']]));
    expect(written).toHaveLength(2);
    expect(new Set(written.map((op) => op.batch)).size).toBe(1);
    await waitFor(() => expect(toastText()).toContain('Relatório em campo'));
    // The next answer moves nothing: one op, no status op.
    await userEvent.click(seg(TAPETE, 'Conforme'));
    await waitFor(async () => expect(await outbox()).toHaveLength(3));
    expect((await outbox())[2]).toMatchObject({ path: resultPath(TAPETE), value: 'C' });
  });

  it('a bulk action that moved a Rascunho relatório to Em campo is undone with its status op: Rascunho is back', async () => {
    await open({ status: 'rascunho' });
    await userEvent.click(screen.getByRole('button', { name: 'Marcar os restantes como Conforme' }));
    await waitFor(() => expect(counter19()).toHaveTextContent('19 de 19'));
    const written = await outbox();
    expect(written).toHaveLength(20);
    expect(new Set(written.map((op) => op.batch)).size).toBe(1);
    expect(written.filter((op) => op.path === 'relatorio/status').map((op) => op.value)).toEqual(['em_campo']);
    expect((await relatorioRow()).status).toBe('em_campo');

    await userEvent.click(await screen.findByRole('button', { name: 'Desfazer' }));
    await waitFor(async () => expect((await relatorioRow()).status).toBe('rascunho'));
    const inverses = (await outbox()).slice(20);
    expect(inverses).toHaveLength(20);
    expect(inverses.filter((op) => op.path === 'relatorio/status').map((op) => op.value)).toEqual(['rascunho']);
    await waitFor(() => expect(counter19()).toHaveTextContent('0 de 19'));
  });

  it('on an Emitido relatório the banner says that editing these verificações reopens it; the first answer reopens it as Em revisão in its batch', async () => {
    await open({ status: 'emitido', revision: 2 });
    const TEXT = 'Relatório emitido (revisão 2). Editar estas verificações reabre o relatório como Em revisão e gera a revisão 3.';
    await waitFor(() => expect(screen.getByTestId('banner')).toHaveTextContent(TEXT));
    await userEvent.click(seg(LUVAS, 'Conforme'));
    await waitFor(async () => expect((await relatorioRow()).status).toBe('em_revisao'));
    const written = await outbox();
    expect(written.map((op) => [op.path, op.value])).toEqual(expect.arrayContaining([[resultPath(LUVAS), 'C'], ['relatorio/status', 'em_revisao']]));
    expect(new Set(written.map((op) => op.batch)).size).toBe(1);
    await waitFor(() => expect(screen.getByTestId('banner')).toHaveTextContent(''));
  });

  it('shows no banner in Em campo, nor on an Emitido relatório with no revision on record', async () => {
    const first = await open({ status: 'em_campo', revision: 2 });
    expect(screen.getByTestId('banner')).toHaveTextContent('');
    first.unmount();
    database?.close();
    await open({ status: 'emitido' });
    expect(screen.getByTestId('banner')).toHaveTextContent('');
  });

  it('"Criar ponto de atenção" on an NC item with a photo seeds a point of this local with the photo\'s token; the row then names its point', async () => {
    database = await seeded({ checklist: { [EMERGENCIA]: { result: 'NC', observation: 'Luminária de emergência inoperante' } } });
    await commitPhotoCapture(
      database,
      {
        companyId: COMPANY,
        relatorioId: RELATORIO,
        actorId: USER,
        fileId: PHOTO,
        blockId: null,
        itemKey: EMERGENCIA,
        locationId: LOCAL,
        caption: 'Verificação de iluminação de emergência (autonomia mínima de 2 h) da Cabine de Testes',
        capturedAt: '2026-09-07T13:55:00.000Z',
        tzOffset: -180,
        coords: null,
        original: new NodeBlob(['original']) as unknown as Blob,
        thumb: new NodeBlob(['thumb']) as unknown as Blob,
        sha256: 'ab'.repeat(32),
        reading: null,
      },
      { newId: () => id(0x2000 + ++counter), now: () => new Date('2026-09-07T13:55:00.000Z') },
    );
    // jsdom draws no object URL: the tile shows its placeholder.
    await database.thumbs.clear();
    await database.outbox.clear();
    renderAt(LOCAL);
    await screen.findByRole('heading', { level: 2, name: /^Verificações do local — / });
    const row = rowOf(EMERGENCIA);
    // The item's photo, in the sheet checklist's Photo tile row under the row.
    const photos = await within(row).findByRole('group', { name: 'Fotos do item 11' });
    expect(photos).toHaveClass('photo-list');
    expect(photos).toHaveTextContent('Verificação de iluminação de emergência (autonomia mínima de 2 h) da Cabine de Testes');
    expect(row.querySelector('.nc-point-ref')).toBeNull();

    const createButton = within(row).getByRole('button', { name: 'Criar ponto de atenção' });
    await userEvent.click(createButton);
    const dialog = await screen.findByRole('dialog');
    // The point is this local's: its title is the kernel's, never an equipment's nor "Geral".
    expect(dialog).toHaveTextContent('Cabine de Testes · Verificações do local');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Concluir' }));
    await waitFor(async () => expect((await outbox()).some((op) => op.kind === 'create' && op.path.startsWith('point/'))).toBe(true));
    const create = (await outbox()).find((op) => op.kind === 'create' && op.path.startsWith('point/'))!;
    const point = create.value as unknown as PointRow;
    expect(point).toMatchObject({ relatorio_id: RELATORIO, location_id: LOCAL, equipment_id: null, origin: 'manual', text: `[[foto:${PHOTO}]]` });
    await waitFor(() => expect(rowOf(EMERGENCIA).querySelector('.nc-point-ref')).toHaveTextContent('Ponto de atenção 1'));
    // The dialog hands the focus back to the button that opened it, still the same element of the row.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(within(rowOf(EMERGENCIA)).getByRole('button', { name: 'Criar ponto de atenção' })).toBe(createButton);
    await waitFor(() => expect(createButton).toHaveFocus());
    await waitFor(() => expect(toastText()).toContain('Ponto de atenção'));
  });

  it('"Concluir verificações" names what is missing and focuses the first unanswered row; with nothing missing it returns to the tree, as "Ver árvore" does', async () => {
    const view = await open({ checklist: Object.fromEntries(SITE_ITEM_KEYS.filter((key) => key !== 'epi_disponivel' && key !== 'ventilacao').map((key) => [key, { result: 'C' }])) });
    await userEvent.click(screen.getByRole('button', { name: 'Concluir verificações' }));
    await waitFor(() => expect(toastText()).toContain('2 itens sem resposta — o primeiro é o item 6, EPI disponível'));
    expect(rowOf('epi_disponivel').contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toHaveAttribute('role', 'radio');
    // Nothing was written: the checklist stores no "concluded" state.
    expect(await outbox()).toEqual([]);

    await userEvent.click(seg('epi_disponivel', 'Conforme'));
    await userEvent.click(seg('ventilacao', 'Não se aplica'));
    await waitFor(() => expect(counter19()).toHaveTextContent('19 de 19'));
    await userEvent.click(screen.getByRole('button', { name: 'Concluir verificações' }));
    expect(await screen.findByTestId('where')).toHaveTextContent(`/relatorio/${RELATORIO} {"openSection9":true}`);
    expect((await outbox()).map((op) => op.path)).toEqual([resultPath('epi_disponivel'), resultPath('ventilacao')]);
    view.unmount();
    database?.close();

    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Ver árvore' }));
    expect(await screen.findByTestId('where')).toHaveTextContent(`/relatorio/${RELATORIO} {"openSection9":true}`);
  });

  it.each([
    ['a painel', {}, PAINEL],
    ['a coluna', {}, COLUNA],
    ['an unknown id', {}, id(99)],
    ['a local of a relatório on seed v3', { seed: 'v3' }, LOCAL],
    ['a local of a relatório on seed v1', { seed: 'v1' }, LOCAL],
    ['a local removed from the tree, whatever answers its row keeps', { removed: true, checklist: { [LUVAS]: { result: 'C' } } }, LOCAL],
  ] as const)('%s has no site checklist: the surface says so and draws no row', async (_name, options, locationId) => {
    database = await seeded(options);
    const { container } = renderAt(locationId);
    expect(await screen.findByText('Verificações do local não encontradas neste relatório.')).toBeVisible();
    expect(container.querySelectorAll('.checklist-row, .sheet-header, .sticky-action-bar')).toHaveLength(0);
  });

  it('390 px: the header\'s side wraps (the mock\'s .frame-phone rule, translated for this route) under the stacked sheet header', () => {
    const css = readFileSync(resolve(__dirname, '../../styles/app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const start = css.indexOf('@media (max-width: 767.98px) {');
    const phone = css.slice(start, css.indexOf('\n}\n', start));
    expect(phone).toContain('.sheet-header { padding: var(--sp-3) var(--gutter-phone); flex-direction: column; gap: var(--sp-2); }');
    expect(phone).toContain('[data-route="/relatorio/:id/local/:locationId/verificacoes"] .vl-head-side { flex-wrap: wrap; }');
    expect(phone).toContain('.checklist-row .tri-state { width: 100%; display: grid; order: 3; }');
  });
});

describe('Epic 14 QA Q-5: the local\'s "Do local" block above the items', () => {
  it('draws CARACTERÍSTICAS DA SE and AMBIENTE DE ENSAIO expanded before the intro, with no "Ler visor", no line to this surface and no quick notes', async () => {
    const { container } = await open();
    const content = container.querySelector('.content')!;
    const blocks = [...content.querySelectorAll(':scope > section.se-block')];
    expect(blocks.map((section) => section.querySelector('.section-head h2')!.textContent)).toEqual(['Características da SE', 'Ambiente de ensaio']);
    // Above the items: both sections come before the intro and the first group.
    const intro = content.querySelector(':scope > .vl-intro')!;
    for (const section of blocks) expect(section.compareDocumentPosition(intro) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(blocks[0]!.querySelector('.ficha-da-cabine')).toHaveTextContent('Do local · Cabine de Testes');
    // v4: SE and AMBIENTE print under the local's heading (`cabineDataNoteText`).
    expect(blocks[0]!.querySelector('.section-note')).toHaveTextContent('Impressas uma vez, sob o título do local, antes das fichas.');
    expect(within(content as HTMLElement).queryByRole('button', { name: 'Ler visor' })).toBeNull();
    expect(content.querySelector('.ficha-local-line')).toBeNull();
    expect(content.querySelector('.ficha-quick-notes')).toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('an SE and an AMBIENTE value are location/{id}/se/* and env/* puts on the local, never a sheet op', async () => {
    await open();
    const primaria = screen.getByLabelText('Tensão primária', { exact: true });
    await userEvent.clear(primaria);
    await userEvent.type(primaria, '11,95');
    await userEvent.tab();
    const temperatura = screen.getByLabelText('Temperatura', { exact: true });
    await userEvent.clear(temperatura);
    await userEvent.type(temperatura, '31');
    await userEvent.tab();
    await waitFor(async () => expect((await outbox()).map((op) => op.path)).toEqual([`location/${LOCAL}/se/primary_kv`, `location/${LOCAL}/env/temperature_c`]));
    const ops = await outbox();
    expect(ops.map((op) => [op.kind, op.value])).toEqual([
      ['put', { raw: '11.95', unit: 'kV', state: 'measured' }],
      ['put', { raw: '31', unit: '°C', state: 'measured' }],
    ]);
    await waitFor(async () => expect((await localRow()).se.primary_kv).toEqual({ raw: '11.95', unit: 'kV', state: 'measured' }));
  });
});
