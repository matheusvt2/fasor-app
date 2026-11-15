import { choiceValue, composeConclusion, derivedParecer, getDefinition, notPerformedClause, notPerformedPrintLine, parecerVerdictLabel, sheetProgress, visitContextOf, type MeasurementTestEvaluation } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { deviceSnapshot, kernelOf, openStep, outbox, outboxValues, setUpRelatorio, testSection, typeCell } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { confirmIssue, setParecer } from './support/relatorio-flow.ts';

/*
 * Story 25.15 (seed v16, `performed`; M23, Bruno's answer 4, decision 3; `60-ficha.html` #/ficha/DJ-02, SEC-02, TR-03),
 * on a new relatório (seed v16) at 1280 px, every expected word the kernel's over the device's own rows.
 * - 25.15-E2E-001: the transformer's thermography asks "Realizada" or "Não realizada" and the Ensaios step counts that
 *   answer missing; "Realizada" shows Buchas MT, Buchas e conexões BT and Tanque ou bobinas with "Adicionar ponto" under
 *   them; "Não realizada" hides them and asks the reason, "Equipamento fora de carga" chosen. The breaker answers "Não
 *   realizada" with "Outro", whose empty text counts missing until it is typed; then "Realizada" shows its six terminal
 *   rows, a ΔT of 4 °C between similares on one is restricted by the v13 bands, and a point added in the field at
 *   20 °C is out. The issued DOCX prints the transformer's one line in the test's place, no table, and the clause in its
 *   paragraph; and the breaker's table with the six rows and the added point. "Equipamento em carga" shows nowhere.
 * It issues a revision through the api's one queue and LibreOffice: the `queue` lane (`e2e/support/groups.ts`).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const VERSION = 'v16';
const KEY = 'termografia';
const TF = getDefinition(VERSION, 'cabine_primaria', 'transformador_forca').measurement_tests!.find((one) => one.key === KEY)!;
const DJ = getDefinition(VERSION, 'cabine_primaria', 'disjuntor_mt').measurement_tests!.find((one) => one.key === KEY)!;
const ADDED = 'Conexão do barramento';

const valuePath = (blockId: string, value: string) => `sheet/${blockId}/test/${KEY}/value/${value}`;
const answerGroup = (page: Page): Locator => testSection(page, KEY).getByRole('radiogroup', { name: 'Termografia' });
const reasonGroup = (page: Page): Locator => testSection(page, KEY).getByRole('group', { name: 'Motivo da termografia não realizada' });
const shownPoints = (page: Page) => testSection(page, KEY).locator('table.measurement-table tbody tr:not([data-added-row]) td:first-child').filter({ visible: true }).allInnerTexts();

/** Taps an answer of the thermography and waits for its value put. */
async function answer(page: Page, blockId: string, label: 'Realizada' | 'Não realizada', key: string): Promise<void> {
  await answerGroup(page).getByRole('radio', { name: label, exact: true }).click();
  await expect.poll(async () => (await outboxValues(database, page, valuePath(blockId, 'realizacao'))).at(-1)).toEqual(choiceValue(key));
}

/** Taps a reason chip and waits for its value put. */
async function reason(page: Page, blockId: string, label: string, key: string): Promise<void> {
  await reasonGroup(page).getByRole('button', { name: label, exact: true }).click();
  await expect.poll(async () => (await outboxValues(database, page, valuePath(blockId, 'motivo'))).at(-1)).toEqual(choiceValue(key));
}

/** The Ensaios step's missing count, the kernel's over the device's rows. */
async function ensaiosMissing(page: Page, relatorioId: string, blockId: string): Promise<number> {
  return sheetProgress(await deviceSnapshot(page, database, relatorioId), blockId).steps.ensaios.missing;
}

const thermography = async (page: Page, relatorioId: string, blockId: string): Promise<MeasurementTestEvaluation> => (await kernelOf(page, database, relatorioId, blockId)).measurement(KEY);

test('@p0 25.15-E2E-001 the v16 thermography on a transformer and a breaker: "Realizada" with the type\'s points and an added point, "Não realizada" with its reason; the DOCX prints the line and the table', async ({ page }) => {
  test.setTimeout(420_000);
  const { relatorioId, sheets } = await setUpRelatorio(page, account, database, () => [], VERSION);
  const tf = sheets.find((sheet) => sheet.blockType === 'transformador_forca')!;
  const dj = sheets.find((sheet) => sheet.blockType === 'disjuntor_mt')!;

  // --- the transformer: one required answer, then its points, then "Não realizada" with its reason ---
  await openStep(page, relatorioId, tf.blockId, 'Ensaios');
  await expect(answerGroup(page)).toBeVisible();
  await expect(answerGroup(page)).toHaveAttribute('aria-required', 'true');
  await expect(testSection(page, KEY).getByText('Equipamento em carga')).toHaveCount(0);
  await expect(testSection(page, KEY).locator('.v13-applied-band, .v13-na-band')).toHaveCount(0);
  expect((await thermography(page, relatorioId, tf.blockId)).performance).toEqual({ state: 'unanswered', valueKey: 'realizacao' });
  // Unanswered, no point is drawn and the answer counts one missing.
  expect(await shownPoints(page)).toEqual([]);
  const unanswered = await ensaiosMissing(page, relatorioId, tf.blockId);
  await answer(page, tf.blockId, 'Realizada', 'realizada');
  expect(await ensaiosMissing(page, relatorioId, tf.blockId)).toBe(unanswered - 1);
  await expect.poll(() => shownPoints(page)).toEqual(TF.rows.map((row) => row.label));
  expect(TF.rows.map((row) => row.label)).toEqual(['Buchas MT', 'Buchas e conexões BT', 'Tanque ou bobinas']);
  await expect(testSection(page, KEY).getByRole('button', { name: 'Adicionar ponto', exact: true })).toBeVisible();
  await expect(reasonGroup(page)).toHaveCount(0);

  await answer(page, tf.blockId, 'Não realizada', 'nao_realizada');
  await expect.poll(() => shownPoints(page)).toEqual([]);
  await expect(testSection(page, KEY).getByRole('button', { name: 'Adicionar ponto', exact: true })).toHaveCount(0);
  await expect(reasonGroup(page)).toBeVisible();
  await expect(testSection(page, KEY).getByText('O motivo sai no relatório, numa linha no lugar da tabela. Não é restrição.')).toBeVisible();
  expect(await ensaiosMissing(page, relatorioId, tf.blockId)).toBe(unanswered);
  await reason(page, tf.blockId, 'Equipamento fora de carga', 'fora_de_carga');
  expect(await ensaiosMissing(page, relatorioId, tf.blockId)).toBe(unanswered - 1);
  const notDone = (await thermography(page, relatorioId, tf.blockId)).performance!;
  expect(notDone.state).toBe('not_done');
  if (notDone.state !== 'not_done') throw new Error('unreachable');
  expect(notPerformedPrintLine(notDone)).toBe('TERMOGRAFIA: NÃO REALIZADA. MOTIVO: EQUIPAMENTO FORA DE CARGA.');
  expect(notPerformedClause(notDone)).toBe('Termografia não realizada (equipamento fora de carga).');
  // Not a restriction: the floor names nothing of it; the paragraph names it with its reason, after its body.
  const kernel = await kernelOf(page, database, relatorioId, tf.blockId);
  expect(kernel.floorReason ?? '').not.toMatch(/termografia/i);
  const tag = kernel.snapshot.equipment.find((row) => row.id === kernel.block.equipment_id)!.tag;
  expect(composeConclusion(kernel.block, getDefinition(VERSION, 'cabine_primaria', 'transformador_forca'), tag, visitContextOf(kernel.snapshot, kernel.block)).text).toContain('. Termografia não realizada (equipamento fora de carga).');

  // --- the breaker: "Não realizada" with "Outro", its text required; then "Realizada" with its six terminals ---
  await openStep(page, relatorioId, dj.blockId, 'Ensaios');
  const base = await ensaiosMissing(page, relatorioId, dj.blockId);
  await answer(page, dj.blockId, 'Não realizada', 'nao_realizada');
  await reason(page, dj.blockId, 'Outro', 'outro');
  const text = testSection(page, KEY).getByRole('textbox', { name: 'Descreva o motivo' });
  await expect(text).toBeVisible();
  // The answer given, the reason given, the text still empty: one missing in place of the answer.
  expect(await ensaiosMissing(page, relatorioId, dj.blockId)).toBe(base);
  await text.fill('Termovisor em calibração');
  await text.blur();
  await expect.poll(async () => (await outboxValues(database, page, valuePath(dj.blockId, 'motivo_texto'))).at(-1)).toBe('Termovisor em calibração');
  expect(await ensaiosMissing(page, relatorioId, dj.blockId)).toBe(base - 1);
  const typed = (await thermography(page, relatorioId, dj.blockId)).performance!;
  if (typed.state !== 'not_done') throw new Error('the breaker is not "Não realizada"');
  expect(notPerformedPrintLine(typed)).toBe('TERMOGRAFIA: NÃO REALIZADA. MOTIVO: OUTRO, Termovisor em calibração.');

  await answer(page, dj.blockId, 'Realizada', 'realizada');
  await expect(reasonGroup(page)).toHaveCount(0);
  await expect.poll(() => shownPoints(page)).toEqual(DJ.rows.map((row) => row.label));
  expect(DJ.rows.map((row) => row.label)).toEqual(['Terminal de entrada, fase A', 'Terminal de entrada, fase B', 'Terminal de entrada, fase C', 'Terminal de saída, fase A', 'Terminal de saída, fase B', 'Terminal de saída, fase C']);
  // A ΔT of 4 °C between similares on "Terminal de entrada, fase B": restricted by the v13 bands.
  await typeCell(page, database, dj.blockId, KEY, 1, 0, '4');
  expect((await thermography(page, relatorioId, dj.blockId)).rows[1]!.cells[0]!.verdict).toBe('restricted');
  // A point added in the field, named and out of its band (20 °C between similares).
  const isName = (op: { path: string }) => op.path.startsWith(`sheet/${dj.blockId}/test/${KEY}/row/`) && op.path.endsWith('/name');
  await testSection(page, KEY).getByRole('button', { name: 'Adicionar ponto', exact: true }).click();
  await expect.poll(async () => (await outbox(database, page)).filter(isName).length).toBe(1);
  const rowId = (await outbox(database, page)).find(isName)!.path.split('/').at(-2)!;
  const name = page.locator(`input[data-added-name="${rowId}"]`).filter({ visible: true });
  await name.fill(ADDED);
  await name.press('Enter');
  await expect.poll(async () => (await outboxValues(database, page, `sheet/${dj.blockId}/test/${KEY}/row/${rowId}/name`)).at(-1)).toBe(ADDED);
  const cell = testSection(page, KEY).locator(`.ficha-cell[data-cell="${KEY}:+${rowId}:0"]`).filter({ visible: true }).locator('input.mf-value');
  await cell.click();
  await cell.fill('20');
  await cell.press('Enter');
  await expect.poll(async () => (await outboxValues(database, page, `sheet/${dj.blockId}/test/${KEY}/row/${rowId}/cell/0`)).at(-1)).toEqual({ raw: '20', unit: '°C', state: 'measured' });
  const judged = await thermography(page, relatorioId, dj.blockId);
  expect(judged.rows.find((row) => row.added?.id === rowId)!.cells[0]!.verdict).toBe('out');

  // --- the DOCX: the transformer's line and clause, the breaker's table with its six rows and the added point ---
  const verdict = derivedParecer(await deviceSnapshot(page, database, relatorioId));
  await setParecer(page, relatorioId, (verdict === null ? 'Apto' : parecerVerdictLabel(verdict)) as Parameters<typeof setParecer>[2]);
  const modal = page.getByRole('dialog', { name: 'Gerar relatório' });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await modal.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' }).click();
  await confirmIssue(modal);
  await expect(page.getByTestId('toast')).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: 150_000 });
  const revision = (await readStore<{ entity: string; row: { id: string; number: number } }>(page, database, 'entities')).find((record) => record.entity === 'revision' && record.row.number === 1)!;
  const structure = extractStructure(Buffer.from(await (await page.request.get(`/api/revisions/${revision.row.id}/docx`)).body()));
  const clean = (value: string) => value.replaceAll('\u00a0', ' ');
  expect(structure.paragraphs.filter((paragraph) => clean(paragraph) === 'TERMOGRAFIA: NÃO REALIZADA. MOTIVO: EQUIPAMENTO FORA DE CARGA.')).toHaveLength(1);
  const tables = structure.tables.filter((table) => clean(table[0]?.[0] ?? '') === 'TERMOGRAFIA');
  // Only the breaker prints a thermography table; every other sheet of the standard relatório is unanswered.
  expect(tables, JSON.stringify(structure.tables.map((table) => table[0]?.[0]))).toHaveLength(1);
  const firsts = tables[0]!.map((cells) => clean(cells[0] ?? ''));
  expect(firsts.slice(-7)).toEqual([...DJ.rows.map((row) => row.label.toLocaleUpperCase('pt-BR')), ADDED.toLocaleUpperCase('pt-BR')]);
  expect(tables[0]!.find((cells) => clean(cells[0] ?? '') === ADDED.toLocaleUpperCase('pt-BR'))!.at(-1)).toBe('INSATISFATÓRIO');
  expect(JSON.stringify(structure)).not.toContain('EQUIPAMENTO EM CARGA');
});
