import { describe, expect, it } from 'vitest';
import { portoSeguroSmall } from '../../fixtures/porto-seguro/small/op-log.ts';
import { replay } from '../ops/replay.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { artLabel, documentControlRows, MISSING } from './document-control.ts';

const ISSUED_AT = '2026-09-23T12:00:00.000Z';

function base(): RelatorioSnapshot {
  const snapshot = buildSnapshot(replay(portoSeguroSmall.log, { deadOpIds: portoSeguroSmall.deadOpIds }), portoSeguroSmall.relatorioId);
  return {
    ...snapshot,
    relatorio: { ...snapshot.relatorio, setup: { ...snapshot.relatorio.setup, service_start: '2026-09-06', service_end: '2026-09-08' } },
    client: { ...snapshot.client!, name: 'Porto Seguro Companhia de Seguros Gerais', cnpj: '00000000000100' },
    empresa: {
      id: '019966c1-0000-7000-8000-0000000000ee',
      kind: 'empresa',
      name: 'Fasor Engenharia',
      cnpj: '00.000.000/0001-01',
      address: null,
      phone: null,
      email: null,
      form_title: 'Relatório Técnico de Cabine Primária',
      form_code: 'FO.SERV-03',
      form_revision: 'Revisão 00',
      logo_file_id: null,
      watermark_file_id: null,
      cover_background_file_id: null,
      removed_at: null,
    },
    responsible: {
      id: portoSeguroSmall.userId,
      name: 'Rafael Lamonde',
      email: 'r@teste.local',
      council: 'crea',
      registration_number: '5063583141',
      title: 'Eng. Eletricista',
      photo_location_enabled: true,
    },
  };
}

describe('4.8-UNIT-003 documentControlRows', () => {
  it('composes every row from the snapshot, the CNPJs canonical, the dates in São Paulo', () => {
    expect(documentControlRows(base(), { revisionNumber: 1, issuedAt: ISSUED_AT })).toEqual([
      { label: 'Documento', value: 'Relatório Técnico de Cabine Primária · FO.SERV-03 · Revisão 00' },
      { label: 'Revisão do documento', value: 'Rev. 1' },
      { label: 'Data de emissão', value: '23/09/2026' },
      { label: 'Contratante', value: 'Porto Seguro Companhia de Seguros Gerais · CNPJ 00.000.000/0001-00' },
      { label: 'Contratada', value: 'Fasor Engenharia · CNPJ 00.000.000/0001-01' },
      { label: 'Responsável técnico', value: 'Rafael Lamonde · CREA 5063583141' },
      { label: 'ART', value: '—' },
      { label: 'Período do serviço', value: '06–08/09/2026' },
    ]);
  });

  it('turns a UTC instant into the São Paulo calendar date, crossing midnight', () => {
    // 01:30 UTC on the 24th is still the 23rd in São Paulo.
    const rows = documentControlRows(base(), { revisionNumber: 3, issuedAt: '2026-09-24T01:30:00.000Z' });
    expect(rows.find((r) => r.label === 'Data de emissão')?.value).toBe('23/09/2026');
    expect(rows.find((r) => r.label === 'Revisão do documento')?.value).toBe('Rev. 3');
  });

  it('labels the registration row by council and prints the ART when given', () => {
    expect(artLabel('crea')).toBe('ART');
    expect(artLabel('crt')).toBe('TRT');
    expect(artLabel(null)).toBe('ART/TRT');
    const crt = base();
    crt.responsible = { ...crt.responsible!, council: 'crt', registration_number: '  ' };
    const rows = documentControlRows(crt, { revisionNumber: 1, issuedAt: ISSUED_AT, art: '2620262602583' });
    expect(rows[5]).toEqual({ label: 'Responsável técnico', value: 'Rafael Lamonde · CRT' });
    expect(rows[6]).toEqual({ label: 'TRT', value: '2620262602583' });
  });

  it('prints "—" for every missing value, never a bracketed label', () => {
    const empty: RelatorioSnapshot = {
      ...base(),
      empresa: null,
      client: null,
      responsible: null,
    };
    empty.relatorio = { ...empty.relatorio, setup: { ...empty.relatorio.setup, service_start: null, service_end: null } };
    const rows = documentControlRows(empty, { revisionNumber: 1, issuedAt: 'garbage' });
    expect(rows.map((r) => r.value)).toEqual([MISSING, 'Rev. 1', MISSING, MISSING, MISSING, MISSING, MISSING, MISSING]);
    expect(rows[6]!.label).toBe('ART/TRT');
    for (const row of rows) expect(row.value).not.toMatch(/^\[/);
  });

  it('keeps a party without CNPJ and a responsible without council readable', () => {
    const partial = base();
    partial.client = { ...partial.client!, cnpj: null };
    partial.responsible = { ...partial.responsible!, council: null };
    const rows = documentControlRows(partial, { revisionNumber: 1, issuedAt: ISSUED_AT });
    expect(rows[3]!.value).toBe('Porto Seguro Companhia de Seguros Gerais · CNPJ —');
    expect(rows[5]!.value).toBe('Rafael Lamonde');
    expect(rows[6]!.label).toBe('ART/TRT');
  });
});
