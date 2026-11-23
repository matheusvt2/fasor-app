import { composerView, standardTemplate, STANDARD_TEMPLATE_NAME } from '@app/domain';
import type { Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { expect, horizontalOverflow, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Story 27.14 (batch e27c, F20 of the 2026-11-21 pass), the templates half: in the template editor a local
 * card's meta line takes the card's width (never a column narrower than half the card) at 768 and 1024 px,
 * and each section row shows one number, the one Story 27.5 gives it (`composerView`), with no Position box
 * beside it. The Home half of the story (a date on a card not on the device, twins told apart) is narrowed
 * out of this batch: the company pull's summary carries no service date. It measures the layout, so it runs
 * in the `solo` lane.
 */

let account: SeedAccount;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
});

const sectionRows = (page: Page) => page.getByRole('list', { name: 'Blocos do template' }).locator(':scope > li');
const localCards = (page: Page) => page.locator('[data-route="/templates/:id"] li.local-card');

test('@p0 27.14-E2E-001 the local card meta takes the card width at 768 and 1024 px; each section row shows one number', async ({ page }) => {
  test.setTimeout(180_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1024, height: 768 });
  await signIn(page, account.email);
  const view = composerView(standardTemplate({ id: newId() }));
  await page.goto('/templates');
  await page.getByRole('button', { name: `Abrir template ${STANDARD_TEMPLATE_NAME}`, exact: true }).click({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/templates\/[0-9a-f-]{36}$/);
  await expect(sectionRows(page)).toHaveCount(view.sections.length, { timeout: 30_000 });

  for (const [width, height] of [
    [768, 1024],
    [1024, 768],
    [1280, 800],
  ] as const) {
    await page.setViewportSize({ width, height });
    expect(await horizontalOverflow(page), `page overflow at ${width}`).toBeLessThanOrEqual(0);

    // Each local card: the meta line (`.block-sub`) at least half the card's width.
    const cards = await localCards(page).evaluateAll((items) =>
      items.map((li) => {
        const sub = li.querySelector(':scope > .block-body .block-sub')!;
        return { name: li.querySelector('.block-name')?.textContent ?? '', card: li.getBoundingClientRect().width, sub: sub.getBoundingClientRect().width, toggle: li.querySelector(':scope > .cabine-toggle')!.getBoundingClientRect().width };
      }),
    );
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.sub, `meta of ${card.name} at ${width}: ${JSON.stringify(card)}`).toBeGreaterThanOrEqual(card.card / 2);
      expect(card.toggle, `"Agrupar por tipo" of ${card.name} at ${width} is drawn`).toBeGreaterThan(0);
    }
    await expect(localCards(page).first().getByRole('switch')).toBeVisible();

    // Each section row: one number, the relatório's, and no Position box.
    await expect(sectionRows(page).locator('.block-tag')).toHaveText(view.sections.map((section) => String(section.number)));
    for (let i = 0; i < view.sections.length; i++) {
      const row = sectionRows(page).nth(i);
      await expect(row.locator('.block-tag')).toHaveCount(1);
      await expect(row.locator('.pos-box')).toHaveCount(0);
      await expect(row.getByRole('textbox')).toHaveCount(0);
    }
  }

  // A section row's Overflow (the menu of the layout pass): it opens inside the screen and still offers the moves.
  await sectionRows(page).first().locator(':scope > .overflow-trigger').click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Descer' })).toBeVisible();
  expect(await horizontalOverflow(page), 'page overflow with the menu open').toBeLessThanOrEqual(0);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});
