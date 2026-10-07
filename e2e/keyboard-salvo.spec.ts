import { calendarDateOfInstant, type OpDraft } from '@app/domain';
import type { Page } from '@playwright/test';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { newRelatorioDrafts, pushDrafts, type SeededSheet } from './support/relatorio-seed.ts';

/*
 * Story 13.4 (review-field-ux-2026-10-06 INP-1, INP-3, INP-4), driven as a person would:
 * - INP-1: the sheet's code-like text fields (Identificação, Nº série, TAG, Tipo, TAP atual)
 *   and the date text input never capitalize, correct or spell-check;
 * - INP-3: an empty "Data de fabricação" takes a month-year ("08/2024") or a year ("2024"),
 *   stored as typed and shown the same after a reload; an empty service date offers "Hoje";
 * - INP-4: the sheet header shows a visible "Salvo às HH:MM" once a field op lands in the
 *   outbox, "Salvo neste aparelho às HH:MM" offline, and the header keeps its height.
 * INP-2 (the readings' Enter key and a tap commit) is `keyboard-salvo.durability.spec.ts`.
 *
 * Each test resets Empresa B (this worker's own, E6-Q7) and pushes a standard relatório from
 * an office device, then opens a sheet or the setup by its address.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

interface OutboxRow {
  path: string;
  value: unknown;
}

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const written = async (page: Page, path: string) => (await outbox(page)).filter((row) => row.path === path).map((row) => row.value);
const field = (page: Page, key: string) => page.locator(`[data-field-key="${key}"]`);
const saved = (page: Page) => page.getByTestId('ficha-saved');

/** Resets Empresa B, signs in and pushes a standard relatório (its drafts changed by `edit` first). */
async function seedRelatorio(page: Page, width: number, edit: (drafts: OpDraft[], relatorioId: string) => void = () => undefined) {
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  edit(built.drafts, built.relatorioId);
  await pushDrafts(page, database, built.drafts);
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  return built;
}

async function openSheet(page: Page, relatorioId: string, sheet: SeededSheet): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}/ficha/${sheet.blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
}

test('@p0 13.4-E2E-001 INP-1 and INP-3: plain keyboard on the code fields; an empty fabrication date takes 08/2024 and 2024, stored and shown after a reload', async ({ page }) => {
  test.setTimeout(150_000);
  const built = await seedRelatorio(page, 1280);
  const sec = built.sheets.find((row) => row.blockType === 'chave_seccionadora')!;
  const tp = built.sheets.find((row) => row.blockType === 'tp')!;

  await openSheet(page, built.relatorioId, sec);
  const plain = async (key: string) => {
    const input = field(page, key).locator('input');
    await expect(input).toHaveAttribute('autocapitalize', 'off');
    await expect(input).toHaveAttribute('autocorrect', 'off');
    await expect(input).toHaveAttribute('spellcheck', 'false');
  };
  for (const key of ['identificacao', 'n_serie', 'tag', 'tipo']) await plain(key);

  // The empty date is the mock's text `.input` ("Ex: 03/2012"), numeric, with the same attributes.
  const date = field(page, 'data_de_fabricacao').locator('input.input');
  await expect(field(page, 'data_de_fabricacao').getByRole('spinbutton')).toHaveCount(0);
  await expect(date).toHaveAttribute('placeholder', 'Ex: 03/2012');
  await expect(date).toHaveAttribute('inputmode', 'numeric');
  await plain('data_de_fabricacao');

  // A month-year, left by Tab: stored as the kernel's month, shown as typed.
  await date.click();
  await page.keyboard.type('08/2024');
  await page.keyboard.press('Tab');
  const secDate = `sheet/${sec.blockId}/nameplate/data_de_fabricacao`;
  await expect.poll(() => written(page, secDate)).toEqual(['2024-08']);
  await expect(date).toHaveValue('08/2024');

  // A text the kernel cannot read writes nothing and says why.
  await date.fill('13/2024');
  await date.press('Enter');
  await expect(field(page, 'data_de_fabricacao').locator('.helper[data-tone="red"]')).toHaveText('Data não reconhecida — use dd/mm/aaaa ou mm/aaaa');
  expect(await written(page, secDate)).toEqual(['2024-08']);

  await page.reload();
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await expect(field(page, 'data_de_fabricacao').locator('input.input')).toHaveValue('08/2024');

  // A TP: "TAP atual" is plain too, and a year alone is stored as it is (no month invented).
  await openSheet(page, built.relatorioId, tp);
  await plain('tap_atual');
  const year = field(page, 'data_fabricacao').locator('input.input');
  await year.click();
  await page.keyboard.type('2024');
  await page.keyboard.press('Enter');
  const tpDate = `sheet/${tp.blockId}/nameplate/data_fabricacao`;
  await expect.poll(() => written(page, tpDate)).toEqual(['2024']);
  // Enter kept the focus in the field.
  await expect(year).toBeFocused();
  await expect(year).toHaveValue('2024');
  await page.reload();
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await expect(field(page, 'data_fabricacao').locator('input.input')).toHaveValue('2024');
});

test('@p0 13.4-E2E-002 INP-3 "Hoje": an empty service start on Etapa 1 is filled with today by one tap, stored and shown after a reload', async ({ page }) => {
  test.setTimeout(120_000);
  const built = await seedRelatorio(page, 1280, (drafts, relatorioId) => {
    const relatorio = drafts.find((draft) => draft.kind === 'create' && draft.path === `relatorio/${relatorioId}`)!;
    const value = relatorio.value as { setup: Record<string, unknown> };
    value.setup = { ...value.setup, service_start: null, service_end: null };
  });
  await page.goto(`/relatorio/${built.relatorioId}/setup?etapa=1`);
  const setupRoot = page.locator('.setup-content');
  const start = setupRoot.locator('.field').filter({ has: page.getByRole('group', { name: 'Início da execução' }) });
  const hoje = start.locator('.chip-row').getByRole('button', { name: 'Hoje', exact: true });
  await expect(hoje).toBeVisible({ timeout: 30_000 });

  // The glyph stays inside the `.input` box with the chip row under it.
  const box = (await start.locator('.input').boundingBox())!;
  const glyph = (await start.locator('.date-ico').boundingBox())!;
  expect(glyph.y).toBeGreaterThanOrEqual(box.y);
  expect(glyph.y + glyph.height).toBeLessThanOrEqual(box.y + box.height);

  await hoje.click();
  const today = calendarDateOfInstant(new Date());
  const [y, m, d] = today.split('-');
  await expect(start.getByRole('spinbutton')).toHaveText([d!, m!, y!]);
  await expect(hoje).toHaveCount(0);
  const setupValue = async (key: string) => (await outbox(page)).filter((row) => row.path.endsWith(`/${key}`) && row.path.includes('setup')).map((row) => row.value);
  await expect.poll(() => setupValue('service_start')).toEqual([today]);
  // The end follows an empty end, so it is today too and its chip goes.
  expect(await setupValue('service_end')).toEqual([today]);

  await page.reload();
  const again = page.locator('.setup-content .field').filter({ has: page.getByRole('group', { name: 'Início da execução' }) });
  await expect(again.getByRole('spinbutton')).toHaveText([d!, m!, y!], { timeout: 30_000 });
  await expect(page.locator('.setup-content').getByRole('button', { name: 'Hoje', exact: true })).toHaveCount(0);
});

test('@p0 13.4-E2E-003 INP-4 at 390 px: "Salvo às HH:MM" shows once an op lands, "Salvo neste aparelho" offline, and the header keeps its height', async ({ page, context }) => {
  test.setTimeout(120_000);
  const built = await seedRelatorio(page, 390);
  const sec = built.sheets.find((row) => row.blockType === 'chave_seccionadora')!;
  await openSheet(page, built.relatorioId, sec);
  const header = page.locator('.sheet-header');
  await expect(saved(page)).toBeAttached();
  expect(await saved(page).evaluate((element) => element.textContent)).toBe(' ');
  const before = (await header.boundingBox())!.height;

  const serial = field(page, 'n_serie').locator('input');
  await serial.click();
  await page.keyboard.type('SU1240998');
  await page.keyboard.press('Tab');
  await expect.poll(() => written(page, `sheet/${sec.blockId}/nameplate/n_serie`)).toEqual(['SU1240998']);
  await expect(saved(page)).toHaveText(/^Salvo às \d{2}:\d{2}$/);
  await expect(saved(page)).toBeVisible();
  await expect(saved(page)).not.toHaveClass(/visually-hidden/);
  expect((await header.boundingBox())!.height).toBe(before);

  // Offline the same line says the value is kept on this device.
  await context.setOffline(true);
  try {
    const tipo = field(page, 'tipo').locator('input');
    await tipo.click();
    await page.keyboard.type('Rotativa');
    await page.keyboard.press('Tab');
    await expect.poll(() => written(page, `sheet/${sec.blockId}/nameplate/tipo`)).toEqual(['Rotativa']);
    await expect(saved(page)).toHaveText(/^Salvo neste aparelho às \d{2}:\d{2}$/);
    await expect(saved(page)).toBeVisible();
    expect((await header.boundingBox())!.height).toBe(before);
  } finally {
    await context.setOffline(false);
  }
});
