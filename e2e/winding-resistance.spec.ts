import { conclusionSuggestionText } from '@app/domain';
import type { Page } from '@playwright/test';
import { cellOf, issueAndReadTables, kernelOf, openStep, outboxValues, plateField, setUpRelatorio, tablesTitled, testSection, typeCell } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';

/*
 * Story 23.15 (seed v13, decision I; Base rev08 TR-OL-05, TR-SE-05): the transformer's winding
 * resistance, as a person records it at 1280 px. The office set the plate (ÓLEO ISOLANTE, Cu,
 * TEMPERATURA DO ÓLEO 30 °C). The person types the AT row on the tap in service, 1, 1,01 and 1,03 Ω:
 * each phase shows its value at 75 °C, the temperature line names the oil, phase C (3 % over the
 * lowest) is restricted and the conclusion asks Aprovado · Com restrições; 1,06 Ω (6 %) is out and the
 * floor Reprovado. The plate turned EPÓXI (dry), phase C typed above the instrument's limit is an open
 * circuit, out, Reprovado. The issued DOCX prints the winding table with its "75 °C" group and the
 * TEMPERATURA line. Every expected word is the kernel's over the device's own rows. It issues a
 * revision through the api's one queue and LibreOffice, so it runs in the serial group.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const KEY = 'resistencia_enrolamento';
const conclusionHint = (page: Page) => page.locator('.conclusion-hint:not(.e24-preview-line)');

test('@p0 23.15-E2E-001 a v13 oil transformer\'s winding resistance: 3 % between phases restricts, 6 % fails, each phase shown at 75 °C; dry with an open circuit fails; the DOCX prints the table with its 75 °C group', async ({ page }) => {
  test.setTimeout(300_000);
  const { relatorioId, sheets } = await setUpRelatorio(page, account, database, () => [
    { blockType: 'transformador_forca', key: 'tipo_de_isolacao', value: 'ÓLEO ISOLANTE' },
    { blockType: 'transformador_forca', key: 'material_enrolamento', value: 'Cu' },
    { blockType: 'transformador_forca', key: 'temperatura_oleo_c', value: { raw: '30', unit: '°C', state: 'measured' } },
  ]);
  const tf = sheets.find((sheet) => sheet.blockType === 'transformador_forca')!;
  await openStep(page, relatorioId, tf.blockId, 'Ensaios');
  const section = testSection(page, KEY);
  await expect(section.locator('h2')).toHaveText('Resistência ôhmica dos enrolamentos');

  // The AT row on the tap in service, phase by phase.
  for (const [col, text] of [[0, '1'], [1, '1,01'], [2, '1,03']] as const) await typeCell(page, database, tf.blockId, KEY, 0, col, text);
  expect(await outboxValues(database, page, `sheet/${tf.blockId}/test/${KEY}/cell/0/2`)).toEqual([{ raw: '1.03', unit: 'Ω', state: 'measured' }]);

  const oil = await kernelOf(page, database, relatorioId, tf.blockId);
  const winding = oil.measurement(KEY);
  const at = winding.rows[0]!;
  expect(at.cells.map((cell) => cell.verdict)).toEqual(['within', 'within', 'restricted']);
  expect(winding.temperature!.print).toBe('30 °C (ÓLEO)');
  // The temperature line and each phase's value at 75 °C, the kernel's words.
  await expect(section.locator('.v13-line[data-temperature-line]')).toContainText(`${winding.temperature!.line.label} ${winding.temperature!.line.value}`);
  for (const cell of at.cells) {
    await expect(section.locator(`.corrected-line[data-corrected-line="0/${cell.address.col}"]`).filter({ visible: true })).toContainText(`${winding.temperature!.cellLead} ${cell.corrected!.text}`);
  }
  // Phase C restricted: the amber rule and the "Com restrição:" helper.
  const c = cellOf(page, KEY, 0, 2);
  await expect(c.locator('.measurement-field')).toHaveAttribute('data-state', 'restricted');
  await expect(c.locator('.mf-helper[data-tone="restricted"]')).toHaveText(`Com restrição: ${at.cells[2]!.restriction!.text}`);
  expect(oil.floorReason).toBe('A ficha exige no mínimo Aprovado · Com restrições: leitura com restrição.');
  await openStep(page, relatorioId, tf.blockId, 'Conclusão');
  await expect(conclusionHint(page)).toHaveText(oil.floorReason!);
  await expect(page.locator('#ficha-step-conclusao')).toContainText(conclusionSuggestionText({ result: 'aprovado', restriction: 'com_restricoes' }));

  // 1,06 Ω: 6 % over the lowest, out; the floor Reprovado.
  await openStep(page, relatorioId, tf.blockId, 'Ensaios');
  await typeCell(page, database, tf.blockId, KEY, 0, 2, '1,06');
  const failed = await kernelOf(page, database, relatorioId, tf.blockId);
  const outCell = failed.measurement(KEY).rows[0]!.cells[2]!;
  expect(outCell.verdict).toBe('out');
  await expect(c.locator('.measurement-field')).toHaveAttribute('data-state', 'out-of-limit');
  await expect(c.locator('.mf-helper[role="status"]')).toContainText(outCell.helperText!);
  await openStep(page, relatorioId, tf.blockId, 'Conclusão');
  await expect(conclusionHint(page)).toHaveText(failed.floorReason!);
  expect(failed.floorReason).toContain('Reprovado');

  // The plate turned dry (EPÓXI); phase C above the instrument's limit: an open circuit, out, Reprovado.
  await openStep(page, relatorioId, tf.blockId, 'Placa');
  await plateField(page, 'tipo_de_isolacao').locator('select').selectOption('EPÓXI');
  await expect.poll(async () => (await outboxValues(database, page, `sheet/${tf.blockId}/nameplate/tipo_de_isolacao`)).at(-1)).toBe('EPÓXI');
  await openStep(page, relatorioId, tf.blockId, 'Ensaios');
  await typeCell(page, database, tf.blockId, KEY, 0, 2, '> 2000');
  expect((await outboxValues(database, page, `sheet/${tf.blockId}/test/${KEY}/cell/0/2`)).at(-1)).toEqual({ raw: '2000', unit: 'Ω', state: 'over_range' });
  const dry = await kernelOf(page, database, relatorioId, tf.blockId);
  const open = dry.measurement(KEY);
  expect(open.rows[0]!.cells.map((cell) => cell.verdict)).toEqual(['within', 'within', 'out']);
  expect(open.rows[0]!.cells[2]!.helperText).toBe('Acima do limite do instrumento: circuito aberto');
  await expect(c.locator('.measurement-field')).toHaveAttribute('data-state', 'out-of-limit');
  expect(dry.floorReason).toContain('Reprovado');

  // The DOCX: the winding table, its TEMPERATURA line (no winding temperature, no ambient: "-") and its 75 °C group.
  const tables = await issueAndReadTables(page, database, relatorioId);
  const [printed] = tablesTitled(tables, 'RESISTÊNCIA ÔHMICA DOS ENROLAMENTOS');
  expect(printed).toBeDefined();
  expect(printed!.some((row) => row.join(' ') === `TEMPERATURA: ${open.temperature!.print}`)).toBe(true);
  expect(printed!.some((row) => row.includes('75 °C'))).toBe(true);
  expect(printed!.some((row) => row.join('|') === 'ENROLAMENTO|FASE A|FASE B|FASE C|FASE A|FASE B|FASE C')).toBe(true);
  const atRow = printed!.find((row) => row[0] === 'AT, TAP ATUAL')!;
  expect(atRow.slice(1, 4)).toEqual(['1 Ω', '1,01 Ω', '> 2.000 Ω']);
  expect(atRow.slice(4)).toEqual(['-', '-', '-']);
});
