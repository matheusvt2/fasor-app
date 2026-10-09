import {
  cellAddressesOf,
  composeConclusion,
  defaultBlockConfig,
  emptySheet,
  getDefinition,
  sheetProgress,
  type BlockRow,
  type Cell,
  type EquipmentRow,
  type OpDraft,
  type RelatorioSnapshot,
  type Sheet,
} from '@app/domain';
import { renderHook, waitFor } from '@testing-library/react';
import type { NavigateFunction } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Build, RelatorioEditor } from '../relatorio/relatorio-editor.ts';
import type { FichaApi } from './ficha-api.ts';
import { useFichaActions } from './use-ficha-actions.ts';

/*
 * Review 2026-10-09 (PR #121, r8conc-tests-3): "Concluir ficha" confirms the conclusion text
 * composed from the fresh rows the edit reads, never from the block this render drew. The
 * render lacks the last reading; the edit's rows hold it (its commit landed after the draw,
 * Story 12.1): the text basis the conclude writes is the fresh rows' one.
 */

const ID = '019966b0-0053-7000-8000-000000000001';
const EQUIPMENT = '019966b0-0053-7000-8000-000000000002';
const PROJECT = '019966b0-0053-7000-8000-000000000003';
const OP = '019966b0-0053-7000-8000-000000000004';
const SEC = getDefinition('v1', 'cabine_primaria', 'chave_seccionadora');
const AUTHOR = { id: 'u1', companyId: 'c1' };
const TAG = 'SEC-C05';

const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: OP });
const CELLS = SEC.tests.flatMap((t) => cellAddressesOf(SEC, t.key));

function plateValue(kind: string, unit: string | undefined, options: readonly string[] | undefined): unknown {
  if (kind === 'number') return { raw: '630', unit: unit ?? null, state: 'measured' };
  if (kind === 'date') return '2020-01-01';
  if (kind === 'select') return options![0];
  return 'X';
}

/** A complete seccionadora but for the readings at `skip`, its pair set and its text never confirmed. */
function block(skip: readonly number[]): BlockRow {
  const test: Sheet['test'] = {};
  CELLS.forEach((c, index) => {
    if (skip.includes(index)) return;
    const raw = c.testKey === 'isolacao' ? { raw: '150', unit: 'GΩ', state: 'measured' } : { raw: '100', unit: 'µΩ', state: 'measured' };
    const entry = (test[c.testKey] ??= { cells: {} });
    (entry.cells[String(c.row)] ??= {})[String(c.col)] = cell(raw);
  });
  return {
    id: ID,
    relatorio_id: ID,
    location_id: null,
    equipment_id: EQUIPMENT,
    block_type: 'chave_seccionadora',
    config: defaultBlockConfig('v1', 'chave_seccionadora', { subtype: 'manual' }),
    seed_version: 'v1',
    order_key: 'a0',
    feeds_block_id: null,
    not_tested: null,
    concluded_by: null,
    sheet: {
      ...emptySheet(),
      nameplate: Object.fromEntries(SEC.nameplate.map((f) => [f.key, cell(plateValue(f.kind, f.unit, f.options))])),
      checklist: Object.fromEntries(SEC.checklist!.map((item) => [item.key, { result: cell('C') }])),
      test,
      conclusion: { result: cell('aprovado'), restriction: cell('sem_restricoes') },
    },
    created_by: null,
    first_edited_at: null,
    last_modified_by: null,
    last_modified_at: null,
    removed_at: null,
  };
}

const equipment: EquipmentRow = { id: EQUIPMENT, project_id: PROJECT, tag: TAG, type: 'chave_seccionadora', last_nameplate: null, removed_at: null };

describe('r8conc tests-3 the conclude composes the text from the fresh rows', () => {
  it('the text and its basis follow the rows the edit reads, not the rendered block', async () => {
    const rendered = block([CELLS.length - 1]);
    const fresh = block([]);
    const snapshot = { relatorio: { id: ID, project_id: PROJECT }, locations: [], blocks: [rendered], equipment: [equipment] } as unknown as RelatorioSnapshot;
    const progress = sheetProgress({ ...snapshot, blocks: [rendered] }, ID);
    expect(progress.complete).toBe(false);
    expect(sheetProgress({ ...snapshot, blocks: [fresh] }, ID).complete).toBe(true);

    let written: OpDraft[] | null = null;
    const api: FichaApi = {
      relatorioId: ID,
      projectId: PROJECT,
      blockId: ID,
      author: AUTHOR,
      commit: vi.fn(async () => undefined),
      edit: vi.fn(async (build: Build) => {
        written = build([fresh], AUTHOR, { blocks: [fresh], locations: [], equipment: [equipment] });
        return written === null ? null : 'batch';
      }),
      undoable: vi.fn(),
      announce: vi.fn(),
    };
    const editor = { announce: vi.fn(), undoable: vi.fn(), edit: vi.fn() } as unknown as RelatorioEditor;
    const { result } = renderHook(() =>
      useFichaActions({
        relatorioId: ID,
        snapshot,
        block: rendered,
        definition: SEC,
        progress,
        next: { kind: 'relatorio' },
        instruments: [],
        users: [],
        sessionUser: null,
        api,
        editor,
        goTo: vi.fn(),
        navigate: vi.fn() as unknown as NavigateFunction,
        showToast: vi.fn(),
        saved: vi.fn(),
      }),
    );
    // The render still says "Próxima ficha": its primary concludes on the fresh rows.
    result.current.primary();
    await waitFor(() => expect(written).not.toBeNull());

    const at = (field: string) => written!.find((op) => op.path === `sheet/${ID}/conclusion/${field}`)?.value;
    const composed = composeConclusion(fresh, SEC, TAG);
    const drawn = composeConclusion(rendered, SEC, TAG);
    expect(drawn.basis).not.toBe(composed.basis);
    expect(at('text_basis')).toBe(composed.basis);
    expect(at('text')).toBe(composed.text);
    expect(at('text_status')).toBe('confirmed');
    expect(written!.some((op) => op.path === `block/${ID}/concluded_by`)).toBe(true);
  });
});
