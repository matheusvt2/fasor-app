import 'fake-indexeddb/auto';
import { calendarDateOfInstant, standardTemplate, type ClientRow, type EquipmentRow, type ProjectRow, type TemplateRow } from '@app/domain';
import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from '../../test-axe.ts';
import { I18nProvider } from 'react-aria-components';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toRecord } from '../../db/commit.ts';
import { openDatabase, type AppDatabase } from '../../db/schema.ts';
import type { SessionState } from '../../state/session.tsx';
import type { SyncState } from '../../state/sync.tsx';
import { makeSyncState } from '../../test/sync-state.ts';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import { NewRelatorioDialog } from './new-relatorio-dialog.tsx';

/*
 * Story 4.1: the "Novo relatório" dialog over a real device database. The reason beside
 * "Criar relatório" follows the kernel, the end date follows the start, and Criar writes
 * ONE batch of 223 ops under one batch_id, then opens Relatório setup at Etapa 1 (Q1).
 */

const COMPANY = '0b000000-0000-7000-8000-00000000000b';
const USER = '0b000000-0000-7000-8000-0000000000b1';
const TEMPLATE = '019966b0-0060-7000-8000-000000000001';
const PROJECT = '019966b0-0060-7000-8000-000000000002';
const CLIENT = '019966b0-0060-7000-8000-000000000003';

let database: AppDatabase | null = null;
let counter = 0;
let registration: { council: 'crea' | 'crt' | null; registrationNumber: string | null } = { council: null, registrationNumber: null };

const session = (): SessionState => ({
  status: 'signed-in',
  user: { id: USER, name: 'Bento Braga', email: 'b@teste.local', companyId: COMPANY, companyName: 'Empresa B de Teste', ...registration, title: null },
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

let sync: SyncState = makeSyncState();
vi.mock('../../state/sync.tsx', () => ({ useSync: () => sync }));

configure({ asyncUtilTimeout: 5000 });

async function freshDb(): Promise<AppDatabase> {
  const user = `019966b0-0061-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  return openDatabase(user);
}

const project: ProjectRow = { id: PROJECT, client_id: CLIENT, name: 'Blocos Norte e Sul', site: 'Blocos Norte e Sul', removed_at: null };
const client: ClientRow = { id: CLIENT, kind: 'client', name: 'Seguradora Exemplo S.A.', cnpj: null, contact_name: null, contact_phone: null, sites: [], removed_at: null };
const template = (): TemplateRow => standardTemplate({ id: TEMPLATE });

function renderDialog(templates: TemplateRow[] = [template()]) {
  const onClose = vi.fn();
  render(
    <I18nProvider locale="pt-BR">
      <MemoryRouter initialEntries={['/project/x']}>
        <ToastProvider>
          <Routes>
            <Route path="/project/:id" element={<NewRelatorioDialog project={project} client={client} relatorios={[]} templates={templates} onClose={onClose} />} />
            <Route path="/relatorio/:id" element={<p data-testid="sumario-route">Sumário</p>} />
            <Route path="/relatorio/:id/setup" element={<SetupProbe />} />
          </Routes>
          <ToastOutlet />
        </ToastProvider>
      </MemoryRouter>
    </I18nProvider>,
  );
  return onClose;
}

const dialog = () => screen.getByRole('dialog', { name: 'Novo relatório' });
const create = () => within(dialog()).getByRole('button', { name: 'Criar relatório' });
const segments = (label: string) => within(within(dialog()).getByRole('group', { name: label })).getAllByRole('spinbutton');

async function typeDate(label: string, digits: string) {
  await userEvent.click(segments(label)[0]!);
  await userEvent.keyboard(digits);
}

afterEach(() => {
  database?.close();
  database = null;
  sync = makeSyncState();
  registration = { council: null, registrationNumber: null };
});

/** Where Criar lands: Relatório setup at Etapa 1 (Q1). */
function SetupProbe() {
  const [params] = useSearchParams();
  return <p data-testid="setup-route">{params.get('etapa')}</p>;
}

describe('4.1 NewRelatorioDialog', () => {
  it('preselects the one type and the only pickable template, and both dates open on today (12.2), so Criar is ready', async () => {
    database = await freshDb();
    await database.entities.put(toRecord(`template:${TEMPLATE}`, template()));
    renderDialog();
    const radio = within(dialog()).getByRole('radio', { name: /Cabine primária/ });
    expect(radio).toHaveAttribute('aria-checked', 'true');
    expect(radio).toHaveClass('option-row', 'is-selected');
    expect(within(dialog()).getByRole('combobox', { name: 'Template' })).toHaveValue('Cabine primária — padrão');
    expect(within(dialog()).getByText('Os 94 blocos nascem nas cabines e colunas do template, com a TAG final. Arquivados não aparecem.')).toHaveClass('helper');
    // Story 12.2 (J-12): today in America/Sao_Paulo, both dates.
    const [year, month, day] = calendarDateOfInstant(new Date()).split('-');
    expect(segments('Início da parada').map((seg) => seg.textContent)).toEqual([day, month, year]);
    expect(segments('Fim da parada').map((seg) => seg.textContent)).toEqual([day, month, year]);
    expect(create()).not.toHaveAttribute('aria-disabled');
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it('with no pickable template the reason names the template first', async () => {
    database = await freshDb();
    renderDialog([{ ...template(), archived_at: '2026-09-01T00:00:00.000Z' }]);
    expect(create()).toHaveAccessibleDescription('Criar relatório: falta o template');
  });

  it('the end follows the start until typed by hand, and an end before the start is refused', async () => {
    database = await freshDb();
    renderDialog();
    await typeDate('Início da parada', '06092026');
    await waitFor(() => expect(segments('Fim da parada').map((s) => s.textContent)).toEqual(['06', '09', '2026']));
    expect(create()).not.toHaveAttribute('aria-disabled');
    await typeDate('Fim da parada', '05092026');
    await waitFor(() => expect(create()).toHaveAccessibleDescription('Criar relatório: o fim é anterior ao início'));
    // A start typed again does not overwrite the end the user chose.
    await typeDate('Início da parada', '01092026');
    await waitFor(() => expect(segments('Fim da parada').map((s) => s.textContent)).toEqual(['05', '09', '2026']));
    expect(create()).not.toHaveAttribute('aria-disabled');
  });

  it('Criar writes one batch of 223 ops under one batch_id and opens Relatório setup at Etapa 1', async () => {
    database = await freshDb();
    await database.entities.put(toRecord(`template:${TEMPLATE}`, template()));
    const onClose = renderDialog();
    await typeDate('Início da parada', '06092026');
    await typeDate('Fim da parada', '08092026');
    await userEvent.click(create());
    expect(await screen.findByTestId('setup-route')).toHaveTextContent('1');
    expect(onClose).toHaveBeenCalled();
    const outbox = await database.outbox.toArray();
    expect(outbox).toHaveLength(223);
    expect(new Set(outbox.map((op) => op.batch_id)).size).toBe(1);
    expect(outbox.filter((op) => op.path.startsWith('relatorio/'))).toHaveLength(1);
    expect(outbox.filter((op) => op.path.startsWith('location/'))).toHaveLength(23);
    expect(outbox.filter((op) => op.path.startsWith('equipment/'))).toHaveLength(94);
    expect(outbox.filter((op) => op.path.startsWith('block/'))).toHaveLength(105);
    const relatorio = outbox.find((op) => op.path.startsWith('relatorio/'))!.value as { template_id: string; template_version: number; seed_version: string; status: string; setup: { service_start: string; service_end: string } };
    // The session user carries no registration here: nobody is written as responsável (Q2).
    expect(relatorio).toMatchObject({ template_id: TEMPLATE, template_version: 1, seed_version: 'v3', status: 'rascunho', setup: { service_start: '2026-09-06', service_end: '2026-09-08', responsible_user_id: null } });
    expect(await database.entities.where('entity').equals('block').count()).toBe(105);
  });

  it('Q2: a session user with a registration is written as the responsável técnico in the creation batch', async () => {
    database = await freshDb();
    registration = { council: 'crea', registrationNumber: 'SP 5069912345' };
    await database.entities.put(toRecord(`template:${TEMPLATE}`, template()));
    renderDialog();
    await typeDate('Início da parada', '06092026');
    await userEvent.click(create());
    await screen.findByTestId('setup-route');
    const relatorio = (await database.outbox.toArray()).find((op) => op.path.startsWith('relatorio/'))!.value as { setup: { responsible_user_id: string | null } };
    expect(relatorio.setup.responsible_user_id).toBe(USER);
  });

  it('Q4: reuses the equipment the project already holds by base TAG and type: the chave in Coluna 5 is bound to SEC-C05, no second one is minted', async () => {
    database = await freshDb();
    const EQUIPMENT = '019966b0-0060-7000-8000-000000000004';
    const existing: EquipmentRow = { id: EQUIPMENT, project_id: PROJECT, tag: 'SEC-C05', type: 'chave_seccionadora', last_nameplate: null, removed_at: null };
    await database.entities.bulkPut([toRecord(`template:${TEMPLATE}`, template()), toRecord(`equipment:${EQUIPMENT}`, existing)]);
    renderDialog();
    await typeDate('Início da parada', '06092026');
    await userEvent.click(create());
    await screen.findByTestId('setup-route');
    const outbox = await database.outbox.toArray();
    const tags = outbox.filter((op) => op.path.startsWith('equipment/')).map((op) => (op.value as { tag: string }).tag);
    expect(tags).toHaveLength(93);
    expect(tags.filter((tag) => tag.startsWith('SEC-C05'))).toEqual([]);
    const bound = outbox.filter((op) => op.path.startsWith('block/')).map((op) => op.value as { equipment_id: string | null }).filter((row) => row.equipment_id === EQUIPMENT);
    expect(bound).toHaveLength(1);
  });

  it('suggests TAGs around a live equipment of another type: SEC-C05 taken by a TP, the new chave in Coluna 5 is SEC-C05-2', async () => {
    database = await freshDb();
    const EQUIPMENT = '019966b0-0060-7000-8000-000000000004';
    const existing: EquipmentRow = { id: EQUIPMENT, project_id: PROJECT, tag: 'SEC-C05', type: 'tp', last_nameplate: null, removed_at: null };
    await database.entities.bulkPut([toRecord(`template:${TEMPLATE}`, template()), toRecord(`equipment:${EQUIPMENT}`, existing)]);
    renderDialog();
    await typeDate('Início da parada', '06092026');
    await userEvent.click(create());
    await screen.findByTestId('setup-route');
    const tags = (await database.outbox.toArray()).filter((op) => op.path.startsWith('equipment/')).map((op) => (op.value as { tag: string }).tag);
    expect(tags).toHaveLength(94);
    expect(tags).toContain('SEC-C05-2');
    expect(tags).not.toContain('SEC-C05');
    expect(tags.filter((tag) => tag.startsWith('SEC-C05'))).toEqual(['SEC-C05-2']);
  });

  describe('E4 retro item 17: another relatório of the obra this device never pulled', () => {
    const OTHER = '019966b0-0060-7000-8000-000000000009';
    const summary = { id: OTHER, project_id: PROJECT, status: 'emitido' as const, template_id: TEMPLATE, seed_version: 'v1', updated_seq: 9 };
    const EQUIPMENT = '019966b0-0060-7000-8000-000000000004';
    const pulled: EquipmentRow = { id: EQUIPMENT, project_id: PROJECT, tag: 'SEC-C05', type: 'chave_seccionadora', last_nameplate: null, removed_at: null };

    async function deviceThatNeverPulledIt(): Promise<AppDatabase> {
      const db = await freshDb();
      await db.entities.put(toRecord(`template:${TEMPLATE}`, template()));
      await db.sync_state.put({ id: 'company', cursor_seq: 9, complete: true, files_pending: 0, downloaded_at: '2026-09-24T10:00:00.000Z', last_sync_at: null, last_push_at: [], relatorios: [summary] });
      return db;
    }

    it('offline: "Criar relatório" gives the kernel reason and nothing is written', async () => {
      database = await deviceThatNeverPulledIt();
      sync = makeSyncState({ online: false });
      renderDialog();
      await typeDate('Início da parada', '06092026');
      await waitFor(() => expect(create()).toHaveAccessibleDescription('Criar relatório: conecte-se para baixar os equipamentos desta obra'));
      expect(create()).toHaveAttribute('aria-disabled', 'true');
      await userEvent.click(create());
      expect(screen.queryByTestId('setup-route')).toBeNull();
      expect(await database.outbox.count()).toBe(0);
    });

    it('online: the project stream is pulled first and its equipment is reused (no suffixed TAG)', async () => {
      database = await deviceThatNeverPulledIt();
      const db = database;
      const syncProject = vi.fn(async (projectId: string) => {
        // What the engine's pull leaves on the device: the obra's equipment and the downloaded stream.
        await db.entities.put(toRecord(`equipment:${EQUIPMENT}`, pulled));
        await db.sync_state.put({ id: `project:${projectId}`, cursor_seq: 9, complete: true, files_pending: 0, downloaded_at: '2026-09-24T10:01:00.000Z', last_sync_at: null, last_push_at: [] });
        return 'ran' as const;
      });
      sync = makeSyncState({ syncProject });
      renderDialog();
      await typeDate('Início da parada', '06092026');
      await userEvent.click(create());
      await screen.findByTestId('setup-route');
      expect(syncProject).toHaveBeenCalledWith(PROJECT);
      const tags = (await db.outbox.toArray()).filter((op) => op.path.startsWith('equipment/')).map((op) => (op.value as { tag: string }).tag);
      expect(tags).toHaveLength(93);
      expect(tags.filter((tag) => tag.startsWith('SEC-C05'))).toEqual([]);
    });

    it('online with a failed pull: refused with the same reason, nothing written', async () => {
      database = await deviceThatNeverPulledIt();
      sync = makeSyncState({ syncProject: vi.fn(async () => 'ran' as const) });
      renderDialog();
      await typeDate('Início da parada', '06092026');
      await userEvent.click(create());
      expect(await screen.findByText('Criar relatório: conecte-se para baixar os equipamentos desta obra')).toBeInTheDocument();
      expect(screen.queryByTestId('setup-route')).toBeNull();
      expect(await database.outbox.count()).toBe(0);
    });
  });
});
