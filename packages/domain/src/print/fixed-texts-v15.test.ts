import { describe, expect, it } from 'vitest';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import { artTrtEchoText } from '../registration.ts';
import { instantiateTemplate } from '../relatorio/instantiate.ts';
import { headerText } from '../relatorio/reading-cells.ts';
import { RELAY_CLAUSE, namesRelay, section3Blocks, sectionVariables } from '../relatorio/section-variables.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { EMPTY_DEFINITION_CONTEXT } from '../seed/definitions.ts';
import { SECTION_TITLES_V1 } from '../seed/sections-v1.ts';
import { standardTemplate } from '../seed/template.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { layoutSpec, type LayoutSection } from './layout.ts';
import { validityLine } from './section-10.ts';

/*
 * Story 25.22 (seed v15 `obra_reads_site`, `relay_clause_by_exclusions`, `validity_line_without_number` and its own
 * section texts): the kernel texts with each flag on (v15) and off (v14). Every value is invented.
 */

const ISSUED_AT = '2026-11-12T12:00:00.000Z';
const SITE = 'Unidade Sintética Norte';
const NAME = 'Obra sintética';
const LOCAL = 'Sala elétrica';

function snapshotOn(seedVersion: string, setup: Partial<RelatorioSnapshot['relatorio']['setup']> = {}, site: string | null = SITE): RelatorioSnapshot {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: '019a6100-2522-7000-8000-000000000001', seedVersion }),
    { id: TEST_PROJECT },
    { service_start: '2026-11-06', service_end: '2026-11-08', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
    { newId: idSequence('019a6100-2522-7000-8001-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-2522' }, { newId: idSequence('019a6100-2522-7000-8002-'), now: T0 }), seq: i + 1 }));
  const snapshot = buildSnapshot(replay(ops), relatorioId);
  return {
    ...snapshot,
    project: { id: TEST_PROJECT, client_id: null, name: NAME, site, removed_at: null },
    relatorio: { ...snapshot.relatorio, setup: { ...snapshot.relatorio.setup, local: LOCAL, ...setup } },
  };
}

const layoutOf = (snapshot: RelatorioSnapshot) => layoutSpec(snapshot, { revisionNumber: 1, issuedAt: ISSUED_AT });
const cityRow = (snapshot: RelatorioSnapshot) => layoutOf(snapshot).cover.table.rows.find((row) => row.label === 'Cidade/local')!.value;
const textOf = (snapshot: RelatorioSnapshot, section: string): string[] => {
  const built = layoutOf(snapshot).sections.find((one) => one.title === SECTION_TITLES_V1[section]) as Extract<LayoutSection, { kind: 'text' }>;
  return built.paragraphs.map((paragraph) => paragraph.text);
};
const validityOf = (snapshot: RelatorioSnapshot) => (layoutOf(snapshot).sections.find((one) => one.kind === 'section_10') as Extract<LayoutSection, { kind: 'section_10' }>).validityLine;

describe('25.22-UNIT `{obra}`: the obra\'s site, then its name, on v15; the setup\'s Local first on v14', () => {
  it('v15: the cover\'s "Cidade/local" and section 1 read the site, never the Local', () => {
    const v15 = snapshotOn('v15');
    expect(sectionVariables(v15, null).obra).toBe(SITE);
    expect(cityRow(v15)).toBe(SITE);
    expect(textOf(v15, '1')[0]).toMatch(new RegExp(`Transformação da \\[Cliente\\], unidade ${SITE}\\.$`));
  });

  it('v15 with no site: the obra\'s name; with neither, the variable is missing', () => {
    expect(sectionVariables(snapshotOn('v15', {}, null), null).obra).toBe(NAME);
    expect(sectionVariables(snapshotOn('v15', {}, '  '), null).obra).toBe(NAME);
    expect(cityRow(snapshotOn('v15', {}, null))).toBe(NAME);
    const none = snapshotOn('v15', {}, null);
    expect(sectionVariables({ ...none, project: null }, null).obra).toBeUndefined();
  });

  it('flag off (v14): the setup\'s Local first, as before, and section 1 keeps its wording', () => {
    const v14 = snapshotOn('v14');
    expect(sectionVariables(v14, null).obra).toBe(LOCAL);
    expect(cityRow(v14)).toBe(LOCAL);
    expect(textOf(v14, '1')[0]).toMatch(new RegExp(`Transformação de ${LOCAL} da \\[Cliente\\]\\.$`));
  });
});

describe('25.22-UNIT section 3: the relay clause only while no exclusion names a relay', () => {
  const first = (blocks: ReturnType<typeof section3Blocks>) => blocks.find((block) => block.kind === 'paragraph')!.text;

  it('names a relay without case and without accents, and only as a word', () => {
    for (const text of ['Relés de proteção', 'RELE SECUNDARIO', 'relê', 'Painel do relé']) expect(namesRelay(text), text).toBe(true);
    for (const text of ['Quadros elétricos terminais', 'Releitura', 'Geradores e seus periféricos.', '']) expect(namesRelay(text), text).toBe(false);
  });

  it('v15: the seed\'s exclusions and a list naming no relay keep the clause; a relay exclusion ends the paragraph before it', () => {
    expect(first(section3Blocks('v15', '2026-11-12', null))).toMatch(new RegExp(`${RELAY_CLAUSE}\\.$`));
    expect(first(section3Blocks('v15', '2026-11-12', ['Geradores']))).toMatch(new RegExp(`${RELAY_CLAUSE}\\.$`));
    const without = section3Blocks('v15', '2026-11-12', ['Geradores', 'Relés de proteção']);
    expect(first(without)).toBe('Os serviços executados limitam-se à execução de ensaios elétricos e inspeções técnicas nos equipamentos integrantes do sistema de Média Tensão.');
    expect(without.filter((block) => block.kind === 'item').map((block) => block.text)).toEqual(['Geradores', 'Relés de proteção']);
    expect(textOf(snapshotOn('v15', { exclusions: ['Relés de proteção'] }), '3')[0]).not.toContain('relé');
  });

  it('flag off (v14): a relay exclusion leaves the clause', () => {
    expect(first(section3Blocks('v14', '2026-11-12', ['Relés de proteção']))).toMatch(new RegExp(`${RELAY_CLAUSE}\\.$`));
  });
});

describe('25.22-UNIT the validity line', () => {
  it('without the number: the same line with the ART filled and blank, by council', () => {
    expect(validityLine('crea', '123', true)).toBe('Este relatório tem validade apenas acompanhado da respectiva ART.');
    expect(validityLine('crea', null, true)).toBe('Este relatório tem validade apenas acompanhado da respectiva ART.');
    expect(validityLine('crt', '9', true)).toBe('Este relatório tem validade apenas acompanhado da respectiva TRT.');
    expect(validityLine(null, '', true)).toBe('Este relatório tem validade apenas acompanhado da respectiva ART/TRT.');
  });

  it('v15 prints it whatever the number; v14 (flag off) prints the number or the bracket', () => {
    expect(validityOf(snapshotOn('v15', { art_trt_number: '2620262602583' }))).toBe(validityOf(snapshotOn('v15', { art_trt_number: null })));
    expect(validityOf(snapshotOn('v15', { art_trt_number: null }))).toBe('Este relatório tem validade apenas acompanhado da respectiva ART/TRT.');
    expect(validityOf(snapshotOn('v14', { art_trt_number: '2620262602583' }))).toBe('Este relatório tem validade apenas acompanhada da ART/TRT 2620262602583');
    expect(validityOf(snapshotOn('v14', { art_trt_number: null }))).toBe('Este relatório tem validade apenas acompanhada da ART/TRT [ART/TRT]');
  });

  it('the setup\'s echo of the number is not shown on v15, where section 10 does not print it', () => {
    expect(artTrtEchoText('ART', '123', 'seção 10', 'v15')).toBeNull();
    expect(artTrtEchoText('ART', '123', 'seção 10', 'v14')).toBe('Na seção 10: "Este relatório tem validade apenas acompanhada da ART 123"');
  });
});

describe('25.22-UNIT the printed sections of a v15 relatório with the seed\'s own texts', () => {
  it('sections 2, 4, 5 and 6 print the corrected texts; v14 prints FO.SERV-03\'s', () => {
    const v15 = snapshotOn('v15');
    const all = ['2', '4', '5', '6'].flatMap((section) => textOf(v15, section)).join('\n');
    expect(all).not.toContain('NBR 5419');
    expect(all).toContain('falhas iminentes');
    for (const word of ['EPCs', 'EPIs', 'QGBTs', '(a seco)', 'Conforme NR-10, item 10.5.1:']) expect(all, word).toContain(word);
    const v14 = ['2', '4', '5', '6'].flatMap((section) => textOf(snapshotOn('v14'), section)).join('\n');
    for (const word of ['NBR 5419', 'falhas eminentes', 'EPC’s', 'EPI’s', 'QGBT’s', '(à seco)', 'capítulo 5.1']) expect(v14, word).toContain(word);
  });
});

describe('25.22-UNIT the ratio headers on screen', () => {
  it('"TPs" and "TCs" read as written; the older "TP\'s" and "TPS" as before', () => {
    expect(['TPs', 'TCs', "TP's", 'TPS'].map(headerText)).toEqual(['TPs', 'TCs', "TP's", 'TPS']);
  });
});
