import { composeConclusion, getDefinition, snapshotDefinitionContext, visitContextOf, type BlockRow, type OpDraft, type RelatorioSnapshot } from '@app/domain';
import { layoutLockSnapshot } from '@app/domain/fixtures/layout-lock';
import { renderHook, waitFor } from '@testing-library/react';
import type { NavigateFunction } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { FichaApi } from '../ficha/ficha-api.ts';
import { useFichaActions } from '../ficha/use-ficha-actions.ts';
import type { Build, RelatorioEditor } from './relatorio-editor.ts';
import { renameEquipmentOps } from './tag-rename-ops.ts';

/*
 * Fix batch e24y (P2, P3): every rename path writes, in the rename's batch, the conclusion text composed
 * with the new TAG (and its basis, the status left confirmed) on a sheet whose confirmed text is the
 * current suggestion, and the stored plate TAG cell: the helper, and the sheet's pencil (`useFichaActions`'s
 * `rename`); the tree's "Renomear TAG" is in `relatorio-tree-edits.test.tsx`. The relatório is the layout lock's v13
 * one, whose Disjuntor MT holds a confirmed, current text and a plate TAG cell "SINT-4".
 */

const AUTHOR = { id: 'u1', companyId: 'c1' };
const snapshot: RelatorioSnapshot = layoutLockSnapshot('v13');
const sheet = snapshot.blocks.find((row) => row.block_type === 'disjuntor_mt' && row.removed_at === null)!;
const equipment = snapshot.equipment.find((row) => row.id === sheet.equipment_id)!;
const definition = getDefinition('v13', 'cabine_primaria', 'disjuntor_mt');

const editOver = (into: { ops: OpDraft[] | null }) =>
  vi.fn(async (build: Build) => {
    into.ops = build(snapshot.blocks as BlockRow[], AUTHOR, { blocks: snapshot.blocks as BlockRow[], locations: snapshot.locations as never, allLocations: snapshot.locations as never, equipment: snapshot.equipment as never });
    return into.ops === null ? null : 'batch';
  });

/** The conclusion text and basis composed with `tag`, as the sheet stands. */
function composedWith(tag: string, block: BlockRow = sheet) {
  return composeConclusion(block, definition, tag, visitContextOf(snapshot, block));
}

const DONE = { steps: { placa: { missing: 0, outOfLimit: 0 }, verificacoes: { missing: 0, outOfLimit: 0 }, ensaios: { missing: 0, outOfLimit: 0 }, conclusao: { missing: 0, outOfLimit: 0 } }, complete: true, firstIncompleteStep: null };

const summary = (ops: readonly OpDraft[]) => ops.map((op) => [op.path, op.value, op.meta ?? null]);

describe('e24y-P2 the rename paths carry the confirmed conclusion and the plate TAG', () => {
  it('the helper: the TAG put, then the text (composed meta) and its basis, then the plate cell', () => {
    const ops = renameEquipmentOps(AUTHOR, { projectId: snapshot.relatorio.project_id, relatorioId: snapshot.relatorio.id, rows: { ...snapshot, definitions: snapshotDefinitionContext(snapshot) } }, equipment.id, ' QM8 ');
    const next = composedWith('QM8');
    expect(next.text).toContain('QM8');
    expect(summary(ops)).toEqual([
      [`equipment/${equipment.id}/tag`, 'QM8', null],
      [`sheet/${sheet.id}/conclusion/text`, next.text, { composed: true }],
      [`sheet/${sheet.id}/conclusion/text_basis`, next.basis, null],
      [`sheet/${sheet.id}/nameplate/tag`, 'QM8', null],
    ]);
  });

  it('the sheet\'s pencil ("Renomear TAG" in the header) writes them in its one batch', async () => {
    const into: { ops: OpDraft[] | null } = { ops: null };
    const api: FichaApi = { relatorioId: snapshot.relatorio.id, projectId: snapshot.relatorio.project_id, blockId: sheet.id, author: AUTHOR, commit: vi.fn(async () => undefined), edit: editOver(into), undoable: vi.fn(), announce: vi.fn() };
    const editor = { announce: vi.fn(), undoable: vi.fn(), edit: editOver(into) } as unknown as RelatorioEditor;
    const { result } = renderHook(() =>
      useFichaActions({
        relatorioId: snapshot.relatorio.id,
        snapshot,
        block: sheet,
        definition,
        progress: DONE,
        concludeProgress: DONE,
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
    result.current.rename('QM8');
    await waitFor(() => expect(into.ops).not.toBeNull());
    const next = composedWith('QM8');
    expect(summary(into.ops!)).toEqual([
      [`equipment/${equipment.id}/tag`, 'QM8', null],
      [`sheet/${sheet.id}/conclusion/text`, next.text, { composed: true }],
      [`sheet/${sheet.id}/conclusion/text_basis`, next.basis, null],
      [`sheet/${sheet.id}/nameplate/tag`, 'QM8', null],
    ]);
  });
});
