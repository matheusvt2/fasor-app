import { describe, expect, it } from 'vitest';
import { portoSeguroSmall } from '../../fixtures/porto-seguro/small/op-log.ts';
import { entityKey, type EntityState } from '../ops/apply.ts';
import { replay } from '../ops/replay.ts';
import { documentControlRows } from '../print/document-control.ts';
import type { RegistryRow } from '../schemas/entities.ts';
import { buildSnapshot, createSnapshotBuilder } from '../schemas/snapshot.ts';
import { defaultEmpresaRow, empresaFooterLine, empresaFormLine, pickEmpresa, type EmpresaRow } from './empresa.ts';

/*
 * 27.1-UNIT (Story 27.1, F1): one `empresa` selector. The device (`empresaRow`), the server's
 * snapshot (`buildSnapshot`), the device's incremental snapshot (`createSnapshotBuilder`, the Gerar
 * dialog's) and so the print all take the live row of the smallest id, in whatever order the rows
 * arrive; a removed row is never taken.
 */

/** UUIDv7 ids: A minted before B, so A < B. */
const A = '019a0000-0000-7000-8000-00000000000a';
const B = '01a0f32f-2052-7c4a-87af-da665ab05007';

function empresa(id: string, overrides: Partial<EmpresaRow> = {}): EmpresaRow {
  return { ...defaultEmpresaRow(id), ...overrides };
}

const rowA = empresa(A, { name: 'Empresa A Engenharia', cnpj: '11.222.333/0001-81', address: 'Rua A, 1', logo_file_id: null, form_revision: 'Revisão 01' });
const rowB = empresa(B, { name: 'Empresa B Ltda', cnpj: '12.345.678/0001-95', address: 'Rua B, 2', form_revision: 'Revisão 00' });
const client: RegistryRow = { id: '019a0000-0000-7000-8000-0000000000c1', kind: 'client', name: 'Cliente', cnpj: null, contact_name: null, contact_phone: null, sites: [], removed_at: null };

describe('27.1-UNIT pickEmpresa', () => {
  it('none: null; one: that row; a client row is never taken', () => {
    expect(pickEmpresa([])).toBeNull();
    expect(pickEmpresa([client])).toBeNull();
    expect(pickEmpresa([client, rowB])).toBe(rowB);
  });

  it('two live rows in either order: the smallest id (the earliest UUIDv7)', () => {
    expect(pickEmpresa([rowA, rowB])).toBe(rowA);
    expect(pickEmpresa([rowB, rowA])).toBe(rowA);
    expect(pickEmpresa([rowB, client, rowA])).toBe(rowA);
  });

  it('a removed row is never taken, whatever its id', () => {
    const removedA = { ...rowA, removed_at: '2026-11-21T10:00:00.000Z' };
    expect(pickEmpresa([removedA, rowB])).toBe(rowB);
    expect(pickEmpresa([rowB, removedA])).toBe(rowB);
    expect(pickEmpresa([removedA])).toBeNull();
  });
});

describe('27.1-UNIT the snapshot, the Gerar dialog and the print take the same company', () => {
  const base = (): EntityState => replay(portoSeguroSmall.log, { deadOpIds: portoSeguroSmall.deadOpIds });
  const withRows = (rows: readonly EmpresaRow[]): EntityState => {
    const state = new Map(base());
    for (const row of rows) state.set(entityKey('registry', row.id), row);
    return state;
  };
  const inputs = { revisionNumber: 1, issuedAt: '2026-11-21T12:00:00.000Z', art: '2620262602583' };

  for (const order of [[rowA, rowB], [rowB, rowA]] as const) {
    it(`rows inserted ${order[0].id === A ? 'A then B' : 'B then A'}: both builders hold A, and the document control is equal field by field`, () => {
      const state = withRows(order);
      const server = buildSnapshot(state, portoSeguroSmall.relatorioId);
      const device = createSnapshotBuilder()(state, portoSeguroSmall.relatorioId);
      expect(server.empresa?.id).toBe(A);
      expect(device.empresa?.id).toBe(A);
      // The fields the cover, the header and the footer print, one by one.
      for (const field of ['name', 'cnpj', 'address', 'logo_file_id', 'form_title', 'form_code', 'form_revision'] as const) {
        expect(device.empresa?.[field], field).toEqual(server.empresa?.[field]);
        expect(server.empresa?.[field], field).toEqual(rowA[field]);
      }
      expect(empresaFooterLine(device.empresa)).toBe(empresaFooterLine(server.empresa));
      expect(empresaFormLine(device.empresa)).toBe('FO.SERV-03 · Revisão 01');
      // The Gerar dialog's "Controle do documento" and the printed one, row by row.
      const dialog = documentControlRows(device, inputs);
      const printed = documentControlRows(server, inputs);
      expect(dialog).toEqual(printed);
      expect(printed.find((row) => row.label === 'Contratada')?.value).toBe('Empresa A Engenharia · CNPJ 11.222.333/0001-81');
      expect(printed.find((row) => row.label === 'Documento')?.value).toBe('Relatório Técnico de Cabine Primária · FO.SERV-03 · Revisão 01');
    });
  }

  it('the smallest id removed: both builders hold the other row', () => {
    const state = withRows([{ ...rowA, removed_at: '2026-11-21T10:00:00.000Z' }, rowB]);
    expect(buildSnapshot(state, portoSeguroSmall.relatorioId).empresa?.id).toBe(B);
    expect(createSnapshotBuilder()(state, portoSeguroSmall.relatorioId).empresa?.id).toBe(B);
  });
});
