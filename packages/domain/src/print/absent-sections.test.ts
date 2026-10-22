import { describe, expect, it } from 'vitest';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import { pointMovedText, pointSavedText } from '../points/checks.ts';
import { instantiateTemplate } from '../relatorio/instantiate.ts';
import { preIssue } from '../relatorio/pre-issue.ts';
import { generateReason, sumarioRows } from '../relatorio/sumario.ts';
import { progress } from '../relatorio/progress.ts';
import type { BlockRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { standardTemplate } from '../seed/template.ts';
import { composerSectionsWarning } from '../templates/text.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { absentSectionsSentence, parecerAbsentTexts } from './absent-sections.ts';
import { layoutSpec, printedSections, printsSection } from './layout.ts';

/*
 * p020 P-1 (v0.2.0 production check): a template, and so a relatório, without section 8 or
 * section 10. The composer warns; the point toast, Etapa 6 and the Sumário's reason line say
 * what will not print; a relatório with both sections, or printing the seed's eleven, reads
 * as before; nothing printed changes.
 */

const TEMPLATE_ID = '019966b0-0201-7000-8000-000000000001';
const NOW = new Date('2026-09-26T12:00:00.000Z');

function fresh(): RelatorioSnapshot {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: TEMPLATE_ID }),
    { id: TEST_PROJECT },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null },
    { newId: idSequence('019966b0-0202-7000-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0203-7000-8000-'), now: T0 }), seq: i + 1 }));
  return buildSnapshot(replay(ops), relatorioId);
}

/** The snapshot without the live section blocks of `types` (as a template without them makes it). */
function without(snapshot: RelatorioSnapshot, types: readonly string[]): RelatorioSnapshot {
  return { ...snapshot, blocks: snapshot.blocks.filter((block: BlockRow) => !types.includes(block.block_type)) };
}

const TEXT_SECTIONS = ['section_1', 'section_2', 'section_3', 'section_4', 'section_5', 'section_6', 'section_8', 'section_10', 'section_11'];

describe('p020 P-1b printsSection, the one rule', () => {
  it('reads printedSections: the live section blocks, else the seed eleven', () => {
    const snapshot = fresh();
    expect(printsSection(snapshot, 8)).toBe(true);
    expect(printsSection(snapshot, 10)).toBe(true);
    const only79 = without(snapshot, TEXT_SECTIONS);
    expect(printedSections(only79).map((entry) => entry.section)).toEqual([7, 9]);
    expect(printsSection(only79, 8)).toBe(false);
    expect(printsSection(only79, 10)).toBe(false);
    expect(printsSection(only79, 9)).toBe(true);
    // No live section block at all: the seed's eleven print (E78-Q1), 8 and 10 among them.
    const legacy = without(snapshot, [...TEXT_SECTIONS, 'section_7', 'section_9']);
    expect(printsSection(legacy, 8)).toBe(true);
    expect(printsSection(legacy, 10)).toBe(true);
  });

  it('the parecer_missing row still follows section 10 (behavior unchanged)', () => {
    const snapshot = fresh();
    const kinds = (s: RelatorioSnapshot) => preIssue(s, undefined, { now: NOW }).map((row) => row.kind);
    expect(kinds(snapshot)).toContain('parecer_missing');
    expect(kinds(without(snapshot, ['section_10']))).not.toContain('parecer_missing');
    expect(kinds(without(snapshot, [...TEXT_SECTIONS, 'section_7', 'section_9']))).toContain('parecer_missing');
  });

  it('nothing printed changes: the layout of a relatório without 8 and 10 prints only its own sections', () => {
    const only79 = without(fresh(), TEXT_SECTIONS);
    const layout = layoutSpec(only79, { revisionNumber: 1, issuedAt: '2026-09-08T12:00:00.000Z' });
    expect(layout.sections.length).toBe(2);
  });
});

describe('p020 P-1b the texts of a relatório without section 8 or 10', () => {
  it('the point toast and the move announcement name section 8 only when it prints', () => {
    expect(pointSavedText(1, 1, true, 'seção 8')).toBe('Ponto de atenção salvo · 1 de 1 na seção 8');
    expect(pointMovedText(1, 3, true, 'seção 8')).toBe('Ponto de atenção movido: 1 de 3 na seção 8');
    // F43 (UX pass 2026-10-22): the caller names the section as the relatório does.
    expect(pointSavedText(4, 4, true, 'seção 4')).toBe('Ponto de atenção salvo · 4 de 4 na seção 4');
    expect(pointMovedText(1, 3, false, 'seção "Pontos de atenção"')).toBe('Ponto de atenção movido: 1 de 3 · não sai no documento: o relatório não tem a seção "Pontos de atenção"');
  });

  it('Etapa 6: the variant set while section 10 does not print, else null', () => {
    const snapshot = fresh();
    expect(parecerAbsentTexts(snapshot)).toBeNull();
    expect(parecerAbsentTexts(without(snapshot, [...TEXT_SECTIONS, 'section_7', 'section_9']))).toBeNull();
    expect(parecerAbsentTexts(without(snapshot, ['section_8']))).toBeNull();
    expect(parecerAbsentTexts(without(snapshot, ['section_10']))).toEqual({
      // F43 (UX pass 2026-10-22): an absent section is named by its Sumário title, never its FO.SERV-03 number.
      note: 'Este relatório não tem a seção "Conclusão e parecer": o parecer e a assinatura não saem no documento.',
      confirmedHelper: 'Confirmado · não sai no documento: o relatório não tem a seção "Conclusão e parecer"',
      toast: 'Resumo do parecer confirmado',
      kicker: 'Não sai no documento (sem seção "Conclusão e parecer")',
    });
  });

  it('the Sumário sentence: both absent, 8 absent, 10 absent, none; never for the seed eleven', () => {
    const snapshot = fresh();
    expect(absentSectionsSentence(snapshot)).toBeNull();
    expect(absentSectionsSentence(without(snapshot, [...TEXT_SECTIONS, 'section_7', 'section_9']))).toBeNull();
    // F43 (UX pass 2026-10-22): the absent sections by their Sumário titles.
    const both = 'Sem a seção "Pontos de atenção" e a seção "Conclusão e parecer", os pontos de atenção, o parecer e a assinatura não saem no documento.';
    expect(absentSectionsSentence(without(snapshot, TEXT_SECTIONS))).toBe(both);
    expect(absentSectionsSentence(without(snapshot, ['section_8', 'section_10']))).toBe(both);
    expect(absentSectionsSentence(without(snapshot, ['section_8']))).toBe('Sem a seção "Pontos de atenção", os pontos de atenção não saem no documento.');
    expect(absentSectionsSentence(without(snapshot, ['section_10']))).toBe('Sem a seção "Conclusão e parecer", o parecer e a assinatura não saem no documento.');
  });

  it('the reason line ends with the sentence once, after one space; without it, as before', () => {
    const only79 = without(fresh(), TEXT_SECTIONS);
    const computed = progress(only79);
    const issues = preIssue(only79, computed, { now: NOW });
    const rows = sumarioRows(only79, issues, computed);
    const before = generateReason(rows, issues);
    const sentence = absentSectionsSentence(only79)!;
    expect(generateReason(rows, issues, undefined, null)).toBe(before);
    const reason = generateReason(rows, issues, undefined, sentence);
    expect(reason).toBe(`${before} ${sentence}`);
    expect(reason.split(sentence)).toHaveLength(2);
  });
});

describe('p020 P-1a composerSectionsWarning', () => {
  it('every variant from the template section types', () => {
    expect(composerSectionsWarning([])).toBe(
      'Este template não tem seções de texto: os relatórios saem só com as seções 7 e 9, sem pontos de atenção, parecer e assinatura.',
    );
    expect(composerSectionsWarning(['section_1', 'section_10'])).toBe('Sem a seção 8, os pontos de atenção não saem nos relatórios deste template.');
    expect(composerSectionsWarning(['section_1', 'section_8'])).toBe('Sem a seção 10, o parecer e a assinatura não saem nos relatórios deste template.');
    expect(composerSectionsWarning(['section_1', 'section_11'])).toBe(
      'Sem as seções 8 e 10, os pontos de atenção, o parecer e a assinatura não saem nos relatórios deste template.',
    );
    expect(composerSectionsWarning(['section_8', 'section_10'])).toBeNull();
    expect(composerSectionsWarning(TEXT_SECTIONS)).toBeNull();
  });
});
