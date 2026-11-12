import { choiceValue, getDefinition, screenLabel, type BlockRow } from '@app/domain';
import type { Page } from '@playwright/test';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { deviceSnapshot, kernelOf, kernelTablesTitled, openStep, outbox, outboxValues, setUpRelatorio, tablesTitled, testSection, typeCell } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { paletteTypes, typeRows } from './support/palette.ts';
import { devicePhotos, expectCameraOpen } from './support/photos.ts';
import { confirmIssue, setParecer } from './support/relatorio-flow.ts';
import { expandLocation, section9Chevron } from './support/tree.ts';

/*
 * 24.12-E2E-001 (Story 24.12, seed v14; Bruno's question 22). The Inspeção de QGBT of a v14 relatório,
 * driven as a person would from the field palette to the DOCX at 1024 px: "Adicionar equipamento no
 * local Geradores" adds one; its sheet asks twelve items, REAPERTO GERAL and TESTE DE FUNCIONAMENTO last
 * with their hints under the label, and has an Ensaios step holding the thermography, not applicable
 * until "Equipamento em carga" reads Sim. REAPERTO GERAL is NC with a chip and the rest Conforme; the NC
 * row offers "Criar ponto de atenção" and nothing is listed until it is tapped (fix batch e24h). The
 * thermography is applied (Sim), a ΔT within its band typed, and a thermal photo taken. The floor is
 * Aprovado · Com restrições (the NC row), confirmed. The DOCX prints the twelve-row checklist with the NC
 * row and its phrase, the thermography table of this sheet and the thermal photo's line. Every expected
 * word is the kernel's over the device's own rows; the spec issues a revision through the api's one queue
 * and LibreOffice, so it runs in the serial group.
 */

test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['camera'],
});

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const TYPE = 'inspecao_qgbt';
const DEFINITION = getDefinition('v14', 'cabine_primaria', TYPE);
const LOCAL = 'Geradores';
const KEY = 'termografia';
/** ~~A library type numbers its measurement tests: the inspection's thermography prints as E1.~~ Fix batch e24y (P9): it prints "TERMOGRAFIA", as the eight types' do. */
const THERMO_TITLE = 'TERMOGRAFIA';

const checklistRow = (page: Page, key: string) => page.locator(`#ficha-step-verificacoes li.checklist-row[data-item-key="${key}"]`);

test('@p0 24.12-E2E-001 at 1024: a v14 Inspeção de QGBT asks twelve items (REAPERTO GERAL and TESTE DE FUNCIONAMENTO with their hints) and its thermography, applied in load with a thermal photo; REAPERTO GERAL NC offers its point; the DOCX prints the twelve rows, the thermography table and the photo line', async ({
  page,
}) => {
  test.setTimeout(480_000);
  // Pinned to v14 since seed v15 opened (Story 25.5): this walk asserts v14 sheets; v15 changes them story by story.
  const { relatorioId } = await setUpRelatorio(page, account, database, undefined, 'v14');
  await page.setViewportSize({ width: 1024, height: 900 });

  // --- the field palette of the local: the Inspeção de QGBT under "Outros equipamentos" ---
  const chevron = section9Chevron(page);
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expandLocation(page, LOCAL);
  await page.getByRole('button', { name: `Adicionar equipamento no local ${LOCAL}`, exact: true }).click();
  const fieldPalette = page.getByRole('dialog', { name: 'Adicionar bloco' });
  expect(paletteTypes('v14').library).toContain(TYPE);
  const row = typeRows(fieldPalette, [TYPE]);
  await expect(row.locator('.pi-text > span').first()).toHaveText(DEFINITION.label);
  await row.click();
  await expect(fieldPalette).toBeHidden();
  const creates = async () => (await outbox(database, page)).filter((op) => op.kind === 'create' && op.path.startsWith('block/') && (op.value as { block_type?: string }).block_type === TYPE);
  await expect.poll(async () => (await creates()).length).toBe(1);
  const created = (await creates())[0]!.value as BlockRow;
  expect(created).toMatchObject({ block_type: TYPE, seed_version: 'v14', relatorio_id: relatorioId });
  const blockId = created.id;

  // --- the sheet: twelve items, the two new ones last with their hints ---
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toContainText(DEFINITION.label, { timeout: 30_000 });
  const items = DEFINITION.checklist!;
  expect(items).toHaveLength(12);
  const listed = await page.locator('#ficha-step-verificacoes li.checklist-row').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-item-key')));
  expect(listed).toEqual(items.map((item) => item.key));
  expect(listed.slice(10)).toEqual(['reaperto_geral', 'teste_de_funcionamento']);
  for (const item of items.slice(10)) await expect(checklistRow(page, item.key).locator('.row-hint')).toHaveText(screenLabel(item.hint!));

  // REAPERTO GERAL NC with its first chip, the rest Conforme.
  const nc = items.findIndex((item) => item.key === 'reaperto_geral');
  const ncItem = items[nc]!;
  await checklistRow(page, ncItem.key).getByRole('radiogroup', { name: `${nc + 1}. ${screenLabel(ncItem.label)}` }).getByRole('radio', { name: 'Não conforme' }).click();
  const phrase = ncItem.nc_phrases[0]!;
  await checklistRow(page, ncItem.key).getByRole('group', { name: `Observações sugeridas do item ${nc + 1}` }).getByRole('button', { name: phrase }).click();
  await page.locator('#ficha-step-verificacoes .bulk-action-bar').getByRole('button', { name: 'Marcar os restantes como Conforme' }).click();
  await expect(page.getByTestId('toast')).toContainText('marcados Conforme');
  // The NC row offers its point; nothing is stored until it is tapped.
  await expect(checklistRow(page, ncItem.key).getByRole('button', { name: 'Criar ponto de atenção' })).toBeVisible();
  const points = async () => (await readStore<{ entity: string; row: { removed_at: string | null } }>(page, database, 'entities')).filter((record) => record.entity === 'point' && record.row.removed_at === null);
  expect(await points()).toHaveLength(0);
  // Fix batch e24x (G1): the Pontos screen is empty without the tap; the tap and "Concluir" store REAPERTO GERAL's point.
  await page.goto(`/relatorio/${relatorioId}/pontos`);
  await expect(page.locator('.poa-list')).toBeAttached({ timeout: 30_000 });
  await expect(page.locator('.poa-list > .point-of-attention-card')).toHaveCount(0);
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toContainText(DEFINITION.label, { timeout: 30_000 });
  await checklistRow(page, ncItem.key).getByRole('button', { name: 'Criar ponto de atenção' }).click();
  const editor = page.getByRole('dialog', { name: 'Criar ponto de atenção' });
  await expect(editor).toBeVisible();
  await editor.getByRole('button', { name: 'Concluir' }).click();
  await expect(editor).toHaveCount(0);
  await expect.poll(async () => (await points()).length).toBe(1);
  expect(((await points())[0]!.row as unknown as { origin: string; item_key: string | null }).origin).toBe('nc');
  expect(((await points())[0]!.row as unknown as { origin: string; item_key: string | null }).item_key).toBe(ncItem.key);
  await expect(checklistRow(page, ncItem.key).locator('.nc-point-ref')).toHaveText('Ponto de atenção 1');

  // --- the thermography: not applicable until in load, then a ΔT within, a thermal photo ---
  await openStep(page, relatorioId, blockId, 'Ensaios');
  const section = testSection(page, KEY);
  await expect(section).toHaveAttribute('data-applicability', 'na');
  const unknown = (await kernelOf(page, database, relatorioId, blockId)).measurement(KEY);
  expect(unknown.applicability.state).toBe('na');
  expect(unknown.rows.every((one) => one.cells.every((cell) => !cell.missing))).toBe(true);
  const loadPath = `sheet/${blockId}/test/${KEY}/value/em_carga`;
  await section.getByRole('radiogroup', { name: 'Equipamento em carga' }).getByRole('radio', { name: 'Sim' }).click();
  await expect.poll(async () => (await outboxValues(database, page, loadPath)).at(-1)).toEqual(choiceValue('sim'));
  await expect(section).not.toHaveAttribute('data-applicability', 'na');
  await typeCell(page, database, blockId, KEY, 0, 0, '2');
  const judged = await kernelOf(page, database, relatorioId, blockId);
  expect(judged.measurement(KEY).rows[0]!.cells[0]!.verdict).toBe('within');
  await section.getByRole('button', { name: 'Foto térmica' }).click();
  const view = await expectCameraOpen(page);
  await view.getByRole('button', { name: 'Disparar' }).click();
  await view.getByRole('button', { name: 'Concluir fotos', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Câmera' })).toHaveCount(0, { timeout: 15_000 });
  await expect.poll(async () => (await devicePhotos(page, database)).filter((photo) => photo.block_id === blockId).length, { timeout: 15_000 }).toBe(1);
  expect((await devicePhotos(page, database)).find((photo) => photo.block_id === blockId)!.caption).toContain('ensaios de termografia');

  // --- the conclusion: the NC row's floor, Aprovado · Com restrições ---
  expect(judged.floorReason).toMatch(/^A ficha exige no mínimo Aprovado · Com restrições/);
  await openStep(page, relatorioId, blockId, 'Conclusão');
  const suggestion = page.getByRole('group', { name: 'Prévia da conclusão' });
  await expect(suggestion).toContainText('Aprovado · Com restrições?');
  await suggestion.getByRole('button', { name: 'Confirmar' }).click();
  await expect.poll(async () => (await outboxValues(database, page, `sheet/${blockId}/conclusion/restriction`)).at(-1)).toBe('com_restricoes');

  // --- the DOCX: the twelve rows, the thermography table of this sheet, the photo's line ---
  const snapshot = await deviceSnapshot(page, database, relatorioId);
  expect(kernelTablesTitled(snapshot, THERMO_TITLE, blockId)).toBe(1);
  await setParecer(page, relatorioId, 'Apto com restrições');
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  const modal = page.getByRole('dialog', { name: 'Gerar relatório' });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await modal.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' }).click();
  await confirmIssue(modal);
  await expect(page.getByTestId('toast')).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: 150_000 });
  const revision = (await readStore<{ entity: string; row: { id: string; number: number } }>(page, database, 'entities')).find((record) => record.entity === 'revision' && record.row.number === 1)!;
  const structure = extractStructure(Buffer.from(await (await page.request.get(`/api/revisions/${revision.row.id}/docx`)).body()));
  const checklist = structure.tables.find((table) => table[0]?.[0] === 'VERIFICAÇÕES GERAIS' && table.some((cells) => cells[4] === phrase))!;
  expect(checklist).toHaveLength(2 + 12);
  expect(checklist[2 + nc]).toEqual([`${nc + 1}. ${ncItem.label}`, '', 'X', '', phrase]);
  expect(checklist.at(-1)![0]).toBe(`12. ${items[11]!.label}`);
  const thermography = tablesTitled(structure.tables, THERMO_TITLE);
  expect(thermography).toHaveLength(1);
  expect(thermography[0]!.some((cells) => cells[0] === 'CONEXÕES' && cells.includes('2'))).toBe(true);
  expect(structure.paragraphs.some((paragraph) => /^Imagem \d+: /.test(paragraph) && paragraph.includes('ensaios de termografia'))).toBe(true);
});
