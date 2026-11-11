import { buildSnapshot, replay, type OpDraft, type PointRow } from '@app/domain';
import { portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TriStateValue } from '../../components/index.ts';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import type { Build } from '../relatorio/relatorio-editor.ts';
import { ChecklistRow, type ChecklistRowApi, type ChecklistRowTarget } from './checklist-section.tsx';
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
  };
}

interface Harness {
  batches: OpDraft[][];
  api: ChecklistRowApi;
  rerender: (result: TriStateValue | null, observation: string) => void;
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
  const snapshot = { ...base, points };
  const ui = (r: TriStateValue | null, o: string) => (
    <ToastProvider>
      <ul className="checklist">
        <ChecklistRow api={api} target={target(r, o)} item={{ key: ITEM }} label="Isoladores" number={2} readOnly={false} snapshot={snapshot} />
      </ul>
      <ToastOutlet />
    </ToastProvider>
  );
  const view = render(ui(result, observation));
  return { batches, api, rerender: (r, o) => view.rerender(ui(r, o)) };
}

const row = () => document.querySelector<HTMLElement>('li.checklist-row')!;
const seg = (name: 'Conforme' | 'Não conforme' | 'Não se aplica') => within(row()).getByRole('radio', { name });
const written = (batch: OpDraft[] | undefined) => (batch ?? []).map((op) => [op.path.split('/').slice(3).join('/') || op.path, op.kind, op.value]);
const KEPT = 'Observação mantida: o texto foi editado.';

afterEach(cleanup);

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
    expect(dialog).toHaveAccessibleDescription('O ponto de atenção 2 foi criado a partir deste item, que agora está Conforme. Se mantiver, ele fica com a marca “Origem resolvida”.');
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
});
