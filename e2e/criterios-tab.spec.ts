import { criteriaTablesView, currentCriterionText, SEEDED_CRITERIA, seededCriterionAppliesText } from '@app/domain';
import type { Page } from '@playwright/test';
import { kernelOf, openStep, testSection } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Story 27.6 (batch e27a, F10 of the 2026-11-21 pass), at 1280 px: Cadastros › Critérios de aceitação lists the
 * seeded criteria, each with when it applies, and every row of the ANSI/NETA MTS-2023 Tabela 100.1 and Tabela
 * 100.5 with their own line; then a v16 disjuntor whose plate reads TENSÃO NOMINAL 15 kV shows, on its insulation
 * test, a criterion the tab lists. Every row and sentence is the kernel's (`criteriaTablesView`).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

async function openCriterios(page: Page): Promise<void> {
  await page.getByRole('link', { name: /Cadastros/ }).click();
  await page.getByRole('tab', { name: 'Critérios de aceitação' }).click();
  await expect(page.getByRole('table').first()).toBeVisible({ timeout: 30_000 });
}

test('@p1 27.6-E2E-001 Critérios lists the seeded criteria and every row of the Tabelas 100.1 and 100.5, each with when it applies; a 15 kV disjuntor is judged by a row the tab lists', async ({ page }) => {
  test.setTimeout(180_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  await openCriterios(page);

  // The seeded criteria: each row with its criterion and its "when it applies" line.
  const seeded = page.getByRole('table').first();
  // Batch e30b (Story 30.3 (a)): the tab belongs to no relatório, so it writes the form of the current seed (v19), pinned here.
  expect(SEEDED_CRITERIA.map((criterion) => currentCriterionText(criterion))).toEqual(['> 400 MΩ', '< 250 µΩ', '± 0,5 %']);
  for (const criterion of SEEDED_CRITERIA) {
    const row = seeded.locator('tbody tr').filter({ hasText: criterion.label });
    await expect(row.locator('.cell-crit')).toHaveText(currentCriterionText(criterion));
    await expect(row.locator('[data-applies]')).toHaveText(seededCriterionAppliesText(criterion));
  }

  // The two tables: heading, applies line and every row, as the kernel composes them.
  const views = criteriaTablesView();
  for (const view of views) {
    const table = page.getByRole('table', { name: view.title });
    await expect(page.getByRole('heading', { level: 2, name: view.title })).toBeVisible();
    await expect(page.locator(`section[data-criteria-table="${view.key}"] .section-note[data-applies]`)).toHaveText(view.appliesText);
    await expect(table.locator('tbody tr')).toHaveCount(view.rows.length);
    for (const [i, row] of view.rows.entries()) {
      await expect(table.locator('tbody tr').nth(i).locator('td')).toHaveText([row.ratedText, row.testVoltageText, ...row.minimums]);
    }
  }
  await expect(page.locator('.registry-main').getByRole('button')).toHaveCount(0);

  // A v16 disjuntor whose plate reads 15 kV: its insulation criterion is a row the tab lists.
  const built = newRelatorioDrafts(account, { seedVersion: 'v16' });
  const breaker = built.sheets.find((sheet) => sheet.blockType === 'disjuntor_mt')!;
  await pushDrafts(page, database, [
    ...built.drafts,
    emCampoDraft(account, built.relatorioId),
    officeDraft(account, { relatorioId: built.relatorioId }, `sheet/${breaker.blockId}/nameplate/tensao_nominal`, '15'),
  ]);
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  await openStep(page, built.relatorioId, breaker.blockId, 'Ensaios');
  const insulation = (await kernelOf(page, database, built.relatorioId, breaker.blockId)).test('isolacao');
  const listed = views[0]!.rows.find((row) => row.ratedText === 'até 15 kV')!;
  expect(insulation.criterionText).toBe(listed.minimums[0]);
  // Each of the test's tables states its criterion: every one is the listed row's.
  const criteria = testSection(page, 'isolacao').locator('.mt-criterion');
  await expect(criteria.first()).toBeVisible();
  for (const text of await criteria.allTextContents()) expect(text).toContain(listed.minimums[0]!);
});
