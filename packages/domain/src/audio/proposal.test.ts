import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { aiWriteResponseSchema } from '../contract/transcription.ts';
import { relatorioSnapshotSchema, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { aiRewriteComparison, aiRewriteDiff, aiRewriteRefusalText, guardedWordFlags, type AiDiffSegment, type AiRewriteRefusal } from './index.ts';

/*
 * Story 31.10 (Matheus, 2026-11-27): the AI control proposes before it writes, and a refusal says
 * why. The word diff of the comparison (numbers, units and TAGs never marked: the guard kept them),
 * the comparison of a field's text with a proposal (a section text keeps its blocks), the refusal's
 * two-part line for each case, and the optional answer fields of the route.
 */

const small = (): RelatorioSnapshot =>
  relatorioSnapshotSchema.parse(JSON.parse(readFileSync(fileURLToPath(new URL('../../fixtures/porto-seguro/small/snapshot.golden.json', import.meta.url)), 'utf8')));

const SECCIONADORA = '019966c1-0000-7000-8000-00000000000c';
const ID = '019966b0-0031-7000-8000-0000000000b1';
const opts = { now: new Date('2026-09-27T12:00:00Z') };

const changed = (segments: AiDiffSegment[]): string[] => segments.filter((one) => one.changed).map((one) => one.text);
const joined = (segments: AiDiffSegment[]): string => segments.map((one) => one.text).join('');

describe('31.10-UNIT-001 the word diff of a proposal', () => {
  it('marks the words the proposal changed, compared without case, accents and the punctuation around a word', () => {
    const source = 'contato fase b aquecido oxidado';
    const proposal = 'Contatos da fase B com sinais de aquecimento e oxidação.';
    const segments = aiRewriteDiff(source, proposal);
    expect(joined(segments)).toBe(proposal);
    expect(changed(segments)).toEqual(['Contatos da', 'com sinais de aquecimento e oxidação.']);
  });

  it('an unchanged text has no mark; a case or punctuation change alone is no change', () => {
    expect(changed(aiRewriteDiff('Contatos limpos.', 'Contatos limpos.'))).toEqual([]);
    expect(changed(aiRewriteDiff('contatos limpos', 'Contatos limpos.'))).toEqual([]);
    expect(changed(aiRewriteDiff('isolação verificada', 'Isolacao verificada'))).toEqual([]);
  });

  it('never marks a number, a unit after a number or a TAG, even when it moved', () => {
    const source = 'TR-01 isolação 147 giga, tensão 13,8 kV e 23 graus celsius';
    const proposal = 'A tensão de 13,8 kV no TR-01, com isolação de 147 giga a 23 graus celsius.';
    const marks = changed(aiRewriteDiff(source, proposal)).join(' | ');
    for (const kept of ['13,8', 'kV', 'TR-01', '147', 'giga', '23', 'graus', 'celsius']) expect(marks).not.toContain(kept);
    expect(joined(aiRewriteDiff(source, proposal))).toBe(proposal);
  });

  it('a lone "A" at a sentence start is a word, never a unit, so it is marked when new', () => {
    expect(changed(aiRewriteDiff('tensão de 13,8 kV', 'A tensão é de 13,8 kV.'))).toEqual(['A', 'é']);
  });

  it('keeps the proposal\'s line breaks and spacing; spacing between two changed words is part of the change', () => {
    const segments = aiRewriteDiff('linha um\nlinha dois', 'Primeira linha um\nlinha dois revista');
    expect(joined(segments)).toBe('Primeira linha um\nlinha dois revista');
    expect(changed(segments)).toEqual(['Primeira', 'revista']);
  });

  it('a long text falls back to marking only the words the field does not hold at all', () => {
    const words = Array.from({ length: 600 }, (_, at) => `palavra${at % 50 === 0 ? 'x' : ''}`).join(' ');
    const segments = aiRewriteDiff(words, `${words} nova`);
    expect(changed(segments)).toEqual(['nova']);
  });
});

describe('31.10-UNIT-002 the guarded words', () => {
  it('flags written numbers (signed, glued to a unit), the unit right after a number (one word or two) and TAGs', () => {
    expect(guardedWordFlags(['tensão', '13,8', 'kV', 'e', '-5', '°C'])).toEqual([false, true, true, false, true, true]);
    expect(guardedWordFlags(['isolação', '147', 'giga', 'ohms', 'medida'])).toEqual([false, true, true, true, false]);
    expect(guardedWordFlags(['TR-01', 'e', 'QGBT2', 'TR'])).toEqual([true, false, true, false]);
    expect(guardedWordFlags(['13,8kV', 'A', 'lado'])).toEqual([true, false, false]);
    expect(guardedWordFlags(['A', 'corrente', 'de', '120', 'A.'])).toEqual([false, false, false, true, true]);
  });
});

describe('31.10-UNIT-003 the comparison of a field with a proposal', () => {
  function withObservation(snapshot: RelatorioSnapshot, text: string): RelatorioSnapshot {
    return {
      ...snapshot,
      blocks: snapshot.blocks.map((row) =>
        row.id === SECCIONADORA
          ? { ...row, sheet: { ...row.sheet, checklist: { ...row.sheet.checklist, contatos: { ...row.sheet.checklist.contatos, observation: { value: text, op_id: ID, actor_id: 'u', client_ts: '2026-09-27T12:00:00.000Z' } } } } }
          : row,
      ),
    } as unknown as RelatorioSnapshot;
  }
  const sectionSnapshot = (sectionText: string): RelatorioSnapshot => {
    const snapshot = small();
    return { ...snapshot, blocks: [...snapshot.blocks, { ...snapshot.blocks[0]!, id: ID, block_type: 'section_2', equipment_id: null, config: { section_text: sectionText } }] } as unknown as RelatorioSnapshot;
  };

  it('a plain field: one paragraph each side, the user\'s unmarked, the proposal diffed', () => {
    const snapshot = withObservation(small(), 'contato fase b aquecido');
    const comparison = aiRewriteComparison(snapshot, { type: 'item', block_id: SECCIONADORA, item_key: 'contatos' }, 'Contato da fase B aquecido.', opts)!;
    expect(comparison.mine).toEqual([{ kind: 'paragraph', segments: [{ text: 'contato fase b aquecido', changed: false }] }]);
    expect(comparison.proposed).toHaveLength(1);
    expect(changed(comparison.proposed[0]!.segments)).toEqual(['da']);
  });

  it('a section text keeps its blocks and their kinds on both sides, each line diffed against its own block', () => {
    const target = { type: 'section', block_id: ID } as const;
    const snapshot = sectionSnapshot('Inspeção da **cabine** realizada.\n- item um\n- item dois\n\n1. passo');
    const comparison = aiRewriteComparison(snapshot, target, 'A inspeção da cabine foi realizada.\nItem um.\nItem dois.\nPasso.', opts)!;
    expect(comparison.mine.map((one) => one.kind)).toEqual(['paragraph', 'bullet', 'bullet', 'numbered']);
    expect(comparison.proposed.map((one) => one.kind)).toEqual(['paragraph', 'bullet', 'bullet', 'numbered']);
    expect(comparison.mine[0]!.segments).toEqual([{ text: 'Inspeção da cabine realizada.', changed: false }]);
    expect(changed(comparison.proposed[0]!.segments)).toEqual(['A', 'foi']);
    expect(changed(comparison.proposed[1]!.segments)).toEqual([]);
    // A proposal with another count of blocks is no comparison.
    expect(aiRewriteComparison(snapshot, target, 'Tudo numa linha.', opts)).toBeNull();
  });

  it('an empty field has no comparison', () => {
    expect(aiRewriteComparison(withObservation(small(), '  '), { type: 'item', block_id: SECCIONADORA, item_key: 'contatos' }, 'Texto.', opts)).toBeNull();
  });
});

describe('31.10-UNIT-004 the refusal line, in two parts, for each case', () => {
  const KEPT = 'O texto foi mantido como estava.';
  const cases: { refusal: AiRewriteRefusal; what: string; why: string; retry: boolean }[] = [
    { refusal: { kind: 'guard', guard_kinds: ['number'] }, what: KEPT, why: 'A IA alterou um valor medido, uma unidade ou uma TAG, e isso não é permitido. Seu texto não mudou.', retry: true },
    { refusal: { kind: 'guard', guard_kinds: ['unit'] }, what: KEPT, why: 'A IA alterou um valor medido, uma unidade ou uma TAG, e isso não é permitido. Seu texto não mudou.', retry: true },
    { refusal: { kind: 'guard', guard_kinds: ['tag', 'result'] }, what: KEPT, why: 'A IA alterou um valor medido, uma unidade ou uma TAG, e isso não é permitido. Seu texto não mudou.', retry: true },
    { refusal: { kind: 'guard', guard_kinds: ['result'] }, what: KEPT, why: 'A IA alterou uma palavra de resultado, como aprovado ou reprovado, e isso não é permitido. Seu texto não mudou.', retry: true },
    { refusal: { kind: 'guard', guard_kinds: [] }, what: KEPT, why: 'A IA não devolveu um texto que pudesse ser usado. Seu texto não mudou.', retry: true },
    { refusal: { kind: 'guard' }, what: KEPT, why: 'A IA não devolveu um texto que pudesse ser usado. Seu texto não mudou.', retry: true },
    { refusal: { kind: 'failed' }, what: KEPT, why: 'O serviço de IA não respondeu. Tente de novo em instantes.', retry: true },
    { refusal: { kind: 'daily_limit' }, what: KEPT, why: 'O limite diário de IA da empresa foi atingido. Volta amanhã.', retry: false },
    { refusal: { kind: 'rate_limited' }, what: KEPT, why: 'Foram muitos pedidos à IA em pouco tempo. Aguarde um minuto e tente de novo.', retry: true },
    { refusal: { kind: 'not_caught_up' }, what: KEPT, why: 'Aguarde a sincronização terminar e tente de novo.', retry: true },
    { refusal: { kind: 'text_changed' }, what: 'A proposta da IA foi descartada.', why: 'O texto foi editado enquanto a IA escrevia. Tente de novo.', retry: true },
  ];
  for (const one of cases) {
    it(`${one.refusal.kind}${'guard_kinds' in one.refusal ? ` [${(one.refusal.guard_kinds ?? []).join(',')}]` : ''}`, () => {
      expect(aiRewriteRefusalText(one.refusal)).toEqual({ what: one.what, why: one.why, retry: one.retry });
    });
  }

  it('no sentence carries a value of the text, an emoji or the codename', () => {
    for (const one of cases) {
      const text = aiRewriteRefusalText(one.refusal);
      expect(`${text.what} ${text.why}`).not.toMatch(/\d|fasor|\p{Extended_Pictographic}/iu);
    }
  });
});

describe('31.10-UNIT-005 the optional answer fields of the route', () => {
  it('a refused answer may carry the guard kinds and the run id; a written one the run id; both read without them', () => {
    expect(aiWriteResponseSchema.safeParse({ outcome: 'refused', reason: 'guard', guard_kinds: ['number', 'unit', 'tag', 'result'], run_id: 'r' }).success).toBe(true);
    expect(aiWriteResponseSchema.safeParse({ outcome: 'refused', reason: 'failed', run_id: 'r' }).success).toBe(true);
    expect(aiWriteResponseSchema.safeParse({ outcome: 'written', source: 'a', text: 'A.', run_id: 'r' }).success).toBe(true);
    expect(aiWriteResponseSchema.safeParse({ outcome: 'refused', reason: 'guard' }).success).toBe(true);
    expect(aiWriteResponseSchema.safeParse({ outcome: 'refused', reason: 'guard', guard_kinds: ['value'] }).success).toBe(false);
  });
});
