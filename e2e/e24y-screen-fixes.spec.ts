import { conclusionSuggestionText, EMPTY_DEFINITION_CONTEXT, getDefinition, newEquipmentBlock, nameplateTitleOf, SEED_VERSION } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { deviceSnapshot, openStep, setUpRelatorio, stepper } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { expandLocation, section9Chevron } from './support/tree.ts';

/*
 * Fix batch e24y (the small screen fixes of the hands-on pass of 2026-11-11), each at the width where the
 * pass saw it:
 * - F10, 390 px: a v14 Malha de aterramento shows no "Verificações" step and names its first step by its
 *   block's title, "Dados da malha", in the stepper and in the header's sentence.
 * - F6, 1280 px: "Adicionar bloco" with the last type expanded shows its TAG, Local and "Confirmar".
 * - F17, 1280 and 768 px: "Chave de transferência automática" keeps a gap before its "+".
 * - F11, 390 px: the point editor's "P4 · Próxima manutenção" pill stays on one line.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

/** Opens "Adicionar bloco" on the Geradores local from the Sumário. */
async function openPalette(page: Page): Promise<Locator> {
  const chevron = section9Chevron(page);
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expandLocation(page, 'Geradores');
  await page.getByRole('button', { name: 'Adicionar equipamento no local Geradores', exact: true }).click();
  const palette = page.getByRole('dialog', { name: 'Adicionar bloco' });
  await expect(palette).toBeVisible();
  return palette;
}

/** The horizontal gap between a type row's name and its "+", in CSS pixels. */
async function gapBeforePlus(row: Locator): Promise<number> {
  return row.evaluate((element) => {
    const name = element.querySelector('.pi-text > span:first-child')!;
    const plus = element.querySelector('.plus')!;
    const range = document.createRange();
    range.selectNodeContents(name);
    const text = [...range.getClientRects()].reduce((right, rect) => Math.max(right, rect.right), 0);
    return plus.getBoundingClientRect().left - text;
  });
}

test('@p0 e24y-E2E-002 at 390 px a v14 Malha de aterramento steps "Dados da malha", "Ensaios", "Conclusão", and its header names no checklist', async ({ page }) => {
  test.setTimeout(180_000);
  const malha = getDefinition(SEED_VERSION, 'cabine_primaria', 'malha_aterramento');
  const title = nameplateTitleOf(malha)!;
  expect(title).toBe('Dados da malha');
  const { relatorioId } = await setUpRelatorio(page, account, database);
  const snapshot = await deviceSnapshot(page, database, relatorioId);
  const locationId = snapshot.blocks.find((block) => block.equipment_id !== null && block.removed_at === null)!.location_id!;
  const built = newEquipmentBlock({
    definitions: EMPTY_DEFINITION_CONTEXT,
    blockId: newId(),
    equipmentId: newId(),
    relatorioId,
    projectId: snapshot.relatorio.project_id,
    locationId,
    type: 'malha_aterramento',
    tag: 'MA-77',
    seedVersion: SEED_VERSION,
    orderKey: 'zz',
  });
  await pushDrafts(page, database, [
    officeDraft(account, { projectId: snapshot.relatorio.project_id }, `equipment/${built.equipment.id}`, built.equipment, 'create'),
    officeDraft(account, { relatorioId }, `block/${built.block.id}`, built.block, 'create'),
  ]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/relatorio/${relatorioId}/ficha/${built.block.id}`);
  const steps = stepper(page).getByRole('button');
  await expect(steps).toHaveCount(3, { timeout: 30_000 });
  const labels = await steps.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label') ?? ''));
  expect(labels.map((label) => label.split(',')[0])).toEqual([title, 'Ensaios', 'Conclusão']);
  // The step's short name fits its button at 390 px.
  const overflow = await steps.evaluateAll((nodes) => nodes.map((node) => node.scrollWidth - node.clientWidth));
  expect(overflow.every((px) => px <= 1)).toBe(true);
  await expect(steps.first().locator('.short')).toHaveText(title);
  const summary = page.getByTestId('ficha-progress');
  await expect(summary).toContainText('campos de dados da malha');
  await expect(summary).not.toContainText('erificaç');
});

test('@p0 e24y-E2E-003 "Chave de transferência automática" keeps its gap before the "+" at 1280 and 768 px', async ({ page }) => {
  test.setTimeout(180_000);
  const { relatorioId } = await setUpRelatorio(page, account, database);
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  const palette = await openPalette(page);

  // F17 at 1280 px: the office row.
  const cta = palette.locator('.pf-office').filter({ hasText: 'Chave de transferência automática' }).locator('.palette-item');
  await expect(cta).toBeVisible();
  expect(await gapBeforePlus(cta)).toBeGreaterThanOrEqual(8);

  // F17 at 768 px: the field row.
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 768, height: 1024 });
  const field = await openPalette(page);
  const row = field.locator('.palette-type').filter({ hasText: 'Chave de transferência automática' }).locator('.pf-field');
  await expect(row).toBeVisible();
  expect(await gapBeforePlus(row)).toBeGreaterThanOrEqual(8);
});

test('@p0 e24y-E2E-006 at 1280 px the last type of "Adicionar bloco", expanded, shows its TAG, Local and "Confirmar" in the list\'s view (F6)', async ({ page }) => {
  test.setTimeout(180_000);
  const { relatorioId } = await setUpRelatorio(page, account, database);
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  const palette = await openPalette(page);
  // The last type, the last type, expanded, scrolls its box into the list's view.
  const last = palette.locator('.pf-office').last();
  await last.locator('.palette-item').click();
  const confirm = last.getByRole('button', { name: 'Confirmar' });
  await expect(confirm).toBeVisible();
  await expect
    .poll(async () => {
      const list = await palette.locator('.palette-items').boundingBox();
      const button = await confirm.boundingBox();
      return list !== null && button !== null && button.y >= list.y - 1 && button.y + button.height <= list.y + list.height + 1;
    })
    .toBe(true);
  await expect(last.getByRole('textbox', { name: 'TAG' })).toBeInViewport();
});

test('@p0 e24y-E2E-004 at 390 px the point editor\'s "P4 · Próxima manutenção" pill stays on one line, as "P0 · Imediata" does', async ({ page }) => {
  test.setTimeout(180_000);
  const { relatorioId } = await setUpRelatorio(page, account, database);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/relatorio/${relatorioId}/pontos`);
  await page.getByRole('button', { name: 'Criar', exact: true }).click({ timeout: 30_000 });
  const editor = page.getByRole('article', { name: 'Novo ponto de atenção em edição' });
  const pill = (name: string) => editor.getByRole('radio', { name }).locator('.priority-pill');
  const p4 = pill('P4, Próxima manutenção, próxima intervenção');
  await expect(p4).toBeVisible();
  const [one, four] = await Promise.all([pill('P0, Imediata, hoje').boundingBox(), p4.boundingBox()]);
  expect(Math.round(four!.height)).toBe(Math.round(one!.height));
  // Its hint stays readable: on one line of its own row.
  const hint = editor.getByRole('radio', { name: 'P4, Próxima manutenção, próxima intervenção' }).locator('.pr-hint');
  await expect(hint).toHaveText('próxima intervenção');
  const hintBox = await hint.boundingBox();
  expect(hintBox!.width).toBeGreaterThan(40);
});

test('@p0 e24y-E2E-005 at 390 px the preview pill holding Bruno\'s "Marcar como Reprovado?" stays inside its row, with no sideways scroll', async ({ page }) => {
  test.setTimeout(180_000);
  const { relatorioId, sheets } = await setUpRelatorio(page, account, database, () => [], 'v13');
  const dj = sheets.find((sheet) => sheet.blockType === 'disjuntor_mt')!;
  // One insulation reading typed, so the sheet has a pair to suggest.
  const insulation = getDefinition('v13', 'cabine_primaria', 'disjuntor_mt').tests.find((one) => one.key === 'isolacao')!;
  const capture = insulation.tables[0]!.value_columns.findIndex((column) => column.role === 'capture');
  await pushDrafts(page, database, [officeDraft(account, { relatorioId }, `sheet/${dj.blockId}/test/isolacao/cell/0/${capture}`, { raw: '1', unit: 'GΩ', state: 'measured' })]);
  await page.setViewportSize({ width: 390, height: 844 });
  await openStep(page, relatorioId, dj.blockId, 'Conclusão');
  const value = page.locator('#ficha-conc .ficha-conc-sug-host .sv');
  await expect(value).toHaveText(/\?$/u, { timeout: 30_000 });
  // Fix batch e24y (orchestrator, after the dev's rerun): counting the text's line tops is no fit check (the row moves its
  // Confirmar under a long value, so the unchanged "Aprovado · Sem restrições?" read two lines in one run and one in another).
  // Checked instead: Bruno's pill (the kernel's `conclusionSuggestionText`) is never clipped, stays inside its row and pushes
  // nothing sideways. Only his own change is built; "Marcar como" on the other pills is left to Matheus.
  const text = conclusionSuggestionText({ result: 'reprovado', restriction: null });
  expect(text).toBe('Marcar como Reprovado?');
  const fit = await value.evaluate((element, replaced) => {
    element.textContent = replaced;
    const host = element.closest('.ficha-conc-sug-host') as HTMLElement;
    const own = element.getBoundingClientRect();
    const row = host.getBoundingClientRect();
    return {
      clipped: element.scrollWidth > element.clientWidth + 1,
      inside: own.left >= row.left - 1 && own.right <= row.right + 1,
      sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  }, text);
  expect(fit).toEqual({ clipped: false, inside: true, sideways: false });
});
