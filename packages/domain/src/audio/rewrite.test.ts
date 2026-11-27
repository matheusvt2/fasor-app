import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { aiWriteRequestSchema, aiWriteResponseSchema } from '../contract/transcription.ts';
import { relatorioSnapshotSchema, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { aiRewriteRestore, aiRewriteSource, aiRewriteVerdict, aiRewriteWrite } from './index.ts';

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
  const source = { text: 'contato fase b aquecido oxidado', context: { field: 'Observação do item', equipment_type: null, tag: 'SC-01' } };

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
    expect(aiRewriteRestore(snapshot, target, opts)).toEqual({ puts: [{ path, value: 'contato oxidado' }] });
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
    const restore = aiRewriteRestore(snapshot, target, opts)!;
    expect(restore.puts.map((put) => put.value)).toEqual([null, null, null]);
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
    expect(aiRewriteRestore(withParecer, target, opts)).toEqual({ puts: [{ path: 'relatorio/setup/parecer', value: parecer }] });
  });

  it('a section text is rewritten as plain paragraphs and restored with its formatting', () => {
    const snapshot = small();
    const config = { section_text: 'Texto **negrito**.' };
    const section = { ...snapshot.blocks[0]!, id: ID, block_type: 'section_2', equipment_id: null, config };
    const withSection = { ...snapshot, blocks: [...snapshot.blocks, section] } as unknown as RelatorioSnapshot;
    const target = { type: 'section', block_id: ID } as const;
    expect(aiRewriteSource(withSection, target, opts)?.text).toBe('Texto negrito.');
    const write = aiRewriteWrite(withSection, target, 'Texto melhor.', opts)!;
    expect(write.puts[0]!.value).toMatchObject({ section_text: 'Texto melhor.', section_text_edited: true });
    expect(aiRewriteRestore(withSection, target, opts)).toEqual({ puts: [{ path: `block/${ID}/config`, value: config }] });
  });

  it('an empty field has no write nor restore', () => {
    const snapshot = withObservation(small(), null);
    const target = { type: 'item', block_id: SECCIONADORA, item_key: 'contatos' } as const;
    expect(aiRewriteWrite(snapshot, target, 'x', opts)).toBeNull();
    expect(aiRewriteRestore(snapshot, target, opts)).toBeNull();
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
