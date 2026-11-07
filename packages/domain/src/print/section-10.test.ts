import { describe, expect, it } from 'vitest';
import { portoSeguro } from '../../fixtures/porto-seguro/op-log.ts';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import { instantiateTemplate } from '../relatorio/instantiate.ts';
import { standardTemplate } from '../seed/template.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import type { UserRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { EMPTY_DEFINITION_CONTEXT, sectionText } from '../seed/definitions.ts';
import { MISSING } from './document-control.ts';
import { lastNameplates } from './last-nameplate.ts';
import { DRAFT_WATERMARK, layoutSpec } from './layout.ts';
import { composeParecer, derivedParecer } from '../relatorio/parecer.ts';
import { sectionPosition } from '../relatorio/section-position.ts';
import { PARECER_OWN_TEXT_LABEL, parecerOwnTextParagraph, section10Layout, validityLine } from './section-10.ts';
import { confirmedCellsLaterEdited } from './sm-c1.ts';

const ISSUED_AT = '2026-09-23T12:00:00.000Z';
const base = (): RelatorioSnapshot => buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);
/** A relatório freshly instantiated from the standard template, with its live section blocks. */
function standardSnapshot(): RelatorioSnapshot {
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: '019966b0-0071-7000-8000-000000000001' }),
    { id: TEST_PROJECT },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
    { newId: idSequence('019966b0-0072-7000-8000-'), actorId: TEST_USER, companyId: TEST_COMPANY },
  );
  const ops = drafts.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0073-7000-8000-'), now: T0 }), seq: i + 1 }));
  return buildSnapshot(replay(ops), relatorioId);
}
/** Story 22.6: the fixture with every reading cleared, so no sheet is effectively Reprovado. */
const withoutOutReadings = (snapshot: RelatorioSnapshot): RelatorioSnapshot => ({ ...snapshot, blocks: snapshot.blocks.map((block) => ({ ...block, sheet: { ...block.sheet, test: {} } })) });
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
  it('prints the box (verdict word as title, composed text), the fixed bullets, the validity line and the signature', () => {
    // Story 22.6: the Porto Seguro fixture holds readings out of criterion, so its derived verdict is Não apto.
    const snapshot = withParecer(base(), { verdict: 'apto_com_restricoes', text: 'Resumo confirmado.', text_status: 'confirmed', text_basis: 'x' });
    expect(derivedParecer(snapshot)).toBe('nao_apto');
    const section = layoutSpec(snapshot, { revisionNumber: 1, issuedAt: ISSUED_AT }).sections.find((s) => s.number === 10)!;
    const seeded = sectionText('v1', 10, '2026-09-23');
    expect(section).toEqual({
      number: 10,
      title: 'CONCLUSÃO E OBSERVAÇÕES TÉCNICAS',
      kind: 'section_10',
      // The stored Apto com restrições is looser than the fichas' Não apto: the effective verdict prints; a confirmed text never prints, the composed one does.
      parecer: { title: 'Não apto', text: composeParecer(snapshot).text, ownText: null },
      // Under Não apto the third bullet ("Apesar dos resultados dos testes serem positivos...") is left out (DF-4).
      bullets: seeded.slice(0, 2).map((block) => ({ kind: 'item', text: block.text, runs: [{ text: block.text }] })),
      validityLine: 'Este relatório tem validade apenas acompanhada da ART 2620262602583',
      signature: { name: 'Rafael Lamonde', title: 'Eng. Eletricista', registration: 'CREA 5063583141' },
    });
    expect(seeded).toHaveLength(3);
    expect(seeded[2]!.text).toMatch(/^Apesar dos resultados dos testes serem positivos/);
  });

  it('22.6-UNIT prints the derived verdict with no parecer stored, and an own text typed before as "Observações do responsável"', () => {
    const none = section10Layout(base(), { number: 10, title: 'T', paragraphs: [{ text: 'a' }] });
    expect(none.parecer).toEqual({ title: 'Não apto', text: composeParecer(base()).text, ownText: null });
    expect(none.signature).toEqual({ name: '[Responsável]', title: '', registration: '' });
    const edited = section10Layout(withParecer(base(), { verdict: 'nao_apto', text: ' Texto digitado pelo engenheiro. ', text_status: 'edited', text_basis: 'x' }), { number: 10, title: 'T' });
    expect(edited.parecer).toEqual({ title: 'Não apto', text: composeParecer(base()).text, ownText: 'Texto digitado pelo engenheiro.' });
    expect(edited.bullets).toEqual([]);
    expect(parecerOwnTextParagraph('Texto.')).toBe('Observações do responsável: Texto.');
    expect(PARECER_OWN_TEXT_LABEL).toBe('Observações do responsável');
    // A confirmed (composed) summary is not an own text.
    const confirmed = section10Layout(withParecer(base(), { verdict: 'nao_apto', text: 'Composto.', text_status: 'confirmed', text_basis: 'x' }), { number: 10, title: 'T' });
    expect(confirmed.parecer.ownText).toBeNull();
  });

  it('22.6-UNIT the third bullet prints under Apto and Apto com restrições, never under Não apto', () => {
    const third = 'Apesar dos resultados dos testes serem positivos para a continuidade de operação das SE’s, sugerimos que as observações sejam atendidas.';
    const paragraphs = [{ text: 'Primeiro;' }, { text: third }];
    // The fixture with its readings brought back within criterion: no sheet is effectively Reprovado.
    const clean = withoutOutReadings(base());
    expect(derivedParecer(clean)).not.toBe('nao_apto');
    expect(section10Layout(clean, { number: 10, title: 'T', paragraphs }).bullets.map((bullet) => bullet.text)).toEqual(['Primeiro;', third]);
    expect(section10Layout(withParecer(clean, { verdict: 'nao_apto', text: null, text_status: null, text_basis: null }), { number: 10, title: 'T', paragraphs }).bullets.map((bullet) => bullet.text)).toEqual([
      'Primeiro;',
    ]);
  });

  it('22.6-UNIT "nos itens 8 e 9" reads the printed positions, in a seeded text and in a template\'s own text', () => {
    const snapshot = base();
    const positions = [sectionPosition(snapshot, 8), sectionPosition(snapshot, 9)];
    const own = section10Layout(snapshot, {
      number: 10,
      title: 'T',
      paragraphs: [{ kind: 'paragraph', text: 'Resultados nos itens 8 e 9 deste relatório.', runs: [{ text: 'Resultados ', bold: true }, { text: 'nos itens 8 e 9 deste relatório.' }] }],
    });
    expect(own.bullets[0]!.text).toBe(`Resultados nos itens ${positions[0]} e ${positions[1]} deste relatório.`);
    expect(own.bullets[0]!.runs).toEqual([{ text: 'Resultados ', bold: true }, { text: `nos itens ${positions[0]} e ${positions[1]} deste relatório.` }]);
    // A relatório of the standard template whose points section was removed: one position, "no item N".
    const standard = standardSnapshot();
    const compact = { ...standard, blocks: standard.blocks.filter((block) => block.block_type !== 'section_8') };
    expect(sectionPosition(compact, 8)).toBeNull();
    const one = section10Layout(compact, { number: 10, title: 'T', paragraphs: [{ text: 'Ver nos itens 8 e 9.' }] });
    expect(one.bullets[0]!.text).toBe(`Ver no item ${sectionPosition(compact, 9)}.`);
  });

  it('11.4: carries each own-text item\'s runs, and a numbered item\'s kind and position', () => {
    const section = section10Layout(base(), {
      number: 10,
      title: 'T',
      paragraphs: [
        { kind: 'paragraph', text: 'Negrito fim', runs: [{ text: 'Negrito', bold: true }, { text: ' fim' }] },
        { kind: 'numbered', number: 1, text: 'Um', runs: [{ text: 'Um', italic: true }] },
        { kind: 'numbered', number: 2, text: 'Dois', runs: [{ text: 'Dois' }] },
      ],
    });
    expect(section.bullets).toEqual([
      { kind: 'item', text: 'Negrito fim', runs: [{ text: 'Negrito', bold: true }, { text: ' fim' }] },
      { kind: 'numbered', number: 1, text: 'Um', runs: [{ text: 'Um', italic: true }] },
      { kind: 'numbered', number: 2, text: 'Dois', runs: [{ text: 'Dois' }] },
    ]);
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
