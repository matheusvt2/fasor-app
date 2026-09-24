import 'fake-indexeddb/auto';
import { emptySheet, standardTemplate, type BlockRow, type ClientRow, type ProjectRow, type RelatorioRow, type RelatorioStatus } from '@app/domain';
import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { I18nProvider } from 'react-aria-components';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toRecord } from '../../db/commit.ts';
import { openDatabase, type AppDatabase } from '../../db/schema.ts';
import type { SessionState } from '../../state/session.tsx';
import { ToastProvider } from '../../state/toast.tsx';
import { ProjectSurface } from './project-surface.tsx';

/*
 * Story 4.1: the Project surface over a real device database: the empty state, the
 * relatórios newest first with the six columns of the mock, every line the kernel's.
 */

const COMPANY = '0b000000-0000-7000-8000-00000000000b';
const USER = '0b000000-0000-7000-8000-0000000000b1';
const TEMPLATE = '019966b0-0062-7000-8000-000000000001';
const PROJECT = '019966b0-0062-7000-8000-000000000002';
const CLIENT = '019966b0-0062-7000-8000-000000000003';
const OLDER = '019966b0-0062-7000-8000-000000000010';
const NEWER = '019966b0-0062-7000-8000-000000000020';
const LOCATION = '019966b0-0062-7000-8000-000000000030';

let database: AppDatabase | null = null;
let counter = 0;

const session = (): SessionState => ({
  status: 'signed-in',
  user: { id: USER, name: 'Bento Braga', email: 'b@teste.local', companyId: COMPANY, companyName: 'Empresa B de Teste', council: null, registrationNumber: null, title: null },
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

configure({ asyncUtilTimeout: 5000 });

async function freshDb(): Promise<AppDatabase> {
  const user = `019966b0-0063-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  return openDatabase(user);
}

const project: ProjectRow = { id: PROJECT, client_id: CLIENT, name: 'Torres A e B', site: 'Torres A e B', removed_at: null };
const client: ClientRow = { id: CLIENT, kind: 'client', name: 'Seguradora Exemplo S.A.', cnpj: null, contact_name: null, contact_phone: null, sites: [], removed_at: null };

const relatorio = (id: string, status: RelatorioStatus, start: string | null, end: string | null): RelatorioRow => ({
  id,
  project_id: PROJECT,
  template_id: TEMPLATE,
  template_version: 1,
  seed_version: 'v1',
  status,
  setup: {
    service_start: start,
    service_end: end,
    atividade: null,
    local: null,
    responsible_user_id: null,
    cover_photo_file_id: null,
    escopo: null,
    exclusions: null,
    additional_info: null,
    art_trt_number: null,
    instrument_ids: [],
    site_altitude_m: null,
    site_altitude_confirmed: false,
    next_intervention_date: null,
    next_intervention_justification: null,
  },
  export: { scheme: 'por_local_e_tipo' },
  preview_file_id: null,
  removed_at: null,
});

const sheet = (id: string, relatorioId: string, concluded: boolean): BlockRow => ({
  id,
  relatorio_id: relatorioId,
  location_id: LOCATION,
  equipment_id: null,
  block_type: 'chave_seccionadora',
  config: {},
  seed_version: 'v1',
  order_key: 'a0',
  feeds_block_id: null,
  not_tested: null,
  concluded_by: concluded ? { actor_id: USER, at: '2026-09-06T10:00:00.000Z' } : null,
  sheet: emptySheet(),
  created_by: null,
  first_edited_at: null,
  last_modified_by: null,
  last_modified_at: null,
  removed_at: null,
});

async function seed(db: AppDatabase, relatorios: RelatorioRow[], blocks: BlockRow[] = []) {
  await db.entities.bulkPut([
    toRecord(`project:${PROJECT}`, project),
    toRecord(`registry:${CLIENT}`, client),
    toRecord(`template:${TEMPLATE}`, standardTemplate({ id: TEMPLATE })),
    ...relatorios.map((row) => toRecord(`relatorio:${row.id}`, row)),
    ...blocks.map((row) => toRecord(`block:${row.id}`, row)),
  ]);
}

function renderProject(state?: { openNew: boolean }) {
  return render(
    <I18nProvider locale="pt-BR">
      <MemoryRouter initialEntries={[{ pathname: `/project/${PROJECT}`, state }]}>
        <ToastProvider>
          <Routes>
            <Route path="/project/:id" element={<ProjectSurface />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    </I18nProvider>,
  );
}

afterEach(() => {
  database?.close();
  database = null;
});

describe('4.1 ProjectSurface', () => {
  it('shows the head, the meta and the empty state with the same primary action twice', async () => {
    database = await freshDb();
    await seed(database, []);
    const { container } = renderProject();
    expect(await screen.findByRole('heading', { level: 2, name: 'Relatórios desta obra (0)' })).toBeVisible();
    expect(screen.getByText('Nenhum relatório nesta obra.')).toHaveClass('section-note');
    expect(screen.getAllByRole('button', { name: 'Novo relatório a partir de template' })).toHaveLength(2);
    expect(container.querySelector('.crumbs')).toHaveTextContent(/^Início.*Seguradora Exemplo S\.A\..*Torres A e B$/);
    expect(container.querySelector('.project-meta')).toHaveTextContent(/Cliente\s*Seguradora Exemplo S\.A\./);
    expect(container.querySelector('.project-meta')).toHaveTextContent(/Relatórios\s*0$/);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('lists the relatórios newest first with the six columns, every line from the kernel', async () => {
    database = await freshDb();
    await seed(
      database,
      [relatorio(OLDER, 'emitido', '2026-03-12', '2026-03-14'), relatorio(NEWER, 'rascunho', '2026-09-06', '2026-09-08')],
      [sheet('019966b0-0062-7000-8000-000000000040', NEWER, true), sheet('019966b0-0062-7000-8000-000000000041', NEWER, false)],
    );
    const { container } = renderProject();
    const list = await screen.findByRole('list', { name: 'Relatórios desta obra' });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(2));
    const [first, second] = within(list).getAllByRole('listitem');
    expect(first).toHaveAttribute('data-relatorio', NEWER);
    expect(second).toHaveAttribute('data-relatorio', OLDER);
    await waitFor(() => expect(first!.querySelector('.lr-sub')).toHaveTextContent(/^criado em \d{2}\/\d{2}\/\d{4} · Cabine primária — padrão$/));
    expect(first!.querySelector('.lr-title')).toHaveTextContent('Cabine primária — Torres A e B');
    expect(first!.querySelector('.status-pill')).toHaveAttribute('data-status', 'rascunho');
    expect(first!.querySelector('.lr-dates')).toHaveTextContent('06–08/09/2026');
    expect(first!.querySelector('.lr-template')).toHaveTextContent('Cabine primária — padrão');
    await waitFor(() => expect(first!.querySelector('.progress-counter')).toHaveTextContent('1 de 2 fichas'));
    expect(first!.querySelector('.progress-counter')).toHaveAttribute('data-state', 'pending');
    expect(second!.querySelector('.progress-counter')).toHaveTextContent('0 de 0 fichas');
    expect(within(first!).getByRole('link')).toHaveAttribute('href', `/relatorio/${NEWER}`);
    expect(container.querySelector('.relatorio-list-head')).toHaveTextContent('RelatórioStatusDatasTemplateProgresso');
    expect(screen.getByRole('heading', { level: 2, name: 'Relatórios desta obra (2)' })).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('opens the "Novo relatório" dialog at once, with the template preselected, when Home hands over a project it just created', async () => {
    database = await freshDb();
    await seed(database, []);
    renderProject({ openNew: true });
    const dialog = await screen.findByRole('dialog', { name: 'Novo relatório' });
    expect(dialog).toBeVisible();
    // The dialog waits for the templates query, so the only pickable template is already chosen.
    expect(within(dialog).getByRole('combobox', { name: 'Template' })).toHaveValue('Cabine primária — padrão');
    expect(within(dialog).getByRole('button', { name: 'Criar relatório' })).toHaveAccessibleDescription('Criar relatório: falta a data de início');
  });

  it('consumes the hand-over once: after Cancelar a later write to the project row does not reopen the dialog', async () => {
    database = await freshDb();
    await seed(database, []);
    renderProject({ openNew: true });
    const dialog = await screen.findByRole('dialog', { name: 'Novo relatório' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // A push ack rematerializes the project row: the live query re-emits a fresh object.
    await database.entities.put(toRecord(`project:${PROJECT}`, { ...project, site: 'Torres A, B e C' }));
    await screen.findByRole('heading', { level: 2, name: 'Torres A, B e C' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says so for an address that names no project on this device', async () => {
    database = await freshDb();
    renderProject();
    expect(await screen.findByText('Obra não encontrada.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Voltar para o início' })).toHaveAttribute('href', '/');
  });
});
