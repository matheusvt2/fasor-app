import { composeCaption, type CaptionParts, type SeedWord } from '@app/domain';
import { cleanup, render, screen, within } from '@testing-library/react';
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

function renderComposer(stored: string | null, options: { prefill?: CaptionParts; prefillText?: string | null } = {}) {
  const onSave = vi.fn();
  render(
    <CaptionComposer
      isOpen
      onClose={() => {}}
      prefill={options.prefill ?? prefill}
      stored={stored}
      sources={sources}
      onSave={onSave}
      {...(options.prefillText === undefined ? {} : { prefillText: options.prefillText })}
    />,
  );
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

  it('review 2026-09-30: a caption composed at capture with an activity the prefill no longer carries opens on the rows, that activity pressed', async () => {
    const isolacao = { name: 'ensaios de resistência de isolação', gender: 'm' as const, number: 'plural' as const };
    const stored = composeCaption({ atividade: isolacao, equipamento: chave, local: cubiculo })!;
    const { dialog, chips, onSave } = renderComposer(stored);
    expect(within(dialog).queryByRole('textbox', { name: 'Texto da legenda' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Editar texto' })).not.toHaveAttribute('aria-pressed', 'true');
    expect(dialog.querySelector('.caption-preview')).toHaveTextContent(stored);
    for (const chip of chips()) expect(chip).not.toHaveAttribute('aria-disabled');
    const atividade = within(dialog).getByRole('group', { name: 'Atividade' });
    expect(within(atividade).getByRole('button', { name: 'ensaios de resistência de isolação' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(atividade).getByRole('button', { name: 'verificação de contatos' })).not.toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar legenda' }));
    expect(onSave).toHaveBeenCalledWith(stored, { atividade: isolacao, equipamento: chave, local: cubiculo });
  });

  it('14.3-UNIT: a site item\'s photo (no parts) opens on the kernel\'s caption for it: the stored one, or with none stored the one given, saved as it reads', async () => {
    const NO_PARTS: CaptionParts = { atividade: null, equipamento: null, local: null };
    const SITE = 'Verificação de iluminação de emergência (autonomia mínima de 2 h) do 1° Subsolo';
    // Stored at capture: free text, since no chip composes it.
    const first = renderComposer(SITE, { prefill: NO_PARTS, prefillText: SITE });
    expect(within(first.dialog).getByRole('textbox', { name: 'Texto da legenda' })).toHaveValue(SITE);
    expect(within(first.dialog).queryAllByText(NOTE).length).toBeGreaterThan(0);
    cleanup();

    // Cleared since: the composer offers the same caption again, and "Salvar legenda" stores it.
    const again = renderComposer(null, { prefill: NO_PARTS, prefillText: SITE });
    expect(within(again.dialog).getByRole('textbox', { name: 'Texto da legenda' })).toHaveValue(SITE);
    await userEvent.click(within(again.dialog).getByRole('button', { name: 'Salvar legenda' }));
    expect(again.onSave).toHaveBeenCalledWith(SITE, NO_PARTS);
    cleanup();

    // No caption and none to offer (a photo with no context): the rows, empty, as before.
    const none = renderComposer(null, { prefill: NO_PARTS, prefillText: null });
    expect(within(none.dialog).queryByRole('textbox', { name: 'Texto da legenda' })).toBeNull();
    expect(none.dialog.querySelector('.caption-preview')).toHaveTextContent('');
  });

  it('a caption the rows compose opens on the rows, chips active, no note', () => {
    const { dialog, chips } = renderComposer(composeCaption(prefill));
    expect(within(dialog).queryAllByText(NOTE)).toEqual([]);
    for (const chip of chips()) expect(chip).not.toHaveAttribute('aria-disabled');
  });
});

describe('27.13-UNIT Story 27.13 (F17): the Caption composer shows the one hint of its state', () => {
  const GENERATED = 'Legenda gerada';
  const COMPOSED = 'A legenda é montada com os três campos abaixo.';
  const shown = (dialog: HTMLElement) => [GENERATED, NOTE, COMPOSED].filter((hint) => dialog.textContent!.includes(hint));
  const empty: CaptionParts = { atividade: null, equipamento: null, local: null };

  it('a caption the rows generated: "Legenda gerada" alone', () => {
    const { dialog } = renderComposer(null);
    expect(dialog.querySelector('.caption-preview')).toHaveTextContent(composeCaption(prefill)!);
    expect(shown(dialog)).toEqual([GENERATED]);
  });

  it('a text edited by hand: the editing note alone', () => {
    const { dialog } = renderComposer('Legenda escrita à mão pela equipe');
    expect(within(dialog).getByRole('textbox', { name: 'Texto da legenda' })).toBeInTheDocument();
    expect(shown(dialog)).toEqual([NOTE]);
  });

  it('nothing composed yet: the note on the three fields alone; one chip later "Legenda gerada" alone; "Editar texto" the editing note alone', async () => {
    const { dialog } = renderComposer(null, { prefill: empty });
    expect(shown(dialog)).toEqual([COMPOSED]);
    const atividade = within(dialog).getByRole('group', { name: 'Atividade' });
    await userEvent.click(within(atividade).getByRole('button', { name: 'limpeza e reaperto' }));
    expect(shown(dialog)).toEqual([GENERATED]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Editar texto' }));
    expect(shown(dialog)).toEqual([NOTE]);
  });
});
