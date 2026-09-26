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
    expect(within(dialog).getByText(NOTE)).toBeVisible();
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
    expect(within(dialog).queryByText(NOTE)).toBeNull();
    for (const chip of chips()) expect(chip).not.toHaveAttribute('aria-disabled');
    const atividade = within(dialog).getByRole('group', { name: 'Atividade' });
    expect(within(atividade).getByRole('button', { name: 'verificação de contatos' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(within(atividade).getByRole('button', { name: 'limpeza e reaperto' }));
    const rebuilt = composeCaption({ ...prefill, atividade: limpeza });
    expect(dialog.querySelector('.caption-preview')).toHaveTextContent(rebuilt!);

    await userEvent.click(toggle);
    expect(within(dialog).getByText(NOTE)).toBeVisible();
    for (const chip of chips()) expect(chip).toHaveAttribute('aria-disabled', 'true');
  });

  it('a caption the rows compose opens on the rows, chips active, no note', () => {
    const { dialog, chips } = renderComposer(composeCaption(prefill));
    expect(within(dialog).queryByText(NOTE)).toBeNull();
    for (const chip of chips()) expect(chip).not.toHaveAttribute('aria-disabled');
  });
});
