import { describe, expect, it } from 'vitest';
import { makeOp } from '../ops/op.ts';
import { sortByOrderKey } from '../ops/order-key.ts';
import { replay } from '../ops/replay.ts';
import { creationPosition, creationSectionNumbers } from '../relatorio/creation-order.ts';
import { instantiateTemplate, isRelatorioSectionType } from '../relatorio/instantiate.ts';
import { isSectionBlockType } from '../schemas/block-config.ts';
import type { TemplateRow } from '../schemas/entities.ts';
import { buildSnapshot } from '../schemas/snapshot.ts';
import { EMPTY_DEFINITION_CONTEXT } from '../seed/definitions.ts';
import { standardTemplate } from '../seed/template.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { composerView } from './compose.ts';

/*
 * 27.5-UNIT (batch e27a, Story 27.5, F9 of the 2026-11-21 pass): the composer numbers each section where a
 * relatório created from the template places it (the creation sort of `instantiate`, read from one module),
 * over the standard template, one missing section 2, one with a duplicated section and one reordered.
 */

const TEMPLATE_ID = '019966b0-0e27-7205-8000-000000000001';

/** The section block types of a relatório created from `template`, in the order its blocks are created. */
function createdSectionTypes(template: TemplateRow): string[] {
  const { relatorioId, drafts } = instantiateTemplate(
    template,
    { id: TEST_PROJECT },
    { service_start: '2026-11-20', service_end: '2026-11-21', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
    { newId: idSequence('019966b0-0e27-7206-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0e27-7207-8000-'), now: T0 }), seq: i + 1 }));
  const blocks = buildSnapshot(replay(ops), relatorioId).blocks.filter((block) => isRelatorioSectionType(block.block_type));
  return sortByOrderKey(blocks).map((block) => block.block_type);
}

/** For each template section, its 1-based place among the created ones (the k-th of a type lands as the k-th of it). */
function instantiatedNumbers(template: TemplateRow): { numbers: number[]; generated: Record<'section_7' | 'section_9', number> } {
  const created = createdSectionTypes(template);
  const types = template.blocks.filter((block) => isSectionBlockType(block.block_type)).map((block) => block.block_type);
  const placeOf = (type: string, occurrence: number) => created.map((t, i) => [t, i] as const).filter(([t]) => t === type)[occurrence]![1] + 1;
  const numbers = types.map((type, index) => placeOf(type, types.slice(0, index).filter((t) => t === type).length));
  return { numbers, generated: { section_7: placeOf('section_7', 0), section_9: placeOf('section_9', 0) } };
}

const standard = () => standardTemplate({ id: TEMPLATE_ID });
const withBlocks = (template: TemplateRow, blocks: TemplateRow['blocks']): TemplateRow => ({ ...template, blocks });

describe('27.5-UNIT the composer numbers a section as the relatório created from the template will', () => {
  it('the standard template: 1 to 6, Pontos de atenção 9, 10 and 11; the automatic 7 and 8', () => {
    const view = composerView(standard());
    expect(view.sections.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6, 9, 10, 11]);
    expect(view.generatedNumbers).toEqual({ section_7: 7, section_9: 8 });
    expect({ numbers: view.sections.map((s) => s.number), generated: view.generatedNumbers }).toEqual(instantiatedNumbers(standard()));
  });

  it('a template missing section 2: every later number moves up one, as in the relatório', () => {
    const template = withBlocks(standard(), standard().blocks.filter((block) => block.block_type !== 'section_2'));
    const view = composerView(template);
    expect(view.sections.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 8, 9, 10]);
    expect(view.generatedNumbers).toEqual({ section_7: 6, section_9: 7 });
    expect({ numbers: view.sections.map((s) => s.number), generated: view.generatedNumbers }).toEqual(instantiatedNumbers(template));
  });

  it('a duplicated section: the two keep the template order and take consecutive numbers', () => {
    const base = standard();
    const at = base.blocks.findIndex((block) => block.block_type === 'section_3');
    const template = withBlocks(base, [...base.blocks.slice(0, at + 1), { ...base.blocks[at]! }, ...base.blocks.slice(at + 1)]);
    const view = composerView(template);
    expect(view.sections.map((s) => [s.block_type, s.number])).toEqual([
      ['section_1', 1],
      ['section_2', 2],
      ['section_3', 3],
      ['section_3', 4],
      ['section_4', 5],
      ['section_5', 6],
      ['section_6', 7],
      ['section_8', 10],
      ['section_10', 11],
      ['section_11', 12],
    ]);
    expect({ numbers: view.sections.map((s) => s.number), generated: view.generatedNumbers }).toEqual(instantiatedNumbers(template));
  });

  it('a reordered template: each number is where the section lands, which the creation sort fixes by type', () => {
    const base = standard();
    const sections = base.blocks.filter((block) => isSectionBlockType(block.block_type));
    const others = base.blocks.filter((block) => !isSectionBlockType(block.block_type));
    const template = withBlocks(base, [...others, ...[...sections].reverse()]);
    const view = composerView(template);
    expect(view.sections.map((s) => s.number)).toEqual([11, 10, 9, 6, 5, 4, 3, 2, 1]);
    expect({ numbers: view.sections.map((s) => s.number), generated: view.generatedNumbers }).toEqual(instantiatedNumbers(template));
  });

  it('creationSectionNumbers with no section: the two automatic ones are 1 and 2; creationPosition swaps 8 and 9 only', () => {
    expect(creationSectionNumbers([])).toEqual({ numbers: [], generated: { section_7: 1, section_9: 2 } });
    expect([1, 7, 8, 9, 10].map(creationPosition)).toEqual([1, 7, 9, 8, 10]);
  });
});
