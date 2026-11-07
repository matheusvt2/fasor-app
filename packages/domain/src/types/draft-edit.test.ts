import { describe, expect, it } from 'vitest';
import { definitionContext, SEED_VERSION } from '../seed/definitions.ts';
import { companyBlockType } from '../schemas/block-config.ts';
import type { EquipmentTypeRow, EquipmentTypeVersionRow } from '../schemas/entities.ts';
import { quantityLabel, totalsText } from '../templates/text.ts';
import { companyTypeDefinitionSchema, type CompanyTypeDefinition, type CompanyTypeDraft } from './definition.ts';
import {
  addDraftField,
  addDraftItem,
  addDraftMeasurementRow,
  addDraftTest,
  criterionUsedByText,
  fieldSummaryText,
  grammarTaken,
  itemSummaryText,
  moveDraftEntry,
  removeDraftEntry,
  removeDraftMeasurementRow,
  setDraftNoun,
  setDraftText,
  testSummaryText,
  uniqueKey,
  updateDraftCriterion,
  updateDraftField,
  updateDraftItem,
  updateDraftMeasurementRow,
  updateDraftTest,
} from './draft-edit.ts';
import { duplicateSeededType, newEquipmentTypeRow } from './duplicate.ts';
import {
  companyTypeListRows,
  companyTypeSecondaryText,
  companyTypesHeading,
  libraryTypeListRows,
  libraryTypesHeading,
  publishVersionLabel,
  retireTypeBody,
  suggestedTagHelperText,
  templateTypeVersionText,
  typeEditorMetaText,
  typeEditorTabLabel,
  typeNameOf,
} from './list.ts';
import { validateTypeDraft } from './validate.ts';

/*
 * Story 14.7: the type editor's draft edits (`types/draft-edit.ts`) and the type list's and
 * editor's derived text (`types/list.ts`). Every edit keeps the draft parseable by the loose
 * draft schema and, where the edit completes it, by the strict definition schema `applyOp`
 * checks on publish; `validateTypeDraft` and the strict schema agree on every draft built here.
 */

const TYPE_ID = '019a5f00-0000-7000-8000-0000000000a1';
const VERSION_ID = '019a5f00-0000-7000-8000-0000000000b1';
const cta = () => duplicateSeededType(SEED_VERSION, 'chave_transferencia_automatica');
const agrees = (draft: CompanyTypeDraft) => expect(validateTypeDraft(draft).length === 0).toBe(companyTypeDefinitionSchema.safeParse(draft).success);

describe('14.7-UNIT draft edits', () => {
  it('uniqueKey answers the base, else the first free numbered key', () => {
    expect(uniqueKey('campo_1', [])).toBe('campo_1');
    expect(uniqueKey('campo_1', ['campo_1'])).toBe('campo_1_2');
    expect(uniqueKey('Linha Á', ['linha'])).toBe('linha_2');
  });

  it('Identificação: the name, the print title (blank removes it), the TAG prefix uppercased, the noun', () => {
    let draft = setDraftText(cta().draft, 'label', 'No-break');
    draft = setDraftText(draft, 'tag_prefix', 'nb2');
    draft = setDraftText(draft, 'print_title', 'NO-BREAK');
    expect(draft).toMatchObject({ label: 'No-break', tag_prefix: 'NB2', print_title: 'NO-BREAK' });
    draft = setDraftText(draft, 'print_title', '  ');
    expect('print_title' in draft).toBe(false);
    draft = setDraftNoun(draft, { singular: 'no-break', plural: 'no-breaks', gender: 'm' });
    expect(draft.noun).toEqual({ singular: 'no-break', plural: 'no-breaks', gender: 'm' });
    agrees(draft);
    expect(validateTypeDraft(draft)).toEqual([]);
  });

  it('Placa: a new text field; a kind change keeps only what the kind carries; a list needs options', () => {
    const added = addDraftField(cta().draft);
    const fields = added.draft.nameplate!;
    expect(fields[added.index]).toMatchObject({ kind: 'text', label: `Campo ${fields.length}` });
    let draft = updateDraftField(added.draft, added.index, { kind: 'number', unit: 'VA' });
    expect(fieldSummaryText(draft.nameplate![added.index]!)).toBe('Número · VA');
    draft = updateDraftField(draft, added.index, { kind: 'select' });
    expect(draft.nameplate![added.index]).not.toHaveProperty('unit');
    expect(validateTypeDraft(draft).some((issue) => issue.path[0] === 'nameplate' && issue.path[1] === added.index)).toBe(true);
    agrees(draft);
    draft = updateDraftField(draft, added.index, { options: ['A', 'B', 'C'] });
    expect(fieldSummaryText(draft.nameplate![added.index]!)).toBe('Lista · 3 opções');
    expect(validateTypeDraft(draft)).toEqual([]);
    draft = updateDraftField(draft, added.index, { kind: 'manufacturer' });
    expect(draft.nameplate![added.index]).not.toHaveProperty('options');
    expect(fieldSummaryText(draft.nameplate![added.index]!)).toBe('Fabricante · lista de Cadastros');
    expect(fieldSummaryText({ kind: 'number' })).toBe('Número · sem unidade');
  });

  it('Verificações: a new item is an issue until it has a text and 3 to 4 phrases', () => {
    const added = addDraftItem(cta().draft);
    expect(validateTypeDraft(added.draft).filter((issue) => issue.path[0] === 'checklist').map((issue) => issue.message)).toContain(`Item ${added.index + 1}: informe o texto do item.`);
    let draft = updateDraftItem(added.draft, added.index, { label: 'Bornes', nc_phrases: ['A', 'B'] });
    expect(validateTypeDraft(draft).map((issue) => issue.message)).toContain(`Item ${added.index + 1}: informe de 3 a 4 frases de NC.`);
    draft = updateDraftItem(draft, added.index, { nc_phrases: ['A', 'B', 'C'], hint: 'Torque' });
    expect(itemSummaryText(draft.checklist![added.index]!)).toBe('3 frases de NC · lembrete na ficha');
    expect(validateTypeDraft(draft)).toEqual([]);
    draft = updateDraftItem(draft, added.index, { hint: '' });
    expect(draft.checklist![added.index]).not.toHaveProperty('hint');
  });

  it('moves and removes an entry; a removed test takes the criteria only it named', () => {
    const copy = duplicateSeededType(SEED_VERSION, 'disjuntor_mt').draft;
    const moved = moveDraftEntry(copy, 'tests', 0, 1);
    expect(moved.tests!.map((test) => test.key)).toEqual(['resistencia_contato', 'isolacao']);
    expect(moveDraftEntry(copy, 'tests', 0, 5)).toEqual(copy);
    const removed = removeDraftEntry(copy, 'tests', 1);
    expect(removed.tests!.map((test) => test.key)).toEqual(['isolacao']);
    expect(removed.criteria!.map((criterion) => criterion.key)).toEqual(['isolacao']);
    expect(validateTypeDraft(removed)).toEqual([]);
  });

  it('Ensaios: a seeded grammar copies its table and criterion once; a measurement table carries a criterion per row', () => {
    const base = duplicateSeededType(SEED_VERSION, 'cabos_saida').draft;
    expect(grammarTaken(base, 'isolacao')).toBe(true);
    expect(addDraftTest(base, 'isolacao', SEED_VERSION)).toBeNull();
    const contact = addDraftTest(base, 'resistencia_contato', SEED_VERSION)!;
    expect(contact.part).toBe('tests');
    expect(contact.draft.criteria!.map((criterion) => criterion.key)).toEqual(['isolacao', 'resistencia_contato']);
    expect(testSummaryText(contact.draft, 'tests', contact.index)).toMatch(/^Resistência de contato · critério: /);
    expect(validateTypeDraft(contact.draft)).toEqual([]);

    const table = addDraftTest(contact.draft, 'medicoes', SEED_VERSION)!;
    expect(table.part).toBe('measurement_tests');
    expect(testSummaryText(table.draft, 'measurement_tests', table.index)).toBe('Tabela de medições · 1 linha · 1 coluna');
    // The row's own criterion has no source yet: said once, on the Critérios tab.
    const issues = validateTypeDraft(table.draft);
    expect(issues.map((issue) => [issue.part, issue.message])).toEqual([['criterios', 'Informe a fonte do critério.']]);
    agrees(table.draft);
    let draft = updateDraftMeasurementRow(table.draft, table.index, 0, { label: 'Tensão de saída', unit: 'Vcc' });
    const rowCriterion = draft.criteria!.at(-1)!;
    expect(rowCriterion).toMatchObject({ label: 'Tensão de saída', unit: 'Vcc', operator: '>=', type: 'absolute_min' });
    expect(criterionUsedByText(draft, draft.criteria!.length - 1)).toBe('Tabela de medições');
    draft = updateDraftCriterion(draft, draft.criteria!.length - 1, { source_name: 'Manual', source_edition: 'rev. 3' });
    // The source is copied onto the measurement criterion that names the row.
    expect(draft.measurement_tests![table.index]!.criteria![0]).toMatchObject({ seeded: rowCriterion.key, source: { name: 'Manual', edition: 'rev. 3' } });
    expect(validateTypeDraft(draft)).toEqual([]);
    expect(companyTypeDefinitionSchema.safeParse(draft).success).toBe(true);

    draft = addDraftMeasurementRow(draft, table.index);
    expect(draft.measurement_tests![table.index]!.rows!.map((row) => row.label)).toEqual(['Tensão de saída', 'Linha 2']);
    draft = removeDraftMeasurementRow(draft, table.index, 1);
    expect(draft.measurement_tests![table.index]!.rows!.map((row) => row.label)).toEqual(['Tensão de saída']);
    expect(removeDraftMeasurementRow(draft, table.index, 0)).toEqual(draft);
    draft = updateDraftTest(draft, 'measurement_tests', table.index, { switchable: true, label: 'Tensões' });
    expect(draft.measurement_tests![table.index]).toMatchObject({ label: 'Tensões', switchable: { off_note: expect.any(String) } });
    draft = updateDraftTest(draft, 'measurement_tests', table.index, { switchable: false });
    expect(draft.measurement_tests![table.index]).not.toHaveProperty('switchable');
    expect(validateTypeDraft(draft)).toEqual([]);
  });

  it('Critérios: a rule change sets the type and the maximum of "entre"; a cleared value is the kernel\'s issue', () => {
    let draft = updateDraftCriterion(cta().draft, 0, { operator: 'between' });
    expect(draft.criteria![0]).toMatchObject({ operator: 'between', type: 'deviation_between', value_max: 400 });
    draft = updateDraftCriterion(draft, 0, { value_max: 900 });
    expect(validateTypeDraft(draft)).toEqual([]);
    draft = updateDraftCriterion(draft, 0, { operator: '>=' });
    expect(draft.criteria![0]).not.toHaveProperty('value_max');
    expect(draft.criteria![0]).toMatchObject({ type: 'absolute_min' });
    draft = updateDraftCriterion(draft, 0, { value: null });
    expect(validateTypeDraft(draft).map((issue) => issue.part)).toEqual(['criterios']);
    agrees(draft);
  });
});

describe('14.7-UNIT the type list and the editor text', () => {
  const copy = cta();
  const draftRow = newEquipmentTypeRow(TYPE_ID, copy);
  const version: EquipmentTypeVersionRow = { id: VERSION_ID, type_id: TYPE_ID, version: 1, definition: { ...(copy.draft as CompanyTypeDefinition), label: 'No-break', tag_prefix: 'NB' }, published_by: 'u', published_at: '2026-11-07T00:00:00.000Z' };
  const published: EquipmentTypeRow = { ...draftRow, draft: null, latest_version: 1 };

  it('headings, names, status and secondary lines', () => {
    expect(companyTypesHeading(3)).toBe('Da empresa (3)');
    expect(libraryTypesHeading(10)).toBe('Da biblioteca (10) · somente leitura');
    const empty = definitionContext([], [draftRow]);
    expect(typeNameOf(draftRow, empty)).toBe(copy.draft.label);
    expect(companyTypeSecondaryText(draftRow, empty)).toBe('Nunca publicado · pronto para publicar · TAG CTA · duplicado de Chave de transferência automática');
    const ctx = definitionContext([version], [published]);
    expect(typeNameOf(published, ctx)).toBe('No-break');
    expect(companyTypeSecondaryText(published, ctx)).toBe('TAG NB · duplicado de Chave de transferência automática');
    const open: EquipmentTypeRow = { ...published, draft: copy.draft };
    expect(companyTypeSecondaryText(open, definitionContext([version], [open]))).toBe('Rascunho da versão 2 aberto · TAG NB · duplicado de Chave de transferência automática');
    const retired: EquipmentTypeRow = { ...published, retired_at: '2026-11-07T00:00:00.000Z' };
    const rows = companyTypeListRows([retired, { ...draftRow, id: '019a5f00-0000-7000-8000-0000000000a2', removed_at: '2026-11-07T00:00:00.000Z' }], definitionContext([version], [retired]));
    expect(rows.map((row) => [row.name, row.statusText, row.discardable])).toEqual([['No-break', 'Aposentado · versão 1', false]]);
  });

  it('the library rows are every seeded type of the version, read-only', () => {
    const rows = libraryTypeListRows(SEED_VERSION);
    expect(rows.length).toBeGreaterThan(8);
    expect(rows.find((row) => row.type === 'chave_transferencia_automatica')?.secondary).toBe('Biblioteca · TAG CTA · Outros equipamentos');
  });

  it('the editor: tab labels with counts and issues, the head line, the publish label, the retire body, the TAG helper', () => {
    expect(typeEditorTabLabel(copy.draft, 'criterios', [])).toBe(`Critérios (${copy.draft.criteria.length})`);
    const blank = updateDraftCriterion(copy.draft, 0, { source_name: '' });
    expect(typeEditorTabLabel(blank, 'criterios', validateTypeDraft(blank))).toBe(`Critérios (${copy.draft.criteria.length}) · 1 aviso`);
    expect(typeEditorTabLabel(copy.draft, 'identificacao', [])).toBe('Identificação');
    expect(typeEditorMetaText(draftRow, definitionContext([], [draftRow]))).toBe('Editando o rascunho da versão 1 · duplicado de Chave de transferência automática (biblioteca)');
    expect(typeEditorMetaText(published, definitionContext([version], [published]))).toBe('Versão 1 publicada, sem rascunho aberto · duplicado de Chave de transferência automática (biblioteca)');
    expect(publishVersionLabel(published)).toBe('Publicar versão 2');
    expect(retireTypeBody({ latest_version: 2, draft: copy.draft })).toMatch(/O rascunho da versão 3 fica guardado\.$/);
    expect(suggestedTagHelperText('NB')).toBe('TAG sugerida: NB-01, NB-02… · letras maiúsculas e números, até 6');
    expect(suggestedTagHelperText('')).toBe('letras maiúsculas e números, até 6');
  });

  it('14.8: the composer names a company type by its noun and says its versions', () => {
    const v2: EquipmentTypeVersionRow = { ...version, id: '019a5f00-0000-7000-8000-0000000000b2', version: 2, definition: { ...version.definition, noun: { singular: 'no-break', plural: 'no-breaks', gender: 'm' } } };
    const ctx = definitionContext([version, v2], [{ ...published, latest_version: 2 }]);
    const type = companyBlockType(TYPE_ID);
    expect(quantityLabel(type, 3, ctx)).toBe('No-breaks, 3');
    expect(totalsText({ transformador_forca: 1, [type]: 2 } as never, ctx)).toBe('1 trafo · 2 no-breaks');
    expect(templateTypeVersionText(ctx, type, 1)).toBe('versão 1 · versão 2 publicada');
    expect(templateTypeVersionText(ctx, type, 2)).toBe('versão 2');
    expect(templateTypeVersionText(ctx, 'tc', undefined)).toBeNull();
    const retired = definitionContext([version, v2], [{ ...published, latest_version: 2, retired_at: '2026-11-07T00:00:00.000Z' }]);
    expect(templateTypeVersionText(retired, type, 2)).toBe('versão 2 · Aposentado');
  });
});
