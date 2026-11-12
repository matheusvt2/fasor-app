import { blockDefinitionIn, evaluateTest, historyNoteText, layoutSpec, snapshotDefinitionContext, testHistoryItems, visitContextOf } from '@app/domain';
import { LAYOUT_LOCK_ISSUED_AT, layoutLockEpic25Snapshot } from '@app/domain/fixtures/layout-lock';
import { describe, expect, it } from 'vitest';
import { buildDocx } from './docx.ts';
import { extractStructure } from './docx-structure.test-support.ts';
import { placeholderPages } from './toc.ts';

/*
 * 25.8-INT (batch e25c, Story 25.8; seed v15, `restriction.history_rise_at_limit_restricted`): the note line
 * of a v15 second visit. The Epic 25 synthetic relatório's breaker read 30 µΩ on each pole at the previous
 * visit and 45 µΩ now, a rise of exactly 50 %: on v15 its DOCX prints one note line under the contact table
 * naming each pole's rise "no limite de 50 %"; the v14 twin prints none for it (its golden,
 * `golden/layout-lock-v14-epic25`, holds as it was). Every value is invented.
 */

const NOTE = 'Em relação à manutenção anterior:';

/** The breaker of the fixture whose contact rose exactly 50 % (every pole at 45 µΩ), and the note line the kernel composes for it. */
function riseOf(version: string) {
  const snapshot = layoutLockEpic25Snapshot(version);
  const ctx = snapshotDefinitionContext(snapshot);
  for (const block of snapshot.blocks) {
    if (block.block_type !== 'disjuntor_mt' || block.removed_at !== null) continue;
    const definition = blockDefinitionIn(ctx, block)!;
    const evaluation = evaluateTest(block, definition, definition.tests.find((test) => test.key === 'resistencia_contato')!, visitContextOf(snapshot, block));
    const cells = evaluation.tables.flatMap((table) => table.rows.map((row) => row.cells.find((cell) => cell.role === 'capture')!));
    if (cells.every((cell) => cell.raw === '45')) return { snapshot, cells, note: historyNoteText(testHistoryItems(evaluation)) };
  }
  throw new Error(`no 45 µΩ breaker in the ${version} Epic 25 fixture`);
}

async function paragraphsOf(version: string): Promise<string[]> {
  const layout = layoutSpec(layoutLockEpic25Snapshot(version), { revisionNumber: 1, issuedAt: LAYOUT_LOCK_ISSUED_AT });
  return extractStructure(await buildDocx(layout, { tocPages: placeholderPages(layout) })).paragraphs;
}

describe('25.8-INT the note line of a v15 second visit names the contact rise at the limit', () => {
  it('v15: each pole restricted, and the DOCX prints the note line naming the three rises "no limite de 50 %"', async () => {
    const { cells, note } = riseOf('v15');
    expect(cells.map((cell) => cell.verdict)).toEqual(['restricted', 'restricted', 'restricted']);
    expect(note).toMatch(/^Em relação à manutenção anterior: T1-T2, alta de 50 % sobre 30 µΩ da manutenção anterior, rev\. 1 de \d\d\/\d\d\/\d{4}, no limite de 50 %; T3-T4, .+; T5-T6, .+, no limite de 50 %\.$/u);
    const paragraphs = await paragraphsOf('v15');
    expect(paragraphs).toContain(note);
  }, 120_000);

  it('v14: the same rise stays within and its DOCX prints no note line naming it', async () => {
    const { cells, note } = riseOf('v14');
    expect(cells.map((cell) => cell.verdict)).toEqual(['within', 'within', 'within']);
    expect(note).toBeNull();
    const paragraphs = await paragraphsOf('v14');
    expect(paragraphs.filter((text) => text.startsWith(NOTE)).some((text) => text.includes('sobre 30 µΩ'))).toBe(false);
  }, 120_000);
});
