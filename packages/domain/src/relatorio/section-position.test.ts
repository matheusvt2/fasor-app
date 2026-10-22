import { describe, expect, it } from 'vitest';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import { layoutSpec } from '../print/layout.ts';
import type { BlockRow, PointRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { SEED_VERSION } from '../seed/definitions.ts';
import { standardTemplate } from '../seed/template.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { instantiateTemplate } from './instantiate.ts';
import { composeParecer } from './parecer.ts';
import { sectionMention, sectionPosition, sectionRefText, sectionsCaption } from './section-position.ts';
import { sectionVariables } from './section-variables.ts';
import { sumarioLineOf, sumarioRows } from './sumario.ts';
import { preIssue } from './pre-issue.ts';
import { progress } from './progress.ts';

/*
 * UX pass 2026-10-22 (F43/F17): every section number a person reads is the section's Sumário
 * position. A compact template carries sections 1, 5, 7, 8, 9 and 10 (no 2, 3, 4, 6, 11): the
 * Sumário and the document number them 1 to 6, so Pontos de atenção is 4, Relatórios dos
 * ensaios 5 and Conclusão e parecer 6, and Certificados has no number.
 */

const TEMPLATE_ID = '019966b0-0221-7000-8000-000000000001';
const NOW = new Date('2026-10-22T12:00:00.000Z');

function fresh(): RelatorioSnapshot {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: TEMPLATE_ID }),
    { id: TEST_PROJECT },
    { service_start: '2026-10-20', service_end: '2026-10-21', existingEquipment: [], responsible_user_id: null },
    { newId: idSequence('019966b0-0222-7000-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0223-7000-8000-'), now: T0 }), seq: i + 1 }));
  return buildSnapshot(replay(ops), relatorioId);
}

function without(snapshot: RelatorioSnapshot, types: readonly string[]): RelatorioSnapshot {
  return { ...snapshot, blocks: snapshot.blocks.filter((block: BlockRow) => !types.includes(block.block_type)) };
}

const COMPACT_DROPS = ['section_2', 'section_3', 'section_4', 'section_6', 'section_11'];
const compact = () => without(fresh(), COMPACT_DROPS);

function point(snapshot: RelatorioSnapshot, n: number): PointRow {
  return {
    id: `019966b0-0224-7000-8000-${n.toString(16).padStart(12, '0')}`,
    relatorio_id: snapshot.relatorio.id,
    text: `Ponto ${n}`,
    equipment_id: null,
    origin: 'manual',
    order_key: `a${n}`,
    removed_at: null,
    action: null,
    priority: null,
    deadline: null,
    owner: null,
  };
}

/** Every printed text of a layout's sections, one string. */
function printedText(snapshot: RelatorioSnapshot): string {
  return JSON.stringify(layoutSpec(snapshot, { revisionNumber: 1, issuedAt: NOW.toISOString() }).sections);
}

describe('F43 sectionPosition: the Sumário position of a FO.SERV-03 section', () => {
  it('a compact template: 1, 5, 7, 8, 9, 10 are 1 to 6, the others absent, as the Sumário numbers them', () => {
    const snapshot = compact();
    expect([1, 5, 7, 8, 9, 10].map((section) => sectionPosition(snapshot, section))).toEqual([1, 2, 3, 4, 5, 6]);
    expect([2, 3, 4, 6, 11].map((section) => sectionPosition(snapshot, section))).toEqual([null, null, null, null, null]);
    const computed = progress(snapshot);
    const rows = sumarioRows(snapshot, preIssue(snapshot, computed, { now: NOW }), computed);
    for (const section of [1, 5, 7, 8, 9, 10]) expect(sumarioLineOf(rows, `section_${section}` as 'section_1')).toBe(sectionPosition(snapshot, section));
  });

  it('the standard template and a snapshot with no section block (the seed eleven) keep the FO.SERV-03 numbers', () => {
    const full = fresh();
    expect([1, 8, 9, 10, 11].map((section) => sectionPosition(full, section))).toEqual([1, 8, 9, 10, 11]);
    const legacy = { ...full, blocks: full.blocks.filter((block) => block.location_id !== null) };
    expect([1, 8, 9, 10, 11].map((section) => sectionPosition(legacy, section))).toEqual([1, 8, 9, 10, 11]);
  });

  it('sectionRefText and sectionsCaption name a carried section by its position, an absent one by its Sumário title', () => {
    const snapshot = compact();
    expect(sectionRefText(snapshot, 8)).toBe('seção 4');
    expect(sectionRefText(snapshot, 9, true)).toBe('Seção 5');
    expect(sectionRefText(snapshot, 11)).toBe('seção "Certificados"');
    expect(sectionsCaption(snapshot, [1, 3])).toBe('Seção 1');
    expect(sectionsCaption(snapshot, [10])).toBe('Seção 6');
    expect(sectionsCaption(snapshot, [11])).toBe('Seção "Certificados"');
    expect(sectionsCaption(fresh(), [1, 3])).toBe('Seções 1 e 3');
  });

  it('sectionMention: a carried section prints under its position; an absent one carries the absent wording', () => {
    const snapshot = compact();
    expect(sectionMention(snapshot, 8)).toEqual({ ref: 'seção 4', prints: true, absent: 'não sai no documento: o relatório não tem a seção 4' });
    expect(sectionMention(snapshot, 11)).toEqual({ ref: 'seção "Certificados"', prints: false, absent: 'não sai no documento: o relatório não tem a seção "Certificados"' });
    expect(sectionMention(fresh(), 11).prints).toBe(true);
  });

  it('the composed parecer counts the points "na seção 4", by position', () => {
    const base = compact();
    const snapshot = { ...base, points: [point(base, 1), point(base, 2)] };
    expect(composeParecer(snapshot).text).toContain('Foram registrados 2 pontos de atenção na seção 4.');
    const full = fresh();
    expect(composeParecer({ ...full, points: [point(full, 1)] }).text).toContain('Foi registrado 1 ponto de atenção na seção 8.');
  });
});

describe('F43 seed v8: the Conclusão names sections 8 and 9 by their Sumário positions', () => {
  it('{itens_resultados} names the carried sections 8 and 9 by position: two, one, none', () => {
    // Seed v9 keeps v8's Conclusão text.
    expect(SEED_VERSION).toBe('v9');
    expect(sectionVariables(compact(), null)).toMatchObject({ itens_resultados: 'nos itens 4 e 5' });
    expect(sectionVariables(fresh(), null)).toMatchObject({ itens_resultados: 'nos itens 8 e 9' });
    // Without section 8 the compact template is 1, 5, 7, 9, 10: section 9 is row 4.
    expect(sectionVariables(without(compact(), ['section_8']), null)).toMatchObject({ itens_resultados: 'no item 4' });
    expect(sectionVariables(without(compact(), ['section_9']), null)).toMatchObject({ itens_resultados: 'no item 4' });
    expect(sectionVariables(without(compact(), ['section_8', 'section_9']), null)).toMatchObject({ itens_resultados: 'no corpo' });
  });

  it('a v8 compact relatório prints "itens 4 e 5"; a v7 one keeps FO.SERV-03\'s "itens 8 e 9"', () => {
    const v8 = compact();
    expect(v8.relatorio.seed_version).toBe('v9');
    const printed = printedText(v8);
    expect(printed).toContain('encontram-se nos itens 4 e 5 deste relatório;');
    expect(printed).toContain('constantes nos itens 4 e 5 deste sejam atendidas.');
    expect(printed).not.toContain('itens 8 e 9');
    expect(printed).not.toContain('{secao_');
    const v7 = { ...v8, relatorio: { ...v8.relatorio, seed_version: 'v7' } };
    expect(printedText(v7)).toContain('encontram-se nos itens 8 e 9 deste relatório;');
    expect(printedText(v7)).not.toContain('itens 4 e 5');
  });
});
