import { describe, expect, it } from 'vitest';
import { makeOp } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import { newPointRow } from '../points/checks.ts';
import { photoToken } from '../points/refs.ts';
import { composeConclusion, conclusionTextState, printedConclusionText } from '../relatorio/conclusion.ts';
import { sheetOrder } from '../relatorio/ficha.ts';
import { instantiateTemplate } from '../relatorio/instantiate.ts';
import { emptySheet, type BlockRow, type Cell, type Sheet } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { EMPTY_DEFINITION_CONTEXT, getDefinition } from '../seed/definitions.ts';
import { defaultBlockConfig, standardTemplate } from '../seed/template.ts';
import { idSequence, T0, TEST_COMPANY, TEST_PROJECT, TEST_USER } from '../test-support.ts';
import { resolveActionPlan, resolveBulletPhotoTokens, resolvePhotoTokens, resolveSection8 } from './section-8.ts';

/*
 * e23f (the production check of Bruno's relatório after the deploy of `ae3d37e0`, 2026-11-07):
 * (a) a Reprovado sheet's OBSERVAÇÕES keep their line breaks in section 8's bullet and
 * action-plan cell (the DOCX renderer prints them, `docx-line-breaks.test.ts`); (b) the
 * conclusion's NC clause never doubles the observation's final period; (c) the action-plan
 * cell spaces "Imagem N" after a period, as the bullet's ", conforme Imagem N." does.
 */

const OP = '019966b0-0e23-7000-8000-000000000001';
const cell = (value: Cell['value']): Cell => ({ value, source_suggestion_id: null, op_id: OP });

describe('e23f (a) a Reprovado sheet\'s observation lines in section 8', () => {
  function fresh(): RelatorioSnapshot {
    const { relatorioId, drafts } = instantiateTemplate(
      standardTemplate({ id: '019966b0-0e23-7000-8000-000000000010' }),
      { id: TEST_PROJECT },
      { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
      { newId: idSequence('019966b0-0e23-7000-8001-'), actorId: TEST_USER, companyId: TEST_COMPANY },
    );
    const ops = drafts.map((d, i) => ({ ...makeOp({ ...d, device_id: 'tablet-test' }, { newId: idSequence('019966b0-0e23-7000-8002-'), now: T0 }), seq: i + 1 }));
    return buildSnapshot(replay(ops), relatorioId);
  }

  // Fix batch e24h (2026-11-10): the Reprovado sheet prints no automatic bullet any more; the lines are kept in a
  // point the technician writes with them, the bullet and the cell alike (was the "Equipamento reprovado" entry).
  it('keeps each line of the observation, the bullet and the cell alike', () => {
    const base = fresh();
    const order = sheetOrder(base);
    const trafo = base.blocks.find((b) => b.block_type === 'transformador_forca' && order.some((node) => node.blockId === b.id))!;
    const observation = 'Item 1: oxidação nos terminais\nItem 3: vazamento de óleo\nItem 12: ruído anormal\nEquipamento sem condições de operação';
    const snapshot: RelatorioSnapshot = {
      ...base,
      blocks: base.blocks.map((b) =>
        b.id === trafo.id ? { ...b, sheet: { ...b.sheet, observations: cell(observation), conclusion: { ...b.sheet.conclusion, result: cell('reprovado'), restriction: cell('com_restricoes') } } } : b,
      ),
    };
    expect(resolveSection8(snapshot, new Map())).toEqual([]);
    const written: RelatorioSnapshot = {
      ...snapshot,
      points: [newPointRow({ id: '019966b0-0e23-7000-8003-000000000001', relatorioId: snapshot.relatorio.id, text: observation, equipmentId: trafo.equipment_id, origin: 'reprovado', action: null }, [])],
    };
    const bullet = resolveSection8(written, new Map())[0]!;
    expect(bullet.text).toBe(observation);
    const row = resolveActionPlan(written, new Map())[0]!;
    expect(row.point).toBe(observation);
  });
});

describe('e23f (b) the conclusion\'s NC clause and a final period', () => {
  const SEC = getDefinition('v1', 'cabine_primaria', 'chave_seccionadora');
  const contatos = SEC.checklist!.findIndex((item) => item.key === 'contatos') + 1;
  const allNA = (): Sheet['checklist'] => Object.fromEntries(SEC.checklist!.map((item) => [item.key, { result: cell('NA') }]));
  function block(observation: string | null): BlockRow {
    const checklist = { ...allNA(), contatos: { result: cell('NC'), ...(observation === null ? {} : { observation: cell(observation) }) } };
    return {
      id: OP,
      relatorio_id: OP,
      location_id: null,
      equipment_id: OP,
      block_type: 'chave_seccionadora',
      config: defaultBlockConfig('v1', 'chave_seccionadora', { subtype: 'manual' }),
      seed_version: 'v1',
      order_key: 'a0',
      feeds_block_id: null,
      not_tested: null,
      concluded_by: null,
      sheet: { ...emptySheet(), checklist },
      created_by: null,
      first_edited_at: null,
      last_modified_by: null,
      last_modified_at: null,
      removed_at: null,
    };
  }
  const RECOMMENDATION = 'Recomenda-se a correção dos pontos indicados antes da próxima manutenção.';
  const textOf = (observation: string | null) => composeConclusion(block(observation), SEC, 'SEC-C05').text;

  it('drops the observation\'s final period before "(item N, NC)", so the sentence ends with one period', () => {
    // The NC row sets the floor "com restrições", so the recommendation follows.
    expect(textOf('acúmulo de poeira.')).toBe(`A seccionadora SEC-C05 apresentou acúmulo de poeira (item ${contatos}, NC), sem valores medidos registrados. ${RECOMMENDATION}`);
    expect(textOf('acúmulo de poeira...')).toContain(`acúmulo de poeira (item ${contatos}, NC)`);
    expect(textOf('acúmulo de poeira. ')).toContain(`acúmulo de poeira (item ${contatos}, NC)`);
  });

  it('keeps an observation with no final period, "etc." and the label of an item with no observation as they were', () => {
    expect(textOf('acúmulo de poeira')).toBe(`A seccionadora SEC-C05 apresentou acúmulo de poeira (item ${contatos}, NC), sem valores medidos registrados. ${RECOMMENDATION}`);
    expect(textOf('poeira, sujeira etc.')).toContain(`poeira, sujeira etc. (item ${contatos}, NC)`);
    // Review loop (Edge Case Hunter 5): "etc." followed by more periods keeps exactly its own.
    expect(textOf('poeira, sujeira etc...')).toContain(`poeira, sujeira etc. (item ${contatos}, NC)`);
    expect(textOf('poeira. .')).toContain(`apresentou poeira (item ${contatos}, NC)`);
    expect(textOf('Verificar contatos?')).toContain(`Verificar contatos? (item ${contatos}, NC)`);
    const label = SEC.checklist!.find((item) => item.key === 'contatos')!.label.toLocaleLowerCase('pt-BR');
    expect(textOf(null)).toContain(`apresentou ${label} (item ${contatos}, NC)`);
    // An observation that is only a period says the label.
    expect(textOf('.')).toContain(`apresentou ${label} (item ${contatos}, NC)`);
    expect(textOf('   ')).toContain(`apresentou ${label} (item ${contatos}, NC)`);
  });

  it('a text confirmed before the fix ("poeira. (item N, NC)") stays confirmed and prints as stored', () => {
    const base = block('acúmulo de poeira.');
    const paired: BlockRow = { ...base, sheet: { ...base.sheet, conclusion: { ...base.sheet.conclusion, result: cell('aprovado'), restriction: cell('com_restricoes') } } };
    const now = composeConclusion(paired, SEC, 'SEC-C05');
    // The text as composed before e23f, confirmed under the basis that is still the current one.
    const old = now.text.replace('acúmulo de poeira (item', 'acúmulo de poeira. (item');
    expect(old).not.toBe(now.text);
    const stored: BlockRow = {
      ...paired,
      sheet: { ...paired.sheet, conclusion: { ...paired.sheet.conclusion, text: cell(old), text_status: cell('confirmed'), text_basis: cell(now.basis) } },
    };
    expect(conclusionTextState(stored, composeConclusion(stored, SEC, 'SEC-C05'))).toBe('confirmed');
    expect(printedConclusionText(stored, SEC, 'SEC-C05')).toBe(old);
  });

  it('leaves the basis as it was, so a stored confirmed text stays confirmed', () => {
    const [period, plain] = [composeConclusion(block('acúmulo de poeira.'), SEC, 'SEC-C05'), composeConclusion(block('acúmulo de poeira'), SEC, 'SEC-C05')];
    // The basis hashes the NC rows as stored (the period included), never the text.
    expect(period.basis).not.toBe(plain.basis);
    expect(period.text).toBe(plain.text);
  });
});

describe('e23f (c) the action-plan cell spaces a photo reference as the bullet does', () => {
  const PHOTO = '019966b0-0e23-7000-8000-0000000000f1';
  const numbering = new Map([[PHOTO, 1]]);
  const ref = photoToken(PHOTO);

  it('puts one space before "Imagem N" after a period, a letter, a digit or a closing mark', () => {
    expect(resolvePhotoTokens(`Porta danificada.${ref}`, numbering)).toBe('Porta danificada. Imagem 1');
    expect(resolvePhotoTokens(`Porta${ref}`, numbering)).toBe('Porta Imagem 1');
    expect(resolvePhotoTokens(`Fase 3${ref}`, numbering)).toBe('Fase 3 Imagem 1');
    expect(resolvePhotoTokens(`Ver detalhe:${ref}`, numbering)).toBe('Ver detalhe: Imagem 1');
    expect(resolvePhotoTokens(`(detalhe)${ref}`, numbering)).toBe('(detalhe) Imagem 1');
    // Review loop (Edge Case Hunter 3): a closing quote, "%" and "°".
    expect(resolvePhotoTokens(`"Porta"${ref}`, numbering)).toBe('"Porta" Imagem 1');
    expect(resolvePhotoTokens(`\u201cPorta\u201d${ref}`, numbering)).toBe('\u201cPorta\u201d Imagem 1');
    expect(resolvePhotoTokens(`Carga de 80%${ref}`, numbering)).toBe('Carga de 80% Imagem 1');
    expect(resolvePhotoTokens(`Fase a 90°${ref}`, numbering)).toBe('Fase a 90° Imagem 1');
  });

  it('leaves a spaced token, a token after an opening bracket and a token at the start as they were', () => {
    expect(resolvePhotoTokens(`Porta danificada. ${ref}`, numbering)).toBe('Porta danificada. Imagem 1');
    expect(resolvePhotoTokens(`Ver ${ref} e ${ref}`, numbering)).toBe('Ver Imagem 1 e Imagem 1');
    expect(resolvePhotoTokens(`Detalhe (${ref})`, numbering)).toBe('Detalhe (Imagem 1)');
    expect(resolvePhotoTokens(`${ref} porta`, numbering)).toBe('Imagem 1 porta');
    expect(resolvePhotoTokens(`Linha 1\n${ref}`, numbering)).toBe('Linha 1\nImagem 1');
    // A removed photo's word is not spaced (it is not a reference any more).
    expect(resolvePhotoTokens(`Porta.${photoToken('019966b0-0e23-7000-8000-0000000000f2')}`, numbering)).toBe('Porta.imagem removida');
  });

  it('keeps the bullet\'s clause, and the manual point\'s row and bullet read the same reference', () => {
    expect(resolveBulletPhotoTokens(`Porta danificada.${ref}`, numbering)).toBe('Porta danificada, conforme Imagem 1.');
    const point = newPointRow({ id: '019966b0-0e23-7000-8000-000000000020', relatorioId: OP, text: `Porta danificada.${ref}`, equipmentId: null, origin: 'manual', action: null }, []);
    const snapshot = { relatorio: { id: OP }, locations: [], blocks: [], equipment: [], points: [point], files: [] } as unknown as RelatorioSnapshot;
    expect(resolveActionPlan(snapshot, numbering)[0]).toMatchObject({ point: 'Porta danificada. Imagem 1', images: '1' });
    expect(resolveSection8(snapshot, numbering)[0]!.text).toBe('Porta danificada, conforme Imagem 1.');
  });

  it('a manual point typed on several lines keeps its lines in the bullet and the cells (the renderer prints them, defect (a))', () => {
    const point = newPointRow(
      { id: '019966b0-0e23-7000-8000-000000000021', relatorioId: OP, text: `Linha 1\nLinha 2.${ref}`, equipmentId: null, origin: 'manual', action: 'Ação A\nAção B' },
      [],
    );
    const snapshot = { relatorio: { id: OP }, locations: [], blocks: [], equipment: [], points: [point], files: [] } as unknown as RelatorioSnapshot;
    expect(resolveActionPlan(snapshot, numbering)[0]).toMatchObject({ point: 'Linha 1\nLinha 2. Imagem 1', action: 'Ação A\nAção B' });
    expect(resolveSection8(snapshot, numbering)[0]!.text).toBe('Linha 1\nLinha 2, conforme Imagem 1. Ação A\nAção B');
  });
});
