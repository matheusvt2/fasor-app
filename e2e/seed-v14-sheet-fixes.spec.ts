import { choiceValue, getDefinition, nameplateTitleOf, SEED_VERSION, type BlockRow } from '@app/domain';
import type { Page } from '@playwright/test';
import { issueAndReadTables, kernelOf, openStep, outbox, outboxValues, plateField, setUpRelatorio, tablesTitled, testSection, typeCell } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { typeRows } from './support/palette.ts';
import { expandLocation, section9Chevron } from './support/tree.ts';

/*
 * 24.14-E2E (Story 24.14, seed v14; the behaviour pass's F10 and F18). Every word is the kernel's over the
 * device's own rows.
 *
 * 24.14-E2E-001: on a v14 oil transformer the oil sampling "Não coletado" with the reason "Outro" asks
 * "Descreva o motivo" (missing while empty); the text typed is stored as typed; changing the reason hides it
 * (kept, not counted) and "Outro" brings it back; a Disjuntor MT with Óleo asks the same. The issued DOCX
 * prints the reason line "MOTIVO: OUTRO, <texto>".
 * 24.14-E2E-002: a v14 Malha de aterramento added at a local titles its first block "Dados da malha" and offers
 * no "Fotografar placa"; its three fields are there, a resistance above VALOR DE PROJETO fails the sheet, and
 * the DOCX prints its tables. Both issue a revision through the api's one queue and LibreOffice, so the file
 * runs in the serial group.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const KEY = 'coleta_oleo';
const TEXT = 'Tampa do registro de coleta travada';

/** Answers "Não coletado" and a reason on the open sheet's oil sampling. */
async function notCollected(page: Page, blockId: string, reason: string): Promise<void> {
  const sampling = testSection(page, KEY);
  await sampling.locator('.v13-choice').getByRole('radio', { name: 'Não coletado' }).click();
  await expect.poll(async () => (await outboxValues(database, page, `sheet/${blockId}/test/${KEY}/cell/0/0`)).at(-1)).toEqual(choiceValue('nao_coletado'));
  await sampling.locator('.v13-reason[data-value-key="motivo"]').getByRole('button', { name: reason }).click();
}

const textField = (page: Page) => testSection(page, KEY).locator('.v13-reason[data-value-key="motivo_texto"]');

test('@p0 24.14-E2E-001 the oil sampling\'s "Outro" asks "Descreva o motivo", required while it shows, kept when hidden, on the transformer and the Disjuntor MT; the DOCX prints "MOTIVO: OUTRO, <texto>"', async ({ page }) => {
  test.setTimeout(420_000);
  expect(SEED_VERSION).toBe('v14');
  const { relatorioId, sheets } = await setUpRelatorio(page, account, database, (all) => [
    { blockType: 'transformador_forca', key: 'tipo_de_isolacao', value: 'ÓLEO ISOLANTE' },
    { blockType: 'disjuntor_mt', key: 'meio_de_extincao', value: 'Óleo' },
  ].filter((write) => all.some((sheet) => sheet.blockType === write.blockType)));
  const tf = sheets.find((sheet) => sheet.blockType === 'transformador_forca')!;
  const dj = sheets.find((sheet) => sheet.blockType === 'disjuntor_mt')!;
  const label = getDefinition(SEED_VERSION, 'cabine_primaria', 'transformador_forca').measurement_tests!.find((test) => test.key === KEY)!.values!.find((value) => value.key === 'motivo_texto')!.label;
  expect(label).toBe('Descreva o motivo');

  // --- the transformer: "Outro" asks for the text, missing while empty ---
  await openStep(page, relatorioId, tf.blockId, 'Ensaios');
  await notCollected(page, tf.blockId, 'Outro');
  await expect(textField(page)).toBeVisible();
  await expect(textField(page)).toHaveAttribute('data-missing-field', '');
  expect((await kernelOf(page, database, relatorioId, tf.blockId)).measurement(KEY).values.find((value) => value.key === 'motivo_texto')).toMatchObject({ shown: true, missing: true });
  const area = textField(page).getByRole('textbox', { name: label });
  await area.fill(TEXT);
  await area.blur();
  await expect.poll(async () => (await outboxValues(database, page, `sheet/${tf.blockId}/test/${KEY}/value/motivo_texto`)).at(-1)).toBe(TEXT);
  await expect(textField(page)).not.toHaveAttribute('data-missing-field', '');

  // Another reason: the text leaves (kept, not counted); "Outro" brings it back as typed.
  await testSection(page, KEY).locator('.v13-reason[data-value-key="motivo"]').getByRole('button', { name: 'Sem ponto de coleta' }).click();
  await expect(textField(page)).toHaveCount(0);
  const hidden = (await kernelOf(page, database, relatorioId, tf.blockId)).measurement(KEY).values.find((value) => value.key === 'motivo_texto')!;
  expect(hidden).toMatchObject({ shown: false, missing: false });
  await testSection(page, KEY).locator('.v13-reason[data-value-key="motivo"]').getByRole('button', { name: 'Outro' }).click();
  await expect(textField(page).getByRole('textbox', { name: label })).toHaveValue(TEXT);

  // --- the Disjuntor MT with Óleo asks the same ---
  await openStep(page, relatorioId, dj.blockId, 'Ensaios');
  await notCollected(page, dj.blockId, 'Outro');
  await expect(textField(page)).toHaveAttribute('data-missing-field', '');
  await testSection(page, KEY).locator('.v13-reason[data-value-key="motivo"]').getByRole('button', { name: 'Equipamento energizado' }).click();
  await expect(textField(page)).toHaveCount(0);

  // --- the DOCX: the transformer's reason line with its text, the disjuntor's reason alone ---
  const tables = tablesTitled(await issueAndReadTables(page, database, relatorioId), 'COLETA DE ÓLEO');
  const lines = tables.flatMap((table) => table.flat()).filter((text) => text.startsWith('MOTIVO:'));
  expect(lines).toContain(`MOTIVO: OUTRO, ${TEXT}`);
  expect(lines).toContain('MOTIVO: EQUIPAMENTO ENERGIZADO');
});

test('@p0 24.14-E2E-002 a v14 Malha de aterramento titles its first block "Dados da malha" and offers no "Fotografar placa"; its fields and chips stay, a resistance above VALOR DE PROJETO fails it, and the DOCX prints its tables', async ({ page }) => {
  test.setTimeout(420_000);
  const malha = getDefinition(SEED_VERSION, 'cabine_primaria', 'malha_aterramento');
  expect(nameplateTitleOf(malha)).toBe('Dados da malha');
  const { relatorioId } = await setUpRelatorio(page, account, database);
  await page.setViewportSize({ width: 1024, height: 900 });
  const chevron = section9Chevron(page);
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expandLocation(page, 'Geradores');
  await page.getByRole('button', { name: 'Adicionar equipamento no local Geradores', exact: true }).click();
  const palette = page.getByRole('dialog', { name: 'Adicionar bloco' });
  await typeRows(palette, ['malha_aterramento']).click();
  await expect(palette).toBeHidden();
  const creates = async () => (await outbox(database, page)).filter((op) => op.kind === 'create' && op.path.startsWith('block/') && (op.value as { block_type?: string }).block_type === 'malha_aterramento');
  await expect.poll(async () => (await creates()).length).toBe(1);
  const blockId = ((await creates())[0]!.value as BlockRow).id;

  // --- the sheet: "Dados da malha", no plate photo, the three fields ---
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toContainText(malha.label, { timeout: 30_000 });
  await expect(page.locator('#ficha-nameplate .section-head h2')).toHaveText('Dados da malha');
  await expect(page.getByRole('button', { name: 'Fotografar placa' })).toHaveCount(0);
  await expect(page.locator('#ficha-nameplate .camera-group')).toHaveCount(0);
  const keys = await page.locator('#ficha-nameplate [data-field-key]').evaluateAll((nodes) => [...new Set(nodes.map((node) => node.getAttribute('data-field-key')))]);
  expect(keys).toEqual(malha.nameplate.map((field) => field.key));
  const design = plateField(page, 'valor_projeto_ohm').locator('input');
  await design.fill('2');
  await design.press('Tab');
  await plateField(page, 'metodo_medicao').locator('select').selectOption('ALICATE TERRÔMETRO');
  await plateField(page, 'condicao_solo').locator('select').selectOption('SECO');
  await expect.poll(async () => (await outboxValues(database, page, `sheet/${blockId}/nameplate/condicao_solo`)).at(-1)).toBe('SECO');

  // --- 3 Ω above a design value of 2 Ω: out, the sheet fails ---
  await openStep(page, relatorioId, blockId, 'Ensaios');
  await typeCell(page, database, blockId, 'resistencia_malha', 0, 0, '3');
  const judged = await kernelOf(page, database, relatorioId, blockId);
  expect(judged.measurement('resistencia_malha').rows[0]!.cells[0]!.verdict).toBe('out');
  expect(judged.floorReason).toMatch(/^A ficha exige no mínimo Reprovado/);

  // --- the DOCX: its plate and its resistance table, as v13 prints them ---
  const tables = await issueAndReadTables(page, database, relatorioId);
  const plate = tables.find((table) => table[0]?.[0] === 'DADOS DO EQUIPAMENTO' && JSON.stringify(table).includes('ALICATE TERRÔMETRO'))!;
  expect(JSON.stringify(plate)).toContain('VALOR DE PROJETO');
  expect(JSON.stringify(plate)).not.toContain('Dados da malha');
  expect(tables.some((table) => JSON.stringify(table).includes('RESISTÊNCIA DE ATERRAMENTO DA MALHA') && table.some((row) => row.includes('3')))).toBe(true);
});
