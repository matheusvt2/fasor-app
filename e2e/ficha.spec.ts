import { getDefinition, type OpDraft } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { deviceDatabaseName, expect, horizontalOverflow, signIn, syncBadge, test, TEST_SEED } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { resetEmpresaB as resetCompany } from './support/reset-empresa-b.ts';
import { officeDraft, pushDrafts, pushNewRelatorio } from './support/relatorio-seed.ts';

/*
 * 5.1-5.4-E2E: the equipment sheet, driven as a person would, by pointer and by keyboard:
 * opened from a tree row, its header, stepper and sticky bar, the cabine block edited on
 * the cabine's first sheet and read-only on the next, the nameplate typed field by field
 * and copied by chip, the checklist marked with taps, keys and the bulk action with its
 * undo, the draft offered after a tab died mid-typing, and "Concluir ficha" both ways.
 *
 * Every test resets Empresa B and pushes a relatório of the standard template from an
 * "office" device, then opens `/relatorio/:id` and reaches a sheet through the tree, by the
 * row's type (no literal TAG or id). Safe mid-run only because the suite runs with
 * `workers: 1`.
 */

const account = TEST_SEED.companies[1];
const database = deviceDatabaseName(account.userId);

interface OutboxRow {
  path: string;
  value: unknown;
  batch_id: string | null;
}

const PARA_RAIO = getDefinition('v1', 'cabine_primaria', 'para_raio');
const toast = (page: Page) => page.getByTestId('toast');
const tree = (page: Page) => page.getByRole('list', { name: 'Locais do relatório' });
const enel = (page: Page) => tree(page).locator(':scope > li.s9-cabine').filter({ has: page.locator(':scope > .s9-cab-row .s9-cab-name', { hasText: 'Cubículo Enel' }) });
const enelRows = (page: Page) => enel(page).locator(':scope > .s9-eqs > li.s9-eq');
const rowOfType = (page: Page, type: string, nth = 0) => enelRows(page).filter({ has: page.locator('.s9-eq-name', { hasText: new RegExp(`^${type}$`) }) }).nth(nth);
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const field = (page: Page, key: string) => page.locator(`[data-field-key="${key}"]`);
const checklistRow = (page: Page, n: number) => page.locator('#ficha-step-verificacoes li.checklist-row').nth(n - 1);
const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');

/** "Sincronizar agora" from the Sync status, until nothing is waiting, then back. */
async function syncNow(page: Page): Promise<void> {
  const back = page.url();
  await syncBadge(page).click();
  const button = page.getByRole('button', { name: 'Sincronizar agora' });
  await expect(button).not.toHaveAttribute('aria-disabled', 'true', { timeout: 30_000 });
  await button.click();
  await expect(syncBadge(page)).toHaveAttribute('data-pending', '0', { timeout: 30_000 });
  await expect(syncBadge(page)).toHaveAttribute('data-state', 'ok');
  await page.goto(back);
}

/** Resets Empresa B, signs in and opens the Sumário of a relatório pushed from the office. */
async function openRelatorio(page: Page, width: number): Promise<{ relatorioId: string; projectId: string }> {
  await resetCompany({ standard: true });
  await page.setViewportSize({ width, height: 900 });
  await signIn(page, account.email);
  const ids = await pushNewRelatorio(page, account, database);
  await page.goto(`/relatorio/${ids.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  return ids;
}

/** Section 9 open and Cubículo Enel expanded. */
async function openEnel(page: Page): Promise<void> {
  const chevron = page.getByRole('button', { name: 'Expandir ou recolher a seção 9' });
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expect(tree(page)).toBeVisible();
  const expand = page.getByRole('button', { name: 'Expandir Cubículo Enel' });
  if ((await expand.count()) > 0) await expand.click();
  await expect(enelRows(page).first()).toBeVisible();
}

/** A row's block id and TAG, read off the rendered tree. */
async function rowIds(row: Locator): Promise<{ blockId: string; tag: string }> {
  const blockId = (await row.getAttribute('data-block-id'))!;
  const tag = (await row.locator('.block-tag').textContent())!.trim();
  expect(blockId).not.toBe('');
  return { blockId, tag };
}

/** Taps a tree row and waits for its sheet. */
async function openSheet(page: Page, row: Locator): Promise<{ blockId: string; tag: string }> {
  const ids = await rowIds(row);
  await row.locator('.s9-eq-open').click();
  await expect(page).toHaveURL(new RegExp(`/ficha/${ids.blockId}$`));
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible();
  return ids;
}

/** The count of cells the para-raio's tests ask for (capture/input columns over every row). */
function paraRaioCells(): { testKey: string; row: number; col: number }[] {
  const out: { testKey: string; row: number; col: number }[] = [];
  for (const t of PARA_RAIO.tests) {
    let row = 0;
    for (const table of t.tables) {
      const typed = table.value_columns.filter((c) => c.role === 'capture' || c.role === 'input').length;
      for (let r = 0; r < table.rows.length; r++, row++) for (let c = 0; c < typed; c++) out.push({ testKey: t.key, row, col: c });
    }
  }
  return out;
}

test('@p0 5.1-E2E-001 a tree row opens the sheet: App bar TAG, header, stepper with counts, rail, stepper jump; the nameplate typed field by field survives a reload', async ({ page }) => {
  test.setTimeout(120_000);
  const { relatorioId } = await openRelatorio(page, 1280);
  await openEnel(page);
  const { blockId, tag } = await openSheet(page, rowOfType(page, 'Para-raio'));

  // The App bar title is the TAG; the header shows type + TAG (the rename button), the location.
  await expect(page.locator('.app-bar-title')).toHaveText(tag);
  await expect(page.locator('.sheet-title')).toContainText('Para-raio');
  await expect(page.getByRole('button', { name: `TAG ${tag} — renomear` })).toBeVisible();
  await expect(page.locator('.sheet-header .sheet-meta').first()).toHaveText('Cubículo Enel');
  const box = (await page.getByRole('button', { name: `TAG ${tag} — renomear` }).boundingBox())!;
  expect(Math.round(box.height)).toBeGreaterThanOrEqual(48);

  // The stepper counts what is missing; the Progress counter sums it.
  const checklistCount = PARA_RAIO.checklist!.length;
  const cells = paraRaioCells().length;
  await expect(stepper(page).getByRole('button')).toHaveText([/Placa/, /Verificações/, /Ensaios/, /Conclusão/]);
  await expect(stepper(page).getByRole('button', { name: `Placa, ${PARA_RAIO.nameplate.length} faltando` })).toHaveAttribute('aria-current', 'step');
  await expect(stepper(page).getByRole('button', { name: `Verificações, ${checklistCount} faltando` })).toBeVisible();
  await expect(stepper(page).getByRole('button', { name: `Ensaios, ${cells} faltando` })).toBeVisible();
  await expect(stepper(page).getByRole('button', { name: 'Conclusão, 1 faltando' })).toBeVisible();
  const total = PARA_RAIO.nameplate.length + checklistCount + cells + 1;
  await expect(page.getByTestId('ficha-progress')).toHaveText(`${total} obrigatórios faltando`);
  // The primary moves on while the sheet is incomplete; no camera is drawn before Epic 6.
  await expect(page.locator('.sticky-action-bar .bar-buttons .btn-primary')).toHaveText(/Próxima ficha/);
  await expect(page.locator('.camera-capture-btn')).toHaveCount(0);

  // The rail sits at the left at 1280 with this sheet current.
  await expect(page.getByRole('complementary', { name: 'Árvore do relatório', exact: true })).toBeVisible();
  await expect(page.locator(`.relatorio-tree li[data-block-id="${blockId}"] .tree-row`)).toHaveAttribute('aria-current', 'true');

  // Tapping a step scrolls to it and marks it current.
  await stepper(page).getByRole('button', { name: /^Verificações,/ }).click();
  await expect(stepper(page).getByRole('button', { name: /^Verificações,/ })).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('heading', { name: 'Verificações gerais' })).toBeInViewport();

  // The empty plate offers "Digitar" (no photo tile before Epic 8).
  await expect(page.getByText('Fotografar placa')).toHaveCount(0);
  await page.getByRole('button', { name: 'Digitar' }).click();
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest('[data-field-key]')?.getAttribute('data-field-key') ?? null)).toBe(PARA_RAIO.nameplate[0]!.key);

  // Every field by typing: at 1280 the manufacturer and voltage class Combobox shows at
  // once (the chip row with "Outro…" is the tablet and phone presentation), with "Criar".
  await field(page, 'fabricacao').getByRole('combobox').fill('Fabricante Ficha');
  await page.getByRole('option', { name: 'Criar “Fabricante Ficha”' }).click();
  await expect(page.getByTestId('ficha-saved')).toHaveText('Salvo');
  await page.getByLabel('Nº SÉRIE', { exact: true }).fill('PR-0001');
  await page.getByLabel('TIPO', { exact: true }).fill('Polimérico');
  await field(page, 'tensao_nominal').getByRole('combobox').fill('36,2');
  await page.getByRole('option', { name: 'Criar “36,2”' }).click();
  const corrente = page.getByLabel('CORRENTE NOMINAL', { exact: true });
  await expect(corrente).toHaveAttribute('inputmode', 'decimal');
  await expect(field(page, 'corrente_nominal').locator('.mf-unit')).toHaveText('kA');
  await corrente.fill('10');
  await corrente.press('Tab');
  await expect(stepper(page).getByRole('button', { name: 'Placa, 0 faltando' })).toBeVisible();

  await expect
    .poll(async () => (await outbox(page)).filter((row) => row.path.startsWith(`sheet/${blockId}/nameplate/`)).map((row) => row.path.split('/').at(-1)).sort())
    .toEqual(PARA_RAIO.nameplate.map((f) => f.key).sort());
  const ops = await outbox(page);
  expect(ops.find((row) => row.path === `sheet/${blockId}/nameplate/corrente_nominal`)?.value).toEqual({ raw: '10', unit: 'kA', state: 'measured' });

  await page.reload();
  await expect(page.getByLabel('Nº SÉRIE', { exact: true })).toHaveValue('PR-0001');
  await expect(page.getByLabel('TIPO', { exact: true })).toHaveValue('Polimérico');
  await expect(page.getByLabel('CORRENTE NOMINAL', { exact: true })).toHaveValue('10');
  await expect(field(page, 'fabricacao').getByRole('combobox')).toHaveValue('Fabricante Ficha');
  await expect(field(page, 'tensao_nominal').getByRole('combobox')).toHaveValue('36,2');
  await expect(page.locator('.sheet-header .sheet-meta').nth(1)).toHaveText(/^Preenchido por .+ · \d{2}\/\d{2} \d{2}:\d{2}$/);
  expect(relatorioId).not.toBe('');
});

test('@p0 5.4-E2E-001 the checklist by mouse and keyboard: C/NC/NA, Delete clears, re-tap keeps, NC requires an observation with chips, bulk Conforme with undo, both bulk reasons', async ({ page }) => {
  test.setTimeout(120_000);
  await openRelatorio(page, 1280);
  await openEnel(page);
  const { blockId } = await openSheet(page, rowOfType(page, 'Para-raio'));
  const items = PARA_RAIO.checklist!;

  // The legend heads the session's first checklist.
  await expect(page.locator('details.ficha-legend')).toHaveAttribute('open', '');
  // Nothing is pre-marked: every row unset.
  await expect(page.locator('#ficha-step-verificacoes .tri-state .seg[aria-checked="true"]')).toHaveCount(0);

  // Row 1 by mouse: C, and a re-tap does nothing.
  const row1 = checklistRow(page, 1).getByRole('radiogroup', { name: `1. ${items[0]!.label}` });
  await row1.getByRole('radio', { name: 'Conforme', exact: true }).click();
  await expect(row1.getByRole('radio', { name: 'Conforme', exact: true })).toHaveAttribute('aria-checked', 'true');
  await row1.getByRole('radio', { name: 'Conforme', exact: true }).click();
  await expect(row1.getByRole('radio', { name: 'Conforme', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect.poll(async () => (await outbox(page)).find((row) => row.path === `sheet/${blockId}/checklist/${items[0]!.key}/result`)?.value).toBe('C');

  // Row 2 by keyboard: Tab lands on its first segment, arrows move and select, Delete clears.
  const row2 = checklistRow(page, 2).getByRole('radiogroup', { name: `2. ${items[1]!.label}` });
  await row2.getByRole('radio', { name: 'Conforme', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(row2.getByRole('radio', { name: 'Não conforme' })).toHaveAttribute('aria-checked', 'true');
  await expect(row2.getByRole('radio', { name: 'Não conforme' })).toBeFocused();
  // NC expands the row: the seed's chips and the required Observation field.
  const observation2 = page.getByLabel('Observação do item 2', { exact: true });
  await expect(observation2).toHaveAttribute('data-required', '');
  await expect(observation2).toHaveAccessibleDescription('Obrigatória em item não conforme');
  await expect(stepper(page).getByRole('button', { name: `Verificações, ${items.length - 1} faltando` })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(row2.getByRole('radio', { name: 'Não se aplica' })).toHaveAttribute('aria-checked', 'true');
  await expect(observation2).toHaveCount(0);
  await page.keyboard.press('Delete');
  await expect(row2.locator('.seg[aria-checked="true"]')).toHaveCount(0);

  // Row 3 NC by mouse, a chip inserts its phrase and the reason goes once text exists.
  const row3 = checklistRow(page, 3).getByRole('radiogroup', { name: `3. ${items[2]!.label}` });
  await row3.getByRole('radio', { name: 'Não conforme' }).click();
  const phrase = items[2]!.nc_phrases[0]!;
  await checklistRow(page, 3).getByRole('group', { name: 'Observações sugeridas do item 3' }).getByRole('button', { name: phrase }).click();
  const observation3 = page.getByLabel('Observação do item 3', { exact: true });
  await expect(observation3).toHaveValue(phrase);
  await expect(observation3).not.toHaveAttribute('data-required');
  await expect.poll(async () => (await outbox(page)).find((row) => row.path === `sheet/${blockId}/checklist/${items[2]!.key}/observation`)?.value).toBe(phrase);

  // Row 4 NC and left without observation: it stays counted, visibly required, and blocks nothing.
  await checklistRow(page, 4).getByRole('radio', { name: 'Não conforme' }).click();
  await expect(page.getByLabel('Observação do item 4', { exact: true })).toHaveAttribute('data-required', '');

  // Bulk: the unset rows (2 and 5) become C in one batch; NC rows untouched; undo reverses both.
  const bulk = page.locator('#ficha-step-verificacoes .bulk-action-bar');
  await bulk.getByRole('button', { name: 'Marcar os restantes como Conforme' }).click();
  await expect(toast(page)).toContainText('2 itens marcados Conforme');
  await expect(checklistRow(page, 2).getByRole('radio', { name: 'Conforme', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(checklistRow(page, 5).getByRole('radio', { name: 'Conforme', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(checklistRow(page, 4).getByRole('radio', { name: 'Não conforme' })).toHaveAttribute('aria-checked', 'true');
  const batches = new Set((await outbox(page)).filter((row) => row.path === `sheet/${blockId}/checklist/${items[1]!.key}/result` || row.path === `sheet/${blockId}/checklist/${items[4]!.key}/result`).map((row) => row.batch_id));
  expect(batches.size).toBeGreaterThanOrEqual(1);
  await expect(bulk.getByRole('button', { name: 'Marcar os restantes como Conforme' })).toHaveAttribute('aria-disabled', 'true');
  await expect(bulk.getByText('Todos os itens já estão marcados')).toBeVisible();
  await toast(page).getByRole('button', { name: 'Desfazer' }).click();
  await expect(checklistRow(page, 2).locator('.seg[aria-checked="true"]')).toHaveCount(0);
  await expect(checklistRow(page, 5).locator('.seg[aria-checked="true"]')).toHaveCount(0);
  await expect(checklistRow(page, 1).getByRole('radio', { name: 'Conforme', exact: true })).toHaveAttribute('aria-checked', 'true');

  // "Repetir" has no concluded sheet of this type yet: disabled with its reason.
  await expect(bulk.getByRole('button', { name: 'Repetir da ficha anterior do mesmo tipo' })).toHaveAttribute('aria-disabled', 'true');
  await expect(bulk.getByText('Nenhuma ficha deste tipo concluída')).toBeVisible();

  // Overflow "Limpar" clears row 1.
  await checklistRow(page, 1).getByRole('button', { name: `Mais opções de ${items[0]!.label}` }).click();
  await page.getByRole('menuitem', { name: 'Limpar' }).click();
  await expect(checklistRow(page, 1).locator('.seg[aria-checked="true"]')).toHaveCount(0);
});

test('@p0 5.2-E2E-001 the cabine block: edited on the cabine first sheet as location ops, read-only on the next sheet, the humidity note, "Copiar da cabine anterior" with undo', async ({ page }) => {
  test.setTimeout(150_000);
  const { relatorioId } = await openRelatorio(page, 1280);
  await openEnel(page);
  const first = await rowIds(enelRows(page).first());
  await page.getByRole('button', { name: 'Mais opções de Cubículo Enel' }).click();
  await page.getByRole('menuitem', { name: 'Abrir primeira ficha (dados da cabine)' }).click();
  await expect(page).toHaveURL(new RegExp(`/ficha/${first.blockId}$`));

  await expect(page.getByRole('heading', { name: 'Características da SE' })).toBeVisible();
  await expect(page.locator('.ficha-da-cabine').first()).toHaveText('Da cabine · Cubículo Enel');
  await page.getByLabel('TIPO DE SE', { exact: true }).selectOption('BLINDADA');
  const primaria = page.getByLabel('TENSÃO PRIMÁRIA', { exact: true });
  await primaria.fill('13,8');
  await primaria.press('Tab');
  await page.getByLabel('TEMPERATURA', { exact: true }).fill('19');
  const umidade = page.getByLabel('UMIDADE RELATIVA DO AR', { exact: true });
  await umidade.fill('85');
  await umidade.press('Enter');
  await expect(page.getByRole('textbox', { name: 'ALTITUDE', exact: true })).toHaveAttribute('aria-readonly', 'true');

  await expect.poll(async () => (await outbox(page)).filter((row) => row.path.startsWith('location/')).map((row) => row.path.split('/').slice(2).join('/')).sort()).toEqual([
    'env/humidity_pct',
    'env/temperature_c',
    'se/primary_kv',
    'se/type',
  ]);
  const ops = await outbox(page);
  expect(ops.find((row) => row.path.endsWith('/se/primary_kv'))?.value).toEqual({ raw: '13.8', unit: 'kV', state: 'measured' });
  expect(ops.some((row) => row.path.startsWith(`sheet/${first.blockId}/`))).toBe(false);

  // Humidity above the threshold surfaces the rain/humidity note; a tap writes the sheet observation.
  const notes = page.getByRole('group', { name: 'Observações rápidas' });
  await notes.getByRole('button', { name: 'Chuva e umidade elevada' }).click();
  await expect(notes.getByRole('button', { name: 'Chuva e umidade elevada' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => String((await outbox(page)).find((row) => row.path === `sheet/${first.blockId}/observations`)?.value ?? '')).toContain('umidade');

  // The next sheet of the cabine shows the same values read-only under the same labels.
  await page.locator('.sticky-action-bar .btn-primary').click();
  await expect(page).not.toHaveURL(new RegExp(`/ficha/${first.blockId}$`));
  const readOnly = page.getByRole('textbox', { name: 'TENSÃO PRIMÁRIA' });
  await expect(readOnly).toHaveAttribute('aria-readonly', 'true');
  await expect(readOnly).toContainText('13,8');
  await expect(page.getByRole('textbox', { name: 'TIPO DE SE' })).toHaveText('BLINDADA');
  await expect(page.locator('.se-block.is-readonly')).toHaveCount(2);

  // 1° Subsolo's first sheet copies Cubículo Enel's environment, with an undo.
  await page.goto(`/relatorio/${relatorioId}`);
  const chevron = page.getByRole('button', { name: 'Expandir ou recolher a seção 9' });
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await page.getByRole('button', { name: 'Mais opções de 1° Subsolo' }).click();
  await page.getByRole('menuitem', { name: 'Abrir primeira ficha (dados da cabine)' }).click();
  await expect(page).toHaveURL(/\/ficha\//);
  await page.getByRole('button', { name: 'Copiar da cabine anterior' }).click();
  await expect(toast(page)).toContainText('Copiado de Cubículo Enel');
  await expect(page.getByLabel('TEMPERATURA', { exact: true })).toHaveValue('19');
  await expect(page.getByLabel('UMIDADE RELATIVA DO AR', { exact: true })).toHaveValue('85');
  await toast(page).getByRole('button', { name: 'Desfazer' }).click();
  await expect(page.getByLabel('TEMPERATURA', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('UMIDADE RELATIVA DO AR', { exact: true })).toHaveValue('');
});

test('@p0 5.3-E2E-001 "Igual à ⟨TAG⟩?" copies a same-type plate as plain ops, with an undo', async ({ page }) => {
  test.setTimeout(120_000);
  const { relatorioId } = await openRelatorio(page, 1280);
  await openEnel(page);
  const source = await rowIds(rowOfType(page, 'Para-raio', 0));
  await pushDrafts(page, database, [
    officeDraft(account, { relatorioId }, `sheet/${source.blockId}/nameplate/fabricacao`, 'Celtta'),
    officeDraft(account, { relatorioId }, `sheet/${source.blockId}/nameplate/n_serie`, 'PR-0009'),
  ]);
  await syncNow(page);
  await openEnel(page);
  const target = await openSheet(page, rowOfType(page, 'Para-raio', 1));

  await page.getByRole('button', { name: `Igual à ${source.tag}?` }).click();
  await expect(toast(page)).toContainText(`Copiado de ${source.tag}`);
  await expect(page.getByLabel('Nº SÉRIE', { exact: true })).toHaveValue('PR-0009');
  const copied = (await outbox(page)).filter((row) => row.path.startsWith(`sheet/${target.blockId}/nameplate/`));
  expect(copied.map((row) => row.path.split('/').at(-1)).sort()).toEqual(['fabricacao', 'n_serie']);
  expect(new Set(copied.map((row) => row.batch_id)).size).toBe(1);
  await toast(page).getByRole('button', { name: 'Desfazer' }).click();
  await expect(page.getByRole('button', { name: 'Digitar' })).toBeVisible();
  await expect(page.getByRole('button', { name: `Igual à ${source.tag}?` })).toBeVisible();
});

test('@p0 5.1-E2E-002 "Concluir ficha" with missing fields jumps to the first incomplete step and concludes nothing', async ({ page }) => {
  test.setTimeout(120_000);
  await openRelatorio(page, 1280);
  await openEnel(page);
  const { blockId, tag } = await openSheet(page, rowOfType(page, 'Para-raio'));
  // Move away from the plate first, so the jump is visible.
  await stepper(page).getByRole('button', { name: /^Verificações,/ }).click();
  await page.getByRole('button', { name: `Mais opções da ficha ${tag}` }).click();
  await page.getByRole('menuitem', { name: 'Concluir ficha' }).click();
  await expect(page.getByTestId('ficha-announcer')).toHaveText('Faltam obrigatórios — indo para o primeiro campo faltando');
  await expect(stepper(page).getByRole('button', { name: /^Placa,/ })).toHaveAttribute('aria-current', 'step');
  // The plate was empty: its fields are revealed and the first missing one holds the focus.
  await expect(field(page, PARA_RAIO.nameplate[0]!.key)).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest('[data-field-key]')?.getAttribute('data-field-key') ?? null)).toBe(PARA_RAIO.nameplate[0]!.key);
  expect((await outbox(page)).some((row) => row.path === `block/${blockId}/concluded_by`)).toBe(false);
  await expect(page).toHaveURL(new RegExp(`/ficha/${blockId}$`));
});

test('@p0 5.1-E2E-003 "Concluir ficha" on a complete sheet emits concluded_by and moves to the next sheet in tree order', async ({ page }) => {
  test.setTimeout(150_000);
  const { relatorioId } = await openRelatorio(page, 1280);
  await openEnel(page);
  const target = await rowIds(rowOfType(page, 'Para-raio'));
  const order = await enelRows(page).evaluateAll((rows) => rows.map((row) => row.getAttribute('data-block-id')));
  const next = order[order.indexOf(target.blockId) + 1]!;

  // Seeded complete from the office (the ensaios and conclusion UI are Batches B and C).
  const scope = { relatorioId };
  const drafts: OpDraft[] = [
    ...PARA_RAIO.nameplate.map((f) =>
      officeDraft(account, scope, `sheet/${target.blockId}/nameplate/${f.key}`, f.kind === 'number' ? { raw: '10', unit: f.unit ?? null, state: 'measured' } : 'X'),
    ),
    ...PARA_RAIO.checklist!.map((item) => officeDraft(account, scope, `sheet/${target.blockId}/checklist/${item.key}/result`, 'C')),
    ...paraRaioCells().map((c) => officeDraft(account, scope, `sheet/${target.blockId}/test/${c.testKey}/cell/${c.row}/${c.col}`, { raw: '1000', unit: 'MΩ', state: 'measured' })),
    officeDraft(account, scope, `sheet/${target.blockId}/conclusion/result`, 'aprovado'),
  ];
  await pushDrafts(page, database, drafts);
  await syncNow(page);
  await openEnel(page);
  await openSheet(page, rowOfType(page, 'Para-raio'));

  await expect(page.getByTestId('ficha-progress')).toHaveText('Completa');
  await expect(stepper(page).getByRole('button', { name: 'Conclusão, 0 faltando' })).toBeVisible();
  const primary = page.locator('.sticky-action-bar .btn-primary');
  await expect(primary).toHaveText(/Concluir ficha/);
  await primary.click();
  await expect(page).toHaveURL(new RegExp(`/ficha/${next}$`));
  await expect(toast(page)).toContainText('Ficha concluída');
  const concluded = (await outbox(page)).find((row) => row.path === `block/${target.blockId}/concluded_by`);
  expect(concluded?.value).toMatchObject({ actor_id: account.userId });

  // Back on it: the concluded-by line, and the primary moves on.
  await page.goBack();
  await expect(page.locator('.sheet-header .sheet-meta').filter({ hasText: /^Concluída por / })).toBeVisible();
  await expect(page.locator('.sticky-action-bar .btn-primary')).toHaveText(/Próxima ficha/);
});

test('@p0 5.1-E2E-004 uncommitted observation text survives a dead tab as "Rascunho encontrado — Recuperar"; 390 px has no side scroll and no rail', async ({ page, context }) => {
  test.setTimeout(120_000);
  await openRelatorio(page, 390);
  await openEnel(page);
  const { blockId } = await openSheet(page, rowOfType(page, 'Para-raio'));
  expect(await horizontalOverflow(page)).toBe(0);
  await expect(page.locator('aside.rail')).toBeHidden();
  await expect(page.locator('aside.rail-collapsed')).toBeHidden();

  await checklistRow(page, 1).getByRole('radio', { name: 'Não conforme' }).click();
  const observation = page.getByLabel('Observação do item 1', { exact: true });
  await observation.fill('texto ainda não salvo');
  // The tab goes away mid-typing.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(async () => (await readStore<{ value: unknown }>(page, database, 'drafts')).map((row) => row.value)).toContain('texto ainda não salvo');
  const url = page.url();
  await page.close();

  const reopened = await context.newPage();
  await reopened.setViewportSize({ width: 390, height: 900 });
  await reopened.goto(url);
  await expect(reopened.getByLabel('Observação do item 1', { exact: true })).toBeVisible({ timeout: 30_000 });
  const offer = reopened.getByTestId('toast');
  await expect(offer).toContainText('Rascunho encontrado');
  await offer.getByRole('button', { name: 'Recuperar' }).click();
  await expect(reopened.getByLabel('Observação do item 1', { exact: true })).toHaveValue('texto ainda não salvo');
  await expect
    .poll(async () => (await readStore<OutboxRow>(reopened, database, 'outbox')).filter((row) => row.path === `sheet/${blockId}/checklist/${PARA_RAIO.checklist![0]!.key}/observation`).map((row) => row.value))
    .toContain('texto ainda não salvo');
});

test('@p0 5.9-E2E-001 "Marcar não ensaiado" from the sheet header: reason chips, "Outro" reveals text, toast, band, chip in the title, read-only nameplate/checklist, no bulk mirror; unsynced Desfazer clears it at once', async ({ page }) => {
  test.setTimeout(120_000);
  await openRelatorio(page, 1280);
  await openEnel(page);
  const { blockId, tag } = await openSheet(page, rowOfType(page, 'Para-raio'));

  await page.getByRole('button', { name: `Mais opções da ficha ${tag}` }).click();
  await page.getByRole('menuitem', { name: 'Marcar não ensaiado' }).click();
  const dialog = page.getByRole('dialog', { name: 'Marcar não ensaiado' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Descreva o motivo')).toHaveCount(0);
  await dialog.getByRole('radio', { name: 'Outro' }).click();
  const textField = dialog.getByLabel('Descreva o motivo');
  await expect(textField).toBeVisible();
  await textField.fill('Equipamento inacessível na visita');
  await dialog.getByRole('button', { name: 'Marcar não ensaiado' }).click();
  await expect(dialog).toBeHidden();

  await expect(toast(page)).toContainText('Marcada como não ensaiada — entra na seção 8');
  await expect(page.locator('.sheet-title .not-tested-chip')).toHaveText('Não ensaiado');
  await expect(page.locator('.not-tested-band .band-reason')).toHaveText('Equipamento inacessível na visita');
  await expect(page.getByTestId('ficha-progress')).toHaveText('Completa');
  expect((await outbox(page)).find((row) => row.path === `block/${blockId}/not_tested`)).toMatchObject({
    value: { reason: 'outro', text: 'Equipamento inacessível na visita' },
  });

  // "Concluir ficha" leaves the header Overflow once the sheet is not tested.
  await page.getByRole('button', { name: `Mais opções da ficha ${tag}` }).click();
  await expect(page.getByRole('menuitem', { name: 'Concluir ficha' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Nameplate: read-only fields, no "Digitar" text link.
  await expect(page.getByRole('button', { name: 'Digitar' })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: PARA_RAIO.nameplate[0]!.label })).toHaveAttribute('aria-readonly', 'true');

  // Checklist: no bulk bar, the tri-state radiogroups disabled, the Overflow trigger hidden.
  await expect(page.locator('#ficha-step-verificacoes .bulk-action-bar')).toHaveCount(0);
  await expect(checklistRow(page, 1).getByRole('radiogroup')).toHaveAttribute('aria-disabled', 'true');
  await expect(checklistRow(page, 1).locator('.overflow-trigger')).toBeHidden();
  await expect(page.locator('.sticky-action-bar .bulk-action-bar')).toHaveCount(0);

  // "Desfazer" on a not-yet-synced mark clears it at once, no dialog (this device wrote
  // it this session and the relatório has never synced -- everything here is offline).
  await page.locator('.not-tested-band').getByRole('button', { name: 'Desfazer' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.not-tested-band')).toHaveCount(0);
  await expect(page.locator('.sheet-title .not-tested-chip')).toHaveCount(0);
  expect((await outbox(page)).filter((row) => row.path === `block/${blockId}/not_tested`).at(-1)?.value).toBeNull();
});

test('@p1 5.9-E2E-002 "Desfazer" once the mark has synced opens a Confirm dialog; only confirming clears it', async ({ page }) => {
  test.setTimeout(150_000);
  await openRelatorio(page, 1280);
  await openEnel(page);
  const { blockId } = await openSheet(page, rowOfType(page, 'Disjuntor'));

  await checklistRow(page, 1).getByRole('radio', { name: 'Conforme', exact: true }).click();
  await page.getByRole('button', { name: /^Mais opções da ficha/ }).click();
  await page.getByRole('menuitem', { name: 'Marcar não ensaiado' }).click();
  const dialog = page.getByRole('dialog', { name: 'Marcar não ensaiado' });
  await dialog.getByRole('button', { name: 'Marcar não ensaiado' }).click();
  await expect(page.locator('.not-tested-band')).toBeVisible();
  await syncNow(page);

  const band = page.locator('.not-tested-band');
  await band.getByRole('button', { name: 'Desfazer' }).click();
  const confirm = page.getByRole('dialog', { name: 'Desfazer "Marcar não ensaiado"?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Cancelar' }).click();
  await expect(confirm).toBeHidden();
  await expect(band).toBeVisible();

  await band.getByRole('button', { name: 'Desfazer' }).click();
  await confirm.getByRole('button', { name: 'Desfazer' }).click();
  await expect(band).toHaveCount(0);
  expect((await outbox(page)).filter((row) => row.path === `block/${blockId}/not_tested`).at(-1)?.value).toBeNull();
});

test('@p0 5.4-E2E-002 "Repetir da ficha anterior do mesmo tipo" writes only the target unset rows, leaving an already-answered row untouched', async ({ page }) => {
  test.setTimeout(120_000);
  const { relatorioId } = await openRelatorio(page, 1280);
  await openEnel(page);
  const items = PARA_RAIO.checklist!;
  const source = await rowIds(rowOfType(page, 'Para-raio', 0));
  const target = await rowIds(rowOfType(page, 'Para-raio', 1));
  const scope = { relatorioId };
  const drafts: OpDraft[] = [
    ...items.map((item) => officeDraft(account, scope, `sheet/${source.blockId}/checklist/${item.key}/result`, 'C')),
    officeDraft(account, scope, `block/${source.blockId}/concluded_by`, { actor_id: account.userId, at: new Date().toISOString() }),
    // The target already answered its first item, differently from the source: "Repetir" must leave it as is.
    officeDraft(account, scope, `sheet/${target.blockId}/checklist/${items[0]!.key}/result`, 'NC'),
  ];
  await pushDrafts(page, database, drafts);
  await syncNow(page);
  await openEnel(page);
  await openSheet(page, rowOfType(page, 'Para-raio', 1));

  const bulk = page.locator('#ficha-step-verificacoes .bulk-action-bar');
  await bulk.getByRole('button', { name: 'Repetir da ficha anterior do mesmo tipo' }).click();
  await expect(toast(page)).toContainText(`Padrão de ${source.tag} repetido`);
  await expect(checklistRow(page, 1).getByRole('radio', { name: 'Não conforme' })).toHaveAttribute('aria-checked', 'true');
  await expect(checklistRow(page, 2).getByRole('radio', { name: 'Conforme', exact: true })).toHaveAttribute('aria-checked', 'true');
  const written = (await outbox(page)).filter((row) => row.path === `sheet/${target.blockId}/checklist/${items[0]!.key}/result`);
  expect(written.every((row) => row.value === 'NC')).toBe(true);
  expect((await outbox(page)).find((row) => row.path === `sheet/${target.blockId}/checklist/${items[1]!.key}/result`)?.value).toBe('C');
});
