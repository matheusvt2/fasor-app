import {
  cellAddressesOf,
  composeConclusion,
  conclusionFloor,
  defaultBlockConfig,
  emptySheet,
  getDefinition,
  NO_VISIT_CONTEXT,
  TEXT_CAPS,
  visitContextOf,
  type BlockRow,
  type Cell,
  type LocationRow,
  type OpDraft,
  type Sheet,
} from '@app/domain';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../state/toast.tsx';
import type { Build } from '../relatorio/relatorio-editor.ts';
import { ConclusaoSection } from './conclusao-section.tsx';
import type { FichaApi } from './ficha-api.ts';

/*
 * E5-A4 (matrix rows "Stale confirm" and "Fresh confirm"): the conclusion text's
 * "Confirmar" recomposes from the freshest block inside the edit and writes nothing when the
 * basis moved since the render.
 */

vi.mock('../../state/drafts.tsx', () => ({ useDraftSource: () => undefined }));

const ID = '019966b0-0052-7000-8000-000000000001';
const OP = '019966b0-0052-7000-8000-000000000002';
const SEC = getDefinition('v1', 'cabine_primaria', 'chave_seccionadora');
const AUTHOR = { id: 'u1', companyId: 'c1' };

const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: OP });
const measured = (raw: string, unit: string) => cell({ raw, unit, state: 'measured' });

function block(sheet: Partial<Sheet>): BlockRow {
  return {
    id: ID,
    relatorio_id: ID,
    location_id: null,
    equipment_id: ID,
    block_type: 'chave_seccionadora',
    config: defaultBlockConfig('v1', 'chave_seccionadora', { subtype: 'manual' }),
    seed_version: 'v1',
    order_key: 'a0',
    feeds_block_id: null,
    not_tested: null,
    concluded_by: null,
    sheet: { ...emptySheet(), ...sheet },
    created_by: null,
    first_edited_at: null,
    last_modified_by: null,
    last_modified_at: null,
    removed_at: null,
  };
}

const pair = { result: cell('aprovado'), restriction: cell('sem_restricoes') };
const readings = (raw: string): Sheet['test'] => ({ isolacao: { cells: { '0': { '0': measured(raw, 'GΩ') } } } });

const announced: string[] = [];

/** `current`: the block the store holds when the edit runs (the build is then run against it). */
function renderSection(shown: BlockRow, current?: BlockRow) {
  const builds: Build[] = [];
  announced.length = 0;
  const api: FichaApi = {
    relatorioId: ID,
    projectId: ID,
    blockId: ID,
    author: AUTHOR,
    commit: vi.fn(async () => undefined),
    edit: vi.fn(async (build: Build) => {
      builds.push(build);
      if (current !== undefined) build([current], AUTHOR, { blocks: [], locations: [], allLocations: [], equipment: [] });
      return null;
    }),
    undoable: vi.fn(),
    announce: vi.fn((text: string) => {
      announced.push(text);
    }),
  };
  render(
    <ToastProvider>
      <ConclusaoSection api={api} block={shown} definition={SEC} tag="SEC-C05" className="ficha-step" onFocus={() => undefined} section9={{ ref: 'seção 5', prints: true, absent: 'não sai no documento: o relatório não tem a seção 5' }} visit={NO_VISIT_CONTEXT} />
    </ToastProvider>,
  );
  return builds;
}

const fresh = { blocks: [], locations: [], allLocations: [], equipment: [] };

describe('E5-A4 the conclusion confirm guards its basis', () => {
  it('a fresh confirm writes the text, its status and its basis in one batch', async () => {
    const shown = block({ test: readings('147'), conclusion: pair });
    const builds = renderSection(shown);
    // F43 (UX pass 2026-10-22): the helper names section 9 as the relatório numbers it.
    expect(screen.getByText(/Impresso na linha Conclusão da seção 5 depois de confirmar\./)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(builds).toHaveLength(1);
    const ops = builds[0]!([shown], AUTHOR, fresh) ?? [];
    const composed = composeConclusion(shown, SEC, 'SEC-C05');
    expect(ops.map((op) => [op.path.split('/').slice(-1)[0], op.value])).toEqual([
      ['text', composed.text],
      ['text_status', 'confirmed'],
      ['text_basis', composed.basis],
    ]);
    // Contract 16: the composed text put is flagged for the merge; its status and basis are not.
    expect(ops.map((op) => op.meta)).toEqual([{ composed: true }, null, null]);
  });

  it('a confirm whose block changed since the render writes nothing', async () => {
    const shown = block({ test: readings('147'), conclusion: pair });
    const builds = renderSection(shown);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    const changed = block({ test: readings('148'), conclusion: pair });
    expect(builds[0]!([changed], AUTHOR, fresh)).toBeNull();
  });

  it('carry-over F: a stale "Confirmar" says "O texto mudou; confira e confirme de novo" in the live region; a fresh one says nothing', async () => {
    const shown = block({ test: readings('147'), conclusion: pair });
    renderSection(shown, block({ test: readings('148'), conclusion: pair }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(announced).toEqual(['O texto mudou; confira e confirme de novo']));
    cleanup();
    renderSection(shown, shown);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(announced).toEqual([]);
  });
});

/** Story 20.9: the OBSERVAÇÕES field of an empty sheet, its committed drafts recorded in `committed`. */
const committed: OpDraft[] = [];
function renderObservations() {
  committed.length = 0;
  const api: FichaApi = {
    relatorioId: ID,
    projectId: ID,
    blockId: ID,
    author: AUTHOR,
    commit: vi.fn(async (drafts: OpDraft[]) => {
      committed.push(...drafts);
    }),
    edit: vi.fn(async () => null),
    undoable: vi.fn(),
    announce: vi.fn(),
  };
  render(
    <ToastProvider>
      <ConclusaoSection api={api} block={block({})} definition={SEC} tag="SEC-C05" className="ficha-step" onFocus={() => undefined} section9={{ ref: 'seção 5', prints: true, absent: 'não sai no documento: o relatório não tem a seção 5' }} visit={NO_VISIT_CONTEXT} />
    </ToastProvider>,
  );
}

describe('Story 20.9: OBSERVAÇÕES stops at the kernel cap', () => {
  it('a paste past 20 000 characters is cut at the cap, the counter shows, and the written op holds exactly the cap', async () => {
    renderObservations();
    const area = screen.getByRole('textbox', { name: 'Observações da ficha' });
    expect(area).toHaveAttribute('maxLength', String(TEXT_CAPS.long));
    expect(screen.queryByTestId('char-count')).toBeNull();
    await userEvent.click(area);
    await userEvent.paste('x'.repeat(TEXT_CAPS.long + 50));
    expect((area as HTMLTextAreaElement).value).toHaveLength(TEXT_CAPS.long);
    expect(screen.getByTestId('char-count')).toHaveTextContent('20.000 de 20.000 caracteres');
    await userEvent.tab();
    await waitFor(() => expect(committed.length).toBeGreaterThan(0));
    const op = committed.at(-1)!;
    expect(op.path).toBe(`sheet/${ID}/observations`);
    expect(String(op.value)).toHaveLength(TEXT_CAPS.long);
  });
});

describe('e22f S1: "Confirmar" under "Conclusão ajustada pela ficha"', () => {
  /** A sheet concluded Aprovado · Sem restrições with its text confirmed (or edited), then a reading corrected out (0,3 GΩ against >400 MΩ). */
  const adjusted = (status: 'confirmed' | 'edited') => {
    const within = block({ test: readings('147'), conclusion: pair });
    const composed = composeConclusion(within, SEC, 'SEC-C05');
    const text = status === 'confirmed' ? composed.text : 'Texto do engenheiro.';
    return block({ test: readings('0.3'), conclusion: { ...pair, text: cell(text), text_status: cell(status), text_basis: cell(composed.basis) } });
  };
  const confirmAdjusted = () => document.querySelector<HTMLButtonElement>('.conclusion-hint[role="status"] button')!;

  it('a confirmed text the floor made stale is recomposed in the same batch as the effective pair', async () => {
    cleanup();
    const shown = adjusted('confirmed');
    const builds = renderSection(shown);
    expect(confirmAdjusted().closest('.conclusion-hint')).toHaveTextContent('Conclusão ajustada pela ficha');
    await userEvent.click(confirmAdjusted());
    const ops = builds.at(-1)!([shown], AUTHOR, fresh) ?? [];
    const now = composeConclusion(shown, SEC, 'SEC-C05');
    expect(now.text).toContain('Recomenda-se a correção');
    expect(ops.map((op) => [op.path.split('/').slice(-1)[0], op.value])).toEqual([
      ['result', 'reprovado'],
      ['restriction', 'com_restricoes'],
      ['text', now.text],
      ['text_status', 'confirmed'],
      ['text_basis', now.basis],
    ]);
  });

  it("an edited text is the engineer's: only the pair is written", async () => {
    cleanup();
    const shown = adjusted('edited');
    const builds = renderSection(shown);
    await userEvent.click(confirmAdjusted());
    const ops = builds.at(-1)!([shown], AUTHOR, fresh) ?? [];
    expect(ops.map((op) => [op.path.split('/').slice(-1)[0], op.value])).toEqual([
      ['result', 'reprovado'],
      ['restriction', 'com_restricoes'],
    ]);
  });
});

describe('e23w W2-4: both confirms judge a v13 sheet under the visit context of the build\'s rows', () => {
  /*
   * A v13 disjuntor (no TENSÃO NOMINAL: the seeded > 400 MΩ) whose 600 MΩ reading is within raw and out at 20 °C at the
   * cabine's 5 °C (solid factor 2^((5 - 20)/15) = 0,5: 300 MΩ). Mutation run (recorded in the batch's report): each test
   * fails when its confirm reads `NO_VISIT_CONTEXT` instead of `visitContextOf(rows, fresh)`.
   */
  const DJ = getDefinition('v13', 'cabine_primaria', 'disjuntor_mt');
  const CABINE = '019966b0-0052-7000-8000-000000000003';
  const cabine: LocationRow = {
    id: CABINE,
    relatorio_id: ID,
    parent_id: null,
    kind: 'cabine',
    name: 'Cabine A',
    order_key: 'a0',
    removed_at: null,
    se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
    env: { altitude_m: null, temperature_c: { raw: '5', unit: '°C', state: 'measured' }, humidity_pct: null },
    agrupar_por_tipo: false,
  };
  const rows = { blocks: [], locations: [cabine], allLocations: [cabine], equipment: [] };
  const at = cellAddressesOf(DJ, 'isolacao').find((address) => DJ.tests.find((test) => test.key === 'isolacao')!.tables[0]!.value_columns[address.col]!.role === 'capture')!;
  const disjuntor = (conclusion: Partial<Sheet['conclusion']>): BlockRow => ({
    ...block({}),
    block_type: 'disjuntor_mt',
    seed_version: 'v13',
    location_id: CABINE,
    config: defaultBlockConfig('v13', 'disjuntor_mt'),
    sheet: { ...emptySheet(), test: { isolacao: { cells: { [String(at.row)]: { [String(at.col)]: measured('600', 'MΩ') } } } }, conclusion: { ...emptySheet().conclusion, ...conclusion } },
  });

  function renderDisjuntor(shown: BlockRow) {
    const builds: Build[] = [];
    const api: FichaApi = {
      relatorioId: ID,
      projectId: ID,
      blockId: ID,
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
        <ConclusaoSection api={api} block={shown} definition={DJ} tag="DJ-01" className="ficha-step" onFocus={() => undefined} section9={{ ref: 'seção 5', prints: true, absent: 'não sai no documento: o relatório não tem a seção 5' }} visit={visitContextOf(rows, shown)} />
      </ToastProvider>,
    );
    return builds;
  }

  it('"Confirmar" of "Conclusão ajustada" writes the floor the corrected reading gives (Reprovado · Com restrições) and the text composed under the context', async () => {
    cleanup();
    const within = disjuntor({});
    // Concluded Aprovado · Sem restrições with the text composed before the ambient was typed (raw: within).
    const composedRaw = composeConclusion(within, DJ, 'DJ-01');
    const shown = disjuntor({ ...pair, text: cell(composedRaw.text), text_status: cell('confirmed'), text_basis: cell(composedRaw.basis) });
    const visit = visitContextOf(rows, shown);
    expect(conclusionFloor(shown, DJ, visit)!.pair).toEqual({ result: 'reprovado', restriction: 'com_restricoes' });
    expect(conclusionFloor(shown, DJ, NO_VISIT_CONTEXT)!.pair).toEqual({ result: 'aprovado', restriction: 'sem_restricoes' });
    const builds = renderDisjuntor(shown);
    const confirm = document.querySelector<HTMLButtonElement>('.conclusion-hint[role="status"] button')!;
    expect(confirm.closest('.conclusion-hint')).toHaveTextContent('Conclusão ajustada pela ficha');
    await userEvent.click(confirm);
    const ops = builds.at(-1)!([shown], AUTHOR, rows) ?? [];
    const now = composeConclusion(shown, DJ, 'DJ-01', visit);
    expect(now.text).toContain('a 20 °C');
    expect(ops.map((op) => [op.path.split('/').slice(-1)[0], op.value])).toEqual([
      ['result', 'reprovado'],
      ['restriction', 'com_restricoes'],
      ['text', now.text],
      ['text_status', 'confirmed'],
      ['text_basis', now.basis],
    ]);
  });

  it('"Confirmar" of the text writes the text and the basis composed under the context (judged at 20 °C)', async () => {
    cleanup();
    const shown = disjuntor({ result: cell('reprovado'), restriction: cell('com_restricoes') });
    const visit = visitContextOf(rows, shown);
    const builds = renderDisjuntor(shown);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    const ops = builds.at(-1)!([shown], AUTHOR, rows) ?? [];
    const composed = composeConclusion(shown, DJ, 'DJ-01', visit);
    expect(composed.basis).not.toBe(composeConclusion(shown, DJ, 'DJ-01').basis);
    expect(ops.map((op) => [op.path.split('/').slice(-1)[0], op.value])).toEqual([
      ['text', composed.text],
      ['text_status', 'confirmed'],
      ['text_basis', composed.basis],
    ]);
  });
});

describe('24.5 the suggested conclusion reads as a preview until the pair is stored', () => {
  const allC = (): Sheet['checklist'] => Object.fromEntries(SEC.checklist!.map((item) => [item.key, { result: cell('C') }]));
  const PREVIEW_LINE = 'Prévia: só vale depois de Confirmar ou de Concluir ficha.';
  const groups = () => [screen.getByRole('radiogroup', { name: 'Resultado' }), screen.getByRole('radiogroup', { name: 'Restrições' })] as const;

  it('floor only: the row reads "Prévia da conclusão" with the pill "Prévia", both groups are a preview, the line describes both', () => {
    cleanup();
    renderSection(block({ checklist: allC() }));
    const row = screen.getByRole('group', { name: 'Prévia da conclusão' });
    expect(row).toHaveTextContent('Aprovado · Sem restrições?');
    expect(row.querySelector('.suggested-pill')).toHaveTextContent('Prévia');
    const [result, restriction] = groups();
    expect(result.querySelector('[aria-checked="true"]')).toBeNull();
    expect(restriction.querySelector('[aria-checked="true"]')).toBeNull();
    expect(screen.getByRole('radio', { name: 'Aprovado' })).toHaveClass('is-floor');
    expect(screen.getByRole('radio', { name: 'Sem restrições' })).toHaveClass('is-floor');
    expect(screen.getByRole('radio', { name: 'Reprovado' })).not.toHaveClass('is-floor');
    expect(result).not.toHaveAttribute('aria-invalid');
    expect(result).toHaveAccessibleDescription(PREVIEW_LINE);
    expect(restriction).toHaveAccessibleDescription(PREVIEW_LINE);
  });

  it('"Confirmar" on the row writes both halves in one batch', async () => {
    cleanup();
    const shown = block({ checklist: allC() });
    const builds = renderSection(shown);
    await userEvent.click(screen.getByRole('group', { name: 'Prévia da conclusão' }).querySelector('button')!);
    const ops = builds.at(-1)!([shown], AUTHOR, fresh) ?? [];
    expect(ops.map((op) => [op.path.split('/').slice(-1)[0], op.value])).toEqual([
      ['result', 'aprovado'],
      ['restriction', 'sem_restricoes'],
    ]);
  });

  it('half stored by a tap: no row, only the restriction group is a preview and the line describes it alone', () => {
    cleanup();
    renderSection(block({ checklist: allC(), conclusion: { result: cell('aprovado') } }));
    expect(screen.queryByRole('group', { name: 'Prévia da conclusão' })).toBeNull();
    const [result, restriction] = groups();
    expect(screen.getByRole('radio', { name: 'Aprovado' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Aprovado' })).not.toHaveClass('is-floor');
    expect(restriction.querySelector('[aria-checked="true"]')).toBeNull();
    expect(screen.getByRole('radio', { name: 'Sem restrições' })).toHaveClass('is-floor');
    expect(result).not.toHaveAccessibleDescription(PREVIEW_LINE);
    expect(restriction).toHaveAccessibleDescription(PREVIEW_LINE);
  });

  it('a stored pair, a sheet marked Não ensaiado, or no floor: no row, no preview state, no line', () => {
    const notTested: BlockRow = { ...block({ checklist: allC() }), not_tested: { reason: 'solicitacao_cliente', text: null, at: '2026-09-06T12:00:00.000Z', by: ID } };
    for (const shown of [block({ checklist: allC(), conclusion: pair }), notTested, block({})]) {
      cleanup();
      renderSection(shown);
      expect(screen.queryByRole('group', { name: 'Prévia da conclusão' })).toBeNull();
      expect(document.querySelector('.seg.is-floor')).toBeNull();
      expect(screen.queryByText(PREVIEW_LINE)).toBeNull();
    }
  });

  it('a stored pair a later floor made stricter shows "Conclusão ajustada pela ficha" and nothing reads as a preview', () => {
    cleanup();
    renderSection(block({ checklist: { ...allC(), contatos: { result: cell('NC') } }, conclusion: pair }));
    expect(screen.getByText('Conclusão ajustada pela ficha')).toBeVisible();
    expect(document.querySelector('.seg.is-floor')).toBeNull();
    expect(screen.queryByText(PREVIEW_LINE)).toBeNull();
  });
});
