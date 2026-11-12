import { defaultBlockConfig, emptySheet, instrumentHeaderOf, type BlockRow, type InstrumentHeader, type InstrumentRow, type OpDraft } from '@app/domain';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import type { Build } from '../relatorio/relatorio-editor.ts';
import type { FichaApi } from './ficha-api.ts';
import { HeaderParameterField } from './header-parameter-field.tsx';

/*
 * 25.11-WEB (Story 25.11, M06): the instrument header's TENSÃO ENSAIO as a field under the picker.
 * A commit stores the header again with the typed value in the pick's form; a value other than the
 * registry's shows the sign and "Usar a do instrumento", which stores the registry's value back.
 */

vi.mock('../../state/drafts.tsx', () => ({ useDraftSource: () => () => Promise.resolve() }));

const ID = '019966b0-2511-7000-8000-000000000021';
const MEGGER = '019966b0-2511-7000-8000-0000000000b1';

const megger: InstrumentRow = {
  id: MEGGER,
  kind: 'instrument',
  code: '2E',
  name: 'Megôhmetro',
  manufacturer: 'Instrum',
  model: 'DMG10Ki',
  serial: 'IN919021',
  cert_number: '37428/26',
  laboratory: null,
  calibrated_at: '2026-08-28',
  calibration_interval_months: 12,
  rbc_accredited: true,
  test_isolacao: { raw: '10', unit: 'kV' },
  test_resistencia_contato: null,
  test_relacao_transformacao: null,
  certificate_file_id: null,
  removed_at: null,
} as InstrumentRow;

function block(parameter: string | null | undefined): BlockRow {
  const sheet = emptySheet();
  if (parameter !== undefined) {
    const header: InstrumentHeader = { ...instrumentHeaderOf(megger, 'isolacao'), test_parameter: parameter };
    sheet.test.isolacao = { cells: {}, instrument: { value: header as unknown as never, source_suggestion_id: null, op_id: ID } } as BlockRow['sheet']['test'][string];
  }
  return {
    id: ID,
    relatorio_id: ID,
    location_id: null,
    equipment_id: ID,
    block_type: 'para_raio',
    config: defaultBlockConfig('v14', 'para_raio'),
    seed_version: 'v14',
    order_key: 'a0',
    feeds_block_id: null,
    not_tested: null,
    concluded_by: null,
    sheet,
    created_by: null,
    first_edited_at: null,
    last_modified_by: null,
    last_modified_at: null,
    removed_at: null,
  };
}

let current = block('10 kV');
const written: OpDraft[][] = [];
const edit = vi.fn(async (build: Build) => {
  const drafts = build([current], { id: 'u1', companyId: 'c1' }, {} as never);
  if (drafts === null) return null;
  written.push(drafts);
  return 'batch';
});
const api: FichaApi = {
  relatorioId: ID,
  projectId: ID,
  blockId: ID,
  author: { id: 'u1', companyId: 'c1' },
  commit: vi.fn(async () => undefined),
  edit,
  undoable: vi.fn(),
  announce: vi.fn(),
};

afterEach(() => {
  written.length = 0;
  edit.mockClear();
});

function field(row: BlockRow, instruments: readonly InstrumentRow[] = [megger]) {
  current = row;
  return (
    <ToastProvider>
      <HeaderParameterField api={api} block={row} testKey="isolacao" instruments={instruments} />
      <ToastOutlet />
    </ToastProvider>
  );
}

const storedParameter = () => (written.at(-1)![0]!.value as unknown as InstrumentHeader).test_parameter;

describe('25.11-WEB the header test voltage field', () => {
  it('shows the registry value with its unit and no sign', () => {
    render(field(block('10 kV')));
    const input = screen.getByRole('textbox', { name: 'Tensão de ensaio' });
    expect(input).toHaveValue('10');
    expect(screen.getByText('kV')).toBeInTheDocument();
    expect(screen.queryByText(/Alterada nesta ficha/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Usar a do instrumento' })).toBeNull();
    expect(input.closest('.e25-header-param')).toHaveClass('is-default');
  });

  it('typing 5 and leaving stores the header with "5 kV", every other field as stored', async () => {
    const user = userEvent.setup();
    render(field(block('10 kV')));
    const input = screen.getByRole('textbox', { name: 'Tensão de ensaio' });
    await user.clear(input);
    await user.type(input, '5');
    await user.tab();
    await waitFor(() => expect(written).toHaveLength(1));
    const op = written[0]![0]!;
    expect(op.path).toBe(`sheet/${ID}/test/isolacao/instrument`);
    expect(op.value).toEqual({ ...instrumentHeaderOf(megger, 'isolacao'), test_parameter: '5 kV' });
  });

  it('a text that is no positive number is refused and writes nothing', async () => {
    const user = userEvent.setup();
    render(field(block('10 kV')));
    const input = screen.getByRole('textbox', { name: 'Tensão de ensaio' });
    await user.clear(input);
    await user.type(input, '0');
    await user.tab();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(written).toHaveLength(0);
  });

  it('5 kV stored shows the sign; "Usar a do instrumento" stores the registry value back and toasts', async () => {
    const user = userEvent.setup();
    render(field(block('5 kV')));
    expect(screen.getByText('Alterada nesta ficha · cadastro: 10 kV')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Tensão de ensaio' }).closest('.e25-header-param')).not.toHaveClass('is-default');
    await user.click(screen.getByRole('button', { name: 'Usar a do instrumento' }));
    await waitFor(() => expect(written).toHaveLength(1));
    expect(storedParameter()).toBe('10 kV');
    expect(await screen.findByText('Tensão de ensaio voltou a 10 kV, a do instrumento')).toBeInTheDocument();
  });

  it('the stored header coming back to 10 kV drops the sign', () => {
    const { rerender } = render(field(block('5 kV')));
    expect(screen.getByText(/Alterada nesta ficha/)).toBeInTheDocument();
    rerender(field(block('10 kV')));
    expect(screen.queryByText(/Alterada nesta ficha/)).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Tensão de ensaio' })).toHaveValue('10');
  });

  it('renders nothing with no instrument stored', () => {
    const { container } = render(field(block(undefined)));
    expect(container.querySelector('.e25-header-param')).toBeNull();
  });
});
