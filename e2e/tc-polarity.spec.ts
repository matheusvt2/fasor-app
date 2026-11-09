import { derivedPoints } from '@app/domain';
import { deviceSnapshot, issueAndReadTables, kernelOf, openStep, outboxValues, setUpRelatorio, testSection, typeCell } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';

/*
 * Story 23.18 (seed v13, decision E; Base rev08 TC-02, TC-03): the TC's polarity, function and S class,
 * as a person records them at 1280 px. The office set EXATIDÃO 0,3S, RELAÇÃO 200/5 and FUNÇÃO DO TC
 * FATURAMENTO: the insulation test shows the faturamento notice and still takes a reading; the ratio row
 * at 40,1 (0,25 %) is within ± 0,3 %. Fase R's POLARIDADE set Invertida writes one cell put (the outbox),
 * puts the row out (CONDIÇÕES INSATISFATÓRIO), shows the frame's helper, sets the floor Reprovado and a
 * derived point names it. The issued DOCX prints POLARIDADE right before CONDIÇÕES, INVERTIDA and
 * INSATISFATÓRIO on Fase R, ACEITÁVEL ±0,3 % and the note under the ratio table. Every expected word is
 * the kernel's over the device's own rows. It issues a revision through the api's one queue and
 * LibreOffice, so it runs in the serial group.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const RATIO = 'relacao_transformacao';

test('@p0 23.18-E2E-001 a v13 TC 0,3S of FATURAMENTO: the notice over a fillable insulation test, 0,25 % within ± 0,3 %, Fase R\'s polarity Invertida fails the row (Reprovado, a derived point, the outbox), and the DOCX prints POLARIDADE before CONDIÇÕES with the note', async ({ page }) => {
  test.setTimeout(360_000);
  const { relatorioId, sheets } = await setUpRelatorio(page, account, database, () => [
    { blockType: 'tc', key: 'exatidao', value: '0,3S' },
    { blockType: 'tc', key: 'relacao', value: '200/5' },
    { blockType: 'tc', key: 'funcao_tc', value: 'FATURAMENTO' },
  ]);
  const tc = sheets.find((sheet) => sheet.blockType === 'tc')!;
  await openStep(page, relatorioId, tc.blockId, 'Ensaios');

  // FATURAMENTO: the kernel's notice under the insulation test, which still takes a reading.
  const before = await kernelOf(page, database, relatorioId, tc.blockId);
  const notice = before.test('isolacao').notice!;
  expect(notice).toBe('TC de faturamento: o ensaio de isolação depende de autorização da concessionária.');
  await expect(testSection(page, 'isolacao').locator('[data-test-notice]')).toHaveText(notice);
  await typeCell(page, database, tc.blockId, 'isolacao', 0, 1, '30');

  // The ratio at 40,1 against 200/5: 0,25 %, within ± 0,3 % (the S class judged as its class).
  await typeCell(page, database, tc.blockId, RATIO, 0, 3, '40,1');
  const within = (await kernelOf(page, database, relatorioId, tc.blockId)).test(RATIO);
  expect(within.criterionText).toBe('±0,3 %');
  expect(within.tables[0]!.rows[0]!.condicao).toBe('SATISFATÓRIO');

  // Fase R's polarity Invertida: one cell put, the row out, the frame's helper, the floor and a derived point.
  const polarity = testSection(page, RATIO).locator('[data-row-choice="0"]').filter({ visible: true });
  await polarity.getByRole('radio', { name: 'Invertida' }).click();
  const choiceCol = within.tables[0]!.choiceColumn!.col;
  await expect.poll(async () => outboxValues(database, page, `sheet/${tc.blockId}/test/${RATIO}/cell/0/${choiceCol}`)).toEqual([{ raw: 'INVERTIDA', unit: null, state: 'measured' }]);
  await expect(polarity.getByRole('radio', { name: 'Invertida' })).toHaveAttribute('aria-checked', 'true');
  const judged = await kernelOf(page, database, relatorioId, tc.blockId);
  const row = judged.test(RATIO).tables[0]!.rows[0]!;
  expect([row.choice!.verdict, row.condicao]).toEqual(['out', 'INSATISFATÓRIO']);
  await expect(testSection(page, RATIO).locator('[data-choice-helper="0"]')).toHaveText(row.choice!.helperText!);
  expect(judged.floorReason).toMatch(/^A ficha exige no mínimo Reprovado · Com restrições: .*relação de transformação insatisfatória/);
  const point = derivedPoints(judged.snapshot).find((one) => one.block_id === tc.blockId && one.test_key === RATIO)!;
  expect(point.text).toContain('polaridade invertida em Fase R');
  await openStep(page, relatorioId, tc.blockId, 'Conclusão');
  await expect(page.locator('.conclusion-hint')).toHaveText(judged.floorReason!);

  // The DOCX: POLARIDADE right before CONDIÇÕES, Fase R INVERTIDA and INSATISFATÓRIO; ACEITÁVEL ±0,3 %; the note under the ratio.
  const snapshot = await deviceSnapshot(page, database, relatorioId);
  expect(snapshot.blocks.find((block) => block.id === tc.blockId)!.sheet.test[RATIO]!.cells['0']![String(choiceCol)]!.value).toEqual({ raw: 'INVERTIDA', unit: null, state: 'measured' });
  const tables = await issueAndReadTables(page, database, relatorioId);
  const ratios = tables.filter((table) => table.some((cells) => cells.includes('POLARIDADE') && cells.includes('CONDIÇÕES')));
  const failed = ratios.find((table) => table.some((cells) => cells.includes('INVERTIDA')))!;
  const header = failed.find((cells) => cells.includes('POLARIDADE'))!;
  expect(header.indexOf('POLARIDADE')).toBe(header.indexOf('CONDIÇÕES') - 1);
  const faseR = failed.find((cells) => cells.includes('INVERTIDA'))!;
  expect(faseR[header.indexOf('CONDIÇÕES')]).toBe('INSATISFATÓRIO');
  // Every v13 TC and TP of the relatório prints its ratio with the column (the template's other ones, nothing typed, "-").
  expect(ratios.length).toBe(sheets.filter((sheet) => sheet.blockType === 'tc' || sheet.blockType === 'tp').length);
  expect(JSON.stringify(tables)).toContain('±0,3 %');
});

test('@p1 23.18-E2E-002 the note "Verificação de relação" prints under the ratio of each TC and TP', async ({ page }) => {
  test.setTimeout(300_000);
  const { relatorioId, sheets } = await setUpRelatorio(page, account, database);
  const tc = sheets.find((sheet) => sheet.blockType === 'tc')!;
  await openStep(page, relatorioId, tc.blockId, 'Ensaios');
  const note = (await kernelOf(page, database, relatorioId, tc.blockId)).test(RATIO).printNote!;
  expect(note).toBe('Verificação de relação (não substitui ensaio de exatidão).');
  const response = await issueAndReadParagraphs(page, relatorioId);
  expect(response.filter((paragraph) => paragraph === note)).toHaveLength(sheets.filter((sheet) => sheet.blockType === 'tc' || sheet.blockType === 'tp').length);
});

/** Issues revision 1 and returns the DOCX's body paragraphs (the tables are `issueAndReadTables`'s). */
async function issueAndReadParagraphs(page: import('@playwright/test').Page, relatorioId: string): Promise<string[]> {
  const { extractStructure } = await import('../apps/api/src/jobs/generate/docx-structure.test-support.ts');
  await issueAndReadTables(page, database, relatorioId);
  const { readStore } = await import('./support/outbox.ts');
  const revision = (await readStore<{ entity: string; row: { id: string; number: number } }>(page, database, 'entities')).find((record) => record.entity === 'revision' && record.row.number === 1)!;
  const docx = await page.request.get(`/api/revisions/${revision.row.id}/docx`);
  return extractStructure(Buffer.from(await docx.body())).paragraphs;
}
