import { derivedParecer, getDefinition, parecerVerdictLabel, SEED_VERSION, seedRule, type BlockRow } from '@app/domain';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { deviceSnapshot, kernelOf, openStep, outbox, outboxValues, plateField, setUpRelatorio, testSection, typeCell } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { typeRows } from './support/palette.ts';
import { confirmIssue, setParecer } from './support/relatorio-flow.ts';
import { expandLocation, section9Chevron } from './support/tree.ts';

/*
 * 30.3-E2E-001 (batch e30b, Epic 30, Story 30.3; seed v19 opens equal to v18 and changes three texts). A new relatório
 * of the standard template is born on the current seed (v19), every sheet with it. At 1280 px for the TP's sheet and 1024 px from the palette on, as a person would:
 *   (a) the TP's ratio test reads its criterion "± 0,5 %" (v1 to v18: "±0,5 %");
 *   (c) a Malha de aterramento added at the local Geradores, with VALOR DE PROJETO empty and 3 Ω typed, shows the helper
 *       "Sem VALOR DE PROJETO em Dados da malha, vale ≤ 5 Ω." (v13 to v18: "na placa");
 *   (b) its conclusion, confirmed, says nothing about checked items (v13 to v18 end ", sem itens verificados
 *       registrados"), and the put is in the outbox.
 * Revision 1 is then issued through the api's one queue and LibreOffice, and its DOCX prints "± 0,5 %", never the glued
 * form, and the Malha's sentence without the clause. Every expected word is the kernel's over the device's own rows.
 * The older seeds' forms are pinned by `e30b-seed-v19.test.ts` and the v18 layout lock. It runs in the queue lane.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const TYPE = 'malha_aterramento';
const DEFINITION = getDefinition(SEED_VERSION, 'cabine_primaria', TYPE);
const LOCAL = 'Geradores';
const GRID = 'resistencia_malha';
const RATIO = 'relacao_transformacao';
const HELPER = 'Sem VALOR DE PROJETO em Dados da malha, vale ≤ 5 Ω.';
const CLAUSE = 'sem itens verificados registrados';

test('@p0 30.3-E2E-001 a new relatório is born on v19: the ratio\'s criterion reads "± 0,5 %", the Malha\'s helper names "Dados da malha", its conclusion has no clause about checked items, and the DOCX prints them', async ({ page }) => {
  test.setTimeout(480_000);
  expect(SEED_VERSION).toBe('v19');
  for (const flag of ['criterion_symbols', 'conclusion_no_checklist_clause', 'helper_names_plate_block'] as const) {
    expect(seedRule('v19', flag), flag).toBe(true);
    expect(seedRule('v18', flag), flag).toBe(false);
  }
  const { relatorioId, sheets } = await setUpRelatorio(page, account, database);
  const snapshotAtStart = await deviceSnapshot(page, database, relatorioId);
  expect(snapshotAtStart.relatorio.seed_version).toBe('v19');
  expect(new Set(snapshotAtStart.blocks.filter((block) => block.equipment_id !== null).map((block) => block.seed_version))).toEqual(new Set(['v19']));

  // --- (a) the TP's ratio criterion, on the sheet ---
  const tp = sheets.find((sheet) => sheet.blockType === 'tp')!;
  await openStep(page, relatorioId, tp.blockId, 'Ensaios');
  const ratio = (await kernelOf(page, database, relatorioId, tp.blockId)).test(RATIO);
  expect(ratio.criterionText).toBe('± 0,5 %');
  await expect(testSection(page, RATIO).locator('.mt-criterion')).toContainText('± 0,5 %');
  await expect(testSection(page, RATIO).locator('.mt-criterion')).not.toContainText('±0,5 %');

  // --- a Malha de aterramento at the local Geradores ---
  // At 1024 px, where the local's field palette draws its rows (as `ground-grid.spec.ts` drives it).
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  const chevron = section9Chevron(page);
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expandLocation(page, LOCAL);
  await page.getByRole('button', { name: `Adicionar equipamento no local ${LOCAL}`, exact: true }).click();
  const palette = page.getByRole('dialog', { name: 'Adicionar bloco' });
  const row = typeRows(palette, [TYPE]);
  const tag = (await row.locator('.pi-meta').innerText()).trim().split(' · ').at(-1)!;
  expect(tag).toMatch(/^MA-/);
  await row.click();
  await expect(palette).toBeHidden();
  const created = async () => (await outbox(database, page)).filter((op) => op.kind === 'create' && op.path.startsWith('block/') && (op.value as { block_type?: string }).block_type === TYPE);
  await expect.poll(async () => (await created()).length).toBe(1);
  const create = (await created())[0]!;
  expect(create.value).toMatchObject({ block_type: TYPE, seed_version: 'v19', relatorio_id: relatorioId });
  const blockId = (create.value as BlockRow).id;

  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toContainText(DEFINITION.label, { timeout: 30_000 });
  await plateField(page, 'metodo_medicao').locator('select').selectOption('QUEDA DE POTENCIAL (62 %)');
  await plateField(page, 'condicao_solo').locator('select').selectOption('ÚMIDO');
  await expect.poll(async () => (await outboxValues(database, page, `sheet/${blockId}/nameplate/condicao_solo`)).at(-1)).toBe('ÚMIDO');

  // --- (c) no design value: the default's helper names the block the field is in ---
  await openStep(page, relatorioId, blockId, 'Ensaios');
  await typeCell(page, database, blockId, GRID, 0, 0, '3');
  const byDefault = (await kernelOf(page, database, relatorioId, blockId)).measurement(GRID);
  expect(DEFINITION.nameplate_title).toBe('Dados da malha');
  expect(byDefault.notes).toEqual([HELPER]);
  expect(byDefault.rows[0]!.cells[0]!.verdict).toBe('within');
  await expect(testSection(page, GRID).locator('[data-measurement-note]')).toHaveText(HELPER);

  // --- (b) the conclusion: no clause about checked items; confirmed, its put is in the outbox ---
  await openStep(page, relatorioId, blockId, 'Conclusão');
  await expect(page.locator('.ficha-conc-text')).toContainText(`${tag} apresentou valores medidos dentro dos critérios de aceitação.`);
  await expect(page.locator('.ficha-conc-text')).not.toContainText('itens verificados');
  await page.getByRole('group', { name: 'Prévia da conclusão' }).getByRole('button', { name: 'Confirmar' }).click();
  await expect.poll(async () => (await outboxValues(database, page, `sheet/${blockId}/conclusion/result`)).at(-1)).toBe('aprovado');
  // The composed text confirmed too: it is the text the document prints, and its put is in the outbox without the clause.
  await page.locator('.suggestion-field.is-generated').getByRole('button', { name: 'Confirmar' }).click();
  await expect.poll(async () => (await outboxValues(database, page, `sheet/${blockId}/conclusion/text_status`)).at(-1)).toBe('confirmed');
  const stored = String((await outboxValues(database, page, `sheet/${blockId}/conclusion/text`)).at(-1));
  expect(stored).toContain(`${tag} apresentou valores medidos dentro dos critérios de aceitação.`);
  expect(stored).not.toContain('itens verificados');

  // --- issued: the DOCX prints the three texts ---
  const snapshot = await deviceSnapshot(page, database, relatorioId);
  const verdict = derivedParecer(snapshot);
  if (verdict === null) await setParecer(page, relatorioId);
  else await setParecer(page, relatorioId, parecerVerdictLabel(verdict) as Parameters<typeof setParecer>[2]);
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  const modal = page.getByRole('dialog', { name: 'Gerar relatório' });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await modal.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' }).click();
  await confirmIssue(modal);
  await expect(page.getByTestId('toast')).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: 150_000 });
  const revision = (await readStore<{ entity: string; row: { id: string; number: number } }>(page, database, 'entities')).find((record) => record.entity === 'revision' && record.row.number === 1)!;
  const response = await page.request.get(`/api/revisions/${revision.row.id}/docx`);
  expect(response.status()).toBe(200);
  const structure = extractStructure(Buffer.from(await response.body()));
  const text = JSON.stringify(structure);
  expect(text).toContain('± 0,5 %');
  expect(text).not.toContain('±0,5 %');
  expect(text).not.toContain('>400 MΩ');
  expect(text).not.toContain('<250 µΩ');
  // The sheet's conclusion is a cell of its CONCLUSÃO table; a paragraph is searched too, wherever the layout puts it.
  const texts = [...structure.paragraphs, ...structure.tables.flatMap((table) => table.flat())];
  // The printed TAG may carry no-break characters, so the sentence is found by its subject's noun.
  const sentence = texts.find((one) => /^A malha de aterramento .* apresentou /u.test(one));
  expect(sentence, 'the Malha\'s conclusion in the DOCX').toBeDefined();
  expect(sentence).toContain('apresentou valores medidos dentro dos critérios de aceitação.');
  expect(sentence).not.toContain(CLAUSE);
  expect(text).not.toContain(CLAUSE);
});
