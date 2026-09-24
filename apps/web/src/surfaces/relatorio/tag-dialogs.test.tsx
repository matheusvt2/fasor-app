import { newEquipmentBlock, type LocationRow } from '@app/domain';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { NameDialog, TagDialog } from './tag-dialogs.tsx';

const id = (n: number) => `019966c1-0031-7000-8000-${n.toString(16).padStart(12, '0')}`;
const coluna: LocationRow = { id: id(1), relatorio_id: id(100), parent_id: null, kind: 'coluna', name: 'Coluna 5', order_key: 'a0', removed_at: null };
const sec = newEquipmentBlock({ blockId: id(2), equipmentId: id(3), relatorioId: id(100), projectId: id(101), locationId: id(1), type: 'chave_seccionadora', tag: 'SEC-C05', seedVersion: 'v1', orderKey: 'a0' });
const dj = newEquipmentBlock({ blockId: id(4), equipmentId: id(5), relatorioId: id(100), projectId: id(101), locationId: id(1), type: 'disjuntor_mt', tag: 'DJ-C05', seedVersion: 'v1', orderKey: 'a1' });
const outside = { id: id(6), project_id: id(101), tag: 'TR-1', type: 'transformador_forca' as const, last_nameplate: null, removed_at: null };

function renderTag(props: Partial<Parameters<typeof TagDialog>[0]> = {}) {
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  render(
    <TagDialog
      title="Duplicar SEC-C05"
      action="Duplicar"
      initial="SEC-C05-2"
      equipment={[sec.equipment, dj.equipment, outside]}
      blocks={[sec.block, dj.block]}
      locations={[coluna]}
      onSubmit={onSubmit}
      onClose={onClose}
      {...props}
    />,
  );
  return { onSubmit, onClose, dialog: screen.getByRole('dialog', { name: props.title ?? 'Duplicar SEC-C05' }) };
}

describe('4.5 TAG dialogs', () => {
  it('refuses an empty or taken TAG on blur with the sentence, keeps the primary aria-disabled with its reason, and submits a free one trimmed', async () => {
    const { onSubmit, dialog } = renderTag();
    const field = within(dialog).getByRole('textbox', { name: 'TAG' });
    const primary = within(dialog).getByRole('button', { name: 'Duplicar' });
    expect(field).toHaveValue('SEC-C05-2');
    expect(primary).not.toHaveAttribute('aria-disabled');
    await userEvent.clear(field);
    fireEvent.blur(field);
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Informe a TAG');
    expect(primary).toHaveAttribute('aria-disabled', 'true');
    expect(primary).toHaveAccessibleDescription('Duplicar: falta a TAG');
    await userEvent.type(field, 'dj-c05');
    fireEvent.blur(field);
    expect(within(dialog).getByRole('alert')).toHaveTextContent('TAG já existe nesta obra — DJ-C05 em Coluna 5');
    expect(primary).toHaveAccessibleDescription('Duplicar: a TAG já existe nesta obra');
    // A holder in no block of this relatório is named without a place.
    await userEvent.clear(field);
    await userEvent.type(field, 'TR-1');
    fireEvent.blur(field);
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/^TAG já existe nesta obra — TR-1$/);
    await userEvent.click(primary);
    expect(onSubmit).not.toHaveBeenCalled();
    await userEvent.clear(field);
    await userEvent.type(field, ' SEC-C05-3 {Enter}');
    expect(onSubmit).toHaveBeenCalledWith('SEC-C05-3');
    expect(await axe(dialog)).toHaveNoViolations();
  });

  it('a rename never finds the row itself taken', async () => {
    const { onSubmit, dialog } = renderTag({ title: 'Renomear TAG SEC-C05', action: 'Salvar', initial: 'SEC-C05', selfId: sec.equipment.id });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(onSubmit).toHaveBeenCalledWith('SEC-C05');
  });

  it('the location "Renomear" dialog refuses an empty name', async () => {
    const onSubmit = vi.fn();
    render(<NameDialog title="Renomear Coluna 5" initial="Coluna 5" onSubmit={onSubmit} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Renomear Coluna 5' });
    const field = within(dialog).getByRole('textbox', { name: 'Nome' });
    await userEvent.clear(field);
    fireEvent.blur(field);
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Informe o nome');
    const save = within(dialog).getByRole('button', { name: 'Salvar' });
    expect(save).toHaveAttribute('aria-disabled', 'true');
    expect(save).toHaveAccessibleDescription('Salvar: falta o nome');
    await userEvent.type(field, 'Entrada');
    await userEvent.click(save);
    expect(onSubmit).toHaveBeenCalledWith('Entrada');
    expect(await axe(dialog)).toHaveNoViolations();
  });
});
