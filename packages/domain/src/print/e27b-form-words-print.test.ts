import { describe, expect, it } from 'vitest';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import { instantiateTemplate } from '../relatorio/instantiate.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { EMPTY_DEFINITION_CONTEXT } from '../seed/definitions.ts';
import { standardTemplate } from '../seed/template.ts';
import type { TemplateRow } from '../schemas/entities.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { section9Layout, type PrintSheet } from './section-9.ts';

/*
 * 27.8-UNIT (batch e27b, Story 27.8, F30 and F35; decision 2 of 2026-11-21): what section 9 prints of a v17 relatório
 * made from the standard template built after this story, beside a v16 relatório made from a template stored before it.
 * The v17 one reads "ITEM", "PARA-RAIOS" and "1º Subsolo"; the v16 one keeps "ÍTEM", "PARA-RAIO" and "1° Subsolo"; both
 * read the group title "TPs e TCs dos Cubículos de MT", which is code and reaches every new revision.
 */

/** The standard template a company stored before Story 27.8: its second local still "1° Subsolo". */
function storedBefore(seedVersion: string): TemplateRow {
  const built = standardTemplate({ id: '019966b0-0e28-7000-8000-000000000001', seedVersion });
  return { ...built, skeleton: built.skeleton.map((node) => (node.ref === 'subsolo-1' ? { ...node, name: '1° Subsolo' } : node)) };
}

function relatorioFrom(template: TemplateRow): RelatorioSnapshot {
  const { relatorioId, drafts } = instantiateTemplate(
    template,
    { id: TEST_PROJECT },
    { service_start: '2026-11-21', service_end: '2026-11-22', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
    { newId: idSequence('019966b0-0e28-7001-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((draft, i) => ({ ...makeOp({ ...draft, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0e28-7002-8000-'), now: T0 }), seq: i + 1 }));
  return buildSnapshot(replay(ops), relatorioId);
}

function printed(snapshot: RelatorioSnapshot) {
  const layout = section9Layout(snapshot, 9, 'RELATÓRIOS DOS ENSAIOS')!;
  const sheets = layout.subsections.flatMap((subsection) => subsection.sheets);
  const arrester = snapshot.blocks.find((block) => block.block_type === 'para_raio' && block.removed_at === null)!;
  const sheet = sheets.find((one) => one.blockId === arrester.id)!;
  return { headings: layout.subsections.map((subsection) => subsection.heading), sheet, checklistHeader: checklistHeaderOf(sheet) };
}

/** The header row of a sheet's VERIFICAÇÕES GERAIS table. */
function checklistHeaderOf(sheet: PrintSheet): string[] {
  const table = sheet.parts.find((part) => part.kind === 'table' && part.table.rows[0]?.cells[0]?.text === 'VERIFICAÇÕES GERAIS');
  if (table === undefined || table.kind !== 'table') throw new Error('the sheet prints no VERIFICAÇÕES GERAIS');
  return table.table.rows[1]!.cells.map((cell) => cell.text);
}

describe('27.8-UNIT section 9 of a v17 relatório prints the form\'s words; a v16 one keeps its own', () => {
  it('v17 from the standard template built after Story 27.8: "ITEM", "PARA-RAIOS", "1º Subsolo", "TPs e TCs"', () => {
    const v17 = printed(relatorioFrom(standardTemplate({ id: '019966b0-0e28-7000-8000-000000000002', seedVersion: 'v17' })));
    expect(v17.checklistHeader).toEqual(['ITEM', 'C', 'NC', 'NA', 'OBSERVAÇÕES']);
    expect(v17.sheet.title).toMatch(/^PARA-RAIOS /);
    expect(v17.headings).toContain('9.4 TPs e TCs dos Cubículos de MT do 1º Subsolo');
    expect(v17.headings).toContain('9.11 TPs e TCs dos Cubículos de MT dos Geradores');
    expect(v17.headings.some((heading) => heading.includes('1° Subsolo'))).toBe(false);
  });

  it('v16 from a template stored before it: "ÍTEM", "PARA-RAIO", "1° Subsolo", and the group title "TPs e TCs"', () => {
    const v16 = printed(relatorioFrom(storedBefore('v16')));
    expect(v16.checklistHeader).toEqual(['ÍTEM', 'C', 'NC', 'NA', 'OBSERVAÇÕES']);
    expect(v16.sheet.title).toMatch(/^PARA-RAIO (?!S)/);
    expect(v16.headings).toContain('9.4 TPs e TCs dos Cubículos de MT do 1° Subsolo');
    expect(v16.headings.some((heading) => heading.includes("TP's"))).toBe(false);
  });

  it('nothing else of section 9 differs: the v16 headings in v17\'s words are the v17 headings', () => {
    const v17 = printed(relatorioFrom(standardTemplate({ id: '019966b0-0e28-7000-8000-000000000002', seedVersion: 'v17' })));
    const v16 = printed(relatorioFrom(storedBefore('v16')));
    expect(v16.headings.map((heading) => heading.replace('1° Subsolo', '1º Subsolo'))).toEqual(v17.headings);
  });
});
