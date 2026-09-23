import 'fake-indexeddb/auto';
import { standardTemplate, templateRowSchema, type TemplateRow } from '@app/domain';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commitBatch, toRecord } from '../../db/commit.ts';
import { COMPANY_STREAM, openDatabase, type AppDatabase } from '../../db/schema.ts';
import type { SessionState } from '../../state/session.tsx';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import { TemplatesSurface } from './templates-surface.tsx';

/*
 * Story 3.2: the Templates surface over a real device database. The empty state's one
 * action commits exactly one `template/{id}` create built by the kernel, and a list shows
 * the live templates by name with nothing else on the row (Story 3.3 adds the rest).
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
// The real commit path, wrapped so one test can make the device write fail.
vi.mock('../../db/commit.ts', async (original) => {
  const actual = await original<typeof import('../../db/commit.ts')>();
  return { ...actual, commitBatch: vi.fn(actual.commitBatch) };
});

/** A device database; `downloaded` says whether the company stream was pulled to the end once. */
async function freshDb(downloaded = true): Promise<AppDatabase> {
  const user = `019966b0-0032-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  const fresh = openDatabase(user);
  if (downloaded) await markDownloaded(fresh);
  return fresh;
}

async function markDownloaded(db: AppDatabase): Promise<void> {
  await db.sync_state.put({
    id: COMPANY_STREAM,
    cursor_seq: 1,
    complete: true,
    files_pending: 0,
    downloaded_at: '2026-09-22T12:00:00.000Z',
    last_sync_at: '2026-09-22T12:00:00.000Z',
    last_push_at: [],
  });
}

function renderSurface() {
  return render(
    <ToastProvider>
      <TemplatesSurface />
    </ToastProvider>,
  );
}

const template = (id: string, name: string, removed_at: string | null = null): TemplateRow => ({
  ...standardTemplate({ id }),
  name,
  removed_at,
});

afterEach(async () => {
  cleanup();
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
    expect(container.querySelector('.screen[data-route="/templates"] > .tpl-content')).not.toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('commits one template/{id} create of the standard template, then lists it', async () => {
    database = await freshDb();
    renderSurface();
    await userEvent.click(await screen.findByRole('button', { name: 'Criar template padrão' }));

    const list = await screen.findByRole('list', { name: 'Templates ativos' });
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Cabine primária — padrão']);
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
    render(
      <ToastProvider>
        <TemplatesSurface />
        <ToastOutlet />
      </ToastProvider>,
    );
    const action = await screen.findByRole('button', { name: 'Criar template padrão' });
    await userEvent.click(action);

    expect(await screen.findByText('Não foi possível salvar neste aparelho. Libere espaço e tente de novo.')).toBeVisible();
    await waitFor(() => expect(action).not.toHaveAttribute('aria-disabled'));
    expect(screen.queryByText('Criando o template…')).toBeNull();
    expect(await database.outbox.count()).toBe(0);
    expect(await database.entities.where('entity').equals('template').count()).toBe(0);
  });
});

describe('Templates: list', () => {
  it('lists the live templates by name, the name alone on each row', async () => {
    database = await freshDb();
    const a = '019966b0-0033-7000-8000-000000000001';
    const b = '019966b0-0033-7000-8000-000000000002';
    const gone = '019966b0-0033-7000-8000-000000000003';
    await database.entities.bulkPut([
      toRecord(`template:${a}`, template(a, 'Subestação Norte — cópia')),
      toRecord(`template:${b}`, template(b, 'Cabine primária — padrão')),
      toRecord(`template:${gone}`, template(gone, 'Arquivado', '2026-09-20T10:00:00.000Z')),
    ]);
    const { container } = renderSurface();

    const list = await screen.findByRole('list', { name: 'Templates ativos' });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(2));
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Cabine primária — padrão',
      'Subestação Norte — cópia',
    ]);
    expect(screen.getByRole('heading', { level: 2, name: 'Templates (2)' })).toBeVisible();
    for (const row of container.querySelectorAll('.registry-row.tpl-row')) {
      expect(row.querySelectorAll('.rr-primary')).toHaveLength(1);
      expect(row.querySelectorAll('.rr-secondary, button, a')).toHaveLength(0);
    }
    expect(screen.queryByText('Nenhum template. Crie um a partir do relatório padrão FO.SERV-03.')).toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });
});
