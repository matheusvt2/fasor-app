import type { WordRow } from '@app/domain';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copy } from '../../copy/pt-br.ts';
import { ToastProvider } from '../../state/toast.tsx';
import type { SessionState } from '../../state/session.tsx';
import { WordRegistryPanel } from './word-registry-panel.tsx';

const session: SessionState = {
  status: 'signed-in',
  user: {
    id: '0a000000-0000-7000-8000-0000000000a1',
    name: 'Ana Alves',
    email: 'a@teste.local',
    companyId: '0a000000-0000-7000-8000-00000000000a',
    companyName: 'Empresa A de Teste',
    council: null,
    registrationNumber: null,
    title: null,
  },
  online: true,
  reAuthRequired: false,
  database: null,
  signIn: vi.fn(),
  signOut: vi.fn(async () => {}),
  saveRegistration: vi.fn(async () => {}),
  dismissReAuth: vi.fn(),
  recoveryNeeded: false,
  dismissRecovery: vi.fn(),
};

vi.mock('../../state/session.tsx', () => ({ useSession: () => session }));

const manufacturer: WordRow = {
  id: '0a000000-0000-7000-8000-0000000000d1',
  kind: 'manufacturer',
  name: 'Schneider',
  gender: null,
  number: null,
  removed_at: null,
};

function renderPanel(row: WordRow | null) {
  return render(
    <ToastProvider>
      <WordRegistryPanel kind="manufacturer" rowId={manufacturer.id} row={row} onClose={vi.fn()} copy={copy.registries.fabricantes.panel} />
    </ToastProvider>,
  );
}

afterEach(cleanup);

describe('WordRegistryPanel', () => {
  it('shows "Novo fabricante" and no Remover for a not-yet-created row', () => {
    renderPanel(null);
    expect(screen.getByRole('heading', { name: 'Novo fabricante' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remover' })).not.toBeInTheDocument();
  });

  it('gates Remover behind a Confirm dialog for an existing row', async () => {
    const user = userEvent.setup();
    renderPanel(manufacturer);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remover' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Remover Schneider?');
  });

  it('renders the gender and number segmented controls', () => {
    renderPanel(manufacturer);
    expect(screen.getByRole('radiogroup', { name: 'Gênero gramatical' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Número gramatical' })).toBeInTheDocument();
  });
});

describe('WordRegistryPanel for a voltage class (Epic 2 retro D-6)', () => {
  const voltage: WordRow = { ...manufacturer, kind: 'voltage_class', name: '17,5' };
  const t = copy.registries.classesTensao.panel;

  function renderVoltage(row: WordRow | null) {
    return render(
      <ToastProvider>
        <WordRegistryPanel kind="voltage_class" rowId={voltage.id} row={row} onClose={vi.fn()} copy={t} />
      </ToastProvider>,
    );
  }

  it('asks for a value in kV and has no grammar fields', () => {
    renderVoltage(voltage);
    expect(screen.getByRole('heading', { name: '17,5 kV' })).toBeInTheDocument();
    expect(screen.getByLabelText(t.valueLabel)).toHaveValue('17,5');
    expect(screen.getByLabelText(t.valueUnitName)).toHaveTextContent('kV');
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument();
  });

  it('refuses a non-numeric value inline, on blur', async () => {
    const user = userEvent.setup();
    renderVoltage(null);
    const field = screen.getByLabelText(t.valueLabel);
    await user.type(field, 'abc');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.tab();
    expect(screen.getByRole('alert')).toHaveTextContent(t.valueInvalid);
    expect(field).toHaveAttribute('aria-invalid', 'true');
  });
});
