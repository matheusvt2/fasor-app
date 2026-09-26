import type { Page } from '@playwright/test';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { newRelatorioDrafts, pushDrafts } from './support/relatorio-seed.ts';

/*
 * Story 12.6 AC2 (ERGO-E2E-001): the glove targets of DESIGN.md § Spacing, measured on the
 * real app at 390 x 844 and 768 x 1024. Every visible interactive element has a hit area of
 * at least 48 x 48 px: the element's box, or, for a text control (`input`, `select`, `textarea`, a date segment) inside a `label`, an `.input`, a
 * `.measurement-field` or a date field group (the wrapper that receives the tap), that
 * wrapper's box. The glove-filled controls are at least 56 px tall: the tri-state segments,
 * the Measurement field, the conclusion segments and the tree rows. A failure is fixed in
 * the CSS or the markup; an element that cannot meet the target goes in `ERGO_EXCLUSIONS`
 * with its reason (and in the PR).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  // This worker's Empresa B (E6-Q7): its company, its user and its device database.
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
] as const;

/** Elements the check skips, each with its reason. Empty: every target measured meets the rule. */
export const ERGO_EXCLUSIONS: readonly { selector: string; reason: string }[] = [];

const INTERACTIVE = [
  'button',
  'a[href]',
  'input:not([type=hidden])',
  'select',
  'textarea',
  '[role=button]',
  '[role=radio]',
  '[role=checkbox]',
  '[role=switch]',
  '[role=tab]',
  '[role=combobox]',
  '[role=spinbutton]',
  '[role=link]',
  '[role=menuitem]',
  '[tabindex="0"]',
].join(', ');

/** The wrappers whose box is the hit area of a text control inside them; every other element (a button nested in a field) is measured by its own box. */
const WRAPPERS = 'label, .input, .measurement-field, .date-input';
const WRAPPED = 'input, select, textarea, [role=spinbutton]';

/** The glove-filled controls: at least 56 px tall. */
const TALL = ['.tri-state .seg', '.measurement-field', '.conclusion-pair .seg', '.s9-eq-open', '.sum-open', '.relatorio-tree .tree-row'].join(', ');

interface Miss {
  what: string;
  width: number;
  height: number;
  rule: string;
}

/** Every visible target on screen now that misses its rule. */
async function misses(page: Page): Promise<{ misses: Miss[]; measured: number }> {
  return page.evaluate(
    ({ interactive, wrappers, wrapped, tall, excluded }) => {
      const describe = (element: Element) => {
        const name = element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 40) ?? '';
        const classes = typeof element.className === 'string' && element.className !== '' ? `.${element.className.trim().split(/\s+/).join('.')}` : '';
        return `${element.tagName.toLowerCase()}${classes} "${name}"`;
      };
      const visible = (element: Element) => {
        if (element.closest('[aria-hidden="true"], .visually-hidden, [inert]') !== null) return false;
        if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
        const box = element.getBoundingClientRect();
        return box.width > 1 && box.height > 1;
      };
      const skip = (element: Element) => excluded.some((selector) => element.matches(selector));
      const out: { what: string; width: number; height: number; rule: string }[] = [];
      let measured = 0;
      for (const element of document.querySelectorAll(interactive)) {
        if (!visible(element) || skip(element)) continue;
        measured += 1;
        const wrapper = element.matches(wrapped) ? (element.parentElement?.closest(wrappers) ?? null) : null;
        const box = (wrapper ?? element).getBoundingClientRect();
        if (Math.round(box.width) < 48 || Math.round(box.height) < 48) {
          out.push({ what: describe(element), width: Math.round(box.width), height: Math.round(box.height), rule: '48 x 48' });
        }
      }
      for (const element of document.querySelectorAll(tall)) {
        if (!visible(element) || skip(element)) continue;
        measured += 1;
        const box = element.getBoundingClientRect();
        if (Math.round(box.height) < 56) out.push({ what: describe(element), width: Math.round(box.width), height: Math.round(box.height), rule: '56 tall' });
      }
      return { misses: out, measured };
    },
    { interactive: INTERACTIVE, wrappers: WRAPPERS, wrapped: WRAPPED, tall: TALL, excluded: ERGO_EXCLUSIONS.map((e) => e.selector) },
  );
}

/** Scrolls the page end to end a screen at a time, measuring at each stop; misses deduplicated. */
async function sweep(page: Page, surface: string, found: Map<string, Miss & { surface: string }>, measured: Map<string, number>): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));
  for (let stop = 0; stop < 40; stop++) {
    const now = await misses(page);
    measured.set(surface, Math.max(measured.get(surface) ?? 0, now.measured));
    for (const miss of now.misses) found.set(`${surface} ${miss.what} ${miss.rule}`, { ...miss, surface });
    const moved = await page.evaluate(() => {
      const before = window.scrollY;
      window.scrollBy(0, Math.round(window.innerHeight * 0.8));
      return window.scrollY !== before;
    });
    if (!moved) break;
    await page.waitForTimeout(150);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function openSection9(page: Page): Promise<void> {
  const chevron = page.getByRole('button', { name: 'Expandir ou recolher a seção 9' });
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  const locais = page.getByRole('list', { name: 'Locais do relatório' });
  await expect(locais).toBeVisible();
  // The first cabine open too, so its equipment rows (`.s9-eq-open`) are measured.
  const cabine = locais.locator(':scope > li.s9-cabine').first();
  const toggle = cabine.locator(':scope > .s9-cab-row .tree-chevron');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(cabine.locator('.s9-eq-open').first()).toBeVisible();
}

test('@p0 ERGO-E2E-001 glove targets at 390 and 768 px: every control at least 48 x 48, the glove-filled ones at least 56 tall (Home, Sumário with section 9 open, the tree, a sheet)', async ({ page }) => {
  test.setTimeout(240_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize(VIEWPORTS[1]);
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const sheet = built.sheets.find((s) => s.blockType === 'chave_seccionadora' && s.locationName === 'Cubículo Enel')!;
  await pushDrafts(page, database, built.drafts);
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });

  const found = new Map<string, Miss & { surface: string }>();
  const measured = new Map<string, number>();
  for (const viewport of VIEWPORTS) {
    const at = `${viewport.width}px`;
    await page.setViewportSize(viewport);

    await page.goto('/');
    await expect(page.locator('.relatorio-card').first()).toBeVisible({ timeout: 30_000 });
    await sweep(page, `Home ${at}`, found, measured);

    await page.goto(`/relatorio/${built.relatorioId}`);
    await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
    await openSection9(page);
    await sweep(page, `Sumário ${at}`, found, measured);

    if (viewport.width < 768) {
      await page.goto(`/relatorio/${built.relatorioId}/arvore`);
      await expect(page.locator('.relatorio-tree .tree-row').first()).toBeVisible({ timeout: 30_000 });
      await sweep(page, `Árvore ${at}`, found, measured);
    }

    // A sheet of a cabine still empty: the cabine block expanded above the plate.
    await page.goto(`/relatorio/${built.relatorioId}/ficha/${sheet.blockId}`);
    await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.se-block').first()).toBeVisible();
    await sweep(page, `Ficha ${at}`, found, measured);
  }

  const counts = [...measured.entries()].map(([surface, n]) => `${surface}: ${n}`).join(', ');
  const list = [...found.values()].map((m) => `${m.surface}: ${m.what} is ${m.width} x ${m.height} (${m.rule})`);
  test.info().annotations.push({ type: 'ERGO measured (most on one screen)', description: counts });
  test.info().annotations.push({ type: 'ERGO misses', description: list.length === 0 ? 'none' : list.join('\n') });
  console.log(`ERGO-E2E-001: measured ${counts}; ${list.length} misses${list.length === 0 ? '' : `\n${list.join('\n')}`}`);
  // Never a vacuous pass: every surface put real targets in front of the check.
  expect(measured.size).toBe(7);
  for (const [surface, n] of measured) expect(n, `${surface} measured`).toBeGreaterThan(5);
  expect(list).toEqual([]);
});
