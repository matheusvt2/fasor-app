import { newEquipmentBlock, type EquipmentRow, type LocationRow } from '@app/domain';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from '../../test-axe.ts';
import { describe, expect, it, vi } from 'vitest';
import { FieldPalette } from './block-palette-field.tsx';

/*
 * Story 4.5: the field Block palette as data in, one creation out. jsdom applies no
 * stylesheet, so both the field rows (`.pf-field`, below 1280 px) and the office rows
 * (`.pf-office`, from 1280 px) are in the document; each test addresses its own.
 */

const id = (n: number) => `019966c1-0030-7000-8000-${n.toString(16).padStart(12, '0')}`;
const RELATORIO = id(100);
const PROJECT = id(101);

const cabine: LocationRow = {
  id: id(1),
  relatorio_id: RELATORIO,
  parent_id: null,
  kind: 'cabine',
  name: '1° Subsolo',
  order_key: 'a0',
  removed_at: null,
  se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
  env: { altitude_m: null, temperature_c: null, humidity_pct: null },
  agrupar_por_tipo: true,
};
const col5: LocationRow = { id: id(2), relatorio_id: RELATORIO, parent_id: id(1), kind: 'coluna', name: 'Coluna 5', order_key: 'a0', removed_at: null };
const col9: LocationRow = { id: id(3), relatorio_id: RELATORIO, parent_id: id(1), kind: 'coluna', name: 'Coluna 9', order_key: 'a1', removed_at: null };
const sec05 = newEquipmentBlock({ blockId: id(10), equipmentId: id(11), relatorioId: RELATORIO, projectId: PROJECT, locationId: id(2), type: 'chave_seccionadora', tag: 'SEC-C05', seedVersion: 'v1', orderKey: 'a0' });
const removed: EquipmentRow = { id: id(12), project_id: PROJECT, tag: 'SEC-C09', type: 'chave_seccionadora', last_nameplate: null, removed_at: '2026-09-07T10:00:00.000Z' };

function renderPalette(onCreate = vi.fn(), onClose = vi.fn()) {
  render(
    <FieldPalette
      target={{ locationId: col9.id, anchorBlockId: null }}
      seedVersion="v1"
      locations={[cabine, col5, col9]}
      blocks={[sec05.block]}
      equipment={[sec05.equipment, removed]}
      onCreate={onCreate}
      onClose={onClose}
    />,
  );
  return { onCreate, onClose };
}

describe('4.5 FieldPalette', () => {
  it('heads with where the block goes and lists the eight types with the suggested TAG in meta; a tap asks for the suggestion', async () => {
    const { onCreate } = renderPalette();
    const palette = screen.getByRole('dialog', { name: 'Adicionar bloco' });
    expect(within(palette).getByText('Em: 1° Subsolo › Coluna 9')).toHaveClass('palette-group');
    // Review F-9: the palette opens on its first type row (jsdom draws both variants; the field row comes first).
    await waitFor(() => expect(palette.querySelector('.pf-field')).toHaveFocus());
    expect(within(palette).getByText('Escolha o tipo · TAG sugerida por tipo + coluna')).toBeInTheDocument();
    const rows = [...palette.querySelectorAll<HTMLElement>('.pf-field')];
    expect(rows.map((row) => row.querySelector('.pi-text > span:first-child')?.textContent)).toEqual([
      'Cabos de entrada',
      'Para-raio',
      'Chave seccionadora',
      'Disjuntor MT',
      'TP',
      'TC',
      'Cabos de saída',
      'Transformador de força',
    ]);
    // A removed SEC-C09 frees its TAG.
    expect(rows.map((row) => row.querySelector('.pi-meta')?.textContent)).toEqual(['CE-C09', 'PR-C09', 'SEC-C09', 'DJ-C09', 'TP-C09', 'TC-C09', 'CS-C09', 'TR-1']);
    expect(palette.querySelector('.office-note')).toHaveTextContent('Seções de texto e sub-blocos (ensaios, placa, itens) são do escritório');
    expect(await axe(palette)).toHaveNoViolations();
    await userEvent.click(rows[2]!);
    expect(onCreate).toHaveBeenCalledWith({ type: 'chave_seccionadora', locationId: col9.id, anchorBlockId: null, tag: null });
  });

  it('office confirm: TAG and Local prefilled; a TAG already in the obra is refused on blur; changing Local suggests again until the TAG is edited', async () => {
    const { onCreate } = renderPalette();
    const palette = screen.getByRole('dialog', { name: 'Adicionar bloco' });
    const office = [...palette.querySelectorAll<HTMLElement>('.pf-office')][2]!;
    const toggle = office.querySelector<HTMLElement>('.palette-item')!;
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const tag = within(office).getByRole('textbox', { name: 'TAG' });
    const local = within(office).getByRole('combobox', { name: 'Local' });
    expect(tag).toHaveValue('SEC-C09');
    expect(local).toHaveValue(col9.id);
    expect([...(local as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(['1° Subsolo', '1° Subsolo › Coluna 5', '1° Subsolo › Coluna 9']);
    // Local changes, the TAG follows while untouched.
    await userEvent.selectOptions(local, col5.id);
    expect(tag).toHaveValue('SEC-C05-2');
    // A taken TAG, typed any case with a trailing space: refused on blur.
    await userEvent.clear(tag);
    await userEvent.type(tag, 'sec-c05 ');
    fireEvent.blur(tag);
    expect(await within(office).findByRole('alert')).toHaveTextContent('TAG já existe nesta obra — SEC-C05 em 1° Subsolo › Coluna 5');
    const confirm = within(office).getByRole('button', { name: 'Confirmar' });
    expect(confirm).toHaveAttribute('aria-disabled', 'true');
    expect(confirm).toHaveAccessibleDescription('Confirmar: a TAG já existe nesta obra');
    await userEvent.click(confirm);
    expect(onCreate).not.toHaveBeenCalled();
    // Edited: another Local keeps the typed TAG.
    await userEvent.clear(tag);
    await userEvent.type(tag, 'SEC-X1');
    await userEvent.selectOptions(local, col9.id);
    expect(tag).toHaveValue('SEC-X1');
    await userEvent.click(confirm);
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({ type: 'chave_seccionadora', locationId: col9.id, anchorBlockId: null, tag: 'SEC-X1' }));
    expect(await axe(palette)).toHaveNoViolations();
  });

  it('closes from its head', async () => {
    const { onClose } = renderPalette();
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalled();
  });
});
