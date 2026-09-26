import { getDefinition } from '@app/domain';
import type { BrowserContext, Locator, Page, TestInfo } from '@playwright/test';
import { signInForDurability } from './support/durability.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { newRelatorioDrafts, pushDrafts, type SeededSheet } from './support/relatorio-seed.ts';
import { humanTap, TAP_HOLD_MS } from './support/taps.ts';

/*
 * E5-A2 (Epic 5 retro; review E5-Q18 g): the equipment sheet in the durability matrix, on
 * desktop Chrome, Android Chrome emulation (the Galaxy Tab, touch) and WebKit, against the
 * built bundle. Every step is a tap the way a hand makes it (`humanTap`): a real touch
 * through the DevTools protocol on the Chromium projects, the mouse on WebKit, whose
 * desktop project has no touch to dispatch (Playwright's WebKit has no touch input outside
 * a touch device context).
 *
 * Covered: the tri-state checklist set, changed and cleared by taps; the M · G · T unit
 * chips by tap at phone width; the Sticky action bar and a focused reading with the
 * viewport shrunk as the on-screen keyboard shrinks it, above and below 480 px (UX-DR16);
 * "Marcar não ensaiado" by taps, then the sheet read-only after a reload.
 *
 * Each test resets Empresa B and pushes a standard relatório from an office device, then
 * opens a chave seccionadora sheet by its address (Empresa B is this worker's own, E6-Q7).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  // This worker's Empresa B (E6-Q7): its company, its user and its device database.
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});
const SECC = getDefinition('v1', 'cabine_primaria', 'chave_seccionadora');
const ITEMS = SECC.checklist!;

interface OutboxRow {
  path: string;
  value: unknown;
}

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const toast = (page: Page) => page.getByTestId('toast');
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const checklistRow = (page: Page, n: number) => page.locator('#ficha-step-verificacoes li.checklist-row').nth(n - 1);
const segment = (page: Page, n: number, name: string) => checklistRow(page, n).getByRole('radio', { name, exact: true });
const stickyBar = (page: Page) => page.locator('.sticky-action-bar');

/** A tap: a real touch on the Chromium projects (the desktop one emulates it), the mouse on WebKit. */
const tap = (page: Page, target: Locator, info: TestInfo) => humanTap(page, target, info, undefined, { touch: true });

/**
 * A tap at the centre of `target` whatever is drawn there, for a control that takes no
 * pointer at all (a read-only segment has `pointer-events: none`, so `humanTap`'s own
 * "the centre hits the target" check does not apply).
 */
async function tapAt(page: Page, target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (page.context().browser()?.browserType().name() !== 'chromium') {
    await page.mouse.click(x, y, { delay: TAP_HOLD_MS });
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await page.waitForTimeout(TAP_HOLD_MS);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await cdp.detach();
  }
}

/** Resets Empresa B, signs in, pushes a standard relatório and opens its first chave seccionadora sheet. */
async function openSeccionadora(page: Page, context: BrowserContext): Promise<SeededSheet> {
  await resetEmpresaB(account, { standard: true });
  await signInForDurability(page, context, account.email);
  const built = newRelatorioDrafts(account);
  await pushDrafts(page, database, built.drafts);
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  const sheet = built.sheets.find((row) => row.blockType === 'chave_seccionadora')!;
  await page.goto(`/relatorio/${built.relatorioId}/ficha/${sheet.blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  return sheet;
}

test.beforeEach(({ browserName }, info) => {
  if (browserName !== 'chromium') {
    info.annotations.push({ type: 'pointer', description: 'WebKit desktop has no touch to dispatch: every tap here is a mouse press held like a finger' });
  }
});

/** The values written to one path, oldest first. */
const written = async (page: Page, path: string) => (await outbox(page)).filter((row) => row.path === path).map((row) => row.value);

test('@p1 E5-A2-E2E-001 the tri-state checklist by tap: set, change, re-tap keeps, clear from the row Overflow', async ({ page, context }, info) => {
  test.setTimeout(120_000);
  const { blockId } = await openSeccionadora(page, context);
  const path = `sheet/${blockId}/checklist/${ITEMS[0]!.key}/result`;

  await tap(page, segment(page, 1, 'Conforme'), info);
  await expect(segment(page, 1, 'Conforme')).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => written(page, path)).toEqual(['C']);

  await tap(page, segment(page, 1, 'Não conforme'), info);
  await expect(segment(page, 1, 'Não conforme')).toHaveAttribute('aria-checked', 'true');
  await expect(segment(page, 1, 'Conforme')).toHaveAttribute('aria-checked', 'false');
  await expect.poll(() => written(page, path)).toEqual(['C', 'NC']);

  // A glove double-tap never un-marks: the re-tap of the chosen segment writes nothing.
  await tap(page, segment(page, 1, 'Não conforme'), info);
  await expect(segment(page, 1, 'Não conforme')).toHaveAttribute('aria-checked', 'true');

  await tap(page, checklistRow(page, 1).getByRole('button', { name: `Mais opções de ${ITEMS[0]!.label}` }), info);
  await tap(page, page.getByRole('menuitem', { name: 'Limpar' }), info);
  await expect(checklistRow(page, 1).locator('.seg[aria-checked="true"]')).toHaveCount(0);
  await expect.poll(() => written(page, path)).toEqual(['C', 'NC', null]);
});

test('@p1 E5-A2-E2E-002 phone 390: the M · G · T chips under a focused insulation reading set its unit by tap, the focus stays in the reading', async ({ page, context }, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const { blockId } = await openSeccionadora(page, context);
  await tap(page, stepper(page).getByRole('button', { name: /^Ensaios,/ }), info);
  const reading = page.getByRole('textbox', { name: 'T1, Valor', exact: true });
  const chips = page.getByRole('group', { name: 'Unidade' });
  await expect(chips).toHaveCount(0);

  await tap(page, reading, info);
  await expect(reading).toBeFocused();
  await expect(chips).toBeVisible();
  await expect(chips.getByRole('button')).toHaveText(['M', 'G', 'T']);
  await tap(page, chips.getByRole('button', { name: 'teraohms' }), info);
  await expect(reading).toBeFocused();
  await expect(chips.getByRole('button', { name: 'teraohms' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.type('2');
  await expect(page.locator('.ficha-cell[data-cell="isolacao:0:0"]').filter({ visible: true }).locator('.mf-echo')).toHaveText('= 2 TΩ');

  await tap(page, chips.getByRole('button', { name: 'megaohms' }), info);
  await expect(reading).toBeFocused();
  await expect(page.locator('.ficha-cell[data-cell="isolacao:0:0"]').filter({ visible: true }).locator('.mf-echo')).toHaveText('= 2 MΩ');
  await page.keyboard.press('Enter');
  await expect.poll(() => written(page, `sheet/${blockId}/test/isolacao/cell/0/0`)).toEqual([{ raw: '2', unit: 'MΩ', state: 'measured' }]);
  // The Enter run moved on to the next reading: the chips went with the focus.
  await expect(reading).not.toBeFocused();
  await expect(page.locator('.ficha-cell[data-cell="isolacao:0:0"] .unit-suffix-row')).toHaveCount(0);
  await expect(chips).toHaveCount(1);
  expect(await chips.evaluate((group) => group.closest('.ficha-cell')?.contains(document.activeElement) ?? false)).toBe(true);
});

/** The focused reading's and the Sticky action bar's boxes, and the bar's position, as the viewport draws them. */
async function layoutOf(page: Page, field: Locator) {
  return field.evaluate((input) => {
    const bar = document.querySelector<HTMLElement>('[data-route="/relatorio/:id/ficha/:blockId"] .sticky-action-bar')!;
    const f = input.getBoundingClientRect();
    const b = bar.getBoundingClientRect();
    const hit = document.elementFromPoint(f.left + f.width / 2, f.top + f.height / 2);
    return {
      viewport: window.innerHeight,
      field: { top: f.top, bottom: f.bottom },
      bar: { top: b.top, bottom: b.bottom, position: getComputedStyle(bar).position },
      fieldHit: hit === input || input.contains(hit),
      focused: document.activeElement === input,
    };
  });
}

/**
 * What the platform does when the on-screen keyboard opens: the visual viewport shrinks and
 * the browser brings the focused field into view. The test shrinks the page's viewport to the
 * space left above the keyboard and scrolls the focused field to the middle of it.
 */
async function openKeyboard(page: Page, field: Locator, height: number): Promise<void> {
  await page.setViewportSize({ width: 390, height });
  await field.evaluate((input) => input.scrollIntoView({ block: 'center' }));
}

test('@p1 E5-A2-E2E-003 the Sticky action bar with the on-screen keyboard: above 480 px it stays over the keyboard, clear of the focused reading; below 480 px it unsticks and flows after the content', async ({ page, context }, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await openSeccionadora(page, context);
  await tap(page, stepper(page).getByRole('button', { name: /^Ensaios,/ }), info);
  const reading = page.getByRole('textbox', { name: 'T1, Valor', exact: true });
  await tap(page, reading, info);
  await expect(reading).toBeFocused();

  // A 390 x 844 phone with the keyboard up: 520 px left, above the 480 px line.
  await openKeyboard(page, reading, 520);
  const above = await layoutOf(page, reading);
  expect(above.focused).toBe(true);
  expect(above.bar.position).toBe('sticky');
  // The bar sits at the bottom of what is left, right over the keyboard...
  expect(Math.abs(above.bar.bottom - above.viewport)).toBeLessThanOrEqual(1);
  // ...and the focused reading stays in view, above it, not under it.
  expect(above.field.top).toBeGreaterThanOrEqual(0);
  expect(above.field.bottom).toBeLessThanOrEqual(above.bar.top);
  expect(above.fieldHit).toBe(true);
  await expect(stickyBar(page).locator('#ficha-primary')).toBeInViewport();

  // A taller keyboard (or a landscape phone): 420 px left, below the line. The bar stops
  // floating and flows after the content, so the reading gets the whole height.
  await openKeyboard(page, reading, 420);
  const below = await layoutOf(page, reading);
  expect(below.focused).toBe(true);
  expect(below.bar.position).toBe('static');
  expect(below.field.top).toBeGreaterThanOrEqual(0);
  expect(below.field.bottom).toBeLessThanOrEqual(below.viewport);
  expect(below.fieldHit).toBe(true);
  expect(below.bar.top).toBeGreaterThan(below.viewport);

  // The keyboard goes away: the bar sticks again.
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await layoutOf(page, reading)).bar.position).toBe('sticky');
  await expect(stickyBar(page).locator('#ficha-primary')).toBeInViewport();
});

test('@p1 E5-A2-E2E-004 "Marcar não ensaiado" by taps; after a reload the sheet is read-only and a tap on the checklist changes nothing', async ({ page, context }, info) => {
  test.setTimeout(120_000);
  const { blockId, tag } = await openSeccionadora(page, context);

  await tap(page, page.getByRole('button', { name: `Mais opções da ficha ${tag}` }), info);
  await tap(page, page.getByRole('menuitem', { name: 'Marcar não ensaiado' }), info);
  const dialog = page.getByRole('dialog', { name: 'Marcar não ensaiado' });
  await expect(dialog).toBeVisible();
  await tap(page, dialog.getByRole('radio', { name: 'Solicitação do cliente' }), info);
  await tap(page, dialog.getByRole('button', { name: 'Marcar não ensaiado' }), info);
  await expect(dialog).toBeHidden();
  await expect(toast(page)).toContainText('Marcada como não ensaiada — entra na seção 8');
  await expect.poll(async () => (await written(page, `block/${blockId}/not_tested`)).at(-1)).toMatchObject({ reason: 'solicitacao_cliente' });

  await page.reload();
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.sheet-title .not-tested-chip')).toHaveText('Não ensaiado');
  await expect(page.locator('.not-tested-band')).toBeVisible();
  const groups = page.locator('#ficha-step-verificacoes li.checklist-row [role="radiogroup"]');
  await expect(groups).toHaveCount(ITEMS.length);
  for (const group of await groups.all()) await expect(group).toHaveAttribute('aria-readonly', 'true');
  await expect(page.locator('#ficha-step-verificacoes .bulk-action-bar')).toHaveCount(0);

  // A tap on a read-only segment selects nothing and writes nothing.
  const before = (await outbox(page)).length;
  await tapAt(page, segment(page, 1, 'Conforme'));
  await page.waitForTimeout(500);
  await expect(segment(page, 1, 'Conforme')).toHaveAttribute('aria-checked', 'false');
  expect((await outbox(page)).length).toBe(before);
  expect(await written(page, `sheet/${blockId}/checklist/${ITEMS[0]!.key}/result`)).toEqual([]);
});
