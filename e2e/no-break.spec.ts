import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { composeConclusion, getDefinition, paletteTypeGroups, EMPTY_DEFINITION_CONTEXT, screenLabel, type BlockRow } from '@app/domain';
import type { Page } from '@playwright/test';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { deviceSnapshot, openStep, outbox, outboxValues, setUpRelatorio } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { paletteTypes, typeRows } from './support/palette.ts';
import { devicePhotos } from './support/photos.ts';
import { confirmIssue, setParecer } from './support/relatorio-flow.ts';
import { expandLocation, section9Chevron } from './support/tree.ts';

/*
 * 24.13-E2E-001 (Story 24.13, seed v14; Bruno's question 34). The No-break de comando of a v14 relatório,
 * driven as a person would from the field palette to the DOCX at 1024 px: "Adicionar equipamento no local
 * Geradores" offers it under "Outros equipamentos" (a v13 palette does not) and suggests the TAG NB-01; its
 * sheet asks the eighteen plate fields in order, the six items (BATERIAS and CARGAS ALIMENTADAS IDENTIFICADAS
 * with their hints) and no Ensaios step. "Fotografar placa" imports the type's synthetic plate through the
 * system picker (no camera on this device), the real reading job reads it with the `fake` providers from the
 * type's default fixture, and "Confirmar todos" writes the grounded fields. Item 4 is NC with a chip and the
 * rest Conforme: the floor is Aprovado · Com restrições, the conclusion names item 4 and nothing measured. The
 * DOCX prints the sheet under "Outros equipamentos" with its plate, its six rows and its conclusion. Every list
 * and word is the kernel's; the spec issues a revision through the api's one queue and LibreOffice, so it runs
 * in the serial group.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

test.beforeEach(async ({ page }) => {
  // No camera: "Fotografar placa" opens the system picker.
  await page.addInitScript(() => {
    const none = () => Promise.reject(new DOMException('Requested device not found', 'NotFoundError'));
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: none, configurable: true });
  });
});

const TYPE = 'no_break_comando';
const DEFINITION = getDefinition('v14', 'cabine_primaria', TYPE);
const LOCAL = 'Geradores';
const PLATE = resolve(import.meta.dirname, '..', 'apps/api/src/jobs/reading/fixtures/images/plate-no-break-comando.png');

const checklistRow = (page: Page, key: string) => page.locator(`#ficha-step-verificacoes li.checklist-row[data-item-key="${key}"]`);
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });

test('@p0 24.13-E2E-001 at 1024: a v14 local offers the No-break de comando (NB-01) under "Outros equipamentos"; its plate read from a photo and confirmed, six items with hints, no Ensaios, item 4 NC floors Aprovado · Com restrições; the DOCX prints it under "Outros equipamentos"', async ({
  page,
}) => {
  test.setTimeout(480_000);
  // Pinned to v14 since seed v15 opened (Story 25.5): this walk asserts v14 sheets; v15 changes them story by story.
  expect(paletteTypes('v14').library).toContain(TYPE);
  expect(paletteTypes('v13').library).not.toContain(TYPE);
  expect(paletteTypeGroups('v14', EMPTY_DEFINITION_CONTEXT).find((group) => group.key === 'library')!.types).toContain(TYPE);
  const { relatorioId } = await setUpRelatorio(page, account, database, undefined, 'v14');
  await page.setViewportSize({ width: 1024, height: 900 });

  // --- the field palette of the local: the No-break under "Outros equipamentos", NB-01 ---
  const chevron = section9Chevron(page);
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expandLocation(page, LOCAL);
  await page.getByRole('button', { name: `Adicionar equipamento no local ${LOCAL}`, exact: true }).click();
  const fieldPalette = page.getByRole('dialog', { name: 'Adicionar bloco' });
  const row = typeRows(fieldPalette, [TYPE]);
  await expect(row.locator('.pi-text > span').first()).toHaveText(DEFINITION.label);
  const tag = (await row.locator('.pi-meta').innerText()).trim().split(' · ').at(-1)!;
  expect(tag).toBe('NB-01');
  await row.click();
  await expect(fieldPalette).toBeHidden();
  const creates = async () => (await outbox(database, page)).filter((op) => op.kind === 'create' && op.path.startsWith('block/') && (op.value as { block_type?: string }).block_type === TYPE);
  await expect.poll(async () => (await creates()).length).toBe(1);
  const blockId = ((await creates())[0]!.value as BlockRow).id;

  // --- the sheet: eighteen plate fields in order, six items with their hints, no Ensaios ---
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toContainText(DEFINITION.label, { timeout: 30_000 });
  const keys = await page.locator('#ficha-nameplate [data-field-key]').evaluateAll((nodes) => [...new Set(nodes.map((node) => node.getAttribute('data-field-key')))]);
  expect(keys).toEqual(DEFINITION.nameplate.map((field) => field.key));
  expect(keys).toHaveLength(18);
  await expect(stepper(page).getByRole('button', { name: /^Ensaios,/ })).toHaveCount(0);
  const items = DEFINITION.checklist!;
  const listed = await page.locator('#ficha-step-verificacoes li.checklist-row').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-item-key')));
  expect(listed).toEqual(items.map((item) => item.key));
  for (const item of items.filter((one) => one.hint !== undefined)) await expect(checklistRow(page, item.key).locator('.row-hint')).toHaveText(screenLabel(item.hint!));

  // --- the plate read from a photo, its grounded fields confirmed ---
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#ficha-nameplate .camera-group').getByRole('button', { name: 'Fotografar placa' }).click();
  await (await chooser).setFiles({ name: 'placa.png', mimeType: 'image/png', buffer: readFileSync(PLATE) });
  await expect.poll(async () => (await devicePhotos(page, database)).filter((photo) => photo.block_id === blockId).length, { timeout: 15_000 }).toBe(1);
  await expect(page.locator('#ficha-nameplate [data-field-key="modelo"] .field.suggestion-field')).toBeVisible({ timeout: 60_000 });
  await page.locator('#ficha-nameplate .suggestion-group-head').getByRole('button', { name: /^Confirmar todos/ }).click();
  await expect.poll(async () => (await outboxValues(database, page, `sheet/${blockId}/nameplate/modelo`)).at(-1), { timeout: 15_000 }).toBe('NBC-3000');
  // A manufacturer the registry does not know waits for its own "Criar", never in "Confirmar todos".
  expect((await outboxValues(database, page, `sheet/${blockId}/nameplate/n_serie`)).at(-1)).toBe('NB-220415');

  // --- item 4 NC with a chip, the rest Conforme ---
  const nc = items.findIndex((item) => item.key === 'baterias');
  expect(nc).toBe(3);
  const ncItem = items[nc]!;
  await checklistRow(page, ncItem.key).getByRole('radiogroup', { name: `${nc + 1}. ${screenLabel(ncItem.label)}` }).getByRole('radio', { name: 'Não conforme' }).click();
  const phrase = ncItem.nc_phrases[0]!;
  await checklistRow(page, ncItem.key).getByRole('group', { name: `Observações sugeridas do item ${nc + 1}` }).getByRole('button', { name: phrase }).click();
  await page.locator('#ficha-step-verificacoes .bulk-action-bar').getByRole('button', { name: 'Marcar os restantes como Conforme' }).click();
  await expect(page.getByTestId('toast')).toContainText('marcados Conforme');
  await expect(checklistRow(page, ncItem.key).getByRole('button', { name: 'Criar ponto de atenção' })).toBeVisible();

  // --- the conclusion: Aprovado · Com restrições, item 4 named, nothing measured ---
  await openStep(page, relatorioId, blockId, 'Conclusão');
  const suggestion = page.getByRole('group', { name: 'Prévia da conclusão' });
  await expect(suggestion).toContainText('Aprovado · Com restrições?');
  await suggestion.getByRole('button', { name: 'Confirmar' }).click();
  await expect.poll(async () => (await outboxValues(database, page, `sheet/${blockId}/conclusion/restriction`)).at(-1)).toBe('com_restricoes');
  const snapshot = await deviceSnapshot(page, database, relatorioId);
  const block = snapshot.blocks.find((one) => one.id === blockId)!;
  const text = composeConclusion(block, DEFINITION, tag).text;
  expect(text).toContain(`${phrase} (item ${nc + 1}, NC)`);
  expect(text).not.toContain('valores medidos');
  await expect(page.locator('.ficha-conc-text')).toContainText(`(item ${nc + 1}, NC)`);
  await page.locator('.ficha-conc-text').getByRole('button', { name: 'Confirmar' }).click();
  await expect.poll(async () => (await outboxValues(database, page, `sheet/${blockId}/conclusion/text_status`)).at(-1)).toBe('confirmed');

  // --- the DOCX: under "Outros equipamentos", its plate, six rows and conclusion ---
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
  const title = `${DEFINITION.print_title} ${tag}`;
  const at = structure.paragraphs.indexOf(title);
  expect(at, JSON.stringify(structure.headings)).toBeGreaterThan(-1);
  const outros = structure.headings.filter((heading) => heading.level === 2 && heading.text.includes('Outros equipamentos') && heading.text.includes(LOCAL));
  expect(outros).toHaveLength(1);
  const checklist = structure.tables.find((table) => table[0]?.[0] === 'VERIFICAÇÕES GERAIS' && table.some((cells) => cells[4] === phrase))!;
  expect(checklist).toHaveLength(2 + 6);
  expect(checklist[2 + nc]).toEqual([`${nc + 1}. ${ncItem.label}`, '', 'X', '', phrase]);
  const plate = structure.tables.find((table) => table[0]?.[0] === 'DADOS DO EQUIPAMENTO' && JSON.stringify(table).includes('NBC-3000'))!;
  expect(JSON.stringify(plate)).toContain('BATERIAS: CAPACIDADE');
  expect(JSON.stringify(structure.tables)).toContain(`${phrase} (item ${nc + 1}, NC)`);
});
