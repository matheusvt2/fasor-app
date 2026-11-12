import {
  blockDefinitionIn,
  composeConclusion,
  preIssue,
  sheetConclusionPath,
  snapshotDefinitionContext,
  visitContextOf,
  type JsonValue,
  type RelatorioSnapshot,
} from '@app/domain';

/**
 * Story 25.7 (M20): a concluded sheet whose stored conclusion text is stale blocks the issue through the route
 * (`409 pre_issue_blocked`). The v14 layout-lock fixture holds one such text (its log is frozen with the golden),
 * so a test that issues it through the route first writes what "Substituir" writes for each stale sheet: the text
 * composed now, confirmed, with its basis. The puts, as `[path, value, prev_op_id]` (the op each one follows), in
 * the order the sheet writes them.
 */
export function staleTextReplacements(snapshot: RelatorioSnapshot): [string, JsonValue, string | null][] {
  const ctx = snapshotDefinitionContext(snapshot);
  const sheets = preIssue(snapshot).flatMap((row) => (row.kind === 'conclusion_stale' ? (row.sheets ?? []) : []));
  return sheets.flatMap(({ blockId }) => {
    const block = snapshot.blocks.find((row) => row.id === blockId)!;
    const tag = snapshot.equipment.find((row) => row.id === block.equipment_id)?.tag ?? '';
    const composed = composeConclusion(block, blockDefinitionIn(ctx, block)!, tag, visitContextOf(snapshot, block));
    const prev = (field: 'text' | 'text_status' | 'text_basis') => block.sheet.conclusion[field]?.op_id ?? null;
    return [
      [sheetConclusionPath(blockId, 'text'), composed.text, prev('text')],
      [sheetConclusionPath(blockId, 'text_status'), 'confirmed', prev('text_status')],
      [sheetConclusionPath(blockId, 'text_basis'), composed.basis, prev('text_basis')],
    ] satisfies [string, JsonValue, string | null][];
  });
}
