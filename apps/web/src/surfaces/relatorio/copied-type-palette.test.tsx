import { companyBlockType, definitionContext, duplicateSeededType, EMPTY_DEFINITION_CONTEXT, paletteTypeGroups, SEED_VERSION, type CompanyTypeDefinition, type EquipmentTypeRow, type EquipmentTypeVersionRow, type LocationRow } from '@app/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FieldPalette } from './block-palette-field.tsx';

/*
 * Story 24.19 (batch e24c): the field palette with a published company copy of the transformer
 * stands the copy where the transformer stood among the eight, marked "Tipo da empresa", and does not
 * offer the transformer; a tap creates the copy at its latest version. Retired, the transformer is back.
 */

const id = (n: number) => `019966c1-0e24-7000-8000-${n.toString(16).padStart(12, '0')}`;
const RELATORIO = id(100);
const cabine: LocationRow = {
  id: id(1),
  relatorio_id: RELATORIO,
  parent_id: null,
  kind: 'cabine',
  name: '1° Subsolo',
  order_key: 'a0',
  removed_at: null,
  se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
  env: { altitude_m: null, temperature_c: null, humidity_pct: null },
  agrupar_por_tipo: true,
};
const col9: LocationRow = { id: id(3), relatorio_id: RELATORIO, parent_id: id(1), kind: 'coluna', name: 'Coluna 9', order_key: 'a1', removed_at: null };

const trCopy: CompanyTypeDefinition = { ...duplicateSeededType(SEED_VERSION, 'transformador_forca').draft, label: 'Transformador de força — base 2026' };
const TYPE_ID = id(50);
const version: EquipmentTypeVersionRow = { id: id(51), type_id: TYPE_ID, version: 1, definition: trCopy, published_by: id(52), published_at: '2026-11-11T12:00:00.000Z' };
const typeRow = (retired: boolean): EquipmentTypeRow => ({ id: TYPE_ID, derived_from: null, draft: null, retired_at: retired ? '2026-11-11T13:00:00.000Z' : null, removed_at: null, latest_version: 1 });

function renderOn(retired: boolean, onCreate = vi.fn()) {
  render(
    <FieldPalette
      definitions={definitionContext([version], [typeRow(retired)])}
      target={{ locationId: col9.id, anchorBlockId: null }}
      seedVersion={SEED_VERSION}
      locations={[cabine, col9]}
      blocks={[]}
      equipment={[]}
      onCreate={onCreate}
      onClose={vi.fn()}
    />,
  );
  return onCreate;
}

const seededTypes = () => paletteTypeGroups(SEED_VERSION, EMPTY_DEFINITION_CONTEXT).flatMap((group) => group.types);

describe('24.19 FieldPalette: a published copy hides its original', () => {
  it('stands the copy where the transformer stood, marked "Tipo da empresa", and creates it at its version', async () => {
    const onCreate = renderOn(false);
    const palette = screen.getByRole('dialog', { name: 'Adicionar bloco' });
    const types = [...palette.querySelectorAll<HTMLElement>('.palette-type')].map((row) => row.dataset.blockType);
    const expected = seededTypes().map((type) => (type === 'transformador_forca' ? companyBlockType(TYPE_ID) : type));
    expect(types).toEqual(expected);
    expect(types).not.toContain('transformador_forca');
    const row = palette.querySelector<HTMLElement>(`.palette-type[data-block-type="${companyBlockType(TYPE_ID)}"] .pf-field`)!;
    expect(row.querySelector('.pi-text > span:first-child')).toHaveTextContent(trCopy.label);
    expect(row.querySelector('.pi-meta')!.textContent).toMatch(/^Tipo da empresa · .* · TR-01$/);
    // The eight before it keep their TAG alone, and it stands before "Outros equipamentos".
    expect(palette.querySelector('.palette-type[data-block-type="tp"] .pf-field .pi-meta')!.textContent).toBe('TP-01');
    const heading = [...palette.querySelectorAll('.palette-group')].find((group) => group.textContent === 'Outros equipamentos')!;
    expect(row.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await userEvent.click(row);
    expect(onCreate).toHaveBeenCalledWith({ type: companyBlockType(TYPE_ID), typeVersion: 1, locationId: col9.id, anchorBlockId: null, tag: null });
  });

  it('with the copy retired, the transformer is back in its place and the copy is gone', () => {
    renderOn(true);
    const palette = screen.getByRole('dialog', { name: 'Adicionar bloco' });
    expect([...palette.querySelectorAll<HTMLElement>('.palette-type')].map((row) => row.dataset.blockType)).toEqual(seededTypes());
  });
});

describe('e24x C3 FieldPalette: a company type with no summary', () => {
  it('reads "Tipo da empresa · TAG", never a doubled separator', () => {
    const bare: CompanyTypeDefinition = { label: 'Fonte sem itens', tag_prefix: 'FA', noun: { singular: 'fonte', plural: 'fontes', gender: 'f' }, nameplate: [{ key: 'fabricante', label: 'FABRICANTE', kind: 'manufacturer' }], checklist: null, tests: [], criteria: [] };
    const bareId = id(60);
    const bareVersion: EquipmentTypeVersionRow = { id: id(61), type_id: bareId, version: 1, definition: bare, published_by: id(52), published_at: '2026-11-11T12:00:00.000Z' };
    const bareRow: EquipmentTypeRow = { id: bareId, derived_from: null, draft: null, retired_at: null, removed_at: null, latest_version: 1 };
    render(
      <FieldPalette
        definitions={definitionContext([bareVersion], [bareRow])}
        target={{ locationId: col9.id, anchorBlockId: null }}
        seedVersion={SEED_VERSION}
        locations={[cabine, col9]}
        blocks={[]}
        equipment={[]}
        onCreate={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const palette = screen.getByRole('dialog', { name: 'Adicionar bloco' });
    const meta = palette.querySelector(`.palette-type[data-block-type="${companyBlockType(bareId)}"] .pf-field .pi-meta`)!;
    expect(meta.textContent).toBe('Tipo da empresa · FA-01');
  });
});
