import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildSnapshot, relatorioSnapshotSchema, replay, serializeSnapshot, standardTemplate, templateTotals } from '../../src/index.ts';
import type { EquipmentBlockType } from '../../src/schemas/block-config.ts';
import { NA_ITEMS_BY_TYPE } from './data.ts';
import { NOT_TESTED_BLOCK_IDS, NOT_TESTED_DISJUNTOR_BLOCK_ID, NOT_TESTED_SECCIONADORA_1_BLOCK_ID, NOT_TESTED_SECCIONADORA_2_BLOCK_ID, portoSeguro } from './op-log.ts';
import { portoSeguroSmall } from './small/op-log.ts';

/*
 * Story 3.7: the Porto Seguro fixture's own kernel tests. One deviation from this story's
 * spec, recorded here and in `data.ts`'s file header for the review: the spec's test task
 * asks for "a full-log assertion that zero checklist.*.result cells exist across all 94
 * blocks", following `extract-raw-sources.md`'s claim that the delivered document carries no
 * C/NC/NA marks. Reading the actual DOCX pages (not the extract) shows the opposite: every
 * one of the 94 sheets carries real checkmarks, uniform per block type. This suite asserts
 * that real, verified behaviour instead of the extract's now-corrected claim.
 */

function snapshotOf(log: typeof portoSeguro.log, deadOpIds: readonly string[]) {
  return buildSnapshot(replay(log, { deadOpIds }), portoSeguro.relatorioId);
}

describe('3.7-UNIT-001 Porto Seguro fixture: full log', () => {
  it('replays to exactly the golden snapshot', () => {
    const snapshot = snapshotOf(portoSeguro.log, portoSeguro.deadOpIds);
    expect(serializeSnapshot(snapshot)).toBe(serializeSnapshot(relatorioSnapshotSchema.parse(portoSeguro.golden)));
  });

  it('produces one project, one relatorio, 23 locations (6 cabines + 17 colunas) and 94 equipment/block rows', () => {
    const snapshot = snapshotOf(portoSeguro.log, portoSeguro.deadOpIds);
    expect(snapshot.project?.id).toBe(portoSeguro.projectId);
    expect(snapshot.relatorio.id).toBe(portoSeguro.relatorioId);
    expect(snapshot.locations).toHaveLength(23);
    expect(snapshot.locations.filter((l) => l.kind === 'cabine')).toHaveLength(6);
    expect(snapshot.locations.filter((l) => l.kind === 'coluna')).toHaveLength(17);
    expect(snapshot.equipment).toHaveLength(94);
    expect(snapshot.blocks).toHaveLength(94);
  });

  it('the block_type distribution matches templateTotals(standardTemplate(...))', () => {
    const snapshot = snapshotOf(portoSeguro.log, portoSeguro.deadOpIds);
    const totals = templateTotals(standardTemplate({ id: portoSeguro.companyId }));
    const byType: Partial<Record<EquipmentBlockType, number>> = {};
    for (const block of snapshot.blocks) byType[block.block_type as EquipmentBlockType] = (byType[block.block_type as EquipmentBlockType] ?? 0) + 1;
    expect(byType).toEqual(totals);
    expect(Object.values(totals).reduce((a, b) => a + b, 0)).toBe(94);
    expect(totals).toEqual({
      chave_seccionadora: 25,
      disjuntor_mt: 21,
      tp: 11,
      tc: 11,
      transformador_forca: 8,
      cabos_entrada: 4,
      cabos_saida: 9,
      para_raio: 5,
    });
  });

  it('the two seccionadoras and the one TIE disjuntor named in section 8 bullet 4 carry not_tested and no test/checklist cells', () => {
    const snapshot = snapshotOf(portoSeguro.log, portoSeguro.deadOpIds);
    expect(NOT_TESTED_BLOCK_IDS).toHaveLength(3);
    const notTested = snapshot.blocks.filter((b) => NOT_TESTED_BLOCK_IDS.includes(b.id));
    expect(notTested).toHaveLength(3);
    expect(notTested.filter((b) => b.block_type === 'chave_seccionadora')).toHaveLength(2);
    expect(notTested.filter((b) => b.block_type === 'disjuntor_mt')).toHaveLength(1);
    for (const block of notTested) {
      expect(block.not_tested).not.toBeNull();
      expect(block.not_tested?.reason).toBe('Solicitação do cliente');
      expect(Object.keys(block.sheet.test)).toHaveLength(0);
      expect(Object.keys(block.sheet.checklist)).toHaveLength(0);
    }
    // A block with `not_tested` set that also has measured test cells is a spec bug (I/O matrix).
    for (const block of snapshot.blocks) {
      if (block.not_tested) expect(Object.keys(block.sheet.test)).toHaveLength(0);
    }
  });

  it('the named NOT_TESTED_* exports resolve to the block type their own name claims', () => {
    const snapshot = snapshotOf(portoSeguro.log, portoSeguro.deadOpIds);
    const byId = new Map(snapshot.blocks.map((b) => [b.id, b]));
    expect(byId.get(NOT_TESTED_SECCIONADORA_1_BLOCK_ID)?.block_type).toBe('chave_seccionadora');
    expect(byId.get(NOT_TESTED_SECCIONADORA_2_BLOCK_ID)?.block_type).toBe('chave_seccionadora');
    expect(byId.get(NOT_TESTED_DISJUNTOR_BLOCK_ID)?.block_type).toBe('disjuntor_mt');
  });

  it('checklist marks: NA on the fixed per-type set, C elsewhere, real per the DOCX (not blank)', () => {
    const snapshot = snapshotOf(portoSeguro.log, portoSeguro.deadOpIds);
    const tested = snapshot.blocks.filter((b) => !b.not_tested);
    for (const block of tested) {
      const na = new Set(NA_ITEMS_BY_TYPE[block.block_type as EquipmentBlockType] ?? []);
      for (const [key, item] of Object.entries(block.sheet.checklist)) {
        expect(item.result?.value).toBe(na.has(key as never) ? 'NA' : 'C');
      }
    }
    const totalCells = tested.reduce((sum, b) => sum + Object.keys(b.sheet.checklist).length, 0);
    expect(totalCells).toBeGreaterThan(0);
  });

  it('carries the five contact-resistance readings above <250 µΩ named in the story AC', () => {
    const snapshot = snapshotOf(portoSeguro.log, portoSeguro.deadOpIds);
    const above: number[] = [];
    for (const block of snapshot.blocks) {
      const test = block.sheet.test.resistencia_contato;
      if (!test) continue;
      for (const row of Object.values(test.cells)) {
        for (const cell of Object.values(row)) {
          const value = cell.value as { raw: string };
          const parsed = Number.parseFloat(value.raw);
          if (parsed > 250) above.push(parsed);
        }
      }
    }
    expect(above).toEqual(expect.arrayContaining([251, 297, 281, 279, 303]));
    // Not `toHaveLength(5)`: the real, faithfully-transcribed data has 12 contact-resistance
    // readings above 250 uOhm across the full 94-sheet fixture (every tested chave/disjuntor
    // block, not only the Enel pair the AC and the planning extract single out). The AC's "the
    // five ... readings" names a specific, must-be-present subset (this is why they are pinned
    // by value above), not a total-count ceiling on the whole document -- see this story's
    // handback note to the reviewer for the verified count.
  });

  it('carries 82 section 7 photo placeholders, reproducing the 75/76-repeated-4x numbering defect', () => {
    const snapshot = snapshotOf(portoSeguro.log, portoSeguro.deadOpIds);
    expect(snapshot.files).toHaveLength(82);
    const photos = snapshot.files.filter((f) => f.kind === 'photo');
    const captions75 = photos.filter((f) => f.caption?.startsWith('Imagem 75:'));
    const captions76 = photos.filter((f) => f.caption?.startsWith('Imagem 76:'));
    expect(captions75).toHaveLength(4);
    expect(captions76).toHaveLength(4);
  });

  it('carries the cover client, site, dates, responsible person under this fixture only', () => {
    const snapshot = snapshotOf(portoSeguro.log, portoSeguro.deadOpIds);
    expect(snapshot.client?.name).toBe('Porto Seguro Companhia de Seguros Gerais');
    expect(snapshot.relatorio.setup.service_start).toBe('2026-09-06');
    expect(snapshot.relatorio.setup.responsible_user_id).toBe(portoSeguro.userId);
    expect(snapshot.instruments).toHaveLength(3);
  });

  it('a rejected op is excluded from every materialization (none in this fixture)', () => {
    expect(portoSeguro.deadOpIds).toEqual([]);
  });
});

describe('3.7-UNIT-002 determinism: no wall-clock or random source', () => {
  for (const path of ['op-log.ts', 'small/op-log.ts']) {
    it(`${path} calls no Date.now(), Math.random() or crypto.randomUUID()`, () => {
      const source = readFileSync(fileURLToPath(new URL(`./${path}`, import.meta.url)), 'utf8');
      expect(source).not.toMatch(/Date\.now\(/);
      expect(source).not.toMatch(/Math\.random\(/);
      expect(source).not.toMatch(/crypto\.randomUUID\(/);
    });
  }

  it('every op carries a fixed op_id and client_ts (re-running replay is byte-stable)', () => {
    const a = serializeSnapshot(snapshotOf(portoSeguro.log, portoSeguro.deadOpIds));
    const b = serializeSnapshot(snapshotOf(portoSeguro.log, portoSeguro.deadOpIds));
    expect(a).toBe(b);
    expect(portoSeguro.log.every((op) => typeof op.op_id === 'string' && typeof op.client_ts === 'string')).toBe(true);
  });

  it('the full and small fixtures use distinct id prefixes (no collision when both are imported)', () => {
    expect(portoSeguro.companyId.startsWith('019966c0-')).toBe(true);
    expect(portoSeguroSmall.companyId.startsWith('019966c1-')).toBe(true);
    const fullIds = new Set(portoSeguro.log.map((op) => op.op_id));
    const smallIds = new Set(portoSeguroSmall.log.map((op) => op.op_id));
    for (const id of smallIds) expect(fullIds.has(id)).toBe(false);
  });
});

describe('3.7-UNIT-003 (TC-8) the small fixture: one cabine, three blocks', () => {
  function smallSnapshotOf() {
    return buildSnapshot(replay(portoSeguroSmall.log, { deadOpIds: portoSeguroSmall.deadOpIds }), portoSeguroSmall.relatorioId);
  }

  it('replays to exactly its own golden snapshot', () => {
    const snapshot = smallSnapshotOf();
    expect(serializeSnapshot(snapshot)).toBe(serializeSnapshot(relatorioSnapshotSchema.parse(portoSeguroSmall.golden)));
  });

  it('has one cabine and three blocks (chave_seccionadora, disjuntor_mt, transformador_forca)', () => {
    const snapshot = smallSnapshotOf();
    expect(snapshot.locations).toHaveLength(1);
    expect(snapshot.locations[0]?.kind).toBe('cabine');
    expect(snapshot.blocks).toHaveLength(3);
    expect(snapshot.blocks.map((b) => b.block_type).sort()).toEqual(['chave_seccionadora', 'disjuntor_mt', 'transformador_forca']);
  });

  it('the disjuntor_mt block is not_tested, matching the full fixture pattern', () => {
    const snapshot = smallSnapshotOf();
    const disjuntor = snapshot.blocks.find((b) => b.block_type === 'disjuntor_mt')!;
    expect(disjuntor.not_tested).not.toBeNull();
    expect(Object.keys(disjuntor.sheet.test)).toHaveLength(0);
  });

  it('the transformador_forca block references a real ratiometer instrument row, not the megôhmetro', () => {
    const snapshot = smallSnapshotOf();
    const transformador = snapshot.blocks.find((b) => b.block_type === 'transformador_forca')!;
    const ratioCell = transformador.sheet.test.relacao_transformacao?.instrument?.value as { instrument_id: string; code: string; model: string } | undefined;
    expect(ratioCell).toBeDefined();
    const referenced = snapshot.instruments.find((i) => i.id === ratioCell?.instrument_id);
    expect(referenced).toBeDefined();
    expect(referenced?.code).toBe(ratioCell?.code);
    expect(referenced?.model).toBe(ratioCell?.model);
  });
});
