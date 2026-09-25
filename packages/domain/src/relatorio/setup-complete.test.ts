import { describe, expect, it } from 'vitest';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import type { RelatorioSetup, UserRow } from '../schemas/entities.ts';
import { firstSetupGap, isSetupComplete, setupIncompleteReason, siteAltitudeText } from './setup-complete.ts';

const RESPONSIBLE: UserRow = {
  id: '019966b0-0061-7000-8000-000000000003',
  name: 'Ana Exemplo',
  email: 'rafael@fasor.com.br',
  council: 'crea',
  registration_number: 'SP 5063583141',
  title: 'Eng. Eletricista',
  photo_location_enabled: false,
};

const COMPLETE_SETUP: RelatorioSetup = {
  service_start: '2026-09-06',
  service_end: '2026-09-08',
  atividade: null,
  local: null,
  responsible_user_id: RESPONSIBLE.id,
  cover_photo_file_id: null,
  escopo: null,
  exclusions: null,
  additional_info: null,
  art_trt_number: '2620262602583',
  instrument_ids: ['019966b0-0068-7000-8000-000000000001'],
  site_altitude_m: null,
  site_altitude_confirmed: false,
  next_intervention_date: null,
  next_intervention_justification: null,
};

/** A minimal snapshot: only the fields `isSetupComplete` reads are given real shapes. */
function snapshotWith(overrides: { client?: RelatorioSnapshot['client']; setup?: Partial<RelatorioSetup> }): RelatorioSnapshot {
  return {
    relatorio: {
      id: '019966b0-0061-7000-8000-000000000010',
      project_id: '019966b0-0061-7000-8000-000000000011',
      template_id: null,
      template_version: null,
      seed_version: 'v1',
      status: 'rascunho',
      setup: { ...COMPLETE_SETUP, ...overrides.setup },
      export: { scheme: 'por_local_e_tipo' },
      preview_file_id: null,
      removed_at: null,
    },
    project: null,
    empresa: null,
    client: overrides.client === undefined ? { id: 'c1', kind: 'client', name: 'Seguradora Exemplo', cnpj: null, contact_name: null, contact_phone: null, sites: [], removed_at: null } : overrides.client,
    responsible: null,
    instruments: [],
    equipment: [],
    locations: [],
    blocks: [],
    files: [],
    points: [],
    suggestions: [],
  };
}

describe('4.2-UNIT isSetupComplete / setupIncompleteReason', () => {
  it('is complete once client, dates, responsible, registration, ART/TRT and an instrument all exist', () => {
    const snapshot = snapshotWith({});
    expect(isSetupComplete(snapshot, RESPONSIBLE)).toBe(true);
    expect(setupIncompleteReason(snapshot, RESPONSIBLE)).toBeNull();
  });

  it('names the first missing item in the fixed order, one gap at a time', () => {
    expect(firstSetupGap(snapshotWith({ client: null }), RESPONSIBLE)).toBe('client');
    expect(firstSetupGap(snapshotWith({ setup: { service_start: null } }), RESPONSIBLE)).toBe('service_start');
    expect(firstSetupGap(snapshotWith({ setup: { service_end: null } }), RESPONSIBLE)).toBe('service_end');
    expect(firstSetupGap(snapshotWith({ setup: { responsible_user_id: null } }), RESPONSIBLE)).toBe('responsible_user_id');
    expect(firstSetupGap(snapshotWith({}), { ...RESPONSIBLE, registration_number: null })).toBe('registration_number');
    expect(firstSetupGap(snapshotWith({}), null)).toBe('registration_number');
    expect(firstSetupGap(snapshotWith({ setup: { art_trt_number: null } }), RESPONSIBLE)).toBe('art_trt_number');
    expect(firstSetupGap(snapshotWith({ setup: { instrument_ids: [] } }), RESPONSIBLE)).toBe('instruments');
  });

  it('Q12: the ART/TRT gap names the council\'s own document, the article agreed, and the generic words only with no council', () => {
    const gap = snapshotWith({ setup: { art_trt_number: null } });
    expect(setupIncompleteReason(gap, RESPONSIBLE)).toBe('Concluir dados do relatório: falta o número da ART');
    expect(setupIncompleteReason(gap, { ...RESPONSIBLE, council: 'crt' })).toBe('Concluir dados do relatório: falta o número da TRT');
    expect(setupIncompleteReason(gap, { ...RESPONSIBLE, council: null })).toBe('Concluir dados do relatório: falta o número do ART/TRT');
  });
});

describe('siteAltitudeText (FR-16)', () => {
  it('is "< 1000 m" below the threshold', () => {
    expect(siteAltitudeText(0)).toBe('< 1000 m');
    expect(siteAltitudeText(999)).toBe('< 1000 m');
  });

  it('is "⟨m⟩ m" at or above the threshold', () => {
    expect(siteAltitudeText(1000)).toBe('1000 m');
    expect(siteAltitudeText(1200)).toBe('1200 m');
  });
});
