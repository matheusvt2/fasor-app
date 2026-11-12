import { choiceValue, section9Layout, type PrintTable } from '@app/domain';
import type { BrowserContext, Page } from '@playwright/test';
import { deviceSnapshot, kernelOf, openStep, outboxValues, setUpRelatorio, testSection, typeCell } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { pdfTextItems } from './support/pdf-text.ts';
import { syncNow } from './support/sync.ts';

/*
 * Story 25.20 (seed v15 `criterion_result_per_row` and `corrected_headers_corrigido`; M24, Bruno's answers 2, 3 and 5;
 * the approved frame `key-print-section-9-v15.html`), on a new relatório (seed v15) at 1280 px. The office set the oil
 * transformer's plate (ÓLEO ISOLANTE, Cu, oil at 30 °C). The person types the winding's AT row on the tap in service,
 * 1, 1,01 and 1,03 Ω (phase C 3 % over the lowest: restricted), and its BT row; answers the thermography's load "Sim"
 * and types one point's two ΔT, 4 °C between similares (restricted) and 8 °C over the ambient (within). The draft PDF
 * ("Pré-visualizar") is read: the winding table and the thermography print, row by row, the kernel's layout of the
 * device's own sheet, with CRITÉRIO and RESULTADO last: the AT row "COM RESTRIÇÃO", the BT row "SATISFATÓRIO", the
 * thermography's point both criteria and "COM RESTRIÇÃO", a point left empty "-"; the corrected columns read
 * "75 °C (corrigido)" and "20 °C (corrigido)"; "Tipo da empresa" prints nowhere. The preview goes through the api's one
 * queue and LibreOffice, so this spec runs in the `queue` lane (`e2e/support/groups.ts`).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const JOB_TIMEOUT = 150_000;
const WINDING = 'resistencia_enrolamento';
const THERMO = 'termografia';
/** A text as the PDF's items read it, compacted: no whitespace (the no-break space included), NFKC. */
const compact = (text: string) => text.normalize('NFKC').replace(/\s+/gu, '');

/** "Pré-visualizar" in the Export dialog; the draft PDF's text, compacted. */
async function previewText(page: Page, context: BrowserContext, relatorioId: string): Promise<string> {
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  const dialog = page.getByRole('dialog', { name: 'Gerar relatório' });
  const preview = dialog.locator('.generate-row').getByRole('button', { name: 'Pré-visualizar' });
  await expect(preview).toBeEnabled({ timeout: 30_000 });
  const tabPromise = context.waitForEvent('page');
  await preview.click();
  const tab = await tabPromise;
  const requested = await tab.waitForRequest(/\/api\/relatorios\/[0-9a-f-]{36}\/preview\.pdf\?v=[0-9a-f-]{36}$/, { timeout: JOB_TIMEOUT });
  const pdf = await page.request.get(requested.url());
  expect(pdf.status()).toBe(200);
  await tab.close();
  await page.keyboard.press('Escape');
  return compact((await pdfTextItems(new Uint8Array(await pdf.body()))).join(' '));
}

/** The table of `blockId`'s sheet whose title band reads `title`, as the kernel lays it out over the device's rows. */
async function kernelTable(page: Page, relatorioId: string, blockId: string, title: string): Promise<string[][]> {
  const snapshot = await deviceSnapshot(page, database, relatorioId);
  const sheet = section9Layout(snapshot, 9, 'RESULTADOS')!.subsections.flatMap((sub) => sub.sheets).find((one) => one.blockId === blockId)!;
  const table = sheet.parts.flatMap((part): PrintTable[] => (part.kind === 'table' ? [part.table] : [])).find((one) => one.rows[0]!.cells[0]!.text.replaceAll('\u00a0', ' ') === title)!;
  return table.rows.map((row) => row.cells.map((cell) => cell.text.replaceAll('\u00a0', ' ')));
}

test('@p0 25.20-E2E-001 a v15 transformer\'s winding and thermography typed in the browser: the PDF prints CRITÉRIO and RESULTADO on each row and the corrected headers say "(corrigido)"', async ({ page, context }) => {
  test.setTimeout(360_000);
  const { relatorioId, sheets } = await setUpRelatorio(page, account, database, () => [
    { blockType: 'transformador_forca', key: 'tipo_de_isolacao', value: 'ÓLEO ISOLANTE' },
    { blockType: 'transformador_forca', key: 'material_enrolamento', value: 'Cu' },
    { blockType: 'transformador_forca', key: 'temperatura_oleo_c', value: { raw: '30', unit: '°C', state: 'measured' } },
  ]);
  const tf = sheets.find((sheet) => sheet.blockType === 'transformador_forca')!;
  await openStep(page, relatorioId, tf.blockId, 'Ensaios');

  // The winding: AT on the tap in service, phase C 3 % over the lowest; BT within.
  for (const [col, text] of [[0, '1'], [1, '1,01'], [2, '1,03']] as const) await typeCell(page, database, tf.blockId, WINDING, 0, col, text);
  for (const [col, text] of [[0, '3,1'], [1, '3,11'], [2, '3,12']] as const) await typeCell(page, database, tf.blockId, WINDING, 3, col, text);
  // The thermography in load; TERMINAÇÕES 4 °C between similares (restricted) and 8 °C over the ambient (within).
  const load = `sheet/${tf.blockId}/test/${THERMO}/value/em_carga`;
  await testSection(page, THERMO).getByRole('radiogroup', { name: 'Equipamento em carga' }).getByRole('radio', { name: 'Sim' }).click();
  await expect.poll(async () => (await outboxValues(database, page, load)).at(-1)).toEqual(choiceValue('sim'));
  await typeCell(page, database, tf.blockId, THERMO, 1, 0, '4');
  await typeCell(page, database, tf.blockId, THERMO, 1, 1, '8');

  const kernel = await kernelOf(page, database, relatorioId, tf.blockId);
  expect(kernel.measurement(WINDING).rows[0]!.cells.map((cell) => cell.verdict)).toEqual(['within', 'within', 'restricted']);
  expect(kernel.measurement(THERMO).rows[1]!.cells.map((cell) => cell.verdict)).toEqual(['restricted', 'within']);

  // The kernel's layout of the device's sheet: the two columns last, the words of the story.
  const winding = await kernelTable(page, relatorioId, tf.blockId, 'RESISTÊNCIA ÔHMICA DOS ENROLAMENTOS');
  const thermo = await kernelTable(page, relatorioId, tf.blockId, 'TERMOGRAFIA');
  const rowOf = (table: string[][], label: string) => table.find((row) => row[0] === label)!;
  expect(winding.some((row) => row.includes('75 °C (corrigido)'))).toBe(true);
  expect(winding.find((row) => row.includes('CRITÉRIO'))!.slice(-2)).toEqual(['CRITÉRIO', 'RESULTADO']);
  expect(rowOf(winding, 'AT, TAP ATUAL').slice(-2)).toEqual(['desvio entre fases ≤ 2 % (com restrição até 5 %)', 'COM RESTRIÇÃO']);
  expect(rowOf(winding, 'BT').at(-1)).toBe('SATISFATÓRIO');
  expect(rowOf(thermo, 'TERMINAÇÕES').slice(-2)).toEqual(['ΔT entre similares ≤ 3 °C (com restrição até 15 °C)\nΔT sobre o ambiente ≤ 10 °C (com restrição até 40 °C)', 'COM RESTRIÇÃO']);
  expect(rowOf(thermo, 'CONEXÕES').at(-1)).toBe('-');

  // The draft PDF prints every row of both tables as the kernel lays it out, and the corrected headers.
  await syncNow(page);
  const text = await previewText(page, context, relatorioId);
  for (const row of [...winding, ...thermo]) expect(text, row.join(' | ')).toContain(compact(row.join(' ')));
  expect(text).toContain(compact('75 °C (corrigido)'));
  expect(text).toContain(compact('20 °C (corrigido)'));
  expect(text.toLocaleLowerCase('pt-BR')).not.toContain(compact('tipo da empresa'));
});
