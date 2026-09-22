import 'fake-indexeddb/auto';
import { defaultEmpresaRow, type EmpresaRow, type RegistryRow } from '@app/domain';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../state/toast.tsx';
import type { SessionState } from '../../state/session.tsx';
import type { SyncState } from '../../state/sync.tsx';
import { openDatabase, type AppDatabase } from '../../db/schema.ts';
import { BrandPreview } from './brand-preview.tsx';
import { EmpresaTab } from './empresa-tab.tsx';

/*
 * 2.3-UNIT: the Empresa tab over a real (in-memory) device store, so the ops it commits
 * are the ops the outbox holds; and the brand preview's placeholders and a11y shape.
 */

const COMPANY_ID = '0a000000-0000-7000-8000-00000000000a';
const USER_ID = '0a000000-0000-7000-8000-0000000000a1';

let db: AppDatabase | null = null;
let counter = 0;

const session = {
  status: 'signed-in',
  user: {
    id: USER_ID,
    name: 'Ana Alves',
    email: 'a@teste.local',
    companyId: COMPANY_ID,
    companyName: 'Empresa A de Teste',
    council: null,
    registrationNumber: null,
    title: null,
  },
  online: true,
  reAuthRequired: false,
  get database() {
    return db;
  },
  signIn: vi.fn(),
  signOut: vi.fn(async () => {}),
  saveRegistration: vi.fn(async () => {}),
  dismissReAuth: vi.fn(),
  recoveryNeeded: false,
  dismissRecovery: vi.fn(),
} as unknown as SessionState;

const sync = { fetchFile: vi.fn(async () => new Blob()) } as unknown as SyncState;

vi.mock('../../state/session.tsx', () => ({ useSession: () => session }));
vi.mock('../../state/sync.tsx', () => ({ useSync: () => sync }));

beforeEach(async () => {
  db = openDatabase(`empresa-tab-${++counter}`);
  await db.open();
});

afterEach(() => {
  cleanup();
  db?.close();
  db = null;
});

/** The tab under the Toast provider `useFieldCommit` needs. */
function renderTab() {
  return render(
    <ToastProvider>
      <EmpresaTab />
    </ToastProvider>,
  );
}

async function outboxPaths(): Promise<string[]> {
  return (await db!.outbox.toArray()).map((row) => row.path);
}

describe('2.3-UNIT-003 Empresa tab', () => {
  it('has no Save button and commits one op per field, the first one creating the row', async () => {
    renderTab();
    expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull();

    await userEvent.type(screen.getByLabelText('Razão social'), 'Empresa Exemplo');
    await userEvent.tab();
    await waitFor(async () => expect(await outboxPaths()).toHaveLength(1));
    const [created] = await db!.outbox.toArray();
    expect(created!.kind).toBe('create');
    expect(created!.path).toMatch(/^registry\/empresa\//);
    const row = created!.value as EmpresaRow;
    // The first row carries the FO.SERV-03 defaults (I/O matrix "Empresa defaults").
    expect(row.name).toBe('Empresa Exemplo');
    expect(row.form_title).toBe('Relatório Técnico de Cabine Primária');
    expect(row.form_code).toBe('FO.SERV-03');
    expect(row.form_revision).toBe('Revisão 01');

    await userEvent.type(screen.getByLabelText('CNPJ'), '00.000.000/0001-00');
    await userEvent.tab();
    await waitFor(async () => expect((await outboxPaths()).some((p) => p.endsWith('/cnpj'))).toBe(true));
    const cnpjOp = (await db!.outbox.toArray()).find((op) => op.path.endsWith('/cnpj'))!;
    expect(cnpjOp.kind).toBe('put');
    expect(cnpjOp.value).toBe('00.000.000/0001-00');
  });

  it('shows the stored values when the row already exists', async () => {
    const stored: EmpresaRow = {
      ...defaultEmpresaRow('0a000000-0000-7000-8000-0000000000e1'),
      name: 'Empresa Guardada',
      phone: '(11) 0000-0000',
      email: 'contato@exemplo.local',
      address: 'Rua Um, 100',
    };
    await db!.entities.put({
      entity: 'registry',
      id: stored.id,
      relatorio_id: null,
      project_id: null,
      removed_at: null,
      row: stored as RegistryRow,
    });

    renderTab();
    await waitFor(() => expect(screen.getByLabelText('Razão social')).toHaveValue('Empresa Guardada'));
    expect(screen.getByLabelText('Telefone')).toHaveValue('(11) 0000-0000');
    expect(screen.getByLabelText('E-mail')).toHaveValue('contato@exemplo.local');
    expect(screen.getByLabelText('Endereço')).toHaveValue('Rua Um, 100');
    expect(screen.getByLabelText('Título do formulário')).toHaveValue('Relatório Técnico de Cabine Primária');
  });

  it('draws both brand tiles, one control each, and no watermark control', async () => {
    const { container } = renderTab();
    // The native inputs are `aria-hidden` mechanisms; the visible buttons are the
    // controls, one per tile and not a phantom second one each.
    expect(screen.getByTestId('upload-input-logo')).toBeInTheDocument();
    expect(screen.getByTestId('upload-input-cover_background')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Escolher logo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Escolher fundo de capa' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Logo')).toBeNull();
    expect(screen.queryByLabelText('Fundo de capa')).toBeNull();
    // Cut by source-deltas: no toggle, no watermark field, nothing named "Marca d'água".
    expect(screen.queryByRole('switch')).toBeNull();
    expect(container.textContent).not.toContain("Marca d'água");
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('2.3-UNIT-004 BrandPreview', () => {
  it('draws three pages, is out of the accessibility tree and shows the placeholders', () => {
    const { container } = render(<BrandPreview empresa={null} />);
    const card = container.querySelector('.brand-preview')!;
    expect(card).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelectorAll('.bp-page')).toHaveLength(3);
    // AC 2.3-2: `border-hairline` placeholders naming what is missing.
    expect(container.querySelector('.bp-logo.bp-empty')).toHaveTextContent('Logo');
    expect(container.querySelector('.bp-cover-photo.bp-empty')).toHaveTextContent('Fundo');
    // No preview text in the accessibility tree at all.
    // `*ByText` reaches into hidden subtrees, so the ignore selector is what checks it.
    expect(screen.queryByText('Capa', { ignore: '[aria-hidden="true"], [aria-hidden="true"] *' })).toBeNull();
  });

  it('re-renders from the current values', () => {
    const empresa: EmpresaRow = {
      ...defaultEmpresaRow('0a000000-0000-7000-8000-0000000000e2'),
      name: 'Empresa Exemplo',
      cnpj: '00.000.000/0001-00',
      address: 'Rua Um, 100',
      phone: '(11) 0000-0000',
      email: 'contato@exemplo.local',
    };
    const { container, rerender } = render(<BrandPreview empresa={empresa} />);
    expect(container.textContent).toContain('Empresa Exemplo · CNPJ 00.000.000/0001-00');
    expect(container.textContent).toContain('Rua Um, 100 · (11) 0000-0000 · contato@exemplo.local');
    expect(container.textContent).toContain('FO.SERV-03 · Revisão 01');

    rerender(<BrandPreview empresa={{ ...empresa, form_revision: 'Revisão 02' }} />);
    expect(container.textContent).toContain('FO.SERV-03 · Revisão 02');
  });

  it('draws the assets when this device holds them', () => {
    const { container } = render(<BrandPreview empresa={null} logoSrc="blob:logo" coverSrc="blob:cover" />);
    expect(container.querySelector('.bp-logo.bp-empty')).toBeNull();
    expect(container.querySelectorAll('img.bp-image').length).toBeGreaterThan(0);
  });
});
