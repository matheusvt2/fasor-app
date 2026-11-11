import { blockDefinitionIn, buildSnapshot, insertPhrase, isEquipmentBlock, replay, snapshotDefinitionContext, type BlockRow, type OpDraft, type PointRow, type RegistryRow, type RelatorioSnapshot } from '@app/domain';
import { portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TriStateValue } from '../../components/index.ts';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import type { Build } from '../relatorio/relatorio-editor.ts';
import { ChecklistRow, sheetRowTarget, type ChecklistRowApi, type ChecklistRowTarget } from './checklist-section.tsx';
import { checklistObservationOp, checklistResultOp } from './ficha-ops.ts';

/*
 * Stories 24.6 and 24.7 on a sheet's Checklist row (the same component a local's row is, whose
 * own cases are in `local/verificacoes-surface.test.tsx`): the NC phrase that follows its item,
 * the kept warning with "Apagar observação", and the question about the row's stored points
 * with its three exits.
 */

vi.mock('../../state/drafts.tsx', () => ({ useDraftSource: () => () => Promise.resolve(), useDrafts: () => ({ register: () => () => undefined }) }));

const REL = portoSeguroSmall.relatorioId;
const BLOCK = '019966b0-0724-7000-8000-0000000000a1';
const EQ = '019966b0-0724-7000-8000-0000000000a2';
const ITEM = 'isoladores';
const AUTHOR = { id: portoSeguroSmall.userId, companyId: portoSeguroSmall.companyId };
const CHIPS = ['Trinca no isolador', 'Isolador sujo'];
const base = buildSnapshot(replay(portoSeguroSmall.log), REL);

function point(id: string, over: Partial<PointRow> = {}): PointRow {
  return { id, relatorio_id: REL, text: 'Item 2 (isoladores): Trinca no isolador', equipment_id: EQ, origin: 'nc', order_key: `a${id.slice(-1)}`, removed_at: null, action: null, priority: null, deadline: null, owner: null, item_key: ITEM, ...over };
}

function target(result: TriStateValue | null, observation: string): ChecklistRowTarget {
  return {
    entityId: BLOCK,
    result,
    committed: true,
    observation,
    resultOp: (by, value) => checklistResultOp(by, REL, BLOCK, ITEM, value),
    observationOp: (by, value) => checklistObservationOp(by, REL, BLOCK, ITEM, value),
    observationCap: null,
    ncDraft: null,
    pointSeed: () => ({ text: '', equipmentId: EQ, origin: 'nc', itemKey: ITEM }),
    pointMark: () => null,
    pointOwner: { equipmentId: EQ },
    chips: CHIPS,
    seedPhrases: CHIPS,
  };
}

interface Harness {
  batches: OpDraft[][];
  api: ChecklistRowApi;
  rerender: (result: TriStateValue | null, observation: string, points?: PointRow[]) => void;
}

function renderRow(result: TriStateValue | null, observation: string, points: PointRow[] = []): Harness {
  const batches: OpDraft[][] = [];
  const api: ChecklistRowApi = {
    relatorioId: REL,
    author: AUTHOR,
    commit: vi.fn(async () => undefined),
    edit: vi.fn(async (build: Build) => {
      batches.push(build([], AUTHOR, { blocks: [], locations: [], allLocations: [], equipment: [] }) ?? []);
      return `batch-${batches.length}`;
    }),
    undoable: vi.fn(),
  };
  const ui = (r: TriStateValue | null, o: string, p: PointRow[]) => (
    <ToastProvider>
      <ul className="checklist">
        <ChecklistRow api={api} target={target(r, o)} item={{ key: ITEM }} label="Isoladores" number={2} readOnly={false} snapshot={{ ...base, points: p }} />
      </ul>
      <ToastOutlet />
    </ToastProvider>
  );
  let shown = points;
  const view = render(ui(result, observation, shown));
  return {
    batches,
    api,
    rerender: (r, o, p) => {
      if (p !== undefined) shown = p;
      view.rerender(ui(r, o, shown));
    },
  };
}

const row = () => document.querySelector<HTMLElement>('li.checklist-row')!;
const seg = (name: 'Conforme' | 'Não conforme' | 'Não se aplica') => within(row()).getByRole('radio', { name });
const written = (batch: OpDraft[] | undefined) => (batch ?? []).map((op) => [op.path.split('/').slice(3).join('/') || op.path, op.kind, op.value]);
const KEPT = 'Observação mantida: o texto foi editado.';

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe('24.6 the NC phrase follows its item (a sheet\'s row)', () => {
  it('one chip, NC to C: the observation is removed in the same batch, no warning', async () => {
    const h = renderRow('NC', 'Trinca no isolador');
    await userEvent.click(seg('Conforme'));
    expect(written(h.batches[0])).toEqual([
      ['isoladores/result', 'put', 'C'],
      ['isoladores/observation', 'put', null],
    ]);
    h.rerender('C', '');
    expect(screen.queryByText(KEPT)).toBeNull();
  });

  it('two chips, NC to N.A.: removed too', async () => {
    const h = renderRow('NC', 'Trinca no isolador, Isolador sujo.');
    await userEvent.click(seg('Não se aplica'));
    expect(written(h.batches[0])).toEqual([
      ['isoladores/result', 'put', 'NA'],
      ['isoladores/observation', 'put', null],
    ]);
  });

  it('a chip with typed words, NC to C: kept, the warning line (status, describing the field) and "Apagar observação" with "Desfazer"', async () => {
    const h = renderRow('NC', 'Trinca no isolador da fase B');
    await userEvent.click(seg('Conforme'));
    expect(written(h.batches[0])).toEqual([['isoladores/result', 'put', 'C']]);
    h.rerender('C', 'Trinca no isolador da fase B');
    const line = await screen.findByText(KEPT);
    expect(line.closest('.e24-kept-line')).toHaveAttribute('role', 'status');
    expect(row()).toHaveClass('e24-kept');
    expect(within(row()).getByRole('textbox', { name: 'Observação do item 2' })).toHaveAccessibleDescription(/Observação mantida: o texto foi editado\./);
    await userEvent.click(within(row()).getByRole('button', { name: 'Apagar observação' }));
    expect(written(h.batches[1])).toEqual([['isoladores/observation', 'put', null]]);
    await waitFor(() => expect(h.api.undoable).toHaveBeenCalledWith('Observação apagada', 'batch-2'));
    expect(screen.queryByText(KEPT)).toBeNull();
  });

  it('the warning leaves once the result changes again; "Limpar" and C to NC write the result alone', async () => {
    const h = renderRow('NC', 'Texto digitado');
    await userEvent.click(seg('Não se aplica'));
    h.rerender('NA', 'Texto digitado');
    expect(await screen.findByText(KEPT)).toBeVisible();
    await userEvent.click(seg('Não conforme'));
    expect(written(h.batches[1])).toEqual([['isoladores/result', 'put', 'NC']]);
    h.rerender('NC', 'Texto digitado');
    expect(screen.queryByText(KEPT)).toBeNull();
    // Set back to NC, the row asks for an observation as any NC row does once it is empty.
    h.rerender('NC', '');
    expect(within(row()).getByText('Obrigatória em item não conforme')).toBeVisible();
  });
});

describe('24.7 the question about the row\'s stored point (a sheet\'s row)', () => {
  const P1 = '019966b0-0724-7000-8000-0000000000b1';
  const MANUAL = '019966b0-0724-7000-8000-0000000000b0';
  const points = () => [point(MANUAL, { origin: 'manual', item_key: null, text: 'Ponto à mão' }), point(P1)];

  it('NC to C opens the question naming the point, the row already shows Conforme, "Manter ponto" focused first', async () => {
    const h = renderRow('NC', 'Trinca no isolador', points());
    await userEvent.click(seg('Conforme'));
    const dialog = await screen.findByRole('dialog', { name: 'Remover o ponto de atenção deste item?' });
    expect(dialog).toHaveAccessibleDescription('O ponto de atenção 2 foi criado a partir deste item, que agora está Conforme. Se mantiver, ele fica com a marca “Item alterado”.');
    expect(within(dialog).getByRole('button', { name: 'Manter ponto' })).toHaveFocus();
    expect(within(dialog).getByRole('button', { name: 'Remover ponto' })).toHaveClass('btn-destructive');
    // Behind the modal (hidden from the tree while it is open), the row shows the new result.
    expect(within(row()).getByRole('radio', { name: 'Conforme', hidden: true })).toHaveAttribute('aria-checked', 'true');
    expect(h.batches).toHaveLength(0);
  });

  it('"Remover ponto": the result, the observation clear and the point removal in one batch, with "Desfazer"', async () => {
    const h = renderRow('NC', 'Trinca no isolador', points());
    await userEvent.click(seg('Conforme'));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remover ponto' }));
    expect(h.batches).toHaveLength(1);
    expect(h.batches[0]!.map((op) => [op.path, op.kind])).toEqual([
      [`sheet/${BLOCK}/checklist/${ITEM}/result`, 'put'],
      [`sheet/${BLOCK}/checklist/${ITEM}/observation`, 'put'],
      [`point/${P1}/removed_at`, 'remove'],
    ]);
    await waitFor(() => expect(h.api.undoable).toHaveBeenCalledWith('Ponto de atenção 2 removido', 'batch-1'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('"Manter ponto", and a close by Esc: the result (and the clear) only, nothing removed', async () => {
    for (const exit of ['keep', 'escape'] as const) {
      cleanup();
      const h = renderRow('NC', 'Trinca no isolador', points());
      await userEvent.click(seg('Não se aplica'));
      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveAccessibleDescription(/que agora está marcado como Não se aplica/);
      if (exit === 'keep') await userEvent.click(within(dialog).getByRole('button', { name: 'Manter ponto' }));
      else await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(h.batches).toHaveLength(1);
      expect(h.batches[0]!.map((op) => op.path)).toEqual([`sheet/${BLOCK}/checklist/${ITEM}/result`, `sheet/${BLOCK}/checklist/${ITEM}/observation`]);
      expect(h.api.undoable).not.toHaveBeenCalled();
    }
  });

  it('a row with only a manual point of its equipment, or none, asks nothing', async () => {
    const h = renderRow('NC', 'Trinca no isolador', [point(MANUAL, { origin: 'manual', item_key: null })]);
    await userEvent.click(seg('Conforme'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(h.batches).toHaveLength(1);
  });

  it('e24x (test gap): the asked point removed on another device while the question is open: the question closes and the chosen result is written alone', async () => {
    const h = renderRow('NC', 'Trinca no isolador', points());
    await userEvent.click(seg('Conforme'));
    await screen.findByRole('dialog', { name: 'Remover o ponto de atenção deste item?' });
    expect(h.batches).toHaveLength(0);
    // The other device's removal arrives: only the manual point is left, which the question never asks about.
    h.rerender('NC', 'Trinca no isolador', [point(MANUAL, { origin: 'manual', item_key: null, text: 'Ponto à mão' })]);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(h.batches).toHaveLength(1);
    expect(h.batches[0]!.map((op) => op.path)).toEqual([`sheet/${BLOCK}/checklist/${ITEM}/result`, `sheet/${BLOCK}/checklist/${ITEM}/observation`]);
    expect(h.api.undoable).not.toHaveBeenCalled();
  });
});

describe('e24x A2 a text still being saved when the row leaves NC', () => {
  it('a chip tapped and C tapped before the observation is stored: kept with the warning, nothing removed', async () => {
    const h = renderRow('NC', '');
    const chips = within(row()).getByRole('group', { name: /^Observações sugeridas do item / });
    await userEvent.click(within(chips).getByRole('button', { name: 'Trinca no isolador' }));
    expect(within(row()).getByRole('textbox', { name: 'Observação do item 2' })).toHaveValue('Trinca no isolador');
    await userEvent.click(seg('Conforme'));
    expect(written(h.batches[0])).toEqual([['isoladores/result', 'put', 'C']]);
    // The pending commit lands, then the result's echo: the row keeps its text with the warning.
    h.rerender('NC', 'Trinca no isolador');
    h.rerender('C', 'Trinca no isolador');
    expect(await screen.findByText(KEPT)).toBeVisible();
  });

  it('a pending blank text asks nothing: the result alone, no warning', async () => {
    const h = renderRow('NC', 'Texto digitado');
    await userEvent.clear(within(row()).getByRole('textbox', { name: 'Observação do item 2' }));
    await userEvent.click(seg('Conforme'));
    expect(written(h.batches[0])).toEqual([['isoladores/result', 'put', 'C']]);
    h.rerender('C', '');
    expect(screen.queryByText(KEPT)).toBeNull();
  });
});

describe('e24x A5 the kept warning survives leaving the ficha and a reload', () => {
  async function keptRow(): Promise<void> {
    const h = renderRow('NC', 'Texto digitado');
    await userEvent.click(seg('Conforme'));
    h.rerender('C', 'Texto digitado');
    expect(await screen.findByText(KEPT)).toBeVisible();
  }

  it('remounted with the same result and observation, the warning shows again', async () => {
    await keptRow();
    cleanup();
    renderRow('C', 'Texto digitado');
    expect(await screen.findByText(KEPT)).toBeVisible();
    expect(row()).toHaveClass('e24-kept');
  });

  it('remounted after the observation or the result changed, it is gone for good', async () => {
    await keptRow();
    cleanup();
    renderRow('C', 'Texto mudado em outro aparelho');
    expect(screen.queryByText(KEPT)).toBeNull();
    cleanup();
    renderRow('C', 'Texto digitado');
    expect(screen.queryByText(KEPT)).toBeNull();

    cleanup();
    await keptRow();
    cleanup();
    renderRow('NA', 'Texto digitado');
    expect(screen.queryByText(KEPT)).toBeNull();
    cleanup();
    renderRow('C', 'Texto digitado');
    expect(screen.queryByText(KEPT)).toBeNull();
  });

  it('a change on screen drops it too: once the result changes, a remount shows nothing', async () => {
    const h = renderRow('NC', 'Texto digitado');
    await userEvent.click(seg('Conforme'));
    h.rerender('C', 'Texto digitado');
    expect(await screen.findByText(KEPT)).toBeVisible();
    h.rerender('NA', 'Texto digitado');
    expect(screen.queryByText(KEPT)).toBeNull();
    cleanup();
    renderRow('C', 'Texto digitado');
    expect(screen.queryByText(KEPT)).toBeNull();
  });

  it('"Apagar observação" drops it: the observation brought back by "Desfazer" shows no warning after a remount', async () => {
    await keptRow();
    await userEvent.click(within(row()).getByRole('button', { name: 'Apagar observação' }));
    cleanup();
    renderRow('C', 'Texto digitado');
    expect(screen.queryByText(KEPT)).toBeNull();
  });
});

describe('e24x A1 only the item\'s seed phrases are automatic (decision 17)', () => {
  const ctx = snapshotDefinitionContext(base);
  const sheetBlock = base.blocks.find((block) => block.removed_at === null && isEquipmentBlock(block) && (blockDefinitionIn(ctx, block)?.checklist ?? []).some((one) => one.nc_phrases.length >= 2))!;
  const item = blockDefinitionIn(ctx, sheetBlock)!.checklist!.find((one) => one.nc_phrases.length >= 2)!;
  const opId = (n: number) => `019966b0-0724-7000-8000-${n.toString(16).padStart(12, '0')}`;
  const LEARNED = 'Marcas de aquecimento antigo no barramento';
  const learnedRow = (id: string) => ({ id, kind: 'nc_phrase', name: LEARNED, block_type: sheetBlock.block_type, item_key: item.key, removed_at: null }) as unknown as RegistryRow;

  function withObservation(block: BlockRow, text: string, observationOpId: string): BlockRow {
    const next = structuredClone(block);
    next.sheet.checklist[item.key] = {
      result: { value: 'NC', source_suggestion_id: null, op_id: opId(0x500) },
      observation: { value: text, source_suggestion_id: null, op_id: observationOpId },
    };
    return next;
  }

  /** The sheet's row of `item` as the ficha builds it (`sheetRowTarget`), set to Conforme; the batch it writes. */
  async function leave(snapshot: RelatorioSnapshot, block: BlockRow, learned: readonly RegistryRow[] = []): Promise<OpDraft[]> {
    const batches: OpDraft[][] = [];
    const api: ChecklistRowApi = {
      relatorioId: REL,
      author: AUTHOR,
      commit: vi.fn(async () => undefined),
      edit: vi.fn(async (build: Build) => {
        batches.push(build([], AUTHOR, { blocks: [], locations: [], allLocations: [], equipment: [] }) ?? []);
        return 'batch-1';
      }),
      undoable: vi.fn(),
    };
    render(
      <ToastProvider>
        <ul className="checklist">
          <ChecklistRow api={api} target={sheetRowTarget(snapshot, block, item, [], learned)} item={{ key: item.key }} label={item.label} number={1} readOnly={false} snapshot={snapshot} />
        </ul>
      </ToastProvider>,
    );
    await userEvent.click(seg('Conforme'));
    await waitFor(() => expect(batches).toHaveLength(1));
    cleanup();
    return batches[0]!;
  }

  const paths = (batch: OpDraft[]) => batch.map((op) => op.path.split('/').slice(-1)[0]);
  const on = (block: BlockRow, others: BlockRow[] = []): RelatorioSnapshot => ({ ...base, blocks: [...base.blocks.map((one) => (one.id === block.id ? block : one)), ...others] });

  it('a typed text the server learned (its row learned before the cell\'s last write), alone or with a seed chip after it: kept', async () => {
    const alone = withObservation(sheetBlock, LEARNED, opId(0x900));
    expect(paths(await leave(on(alone), alone, [learnedRow(opId(0x100))]))).toEqual(['result']);
    const withSeed = withObservation(sheetBlock, insertPhrase(LEARNED, item.nc_phrases[0]!).text, opId(0x900));
    expect(paths(await leave(on(withSeed), withSeed, [learnedRow(opId(0x100))]))).toEqual(['result']);
    // The tablet's clock ahead: the cell written "before" the learned row; kept the same.
    const ahead = withObservation(sheetBlock, LEARNED, opId(0x050));
    expect(paths(await leave(on(ahead), ahead, [learnedRow(opId(0x100))]))).toEqual(['result']);
  });

  it('an observation equal to another sheet\'s (a recent): kept', async () => {
    const text = 'Barramento escurecido perto da conexão';
    const block = withObservation(sheetBlock, text, opId(0x900));
    const other = { ...withObservation(sheetBlock, text, opId(0x800)), id: opId(0x7a1) };
    expect(paths(await leave(on(block, [other]), block))).toEqual(['result']);
  });

  it('one or two seed chips alone: removed in the result\'s batch', async () => {
    const one = withObservation(sheetBlock, item.nc_phrases[0]!, opId(0x900));
    expect(paths(await leave(on(one), one, [learnedRow(opId(0x100))]))).toEqual(['result', 'observation']);
    const two = withObservation(sheetBlock, insertPhrase(item.nc_phrases[0]!, item.nc_phrases[1]!).text, opId(0x900));
    expect(paths(await leave(on(two), two))).toEqual(['result', 'observation']);
  });
});
