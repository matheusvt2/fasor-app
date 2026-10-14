import { blockConfigWithOption, getDefinition, newEquipmentBlock, type BlockRow, type JsonValue, type OpDraft } from '@app/domain';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from '../../test-axe.ts';
import type { Build } from '../relatorio/relatorio-editor.ts';
import { ConfiguracaoSection, wrapsOnPhone } from './configuracao-section.tsx';
import type { FichaApi } from './ficha-api.ts';
import { SheetReadOnlyProvider } from './sheet-read-only.tsx';

/*
 * Story 14.5: the Configuração section of a library type's sheet. The fields, their options
 * and the option in force are the kernel's (`configFieldsOf`); a tap is one `block/{id}/config`
 * put that changes one option and keeps the rest of the config.
 */

const id = (n: number) => `019966b0-0145-7000-8000-${n.toString(16).padStart(12, '0')}`;
const BLOCK = id(21);
const RELATORIO = id(24);
const AUTHOR = { id: 'u1', companyId: 'c1' };
const CTA = 'chave_transferencia_automatica';
const DEFINITION = getDefinition('v5', 'cabine_primaria', CTA);

function cta(options: Record<string, string> = {}): BlockRow {
  const { block } = newEquipmentBlock({ blockId: BLOCK, equipmentId: id(22), relatorioId: RELATORIO, projectId: id(25), locationId: id(23), type: CTA, tag: 'CTA-GER', seedVersion: 'v5', orderKey: 'a0' });
  let config = block.config as JsonValue;
  for (const [key, value] of Object.entries(options)) config = blockConfigWithOption(config, key, value);
  return { ...block, config: config as BlockRow['config'] };
}

/** `current`: the block the store holds when the edit runs, when it is not the one drawn. */
function renderSection(block: BlockRow, { readOnly = false, current = block, definition = DEFINITION } = {}) {
  const edits: OpDraft[][] = [];
  const api = {
    relatorioId: RELATORIO,
    projectId: id(25),
    blockId: BLOCK,
    author: AUTHOR,
    commit: vi.fn(async () => undefined),
    edit: vi.fn(async (build: Build) => {
      const drafts = build([current], AUTHOR, { blocks: [], locations: [], equipment: [] });
      if (drafts === null) return null;
      edits.push(drafts);
      return 'batch';
    }),
    undoable: vi.fn(),
    announce: vi.fn(),
  } satisfies FichaApi;
  const view = render(
    <SheetReadOnlyProvider value={readOnly}>
      <ConfiguracaoSection api={api} block={block} definition={definition} />
    </SheetReadOnlyProvider>,
  );
  return { ...view, edits };
}

const checked = (group: HTMLElement) => within(group).getAllByRole('radio').find((radio) => radio.getAttribute('aria-checked') === 'true')?.textContent ?? null;

afterEach(cleanup);

describe('14.5 ConfiguracaoSection', () => {
  it('draws the five fields as Segmented controls with the seed defaults in force, and no accessibility violation', async () => {
    const { container } = renderSection(cta());
    expect(screen.getByRole('heading', { level: 2, name: 'Configuração' })).toBeInTheDocument();
    expect(container.querySelector('.section-note')).toHaveTextContent('Escolhas desta chave: definem as linhas dos ensaios e o critério de isolamento. Imprimem no cabeçalho da ficha.');
    const groups = screen.getAllByRole('radiogroup');
    expect(groups.map((group) => group.getAttribute('aria-labelledby')).every((labelledBy) => labelledBy !== null)).toBe(true);
    expect(['Tensão', 'Polos', 'Neutro', 'Transição', 'Bypass-isolation'].map((name) => checked(screen.getByRole('radiogroup', { name })))).toEqual(['BT', '3', 'Sólido', 'Aberta', 'Não']);
    expect(within(screen.getByRole('radiogroup', { name: 'Polos' })).getAllByRole('radio').map((radio) => radio.textContent)).toEqual(['2', '3', '4']);
    // The mock stacks the two fields with long labels on phone (`.segmented.is-wrap`).
    expect(groups.map((group) => group.classList.contains('is-wrap'))).toEqual([false, false, true, true, false]);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows the options the block stores', () => {
    renderSection(cta({ tensao: 'mt', polos: '4', neutro: 'chaveado', bypass: 'sim' }));
    expect(['Tensão', 'Polos', 'Neutro', 'Transição', 'Bypass-isolation'].map((name) => checked(screen.getByRole('radiogroup', { name })))).toEqual(['MT', '4', 'Chaveado', 'Aberta', 'Sim']);
  });

  it('a tap is one block config put with that option, every other key of the config kept', async () => {
    const block = cta({ neutro: 'chaveado' });
    const { edits } = renderSection(block);
    await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Polos' })).getByRole('radio', { name: '4' }));
    expect(edits).toHaveLength(1);
    expect(edits[0]).toEqual([expect.objectContaining({ kind: 'put', path: `block/${BLOCK}/config`, value: blockConfigWithOption(block.config, 'polos', '4') })]);
    const value = edits[0]![0]!.value as { options: Record<string, string>; sub_blocks: Record<string, unknown> };
    expect(value.options).toEqual({ neutro: 'chaveado', polos: '4' });
    expect(value.sub_blocks).toEqual((block.config as { sub_blocks: Record<string, unknown> }).sub_blocks);
  });

  it('the put is built on the config the store holds, so two taps in a row keep both; a tap the store already holds writes nothing', async () => {
    const drawn = cta();
    const held = cta({ tensao: 'mt' });
    const { edits } = renderSection(drawn, { current: held });
    await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Polos' })).getByRole('radio', { name: '2' }));
    expect((edits[0]![0]!.value as { options: Record<string, string> }).options).toEqual({ tensao: 'mt', polos: '2' });
    await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Tensão' })).getByRole('radio', { name: 'MT' }));
    expect(edits).toHaveLength(1);
  });

  it('on a sheet marked not tested the options read as text, with the reason', () => {
    const { container } = renderSection(cta({ polos: '4' }), { readOnly: true });
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(container.querySelector('.section')).toHaveClass('is-readonly');
    expect(screen.getByText('Somente leitura — equipamento não ensaiado')).toHaveClass('btn-reason');
    expect(screen.getAllByRole('textbox').map((box) => box.textContent)).toEqual(['BT', '4', 'Sólido', 'Aberta', 'Não']);
  });

  it('draws nothing for a type with no configuration field (every FO.SERV-03 type)', () => {
    const { container } = renderSection(cta(), { definition: getDefinition('v5', 'cabine_primaria', 'chave_seccionadora') });
    expect(container).toBeEmptyDOMElement();
  });

  it('wrapsOnPhone: only a field whose labels do not fit side by side', () => {
    expect(wrapsOnPhone(['BT', 'MT'])).toBe(false);
    expect(wrapsOnPhone(['Sem carga', 'Com carga'])).toBe(false);
    expect(wrapsOnPhone(['Sólido', 'Chaveado', 'Sobreposto'])).toBe(true);
    expect(wrapsOnPhone(['Instrumento', 'Registro do controlador'])).toBe(true);
  });
});
