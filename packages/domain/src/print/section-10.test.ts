import { describe, expect, it } from 'vitest';
import { portoSeguro } from '../../fixtures/porto-seguro/op-log.ts';
import { replay } from '../ops/replay.ts';
import type { UserRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { sectionText } from '../seed/definitions.ts';
import { MISSING } from './document-control.ts';
import { lastNameplates } from './last-nameplate.ts';
import { DRAFT_WATERMARK, layoutSpec } from './layout.ts';
import { PARECER_MISSING_TITLE, section10Layout, validityLine } from './section-10.ts';
import { confirmedCellsLaterEdited } from './sm-c1.ts';

const ISSUED_AT = '2026-09-23T12:00:00.000Z';
const base = (): RelatorioSnapshot => buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);
const RESPONSIBLE: UserRow = {
  id: '019966c0-0000-7000-8000-000000000002',
  name: 'Rafael Lamonde',
  email: 'r@x',
  council: 'crea',
  registration_number: '5063583141',
  title: null,
  photo_location_enabled: false,
};

function withParecer(snapshot: RelatorioSnapshot, parecer: RelatorioSnapshot['relatorio']['setup']['parecer'], art: string | null = '2620262602583'): RelatorioSnapshot {
  return { ...snapshot, responsible: RESPONSIBLE, relatorio: { ...snapshot.relatorio, setup: { ...snapshot.relatorio.setup, parecer, art_trt_number: art } } };
}

describe('7.4-UNIT validityLine (I/O matrix)', () => {
  it('names the ART or the TRT by council, both while unknown, and prints the label in brackets for a blank number', () => {
    expect(validityLine('crea', '123')).toBe('Este relatório tem validade apenas acompanhada da ART 123');
    expect(validityLine('crt', ' 9 ')).toBe('Este relatório tem validade apenas acompanhada da TRT 9');
    expect(validityLine(null, '77')).toBe('Este relatório tem validade apenas acompanhada da ART/TRT 77');
    expect(validityLine('crea', null)).toBe('Este relatório tem validade apenas acompanhada da ART [ART]');
    expect(validityLine('crt', '  ')).toBe('Este relatório tem validade apenas acompanhada da TRT [TRT]');
    expect(validityLine(null, null)).toBe('Este relatório tem validade apenas acompanhada da ART/TRT [ART/TRT]');
  });
});

describe('7.4-UNIT section 10 layout', () => {
  it('prints the box (verdict word as title, confirmed text), the three bullets, the validity line and the signature', () => {
    const snapshot = withParecer(base(), { verdict: 'apto_com_restricoes', text: 'Resumo confirmado.', text_status: 'confirmed', text_basis: 'x' });
    const section = layoutSpec(snapshot, { revisionNumber: 1, issuedAt: ISSUED_AT }).sections.find((s) => s.number === 10)!;
    expect(section).toEqual({
      number: 10,
      title: 'CONCLUSÃO E OBSERVAÇÕES TÉCNICAS',
      kind: 'section_10',
      parecer: { title: 'Apto com restrições', text: 'Resumo confirmado.' },
      bullets: sectionText('v1', 10, '2026-09-23').map((block) => block.text),
      validityLine: 'Este relatório tem validade apenas acompanhada da ART 2620262602583',
      signature: { name: 'Rafael Lamonde', title: 'Eng. Eletricista', registration: 'CREA 5063583141' },
    });
  });

  it('prints [Parecer] with no text while none is set (a preview), and never an unconfirmed text', () => {
    const none = section10Layout(base(), { number: 10, title: 'T', paragraphs: [{ text: 'a' }] });
    expect(none.parecer).toEqual({ title: PARECER_MISSING_TITLE, text: null });
    expect(PARECER_MISSING_TITLE).toBe('[Parecer]');
    expect(none.signature).toEqual({ name: '[Responsável]', title: '', registration: '' });
    const unconfirmed = section10Layout(withParecer(base(), { verdict: 'apto', text: 'composto', text_status: null, text_basis: null }), { number: 10, title: 'T' });
    expect(unconfirmed.parecer).toEqual({ title: 'Apto', text: null });
    expect(unconfirmed.bullets).toEqual([]);
  });

  it('signs with the typed title, the CRT default, or the council alone when the number is blank', () => {
    const s = (responsible: UserRow) => section10Layout({ ...base(), responsible }, { number: 10, title: 'T' }).signature;
    expect(s({ ...RESPONSIBLE, title: 'Engenheiro Eletricista' }).title).toBe('Engenheiro Eletricista');
    expect(s({ ...RESPONSIBLE, council: 'crt', registration_number: null })).toEqual({ name: 'Rafael Lamonde', title: 'Técnico(a) em Eletrotécnica', registration: 'CRT' });
    expect(s({ ...RESPONSIBLE, council: null })).toEqual({ name: 'Rafael Lamonde', title: '', registration: '' });
  });
});

describe('7.5-UNIT the draft layout', () => {
  it('a preview carries RASCUNHO and prints the revision row as "—"; the issued layout carries none and "Rev. n"', () => {
    const snapshot = withParecer(base(), null);
    const issued = layoutSpec(snapshot, { revisionNumber: 2, issuedAt: ISSUED_AT });
    const draft = layoutSpec(snapshot, { revisionNumber: 2, issuedAt: ISSUED_AT, draft: true });
    expect(issued.watermark).toBeNull();
    expect(draft.watermark).toBe(DRAFT_WATERMARK);
    expect(DRAFT_WATERMARK).toBe('RASCUNHO');
    expect(issued.documentControl.find((r) => r.label === 'Revisão do documento')!.value).toBe('Rev. 2');
    expect(draft.documentControl.find((r) => r.label === 'Revisão do documento')!.value).toBe(MISSING);
    // Everything else is the same document.
    expect({ ...draft, watermark: null, documentControl: draft.documentControl.filter((r) => r.label !== 'Revisão do documento') }).toEqual({
      ...issued,
      documentControl: issued.documentControl.filter((r) => r.label !== 'Revisão do documento'),
    });
  });
});

describe('7.5-UNIT lastNameplates', () => {
  it('one entry per live sheet with a filled plate, keyed by the definition keys, provenance of the revision', () => {
    const snapshot = base();
    const entries = lastNameplates(snapshot, { revisionNumber: 1, issuedAt: ISSUED_AT });
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      const block = snapshot.blocks.find((b) => b.equipment_id === entry.equipmentId)!;
      expect(entry.value).toMatchObject({ relatorio_id: snapshot.relatorio.id, revision_number: 1, issued_at: ISSUED_AT, seed_version: block.seed_version, block_type: block.block_type });
      expect(Object.keys(entry.value.fields).length).toBeGreaterThan(0);
      for (const [key, value] of Object.entries(entry.value.fields)) expect(block.sheet.nameplate[key]?.value).toEqual(value);
    }
    // A block whose plate is empty leaves no projection (the TAG prefill is never stored).
    const emptied = { ...snapshot, blocks: snapshot.blocks.map((b) => ({ ...b, sheet: { ...b.sheet, nameplate: {} } })) };
    expect(lastNameplates(emptied, { revisionNumber: 1, issuedAt: ISSUED_AT })).toEqual([]);
  });

  it('skips a sheet whose nameplate sub-block is switched off (its stale cells do not print)', () => {
    const snapshot = base();
    const entries = lastNameplates(snapshot, { revisionNumber: 1, issuedAt: ISSUED_AT });
    const target = entries[0]!.equipmentId;
    const blocks = snapshot.blocks.map((b) => {
      if (b.equipment_id !== target) return b;
      const config = b.config as { sub_blocks: Record<string, unknown> };
      return { ...b, config: { ...config, sub_blocks: { ...config.sub_blocks, nameplate: { enabled: false } } } };
    });
    const after = lastNameplates({ ...snapshot, blocks }, { revisionNumber: 1, issuedAt: ISSUED_AT });
    expect(after.map((e) => e.equipmentId)).toEqual(entries.map((e) => e.equipmentId).filter((id) => id !== target));
  });

  it('skips a removed block', () => {
    const snapshot = base();
    const entries = lastNameplates(snapshot, { revisionNumber: 1, issuedAt: ISSUED_AT });
    const target = entries[0]!.equipmentId;
    const blocks = snapshot.blocks.map((b) => (b.equipment_id === target ? { ...b, removed_at: ISSUED_AT } : b));
    expect(lastNameplates({ ...snapshot, blocks }, { revisionNumber: 1, issuedAt: ISSUED_AT }).some((e) => e.equipmentId === target)).toBe(false);
  });
});

describe('7.5-UNIT SM-C1 confirmedCellsLaterEdited', () => {
  const path = 'sheet/019966c0-0000-7000-8000-000000000100/nameplate/fabricacao';
  const other = 'sheet/019966c0-0000-7000-8000-000000000100/nameplate/tensao_nominal';
  const suggestion = { source_suggestion_id: '019966c0-0000-7000-8000-000000000200' };
  it('counts a cell written from a confirmed suggestion then overwritten by a plain put, once', () => {
    expect(
      confirmedCellsLaterEdited([
        { kind: 'put', path, meta: suggestion, seq: 1 },
        { kind: 'put', path, meta: null, seq: 2 },
        { kind: 'put', path, meta: null, seq: 3 },
        { kind: 'put', path: other, meta: suggestion, seq: 4 },
        { kind: 'put', path: 'relatorio/setup/local', meta: null, seq: 5 },
      ]),
    ).toBe(1);
    // Order is `seq`, not array order; a plain put before the suggestion counts nothing.
    expect(confirmedCellsLaterEdited([{ kind: 'put', path, meta: suggestion, seq: 2 }, { kind: 'put', path, meta: null, seq: 1 }])).toBe(0);
  });

  it('a later suggestion re-arms the cell; a non-put, a non-sheet path and an empty suggestion id count nothing', () => {
    expect(
      confirmedCellsLaterEdited([
        { kind: 'put', path, meta: suggestion, seq: 1 },
        { kind: 'put', path, meta: null, seq: 2 },
        { kind: 'put', path, meta: suggestion, seq: 3 },
        { kind: 'put', path, meta: null, seq: 4 },
      ]),
    ).toBe(1);
    expect(confirmedCellsLaterEdited([{ kind: 'put', path, meta: { source_suggestion_id: '' } }, { kind: 'put', path, meta: null }])).toBe(0);
    expect(confirmedCellsLaterEdited([{ kind: 'put', path: 'not a path', meta: suggestion }, { kind: 'put', path: 'not a path', meta: null }])).toBe(0);
    expect(confirmedCellsLaterEdited([])).toBe(0);
  });
});
