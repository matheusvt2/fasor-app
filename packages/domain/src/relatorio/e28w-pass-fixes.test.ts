import { describe, expect, it } from 'vitest';
import { layoutLockSnapshot } from '../../fixtures/layout-lock/op-log.ts';
import { ncRowPointText } from '../points/derived.ts';
import type { BlockRow, Cell } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { SEED_VERSIONS, seedRule, siteItems } from '../seed/definitions.ts';
import { labelInSentence } from './label-in-sentence.ts';
import { composeParecer } from './parecer.ts';
import { blockingRows, issueBlockedReason, parecerMissingReason, preIssue, type PreIssueRow } from './pre-issue.ts';
import { inlineLabel, SCREEN_LABEL_ACRONYMS } from './screen-label.ts';

/*
 * Fix batch e28w, three findings of the hands-on pass of 2026-11-23 on main 82529122. Every value is invented.
 * S1: the reason beside a blocked "Gerar relatório" names the empty utility name, not the parecer.
 * S3: the point an NC row starts keeps the label's acronyms ("PT100"), on a v18 relatório only; older seeds print as before.
 */

const id = (n: number) => `019966b0-0284-7000-8000-${n.toString(16).padStart(12, '0')}`;
let opCounter = 0;
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: id(95_000 + ++opCounter) });

describe('e28w-UNIT-001 (S1) the reason beside a blocked "Gerar relatório" names the empty utility name', () => {
  const withMark = (count: number) => {
    const snapshot = structuredClone(layoutLockSnapshot('v18'));
    const targets = snapshot.blocks.filter((one) => (one.block_type === 'tc' || one.block_type === 'tp') && one.removed_at === null).slice(0, count);
    expect(targets).toHaveLength(count);
    const ids = new Set(targets.map((one) => one.id));
    snapshot.blocks = snapshot.blocks.map((one) =>
      ids.has(one.id) ? { ...one, not_tested: { reason: 'equipamento_concessionaria', text: null, at: '2026-11-23T12:00:00.000Z', by: id(9), utility_name: null } as BlockRow['not_tested'] } : one,
    );
    const tags = targets.map((one) => snapshot.equipment.find((row) => row.id === one.equipment_id)!.tag);
    return { snapshot, tags };
  };
  const parecerRow: PreIssueRow = { id: 'parecer_missing', row: 'section_10', severity: 'blocking', text: 'Parecer não preenchido', kind: 'parecer_missing' };

  it('the utility row alone: its own ask, never the parecer\'s', () => {
    const { snapshot, tags } = withMark(1);
    const blocking = blockingRows(preIssue(snapshot)).filter((row) => row.kind === 'utility_name_missing');
    expect(blocking).toHaveLength(1);
    expect(issueBlockedReason(blocking, 1, 10)).toBe(`Preencha o nome da concessionária de ${tags[0]} para emitir a revisão 1. O rascunho pode ser visto antes.`);
  });

  it('two sheets, and the parecer with them', () => {
    const { snapshot, tags } = withMark(2);
    const utility = blockingRows(preIssue(snapshot)).filter((row) => row.kind === 'utility_name_missing');
    expect(issueBlockedReason(utility, 2, 10)).toBe(`Preencha o nome da concessionária de ${tags[0]} e ${tags[1]} para emitir a revisão 2. O rascunho pode ser visto antes.`);
    expect(issueBlockedReason([parecerRow, ...utility], 2, 10)).toBe(
      `Preencha o parecer (linha 10 do sumário) e o nome da concessionária de ${tags[0]} e ${tags[1]} para emitir a revisão 2. O rascunho pode ser visto antes.`,
    );
  });

  it('the parecer alone and the stale text read as before', () => {
    expect(issueBlockedReason([parecerRow], 3, 10)).toBe(parecerMissingReason(3, 10));
    const stale: PreIssueRow = { id: 'conclusion_stale', row: 'section_9', severity: 'blocking', text: 'x', kind: 'conclusion_stale', sheets: [{ blockId: id(1), name: 'SEC-C05' }] };
    expect(issueBlockedReason([stale], 3, 10)).toBe('Atualize o texto da conclusão de SEC-C05 para emitir a revisão 3. O rascunho pode ser visto antes.');
    expect(issueBlockedReason([parecerRow, stale], 3, 10)).toBe('Preencha o parecer (linha 10 do sumário) e atualize o texto da conclusão de SEC-C05 para emitir a revisão 3. O rascunho pode ser visto antes.');
    // A stale text beside the utility's name: the text first, the name closing the list.
    const utility: PreIssueRow = { id: 'utility_name_missing', row: 'section_9', severity: 'blocking', text: 'x', kind: 'utility_name_missing', sheets: [{ blockId: id(2), name: 'CE-01' }] };
    expect(issueBlockedReason([stale, utility], 3, 10)).toBe('Atualize o texto da conclusão de SEC-C05 e preencha o nome da concessionária de CE-01 para emitir a revisão 3. O rascunho pode ser visto antes.');
    // A sheet with no TAG: the ask without the name.
    expect(issueBlockedReason([{ ...utility, sheets: [{ blockId: id(2), name: '' }] }], 1, null)).toBe('Preencha o nome da concessionária para emitir a revisão 1. O rascunho pode ser visto antes.');
  });
});

describe('e28w-UNIT-002 (S3) a label inside a sentence keeps the acronyms of `SCREEN_LABEL_ACRONYMS`', () => {
  it('item 18\'s dry words keep "PT100"; every acronym of the list keeps its screen form; "NA" in a phrase is the preposition', () => {
    expect(inlineLabel('SENSORES DE TEMPERATURA (PT100) E RELÉ TÉRMICO: ALARME E DESLIGAMENTO')).toBe('sensores de temperatura (PT100) e relé térmico: alarme e desligamento');
    for (const acronym of SCREEN_LABEL_ACRONYMS) {
      if (acronym === 'NA') continue;
      expect(inlineLabel(`ESTADO DO ${acronym.toLocaleUpperCase('pt-BR')} GERAL`), acronym).toBe(`estado do ${acronym} geral`);
      expect(inlineLabel(`Estado do ${acronym} geral`), acronym).toBe(`estado do ${acronym} geral`);
    }
    expect(inlineLabel('TRINCAS NA RESINA')).toBe('trincas na resina');
    expect(inlineLabel('NA')).toBe('NA');
    // A word that only spells an acronym in lower case or capitalised is the word.
    expect(inlineLabel('Se houver, verificar na base')).toBe('se houver, verificar na base');
  });

  it('the NC row\'s point text on a dry v18 transformer reads "PT100"', () => {
    const snapshot = structuredClone(layoutLockSnapshot('v18'));
    const block = snapshot.blocks.find((one) => one.block_type === 'transformador_forca' && one.removed_at === null)!;
    const dry = structuredClone(block);
    dry.sheet.nameplate.tipo_de_isolacao = cell('A SECO');
    dry.sheet.checklist.temperatura_alarme_e_desligamento = { result: cell('NC'), observation: cell(null) } as never;
    expect(ncRowPointText(snapshot as Pick<RelatorioSnapshot, 'files' | 'relatorio' | 'equipment_types'>, { block: dry }, 'temperatura_alarme_e_desligamento')).toBe(
      'Item 18 (sensores de temperatura (PT100) e relé térmico: alarme e desligamento) não conforme',
    );
  });

  /** Every checklist and site label of a seed version, as the kernel lowers it into a sentence, beside the label lowered whole. */
  const sentenceLabels = (version: string) => {
    const seed = SEED_VERSIONS[version]!.report_types.cabine_primaria;
    const labels = [
      ...Object.values(seed.blocks).flatMap((definition) => (definition.checklist ?? []).flatMap((item) => [item.label, ...(item.dry_label === undefined ? [] : [item.dry_label])])),
      ...siteItems(version).map((item) => item.label),
    ];
    return labels.map((label) => ({ label, inSentence: labelInSentence(label, version), lowered: label.toLocaleLowerCase('pt-BR') }));
  };

  it('no older seed moves: on v1 to v17 every label still lowers whole, though the acronym rule would keep v6 to v17\'s "LEDs"', () => {
    const older = Object.keys(SEED_VERSIONS).filter((version) => version !== 'v18');
    expect(older).toHaveLength(17);
    for (const version of older) {
      expect(seedRule(version, 'label_acronyms_inline'), version).toBe(false);
      for (const { label, inSentence, lowered } of sentenceLabels(version)) expect(inSentence, `${version} ${label}`).toBe(lowered);
    }
    // Why the rule is a v18 flag and not general: these older labels would print differently under it.
    expect(inlineLabel('DISPLAY, ALARMES E LEDS')).toBe('display, alarmes e LEDs');
    expect(sentenceLabels('v17').some(({ label }) => inlineLabel(label) !== label.toLocaleLowerCase('pt-BR'))).toBe(true);
  });

  it('on v18 the rule is on: item 18\'s "PT100" and the No-break\'s "LEDs" keep their form', () => {
    expect(seedRule('v18', 'label_acronyms_inline')).toBe(true);
    const labels = sentenceLabels('v18');
    expect(labels.find(({ label }) => label.includes('PT100'))!.inSentence).toBe('sensores de temperatura (PT100) e relé térmico: alarme e desligamento');
    expect(labels.find(({ label }) => label === 'DISPLAY, ALARMES E LEDS')!.inSentence).toBe('display, alarmes e LEDs');
  });

  it('the parecer\'s "Itens não conformes" names item 18 with "PT100" on v18', () => {
    const snapshot = structuredClone(layoutLockSnapshot('v18'));
    const block = snapshot.blocks.find((one) => one.block_type === 'transformador_forca' && one.removed_at === null)!;
    snapshot.blocks = snapshot.blocks.map((one) => {
      if (one.id !== block.id) return one;
      const dry = structuredClone(one);
      dry.sheet.nameplate.tipo_de_isolacao = cell('A SECO');
      dry.sheet.checklist.temperatura_alarme_e_desligamento = { result: cell('NC'), observation: cell(null) } as never;
      return dry;
    });
    expect(composeParecer(snapshot).text).toContain('item 18 (sensores de temperatura (PT100) e relé térmico: alarme e desligamento) em 1 ficha');
  });
});
