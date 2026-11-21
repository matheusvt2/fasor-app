import { cellAddressesOf, getDefinition, type OpDraft } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { cellOf, kernelOf, openStep, outboxValues, testSection } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Story 27.7 (batch e27a, F13 of the 2026-11-21 pass): a v16 disjuntor's insulation, corrected to 20 °C by the
 * cabine's ambient (the temperature-correction recipe without the DOCX: the office sets the plate's TENSÃO NOMINAL
 * and the cabine's 30 °C, the person types 2 GΩ on the first row). At 1024x768 with the tree open, the "Corrigido a 20 °C"
 * column is hidden and the corrected value stands under its reading, the kernel's words, with no horizontal
 * overflow (collapsed there, the column returns); at 1280x800 the column shows as before; at 768x1024 the stacked
 * line stands whatever the tree: collapsed nothing is cut, opened by hand (a 400 px box) the table scrolls in its own
 * box, never the page. It measures the layout, so it runs in the `solo` lane.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const RELATORIO_SEED = 'v16';
const section = (page: Page) => testSection(page, 'isolacao');
const fichaBody = (page: Page) => page.locator('.ficha-body');

/** How far the readings table is wider than its scroller (positive: it is cut), the page never scrolling sideways. */
async function overflowOf(table: Locator): Promise<number> {
  const box = await table.evaluate((element) => {
    // The table's own horizontal scroller (`.mt-scroll`): what it holds beyond its visible width.
    const scroller = element.closest('.mt-scroll') as HTMLElement;
    return { scroll: scroller.scrollWidth, client: scroller.clientWidth, table: Math.round(element.getBoundingClientRect().width), page: document.documentElement.scrollWidth - window.innerWidth };
  });
  expect(box.page, `page overflow ${JSON.stringify(box)}`).toBeLessThanOrEqual(0);
  expect(box.table, `table wider than its scroller ${JSON.stringify(box)}`).toBeLessThanOrEqual(box.client);
  // The table's own box against its scroller: `scrollWidth` also counts the cells' absolutely placed, visually
  // hidden parts (`ficha.css`, batch r8lay), which overflow by design and are clipped by the scroller.
  return box.table - box.client;
}

test('@p0 27.7-E2E-001 the corrected value stands under its reading at 1024x768 with the tree open, no overflow; the column shows at 1280x800; nothing is cut at 768x1024', async ({ page }) => {
  test.setTimeout(240_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account, { seedVersion: RELATORIO_SEED });
  const breaker = built.sheets.find((sheet) => sheet.blockType === 'disjuntor_mt')!;
  const created = (prefix: string) => built.drafts.filter((draft) => draft.kind === 'create' && draft.path.startsWith(prefix)).map((draft) => draft.value as Record<string, unknown>);
  const locations = new Map(created('location/').map((row) => [row.id as string, row]));
  let cabine = locations.get(created('block/').find((row) => row.id === breaker.blockId)!.location_id as string)!;
  while (cabine.parent_id !== null) cabine = locations.get(cabine.parent_id as string)!;
  const scope = { relatorioId: built.relatorioId };
  const plate = (key: string, value: unknown): OpDraft => officeDraft(account, scope, `sheet/${breaker.blockId}/nameplate/${key}`, value);
  await pushDrafts(page, database, [
    ...built.drafts,
    emCampoDraft(account, built.relatorioId),
    plate('tensao_nominal', '15'),
    officeDraft(account, scope, `location/${cabine.id as string}/env/temperature_c`, { raw: '30', unit: '°C', state: 'measured' }),
  ]);
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });

  // The first row at 2 GΩ, typed as a person does: the kernel corrects it to 20 °C.
  const [at] = cellAddressesOf(getDefinition(RELATORIO_SEED, 'cabine_primaria', 'disjuntor_mt'), 'isolacao');
  await openStep(page, built.relatorioId, breaker.blockId, 'Ensaios');
  await cellOf(page, 'isolacao', at!.row, at!.col).locator('input.mf-value').click();
  await page.keyboard.type('2G');
  await page.keyboard.press('Enter');
  await expect.poll(() => outboxValues(database, page, `sheet/${breaker.blockId}/test/isolacao/cell/${at!.row}/${at!.col}`)).toEqual([{ raw: '2', unit: 'GΩ', state: 'measured' }]);
  const evaluation = (await kernelOf(page, database, built.relatorioId, breaker.blockId)).test('isolacao');
  const corrected = evaluation.tables[0]!.rows[0]!.cells.find((cell) => cell.role === 'capture')!.corrected!;
  expect(evaluation.temperature!.state).toBe('corrected');
  // The test's first table holds the typed row; every table of the test is measured.
  const table = section(page).locator('table.measurement-table').first();
  const column = table.locator('th[data-corrected-column]');
  const cell = table.locator(`td[data-corrected-cell="${at!.row}"]`);
  const stacked = table.locator(`.corrected-stacked[data-corrected-line="${at!.row}"]`);
  const tables = section(page).locator('table.measurement-table');
  const overflowOfAll = async (): Promise<number> => {
    let worst = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < (await tables.count()); i += 1) worst = Math.max(worst, await overflowOf(tables.nth(i)));
    return worst;
  };

  // 1280x800: the column shows as before, the stacked line hidden.
  await expect(column).toBeVisible();
  await expect(column).toHaveText(evaluation.temperature!.header);
  await expect(cell).toContainText(corrected.text);
  await expect(stacked).toBeHidden();
  expect(await overflowOfAll()).toBeLessThanOrEqual(0);

  // 1024x768, the tree open (its default from 1024 px): the column hidden, the value under its reading, no overflow.
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(fichaBody(page)).toHaveAttribute('data-rail', 'auto');
  await expect(page.locator('.ficha-body > .rail')).toBeVisible();
  await expect(column).toBeHidden();
  await expect(cell).toBeHidden();
  await expect(stacked).toBeVisible();
  await expect(stacked).toContainText(`${evaluation.temperature!.cellLead} ${corrected.text}`);
  await expect(stacked.locator('b.t-value')).toHaveText(corrected.text);
  expect(await overflowOfAll()).toBeLessThanOrEqual(0);

  // The tree collapsed at 1024: there is room again, and the column comes back.
  await page.getByRole('button', { name: 'Recolher árvore' }).click();
  await expect(fichaBody(page)).toHaveAttribute('data-rail', 'closed');
  await expect(column).toBeVisible();
  await expect(stacked).toBeHidden();
  expect(await overflowOfAll()).toBeLessThanOrEqual(0);

  // Opened again with its own button: the stacked line again.
  await page.getByRole('button', { name: 'Abrir árvore do relatório' }).click();
  await expect(fichaBody(page)).toHaveAttribute('data-rail', 'open');
  await expect(column).toBeHidden();
  await expect(stacked).toBeVisible();
  expect(await overflowOfAll()).toBeLessThanOrEqual(0);

  // 768x1024 with the tree opened by hand: the same stacked line (the rule extends there), but a 400 px box cannot hold
  // the table even without the column (measured 571 px), so it scrolls inside its own box and never the page.
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(fichaBody(page)).toHaveAttribute('data-rail', 'open');
  await expect(page.locator('.ficha-body > .rail')).toBeVisible();
  await expect(column).toBeHidden();
  await expect(stacked).toBeVisible();
  const narrow = await table.evaluate((element) => ({
    overflowX: getComputedStyle(element.closest('.mt-scroll')!).overflowX,
    page: document.documentElement.scrollWidth - window.innerWidth,
  }));
  expect(narrow).toEqual({ overflowX: 'auto', page: 0 });
  // Collapsed (the default at 768 px): with the column the table would not fit its 672 px box either, so from 768 to
  // 1023 px the stacked line stands whatever the tree, and nothing is cut.
  await page.getByRole('button', { name: 'Recolher árvore' }).click();
  await expect(fichaBody(page)).toHaveAttribute('data-rail', 'closed');
  await expect(column).toBeHidden();
  await expect(stacked).toBeVisible();
  expect(await overflowOfAll()).toBeLessThanOrEqual(0);
});
