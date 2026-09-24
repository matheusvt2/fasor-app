import { describe, expect, it } from 'vitest';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import {
  defaultExclusions,
  editedSectionTextConfig,
  printedExclusions,
  restoredSectionTextConfig,
  section3Blocks,
  section3Text,
  sectionTextEdited,
  sectionVariables,
  withoutExclusion,
} from './section-variables.ts';

const TODAY = '2026-09-24';

function baseSnapshot(overrides: Partial<RelatorioSnapshot> = {}): RelatorioSnapshot {
  return {
    relatorio: {
      id: '019966b0-0070-7000-8000-000000000010',
      project_id: '019966b0-0070-7000-8000-000000000011',
      template_id: null,
      template_version: null,
      seed_version: 'v1',
      status: 'rascunho',
      setup: {
        service_start: null,
        service_end: null,
        atividade: null,
        local: 'das Torres A e B da Porto Seguro',
        responsible_user_id: null,
        cover_photo_file_id: null,
        escopo: 'manutenção preventiva e à execução de ensaios dielétricos',
        exclusions: null,
        additional_info: 'Manutenção Preventiva nas Cabines Primárias',
        art_trt_number: null,
        instrument_ids: [],
        site_altitude_m: null,
        site_altitude_confirmed: false,
        next_intervention_date: null,
        next_intervention_justification: null,
      },
      export: { scheme: 'por_local_e_tipo' },
      preview_file_id: null,
      removed_at: null,
    },
    project: { id: '019966b0-0070-7000-8000-000000000011', client_id: null, name: 'Porto Seguro', site: 'Torres A e B', removed_at: null },
    empresa: {
      id: 'e1',
      kind: 'empresa',
      name: 'Fasor Engenharia',
      cnpj: null,
      address: null,
      phone: null,
      email: null,
      form_title: null,
      form_code: null,
      form_revision: null,
      logo_file_id: null,
      watermark_file_id: null,
      cover_background_file_id: null,
      removed_at: null,
    },
    client: { id: 'c1', kind: 'client', name: 'Porto Seguro Companhia de Seguros Gerais', cnpj: null, contact_name: null, contact_phone: null, sites: [], removed_at: null },
    responsible: null,
    instruments: [],
    equipment: [],
    locations: [],
    blocks: [],
    files: [],
    points: [],
    suggestions: [],
    ...overrides,
  };
}

describe('4.2-UNIT / 4.7-UNIT sectionVariables', () => {
  it('resolves obra from setup.local, falling back to project.site then project.name', () => {
    expect(sectionVariables(baseSnapshot(), 'Rafael Lamonde').obra).toBe('das Torres A e B da Porto Seguro');
    const withoutLocal = baseSnapshot();
    withoutLocal.relatorio.setup.local = null;
    expect(sectionVariables(withoutLocal, null).obra).toBe('Torres A e B');
    withoutLocal.project = { ...withoutLocal.project!, site: null };
    expect(sectionVariables(withoutLocal, null).obra).toBe('Porto Seguro');
  });

  it('resolves every other variable off the snapshot and the responsible name', () => {
    const vars = sectionVariables(baseSnapshot(), 'Rafael Lamonde');
    expect(vars.cliente).toBe('Porto Seguro Companhia de Seguros Gerais');
    expect(vars.empresa_executora).toBe('Fasor Engenharia');
    expect(vars.responsavel).toBe('Rafael Lamonde');
    expect(vars.datas).toBeUndefined();
  });

  it('Q3: escopo is the cover\'s Informações adicionais (setup.additional_info), never setup.escopo', () => {
    const vars = sectionVariables(baseSnapshot(), null);
    expect(vars.escopo).toBe('Manutenção Preventiva nas Cabines Primárias');
    const blank = baseSnapshot();
    blank.relatorio.setup.additional_info = '   ';
    expect(sectionVariables(blank, null).escopo).toBeUndefined();
    blank.relatorio.setup.additional_info = null;
    expect(sectionVariables(blank, null).escopo).toBeUndefined();
  });
});

describe('4.2-UNIT section3Text / defaultExclusions', () => {
  it('keeps the seed default when exclusions is null', () => {
    const text = section3Text('v1', TODAY, null);
    expect(text).toContain('Exclusões:');
    expect(text).toContain('Quadros elétricos terminais, localizados nos respectivos setores;');
    expect(defaultExclusions('v1', TODAY)).toEqual([
      'Quadros elétricos terminais, localizados nos respectivos setores;',
      'Painéis e transformadores de rede estabilizada (nobreak);',
      'Geradores e seus periféricos.',
    ]);
  });

  it('keeps the fixed paragraphs but replaces the seeded items when exclusions is given', () => {
    const text = section3Text('v1', TODAY, ['Item A', 'Item B']);
    expect(text).toContain('Exclusões:');
    expect(text).toContain('Item A');
    expect(text).toContain('Item B');
    expect(text).not.toContain('Quadros elétricos terminais');
  });

  it('round-trips: section3Text with defaultExclusions flattens identically to null', () => {
    expect(section3Text('v1', TODAY, defaultExclusions('v1', TODAY))).toBe(section3Text('v1', TODAY, null));
  });

  it('E4 retro item 24: a blank or whitespace-only exclusion never prints, the filled one does', () => {
    expect(printedExclusions(['A', '  ', ''])).toEqual(['A']);
    const items = section3Blocks('v1', TODAY, ['A', '  ', '']).filter((block) => block.kind === 'item');
    expect(items).toEqual([{ kind: 'item', text: 'A' }]);
    expect(section3Text('v1', TODAY, ['A', '  ', ''])).toBe(section3Text('v1', TODAY, ['A']));
  });

  it('E4 retro item 24: withoutExclusion drops the entry at the index and keeps the order', () => {
    expect(withoutExclusion(['A', 'B', 'C'], 1)).toEqual(['A', 'C']);
    expect(withoutExclusion(['A'], 0)).toEqual([]);
  });
});

describe('E4 retro item 22: the section text edited marker', () => {
  it('an edit writes the text with the marker, keeping the rest of the config', () => {
    const config = { block_type: 'section_2', sub_blocks: {}, na_defaults: [], section_text: null };
    const edited = editedSectionTextConfig(config, 'Texto novo');
    expect(edited).toEqual({ ...config, section_text: 'Texto novo', section_text_edited: true });
    expect(sectionTextEdited(edited)).toBe(true);
  });

  it('a restore clears both the text and the marker', () => {
    const restored = restoredSectionTextConfig({ block_type: 'section_2', section_text: 'x', section_text_edited: true });
    expect(restored).toEqual({ block_type: 'section_2', section_text: null, section_text_edited: false });
    expect(sectionTextEdited(restored)).toBe(false);
    expect(sectionTextEdited(null)).toBe(false);
  });
});
