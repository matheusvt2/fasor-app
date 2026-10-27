import { BLOCK_TRANSFORMADOR_ID, CABINE_ID } from '@app/domain/fixtures/porto-seguro/small';
import type { Locator, Page } from '@playwright/test';
import { EXPORT_RELATORIO_ID, resetEmpresaBWithFixture } from './support/export-fixture.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { pdfTextItems } from './support/pdf-text.ts';

/*
 * Story 16.4 (contract 26), driven as a person would on the small Porto Seguro fixture: "n.a"
 * typed in the transformer's POTÊNCIA NOMINAL commits the `not_applicable` value through the
 * existing nameplate put and reads "N/A" (Story 17.3) with no unit, also after a reload; "NA"
 * typed in the cabine's POTÊNCIA INSTALADA reads "N/A" on the collapsed cabine line. Story 17.3:
 * at 390 px, the "N/A" control beside each field, tapped over a number, commits the same put,
 * hides itself and moves no focus; the preview PDF prints "N/A" in both cells. The preview
 * renders through the one queue and LibreOffice of the api and the fixture's ids are fixed, so
 * the file is in the serial group.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

/** The job's own time: flush, queue pick-up, two LibreOffice passes. */
const JOB_TIMEOUT = 150_000;
const NA = { raw: '', unit: null, state: 'not_applicable' };
const POTENCIA_PATH = `sheet/${BLOCK_TRANSFORMADOR_ID}/nameplate/potencia_nominal`;
const INSTALADA_PATH = `location/${CABINE_ID}/se/installed_kva`;

interface OutboxRow {
  path: string;
  value: unknown;
}

const lastOutboxValue = async (page: Page, path: string): Promise<unknown> =>
  (await readStore<OutboxRow>(page, database, 'outbox')).filter((op) => op.path === path).at(-1)?.value;
const sheetTitle = (page: Page) => page.locator('.sheet-header .sheet-title');
const plateField = (page: Page, key: string): Locator => page.locator(`#ficha-nameplate [data-field-key="${key}"]`);
const cabineLine = (page: Page) => page.getByRole('group', { name: 'Do local', exact: true });
const exportDialog = (page: Page) => page.getByRole('dialog', { name: 'Gerar relatório' });
const naControl = (page: Page, label: string): Locator => page.getByRole('button', { name: `Marcar ${label} como não aplicável`, exact: true });
const previewButton = (page: Page) => exportDialog(page).locator('.generate-row').getByRole('button', { name: /^(Pré-visualizar|Gerando rascunho…)$/ });

async function openTransformer(page: Page): Promise<void> {
  await page.goto(`/relatorio/${EXPORT_RELATORIO_ID}/ficha/${BLOCK_TRANSFORMADOR_ID}`);
  await expect(sheetTitle(page)).toBeVisible({ timeout: 30_000 });
  await expect(plateField(page, 'potencia_nominal').locator('input')).toBeVisible();
}

/** Story 17.3: at a phone width the control's box stays inside the viewport, right of the field's value. */
async function expectControlFits(page: Page, field: Locator, control: Locator): Promise<void> {
  const viewport = page.viewportSize()!;
  const button = (await control.boundingBox())!;
  const value = (await field.locator('.measurement-field').boundingBox())!;
  expect(button.x).toBeGreaterThanOrEqual(0);
  expect(button.x + button.width).toBeLessThanOrEqual(viewport.width);
  expect(button.width).toBeGreaterThanOrEqual(44);
  expect(button.height).toBeGreaterThanOrEqual(44);
  expect(value.x + value.width).toBeLessThanOrEqual(button.x);
}

test('@p0 16.4-E2E-001 17.3-E2E-001 "N/A" typed in the transformer sheet\'s POTÊNCIA NOMINAL and in a cabine number field, then tapped from the control at 390 px over a number, commits the not_applicable value, reads "N/A" with no unit, survives a reload and prints "N/A" in the preview', async ({
  page,
  context,
}) => {
  test.setTimeout(300_000);
  await resetEmpresaBWithFixture(account);
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  await page.goto(`/relatorio/${EXPORT_RELATORIO_ID}`);
  await expect(page.locator('.sheet-meta .status-pill')).toHaveText('Em campo', { timeout: 30_000 });

  // The nameplate: "n.a" over the stored 1.000 kVA, then the focus leaves.
  await openTransformer(page);
  const potencia = plateField(page, 'potencia_nominal');
  const input = potencia.locator('input');
  await expect(input).toHaveValue('1.000');
  await expect(potencia.locator('.mf-unit')).toHaveText('kVA');
  await input.fill('n.a');
  // Typed: no unit and no echo line.
  await expect(potencia.locator('.mf-unit')).toHaveCount(0);
  await expect(potencia.locator('.mf-echo')).toHaveCount(0);
  // Story 17.3: the control hides as soon as the text reads N/A.
  await expect(naControl(page, 'Potência nominal')).toHaveCount(0);
  await input.blur();
  await expect(input).toHaveValue('N/A');
  await expect(potencia.locator('.mf-unit')).toHaveCount(0);
  await expect(potencia.locator('.mf-echo')).toHaveCount(0);
  await expect(potencia.getByText('Número não reconhecido')).toHaveCount(0);
  await expect(naControl(page, 'Potência nominal')).toHaveCount(0);
  await expect.poll(() => lastOutboxValue(page, POTENCIA_PATH)).toEqual(NA);

  // A reload reads it back from the device store.
  await page.reload();
  await expect(sheetTitle(page)).toBeVisible({ timeout: 30_000 });
  await expect(input).toHaveValue('N/A');
  await expect(potencia.locator('.mf-unit')).toHaveCount(0);

  // The cabine, complete, is this later sheet's collapsed line: "Editar", then "NA" in POTÊNCIA INSTALADA.
  await expect(cabineLine(page).locator('.cl-values')).toContainText('300');
  await cabineLine(page).getByRole('button', { name: 'Editar' }).click();
  const instalada = page.getByLabel('Potência instalada', { exact: true });
  await expect(instalada).toHaveValue('300');
  await instalada.fill('NA');
  await instalada.press('Enter');
  await expect(instalada).toHaveValue('N/A');
  await expect(page.locator('[data-field-key="installed_kva"] .mf-unit')).toHaveCount(0);
  await expect(naControl(page, 'Potência instalada')).toHaveCount(0);
  await expect.poll(() => lastOutboxValue(page, INSTALADA_PATH)).toEqual(NA);
  // The next visit of the sheet draws the line again, "N/A" in the value's place, no kVA.
  await page.reload();
  await expect(sheetTitle(page)).toBeVisible({ timeout: 30_000 });
  const values = cabineLine(page).locator('.cl-values');
  await expect(values).toHaveText(/^ALVENARIA - CONVENCIONAL · 13,8\skV · .+ · N\/A · 20\s°C · 60\s%$/);
  await expect(values).not.toContainText('kVA');

  // Story 17.3 at a phone width: a number back in POTÊNCIA NOMINAL brings the control back.
  await page.setViewportSize({ width: 390, height: 844 });
  await input.fill('1000');
  await input.blur();
  await expect(input).toHaveValue('1.000');
  await expect(potencia.locator('.mf-unit')).toHaveText('kVA');
  await expect.poll(() => lastOutboxValue(page, POTENCIA_PATH)).toEqual({ raw: '1000', unit: 'kVA', state: 'measured' });
  const plateControl = naControl(page, 'Potência nominal');
  await expect(plateControl).toHaveText('N/A');
  await plateControl.scrollIntoViewIfNeeded();
  await expectControlFits(page, potencia, plateControl);
  // The tap commits the same put as the typed spelling, reads "N/A", hides itself and moves no focus.
  await plateControl.click();
  await expect(input).toHaveValue('N/A');
  await expect(potencia.locator('.mf-unit')).toHaveCount(0);
  await expect(potencia.locator('.mf-echo')).toHaveCount(0);
  await expect(plateControl).toHaveCount(0);
  await expect.poll(() => lastOutboxValue(page, POTENCIA_PATH)).toEqual(NA);
  await expect(page.locator('input:focus')).toHaveCount(0);

  // The cabine field the same way: "Editar", a number, then the control.
  await cabineLine(page).getByRole('button', { name: 'Editar' }).click();
  await expect(instalada).toHaveValue('N/A');
  await expect(naControl(page, 'Potência instalada')).toHaveCount(0);
  await instalada.fill('300');
  await instalada.blur();
  await expect(instalada).toHaveValue('300');
  await expect.poll(() => lastOutboxValue(page, INSTALADA_PATH)).toEqual({ raw: '300', unit: 'kVA', state: 'measured' });
  const cabineControl = naControl(page, 'Potência instalada');
  await cabineControl.scrollIntoViewIfNeeded();
  await expectControlFits(page, page.locator('[data-field-key="installed_kva"]'), cabineControl);
  await cabineControl.click();
  await expect(instalada).toHaveValue('N/A');
  await expect(page.locator('[data-field-key="installed_kva"] .mf-unit')).toHaveCount(0);
  await expect(cabineControl).toHaveCount(0);
  await expect.poll(() => lastOutboxValue(page, INSTALADA_PATH)).toEqual(NA);
  await expect(page.locator('input:focus')).toHaveCount(0);

  // A reload keeps both.
  await page.reload();
  await expect(sheetTitle(page)).toBeVisible({ timeout: 30_000 });
  await expect(input).toHaveValue('N/A');
  await expect(naControl(page, 'Potência nominal')).toHaveCount(0);
  await expect(values).toHaveText(/ · N\/A · 20\s°C · 60\s%$/);
  await page.setViewportSize({ width: 1280, height: 900 });

  // The preview prints "N/A" in both cells, never the old values.
  await page.goto(`/relatorio/${EXPORT_RELATORIO_ID}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  const tabPromise = context.waitForEvent('page');
  await previewButton(page).click();
  const tab = await tabPromise;
  const requested = tab.waitForRequest(/\/api\/relatorios\/[0-9a-f-]{36}\/preview\.pdf\?v=[0-9a-f-]{36}$/, { timeout: JOB_TIMEOUT });
  const url = (await requested).url();
  const pdf = await page.request.get(url);
  expect(pdf.status()).toBe(200);
  const items = await pdfTextItems(new Uint8Array(await pdf.body()));
  await tab.close();
  const text = items.join(' ');
  // DADOS DO EQUIPAMENTO draws its label/value pairs left to right (the label wraps): the value follows it.
  expect(text).toMatch(/POTÊNCIA NOMINAL N\/A TAP ATUAL/);
  // CARACTERÍSTICAS DA SE's value row: type, primary, secondary, then POTÊNCIA INSTALADA, before AMBIENTE DE ENSAIO.
  expect(text).toMatch(/13,8 kV \S+ V N\/A AMBIENTE DE ENSAIO/);
  expect(text).not.toMatch(/1\.000\s*kVA/);
  expect(text).not.toMatch(/\b300\s*kVA/);
});
