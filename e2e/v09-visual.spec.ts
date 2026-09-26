import { getDefinition, screenLabel, SHEET_STEPS, sheetSummaryText, type SheetStep } from '@app/domain';
import type { Page } from '@playwright/test';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { newRelatorioDrafts, pushDrafts, type SeededSheet } from './support/relatorio-seed.ts';

/*
 * Story 12.5: the v0.9 skin on the real app (DESIGN.md § v0.9 direction, J-13, J-14, J-17,
 * J-18). The sheet header reads the kernel's one sentence, seed labels read in sentence
 * case, the chosen tri-state segment is solid, a complete step drops its count, the field
 * is filled and underlined, the Sumário's App bar names the relatório and its row text keeps
 * its width on a phone.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  // This worker's Empresa B (E6-Q7): its company, its user and its device database.
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const STEP_NAMES: Record<SheetStep, string> = { placa: 'Placa', verificacoes: 'Verificações', ensaios: 'Ensaios', conclusao: 'Conclusão' };

/** The stepper's missing counts, read from each step's accessible name ("Placa, 3 faltando"). */
async function stepperCounts(page: Page): Promise<{ steps: Record<SheetStep, { missing: number; outOfLimit: number }> }> {
  const steps = {} as Record<SheetStep, { missing: number; outOfLimit: number }>;
  for (const step of SHEET_STEPS) {
    const label = await stepper(page).getByRole('button', { name: new RegExp(`^${STEP_NAMES[step]},`) }).getAttribute('aria-label');
    steps[step] = { missing: Number(/, (\d+) faltando/.exec(label ?? '')?.[1] ?? NaN), outOfLimit: 0 };
  }
  return { steps };
}

/** A computed custom property of the document root, as the browser resolves it (an `rgb(...)` for a color). */
async function rootColor(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, token);
}

async function setUp(page: Page): Promise<{ relatorioId: string; secEnel: SeededSheet }> {
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const secEnel = built.sheets.find((sheet) => sheet.blockType === 'chave_seccionadora' && sheet.locationName === 'Cubículo Enel')!;
  await pushDrafts(page, database, built.drafts);
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  return { relatorioId: built.relatorioId, secEnel };
}

test('@p0 12.5-E2E-001 v0.9 at 768 px: the header sentence, sentence-case labels, the solid tri-state, the filled field, the Sumário named by the relatório and its phone row', async ({ page }) => {
  test.setTimeout(150_000);
  const { relatorioId, secEnel } = await setUp(page);

  // The Sumário: the App bar names the relatório, never "Sumário" (J-17).
  const name = (await page.locator('.sheet-header .sheet-title').textContent())!.trim();
  expect(name).not.toBe('');
  await expect(page.locator('.app-bar h1')).toHaveText(name);

  // The row chevron in the trailing cluster is drawn, not a control of its own, yet a finger on it
  // opens the row (no lost tap): "Definições" opens its section text.
  const definicoes = page.getByRole('list', { name: 'Sumário do relatório' }).locator(':scope > li.sum-row').filter({ has: page.locator('.sum-title', { hasText: /^Definições$/ }) });
  await definicoes.locator('.sum-ctrls .sum-chev').click();
  await expect(page).toHaveURL(/\/secao\//);
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });

  // At 390 px the row text keeps at least 60 % of the row (J-18).
  await page.setViewportSize({ width: 390, height: 844 });
  const rows = page.getByRole('list', { name: 'Sumário do relatório' }).locator(':scope > li.sum-row:not(.sum-s9)');
  expect(await rows.count()).toBeGreaterThan(3);
  for (let i = 0; i < (await rows.count()); i++) {
    const row = rows.nth(i);
    const rowBox = (await row.boundingBox())!;
    const openBox = (await row.locator(':scope > .sum-open').boundingBox())!;
    expect(openBox.width / rowBox.width, `row ${i + 1}: .sum-open is ${Math.round(openBox.width)} of ${Math.round(rowBox.width)} px`).toBeGreaterThanOrEqual(0.6);
  }
  await page.setViewportSize({ width: 768, height: 1024 });

  // The sheet: one kernel sentence, no Progress counter (J-14).
  await page.goto(`/relatorio/${relatorioId}/ficha/${secEnel.blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.app-bar h1')).toHaveText(secEnel.tag);
  const summary = page.locator('.sheet-header .sheet-summary');
  await expect(summary).toHaveText(sheetSummaryText(await stepperCounts(page)));
  await expect(page.locator('.sheet-header .progress-counter')).toHaveCount(0);

  // Labels in sentence case, acronyms kept (J-13, D-9); the document keeps the caps.
  await expect(page.locator('.se-block .field-label', { hasText: 'Tensão primária' })).toBeVisible();
  await expect(page.locator('.se-block .field-label', { hasText: 'Tipo de SE' })).toBeVisible();
  await expect(page.locator('#ficha-nameplate .field-label', { hasText: /^Identificação$/ })).toBeVisible();
  await expect(page.locator('#ficha-nameplate .field-label', { hasText: /^TAG$/ })).toBeVisible();
  await expect(page.getByText('TENSÃO PRIMÁRIA', { exact: true })).toHaveCount(0);

  // The field: filled, no side borders, a 2 px bottom rule.
  const input = page.locator('#ficha-nameplate .input').first();
  await expect(input).toHaveCSS('border-left-width', '0px');
  await expect(input).toHaveCSS('border-right-width', '0px');
  await expect(input).toHaveCSS('border-bottom-width', '2px');
  await expect(input).toHaveCSS('background-color', await rootColor(page, '--surface-sunken'));

  // The chosen tri-state segment is solid, its letter in the selected foreground.
  const row = page.locator('#ficha-step-verificacoes li.checklist-row').first();
  // The checklist rows read in sentence case too, exactly (the seed keeps the caps for the document).
  const firstItem = getDefinition('v2', 'cabine_primaria', 'chave_seccionadora').checklist![0]!.label;
  expect(screenLabel(firstItem)).not.toBe(firstItem);
  await expect(row.getByRole('radiogroup', { name: `1. ${screenLabel(firstItem)}`, exact: true })).toBeVisible();
  const conforme = row.getByRole('radio', { name: 'Conforme', exact: true });
  await conforme.click();
  await expect(conforme).toHaveAttribute('aria-checked', 'true');
  await expect(conforme).toHaveCSS('background-color', await rootColor(page, '--conforme'));
  await expect(conforme).toHaveCSS('color', await rootColor(page, '--tri-state-selected-foreground'));
  await expect(conforme).toHaveCSS('color', 'rgb(255, 255, 255)');

  // A complete step drops its count; the rule under it says "done".
  await page.locator('#ficha-step-verificacoes .bulk-action-bar').getByRole('button', { name: 'Marcar os restantes como Conforme' }).click();
  const verificacoes = stepper(page).getByRole('button', { name: 'Verificações, 0 faltando' });
  await expect(verificacoes).toBeVisible();
  await expect(verificacoes.locator('.step-count')).toBeHidden();
  await expect(stepper(page).getByRole('button', { name: /^Ensaios, [1-9]\d* faltando$/ }).locator('.step-count')).toBeVisible();
  await expect(summary).toHaveText(sheetSummaryText(await stepperCounts(page)));
  await expect(summary).toContainText('Verificações prontas');

  // Dark theme: the chosen letter is the dark ink on the light solid.
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(conforme).toHaveCSS('color', 'rgb(11, 27, 43)');
  await expect(conforme).toHaveCSS('background-color', await rootColor(page, '--conforme'));
  await page.emulateMedia({ colorScheme: 'light' });
});

test('@p1 12.5-E2E-002 v0.9 extras: the button radius, the section stepper rule, the hairline sheet header', async ({ page }) => {
  test.setTimeout(150_000);
  const { relatorioId, secEnel } = await setUp(page);
  await page.goto(`/relatorio/${relatorioId}/ficha/${secEnel.blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#ficha-primary')).toHaveCSS('border-top-left-radius', '10px');
  await expect(page.locator('.sheet-header')).toHaveCSS('border-bottom-width', '1px');
  const current = stepper(page).locator('.step[aria-current]');
  const rule = await current.evaluate((element) => getComputedStyle(element, '::after').height);
  expect(rule).toBe('4px');
  const other = stepper(page).locator('.step:not([aria-current])').first();
  expect(await other.evaluate((element) => getComputedStyle(element, '::after').height)).toBe('3px');
});
