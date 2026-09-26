import { composeCaption, type CaptionParts, type SeedWord } from '@app/domain';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CaptionComposer, type CaptionComposerSources } from './caption-composer.tsx';

/*
 * E6-R2: while "Editar texto" is on, the caption is free text no chip regenerates, so every
 * chip of the three rows is shown `aria-disabled`, never pressed, and a tap changes nothing;
 * a note under the toggle says why. Turning "Editar texto" off gives the chips back.
 */

const limpeza: SeedWord = { name: 'limpeza e reaperto', gender: 'f', number: 'singular' };
const contatos: SeedWord = { name: 'verificação de contatos', gender: 'f', number: 'singular' };
const cubiculo: SeedWord = { name: 'Cubículo Enel', gender: 'm', number: 'singular' };
const chave = { name: 'chave seccionadora', gender: 'f' as const, number: 'singular' as const };

const prefill: CaptionParts = { atividade: contatos, equipamento: chave, local: cubiculo };

const sources: CaptionComposerSources = {
  atividades: [contatos, limpeza],
  locais: [cubiculo],
  equipamentos: [chave],
  extraLocais: [],
  registry: [],
  recents: { atividade: [], equipamento: [], local: [] },
};

const NOTE = 'Texto editado à mão. Desligue Editar texto para montar pelas opções.';

function renderComposer(stored: string | null) {
  const onSave = vi.fn();
  render(<CaptionComposer isOpen onClose={() => {}} prefill={prefill} stored={stored} sources={sources} onSave={onSave} />);
  const dialog = screen.getByRole('dialog', { name: 'Legenda' });
  const chips = () => dialog.querySelectorAll('.caption-part .chip-row .chip');
  return { dialog, chips, onSave };
}

describe('E6-R2 the Caption composer chips while "Editar texto" is on', () => {
  it('a hand-typed caption opens in "Editar texto": every chip aria-disabled, none pressed, a tap changes nothing, the note shown', async () => {
    const typed = 'Legenda escrita à mão pela equipe';
    const { dialog, chips, onSave } = renderComposer(typed);
    const text = within(dialog).getByRole('textbox', { name: 'Texto da legenda' });
    expect(text).toHaveValue(typed);
    expect(dialog.querySelector('.caption-edit-note')).toHaveTextContent(NOTE);
    expect(chips().length).toBeGreaterThan(0);
    for (const chip of chips()) {
      expect(chip).toHaveAttribute('aria-disabled', 'true');
      expect(chip).not.toHaveAttribute('aria-pressed', 'true');
    }

    const atividade = within(dialog).getByRole('group', { name: 'Atividade' });
    await userEvent.click(within(atividade).getByRole('button', { name: 'limpeza e reaperto' }));
    await userEvent.click(within(atividade).getByRole('button', { name: 'Outro…' }));
    expect(text).toHaveValue(typed);
    expect(within(dialog).queryByRole('textbox', { name: 'Outra atividade' })).toBeNull();
    for (const chip of chips()) expect(chip).not.toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar legenda' }));
    expect(onSave).toHaveBeenCalledWith(typed, prefill);
  });

  it('turning "Editar texto" off restores the chips: pressed on the prefill, a tap rebuilds the caption; on again makes them inactive', async () => {
    const { dialog, chips } = renderComposer('Legenda escrita à mão');
    const toggle = within(dialog).getByRole('button', { name: 'Editar texto' });
    await userEvent.click(toggle);
    expect(within(dialog).queryAllByText(NOTE)).toEqual([]);
    for (const chip of chips()) expect(chip).not.toHaveAttribute('aria-disabled');
    const atividade = within(dialog).getByRole('group', { name: 'Atividade' });
    expect(within(atividade).getByRole('button', { name: 'verificação de contatos' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(within(atividade).getByRole('button', { name: 'limpeza e reaperto' }));
    const rebuilt = composeCaption({ ...prefill, atividade: limpeza });
    expect(dialog.querySelector('.caption-preview')).toHaveTextContent(rebuilt!);

    await userEvent.click(toggle);
    expect(dialog.querySelector('.caption-edit-note')).toHaveTextContent(NOTE);
    for (const chip of chips()) expect(chip).toHaveAttribute('aria-disabled', 'true');
  });

  it('from 1280 px the row is a Combobox: disabled with the note as its reason, and typing into it changes no part', async () => {
    const typed = 'Legenda escrita à mão pela equipe';
    const { dialog, onSave } = renderComposer(typed);
    const combo = within(dialog).getByRole('combobox', { name: 'Atividade' });
    expect(combo).toHaveAttribute('aria-disabled', 'true');
    expect(combo.getAttribute('aria-describedby')).not.toBeNull();
    expect(document.getElementById(combo.getAttribute('aria-describedby')!)).toHaveTextContent(NOTE);
    await userEvent.type(combo, 'limpeza');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar legenda' }));
    expect(onSave).toHaveBeenCalledWith(typed, prefill);
  });

  it('an "Outro…" field opened before "Editar texto" is read-only while it is on', async () => {
    const { dialog, onSave } = renderComposer(composeCaption(prefill));
    const atividade = within(dialog).getByRole('group', { name: 'Atividade' });
    await userEvent.click(within(atividade).getByRole('button', { name: 'Outro…' }));
    const outro = within(dialog).getByRole('textbox', { name: 'Outra atividade' });
    await userEvent.type(outro, 'termografia');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Editar texto' }));
    expect(outro).toHaveAttribute('readonly');
    await userEvent.type(outro, ' extra');
    expect(outro).toHaveValue('termografia');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar legenda' }));
    const [, parts] = onSave.mock.calls[0]! as [string | null, CaptionParts];
    expect(parts.atividade?.name).toBe('termografia');
  });

  it('a caption the rows compose opens on the rows, chips active, no note', () => {
    const { dialog, chips } = renderComposer(composeCaption(prefill));
    expect(within(dialog).queryAllByText(NOTE)).toEqual([]);
    for (const chip of chips()) expect(chip).not.toHaveAttribute('aria-disabled');
  });
});
