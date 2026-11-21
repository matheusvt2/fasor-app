import { composerView, standardTemplate, STANDARD_TEMPLATE_NAME } from '@app/domain';
import type { Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { createProjectFromHome, createRelatorio } from './support/relatorio-flow.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Story 27.5 (batch e27a, F9 of the 2026-11-21 pass), at 1280 px: the standard template's composer numbers
 * each section as a relatório created from it will (9 Relatórios dos ensaios before 8 Pontos de atenção, the
 * automatic 7 and 8 named in the note); a relatório created from it through Home then carries, on its Sumário,
 * the same number for every section. The expected numbers are the kernel's (`composerView`).
 */

let account: SeedAccount;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
});

const sumario = (page: Page) => page.getByRole('list', { name: 'Sumário do relatório' });

test('@p1 27.5-E2E-001 the standard template numbers its sections as the relatório created from it, and its Sumário carries the same numbers', async ({ page }) => {
  test.setTimeout(180_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const view = composerView(standardTemplate({ id: newId() }));
  const expected = view.sections.map((section) => [section.block_type, section.number] as const);
  expect(expected.map(([, number]) => number)).toEqual([1, 2, 3, 4, 5, 6, 9, 10, 11]);

  // The composer: each card's number, and the note naming the two automatic sections by theirs.
  await page.getByRole('link', { name: /Templates/ }).click();
  await expect(page).toHaveURL(/\/templates$/);
  await page.getByRole('button', { name: `Abrir template ${STANDARD_TEMPLATE_NAME}`, exact: true }).click({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/templates\/[0-9a-f-]{36}$/);
  const tags = page.getByRole('list', { name: 'Blocos do template' }).locator('.block-tag');
  await expect(tags).toHaveText(expected.map(([, number]) => String(number)));
  await expect(page.locator('.section-note').filter({ hasText: 'entram sozinhos no relatório' })).toHaveText(
    `Ordem inicial da árvore; o engenheiro reordena no relatório. ${view.generatedNumbers.section_7} Registro fotográfico e ${view.generatedNumbers.section_9} Relatórios dos ensaios entram sozinhos no relatório.`,
  );

  // A relatório created from it, as a person does from Home.
  await page.goto('/');
  await expect(page.locator('.shortcut-sub', { hasText: '1 template' })).toBeVisible({ timeout: 30_000 });
  await createProjectFromHome(page);
  const relatorioId = await createRelatorio(page);
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}$`));
  await expect(sumario(page)).toBeVisible({ timeout: 30_000 });

  // Each section's Sumário number (its Position box) is the template's; the automatic two land where the note says.
  const numberOf = async (type: string) =>
    sumario(page)
      .locator(`li.sum-row[data-row="${type}"]`)
      .first()
      .evaluate((li) => {
        const box = li.querySelector('.sum-pos');
        return box instanceof HTMLInputElement ? box.value : (box?.textContent ?? '');
      });
  for (const [type, number] of expected) expect(await numberOf(type), type).toBe(String(number));
  expect(await numberOf('section_7')).toBe(String(view.generatedNumbers.section_7));
  expect(await numberOf('section_9')).toBe(String(view.generatedNumbers.section_9));
});
