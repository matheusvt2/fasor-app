import { composeConclusion, effectiveConclusionPair, getDefinition, sheetProgress, visitContextOf, type BlockRow, type Cell, type OpDraft, type RelatorioSnapshot } from '@app/domain';
import { layoutLockSnapshot } from '@app/domain/fixtures/layout-lock';
import { renderHook, waitFor } from '@testing-library/react';
import type { NavigateFunction } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Build, RelatorioEditor } from '../relatorio/relatorio-editor.ts';
import type { FichaApi } from './ficha-api.ts';
import { useFichaActions } from './use-ficha-actions.ts';

/*
 * Batch e24a (Story 24.3, seed v14): "Concluir ficha" on a sheet the floor makes Reprovado writes, in one
 * batch, the result Reprovado, a clear (a put of null) of the restriction stored before, the composed
 * text and `concluded_by`: never a restriction (`conclusionPairWrites`). On v13 the same sheet's batch
 * writes the floor's Com restrições as before. The sheet is the layout-lock relatório's seccionadora,
 * Reprovado by its contact rise since the previous visit (judged under the visit context of the rows).
 */

const AUTHOR = { id: 'u1', companyId: 'c1' };
const OP = '019966b0-0e24-7300-8000-000000000001';
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: OP });

/** The layout-lock relatório of `version`, its seccionadora with an observation and a stored Com restrições tapped before the conclude. */
function setUp(version: string): { snapshot: RelatorioSnapshot; sheet: BlockRow } {
  const snapshot = structuredClone(layoutLockSnapshot(version));
  const source = snapshot.blocks.find((row) => row.block_type === 'chave_seccionadora' && row.removed_at === null)!;
  const sheet: BlockRow = structuredClone(source);
  sheet.sheet.observations = cell('Contato do polo C acima da visita anterior.');
  sheet.sheet.conclusion = { restriction: cell('com_restricoes') };
  sheet.concluded_by = null;
  snapshot.blocks = snapshot.blocks.map((row) => (row.id === sheet.id ? sheet : row));
  return { snapshot, sheet };
}

async function conclude(snapshot: RelatorioSnapshot, sheet: BlockRow): Promise<OpDraft[]> {
  const definition = getDefinition(sheet.seed_version, 'cabine_primaria', sheet.block_type);
  let written: OpDraft[] | null = null;
  const api: FichaApi = {
    relatorioId: snapshot.relatorio.id,
    projectId: snapshot.relatorio.project_id,
    blockId: sheet.id,
    author: AUTHOR,
    commit: vi.fn(async () => undefined),
    edit: vi.fn(async (build: Build) => {
      written = build(snapshot.blocks, AUTHOR, { blocks: snapshot.blocks, locations: snapshot.locations, allLocations: snapshot.locations, equipment: snapshot.equipment });
      return written === null ? null : 'batch';
    }),
    undoable: vi.fn(),
    announce: vi.fn(),
  };
  const editor = { announce: vi.fn(), undoable: vi.fn(), edit: vi.fn() } as unknown as RelatorioEditor;
  const progress = sheetProgress(snapshot, sheet.id, { floorFills: true });
  expect(progress.complete).toBe(true);
  const { result } = renderHook(() =>
    useFichaActions({
      relatorioId: snapshot.relatorio.id,
      snapshot,
      block: sheet,
      definition,
      progress,
      concludeProgress: progress,
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
  result.current.primary();
  await waitFor(() => expect(written).not.toBeNull());
  return written!;
}

const conclusionWrites = (ops: readonly OpDraft[], blockId: string) => ops.filter((op) => op.path.startsWith(`sheet/${blockId}/conclusion/`)).map((op) => [op.path.split('/').at(-1), op.value]);

describe('24.3 B-2 "Concluir ficha" on a v14 sheet the floor makes Reprovado', () => {
  it('one batch: Reprovado, the stored restriction cleared, the composed text, concluded_by', async () => {
    const { snapshot, sheet } = setUp('v14');
    const definition = getDefinition('v14', 'cabine_primaria', 'chave_seccionadora');
    const visit = visitContextOf(snapshot, sheet);
    expect(effectiveConclusionPair(sheet, definition, visit)).toEqual({ result: 'reprovado', restriction: null });
    const ops = await conclude(snapshot, sheet);
    const composed = composeConclusion(sheet, definition, snapshot.equipment.find((row) => row.id === sheet.equipment_id)!.tag, visit);
    expect(conclusionWrites(ops, sheet.id)).toEqual([
      ['result', 'reprovado'],
      ['restriction', null],
      ['text', composed.text],
      ['text_status', 'confirmed'],
      ['text_basis', composed.basis],
    ]);
    expect(ops.at(-1)!.path).toBe(`block/${sheet.id}/concluded_by`);
  });

  it('v13: the floor\'s pair as before (the stored Com restrições already stricter, so the result alone)', async () => {
    const { snapshot, sheet } = setUp('v13');
    const ops = await conclude(snapshot, sheet);
    expect(conclusionWrites(ops, sheet.id).slice(0, 2)).toEqual([
      ['result', 'reprovado'],
      ['text', expect.any(String)],
    ]);
    expect(ops.some((op) => op.path === `sheet/${sheet.id}/conclusion/restriction`)).toBe(false);
  });
});
