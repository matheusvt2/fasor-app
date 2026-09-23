import 'fake-indexeddb/auto';
import { standardTemplate, templateRowSchema, type RelatorioSummary, type TemplateRow } from '@app/domain';
import { cleanup, configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commitBatch, toRecord, undoBatch } from '../../db/commit.ts';
import { COMPANY_STREAM, openDatabase, type AppDatabase } from '../../db/schema.ts';
import type { SessionState } from '../../state/session.tsx';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import { TemplatesSurface } from './templates-surface.tsx';

/*
 * Stories 3.2 and 3.3: the Templates surface over a real device database. The empty
 * state's one action commits exactly one `template/{id}` create built by the kernel; the
 * list shows each template with its summary line and row actions, the archived group
 * below, and every action writes `template/` ops only.
 */

const COMPANY = '0b000000-0000-7000-8000-00000000000b';
const USER = '0b000000-0000-7000-8000-0000000000b1';

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

// Each edit is an IndexedDB write plus a live-query round trip; under a full parallel run
// that can outlast the one-second default.
configure({ asyncUtilTimeout: 5000 });
// The real commit path, wrapped so one test can make the device write fail.
vi.mock('../../db/commit.ts', async (original) => {
  const actual = await original<typeof import('../../db/commit.ts')>();
  return { ...actual, commitBatch: vi.fn(actual.commitBatch), undoBatch: vi.fn(actual.undoBatch) };
});

/** A device database; `downloaded` says whether the company stream was pulled to the end once. */
async function freshDb(downloaded = true, relatorios: RelatorioSummary[] = []): Promise<AppDatabase> {
  const user = `019966b0-0032-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  const fresh = openDatabase(user);
  if (downloaded) await markDownloaded(fresh, relatorios);
  return fresh;
}

async function markDownloaded(db: AppDatabase, relatorios: RelatorioSummary[] = []): Promise<void> {
  await db.sync_state.put({
    id: COMPANY_STREAM,
    cursor_seq: 1,
    complete: true,
    files_pending: 0,
    downloaded_at: '2026-09-22T12:00:00.000Z',
    last_sync_at: '2026-09-22T12:00:00.000Z',
    last_push_at: [],
    relatorios,
  });
}

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderSurface() {
  return render(
    <MemoryRouter initialEntries={['/templates']}>
      <ToastProvider>
        <Routes>
          <Route path="/templates" element={<TemplatesSurface />} />
          <Route path="/templates/:id" element={<Where />} />
        </Routes>
        <ToastOutlet />
      </ToastProvider>
    </MemoryRouter>,
  );
}

const A = '019966b0-0033-7000-8000-000000000001';
const B = '019966b0-0033-7000-8000-000000000002';
const GONE = '019966b0-0033-7000-8000-000000000003';
const OLD = '019966b0-0033-7000-8000-000000000004';

const template = (id: string, name: string, extra: Partial<TemplateRow> = {}): TemplateRow => ({
  ...standardTemplate({ id }),
  name,
  ...extra,
});

async function seed(db: AppDatabase, rows: TemplateRow[]): Promise<void> {
  await db.entities.bulkPut(rows.map((row) => toRecord(`template:${row.id}`, row)));
}

const summary = (template_id: string): RelatorioSummary => ({
  id: '019966b0-0033-7000-8000-0000000000f1',
  project_id: '019966b0-0033-7000-8000-0000000000f2',
  status: 'em_campo',
  template_id,
  seed_version: 'v1',
  updated_seq: 3,
});

const primaries = (list: HTMLElement) => [...list.querySelectorAll('.rr-primary')].map((el) => el.textContent);

afterEach(async () => {
  cleanup();
  vi.mocked(commitBatch).mockClear();
  database?.close();
  database = null;
});

describe('Templates: empty state', () => {
  it('says there is no template and offers the standard one, with no violations', async () => {
    database = await freshDb();
    const { container } = renderSurface();

    expect(await screen.findByRole('heading', { level: 2, name: 'Templates (0)' })).toBeVisible();
    expect(
      screen.getByText('Um template é a composição de blocos que um relatório novo copia. Alterar um template não muda relatórios já criados a partir dele.'),
    ).toBeVisible();
    expect(screen.getByText('Nenhum template. Crie um a partir do relatório padrão FO.SERV-03.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Criar template padrão' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Novo template' })).toBeVisible();
    expect(container.querySelector('.screen[data-route="/templates"] > .tpl-content')).not.toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('commits one template/{id} create of the standard template, then lists it', async () => {
    database = await freshDb();
    renderSurface();
    await userEvent.click(await screen.findByRole('button', { name: 'Criar template padrão' }));

    const list = await screen.findByRole('list', { name: 'Templates ativos' });
    expect(primaries(list)).toEqual(['Cabine primária — padrão']);
    expect(screen.getByRole('heading', { level: 2, name: 'Templates (1)' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Criar template padrão' })).toBeNull();

    const outbox = await database.outbox.toArray();
    expect(outbox).toHaveLength(1);
    const op = outbox[0]!;
    expect(op).toMatchObject({ kind: 'create', scope: 'company', company_id: COMPANY, actor_id: USER, status: 'pending' });
    const id = op.path.replace('template/', '');
    expect(op.path).toBe(`template/${id}`);
    expect(templateRowSchema.parse(op.value)).toEqual(standardTemplate({ id }));
  });

  it('writes one template however fast the action is pressed twice', async () => {
    database = await freshDb();
    renderSurface();
    const action = await screen.findByRole('button', { name: 'Criar template padrão' });
    const user = userEvent.setup();
    await Promise.all([user.click(action), user.click(action)]);

    await screen.findByRole('list', { name: 'Templates ativos' });
    expect(await database.outbox.count()).toBe(1);
    expect(await database.entities.where('entity').equals('template').count()).toBe(1);
  });
});

describe('Templates: before the first company download', () => {
  it('keeps the action disabled with its reason until the company stream was pulled once', async () => {
    database = await freshDb(false);
    renderSurface();
    const action = await screen.findByRole('button', { name: 'Criar template padrão' });
    expect(action).toHaveAttribute('aria-disabled', 'true');
    expect(action).toHaveAccessibleDescription('Aguardando o primeiro download da empresa');
    await userEvent.click(action);
    expect(await database.outbox.count()).toBe(0);

    await markDownloaded(database);
    await waitFor(() => expect(action).not.toHaveAttribute('aria-disabled'));
    expect(action).not.toHaveAccessibleDescription();
  });
});

describe('Templates: a refused write', () => {
  it('names the quota refusal, writes nothing and offers the action again', async () => {
    database = await freshDb();
    vi.mocked(commitBatch).mockRejectedValueOnce(Object.assign(new Error('quota'), { name: 'QuotaExceededError' }));
    renderSurface();
    const action = await screen.findByRole('button', { name: 'Criar template padrão' });
    await userEvent.click(action);

    expect(await screen.findByText('Não foi possível salvar neste aparelho. Libere espaço e tente de novo.')).toBeVisible();
    await waitFor(() => expect(action).not.toHaveAttribute('aria-disabled'));
    expect(screen.queryByText('Criando o template…')).toBeNull();
    expect(await database.outbox.count()).toBe(0);
    expect(await database.entities.where('entity').equals('template').count()).toBe(0);
  });
});

describe('3.3 Templates: list', () => {
  it('lists the active templates by name with their summary line and row actions, the archived ones below', async () => {
    database = await freshDb();
    await seed(database, [
      template(A, 'Subestação Norte — cópia'),
      template(B, 'Cabine primária — padrão'),
      template(GONE, 'Removido', { removed_at: '2026-09-20T10:00:00.000Z' }),
      template(OLD, 'Revisão anterior', { archived_at: '2026-09-20T10:00:00.000Z' }),
    ]);
    const { container } = renderSurface();

    const list = await screen.findByRole('list', { name: 'Templates ativos' });
    await waitFor(() => expect(primaries(list)).toEqual(['Cabine primária — padrão', 'Subestação Norte — cópia']));
    expect(screen.getByRole('heading', { level: 2, name: 'Templates (2)' })).toBeVisible();
    const first = within(list).getAllByRole('listitem')[0]!;
    expect(first).toHaveClass('registry-row', 'tpl-row');
    expect(first.querySelector('.rr-secondary')).toHaveTextContent(
      'Semente v1 · 9 seções · 6 cabines · 17 colunas · 94 blocos de equipamento',
    );
    expect(within(first).getByRole('button', { name: 'Abrir template Cabine primária — padrão' })).toHaveClass('rr-text');
    expect(within(first).getByRole('button', { name: 'Duplicar' })).toBeVisible();
    expect(within(first).getByRole('button', { name: 'Arquivar' })).toBeVisible();
    expect(within(first).getByRole('button', { name: 'Mais opções de Cabine primária — padrão' })).toBeVisible();

    expect(screen.getByRole('heading', { level: 2, name: 'Arquivados (1)' })).toBeVisible();
    expect(
      screen.getByText('Não aparecem em "Novo relatório a partir de template". Relatórios já criados continuam intactos.'),
    ).toBeVisible();
    const archived = screen.getByRole('list', { name: 'Templates arquivados' });
    const old = within(archived).getByRole('listitem');
    expect(old).toHaveClass('is-archived');
    expect(within(old).getByRole('button', { name: 'Restaurar' })).toBeVisible();
    expect(within(old).queryByRole('button', { name: 'Arquivar' })).toBeNull();
    expect(screen.queryByText('Removido')).toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('counts the relatórios made from a template and never offers "Remover" on a referenced one', async () => {
    database = await freshDb(true, [summary(B)]);
    await seed(database, [template(A, 'Livre'), template(B, 'Usado'), template(OLD, 'Arquivado usado', { archived_at: '2026-09-20T10:00:00.000Z' })]);
    renderSurface();
    const list = await screen.findByRole('list', { name: 'Templates ativos' });
    await waitFor(() => expect(primaries(list)).toEqual(['Livre', 'Usado']));
    const [free, used] = within(list).getAllByRole('listitem');
    expect(used!.querySelector('.rr-secondary')).toHaveTextContent(/ · usado em 1 relatório$/);
    expect(within(used!).queryByRole('button', { name: /^Mais opções/ })).toBeNull();
    expect(within(used!).getByRole('button', { name: 'Arquivar' })).toBeVisible();
    expect(within(used!).getByRole('button', { name: 'Duplicar' })).toBeVisible();

    await userEvent.click(within(free!).getByRole('button', { name: 'Mais opções de Livre' }));
    expect(await screen.findByRole('menuitem', { name: 'Remover' })).toBeVisible();
    await userEvent.keyboard('{Escape}');

    // An archived template follows the same rule: referenced, so no Overflow at all.
    await database.sync_state.update(COMPANY_STREAM, { relatorios: [summary(B), summary(OLD)] });
    const archived = await screen.findByRole('list', { name: 'Templates arquivados' });
    await waitFor(() => expect(within(archived).queryByRole('button', { name: /^Mais opções/ })).toBeNull());
  });
});

describe('3.3 Templates: before the first company download', () => {
  it('offers no "Remover" while the company summary has not been downloaded yet', async () => {
    database = await freshDb(false);
    await seed(database, [template(A, 'Cabine primária — padrão')]);
    renderSurface();
    const list = await screen.findByRole('list', { name: 'Templates ativos' });
    await waitFor(() => expect(primaries(list)).toEqual(['Cabine primária — padrão']));
    expect(within(list).queryByRole('button', { name: /^Mais opções/ })).toBeNull();
    await markDownloaded(database);
    expect(await within(list).findByRole('button', { name: 'Mais opções de Cabine primária — padrão' })).toBeVisible();
  });
});

describe('3.3 Templates: actions', () => {
  it('"Duplicar" pressed twice quickly makes one copy', async () => {
    database = await freshDb();
    await seed(database, [template(A, 'Cabine primária — padrão')]);
    renderSurface();
    const list = await screen.findByRole('list', { name: 'Templates ativos' });
    const duplicate = await within(list).findByRole('button', { name: 'Duplicar' });
    const user = userEvent.setup();
    await Promise.all([user.click(duplicate), user.click(duplicate)]);
    await waitFor(() => expect(primaries(list)).toEqual(['Cabine primária — padrão', 'Cabine primária — padrão — cópia']));
    expect(await database.outbox.count()).toBe(1);
  });

  it('"Desfazer" whose write is refused says why', async () => {
    database = await freshDb();
    await seed(database, [template(A, 'Cabine primária — padrão')]);
    renderSurface();
    const list = await screen.findByRole('list', { name: 'Templates ativos' });
    await userEvent.click(await within(list).findByRole('button', { name: 'Arquivar' }));
    await screen.findByRole('list', { name: 'Templates arquivados' });
    // The undo's device write is refused.
    vi.mocked(undoBatch).mockRejectedValueOnce(Object.assign(new Error('quota'), { name: 'QuotaExceededError' }));
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(await screen.findByText('Não foi possível salvar neste aparelho. Libere espaço e tente de novo.')).toBeVisible();
  });

  it('"Duplicar" writes one template/{id} create named "⟨nome⟩ — cópia" with the same composition', async () => {
    database = await freshDb();
    await seed(database, [template(A, 'Cabine primária — padrão')]);
    renderSurface();
    const list = await screen.findByRole('list', { name: 'Templates ativos' });
    await userEvent.click(await within(list).findByRole('button', { name: 'Duplicar' }));

    await waitFor(() => expect(primaries(list)).toEqual(['Cabine primária — padrão', 'Cabine primária — padrão — cópia']));
    expect(await screen.findByText('Duplicado como “Cabine primária — padrão — cópia”')).toBeVisible();
    const outbox = await database.outbox.toArray();
    expect(outbox).toHaveLength(1);
    const created = templateRowSchema.parse(outbox[0]!.value);
    expect(outbox[0]).toMatchObject({ kind: 'create', path: `template/${created.id}` });
    expect(created.id).not.toBe(A);
    expect(created.blocks).toEqual(standardTemplate({ id: A }).blocks);
    expect(created.skeleton).toEqual(standardTemplate({ id: A }).skeleton);
  });

  it('"Arquivar" moves the row under "Arquivados (1)", "Restaurar" brings it back, both one put of archived_at', async () => {
    database = await freshDb();
    await seed(database, [template(A, 'Cabine primária — padrão')]);
    renderSurface();
    const list = await screen.findByRole('list', { name: 'Templates ativos' });
    await userEvent.click(await within(list).findByRole('button', { name: 'Arquivar' }));

    const archived = await screen.findByRole('list', { name: 'Templates arquivados' });
    expect(primaries(archived)).toEqual(['Cabine primária — padrão']);
    expect(screen.getByRole('heading', { level: 2, name: 'Arquivados (1)' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Templates (0)' })).toBeVisible();
    expect(await screen.findByText('Template arquivado · relatórios já criados continuam intactos')).toBeVisible();

    await userEvent.click(within(archived).getByRole('button', { name: 'Restaurar' }));
    const back = await screen.findByRole('list', { name: 'Templates ativos' });
    await waitFor(() => expect(primaries(back)).toEqual(['Cabine primária — padrão']));
    expect(screen.queryByRole('list', { name: 'Templates arquivados' })).toBeNull();

    const outbox = (await database.outbox.toArray()).sort((a, b) => (a.client_ts < b.client_ts ? -1 : 1));
    expect(outbox.map((op) => [op.kind, op.path, op.value === null ? null : 'iso'])).toEqual([
      ['put', `template/${A}/archived_at`, 'iso'],
      ['put', `template/${A}/archived_at`, null],
    ]);
  });

  it('"Remover" asks first with the focus on "Cancelar", hides the template, and "Desfazer" brings it back', async () => {
    database = await freshDb();
    await seed(database, [template(A, 'Cabine primária — padrão'), template(B, 'Outro')]);
    renderSurface();
    const list = await screen.findByRole('list', { name: 'Templates ativos' });
    await userEvent.click(await within(list).findByRole('button', { name: 'Mais opções de Outro' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remover' }));

    const dialog = await screen.findByRole('dialog', { name: 'Remover Outro?' });
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus());
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remover' }));

    await waitFor(() => expect(primaries(list)).toEqual(['Cabine primária — padrão']));
    expect(await screen.findByText('Outro removido')).toBeVisible();
    expect((await database.outbox.toArray()).map((op) => [op.kind, op.path])).toEqual([['remove', `template/${B}/removed_at`]]);

    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    await waitFor(() => expect(primaries(list)).toEqual(['Cabine primária — padrão', 'Outro']));
    const paths = (await database.outbox.toArray()).map((op) => op.path);
    expect(paths.every((path) => path.startsWith('template/'))).toBe(true);
  });

  it('"Novo template" creates an empty composition and opens it', async () => {
    database = await freshDb();
    await seed(database, [template(A, 'Cabine primária — padrão')]);
    renderSurface();
    await screen.findByRole('list', { name: 'Templates ativos' });
    await userEvent.click(screen.getByRole('button', { name: 'Novo template' }));

    const where = await screen.findByTestId('where');
    const outbox = await database.outbox.toArray();
    expect(outbox).toHaveLength(1);
    const created = templateRowSchema.parse(outbox[0]!.value);
    expect(created).toMatchObject({ name: 'Novo template', blocks: [], skeleton: [], seed_version: 'v1', version: 1 });
    expect(where).toHaveTextContent(`/templates/${created.id}`);
  });
});
