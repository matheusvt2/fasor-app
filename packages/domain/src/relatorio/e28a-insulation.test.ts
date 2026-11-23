import { describe, expect, it } from 'vitest';
import { layoutLockSnapshot } from '../../fixtures/layout-lock/op-log.ts';
import { ocrReadResultSchema, structuringOutputSchema, type StructuringOutput } from '../contract/ocr.ts';
import { section9Layout, type PrintTable } from '../print/section-9.ts';
import { buildReadingSuggestions, type BuildReadingSuggestionsInput } from '../reading/build.ts';
import type { EquipmentBlockType } from '../schemas/block-config.ts';
import type { BlockRow, Cell, EquipmentRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { EMPTY_DEFINITION_CONTEXT, getDefinition } from '../seed/definitions.ts';
import type { BlockDefinition } from '../seed/schema.ts';
import { TEST_PROJECT, TEST_RELATORIO } from '../test-support.ts';
import { removeDraftEntry } from '../types/draft-edit.ts';
import type { CompanyTypeDefinition } from '../types/definition.ts';
import { duplicateSeededType } from '../types/duplicate.ts';
import { validateTypeDraft } from '../types/validate.ts';
import { testApplicability } from './applicability.ts';
import { drySubtypeOfInsulation, isDryBlock, isNameplateFieldExcused, nameplateMissingKeys } from './dry-insulation.ts';
import { impliedNameplateValue, lastNameplateCopy, nameplateCopyFields, nameplateScreenOrder } from './nameplate-copy.ts';
import { dryFieldExcusedReason, isFieldHidden, isOilFieldExcused, isOilUnit, oilCrossingPuts, oilDerivedNaKeys, oilFieldExcusedReason } from './oil-rule.ts';
import { mediumOf } from './temperature-correction.ts';
import { newEquipmentBlock } from './tree.ts';

/*
 * Batch e28a, Story 28.3 (B-4, the oil half of Story 25.19, with Bruno's Q-1 and Matheus's Q-2 and his decision on the
 * frames of 2026-11-23): on seed v18 the transformer's TIPO DE ISOLAÇÃO is "A SECO" or "A ÓLEO" (EPÓXI an alias of the
 * first), CONSTRUÇÃO joins its plate, NATUREZA DO LÍQUIDO and TIPO (ANP) are not drawn on a dry unit, and the TP and the
 * TC gain "ÓLEO VEGETAL". One test per reader of the oil option (28.3-UNIT-002 to -008), each over a dry, an "A ÓLEO"
 * and an "ÓLEO VEGETAL" unit, each giving on v18 what v17 gives for the same unit. Every value is invented.
 */

const id = (n: number) => `019966b0-0283-7000-8000-${n.toString(16).padStart(12, '0')}`;
let opCounter = 0;
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: id(90_000 + ++opCounter) });

function sheet(type: EquipmentBlockType, seedVersion: string): BlockRow {
  return newEquipmentBlock({
    definitions: EMPTY_DEFINITION_CONTEXT,
    blockId: id(1),
    equipmentId: id(2),
    relatorioId: TEST_RELATORIO,
    projectId: TEST_PROJECT,
    locationId: id(4),
    type,
    tag: 'T1',
    seedVersion,
    orderKey: 'a0',
  }).block;
}

function plate(block: BlockRow, values: Record<string, unknown>): BlockRow {
  const next = structuredClone(block);
  for (const [key, value] of Object.entries(values)) next.sheet.nameplate[key] = cell(value);
  return next;
}

const definitionOf = (block: Pick<BlockRow, 'seed_version' | 'block_type'>): BlockDefinition => getDefinition(block.seed_version, 'cabine_primaria', block.block_type);
const ctx = EMPTY_DEFINITION_CONTEXT;

/** The same unit on v17 and on v18: v17's spelling of its insulation and v18's. */
const PAIRS = [
  { name: 'a dry transformer', type: 'transformador_forca', v17: 'A SECO', v18: 'A SECO' },
  { name: 'an epoxy transformer', type: 'transformador_forca', v17: 'EPÓXI', v18: 'A SECO' },
  { name: 'an oil transformer', type: 'transformador_forca', v17: 'ÓLEO ISOLANTE', v18: 'A ÓLEO' },
  { name: 'a mineral oil TP', type: 'tp', v17: 'ÓLEO MINERAL', v18: 'ÓLEO MINERAL' },
  { name: 'a mineral oil TC', type: 'tc', v17: 'ÓLEO MINERAL', v18: 'ÓLEO MINERAL' },
  { name: 'a dry TP', type: 'tp', v17: 'A SECO', v18: 'A SECO' },
] as const;

/** A unit's v18 "ÓLEO VEGETAL" and the v17 "ÓLEO MINERAL" it reads as. */
const VEGETAL = (['tp', 'tc'] as const).map((type) => ({ type, v17: 'ÓLEO MINERAL', v18: 'ÓLEO VEGETAL' }));

describe('28.3-UNIT-002 the oil rule (`oilStateOf`, `oilDerivedNaKeys`): a v18 unit reads as the v17 one', () => {
  it.each(PAIRS)('$name: the same oil state and the same derived N.A. items', ({ type, v17, v18 }) => {
    const before = plate(sheet(type, 'v17'), { tipo_de_isolacao: v17 });
    const after = plate(sheet(type, 'v18'), { tipo_de_isolacao: v18 });
    expect(isOilUnit(after, ctx)).toBe(isOilUnit(before, ctx));
    expect([...oilDerivedNaKeys(after, ctx)]).toEqual([...oilDerivedNaKeys(before, ctx)]);
  });

  it.each(VEGETAL)('a $type "ÓLEO VEGETAL" is an oil unit, its oil item asked, as a v17 ÓLEO MINERAL one', ({ type, v17, v18 }) => {
    const before = plate(sheet(type, 'v17'), { tipo_de_isolacao: v17 });
    const after = plate(sheet(type, 'v18'), { tipo_de_isolacao: v18 });
    expect(isOilUnit(after, ctx)).toBe(true);
    expect(isOilUnit(before, ctx)).toBe(true);
    expect([...oilDerivedNaKeys(after, ctx)]).toEqual([...oilDerivedNaKeys(before, ctx)]);
    // A dry TP shows its oil item NA, on both seeds.
    expect([...oilDerivedNaKeys(plate(sheet(type, 'v18'), { tipo_de_isolacao: 'EPÓXI' }), ctx)]).toEqual(definitionOf(after).oil_rule!.items);
  });

  it('a crossing on a v18 transformer clears what a v17 one clears, CONSTRUÇÃO with the dry fields', () => {
    const v17 = plate(sheet('transformador_forca', 'v17'), { tipo_de_isolacao: 'A SECO', classe_termica: 'F (155)' });
    const v18 = plate(sheet('transformador_forca', 'v18'), { tipo_de_isolacao: 'A SECO', classe_termica: 'F (155)', construcao: 'IMPREGNADO A VÁCUO (VPI)' });
    const snapshotOf = (block: BlockRow) => ({ blocks: [block], files: [], equipment_types: [] });
    const toOil17 = oilCrossingPuts(snapshotOf(v17), v17.id, 'tipo_de_isolacao', 'ÓLEO ISOLANTE').map((put) => put.path);
    const toOil18 = oilCrossingPuts(snapshotOf(v18), v18.id, 'tipo_de_isolacao', 'A ÓLEO').map((put) => put.path);
    expect(toOil18).toEqual([...toOil17, `sheet/${v18.id}/nameplate/construcao`]);
  });
});

describe('28.3-UNIT-003 the medium of the correction to 20 °C (`mediumOf`): a v18 unit takes the v17 column', () => {
  it.each(PAIRS)('$name', ({ type, v17, v18 }) => {
    const before = plate(sheet(type, 'v17'), { tipo_de_isolacao: v17 });
    const after = plate(sheet(type, 'v18'), { tipo_de_isolacao: v18 });
    expect(mediumOf(definitionOf(after), after)).toBe(mediumOf(definitionOf(before), before));
  });

  it.each(VEGETAL)('a $type "ÓLEO VEGETAL" takes the oil column, as ÓLEO MINERAL', ({ type, v18 }) => {
    const after = plate(sheet(type, 'v18'), { tipo_de_isolacao: v18 });
    expect(mediumOf(definitionOf(after), after)).toBe('oil');
  });

  it('a stored v17 spelling on a v18 transformer reads by its alias: ÓLEO ISOLANTE as oil, EPÓXI as dry', () => {
    expect(mediumOf(definitionOf(sheet('transformador_forca', 'v18')), plate(sheet('transformador_forca', 'v18'), { tipo_de_isolacao: 'ÓLEO ISOLANTE' }))).toBe('oil');
    expect(mediumOf(definitionOf(sheet('transformador_forca', 'v18')), plate(sheet('transformador_forca', 'v18'), { tipo_de_isolacao: 'EPÓXI' }))).toBe('dry');
  });
});

describe('28.3-UNIT-004 "Copiar da última visita" and "Igual à" (`selectOptionFor`, `impliedNameplateValue`)', () => {
  const v18 = definitionOf(sheet('transformador_forca', 'v18'));
  const lastVisit = (fields: Record<string, unknown>): Pick<EquipmentRow, 'last_nameplate'> =>
    ({ last_nameplate: { relatorio_id: id(50), revision_number: 1, issued_at: '2026-11-20T12:00:00.000Z', seed_version: 'v17', block_type: 'transformador_forca', fields } }) as unknown as Pick<EquipmentRow, 'last_nameplate'>;

  it('a v17 visit that stored ÓLEO ISOLANTE and a liquid: TIPO DE ISOLAÇÃO "A ÓLEO", NATUREZA DO LÍQUIDO kept, no CONSTRUÇÃO', () => {
    const copied = lastNameplateCopy(lastVisit({ tipo_de_isolacao: 'ÓLEO ISOLANTE', natureza_liquido: 'ÉSTER NATURAL (VEGETAL)', classe_termica: 'F (155)' }), v18);
    expect(copied).toEqual([
      { fieldKey: 'tipo_de_isolacao', value: 'A ÓLEO' },
      { fieldKey: 'natureza_liquido', value: 'ÉSTER NATURAL (VEGETAL)' },
      { fieldKey: 'classe_termica', value: 'F (155)' },
    ]);
  });

  it('a v17 visit that stored EPÓXI: "A SECO" and CONSTRUÇÃO "ENCAPSULADO EM RESINA EPÓXI", in the plate\'s order', () => {
    expect(lastNameplateCopy(lastVisit({ tipo_de_isolacao: 'EPÓXI', classe_termica: 'F (155)' }), v18)).toEqual([
      { fieldKey: 'tipo_de_isolacao', value: 'A SECO' },
      { fieldKey: 'classe_termica', value: 'F (155)' },
      { fieldKey: 'construcao', value: 'ENCAPSULADO EM RESINA EPÓXI' },
    ]);
    // "Á SECO" says nothing of the construction; a CONSTRUÇÃO the source holds wins.
    expect(lastNameplateCopy(lastVisit({ tipo_de_isolacao: 'Á SECO' }), v18)).toEqual([{ fieldKey: 'tipo_de_isolacao', value: 'A SECO' }]);
    expect(lastNameplateCopy(lastVisit({ tipo_de_isolacao: 'EPÓXI', construcao: 'IMPREGNADO A VÁCUO (VPI)' }), v18)).toEqual([
      { fieldKey: 'tipo_de_isolacao', value: 'A SECO' },
      { fieldKey: 'construcao', value: 'IMPREGNADO A VÁCUO (VPI)' },
    ]);
  });

  it('"Igual à" from a v17 sheet of the same relatório reads the same way; a v17 target copies as before', () => {
    const source = plate(sheet('transformador_forca', 'v17'), { tipo_de_isolacao: 'EPÓXI', fabricacao: 'Fabricante X' });
    expect(nameplateCopyFields(source, v18)).toEqual([
      { fieldKey: 'fabricacao', value: 'Fabricante X' },
      { fieldKey: 'tipo_de_isolacao', value: 'A SECO' },
      { fieldKey: 'construcao', value: 'ENCAPSULADO EM RESINA EPÓXI' },
    ]);
    const v17 = definitionOf(sheet('transformador_forca', 'v17'));
    expect(nameplateCopyFields(source, v17)).toEqual([
      { fieldKey: 'fabricacao', value: 'Fabricante X' },
      { fieldKey: 'tipo_de_isolacao', value: 'EPÓXI' },
    ]);
    expect(lastNameplateCopy(lastVisit({ tipo_de_isolacao: 'ÓLEO ISOLANTE' }), v17)).toEqual([{ fieldKey: 'tipo_de_isolacao', value: 'ÓLEO ISOLANTE' }]);
  });

  it('the implied value reads the spelling ignoring case and accents, and only on a field that has the key', () => {
    const construcao = v18.nameplate.find((field) => field.key === 'construcao')!;
    expect(impliedNameplateValue(construcao, () => 'epoxi')).toBe('ENCAPSULADO EM RESINA EPÓXI');
    expect(impliedNameplateValue(construcao, () => 'A SECO')).toBeNull();
    expect(impliedNameplateValue(v18.nameplate.find((field) => field.key === 'classe_termica')!, () => 'EPÓXI')).toBeNull();
  });

  it.each(VEGETAL)('a $type copied from a v18 visit keeps ÓLEO VEGETAL; from a v17 one ÓLEO MINERAL', ({ type }) => {
    const definition = getDefinition('v18', 'cabine_primaria', type);
    const of = (value: string) => ({ last_nameplate: { relatorio_id: id(50), revision_number: 1, issued_at: '2026-11-20T12:00:00.000Z', seed_version: 'v18', block_type: type, fields: { tipo_de_isolacao: value } } }) as unknown as Pick<EquipmentRow, 'last_nameplate'>;
    expect(lastNameplateCopy(of('ÓLEO VEGETAL'), definition)).toEqual([{ fieldKey: 'tipo_de_isolacao', value: 'ÓLEO VEGETAL' }]);
    expect(lastNameplateCopy(of('ÓLEO MINERAL'), definition)).toEqual([{ fieldKey: 'tipo_de_isolacao', value: 'ÓLEO MINERAL' }]);
  });
});

describe('28.3-UNIT-005 the plate reading (`buildReadingSuggestions`): the oil class composes "A ÓLEO" on v18', () => {
  const box = (n: number): [number, number, number, number] => [10 * n, 10, 10 * n + 8, 20];
  const ocrOf = (words: string[]) =>
    ocrReadResultSchema.parse({ image: { width: 1600, height: 1100 }, tokens: words.map((text, i) => ({ id: `t${i}`, text, bbox: box(i), confidence: 0.99 })), preprocessing_applied: false });
  const values = (rows: StructuringOutput['values']): StructuringOutput => structuringOutputSchema.parse({ values: rows });
  const value = (key: string, v: unknown, ids: string[]) => ({ key, value: v, ocr_token_ids: ids, confidence: 0.9 }) as StructuringOutput['values'][number];
  let n = 100;
  const input = (type: string, seedVersion: string, words: string[], output: StructuringOutput): BuildReadingSuggestionsInput => ({
    relatorioId: id(1),
    photoId: id(2),
    runId: id(3),
    block: { id: id(4), seed_version: seedVersion, block_type: type, sheet: { nameplate: {}, checklist: {}, test: {} } as unknown as BlockRow['sheet'] },
    ocr: ocrOf(words),
    image: { width: 1600, height: 1100 },
    output,
    promptVersion: 'fake-1',
    registry: { manufacturers: [], voltageClasses: [] },
    newId: () => id(n++),
  });
  const rowOf = (rows: { target_path: string }[], key: string) => rows.find((row) => row.target_path.endsWith(`/${key}`));
  const words = ['TIPO', 'TRICAST', 'Tipo', 'óleo', 'isolante', 'B'];
  const oilWords = ['t2', 't3', 't4', 't5'];

  it('"óleo isolante" and class B on a v18 transformer: TIPO DE ISOLAÇÃO "A ÓLEO" and NATUREZA DO LÍQUIDO MINERAL, composed to verify; v17 composes ÓLEO ISOLANTE', () => {
    const answer = values([value('tipo', 'TRICAST', ['t1']), value('tipo_anp', 'B', oilWords)]);
    const v18 = buildReadingSuggestions(input('transformador_forca', 'v18', words, answer));
    expect(v18.dropped).toEqual([]);
    expect(rowOf(v18.rows, 'tipo_de_isolacao')).toMatchObject({ value: 'A ÓLEO', trust: 'verify', source: { ocr_token_ids: oilWords } });
    expect(rowOf(v18.rows, 'natureza_liquido')).toMatchObject({ value: 'MINERAL', trust: 'verify' });
    expect(rowOf(buildReadingSuggestions(input('transformador_forca', 'v17', words, answer)).rows, 'tipo_de_isolacao')).toMatchObject({ value: 'ÓLEO ISOLANTE' });
  });

  it('an older spelling the model reads lands on its v18 option: ÓLEO ISOLANTE as "A ÓLEO", EPÓXI as "A SECO"; a CONSTRUÇÃO read stands', () => {
    expect(rowOf(buildReadingSuggestions(input('transformador_forca', 'v18', ['ÓLEO', 'ISOLANTE'], values([value('tipo_de_isolacao', 'ÓLEO ISOLANTE', ['t0', 't1'])]))).rows, 'tipo_de_isolacao')).toMatchObject({ value: 'A ÓLEO' });
    const dry = buildReadingSuggestions(input('transformador_forca', 'v18', ['EPÓXI', 'VPI'], values([value('tipo_de_isolacao', 'EPÓXI', ['t0']), value('construcao', 'IMPREGNADO A VÁCUO (VPI)', ['t1'])])));
    expect(rowOf(dry.rows, 'tipo_de_isolacao')).toMatchObject({ value: 'A SECO' });
    expect(rowOf(dry.rows, 'construcao')).toMatchObject({ value: 'IMPREGNADO A VÁCUO (VPI)' });
  });

  it.each(VEGETAL)('a v18 $type reads ÓLEO VEGETAL as its option; a v17 one drops it', ({ type }) => {
    const read = values([value('tipo_de_isolacao', 'ÓLEO VEGETAL', ['t0', 't1'])]);
    expect(rowOf(buildReadingSuggestions(input(type, 'v18', ['ÓLEO', 'VEGETAL'], read)).rows, 'tipo_de_isolacao')).toMatchObject({ value: 'ÓLEO VEGETAL' });
    expect(buildReadingSuggestions(input(type, 'v17', ['ÓLEO', 'VEGETAL'], read)).dropped).toEqual([{ key: 'tipo_de_isolacao', reason: 'invalid_shape' }]);
  });
});

describe('28.3-UNIT-006 the dry rules and the fields the kind does not ask (`dry-insulation.ts`, `isFieldHidden`)', () => {
  const v18 = (values: Record<string, unknown>) => plate(sheet('transformador_forca', 'v18'), values);

  it('"A SECO": dry, NATUREZA DO LÍQUIDO and TIPO (ANP) not drawn, never missing, printed "-"; CONSTRUÇÃO drawn and optional', () => {
    const block = v18({ tipo_de_isolacao: 'A SECO' });
    expect(isDryBlock(block, ctx)).toBe(true);
    expect(drySubtypeOfInsulation(definitionOf(block), 'A SECO')?.key).toBe('a_seco');
    // The subtypes are v17's: a stored EPÓXI still names the epoxy subtype, a dry one.
    expect(drySubtypeOfInsulation(definitionOf(block), 'EPÓXI')?.key).toBe('epoxi');
    for (const key of ['natureza_liquido', 'tipo_anp']) {
      expect(isFieldHidden(block, key, ctx), key).toBe(true);
      expect(isOilFieldExcused(block, key, ctx), key).toBe(true);
      expect(isNameplateFieldExcused(block, key, ctx), key).toBe(true);
    }
    expect(isFieldHidden(block, 'construcao', ctx)).toBe(false);
    expect(isNameplateFieldExcused(block, 'construcao', ctx)).toBe(false);
    expect(isNameplateFieldExcused(block, 'vol_oleo', ctx)).toBe(true);
    expect(oilFieldExcusedReason(block, 'vol_oleo', ctx)).toBe('Não se aplica: Tipo de isolação é A SECO.');
    const missing = nameplateMissingKeys({ blocks: [block], equipment_types: [] }, block.id);
    for (const key of ['natureza_liquido', 'tipo_anp', 'vol_oleo', 'construcao']) expect(missing.has(key), key).toBe(false);
  });

  it('"A ÓLEO": NATUREZA DO LÍQUIDO drawn, TIPO (ANP) by the liquid as on v17, CONSTRUÇÃO not drawn and printed "-"', () => {
    const mineral = v18({ tipo_de_isolacao: 'A ÓLEO', natureza_liquido: 'MINERAL', construcao: 'IMPREGNADO A VÁCUO (VPI)' });
    expect(isFieldHidden(mineral, 'natureza_liquido', ctx)).toBe(false);
    expect(isFieldHidden(mineral, 'tipo_anp', ctx)).toBe(false);
    expect(isFieldHidden(mineral, 'construcao', ctx)).toBe(true);
    expect(isOilFieldExcused(mineral, 'construcao', ctx)).toBe(true);
    expect(dryFieldExcusedReason(mineral, 'classe_termica', ctx)).toBe('Não se aplica: Tipo de isolação é A ÓLEO.');
    const vegetal = v18({ tipo_de_isolacao: 'A ÓLEO', natureza_liquido: 'ÉSTER NATURAL (VEGETAL)' });
    expect(isFieldHidden(vegetal, 'tipo_anp', ctx)).toBe(true);
    // v17 with the same liquid hides TIPO (ANP) the same way and has no CONSTRUÇÃO.
    const v17 = plate(sheet('transformador_forca', 'v17'), { tipo_de_isolacao: 'ÓLEO ISOLANTE', natureza_liquido: 'ÉSTER NATURAL (VEGETAL)' });
    expect(isFieldHidden(v17, 'tipo_anp', ctx)).toBe(true);
    expect(isFieldHidden(v17, 'natureza_liquido', ctx)).toBe(false);
  });

  it('an empty TIPO DE ISOLAÇÃO draws NATUREZA DO LÍQUIDO and CONSTRUÇÃO, as v17 draws its liquid; v17 never hides NATUREZA DO LÍQUIDO', () => {
    const empty = v18({});
    expect(isFieldHidden(empty, 'natureza_liquido', ctx)).toBe(false);
    expect(isFieldHidden(empty, 'construcao', ctx)).toBe(false);
    for (const value of ['A SECO', 'EPÓXI', 'Á SECO']) expect(isFieldHidden(plate(sheet('transformador_forca', 'v17'), { tipo_de_isolacao: value }), 'natureza_liquido', ctx), value).toBe(false);
  });

  it('on screen CONSTRUÇÃO sits right after TIPO DE ISOLAÇÃO; the plate (the print) keeps it last; v17 draws in its plate\'s order', () => {
    const nameplate = definitionOf(sheet('transformador_forca', 'v18')).nameplate;
    expect(nameplate.at(-1)!.key).toBe('construcao');
    const screen = nameplateScreenOrder(nameplate).map((field) => field.key);
    expect(screen.slice(screen.indexOf('tipo_de_isolacao'), screen.indexOf('tipo_de_isolacao') + 3)).toEqual(['tipo_de_isolacao', 'construcao', 'natureza_liquido']);
    expect([...screen].sort()).toEqual(nameplate.map((field) => field.key).sort());
    const v17 = definitionOf(sheet('transformador_forca', 'v17')).nameplate;
    expect(nameplateScreenOrder(v17)).toEqual(v17);
  });
});

describe('28.3-UNIT-007 the oil sampling (`testApplicability` on `coleta_oleo`): applies on "A ÓLEO" as on ÓLEO ISOLANTE', () => {
  it.each(PAIRS.filter((pair) => pair.type === 'transformador_forca'))('$name', ({ v17, v18 }) => {
    const before = plate(sheet('transformador_forca', 'v17'), { tipo_de_isolacao: v17 });
    const after = plate(sheet('transformador_forca', 'v18'), { tipo_de_isolacao: v18 });
    expect(testApplicability(after, definitionOf(after), 'coleta_oleo').state).toBe(testApplicability(before, definitionOf(before), 'coleta_oleo').state);
  });

  it('"A ÓLEO" with any liquid is met; "A SECO" is not', () => {
    const at = (values: Record<string, unknown>) => {
      const block = plate(sheet('transformador_forca', 'v18'), values);
      return testApplicability(block, definitionOf(block), 'coleta_oleo').state;
    };
    expect(at({ tipo_de_isolacao: 'A ÓLEO', natureza_liquido: 'SILICONE' })).toBe('met');
    expect(at({ tipo_de_isolacao: 'A SECO' })).toBe('na');
  });
});

describe('28.3-UNIT-008 the printed plate (DADOS DO EQUIPAMENTO): CONSTRUÇÃO in the empty last pair, no v17 row moves', () => {
  const printedPlate = (snapshot: RelatorioSnapshot, blockId: string): string[][] => {
    const printed = section9Layout(snapshot, 9, 'RESULTADOS')!.subsections.flatMap((subsection) => subsection.sheets).find((one) => one.blockId === blockId)!;
    const table = printed.parts.flatMap((part) => (part.kind === 'table' ? [part.table] : [])).find((one: PrintTable) => one.rows[0]!.cells[0]!.text === 'DADOS DO EQUIPAMENTO')!;
    return table.rows.slice(1).map((row) => row.cells.map((one) => one.text));
  };
  const transformerOf = (snapshot: RelatorioSnapshot) => snapshot.blocks.find((block) => block.block_type === 'transformador_forca' && block.removed_at === null)!;
  const withPlate = (version: string, values: Record<string, unknown>) => {
    const snapshot = structuredClone(layoutLockSnapshot(version));
    const block = transformerOf(snapshot);
    const next = plate(block, values);
    snapshot.blocks = snapshot.blocks.map((one) => (one.id === block.id ? next : one));
    return { snapshot, blockId: block.id };
  };

  it('a dry v18 unit prints NATUREZA DO LÍQUIDO and TIPO (ANP) "-" and its CONSTRUÇÃO after CLASSE TÉRMICA; every other pair is where v17 prints it', () => {
    const v17 = withPlate('v17', { tipo_de_isolacao: 'A SECO', classe_termica: 'F (155)' });
    const v18 = withPlate('v18', { tipo_de_isolacao: 'A SECO', classe_termica: 'F (155)', construcao: 'ENCAPSULADO EM RESINA EPÓXI' });
    const before = printedPlate(v17.snapshot, v17.blockId);
    const after = printedPlate(v18.snapshot, v18.blockId);
    expect(after.length).toBe(before.length);
    expect(after.slice(0, -1)).toEqual(before.slice(0, -1));
    expect(before.at(-1)!.slice(4)).toEqual(['', '']);
    expect(after.at(-1)).toEqual([...before.at(-1)!.slice(0, 4), 'CONSTRUÇÃO', 'ENCAPSULADO EM RESINA EPÓXI']);
    const cells = after.flat();
    expect(cells[cells.indexOf('TIPO DE ISOLAÇÃO') + 1]).toBe('A SECO');
    expect(cells[cells.indexOf('NATUREZA DO LÍQUIDO') + 1]).toBe('-');
    expect(cells[cells.indexOf('TIPO (ANP)') + 1]).toBe('-');
  });

  it('an oil v18 unit prints "A ÓLEO" and CONSTRUÇÃO "-" whatever is stored; a v17 one prints ÓLEO ISOLANTE', () => {
    const v18 = withPlate('v18', { tipo_de_isolacao: 'A ÓLEO', natureza_liquido: 'MINERAL', construcao: 'IMPREGNADO A VÁCUO (VPI)' });
    const cells = printedPlate(v18.snapshot, v18.blockId).flat();
    expect(cells[cells.indexOf('TIPO DE ISOLAÇÃO') + 1]).toBe('A ÓLEO');
    expect(cells[cells.indexOf('NATUREZA DO LÍQUIDO') + 1]).toBe('MINERAL');
    expect(cells.slice(-2)).toEqual(['CONSTRUÇÃO', '-']);
    const v17 = withPlate('v17', { tipo_de_isolacao: 'ÓLEO ISOLANTE', natureza_liquido: 'MINERAL' });
    const old = printedPlate(v17.snapshot, v17.blockId).flat();
    expect(old[old.indexOf('TIPO DE ISOLAÇÃO') + 1]).toBe('ÓLEO ISOLANTE');
    expect(old).not.toContain('CONSTRUÇÃO');
  });
});

describe('28.3-UNIT-009 a company copy of the v18 transformer carries CONSTRUÇÃO\'s keys and stays publishable', () => {
  const copy = () => duplicateSeededType('v18', 'transformador_forca').draft;
  const indexOf = (draft: CompanyTypeDefinition, key: string) => draft.nameplate.findIndex((field) => field.key === key);

  it('the copy publishes as it is, CONSTRUÇÃO with its keys and in the dry fields', () => {
    const draft = copy();
    expect(draft.nameplate.at(-1)).toMatchObject({ key: 'construcao', screen_after: 'tipo_de_isolacao', implied_by: { field: 'tipo_de_isolacao' } });
    expect(draft.oil_rule!.dry_fields).toEqual(['temperatura_enrolamento_c', 'classe_termica', 'construcao']);
    expect(validateTypeDraft(draft)).toEqual([]);
  });

  it('removing TIPO DE ISOLAÇÃO takes the oil rule and every key of CONSTRUÇÃO and NATUREZA DO LÍQUIDO naming it, still valid', () => {
    const draft = copy();
    const without = removeDraftEntry(draft, 'nameplate', indexOf(draft, 'tipo_de_isolacao')) as CompanyTypeDefinition;
    const construcao = without.nameplate.find((field) => field.key === 'construcao')!;
    expect('screen_after' in construcao || 'implied_by' in construcao || 'excused_unless' in construcao).toBe(false);
    expect('excused_unless' in without.nameplate.find((field) => field.key === 'natureza_liquido')!).toBe(false);
    expect(without.oil_rule).toBeUndefined();
    expect(validateTypeDraft(without)).toEqual([]);
  });
});
