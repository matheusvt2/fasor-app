import { describe, expect, it } from 'vitest';
import type { SkeletonNode, TemplateBlock } from '../schemas/block-config.ts';
import { templateRowSchema, type TemplateRow } from '../schemas/entities.ts';
import { defaultBlockConfig, standardTemplate, templateTotals } from '../seed/template.ts';
import {
  addCabine,
  addColuna,
  addSection,
  addSectionBelow,
  clampQuantity,
  composerView,
  duplicateSection,
  findComposerNode,
  moveNode,
  moveSection,
  parsePositionInput,
  parseQuantityInput,
  quantityAt,
  removeNode,
  removeSection,
  renameNode,
  setAgruparPorTipo,
  setQuantity,
  TemplateTargetGoneError,
  withoutOrphans,
} from './compose.ts';
import { emptyTemplate } from './list.ts';

const ID = '019966b0-0034-7000-8000-000000000001';
const standard = standardTemplate({ id: ID });

/** Deep-frozen, so a function that mutates its input throws in the test. */
function frozen<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) frozen(child);
  }
  return value;
}

const valid = (row: TemplateRow) => expect(templateRowSchema.safeParse(row).success).toBe(true);

/** An empty template with one cabine "c1" holding colunas "k1".."kN". */
function withColunas(n: number): TemplateRow {
  let skeleton = addCabine([], 'c1', 'Cabine 1');
  for (let i = 1; i <= n; i++) skeleton = addColuna(skeleton, 'c1', `k${i}`, `Coluna ${i}`);
  return { ...emptyTemplate(ID, 'v1'), skeleton };
}

const names = (skeleton: readonly SkeletonNode[]) => skeleton.map((n) => n.name);

describe('3.4-UNIT skeleton edits', () => {
  it('adds cabines at the end and colunas at the end of their own cabine, never mutating the input', () => {
    let skeleton = frozen(addCabine([], 'a', 'Cabine 1'));
    skeleton = frozen(addCabine(skeleton, 'b', 'Cabine 2'));
    skeleton = frozen(addColuna(skeleton, 'a', 'a1', 'Coluna 1'));
    skeleton = frozen(addColuna(skeleton, 'b', 'b1', 'Coluna 1'));
    skeleton = addColuna(skeleton, 'a', 'a2', 'Coluna 2');
    expect(skeleton.map((n) => n.ref)).toEqual(['a', 'a1', 'a2', 'b', 'b1']);
    expect(skeleton[0]).toEqual({ ref: 'a', kind: 'cabine', parent_ref: null, name: 'Cabine 1', agrupar_por_tipo: false });
    expect(skeleton[2]).toEqual({ ref: 'a2', kind: 'coluna', parent_ref: 'a', name: 'Coluna 2' });
    valid({ ...emptyTemplate(ID, 'v1'), skeleton });
  });

  it('refuses a duplicate ref and a coluna under anything but a cabine', () => {
    const skeleton = addColuna(addCabine([], 'a', 'A'), 'a', 'a1', 'Coluna 1');
    expect(() => addCabine(skeleton, 'a', 'Outra')).toThrow(/already has a node "a"/);
    expect(() => addColuna(skeleton, 'a1', 'x', 'X')).toThrow(/not a cabine/);
    expect(() => addColuna(skeleton, 'nowhere', 'x', 'X')).toThrow(TemplateTargetGoneError);
    expect(() => addColuna(skeleton, 'nowhere', 'x', 'X')).toThrow(/no node "nowhere"/);
    // A bug (a coluna named as a cabine) is a plain error, never "the target is gone".
    expect(() => addColuna(skeleton, 'a1', 'x', 'X')).not.toThrow(TemplateTargetGoneError);
  });

  it('renames a node and sets Agrupar por tipo on a cabine only', () => {
    const skeleton = frozen(withColunas(2).skeleton);
    expect(names(renameNode(skeleton, 'k2', 'Coluna 5'))).toEqual(['Cabine 1', 'Coluna 1', 'Coluna 5']);
    expect(setAgruparPorTipo(skeleton, 'c1', true)[0]).toMatchObject({ agrupar_por_tipo: true });
    expect(() => setAgruparPorTipo(skeleton, 'k1', true)).toThrow(/not a cabine/);
  });

  it('moves a coluna among its own cabine siblings only, clamped to the ends', () => {
    let skeleton = frozen(withColunas(3).skeleton);
    skeleton = addColuna(addCabine(skeleton, 'c2', 'Cabine 2'), 'c2', 'z1', 'Z');
    expect(names(moveNode(skeleton, 'k3', 0))).toEqual(['Cabine 1', 'Coluna 3', 'Coluna 1', 'Coluna 2', 'Cabine 2', 'Z']);
    expect(names(moveNode(skeleton, 'k1', 99))).toEqual(['Cabine 1', 'Coluna 2', 'Coluna 3', 'Coluna 1', 'Cabine 2', 'Z']);
    expect(names(moveNode(skeleton, 'k2', -4))).toEqual(['Cabine 1', 'Coluna 2', 'Coluna 1', 'Coluna 3', 'Cabine 2', 'Z']);
  });

  it('moves a cabine among the cabines, its colunas travelling with it', () => {
    const moved = moveNode(standard.skeleton, 'geradores', 0);
    expect(moved.filter((n) => n.kind === 'cabine').map((n) => n.name)).toEqual([
      'Geradores',
      'Cubículo Enel',
      '1° Subsolo',
      'Oxigênio',
      'Cobertura A',
      'Cobertura B',
    ]);
    const subsolo = moved.findIndex((n) => n.ref === 'subsolo-1');
    expect(moved.slice(subsolo + 1, subsolo + 18).every((n) => n.kind === 'coluna' && n.parent_ref === 'subsolo-1')).toBe(true);
    valid({ ...standard, skeleton: moved });
  });

  it('removes a coluna with its blocks, and a cabine with its colunas and every block on any of them', () => {
    const template = frozen(structuredClone(standard));
    const coluna = removeNode(template, 'subsolo-1/coluna-2');
    expect(coluna.skeleton).toHaveLength(standard.skeleton.length - 1);
    expect(coluna.blocks.some((b) => b.skeleton_location_ref === 'subsolo-1/coluna-2')).toBe(false);
    expect(templateTotals(coluna).chave_seccionadora).toBe(23);
    valid({ ...standard, ...coluna });

    const cabine = removeNode(template, 'subsolo-1');
    expect(cabine.skeleton.map((n) => n.ref)).toEqual(['enel', 'oxigenio', 'cobertura-a', 'cobertura-b', 'geradores']);
    expect(cabine.blocks.some((b) => b.skeleton_location_ref?.startsWith('subsolo-1'))).toBe(false);
    // Sections stay.
    expect(cabine.blocks.filter((b) => b.skeleton_location_ref === null)).toHaveLength(9);
    valid({ ...standard, ...cabine });
  });
});

describe('3.4-UNIT quantities per node', () => {
  it('counts every entry of a type at a node: the Enel para-raio entrada + saída is 2', () => {
    expect(quantityAt(standard, 'enel', 'para_raio')).toBe(2);
    expect(quantityAt(standard, 'subsolo-1/coluna-3', 'disjuntor_mt')).toBe(2);
    expect(quantityAt(standard, 'subsolo-1/coluna-9', 'disjuntor_mt')).toBe(0);
    expect(quantityAt(standard, 'nowhere', 'tp')).toBe(0);
  });

  it('"+" raises the last entry of the type at the node; "−" takes from the last entry backwards (Design Notes)', () => {
    const template = frozen(structuredClone(standard));
    const enelPr = (blocks: readonly TemplateBlock[]) =>
      blocks.filter((b) => b.skeleton_location_ref === 'enel' && b.block_type === 'para_raio').map((b) => [b.role, b.quantity]);
    expect(enelPr(template.blocks)).toEqual([
      ['entrada', 1],
      ['saida', 1],
    ]);
    const plus = setQuantity(template, 'enel', 'para_raio', 3);
    expect(enelPr(plus)).toEqual([
      ['entrada', 1],
      ['saida', 2],
    ]);
    const minusTwice = setQuantity({ ...template, blocks: plus }, 'enel', 'para_raio', 1);
    expect(enelPr(minusTwice)).toEqual([['entrada', 1]]);
    expect(enelPr(setQuantity({ ...template, blocks: minusTwice }, 'enel', 'para_raio', 0))).toEqual([]);
    valid({ ...standard, blocks: minusTwice });
  });

  it('a type new to the node gets one entry from defaultBlockConfig, after the node\'s other blocks', () => {
    const template = frozen(withColunas(2));
    let blocks = setQuantity(template, 'k1', 'chave_seccionadora', 1);
    blocks = setQuantity({ ...template, blocks }, 'k2', 'tp', 2);
    blocks = setQuantity({ ...template, blocks }, 'k1', 'disjuntor_mt', 1);
    expect(blocks.map((b) => [b.skeleton_location_ref, b.block_type, b.quantity])).toEqual([
      ['k1', 'chave_seccionadora', 1],
      ['k1', 'disjuntor_mt', 1],
      ['k2', 'tp', 2],
    ]);
    expect(blocks[0]).toEqual({ ...defaultBlockConfig('v1', 'chave_seccionadora'), quantity: 1, skeleton_location_ref: 'k1' });
    valid({ ...template, blocks });
  });

  it('clamps to 0..99, and zero removes the type from the node', () => {
    const template = withColunas(1);
    const blocks = setQuantity(template, 'k1', 'tc', 250);
    expect(quantityAt({ ...template, blocks }, 'k1', 'tc')).toBe(99);
    expect(setQuantity({ ...template, blocks }, 'k1', 'tc', 0)).toEqual([]);
    expect(setQuantity({ ...template, blocks }, 'k1', 'tc', -3)).toEqual([]);
    expect(() => setQuantity(template, 'nowhere', 'tc', 1)).toThrow(/no node/);
  });

  it('parses a typed quantity: digits clamp to 99, anything else is refused', () => {
    expect(parseQuantityInput('25')).toBe(25);
    expect(parseQuantityInput(' 7 ')).toBe(7);
    expect(parseQuantityInput('150')).toBe(99);
    expect(parseQuantityInput('0')).toBe(0);
    for (const bad of ['abc', '-3', '2,5', '2.5', '', '—']) expect(parseQuantityInput(bad)).toBeNull();
    expect(clampQuantity(Number.NaN)).toBe(0);
  });

  it('parses a typed position: 1-based digits to a 0-based index, clamped to the ends', () => {
    expect(parsePositionInput('3', 17)).toBe(2);
    expect(parsePositionInput('0', 17)).toBe(0);
    expect(parsePositionInput('40', 17)).toBe(16);
    for (const bad of ['', 'x', '-1', '1.5']) expect(parsePositionInput(bad, 17)).toBeNull();
    expect(parsePositionInput('1', 0)).toBeNull();
  });

  it('17 colunas with 1 seccionadora, 1 disjuntor, 1 TP and 1 TC each total 17 of each', () => {
    const template = withColunas(17);
    let blocks: TemplateBlock[] = [];
    for (let i = 1; i <= 17; i++) {
      for (const type of ['chave_seccionadora', 'disjuntor_mt', 'tp', 'tc'] as const) {
        blocks = setQuantity({ ...template, blocks }, `k${i}`, type, 1);
      }
    }
    expect(templateTotals({ ...template, blocks })).toEqual({
      cabos_entrada: 0,
      para_raio: 0,
      chave_seccionadora: 17,
      disjuntor_mt: 17,
      tp: 17,
      tc: 17,
      cabos_saida: 0,
      transformador_forca: 0,
    });
    valid({ ...template, blocks });
  });

  it('blocks placed directly on a cabine with no coluna count and show on the cabine', () => {
    const template = { ...emptyTemplate(ID, 'v1'), skeleton: addCabine([], 'c1', 'Cubículo Enel') };
    const blocks = setQuantity(template, 'c1', 'cabos_entrada', 1);
    const view = composerView({ ...template, blocks });
    expect(view.cabines[0]).toMatchObject({ blockCount: 1, totalBlockCount: 1, colunas: [] });
    expect(view.cabines[0]!.quantities.cabos_entrada).toBe(1);
    expect(templateTotals({ ...template, blocks }).cabos_entrada).toBe(1);
    expect(view.blockCount).toBe(1);
  });
});

describe('3.4-UNIT section blocks', () => {
  const types = (blocks: readonly TemplateBlock[]) => blocks.filter((b) => b.skeleton_location_ref === null).map((b) => b.block_type);

  it('appends, inserts below, moves, duplicates and removes among the sections only', () => {
    const template = frozen(structuredClone(standard));
    let blocks = addSection(template.blocks, 'section_2', 'v1');
    expect(types(blocks).at(-1)).toBe('section_2');
    // The equipment blocks stay after the sections, in their order.
    expect(blocks.slice(10)).toEqual(standard.blocks.slice(9));

    blocks = moveSection(template.blocks, 8, 0);
    expect(types(blocks)).toEqual(['section_11', 'section_1', 'section_2', 'section_3', 'section_4', 'section_5', 'section_6', 'section_8', 'section_10']);
    expect(blocks.slice(9)).toEqual(standard.blocks.slice(9));

    blocks = duplicateSection(template.blocks, 1);
    expect(types(blocks).slice(0, 4)).toEqual(['section_1', 'section_2', 'section_2', 'section_3']);

    blocks = addSectionBelow(template.blocks, 0, 'section_10', 'v1');
    expect(types(blocks).slice(0, 3)).toEqual(['section_1', 'section_10', 'section_2']);

    blocks = removeSection(template.blocks, 6);
    expect(types(blocks)).not.toContain('section_8');
    valid({ ...standard, blocks });

    expect(() => removeSection(template.blocks, 42)).toThrow(TemplateTargetGoneError);
    expect(() => removeSection(template.blocks, 42)).toThrow(/no section block at index 42/);
  });

  it('adds the first section to an empty composition', () => {
    expect(addSection([], 'section_1', 'v1')).toEqual([{ block_type: 'section_1', sub_blocks: {}, na_defaults: [], quantity: 1, skeleton_location_ref: null }]);
  });
});

describe('3.4-UNIT composerView', () => {
  it('lists the cabines, their colunas and the sections in order, with positions and quantities', () => {
    const view = composerView(standard);
    expect(view.cabineCount).toBe(6);
    expect(view.colunaCount).toBe(17);
    expect(view.blockCount).toBe(94);
    const subsolo = view.cabines[1]!;
    expect(subsolo).toMatchObject({ name: '1° Subsolo', position: 2, siblings: 6, agrupar_por_tipo: true });
    expect(subsolo.colunas).toHaveLength(17);
    expect(subsolo.colunas[2]).toMatchObject({ name: 'Coluna 3', position: 3, siblings: 17, blockCount: 7 });
    expect(subsolo.quantities).toMatchObject({ transformador_forca: 5, cabos_saida: 5 });
    expect(view.sections.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6, 8, 10, 11]);
    expect(view.sections[6]).toMatchObject({ index: 6, block_type: 'section_8', position: 7, siblings: 9 });
    expect(findComposerNode(view, 'subsolo-1/coluna-3')?.name).toBe('Coluna 3');
    expect(findComposerNode(view, 'nowhere')).toBeNull();
    expect(findComposerNode(view, null)).toBeNull();
  });

  it('ignores an orphan block, and the next blocks write drops it', () => {
    const orphan = { ...structuredClone(standard.blocks.find((b) => b.block_type === 'tp')!), skeleton_location_ref: 'gone' };
    const template = { ...standard, blocks: [...standard.blocks, orphan] };
    valid(template);
    expect(composerView(template).totals.tp).toBe(11);
    expect(withoutOrphans(template)).toEqual(standard.blocks);
    expect(setQuantity(template, 'enel', 'tp', 1)).toEqual(standard.blocks);
    expect(removeNode(template, 'geradores').blocks.some((b) => b.skeleton_location_ref === 'gone')).toBe(false);
  });
});
