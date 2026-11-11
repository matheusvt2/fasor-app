import { describe, expect, it } from 'vitest';
import { layoutLockSnapshot } from '../../fixtures/layout-lock/op-log.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { printTextEm } from './text-metrics.ts';
import { joinUnits, readingFitWidthEm, section9Layout, wordsWiderThanColumns, type PrintSheet, type PrintTable } from './section-9.ts';

/*
 * Fix batch e24y (P1, the hands-on pass of 2026-11-11): on a second visit the Disjuntor MT's and the
 * seccionadora's paired insulation tables printed "GUARD" as "GUAR" over "D" and cut every "20 °C" in
 * two lines. The pair was fitted by `emWidth` against the 60 em budget, which under-measures the bold
 * capitals; e23p's whole fit skipped it (`measurementTable`'s `single`). On v14
 * (`paired_tables_fit_whole`) the pair is fitted whole and each value keeps its unit (a no-break space);
 * v13 keeps its pair byte for byte (its weights and size below are the baseline's, recorded on
 * 7b68f225). The relatórios are the layout lock's, the cabine given an ambient of 25 °C so the "20 °C"
 * column holds values. Every value is invented.
 */

const TITLE = 'RELATÓRIOS DOS ENSAIOS';
const NBSP = '\u00a0';

function withAmbient(snapshot: RelatorioSnapshot): RelatorioSnapshot {
  return { ...snapshot, locations: snapshot.locations.map((row) => (row.kind === 'cabine' ? { ...row, env: { ...row.env, temperature_c: { raw: '25', unit: '°C', state: 'measured' as const } } } : row)) };
}

function sheetOf(snapshot: RelatorioSnapshot, type: string): PrintSheet {
  const block = snapshot.blocks.find((one) => one.block_type === type && one.removed_at === null && one.equipment_id !== null)!;
  return (section9Layout(snapshot, 9, TITLE)?.subsections ?? []).flatMap((sub) => sub.sheets).find((sheet) => sheet.blockId === block.id)!;
}

const tablesOf = (sheet: PrintSheet): PrintTable[] => sheet.parts.flatMap((part) => (part.kind === 'table' ? [part.table] : []));
const pairOf = (sheet: PrintSheet): PrintTable => tablesOf(sheet).find((table) => table.columns.length === 14 && table.rows.some((row) => row.cells.some((cell) => cell.text === 'GUARD')))!;
const windingOf = (sheet: PrintSheet): PrintTable => tablesOf(sheet).find((table) => table.rows[0]!.cells[0]!.text === 'RESISTÊNCIA ÔHMICA DOS ENROLAMENTOS')!;
const texts = (table: PrintTable) => table.rows.flatMap((row) => row.cells.map((cell) => cell.text));
const weights = (table: PrintTable) => table.columns.map((weight) => weight.toFixed(2)).join(',');

const v13 = withAmbient(layoutLockSnapshot('v13'));
const v14 = withAmbient(layoutLockSnapshot('v14'));

describe('e24y-P1-UNIT the paired insulation tables fit whole on v14, each value with its unit', () => {
  it('joins a number to the word right after it with a no-break space, every other space kept', () => {
    expect(joinUnits('1,21 mΩ')).toBe(`1,21${NBSP}mΩ`);
    expect(joinUnits('20 °C')).toBe(`20${NBSP}°C`);
    expect(joinUnits('> 2 TΩ')).toBe(`> 2${NBSP}TΩ`);
    expect(joinUnits('1,08 Ω · 1,09 Ω')).toBe(`1,08${NBSP}Ω · 1,09${NBSP}Ω`);
    expect(joinUnits('FASE A')).toBe(`FASE${NBSP}A`);
    expect(joinUnits('DISJUNTOR CONTATO ABERTO')).toBe('DISJUNTOR CONTATO ABERTO');
    expect(joinUnits('TENSÃO (kV)')).toBe('TENSÃO (kV)');
    expect(joinUnits('MANUT. ANTERIOR\n05/11/2025')).toBe('MANUT. ANTERIOR\n05/11/2025');
  });

  for (const type of ['disjuntor_mt', 'chave_seccionadora']) {
    it(`${type}: v14 prints every word and value whole in its column (GUARD, FASE A, 20 °C, the values with their units)`, () => {
      const pair = pairOf(sheetOf(v14, type));
      expect(wordsWiderThanColumns(pair, readingFitWidthEm(pair))).toEqual([]);
      const cells = texts(pair);
      expect(cells.filter((text) => text === `20${NBSP}°C`)).toHaveLength(2);
      expect(cells).toContain('GUARD');
      expect(cells).toContain(`FASE${NBSP}A`);
      expect(cells.filter((text) => /\d GΩ/u.test(text))).toEqual([]);
      expect(cells.some((text) => text.includes(`${NBSP}GΩ`))).toBe(true);
    });

    it(`${type}: v13 keeps the pair it printed on the baseline (weights, size and texts), "GUARD" still wider than its column`, () => {
      const pair = pairOf(sheetOf(v13, type));
      expect(weights(pair)).toBe('3.91,4.32,4.32,5.01,5.69,3.14,5.96,3.91,4.32,4.32,5.01,5.69,3.14,5.96');
      expect(pair.textHalfPoints).toBe(16);
      expect(texts(pair).some((text) => text.includes(NBSP))).toBe(false);
      // Measured by the face's widths (Arial bold at 8 pt plus the cell's margins) against its share of the page's 58 em:
      // the GUARD header does not fit its column, as the v13 golden prints it ("GUAR" over "D").
      const share = (pair.columns[2]! / pair.columns.reduce((sum, weight) => sum + weight, 0)) * 58;
      expect(printTextEm('GUARD', true) * (16 / 18) + 0.9).toBeGreaterThan(share);
    });
  }

  it('the v14 winding table\'s MANUT. ANTERIOR keeps each value with its unit; v13 as before', () => {
    const winding14 = windingOf(sheetOf(v14, 'transformador_forca'));
    const previous14 = winding14.rows.map((row) => row.cells.at(-1)!.text).filter((text) => text.includes('Ω'));
    expect(previous14.length).toBeGreaterThan(0);
    for (const text of previous14) {
      expect(text).toMatch(/\d\u00a0m?Ω/u);
      expect(text).not.toMatch(/\d m?Ω/u);
    }
    const winding13 = windingOf(sheetOf(v13, 'transformador_forca'));
    const previous13 = winding13.rows.map((row) => row.cells.at(-1)!.text).filter((text) => text.includes('Ω'));
    expect(previous13.length).toBeGreaterThan(0);
    for (const text of previous13) expect(text.includes(NBSP)).toBe(false);
  });
});
