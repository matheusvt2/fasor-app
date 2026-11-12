import { layoutSpec, RELAY_CLAUSE, type RelatorioSnapshot } from '@app/domain';
import { LAYOUT_LOCK_ISSUED_AT, layoutLockEpic25Snapshot } from '@app/domain/fixtures/layout-lock';
import { describe, expect, it } from 'vitest';
import { buildDocx } from './docx.ts';
import { extractStructure } from './docx-structure.test-support.ts';
import { placeholderPages } from './toc.ts';

/*
 * 25.22-INT (batch e25p, Story 25.22, seed v15 `obra_reads_site`, `relay_clause_by_exclusions`,
 * `validity_line_without_number` and its own section texts and ratio headers): the DOCX of the Epic 25 layout-lock
 * relatório (Etapa 2's Local beside the obra's site, an exclusion naming the relays, a blank ART; one sheet of every
 * type, the TP and the TC with their ratio tables) on v15, with and without the relay exclusion and with and without
 * the ART; the same relatório on v14 prints FO.SERV-03's texts (its golden pins every byte). Every value is invented.
 */

const SITE = 'Avenida Sintética, 250';
const LOCAL = 'Galpão de utilidades';

async function docxOf(snapshot: RelatorioSnapshot) {
  const layout = layoutSpec(snapshot, { revisionNumber: 1, issuedAt: LAYOUT_LOCK_ISSUED_AT });
  return extractStructure(await buildDocx(layout, { tocPages: placeholderPages(layout) }));
}

function withSetup(snapshot: RelatorioSnapshot, setup: Partial<RelatorioSnapshot['relatorio']['setup']>): RelatorioSnapshot {
  return { ...snapshot, relatorio: { ...snapshot.relatorio, setup: { ...snapshot.relatorio.setup, ...setup } } };
}

const cityOf = (tables: string[][][]) => tables.flatMap((table) => table).find((row) => row[0] === 'Cidade/local')?.[1];
const section3First = (paragraphs: string[]) => paragraphs.find((p) => p.startsWith('Os serviços executados limitam-se'))!;
const validityOf = (paragraphs: string[]) => paragraphs.filter((p) => p.startsWith('Este relatório tem validade apenas'));
/** The ratio tables' first-column headers the DOCX holds, each once, in order: of v15's and of every older seed's. */
const ratioHeaders = (tables: string[][][]) => [...new Set(tables.flat(2).filter((cell) => ['TPs', 'TCs', "TP's", 'TPS'].includes(cell)))];
/** The council of the fixture's responsible is not set, so the line names "ART/TRT" (the label rule of Story 7.4, unchanged). */
const LINE_V15 = 'Este relatório tem validade apenas acompanhado da respectiva ART/TRT.';

describe('25.22-INT the DOCX of a v15 relatório: the cover, the fixed texts, section 3\'s ending, the validity line and the ratio headers', () => {
  it('the relay exclusion and a blank ART: the site on the cover and in section 1, no relay clause, the line with no number', async () => {
    const snapshot = layoutLockEpic25Snapshot('v15');
    expect(snapshot.relatorio.setup.local).toBe(LOCAL);
    expect(snapshot.relatorio.setup.art_trt_number ?? '').toBe('');
    const { tables, paragraphs } = await docxOf(snapshot);
    expect(cityOf(tables)).toBe(SITE);
    expect(paragraphs.join('\n')).not.toContain(LOCAL);
    expect(paragraphs.find((p) => p.startsWith('O presente relatório tem por objetivo'))).toMatch(new RegExp(`Transformação da .+, unidade ${SITE}\\.$`));
    expect(section3First(paragraphs)).toBe('Os serviços executados limitam-se à execução de ensaios elétricos e inspeções técnicas nos equipamentos integrantes do sistema de Média Tensão.');
    expect(validityOf(paragraphs)).toEqual([LINE_V15]);
    expect(paragraphs.join('\n')).not.toMatch(/\[ART(\/TRT)?\]/);
    // Sections 2 and 4 to 6.
    const all = paragraphs.join('\n');
    expect(all).not.toContain('NBR 5419');
    expect(all).toContain('falhas iminentes');
    for (const word of ['EPCs', 'EPIs', 'QGBTs', 'Transformador de Força (a seco)', 'Conforme NR-10, item 10.5.1:']) expect(all, word).toContain(word);
    for (const word of ['EPC’s', 'EPI’s', 'QGBT’s', 'à seco', 'capítulo 5.1', 'eminentes']) expect(all, word).not.toContain(word);
    // The ratio tables: the TP's, then the TC's.
    expect(ratioHeaders(tables)).toEqual(['TPs', 'TCs']);
  });

  it('no exclusion naming a relay and the ART filled: the clause stays, and the validity line is the same', async () => {
    const snapshot = withSetup(layoutLockEpic25Snapshot('v15'), { exclusions: ['Quadros elétricos terminais, localizados nos respectivos setores;'], art_trt_number: '2620262602583' });
    const { paragraphs } = await docxOf(snapshot);
    expect(section3First(paragraphs)).toMatch(new RegExp(`Média Tensão${RELAY_CLAUSE}\\.$`));
    expect(validityOf(paragraphs)).toEqual([LINE_V15]);
    expect(paragraphs.join('\n')).not.toContain('2620262602583');
  });

  it('the obra with no site: its name on the cover and in section 1', async () => {
    const base = layoutLockEpic25Snapshot('v15');
    const { tables, paragraphs } = await docxOf({ ...base, project: { ...base.project!, site: null } });
    expect(cityOf(tables)).toBe(base.project!.name);
    expect(paragraphs.find((p) => p.startsWith('O presente relatório tem por objetivo'))).toContain(`, unidade ${base.project!.name}.`);
  });

  it('the same relatório on v14 prints FO.SERV-03\'s texts: the Local, the relay clause, "[ART/TRT]"-style line, "TP\'s" and "TPS"', async () => {
    const { tables, paragraphs } = await docxOf(layoutLockEpic25Snapshot('v14'));
    expect(cityOf(tables)).toBe(LOCAL);
    expect(section3First(paragraphs)).toMatch(new RegExp(`${RELAY_CLAUSE}\\.$`));
    expect(validityOf(paragraphs)).toHaveLength(1);
    expect(validityOf(paragraphs)[0]).toMatch(/^Este relatório tem validade apenas acompanhada da (ART|TRT|ART\/TRT) \[(ART|TRT|ART\/TRT)\]$/);
    expect(paragraphs.join('\n')).toContain('NBR 5419');
    expect(ratioHeaders(tables)).toEqual(["TP's", 'TPS']);
  });
});
