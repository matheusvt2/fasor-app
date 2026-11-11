import { describe, expect, it } from 'vitest';
import { DEFINITION_1 } from '../../fixtures/company-types/op-log.ts';
import { companyBlockType, type BlockTypeKey } from '../schemas/block-config.ts';
import type { EquipmentTypeRow, EquipmentTypeVersionRow, LocationRow, SuggestionRow } from '../schemas/entities.ts';
import { definitionContext, EMPTY_DEFINITION_CONTEXT, equipmentTypesOf, isLibraryType, SEED_VERSION, SEED_VERSIONS } from '../seed/definitions.ts';
import type { CompanyTypeDefinition } from '../types/definition.ts';
import { duplicateCompanyType, duplicateSeededType } from '../types/duplicate.ts';
import { libraryTypeListRows } from '../types/list.ts';
import { panelProposal, panelProvenance, panelTypeChips, type PanelSuggestion } from './panel.ts';
import { hidingCopies, LIBRARY_GROUP_LABEL, paletteItems, paletteTypeGroups } from './tree.ts';

/*
 * Story 24.19 ("24.19-UNIT", batch e24c): while a company copy of a seeded type is published and
 * neither retired nor removed, both palettes offer the copy where the type stood and not the type;
 * "Fotografar equipamento" proposes the one copy (none with several); the type list says the
 * library type is hidden. Synthetic ids; the copies are "Duplicar" of the current seed.
 */

const id = (n: number) => `019a5c00-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;
const T = '2026-11-11T10:00:00.000Z';

interface Spec {
  n: number;
  definition: CompanyTypeDefinition;
  retired?: boolean;
  removed?: boolean;
  published?: boolean;
}

function context(specs: readonly Spec[]) {
  const types: EquipmentTypeRow[] = [];
  const versions: EquipmentTypeVersionRow[] = [];
  for (const spec of specs) {
    const published = spec.published !== false;
    types.push({ id: id(spec.n), derived_from: null, draft: published ? null : spec.definition, retired_at: spec.retired === true ? T : null, removed_at: spec.removed === true ? T : null, latest_version: published ? 1 : 0 });
    if (published) versions.push({ id: id(spec.n + 1000), type_id: id(spec.n), version: 1, definition: spec.definition, published_by: id(9), published_at: T });
  }
  return definitionContext(versions, types);
}

const copyOf = (blockType: Parameters<typeof duplicateSeededType>[1], label: string): CompanyTypeDefinition => ({ ...duplicateSeededType(SEED_VERSION, blockType).draft, label });
const TR = 'transformador_forca';
const CTA = 'chave_transferencia_automatica';
const trCopy = copyOf(TR, 'Transformador de força — base 2026');
const trCopyB = copyOf(TR, 'Transformador a seco (cópia)');
const type = (n: number): BlockTypeKey => companyBlockType(id(n));

const seeded = (seed: string) => paletteTypeGroups(seed, EMPTY_DEFINITION_CONTEXT);
const flat = (groups: ReturnType<typeof paletteTypeGroups>) => groups.flatMap((group) => group.types);

describe('24.19-UNIT: the palette groups', () => {
  it('with no copy, the groups are as before', () => {
    expect(paletteTypeGroups(SEED_VERSION, context([{ n: 1, definition: structuredClone(DEFINITION_1) }]))).toEqual([
      seeded(SEED_VERSION)[0],
      { ...seeded(SEED_VERSION)[1], types: [...seeded(SEED_VERSION)[1]!.types, type(1)] },
    ]);
    expect(hidingCopies(EMPTY_DEFINITION_CONTEXT, SEED_VERSION).size).toBe(0);
  });

  // v14 joins once batch e24a's seed is on the branch (the rule reads no seed key).
  for (const seed of ['v13', 'v14'].filter((version) => Object.hasOwn(SEED_VERSIONS, version))) {
    it(`one published copy of the transformer stands where it stood among the eight, and the transformer is not offered (${seed})`, () => {
      const ctx = context([{ n: 1, definition: trCopy }]);
      const groups = paletteTypeGroups(seed, ctx);
      const before = seeded(seed);
      expect(groups[0]!.types).toEqual(before[0]!.types.map((t) => (t === TR ? type(1) : t)));
      expect(flat(groups)).not.toContain(TR);
      expect(groups[1]!.types).toEqual(before[1]!.types);
      expect(hidingCopies(ctx, seed)).toEqual(new Map([[TR, [type(1)]]]));
      const item = paletteItems(seed, { kind: 'cabine', name: 'Cubículo Enel' }, [], ctx).find((row) => row.type === type(1))!;
      expect(item).toMatchObject({ typeVersion: 1, label: trCopy.label, tag: 'TR-01', library: false, company: true });
      expect(item.summary).not.toBeNull();
      expect(paletteItems(seed, { kind: 'cabine', name: 'Cubículo Enel' }, [], ctx).find((row) => row.type === 'tp')).toMatchObject({ company: false, summary: null });
    });
  }

  it('two copies (one a copy of the other) both stand in the original\'s place, in label order', () => {
    const copyOfCopy = { ...duplicateCompanyType({ type_id: id(1), version: 1, definition: trCopy }).draft, label: 'Transformador a seco (cópia)' };
    for (const second of [trCopyB, copyOfCopy]) {
      const ctx = context([{ n: 1, definition: trCopy }, { n: 2, definition: second }]);
      const groups = paletteTypeGroups(SEED_VERSION, ctx);
      const at = seeded(SEED_VERSION)[0]!.types.indexOf(TR);
      expect(groups[0]!.types.slice(at, at + 2)).toEqual([type(2), type(1)]);
      expect(flat(groups)).not.toContain(TR);
      expect(flat(groups).filter((t) => t === type(1) || t === type(2))).toHaveLength(2);
    }
  });

  it('a retired, removed or never-published copy hides nothing and is not offered', () => {
    for (const spec of [{ retired: true }, { removed: true }, { published: false }]) {
      const ctx = context([{ n: 1, definition: trCopy, ...spec }]);
      expect(paletteTypeGroups(SEED_VERSION, ctx)).toEqual(seeded(SEED_VERSION));
    }
  });

  it('a copy of a library type stands in its place under "Outros equipamentos"; a copy whose base the seed does not ship stays at the end', () => {
    const ctx = context([{ n: 1, definition: copyOf(CTA, 'CTA da empresa') }, { n: 2, definition: structuredClone(DEFINITION_1) }]);
    const groups = paletteTypeGroups(SEED_VERSION, ctx);
    expect(isLibraryType(SEED_VERSION, CTA)).toBe(true);
    expect(groups[1]).toEqual({ key: 'library', label: LIBRARY_GROUP_LABEL, types: [...seeded(SEED_VERSION)[1]!.types.map((t) => (t === CTA ? type(1) : t)), type(2)] });
    expect(groups[0]).toEqual(seeded(SEED_VERSION)[0]);
    // The CTA was first shipped on v5: on v4 its copy hides nothing and sits at the end of its group.
    const v4 = paletteTypeGroups('v4', ctx);
    expect(v4[0]).toEqual(seeded('v4')[0]);
    expect(v4[1]!.types).toEqual([type(1), type(2)]);
  });
});

describe('24.19-UNIT: "Fotografar equipamento"', () => {
  const COL = id(500);
  const CAB = id(501);
  const locations: LocationRow[] = [
    { id: CAB, relatorio_id: id(502), parent_id: null, kind: 'cabine', name: 'Cubículo', order_key: 'a0', funcao: null, removed_at: null } as unknown as LocationRow,
    { id: COL, relatorio_id: id(502), parent_id: CAB, kind: 'coluna', name: 'Coluna 9', order_key: 'a0', removed_at: null } as unknown as LocationRow,
  ];
  const suggestion = (trust: 'suggested' | 'verify' = 'suggested'): PanelSuggestion => ({
    row: { id: id(600), status: 'pending', trust, target_path: `file/${id(601)}/block_id` } as unknown as SuggestionRow,
    value: { block_type: TR, column: 9, column_text: 'C09' } as PanelSuggestion['value'],
  });
  const input = (definitions: ReturnType<typeof context>) => ({ seedVersion: SEED_VERSION, locations, equipment: [], paletteLocationId: COL, suggestion: suggestion(), pickedType: null, definitions });

  it('with one copy hiding the read type, proposes the copy at its latest version, trusted as the read type', () => {
    const ctx = context([{ n: 1, definition: trCopy }]);
    const proposal = panelProposal(input(ctx))!;
    expect(proposal).toMatchObject({ type: type(1), typeVersion: 1, typeLabel: trCopy.label, tag: 'TR-01', trust: 'suggested', suggestionStatus: 'confirmed', matched: true });
    expect(proposal.text).toBe(`Criar TR-01 · ${trCopy.label} · Coluna 9?`);
    // The copy stands for the read type: its provenance is the reading's.
    expect(panelProvenance(proposal, suggestion())[0]).toEqual({ label: 'Tipo', text: 'frente do painel' });
    expect(panelProvenance(panelProposal({ ...input(ctx), pickedType: 'tp' })!, suggestion())[0]!.text).toBe('escolhido por você');
    const chips = panelTypeChips(SEED_VERSION, TR, false, ctx);
    expect(chips.other).toBe(true);
    expect(chips.chips[0]).toEqual({ type: type(1), label: trCopy.label, typeVersion: 1 });
    expect(chips.chips.map((chip) => chip.type)).not.toContain(TR);
  });

  it('with two copies, proposes nothing and shows every chip, the original replaced by its copies', () => {
    const ctx = context([{ n: 1, definition: trCopy }, { n: 2, definition: trCopyB }]);
    expect(panelProposal(input(ctx))).toBeNull();
    const chips = panelTypeChips(SEED_VERSION, TR, false, ctx);
    expect(chips.other).toBe(false);
    expect(chips.chips.map((chip) => chip.type)).toEqual(equipmentTypesOf(SEED_VERSION).flatMap((t) => (t === TR ? [type(2), type(1)] : [t])));
    // A copy picked by hand is created at its version, with the copy's prefix.
    expect(panelProposal({ ...input(ctx), pickedType: type(2) })).toMatchObject({ type: type(2), typeVersion: 1, typeLabel: trCopyB.label, trust: null, suggestionStatus: 'discarded' });
  });

  it('with no copy, proposes the read type as before', () => {
    expect(panelProposal(input(EMPTY_DEFINITION_CONTEXT))).toMatchObject({ type: TR, trust: 'suggested' });
    expect(panelProposal(input(EMPTY_DEFINITION_CONTEXT))).not.toHaveProperty('typeVersion');
    expect(panelTypeChips(SEED_VERSION, TR, false, EMPTY_DEFINITION_CONTEXT)).toEqual(panelTypeChips(SEED_VERSION, TR, false));
  });
});

describe('24.19-UNIT: the type list', () => {
  it('says a library type is hidden in the palettes while one copy or several are published', () => {
    expect(libraryTypeListRows(SEED_VERSION).every((row) => row.hiddenText === null)).toBe(true);
    const one = libraryTypeListRows(SEED_VERSION, context([{ n: 1, definition: trCopy }]));
    expect(one.find((row) => row.type === TR)!.hiddenText).toBe(`Oculto na lista de tipos: a cópia ${trCopy.label} está publicada.`);
    expect(one.filter((row) => row.hiddenText !== null)).toHaveLength(1);
    const two = libraryTypeListRows(SEED_VERSION, context([{ n: 1, definition: trCopy }, { n: 2, definition: trCopyB }]));
    expect(two.find((row) => row.type === TR)!.hiddenText).toBe(`Oculto na lista de tipos: as cópias ${trCopyB.label} e ${trCopy.label} estão publicadas.`);
    expect(libraryTypeListRows(SEED_VERSION, context([{ n: 1, definition: trCopy, retired: true }])).find((row) => row.type === TR)!.hiddenText).toBeNull();
  });
});
