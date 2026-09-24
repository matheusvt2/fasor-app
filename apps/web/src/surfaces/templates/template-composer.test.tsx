import 'fake-indexeddb/auto';
import { emptyTemplate, moveSection, removeNode, standardTemplate, templateRowSchema, type TemplateRow } from '@app/domain';
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toRecord } from '../../db/commit.ts';
import { templateRow } from '../../db/home-store.ts';
import { openDatabase, type AppDatabase } from '../../db/schema.ts';
import type { SessionState } from '../../state/session.tsx';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import { TemplateComposerSurface } from './template-composer.tsx';

/*
 * Story 3.4: the Template composer over a real device database. Every edit is one batch
 * of `template/{id}/*` puts computed by the kernel, moves are announced, removals confirm
 * and undo, and an orphan block (left by two devices' writes) is invisible.
 */

const COMPANY = '0b000000-0000-7000-8000-00000000000b';
const USER = '0b000000-0000-7000-8000-0000000000b1';
const ID = '019966b0-0037-7000-8000-000000000001';

let database: AppDatabase | null = null;
let counter = 0;

const session = (): SessionState => ({
  status: 'signed-in',
  user: {
    id: USER,
    name: 'Bento Braga',
    email: 'b@teste.local',
    companyId: COMPANY,
    companyName: 'Empresa B de Teste',
    council: null,
    registrationNumber: null,
    title: null,
  },
  online: true,
  reAuthRequired: false,
  database,
  signIn: vi.fn(),
  signOut: vi.fn(async () => {}),
  saveRegistration: vi.fn(async () => {}),
  dismissReAuth: vi.fn(),
  recoveryNeeded: false,
  dismissRecovery: vi.fn(),
});

vi.mock('../../state/session.tsx', () => ({ useSession: () => session() }));
// The real reader, wrapped so one test can hand an edit a row another device already changed.
vi.mock('../../db/home-store.ts', async (original) => {
  const actual = await original<typeof import('../../db/home-store.ts')>();
  return { ...actual, templateRow: vi.fn(actual.templateRow) };
});

// Each edit is an IndexedDB write plus a live-query round trip; under a full parallel run
// that can outlast the one-second default.
configure({ asyncUtilTimeout: 5000 });

async function freshDb(row: TemplateRow | null): Promise<AppDatabase> {
  const user = `019966b0-0038-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  const fresh = openDatabase(user);
  if (row !== null) await fresh.entities.put(toRecord(`template:${row.id}`, row));
  return fresh;
}

function renderComposer(id = ID) {
  return render(
    <MemoryRouter initialEntries={[`/templates/${id}`]}>
      <ToastProvider>
        {/* Stands in for the App bar's back button, which the shell draws. */}
        <Link to="/templates">Sair do composer</Link>
        <Routes>
          <Route path="/templates/:id" element={<TemplateComposerSurface />} />
          <Route path="/templates" element={<p>Lista</p>} />
        </Routes>
        <ToastOutlet />
      </ToastProvider>
    </MemoryRouter>,
  );
}

const palette = () => screen.getByRole('complementary', { name: 'Paleta de blocos' });
const announcer = () => screen.getByTestId('composer-announcer');
const colunaNames = (cabine: string) =>
  within(screen.getByRole('list', { name: `Colunas de ${cabine}` }))
    .getAllByRole('listitem')
    .map((li) => li.querySelector('.col-name')!.textContent);

async function outboxPaths(): Promise<string[]> {
  return (await database!.outbox.toArray()).map((op) => op.path);
}

afterEach(() => {
  cleanup();
  database?.close();
  database = null;
});

describe('3.4 composer: address', () => {
  it('says so when this device holds no live template of that id, with a way back', async () => {
    database = await freshDb(null);
    renderComposer('019966b0-0037-7000-8000-0000000000ff');
    expect(await screen.findByText('Template não encontrado.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Voltar para Templates' })).toHaveAttribute('href', '/templates');
  });

  it('says so for a removed template too', async () => {
    database = await freshDb({ ...standardTemplate({ id: ID }), removed_at: '2026-09-22T10:00:00.000Z' });
    renderComposer();
    expect(await screen.findByText('Template não encontrado.')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Nome do template' })).toBeNull();
  });

  it('draws the standard template: name, totals, skeleton heading, sections and the autosave note, with no violations', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    const { container } = renderComposer();
    expect(await screen.findByRole('textbox', { name: 'Nome do template' })).toHaveValue('Cabine primária — padrão');
    expect(container.querySelector('.composer-meta')).toHaveTextContent(
      '25 seccionadoras · 21 disjuntores · 11 TP · 11 TC · 8 trafos · 4 cabos de entrada · 9 cabos de saída · 5 para-raios',
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Esqueleto de locais · 6 cabines · 17 colunas · 94 blocos' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Blocos · 9 seções' })).toBeVisible();
    expect(screen.getByText('Alterações são salvas automaticamente e não alteram relatórios já criados deste template.')).toBeVisible();
    const tags = [...container.querySelectorAll('.block-list[aria-label="Blocos do template"] .block-tag')].map((el) => el.textContent);
    expect(tags).toEqual(['1', '2', '3', '4', '5', '6', '8', '10', '11']);
    expect(within(palette()).getByText('Selecione uma cabine ou coluna.')).toBeVisible();
    // No Save bar: every edit saves itself.
    expect(screen.queryByRole('button', { name: 'Salvar template' })).toBeNull();
    expect(await axe(container)).toHaveNoViolations();
    // axe over the whole standard template (94 blocks, 17 colunas) takes several seconds on
    // its own and outlasted the 15 s default under a loaded full `pnpm verify` run.
  }, 60_000);
});

describe('3.4 composer: skeleton', () => {
  it('adds a cabine and three colunas, renames one and reorders it every keyboard way, announcing each move', async () => {
    database = await freshDb(emptyTemplate(ID, 'v1'));
    renderComposer();
    const addColuna = await screen.findByRole('button', { name: 'Adicionar coluna' });
    expect(addColuna).toHaveAccessibleDescription('Adicione uma cabine primeiro.');

    await userEvent.click(screen.getByRole('button', { name: 'Adicionar cabine' }));
    await screen.findByRole('list', { name: 'Cabines do template' });
    for (let i = 0; i < 3; i++) {
      await waitFor(() => expect(addColuna).not.toHaveAttribute('aria-disabled'));
      await userEvent.click(addColuna);
      await waitFor(() => expect(screen.queryAllByText(`Coluna ${i + 1}`).length).toBeGreaterThan(0));
    }
    expect(colunaNames('Cabine 1')).toEqual(['Coluna 1', 'Coluna 2', 'Coluna 3']);

    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Coluna 3' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Renomear' }));
    const dialog = await screen.findByRole('dialog', { name: 'Renomear Coluna 3' });
    const field = within(dialog).getByRole('textbox', { name: 'Nome' });
    await userEvent.clear(field);
    await userEvent.type(field, 'Coluna 5');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(colunaNames('Cabine 1')).toEqual(['Coluna 1', 'Coluna 2', 'Coluna 5']));

    // Alt+Up from anywhere in the row.
    const posBox = screen.getByRole('textbox', { name: 'Posição de Coluna 5' });
    posBox.focus();
    fireEvent.keyDown(posBox, { key: 'ArrowUp', altKey: true });
    await waitFor(() => expect(colunaNames('Cabine 1')).toEqual(['Coluna 1', 'Coluna 5', 'Coluna 2']));
    await waitFor(() => expect(announcer()).toHaveTextContent('Coluna 5 movida para a posição 2 de 3'));

    // The Position box: type a number and press Enter.
    await userEvent.clear(posBox);
    await userEvent.type(posBox, '1{Enter}');
    await waitFor(() => expect(colunaNames('Cabine 1')).toEqual(['Coluna 5', 'Coluna 1', 'Coluna 2']));
    await waitFor(() => expect(announcer()).toHaveTextContent('Coluna 5 movida para a posição 1 de 3'));

    // The Overflow: "Subir" is not offered at the top; "Descer" moves one down.
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Coluna 5' }));
    expect(screen.queryByRole('menuitem', { name: 'Subir' })).toBeNull();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Descer' }));
    await waitFor(() => expect(colunaNames('Cabine 1')).toEqual(['Coluna 1', 'Coluna 5', 'Coluna 2']));
    await waitFor(() => expect(announcer()).toHaveTextContent('Coluna 5 movida para a posição 2 de 3'));

    const row = await templateRow(database, ID);
    expect(row!.skeleton.map((n) => n.name)).toEqual(['Cabine 1', 'Coluna 1', 'Coluna 5', 'Coluna 2']);
    expect((await outboxPaths()).every((path) => path === `template/${ID}/skeleton`)).toBe(true);
  });

  it('Alt+ArrowUp on a coluna moves the coluna only, never its cabine', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    renderComposer();
    const cabines = () =>
      [...screen.getByRole('list', { name: 'Cabines do template' }).querySelectorAll(':scope > li .block-name')].map((el) => el.textContent);
    const before = await waitFor(() => {
      const names = cabines();
      expect(names).toHaveLength(6);
      return names;
    });
    fireEvent.keyDown(screen.getByRole('button', { name: /^Coluna 3/ }), { key: 'ArrowUp', altKey: true });
    await waitFor(() => expect(colunaNames('1° Subsolo').slice(0, 3)).toEqual(['Coluna 1', 'Coluna 3', 'Coluna 2']));
    expect(cabines()).toEqual(before);
    expect(announcer()).toHaveTextContent('Coluna 3 movida para a posição 2 de 17');
    const row = await templateRow(database, ID);
    expect(row!.skeleton.filter((n) => n.kind === 'cabine').map((n) => n.ref)).toEqual(
      standardTemplate({ id: ID }).skeleton.filter((n) => n.kind === 'cabine').map((n) => n.ref),
    );
  });

  it('a later edit takes the undo of a removal away, so "Desfazer" can never discard it', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    renderComposer();
    await userEvent.click(await screen.findByRole('button', { name: 'Mais opções de Coluna 3' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remover' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Remover Coluna 3?' })).getByRole('button', { name: 'Remover' }));
    expect(await screen.findByText('Coluna 3 removida')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Desfazer' })).toBeVisible();

    const toggle = screen.getByRole('switch', { name: 'Agrupar por tipo Cubículo Enel' });
    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull());
    expect(screen.queryByText('Coluna 3 removida')).toBeNull();
  });

  it('leaving the composer takes its removal undo away, so a later visit\'s edits can never be discarded by it', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    renderComposer();
    await userEvent.click(await screen.findByRole('button', { name: 'Mais opções de Coluna 2' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remover' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Remover Coluna 2?' })).getByRole('button', { name: 'Remover' }));
    expect(await screen.findByRole('button', { name: 'Desfazer' })).toBeVisible();

    await userEvent.click(screen.getByRole('link', { name: 'Sair do composer' }));
    expect(await screen.findByText('Lista')).toBeVisible();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull());
    expect(screen.queryByText('Coluna 2 removida')).toBeNull();
  });

  it('an undo pressed while an edit is queued runs after it, never racing it', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    renderComposer();
    await userEvent.click(await screen.findByRole('button', { name: 'Mais opções de Coluna 2' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remover' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Remover Coluna 2?' })).getByRole('button', { name: 'Remover' }));
    const undo = await screen.findByRole('button', { name: 'Desfazer' });
    await screen.findByRole('heading', { level: 2, name: 'Esqueleto de locais · 6 cabines · 16 colunas · 89 blocos' });
    // Hold the next edit's read of the row, so the edit sits in the queue.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const actual = vi.mocked(templateRow).getMockImplementation()!;
    vi.mocked(templateRow).mockImplementationOnce(async (db, id) => {
      await gate;
      return actual(db, id);
    });
    const toggle = screen.getByRole('switch', { name: 'Agrupar por tipo Cubículo Enel' });
    await userEvent.click(toggle);
    await userEvent.click(undo);
    // Nothing of the undo lands before the queued edit.
    expect((await database.outbox.toArray()).filter((op) => op.path.endsWith('/skeleton'))).toHaveLength(1);
    release();
    await waitFor(async () => expect(await database!.outbox.count()).toBe(5));
    const ops = (await database.outbox.toArray()).sort((a, b) => (a.client_ts < b.client_ts ? -1 : a.client_ts > b.client_ts ? 1 : a.op_id < b.op_id ? -1 : 1));
    // removal (skeleton, blocks), the toggle (skeleton), then the undo (blocks, skeleton).
    expect(ops[2]!.batch_id).not.toBe(ops[3]!.batch_id);
    expect(ops[2]!.path).toBe(`template/${ID}/skeleton`);
    expect(ops[2]!.value).toEqual(expect.arrayContaining([expect.objectContaining({ ref: 'enel', agrupar_por_tipo: true })]));
  });

  it('stores Agrupar por tipo on the skeleton cabine', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    renderComposer();
    const toggle = await screen.findByRole('switch', { name: 'Agrupar por tipo Cubículo Enel' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    const row = await templateRow(database, ID);
    expect(row!.skeleton.find((n) => n.ref === 'enel')).toMatchObject({ agrupar_por_tipo: true });
    expect(await outboxPaths()).toEqual([`template/${ID}/skeleton`]);

    // Tapping the row label toggles too (EXPERIENCE.md › Toggle).
    const enel = toggle.closest('li')!;
    await userEvent.click(within(enel).getByText('Agrupar por tipo'));
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
    expect(await outboxPaths()).toEqual([`template/${ID}/skeleton`, `template/${ID}/skeleton`]);
  });

  it('after a removal the focus goes to the next row\'s Overflow, else the previous one\'s, else the heading', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    renderComposer();
    const removeVia = async (trigger: string, title: string) => {
      await userEvent.click(await screen.findByRole('button', { name: trigger }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Remover' }));
      const dialog = await screen.findByRole('dialog', { name: `Remover ${title}?` });
      await userEvent.click(within(dialog).getByRole('button', { name: 'Remover' }));
    };

    // A coluna in the middle of its cabine: the coluna after it.
    const coluna3 = (await screen.findByRole('button', { name: 'Mais opções de Coluna 3' })).closest('li')!;
    const after = (coluna3.nextElementSibling as HTMLElement).querySelector('.col-name')!.textContent!;
    await removeVia('Mais opções de Coluna 3', 'Coluna 3');
    await waitFor(() => expect(screen.getByRole('button', { name: `Mais opções de ${after}` })).toHaveFocus());

    // The last section: the one before it.
    const sections = screen.getByRole('list', { name: 'Blocos do template' });
    await removeVia('Mais opções de 11 Certificados', '11 Certificados');
    await waitFor(() => expect(within(sections).getAllByRole('listitem')).toHaveLength(8));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mais opções de 10 Conclusão' })).toHaveFocus());
  });

  it('removes a coluna with its blocks after a Confirm dialog, in one batch, and "Desfazer" restores both fields', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    renderComposer();
    await userEvent.click(await screen.findByRole('button', { name: 'Mais opções de Coluna 3' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remover' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remover Coluna 3?' });
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus());
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remover' }));

    await screen.findByRole('heading', { level: 2, name: 'Esqueleto de locais · 6 cabines · 16 colunas · 87 blocos' });
    const ops = await database.outbox.toArray();
    expect(ops.map((op) => op.path).sort()).toEqual([`template/${ID}/blocks`, `template/${ID}/skeleton`]);
    expect(new Set(ops.map((op) => op.batch_id)).size).toBe(1);

    await userEvent.click(await screen.findByRole('button', { name: 'Desfazer' }));
    await screen.findByRole('heading', { level: 2, name: 'Esqueleto de locais · 6 cabines · 17 colunas · 94 blocos' });
    // D-4: the two puts of the removal and the two of the undo each bumped the version.
    expect(await templateRow(database, ID)).toEqual({ ...standardTemplate({ id: ID }), version: 5 });
  });
});

describe('3.4 composer: quantities per node', () => {
  it('sets a quantity on the current coluna from the palette; the coluna lists it and the totals follow', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    const { container } = renderComposer();
    await userEvent.click(await screen.findByRole('button', { name: /^Coluna 9/ }));
    expect(within(palette()).getByText('Equipamentos · quantidade em Coluna 9')).toBeVisible();

    const stepper = within(palette()).getByRole('group', { name: 'Seccionadoras, 0' });
    await userEvent.click(within(stepper).getByRole('button', { name: 'Mais um' }));
    await userEvent.click(within(stepper).getByRole('button', { name: 'Mais um' }));
    await waitFor(() => expect(within(palette()).getByRole('group', { name: 'Seccionadoras, 2' })).toBeVisible());

    const body = container.querySelector('.column-row.is-open .col-body')!;
    await waitFor(() => expect(within(body as HTMLElement).getByRole('group', { name: 'Seccionadoras, 2' })).toBeVisible());
    expect(container.querySelector('.composer-meta')).toHaveTextContent(/^27 seccionadoras · 21 disjuntores/);

    // "−" to zero from the coluna body: the row leaves and the palette count reads "—".
    const inBody = within(body as HTMLElement).getByRole('group', { name: 'Seccionadoras, 2' });
    await userEvent.click(within(inBody).getByRole('button', { name: 'Menos um' }));
    await waitFor(() => expect(within(palette()).getByRole('group', { name: 'Seccionadoras, 1' })).toBeVisible());
    await userEvent.click(within(within(palette()).getByRole('group', { name: 'Seccionadoras, 1' })).getByRole('button', { name: 'Menos um' }));
    await waitFor(() => expect(within(palette()).getByRole('group', { name: 'Seccionadoras, 0' })).toBeVisible());
    expect(within(within(palette()).getByRole('group', { name: 'Seccionadoras, 0' })).getByRole('textbox')).toHaveValue('—');
    await waitFor(() => expect(container.querySelector('.column-row.is-open .qty-row')).toBeNull());
    // D-4: every `blocks` put bumped the version; the composition itself is back where it was.
    expect(await templateRow(database, ID)).toEqual({ ...standardTemplate({ id: ID }), version: expect.any(Number) });
    expect((await templateRow(database, ID))!.version).toBeGreaterThan(1);
    expect((await outboxPaths()).every((path) => path === `template/${ID}/blocks`)).toBe(true);
  });

  it('heads the palette with the current node', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    const { container } = renderComposer();
    await screen.findByRole('complementary', { name: 'Paleta de blocos' });
    expect(container.querySelector('.composer-palette .palette-head')).toHaveTextContent('Blocos');
    await userEvent.click(screen.getByRole('button', { name: /^Coluna 9/ }));
    await waitFor(() => expect(container.querySelector('.composer-palette .palette-head')).toHaveTextContent('Coluna 9'));
  });

  it('"−" to zero from the keyboard in the open coluna moves the focus to its head', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    const { container } = renderComposer();
    const head = await screen.findByRole('button', { name: /^Coluna 5/ });
    await userEvent.click(head);
    const body = await waitFor(() => {
      const el = container.querySelector('.column-row.is-open .col-body');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    const minus = within(within(body).getByRole('group', { name: 'Seccionadoras, 1' })).getByRole('button', { name: 'Menos um' });
    minus.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(within(body).queryByRole('group', { name: /^Seccionadoras/ })).toBeNull());
    await waitFor(() => expect(head).toHaveFocus());
  });

  it('writes nothing when the node was removed elsewhere before the write, and the stepper keeps its count', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    renderComposer();
    await userEvent.click(await screen.findByRole('button', { name: /^Coluna 9/ }));
    const stepper = within(palette()).getByRole('group', { name: 'Seccionadoras, 0' });
    // The row this device reads at the moment of the write no longer has Coluna 9.
    const stale = standardTemplate({ id: ID });
    vi.mocked(templateRow).mockImplementationOnce(async () => ({ ...stale, ...removeNode(stale, 'subsolo-1/coluna-9') }));
    await userEvent.click(within(stepper).getByRole('button', { name: 'Mais um' }));
    await waitFor(() => expect(within(stepper).getByRole('textbox')).toHaveValue('—'));
    expect(await outboxPaths()).toEqual([]);
    expect(screen.queryByText('Não foi possível salvar. Tente de novo.')).toBeNull();
  });

  it('a cabine made current holds blocks with no coluna, and lists them', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    const { container } = renderComposer();
    await userEvent.click(await screen.findByRole('button', { name: /^Cubículo Enel/ }));
    expect(within(palette()).getByText('Equipamentos · quantidade em Cubículo Enel')).toBeVisible();
    expect(within(palette()).getByRole('group', { name: 'Para-raios, 2' })).toBeVisible();
    const own = container.querySelector('.cabine-card.is-open > .block-expand > .col-body') as HTMLElement;
    expect(within(own).getByRole('group', { name: 'Para-raios, 2' })).toBeVisible();
  });
});

describe('3.4 composer: section blocks', () => {
  const tags = (container: HTMLElement) =>
    [...container.querySelectorAll('.block-list[aria-label="Blocos do template"] .block-tag')].map((el) => el.textContent);

  it('moves, duplicates and removes sections through the Overflow, with the Confirm dialog and "Desfazer"', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    const { container } = renderComposer();
    await userEvent.click(await screen.findByRole('button', { name: 'Mais opções de 1 Objetivo' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Adicionar abaixo',
      'Descer',
      'Duplicar',
      'Editar texto',
      'Remover',
    ]);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Descer' }));
    await waitFor(() => expect(tags(container)).toEqual(['2', '1', '3', '4', '5', '6', '8', '10', '11']));
    await waitFor(() => expect(announcer()).toHaveTextContent('Seção 1 movida para a posição 2 de 9'));

    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de 3 Limite de escopo' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Duplicar' }));
    await waitFor(() => expect(tags(container)).toEqual(['2', '1', '3', '3', '4', '5', '6', '8', '10', '11']));

    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de 8 Pontos de atenção' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remover' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remover 8 Pontos de atenção?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(tags(container)).toEqual(['2', '1', '3', '3', '4', '5', '6', '10', '11']));
    await userEvent.click(await screen.findByRole('button', { name: 'Desfazer' }));
    await waitFor(() => expect(tags(container)).toEqual(['2', '1', '3', '3', '4', '5', '6', '8', '10', '11']));
    expect((await outboxPaths()).every((path) => path === `template/${ID}/blocks`)).toBe(true);
  });

  it('adds a section from the palette at the end, and "Adicionar abaixo" places the next one under its card', async () => {
    database = await freshDb(emptyTemplate(ID, 'v1'));
    const { container } = renderComposer();
    await screen.findByRole('complementary', { name: 'Paleta de blocos' });
    await userEvent.click(within(palette()).getByRole('button', { name: '1 Objetivo' }));
    await userEvent.click(within(palette()).getByRole('button', { name: '11 Certificados' }));
    await waitFor(() => expect(tags(container)).toEqual(['1', '11']));

    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de 1 Objetivo' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Adicionar abaixo' }));
    // jsdom lays nothing out, so the inline palette counts as hidden and the drawer opens.
    const drawer = await screen.findByRole('dialog', { name: 'Blocos' });
    expect(within(drawer).getByText('A próxima seção tocada entra abaixo de 1 Objetivo.')).toBeVisible();
    await userEvent.click(within(drawer).getByRole('button', { name: '2 Definições' }));
    await waitFor(() => expect(tags(container)).toEqual(['1', '2', '11']));
  });
});

describe('3.4 composer: concurrent edits', () => {
  it('ignores an orphan block, and the next blocks write drops it', async () => {
    const base = standardTemplate({ id: ID });
    const orphan = { ...base.blocks.find((b) => b.block_type === 'tp')!, skeleton_location_ref: 'gone' };
    const row = templateRowSchema.parse({ ...base, blocks: [...base.blocks, orphan] });
    database = await freshDb(row);
    renderComposer();
    expect(await screen.findByRole('heading', { level: 2, name: 'Esqueleto de locais · 6 cabines · 17 colunas · 94 blocos' })).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de 1 Objetivo' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Descer' }));
    await waitFor(async () => expect((await templateRow(database!, ID))!.blocks.some((b) => b.skeleton_location_ref === 'gone')).toBe(false));
  });
});

describe('3.4 composer: name', () => {
  it('commits the name on blur as one template/{id}/name put', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    renderComposer();
    const name = await screen.findByRole('textbox', { name: 'Nome do template' });
    await userEvent.clear(name);
    // One paste, not 31 keystrokes: on a loaded machine the gap between two typed keys can
    // outlast the field's idle commit, which then writes a correct but second put of the
    // partial name before the blur writes the rest.
    await userEvent.paste('  Porto Seguro — Torres A e B  ');
    await act(async () => {
      name.blur();
    });
    await waitFor(async () => expect((await templateRow(database!, ID))!.name).toBe('Porto Seguro — Torres A e B'));
    expect(await outboxPaths()).toEqual([`template/${ID}/name`]);
    // D-4: a rename is a content edit, so the row's version is bumped on this device too.
    expect((await templateRow(database!, ID))!.version).toBe(2);
  });
});

describe('3.5 composer: sub-block defaults per type', () => {
  it('offers "Editar padrões" only for a type the template holds', async () => {
    database = await freshDb(emptyTemplate(ID, 'v1'));
    renderComposer();
    await screen.findByRole('complementary', { name: 'Paleta de blocos' });
    expect(within(palette()).queryByRole('button', { name: /^Editar padrões/ })).toBeNull();
    cleanup();
    database.close();

    database = await freshDb(standardTemplate({ id: ID }));
    renderComposer();
    await screen.findByRole('complementary', { name: 'Paleta de blocos' });
    expect(within(palette()).getAllByRole('button', { name: /^Editar padrões de / })).toHaveLength(8);
  });

  it('shows Toggle rows with the state word, "Sempre" for checklist and conclusion, and the subtype NA count', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    renderComposer();
    await screen.findByRole('complementary', { name: 'Paleta de blocos' });
    await userEvent.click(within(palette()).getByRole('button', { name: 'Editar padrões de Chave seccionadora' }));
    const dialog = await screen.findByRole('dialog', { name: 'Padrões de Chave seccionadora' });

    const plate = within(dialog).getByRole('switch', { name: 'Dados de placa' });
    expect(plate).toHaveAttribute('aria-checked', 'true');
    expect(plate).toHaveTextContent('Ativado');
    for (const locked of ['Verificações gerais', 'Conclusão']) {
      // The mock's locked row: aria-disabled, ", sempre ativado", and "Sempre na ficha" under it.
      const toggle = within(dialog).getByRole('switch', { name: `${locked}, sempre ativado` });
      expect(toggle).toHaveAttribute('aria-disabled', 'true');
      expect(toggle).toHaveAttribute('aria-checked', 'true');
      expect(toggle).toHaveTextContent('Sempre');
      expect(toggle.closest('.toggle-row')!.querySelector('.toggle-sub')).toHaveTextContent('Sempre na ficha');
      await userEvent.click(within(dialog).getByText(locked, { selector: 'label' }));
      expect(toggle).toHaveAttribute('aria-checked', 'true');
    }
    expect(dialog.querySelectorAll('.toggle-sub')).toHaveLength(2);
    const subtype = within(dialog).getByRole('combobox', { name: 'Subtipo padrão' });
    expect(subtype).toHaveValue('MANUAL');
    expect(within(dialog).getByText('2 itens marcados NA por padrão')).toBeVisible();
    expect(await axe(dialog)).toHaveNoViolations();

    // Off, on every placement, as one blocks put -- from a tap on the row's label.
    await userEvent.click(within(dialog).getByText('Resistência de contato', { selector: 'label' }));
    await waitFor(async () => {
      const blocks = (await templateRow(database!, ID))!.blocks.filter((b) => b.block_type === 'chave_seccionadora');
      expect(blocks.every((b) => b.sub_blocks.resistencia_contato?.enabled === false)).toBe(true);
    });
    await waitFor(() => expect(within(dialog).getByRole('switch', { name: 'Resistência de contato' })).toHaveTextContent('Desativado'));

    // No subtype: no NA pre-mark, every item still on the list.
    await userEvent.click(within(dialog).getByRole('button', { name: /Abrir lista/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'Sem subtipo' }));
    await waitFor(() => expect(within(dialog).getByText('Nenhum item marcado NA por padrão')).toBeVisible());
    expect(subtype).toHaveValue('Sem subtipo');
    const blocks = (await templateRow(database!, ID))!.blocks.filter((b) => b.block_type === 'chave_seccionadora');
    expect(blocks.every((b) => b.subtype === undefined && b.na_defaults.length === 0)).toBe(true);
    expect(await outboxPaths()).toEqual([`template/${ID}/blocks`, `template/${ID}/blocks`]);
  });

  it('"Á SECO" on the TP pre-marks the seed\'s 8 items, and a new TP placement follows the type', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    renderComposer();
    await screen.findByRole('complementary', { name: 'Paleta de blocos' });
    await userEvent.click(within(palette()).getByRole('button', { name: 'Editar padrões de TP — proteção' }));
    const dialog = await screen.findByRole('dialog', { name: 'Padrões de TP — proteção' });
    expect(within(dialog).getByRole('combobox', { name: 'Subtipo padrão' })).toHaveValue('Sem subtipo');
    await userEvent.click(within(dialog).getByRole('button', { name: /Abrir lista/ }));
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual(['Sem subtipo', 'EPÓXI', 'Á SECO']);
    await userEvent.click(screen.getByRole('option', { name: 'Á SECO' }));
    await waitFor(() => expect(within(dialog).getByText('8 itens marcados NA por padrão')).toBeVisible());
    // "IA e IP lidos do visor" ships off and can be switched on.
    expect(within(dialog).getByRole('switch', { name: 'IA e IP lidos do visor' })).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // A TP placed on a coluna that had none starts with the type's config.
    await userEvent.click(screen.getByRole('button', { name: /^Coluna 9/ }));
    await userEvent.click(within(within(palette()).getByRole('group', { name: 'TP, 0' })).getByRole('button', { name: 'Mais um' }));
    await waitFor(async () => {
      const tps = (await templateRow(database!, ID))!.blocks.filter((b) => b.block_type === 'tp');
      expect(tps.reduce((sum, b) => sum + b.quantity, 0)).toBe(12);
      expect(tps.find((b) => b.skeleton_location_ref === 'subsolo-1/coluna-9')).toBeDefined();
      expect(tps.every((b) => b.subtype === 'a_seco' && b.na_defaults.length === 8)).toBe(true);
    });
  });

  it('two toggles pressed back to back both land: each change applies to the freshest row, in order', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    renderComposer();
    await screen.findByRole('complementary', { name: 'Paleta de blocos' });
    await userEvent.click(within(palette()).getByRole('button', { name: 'Editar padrões de Chave seccionadora' }));
    const dialog = await screen.findByRole('dialog', { name: 'Padrões de Chave seccionadora' });
    // No await between them: the second change is queued while the first is still writing.
    fireEvent.click(within(dialog).getByRole('switch', { name: 'Dados de placa' }));
    fireEvent.click(within(dialog).getByRole('switch', { name: 'Observações' }));
    await waitFor(async () => {
      const blocks = (await templateRow(database!, ID))!.blocks.filter((b) => b.block_type === 'chave_seccionadora');
      expect(blocks.every((b) => b.sub_blocks.nameplate?.enabled === false && b.sub_blocks.observations?.enabled === false)).toBe(true);
    });
    expect(await outboxPaths()).toEqual([`template/${ID}/blocks`, `template/${ID}/blocks`]);
  });
});

describe('3.6 composer: section text', () => {
  const area = (dialog: HTMLElement) => within(dialog).getByRole('textbox', { name: 'Texto da seção 1' });

  it('writes nothing onto another section when the one it was opened on moved elsewhere, and says so', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    renderComposer();
    await userEvent.click(await screen.findByRole('button', { name: 'Mais opções de 1 Objetivo' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Editar texto' }));
    const dialog = await screen.findByRole('dialog', { name: '1 Objetivo — texto fixo' });
    // The row this device reads at the moment of the write has section 2 at index 0.
    const stale = standardTemplate({ id: ID });
    vi.mocked(templateRow).mockImplementationOnce(async () => ({ ...stale, blocks: moveSection(stale.blocks, 0, 1) }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'cliente' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }));
    expect(await screen.findByText('A seção mudou em outro aparelho; o texto não foi salvo.')).toBeVisible();
    // The dialog closes, so later autosaves cannot repeat the toast.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await outboxPaths()).toEqual([]);
    expect((await templateRow(database!, ID))!.blocks.every((b) => b.section_text === null)).toBe(true);
  });

  it('"Restaurar texto padrão" right after typing writes the typed text first, so "Desfazer" brings it back', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    renderComposer();
    const open = async () => {
      await userEvent.click(await screen.findByRole('button', { name: 'Mais opções de 1 Objetivo' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Editar texto' }));
      return screen.findByRole('dialog', { name: '1 Objetivo — texto fixo' });
    };
    // An older committed text: the seed text with a chip in front.
    let dialog = await open();
    await userEvent.click(within(dialog).getByRole('button', { name: 'cliente' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }));
    await waitFor(async () => expect((await templateRow(database!, ID))!.blocks[0]!.section_text).toMatch(/^\{cliente\}O presente/));

    // Typed, and restored at once, well inside the 500 ms autosave idle.
    dialog = await open();
    const textbox = area(dialog);
    textbox.append(document.createTextNode(' Recém digitado.'));
    fireEvent.input(textbox);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Restaurar texto padrão' }));
    await waitFor(async () => expect((await templateRow(database!, ID))!.blocks[0]!.section_text).toBeNull());
    await userEvent.click(await screen.findByRole('button', { name: 'Desfazer' }));
    await waitFor(async () => expect((await templateRow(database!, ID))!.blocks[0]!.section_text).toMatch(/ Recém digitado\.$/));
  });

  it('an emptied text, or one typed back to the seed text, is stored as null: the seed text stays in force', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    renderComposer();
    const open = async () => {
      await userEvent.click(await screen.findByRole('button', { name: 'Mais opções de 1 Objetivo' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Editar texto' }));
      return screen.findByRole('dialog', { name: '1 Objetivo — texto fixo' });
    };
    let dialog = await open();
    await userEvent.click(within(dialog).getByRole('button', { name: 'cliente' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }));
    await waitFor(async () => expect((await templateRow(database!, ID))!.blocks[0]!.section_text).toMatch(/^\{cliente\}O presente/));

    // Back to the seed text: the chip removed with Backspace right after it.
    dialog = await open();
    const textbox = area(dialog);
    const chip = textbox.querySelector('.var-chip')!;
    const range = document.createRange();
    range.setStartAfter(chip);
    range.collapse(true);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    fireEvent.keyDown(textbox, { key: 'Backspace' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }));
    await waitFor(async () => expect((await templateRow(database!, ID))!.blocks[0]!.section_text).toBeNull());

    // Emptied: the whole text removed.
    dialog = await open();
    area(dialog).replaceChildren();
    fireEvent.input(area(dialog));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await templateRow(database!, ID))!.blocks[0]!.section_text).toBeNull();
    // Two writes only: the chip, then null; the emptied text found null already stored.
    expect(await outboxPaths()).toEqual([`template/${ID}/blocks`, `template/${ID}/blocks`]);

    // Restoring what is already the seed text writes nothing, and still says it is restored.
    dialog = await open();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Restaurar texto padrão' }));
    expect(await screen.findByText('Texto padrão restaurado')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull();
    expect(await outboxPaths()).toHaveLength(2);
  });

  it('offers "Editar texto" only on a section with text, opening the seed\'s text with its variables as chips', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    renderComposer();
    await userEvent.click(await screen.findByRole('button', { name: 'Mais opções de 8 Pontos de atenção' }));
    expect(within(await screen.findByRole('menu')).queryByRole('menuitem', { name: 'Editar texto' })).toBeNull();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());

    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de 1 Objetivo' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Editar texto' }));
    const dialog = await screen.findByRole('dialog', { name: '1 Objetivo — texto fixo' });
    const textbox = area(dialog);
    expect(textbox).toHaveAttribute('contenteditable', 'true');
    expect(textbox).toHaveAttribute('aria-multiline', 'true');
    expect([...textbox.querySelectorAll('.var-chip')].map((c) => c.textContent)).toEqual(['{empresa_executora}', '{obra}', '{cliente}']);
    expect(dialog.querySelector('.rt-toolbar')).toBeNull();
    const row = within(dialog).getByRole('group', { name: 'Inserir dado do relatório' });
    expect(within(row).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'cliente',
      'obra',
      'datas',
      'empresa executora',
      'responsável',
    ]);
    expect(await axe(dialog)).toHaveNoViolations();
  });

  it('inserts a chip, autosaves the text on close, and "Restaurar texto padrão" puts the seed back with "Desfazer"', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    renderComposer();
    await userEvent.click(await screen.findByRole('button', { name: 'Mais opções de 1 Objetivo' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Editar texto' }));
    let dialog = await screen.findByRole('dialog', { name: '1 Objetivo — texto fixo' });
    // The dialog opens with the focus, and so the caret, at the start of the text: the chip goes there.
    await userEvent.click(within(dialog).getByRole('button', { name: 'responsável' }));
    expect(area(dialog).querySelectorAll('.var-chip')).toHaveLength(4);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }));
    await waitFor(async () => expect((await templateRow(database!, ID))!.blocks[0]!.section_text).toMatch(/^\{responsavel\}O presente/));
    expect(await outboxPaths()).toEqual([`template/${ID}/blocks`]);

    // Reopened, it shows the template's own text.
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de 1 Objetivo' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Editar texto' }));
    dialog = await screen.findByRole('dialog', { name: '1 Objetivo — texto fixo' });
    expect(area(dialog).querySelectorAll('.var-chip')).toHaveLength(4);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Restaurar texto padrão' }));
    await waitFor(async () => expect((await templateRow(database!, ID))!.blocks[0]!.section_text).toBeNull());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText('Texto padrão restaurado')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    await waitFor(async () => expect((await templateRow(database!, ID))!.blocks[0]!.section_text).toMatch(/^\{responsavel\}O presente/));
  });
});
