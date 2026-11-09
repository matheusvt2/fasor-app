import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMPANY_STREAM, openDatabase, type AppDatabase } from '../../db/schema.ts';
import type { SessionState } from '../../state/session.tsx';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import { TemplatesSurface } from './templates-surface.tsx';

/*
 * Story 23.12 (M-1 (b)): "Importar base de ensaios" on the Tipos section. The file is synthetic
 * (rev08's shape and row IDs, invented text only).
 */

const COMPANY = '0b000000-0000-7000-8000-00000000000b';
const USER = '0b000000-0000-7000-8000-0000000000b1';
const FIXTURE = readFileSync(resolve(__dirname, '../../../../../packages/domain/fixtures/test-base/base-ensaios-sintetica.json'), 'utf8');

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
  aiFeatures: true,
  database,
  signIn: vi.fn(),
  signOut: vi.fn(async () => {}),
  saveRegistration: vi.fn(async () => {}),
  savePhotoLocation: vi.fn(async () => {}),
  recoveryNeeded: false,
  settled: true,
  dismissRecovery: vi.fn(),
});

vi.mock('../../state/session.tsx', () => ({ useSession: () => session() }));

configure({ asyncUtilTimeout: 5000 });

async function freshDb(): Promise<AppDatabase> {
  const user = `019966b0-0132-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  const fresh = openDatabase(user);
  await fresh.sync_state.put({
    id: COMPANY_STREAM,
    cursor_seq: 1,
    complete: true,
    files_pending: 0,
    downloaded_at: '2026-09-22T12:00:00.000Z',
    last_sync_at: '2026-09-22T12:00:00.000Z',
    last_push_at: [],
    relatorios: [],
  });
  return fresh;
}

function renderSurface() {
  return render(
    <MemoryRouter initialEntries={['/templates']}>
      <ToastProvider>
        <Routes>
          <Route path="/templates" element={<TemplatesSurface />} />
        </Routes>
        <ToastOutlet />
      </ToastProvider>
    </MemoryRouter>,
  );
}

const fileInput = () => screen.getByLabelText<HTMLInputElement>('Arquivo JSON da base de ensaios');
const jsonFile = (text: string) => new File([text], 'base.json', { type: 'application/json' });

afterEach(async () => {
  cleanup();
  await database?.delete();
  database = null;
});

describe('23.12 Tipos: "Importar base de ensaios"', () => {
  it('renders the action in the Tipos section head', async () => {
    database = await freshDb();
    renderSurface();
    const section = (await screen.findByRole('heading', { level: 2, name: 'Tipos de equipamento' })).closest('section')!;
    expect(within(section).getByRole('button', { name: 'Importar base de ensaios' })).toBeVisible();
    expect(fileInput().accept).toBe('application/json,.json');
  });

  it('an invalid file shows the alert and writes nothing', async () => {
    database = await freshDb();
    renderSurface();
    await screen.findByRole('button', { name: 'Importar base de ensaios' });
    await userEvent.upload(fileInput(), jsonFile('{ not json'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Este arquivo não é uma base de ensaios: o JSON não pôde ser lido. Nada foi gravado.');
    await userEvent.upload(fileInput(), jsonFile('{"versao":"x"}'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('falta a lista "ensaios"'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await database.outbox.count()).toBe(0);
  });

  it('a valid file opens the preview; "Importar" commits one batch and the copies appear; a second import offers no confirm', async () => {
    database = await freshDb();
    renderSurface();
    await screen.findByRole('button', { name: 'Importar base de ensaios' });
    await userEvent.upload(fileInput(), jsonFile(FIXTURE));
    const dialog = await screen.findByRole('dialog', { name: 'Importar base de ensaios' });
    expect(dialog).toHaveTextContent(/Cria \d+ tipos da empresa, com os textos de \d+ ensaios: /);
    expect(dialog).toHaveTextContent('Sem ensaio no app: ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Importar' }));
    expect(await screen.findByText(/tipos importados da base de ensaios/)).toBeVisible();
    const outbox = await database.outbox.toArray();
    expect(new Set(outbox.map((op) => op.batch_id)).size).toBe(1);
    expect(outbox.some((op) => op.path.startsWith('equipment_type_version/'))).toBe(true);
    const company = await screen.findByRole('list', { name: /^Da empresa/ });
    await waitFor(() => expect(within(company).getByText('Disjuntor MT (DJ)', { exact: false })).toBeVisible());

    const before = await database.outbox.count();
    await userEvent.upload(fileInput(), jsonFile(FIXTURE));
    const again = await screen.findByRole('dialog', { name: 'Importar base de ensaios' });
    expect(again).toHaveTextContent('Todos os tipos desta base já foram importados. Nada será gravado.');
    expect(within(again).queryByRole('button', { name: 'Importar' })).toBeNull();
    await userEvent.click(within(again).getByRole('button', { name: 'Cancelar' }));
    expect(await database.outbox.count()).toBe(before);
  });
});
