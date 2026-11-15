import { applyOp, buildSnapshot, layoutSpec, makeOp, replay, sheetTestRowCellPath, sheetTestRowPath, type BlockRow, type EntityState, type JsonValue, type Op } from '@app/domain';
import { LAYOUT_LOCK_ISSUED_AT, layoutLockEpic25Fixture } from '@app/domain/fixtures/layout-lock';
import { describe, expect, it } from 'vitest';
import { buildDocx } from './docx.ts';
import { extractStructure } from './docx-structure.test-support.ts';
import { placeholderPages } from './toc.ts';

/*
 * 25.15-INT (batch e25s, Story 25.15; M23, Bruno's answer 4): the DOCX of a v16 relatório whose three arresters'
 * thermography (the layout lock's Epic 25 relatório) is answered "Realizada" with its four points measured and one
 * point the technician added ("Conexão do cabo de descida", 20 °C between similares: out of its band), "Não
 * realizada" with the reason "Equipamento fora de carga", and left unanswered. The first prints its table with the
 * added point after the four; the second prints one line in the test's place and no table; the third prints nothing
 * of the test. The same relatório on v15 prints no such line. Values invented.
 */

const TEST = 'termografia';
const NBSP = ' ';
const ADDED = 'Conexão do cabo de descida';
const LINE = 'TERMOGRAFIA: NÃO REALIZADA. MOTIVO: EQUIPAMENTO FORA DE CARGA.';
let opCount = 0;

/** The Epic 25 relatório of `version`; on v16 its first arrester's thermography gains the added point. */
function relatorioOf(version: 'v15' | 'v16') {
  const fixture = layoutLockEpic25Fixture(version);
  let state: EntityState = replay(fixture.log);
  // The arrester measured in load: on v16 the one answered "Realizada".
  const arrester = [...state.values()].find((row) => {
    const block = row as BlockRow;
    return block.block_type === 'para_raio' && block.relatorio_id === fixture.relatorioId && JSON.stringify(block.sheet?.test?.[TEST]?.values?.realizacao?.value ?? null).includes('realizada') && !JSON.stringify(block.sheet.test[TEST]!.values!.realizacao!.value).includes('nao_');
  }) as BlockRow | undefined;
  if (version === 'v16' && arrester === undefined) throw new Error('the v16 fixture lacks an arrester answered "Realizada"');
  const put = (path: string, value: JsonValue): Op => {
    opCount += 1;
    return makeOp(
      {
        kind: 'put',
        scope: 'relatorio',
        company_id: '019a6100-0000-7000-8000-000000000001',
        project_id: null,
        relatorio_id: fixture.relatorioId,
        path,
        value,
        prev_op_id: null,
        batch_id: null,
        meta: null,
        actor_id: '019a6100-0000-7000-8000-000000000002',
        device_id: 'tablet-e25s-2515-int',
      },
      { newId: () => `019a6100-2515-7000-8000-${opCount.toString(16).padStart(12, '0')}`, now: new Date(Date.parse('2026-11-15T12:00:00.000Z') + opCount * 1000) },
    );
  };
  if (arrester !== undefined) {
    const row = '019a6100-2515-7000-8000-0000000000ff';
    state = applyOp(state, put(sheetTestRowPath(arrester.id, TEST, row, 'name'), ADDED));
    state = applyOp(state, put(sheetTestRowCellPath(arrester.id, TEST, row, 0), { raw: '20', unit: '°C', state: 'measured' }));
    state = applyOp(state, put(sheetTestRowCellPath(arrester.id, TEST, row, 1), { raw: '9', unit: '°C', state: 'measured' }));
  }
  return buildSnapshot(state, fixture.relatorioId);
}

async function structureOf(version: 'v15' | 'v16') {
  const snapshot = relatorioOf(version);
  const layout = layoutSpec(snapshot, { revisionNumber: 1, issuedAt: LAYOUT_LOCK_ISSUED_AT });
  return extractStructure(await buildDocx(layout, { tocPages: placeholderPages(layout) }));
}

const clean = (text: string) => text.replaceAll(NBSP, ' ');
const thermographyTables = (tables: string[][][]) => tables.filter((table) => clean(table[0]?.[0] ?? '') === 'TERMOGRAFIA');

describe('25.15-INT the DOCX of a v16 relatório with a thermography "Não realizada" and one "Realizada" with an added point', () => {
  it('"Realizada" prints its table with the added point after the four, judged out; "Não realizada" prints its one line; unanswered, nothing', async () => {
    const structure = await structureOf('v16');
    const tables = thermographyTables(structure.tables);
    // Only the arrester answered "Realizada" prints a thermography table.
    expect(tables, JSON.stringify(structure.tables.map((table) => table[0]?.[0]))).toHaveLength(1);
    const rows = tables[0]!.map((row) => row.map(clean));
    const firsts = rows.map((row) => row[0]);
    const at = firsts.indexOf('CONEXÕES');
    expect(at).toBeGreaterThan(-1);
    expect(firsts.slice(at)).toEqual(['CONEXÕES', 'TERMINAÇÕES', 'CONTATOS', 'BUCHAS', ADDED.toLocaleUpperCase('pt-BR')]);
    const added = rows.find((row) => row[0] === ADDED.toLocaleUpperCase('pt-BR'))!;
    expect(added.join(' | ')).toContain('20');
    expect(added.at(-1)).toBe('INSATISFATÓRIO');
    // The one line, once, as a paragraph in the test's place; never "Equipamento em carga".
    expect(structure.paragraphs.filter((paragraph) => clean(paragraph) === LINE)).toHaveLength(1);
    expect(JSON.stringify(structure)).not.toContain('EQUIPAMENTO EM CARGA');
  }, 120_000);

  it('the v15 relatório prints no such line, and no added point', async () => {
    const structure = await structureOf('v15');
    expect(structure.paragraphs.some((paragraph) => clean(paragraph).startsWith('TERMOGRAFIA:'))).toBe(false);
    expect(JSON.stringify(structure)).not.toContain(ADDED.toLocaleUpperCase('pt-BR'));
  }, 120_000);
});
