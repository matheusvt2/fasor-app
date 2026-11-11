import { composeConclusion, EMPTY_DEFINITION_CONTEXT, getDefinition, newEquipmentBlock, NO_VISIT_CONTEXT, type BlockRow, type Cell, type OpDraft, type Sheet } from '@app/domain';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../state/toast.tsx';
import type { Build } from '../relatorio/relatorio-editor.ts';
import { ConclusaoSection } from './conclusao-section.tsx';
import type { FichaApi } from './ficha-api.ts';

/*
 * Batch e24a (Story 24.3, seed v14; `60-ficha.html` #ficha-conc-dj01): the Conclusão step of a v14
 * sheet with a reading out of its criterion shows Reprovado and nothing else (no Restrições group), the
 * reason line without "Com restrições", and OBSERVAÇÕES required with "Obrigatória em ficha reprovada".
 * A Reprovado tap, the adjusted note's Confirmar and the "Reprovado?" suggestion write what the kernel
 * says (`resultChoiceWrites`, `conclusionAdjustWrites`): a stored restriction cleared in the same batch,
 * none written. The same sheet on v13 shows and writes what it did before.
 */

vi.mock('../../state/drafts.tsx', () => ({ useDraftSource: () => undefined }));

afterEach(cleanup);

const id = (n: number) => `019966b0-0e24-7100-8000-${n.toString(16).padStart(12, '0')}`;
const BLOCK = id(1);
const AUTHOR = { id: 'u1', companyId: 'c1' };
const ROWS = { blocks: [], locations: [], allLocations: [], equipment: [] };

const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: id(9) });

/** A cable of `version`, every phase's insulation at `raw` MΩ (criterion > 400 MΩ), every row Conforme, then `conclusion`. */
function cable(version: string, raw: string, conclusion: Partial<Sheet['conclusion']> = {}): BlockRow {
  const { block } = newEquipmentBlock({ definitions: EMPTY_DEFINITION_CONTEXT, blockId: BLOCK, equipmentId: id(2), relatorioId: id(4), projectId: id(5), locationId: id(3), type: 'cabos_entrada', tag: 'CE-01', seedVersion: version, orderKey: 'a0' });
  const definition = getDefinition(version, 'cabine_primaria', 'cabos_entrada');
  const cells = Object.fromEntries([0, 1, 2, 3].map((row) => [String(row), { '1': cell({ raw, unit: 'MΩ', state: 'measured' }) }]));
  return {
    ...block,
    sheet: {
      ...block.sheet,
      checklist: Object.fromEntries(definition.checklist!.map((item) => [item.key, { result: cell('C') }])),
      test: { isolacao: { cells } },
      conclusion: { ...block.sheet.conclusion, ...conclusion },
    },
  };
}

function renderSection(shown: BlockRow) {
  const builds: Build[] = [];
  const api: FichaApi = {
    relatorioId: id(4),
    projectId: id(5),
    blockId: BLOCK,
    author: AUTHOR,
    commit: vi.fn(async () => undefined),
    edit: vi.fn(async (build: Build) => {
      builds.push(build);
      return null;
    }),
    undoable: vi.fn(),
    announce: vi.fn(),
  };
  render(
    <ToastProvider>
      <ConclusaoSection
        api={api}
        block={shown}
        definition={getDefinition(shown.seed_version, 'cabine_primaria', 'cabos_entrada')}
        tag="CE-01"
        className="ficha-step"
        onFocus={() => undefined}
        section9={{ ref: 'seção 9', prints: true, absent: 'não sai no documento: o relatório não tem a seção 9' }}
        visit={NO_VISIT_CONTEXT}
      />
    </ToastProvider>,
  );
  return builds;
}

/** What a build writes against `block`: the last path segment and the value of each op. */
const writes = (build: Build, block: BlockRow) => (build([block], AUTHOR, ROWS) ?? []).map((op: OpDraft) => [op.path.split('/').at(-1), op.value]);

const resultGroup = () => screen.getByRole('radiogroup', { name: 'Resultado' });

describe('24.3 the Conclusão step of a v14 sheet with a reading out of its criterion', () => {
  it('Reprovado shown, Aprovado disabled, no Restrições group, the reason line without "Com restrições", OBSERVAÇÕES required for a reprovada', () => {
    renderSection(cable('v14', '300'));
    // Story 24.5: nothing stored, so the floor's Reprovado is shown as the preview.
    expect(screen.getByRole('radio', { name: 'Reprovado' })).toHaveClass('is-floor');
    expect(screen.getByRole('radio', { name: 'Aprovado' })).toBeDisabled();
    expect(screen.queryByRole('radiogroup', { name: 'Restrições' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Com restrições' })).toBeNull();
    expect(screen.getByText('A ficha exige no mínimo Reprovado: leitura fora do critério.')).toBeVisible();
    const helper = screen.getByText('Obrigatória em ficha reprovada');
    expect(helper).toHaveAttribute('data-tone', 'red');
    expect(screen.getByRole('textbox', { name: 'Observações da ficha' })).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('textbox', { name: 'Observações da ficha' })).toHaveAccessibleDescription('Obrigatória em ficha reprovada');
    // The preview row offers Reprovado alone.
    expect(screen.getByRole('group', { name: 'Prévia da conclusão' })).toHaveTextContent('Reprovado?');
  });

  it('v13: the Restrições group with Com restrições, the reason line and the helper as before', () => {
    renderSection(cable('v13', '300'));
    expect(within(screen.getByRole('radiogroup', { name: 'Restrições' })).getByRole('radio', { name: 'Com restrições' })).toHaveClass('is-floor');
    expect(screen.getByText('A ficha exige no mínimo Reprovado · Com restrições: leitura fora do critério.')).toBeVisible();
    expect(screen.getByText('Obrigatória com restrições')).toBeVisible();
    expect(screen.queryByText('Obrigatória em ficha reprovada')).toBeNull();
    expect(screen.getByRole('group', { name: 'Prévia da conclusão' })).toHaveTextContent('Reprovado · Com restrições?');
  });

  it('the "Reprovado?" suggestion writes the result alone; on v13 the pair', async () => {
    const v14 = cable('v14', '300');
    const builds = renderSection(v14);
    await userEvent.click(within(screen.getByRole('group', { name: 'Prévia da conclusão' })).getByRole('button', { name: 'Confirmar' }));
    expect(writes(builds.at(-1)!, v14)).toEqual([['result', 'reprovado']]);
    cleanup();
    const v13 = cable('v13', '300');
    const again = renderSection(v13);
    await userEvent.click(within(screen.getByRole('group', { name: 'Prévia da conclusão' })).getByRole('button', { name: 'Confirmar' }));
    expect(writes(again.at(-1)!, v13)).toEqual([
      ['result', 'reprovado'],
      ['restriction', 'com_restricoes'],
    ]);
  });
});

describe('24.5 the preview under a v14 Reprovado floor shows no restriction (seed v14, batch e24a)', () => {
  const PREVIEW_LINE = 'Prévia: só vale depois de Confirmar ou de Concluir ficha.';

  it('v14, nothing stored: "Reprovado?" with the pill "Prévia", Reprovado alone in the preview state, no Restrições group', () => {
    renderSection(cable('v14', '300'));
    const row = screen.getByRole('group', { name: 'Prévia da conclusão' });
    expect(row).toHaveTextContent('Reprovado?');
    expect(row).not.toHaveTextContent('restrições');
    expect(row.querySelector('.suggested-pill')).toHaveTextContent('Prévia');
    expect(resultGroup().querySelector('[aria-checked="true"]')).toBeNull();
    expect(screen.getByRole('radio', { name: 'Reprovado' })).toHaveClass('is-floor');
    expect(screen.getByRole('radio', { name: 'Aprovado' })).not.toHaveClass('is-floor');
    expect(screen.queryByRole('radiogroup', { name: 'Restrições' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Sem restrições' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Com restrições' })).toBeNull();
    expect(document.querySelectorAll('.seg.is-floor')).toHaveLength(1);
    expect(screen.getByText(PREVIEW_LINE)).toBeVisible();
    expect(resultGroup()).toHaveAccessibleDescription(`A ficha exige no mínimo Reprovado: leitura fora do critério. ${PREVIEW_LINE}`);
  });

  it('v14, Reprovado stored by a tap: no row, nothing in the preview state, no line; on v13 the Com restrições half stays a preview', () => {
    renderSection(cable('v14', '300', { result: cell('reprovado'), restriction: cell(null) }));
    expect(screen.queryByRole('group', { name: 'Prévia da conclusão' })).toBeNull();
    expect(screen.getByRole('radio', { name: 'Reprovado' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('radiogroup', { name: 'Restrições' })).toBeNull();
    expect(document.querySelector('.seg.is-floor')).toBeNull();
    expect(screen.queryByText(PREVIEW_LINE)).toBeNull();
    cleanup();
    renderSection(cable('v13', '300', { result: cell('reprovado'), restriction: cell(null) }));
    const restriction = screen.getByRole('radiogroup', { name: 'Restrições' });
    expect(restriction.querySelector('[aria-checked="true"]')).toBeNull();
    expect(within(restriction).getByRole('radio', { name: 'Com restrições' })).toHaveClass('is-floor');
    expect(restriction).toHaveAccessibleDescription(`A ficha exige no mínimo Reprovado · Com restrições: leitura fora do critério. ${PREVIEW_LINE}`);
  });

  it('v13, nothing stored: the preview as Story 24.5 built it, both halves on the floor ("Reprovado · Com restrições?")', () => {
    renderSection(cable('v13', '300'));
    const row = screen.getByRole('group', { name: 'Prévia da conclusão' });
    expect(row).toHaveTextContent('Reprovado · Com restrições?');
    expect(row.querySelector('.suggested-pill')).toHaveTextContent('Prévia');
    const restriction = screen.getByRole('radiogroup', { name: 'Restrições' });
    expect(resultGroup().querySelector('[aria-checked="true"]')).toBeNull();
    expect(restriction.querySelector('[aria-checked="true"]')).toBeNull();
    expect(screen.getByRole('radio', { name: 'Reprovado' })).toHaveClass('is-floor');
    expect(screen.getByRole('radio', { name: 'Com restrições' })).toHaveClass('is-floor');
    expect(screen.getByRole('radio', { name: 'Sem restrições' })).not.toHaveClass('is-floor');
    const described = `A ficha exige no mínimo Reprovado · Com restrições: leitura fora do critério. ${PREVIEW_LINE}`;
    expect(resultGroup()).toHaveAccessibleDescription(described);
    expect(restriction).toHaveAccessibleDescription(described);
  });
});

describe('24.3 B-7 a Reprovado tap over a clean v14 floor with a stored Com restrições', () => {
  it('one batch writes Reprovado and clears the restriction; the v13 tap writes the result alone', async () => {
    const v14 = cable('v14', '1000', { result: cell('aprovado'), restriction: cell('com_restricoes') });
    const builds = renderSection(v14);
    expect(within(screen.getByRole('radiogroup', { name: 'Restrições' })).getByRole('radio', { name: 'Com restrições' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(within(resultGroup()).getByRole('radio', { name: 'Reprovado' }));
    expect(writes(builds.at(-1)!, v14)).toEqual([
      ['result', 'reprovado'],
      ['restriction', null],
    ]);
    cleanup();
    const v13 = cable('v13', '1000', { result: cell('aprovado'), restriction: cell('com_restricoes') });
    const again = renderSection(v13);
    await userEvent.click(within(resultGroup()).getByRole('radio', { name: 'Reprovado' }));
    expect(writes(again.at(-1)!, v13)).toEqual([['result', 'reprovado']]);
  });

  it('stored Reprovado with no restriction (v14): no Restrições group; Aprovado taps the result alone and the group returns', async () => {
    const reproved = cable('v14', '1000', { result: cell('reprovado'), restriction: cell(null) });
    const builds = renderSection(reproved);
    expect(screen.queryByRole('radiogroup', { name: 'Restrições' })).toBeNull();
    await userEvent.click(within(resultGroup()).getByRole('radio', { name: 'Aprovado' }));
    expect(writes(builds.at(-1)!, reproved)).toEqual([['result', 'aprovado']]);
    cleanup();
    // The restriction is unset again: the group is back (the floor's Sem restrições shown until a tap).
    renderSection(cable('v14', '1000', { result: cell('aprovado'), restriction: cell(null) }));
    expect(within(screen.getByRole('radiogroup', { name: 'Restrições' })).getAllByRole('radio')).toHaveLength(2);
  });
});

describe('24.3 B-8 a v14 sheet concluded Aprovado · Com restrições, a reading then corrected out', () => {
  it('Reprovado with no restriction group, "Conclusão ajustada pela ficha", and its Confirmar writes Reprovado, clears the restriction and recomposes the text', async () => {
    const definition = getDefinition('v14', 'cabine_primaria', 'cabos_entrada');
    const before = cable('v14', '1000', { result: cell('aprovado'), restriction: cell('com_restricoes') });
    const composed = composeConclusion(before, definition, 'CE-01');
    const shown = cable('v14', '300', { result: cell('aprovado'), restriction: cell('com_restricoes'), text: cell(composed.text), text_status: cell('confirmed'), text_basis: cell(composed.basis) });
    const builds = renderSection(shown);
    expect(screen.getByRole('radio', { name: 'Reprovado' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('radiogroup', { name: 'Restrições' })).toBeNull();
    const note = document.querySelector<HTMLElement>('.conclusion-hint[role="status"]')!;
    expect(note).toHaveTextContent('Conclusão ajustada pela ficha');
    await userEvent.click(within(note).getByRole('button', { name: 'Confirmar' }));
    const now = composeConclusion(shown, definition, 'CE-01');
    expect(writes(builds.at(-1)!, shown)).toEqual([
      ['result', 'reprovado'],
      ['restriction', null],
      ['text', now.text],
      ['text_status', 'confirmed'],
      ['text_basis', now.basis],
    ]);
  });
});
