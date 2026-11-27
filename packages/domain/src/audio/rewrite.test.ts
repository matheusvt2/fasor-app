import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { aiWriteRequestSchema, aiWriteResponseSchema } from '../contract/transcription.ts';
import { relatorioSnapshotSchema, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { aiRewriteFormer, aiRewriteJoin, aiRewriteRestore, aiRewriteSource, aiRewriteVerdict, aiRewriteWrite, remarkRuns } from './index.ts';

/*
 * Story 31.9 (AD-30, FR-79): the AI control's kernel half: the text a field shows and the prompt's
 * context, the guard of the answer, the puts that replace the text and the ones that put it back.
 */

const small = (): RelatorioSnapshot =>
  relatorioSnapshotSchema.parse(JSON.parse(readFileSync(fileURLToPath(new URL('../../fixtures/porto-seguro/small/snapshot.golden.json', import.meta.url)), 'utf8')));

const SECCIONADORA = '019966c1-0000-7000-8000-00000000000c';
const ID = '019966b0-0031-7000-8000-0000000000b1';
const opts = { now: new Date('2026-09-27T12:00:00Z') };

function withObservation(snapshot: RelatorioSnapshot, text: string | null): RelatorioSnapshot {
  return {
    ...snapshot,
    blocks: snapshot.blocks.map((row) =>
      row.id === SECCIONADORA
        ? { ...row, sheet: { ...row.sheet, checklist: { ...row.sheet.checklist, contatos: { ...row.sheet.checklist.contatos, observation: { value: text, op_id: ID, actor_id: 'u', client_ts: '2026-09-27T12:00:00.000Z' } } } } }
        : row,
    ),
  } as unknown as RelatorioSnapshot;
}

describe('31.9-UNIT-001 the text the AI control rewrites, and its context', () => {
  it('a field holding text: the exact text and the context the kernel assembles', () => {
    const snapshot = withObservation(small(), 'contato fase b aquecido oxidado');
    const source = aiRewriteSource(snapshot, { type: 'item', block_id: SECCIONADORA, item_key: 'contatos' }, opts);
    expect(source?.text).toBe('contato fase b aquecido oxidado');
    expect(source?.context.field).toBe('Observação do item');
    expect(source?.context.tag).not.toBeNull();
  });

  it('an empty field, a field the relatório no longer holds and a measurement table have no control', () => {
    const snapshot = small();
    expect(aiRewriteSource(withObservation(snapshot, '  '), { type: 'item', block_id: SECCIONADORA, item_key: 'contatos' }, opts)).toBeNull();
    expect(aiRewriteSource(snapshot, { type: 'item', block_id: ID, item_key: 'contatos' }, opts)).toBeNull();
    expect(aiRewriteSource(snapshot, { type: 'table', block_id: SECCIONADORA, test_key: 'x', table_key: 'y' }, opts)).toBeNull();
    // No verdict tapped: no parecer summary to rewrite.
    expect(aiRewriteSource(snapshot, { type: 'setup', field: 'parecer_text' }, opts)).toBeNull();
  });

  it('"Texto da conclusão" with none stored: the composed text, with the conclusion in the context', () => {
    const source = aiRewriteSource(small(), { type: 'sheet_field', block_id: SECCIONADORA, field: 'conclusion_text' }, opts);
    expect(source).not.toBeNull();
    expect(source!.text.length).toBeGreaterThan(0);
    expect(source!.context.conclusion).toBeDefined();
  });
});

describe('31.9-UNIT-002 the guard of the answer', () => {
  const source = { text: 'contato fase b aquecido oxidado', pieces: ['contato fase b aquecido oxidado'], rich: false, context: { field: 'Observação do item', equipment_type: null, tag: 'SC-01' } };

  it('passes a rewrite that keeps every number, unit and TAG', () => {
    expect(aiRewriteVerdict(source, 'Contatos da fase B com sinais de aquecimento e oxidação.')).toEqual({ ok: true });
  });

  it('refuses a number the field does not hold, a dropped one, and an empty answer', () => {
    expect(aiRewriteVerdict(source, 'Folga de 3 mm nos contatos.')).toEqual({ ok: false, reasons: [{ kind: 'number', value: '3', problem: 'added' }] });
    expect(aiRewriteVerdict({ ...source, text: 'isolamento 147 giga' }, 'Isolamento adequado.').ok).toBe(false);
    expect(aiRewriteVerdict(source, '   ')).toEqual({ ok: false, reasons: [] });
  });

  it('a TAG the context names may be written', () => {
    expect(aiRewriteVerdict(source, 'Contatos da SC-01 oxidados.')).toEqual({ ok: true });
  });
});

describe('31.9-UNIT-003 the write replaces the text, and the restore puts it back', () => {
  it('a plain field: one put of the new text; the restore puts the former one', () => {
    const snapshot = withObservation(small(), 'contato oxidado');
    const target = { type: 'item', block_id: SECCIONADORA, item_key: 'contatos' } as const;
    const path = `sheet/${SECCIONADORA}/checklist/contatos/observation`;
    expect(aiRewriteWrite(snapshot, target, ' Contato oxidado. ', opts)).toEqual({ puts: [{ path, value: 'Contato oxidado.' }] });
    const former = aiRewriteFormer(snapshot, target, opts)!;
    expect(aiRewriteRestore(withObservation(small(), 'Contato oxidado.'), target, former, opts)).toEqual({ puts: [{ path, value: 'contato oxidado' }] });
  });

  it('the composed conclusion text becomes the edited text; the restore clears it back to composed; the result is never written', () => {
    const snapshot = small();
    const target = { type: 'sheet_field', block_id: SECCIONADORA, field: 'conclusion_text' } as const;
    const write = aiRewriteWrite(snapshot, target, 'Texto reescrito.', opts)!;
    expect(write.puts.map((put) => put.path)).toEqual([
      `sheet/${SECCIONADORA}/conclusion/text`,
      `sheet/${SECCIONADORA}/conclusion/text_status`,
      `sheet/${SECCIONADORA}/conclusion/text_basis`,
    ]);
    expect(write.puts[0]!.value).toBe('Texto reescrito.');
    expect(write.puts[1]!.value).toBe('edited');
    expect(write.puts.some((put) => put.path.endsWith('/result') || put.path.endsWith('/restriction'))).toBe(false);
    const restore = aiRewriteRestore(snapshot, target, aiRewriteFormer(snapshot, target, opts)!, opts)!;
    expect(restore.puts.map((put) => put.value)).toEqual([null, null, null]);
    expect(restore.puts.some((put) => put.path.endsWith('/result') || put.path.endsWith('/restriction'))).toBe(false);
  });

  it('the parecer summary: the whole parecer, edited, the verdict kept; restored as it was', () => {
    const snapshot = small();
    const parecer = { verdict: 'apto' as const, text: null, text_status: null, text_basis: null };
    const withParecer = { ...snapshot, relatorio: { ...snapshot.relatorio, setup: { ...snapshot.relatorio.setup, parecer } } } as never;
    const target = { type: 'setup', field: 'parecer_text' } as const;
    const source = aiRewriteSource(withParecer, target, opts);
    expect(source?.context.parecer?.verdict).toBe('apto');
    const write = aiRewriteWrite(withParecer, target, 'Resumo reescrito.', opts)!;
    expect(write.puts[0]).toMatchObject({ path: 'relatorio/setup/parecer', value: { verdict: 'apto', text: 'Resumo reescrito.', text_status: 'edited' } });
    expect(aiRewriteRestore(withParecer, target, aiRewriteFormer(withParecer, target, opts)!, opts)).toEqual({ puts: [{ path: 'relatorio/setup/parecer', value: parecer }] });
  });

  it('an empty field has no write nor former text', () => {
    const snapshot = withObservation(small(), null);
    const target = { type: 'item', block_id: SECCIONADORA, item_key: 'contatos' } as const;
    expect(aiRewriteWrite(snapshot, target, 'x', opts)).toBeNull();
    expect(aiRewriteFormer(snapshot, target, opts)).toBeNull();
  });
});

describe('e31f-UNIT-005 "Desfazer" puts back only the text, onto the field as it is now', () => {
  it('a verdict tapped after the write stays: the parecer summary goes back, the new verdict is kept', () => {
    const snapshot = small();
    const parecer = { verdict: 'apto' as const, text: 'Resumo antigo.', text_status: 'edited' as const, text_basis: 'b1' };
    const at = (value: unknown) => ({ ...snapshot, relatorio: { ...snapshot.relatorio, setup: { ...snapshot.relatorio.setup, parecer: value } } }) as never;
    const target = { type: 'setup', field: 'parecer_text' } as const;
    const former = aiRewriteFormer(at(parecer), target, opts)!;
    // After the write the user taps another verdict.
    const now = at({ ...parecer, verdict: 'nao_apto', text: 'Resumo reescrito.' });
    expect(aiRewriteRestore(now, target, former, opts)).toEqual({
      puts: [{ path: 'relatorio/setup/parecer', value: { verdict: 'nao_apto', text: 'Resumo antigo.', text_status: 'edited', text_basis: 'b1' } }],
    });
    // The verdict cleared meanwhile: nothing to put back onto.
    expect(aiRewriteRestore(at(null), target, former, opts)).toBeNull();
  });

  it('a Não ensaiado reason changed after the write stays; only the note goes back', () => {
    const snapshot = small();
    const mark = (reason: string, text: string | null) =>
      ({ ...snapshot, blocks: snapshot.blocks.map((row) => (row.id === SECCIONADORA ? { ...row, not_tested: { reason, text, at: '2026-09-27T12:00:00.000Z', by: 'u' } } : row)) }) as unknown as RelatorioSnapshot;
    const target = { type: 'sheet_field', block_id: SECCIONADORA, field: 'not_tested_text' } as const;
    const former = aiRewriteFormer(mark('outro', 'nota antiga'), target, opts)!;
    const restore = aiRewriteRestore(mark('impossibilidade_desligamento', 'Nota reescrita.'), target, former, opts)!;
    expect(restore.puts[0]!.value).toMatchObject({ reason: 'impossibilidade_desligamento', text: 'nota antiga' });
  });

  it('a section config changed after the write stays; only the text and its edited mark go back', () => {
    const snapshot = small();
    const withConfig = (config: Record<string, unknown>) =>
      ({ ...snapshot, blocks: [...snapshot.blocks, { ...snapshot.blocks[0]!, id: ID, block_type: 'section_2', equipment_id: null, config }] }) as unknown as RelatorioSnapshot;
    const target = { type: 'section', block_id: ID } as const;
    const former = aiRewriteFormer(withConfig({ section_text: 'Texto **negrito**.' }), target, opts)!;
    const restore = aiRewriteRestore(withConfig({ section_text: 'Texto melhor.', section_text_edited: true, other: 'kept' }), target, former, opts)!;
    expect(restore.puts[0]!.value).toEqual({ section_text: 'Texto **negrito**.', section_text_edited: false, other: 'kept' });
  });
});

describe('e31f-UNIT-006 a section text keeps its formatting', () => {
  const sectionSnapshot = (sectionText: string): RelatorioSnapshot => {
    const snapshot = small();
    return { ...snapshot, blocks: [...snapshot.blocks, { ...snapshot.blocks[0]!, id: ID, block_type: 'section_2', equipment_id: null, config: { section_text: sectionText } }] } as unknown as RelatorioSnapshot;
  };
  const target = { type: 'section', block_id: ID } as const;
  const text = 'Inspeção da **cabine primária** realizada.\n- item um verificado\n- item *dois* verificado\n\n1. primeiro passo\n2. segundo passo';

  it('the source is one piece per block, the rich flag set', () => {
    const source = aiRewriteSource(sectionSnapshot(text), target, opts)!;
    expect(source.rich).toBe(true);
    expect(source.pieces).toEqual(['Inspeção da cabine primária realizada.', 'item um verificado', 'item dois verificado', 'primeiro passo', 'segundo passo']);
    expect(source.text).toBe(source.pieces.join('\n'));
    expect(aiRewriteJoin(source, ['A inspeção da cabine primária foi realizada.', 'Item um\nverificado.', 'Item dois verificado.', 'Primeiro passo.', 'Segundo passo.'])).toBe(
      'A inspeção da cabine primária foi realizada.\nItem um verificado.\nItem dois verificado.\nPrimeiro passo.\nSegundo passo.',
    );
  });

  it('each written block keeps its kind and the marks on the words that survive', () => {
    const written = 'A inspeção da cabine primária foi realizada.\nItem um verificado.\nItem dois verificado.\nPrimeiro passo.\nSegundo passo.';
    const write = aiRewriteWrite(sectionSnapshot(text), target, written, opts)!;
    expect((write.puts[0]!.value as { section_text: string }).section_text).toBe(
      'A inspeção da **cabine primária** foi realizada.\n- Item um verificado.\n- Item *dois* verificado.\n1. Primeiro passo.\n2. Segundo passo.',
    );
  });

  it('a list is never written back as a paragraph: an answer with another block count is no write', () => {
    expect(aiRewriteWrite(sectionSnapshot(text), target, 'Tudo numa linha só.', opts)).toBeNull();
    const source = aiRewriteSource(sectionSnapshot(text), target, opts)!;
    expect(aiRewriteVerdict(source, 'Tudo numa linha só.')).toEqual({ ok: false, reasons: [] });
  });

  it('the guard runs per block: a number moved from one block to another is refused', () => {
    const source = aiRewriteSource(sectionSnapshot('Tensão de 13,8 kV.\n- corrente de 120 A'), target, opts)!;
    expect(aiRewriteVerdict(source, 'A tensão é de 13,8 kV.\nCorrente de 120 A.')).toEqual({ ok: true });
    expect(aiRewriteVerdict(source, 'A tensão é de 13,8 kV e 120 A.\nCorrente medida.').ok).toBe(false);
    expect(aiRewriteVerdict(source, 'A tensão é de 13,8 kV.\nCorrente de 120 A, aprovada.')).toMatchObject({ ok: false, reasons: [{ kind: 'result', value: 'aprovado' }] });
  });

  it('a mark on words the model changed is dropped, the rest of the text kept', () => {
    expect(remarkRuns([{ text: 'Texto ' }, { text: 'negrito', bold: true }, { text: '.' }], 'Texto em destaque.')).toEqual([{ text: 'Texto em destaque.' }]);
    expect(remarkRuns([{ text: 'a ' }, { text: 'Negrito', bold: true, italic: true }], 'o negrito ficou')).toEqual([{ text: 'o ' }, { text: 'negrito', bold: true, italic: true }, { text: ' ficou' }]);
  });
});

describe('31.9-UNIT-004 the route contract', () => {
  it('names a prose field and the barrier; never a measurement table', () => {
    expect(aiWriteRequestSchema.safeParse({ target: { type: 'item', block_id: SECCIONADORA, item_key: 'contatos' }, last_op_id: null }).success).toBe(true);
    expect(aiWriteRequestSchema.safeParse({ target: { type: 'table', block_id: SECCIONADORA, test_key: 'x', table_key: 'y' }, last_op_id: null }).success).toBe(false);
    expect(aiWriteRequestSchema.safeParse({ target: { type: 'item', block_id: SECCIONADORA, item_key: 'contatos' } }).success).toBe(false);
  });

  it('answers a written text or a refusal', () => {
    expect(aiWriteResponseSchema.safeParse({ outcome: 'written', source: 'a', text: 'A.' }).success).toBe(true);
    expect(aiWriteResponseSchema.safeParse({ outcome: 'refused', reason: 'guard' }).success).toBe(true);
    expect(aiWriteResponseSchema.safeParse({ outcome: 'written', source: 'a', text: '' }).success).toBe(false);
  });
});
