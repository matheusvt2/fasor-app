import { describe, expect, it } from 'vitest';
import { companyBlockType } from '../schemas/block-config.ts';
import type { EquipmentTypeRow, EquipmentTypeVersionRow } from '../schemas/entities.ts';
import { definitionContext, EMPTY_DEFINITION_CONTEXT, SEED_VERSION } from '../seed/definitions.ts';
import { paletteTypeGroups } from '../relatorio/tree.ts';
import { duplicateSeededType } from './duplicate.ts';
import { hiddenTypeText } from './list.ts';
import { composerHiddenTypes, paletteMetaText } from './palette-meta.ts';

/*
 * Fix batch e24x: the palettes' `.pi-meta` line of a type (C3) and the composer's way back to the
 * defaults of a library type a published copy hides while the template places it (Matheus's
 * decision 17 of 2026-11-11, the spec's Design Notes D4). Values invented.
 */

describe('e24x-UNIT C3 paletteMetaText: one line, never a doubled separator', () => {
  it('a company type with no summary and no version text is "Tipo da empresa" alone; an empty summary counts as none', () => {
    expect(paletteMetaText(true, [])).toBe('Tipo da empresa');
    expect(paletteMetaText(true, ['', null])).toBe('Tipo da empresa');
    expect(paletteMetaText(true, ['', 'TR-01'])).toBe('Tipo da empresa · TR-01');
    expect(paletteMetaText(true, ['3 itens · até 2 ensaios', 'TR-01'])).toBe('Tipo da empresa · 3 itens · até 2 ensaios · TR-01');
  });

  it('a library type joins what it has; with nothing, no line', () => {
    expect(paletteMetaText(false, ['17 itens · até 6 ensaios', 'CTA-01'])).toBe('17 itens · até 6 ensaios · CTA-01');
    expect(paletteMetaText(false, ['', 'CTA-01'])).toBe('CTA-01');
    expect(paletteMetaText(false, [null, ''])).toBeNull();
  });
});

describe('e24x-UNIT D17 composerHiddenTypes: the hidden original the template still places', () => {
  const TYPE_ID = '019966c1-0e24-7000-8000-0000000000e1';
  const copy = duplicateSeededType(SEED_VERSION, 'transformador_forca').draft;
  const version: EquipmentTypeVersionRow = { id: '019966c1-0e24-7000-8000-0000000000e2', type_id: TYPE_ID, version: 1, definition: copy, published_by: '019966c1-0e24-7000-8000-0000000000e3', published_at: '2026-11-11T12:00:00.000Z' };
  const typeRow = (retired: boolean): EquipmentTypeRow => ({ id: TYPE_ID, derived_from: { seed_version: SEED_VERSION, block_type: 'transformador_forca' }, draft: null, retired_at: retired ? '2026-11-11T13:00:00.000Z' : null, removed_at: null, latest_version: 1 });

  it('placed and hidden: drawn right after its last copy, with the type list\'s line', () => {
    const ctx = definitionContext([version], [typeRow(false)]);
    const hidden = composerHiddenTypes(ctx, SEED_VERSION, new Set(['transformador_forca', 'disjuntor_mt']));
    expect(hidden).toEqual([{ type: 'transformador_forca', after: companyBlockType(TYPE_ID), text: hiddenTypeText([copy.label]) }]);
    expect(hidden[0]!.text).toBe(`Oculto na lista de tipos: a cópia ${copy.label} está publicada.`);
    // The copy stands in the palette where the transformer stood; the original is not offered there.
    const offered = paletteTypeGroups(SEED_VERSION, ctx).flatMap((group) => group.types);
    expect(offered).toContain(companyBlockType(TYPE_ID));
    expect(offered).not.toContain('transformador_forca');
  });

  it('nothing once the template no longer places it, or the copy is retired, or with no company types', () => {
    expect(composerHiddenTypes(definitionContext([version], [typeRow(false)]), SEED_VERSION, new Set(['disjuntor_mt']))).toEqual([]);
    expect(composerHiddenTypes(definitionContext([version], [typeRow(true)]), SEED_VERSION, new Set(['transformador_forca']))).toEqual([]);
    expect(composerHiddenTypes(EMPTY_DEFINITION_CONTEXT, SEED_VERSION, new Set(['transformador_forca']))).toEqual([]);
  });
});
