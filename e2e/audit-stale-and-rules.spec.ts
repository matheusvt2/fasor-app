import type { Locator, Page } from '@playwright/test';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * 25.24-E2E (Story 25.24, M16 and the last part of M20): the Conferência por IA says when it is out
 * of date, and three checks are fixed rules. Driven as a person would through the real audit job of
 * the compose api under `LLM_PROVIDER=fake`. One relatório of the standard template (seed v15) is
 * seeded from an "office" device with the three cases: a breaker concluded Aprovado whose third
 * contact reading is out of its criterion, a second breaker with the same three readings in the same
 * order, and the transformer's secondary rated 380 V with its insulation row typed at 10 kV. The rules
 * list with no run; a tap runs the check; a reading changed afterwards marks the result out of date
 * (no run starts by itself); "Conferir de novo" runs it again and the mark goes. Values invented.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const FINDINGS = 'Pontos apontados pela conferência por IA';
const STALE = 'Conferência desatualizada: o relatório mudou depois dela.';
/** The api's queue pick-up and one fake call, then the dialog's pull. */
const AUDIT_TIMEOUT = 90_000;

const footButton = (page: Page) => page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' });
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Gerar relatório' });
const auditButton = (scope: Locator) => scope.getByRole('button', { name: /^(Conferir antes de emitir|Conferindo…)$/ });
const measured = (raw: string, unit: string) => ({ raw, unit, state: 'measured' });

interface RunRecord {
  entity: string;
  id: string;
  row: { status?: string; snapshot_seq?: number | null; created_at?: string };
}

const runsOnDevice = async (page: Page) => (await readStore<RunRecord>(page, database, 'entities')).filter((record) => record.entity === 'audit_run');

async function openDialog(page: Page, relatorioId: string): Promise<Locator> {
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await footButton(page).click();
  const modal = dialog(page);
  await expect(modal).toBeVisible();
  await expect(modal.getByText('Conferência por IA')).toBeVisible();
  return modal;
}

test('@p0 25.24-E2E-001 the three rules list with no run; a run, a reading changed, the mark, "Conferir de novo" and the mark goes; nothing runs by itself', async ({ page }) => {
  test.setTimeout(300_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);

  const { relatorioId, drafts, sheets } = newRelatorioDrafts(account);
  const breakers = sheets.filter((sheet) => sheet.blockType === 'disjuntor_mt');
  const transformer = sheets.find((sheet) => sheet.blockType === 'transformador_forca')!;
  expect(breakers.length).toBeGreaterThanOrEqual(2);
  const [first, second] = breakers as [(typeof breakers)[number], (typeof breakers)[number]];
  const put = (path: string, value: unknown) => officeDraft(account, { relatorioId }, path, value);
  const contact = (blockId: string) => ['45', '47', '5000'].map((raw, row) => put(`sheet/${blockId}/test/resistencia_contato/cell/${row}/0`, measured(raw, 'µΩ')));
  await pushDrafts(page, database, [
    ...drafts,
    emCampoDraft(account, relatorioId),
    ...contact(first.blockId),
    ...contact(second.blockId),
    put(`sheet/${first.blockId}/conclusion/result`, 'aprovado'),
    put(`sheet/${first.blockId}/conclusion/restriction`, 'sem_restricoes'),
    put(`sheet/${transformer.blockId}/nameplate/tensao_nominal_bt`, measured('380', 'V')),
    put(`sheet/${transformer.blockId}/test/isolacao/cell/2/5`, measured('10', 'kV')),
  ]);

  // The rules list before any run: each marked "Regra", none dimmed, no summary and no mark.
  let modal = await openDialog(page, relatorioId);
  const list = modal.getByRole('list', { name: FINDINGS });
  const rules = list.locator('li[data-rule="true"]');
  await expect(rules).toHaveCount(3, { timeout: 30_000 });
  await expect(rules.filter({ hasText: 'Resultado da ficha' })).toContainText(/^RegraFicha concluída Aprovado · Sem restrições\. A ficha exige no mínimo Reprovado/);
  await expect(rules.filter({ hasText: 'Valores repetidos' })).toContainText('os mesmos valores, na mesma ordem, em Disjuntor MT');
  await expect(rules.filter({ hasText: 'Valores repetidos' })).toContainText('(45 µΩ; 47 µΩ; 5.000 µΩ)');
  await expect(rules.filter({ hasText: 'Tensão de ensaio' })).toContainText('Tensão de ensaio acima do suportado pelo enrolamento Secundário (380 V): use 0,5 ou 1 kV.');
  for (let i = 0; i < 3; i++) await expect(rules.nth(i).locator('.e25-rule-word')).toHaveText('Regra');
  await expect(modal.getByText(STALE)).toHaveCount(0);
  await expect(modal.locator('.audit-summary')).toHaveCount(0);
  expect(await runsOnDevice(page)).toHaveLength(0);

  // A rule's "Ver" opens its sheet.
  const looser = rules.filter({ hasText: 'Resultado da ficha' });
  await looser.getByRole('button', { name: /^Ver / }).click();
  await expect(page).toHaveURL(new RegExp(`/ficha/${first.blockId}\\?volta=exportar$`));

  // One tap: the run's findings join the rules, and a run with nothing changed since carries no mark.
  modal = await openDialog(page, relatorioId);
  await auditButton(modal).click();
  await expect(modal.locator('.audit-summary')).toBeVisible({ timeout: AUDIT_TIMEOUT });
  await expect(auditButton(modal)).toHaveText('Conferir antes de emitir', { timeout: AUDIT_TIMEOUT });
  await expect(modal.getByText(STALE)).toHaveCount(0);
  const modelRows = list.locator('li:not([data-rule])');
  expect(await modelRows.count()).toBeGreaterThan(0);
  await expect(modal.locator('.audit-summary')).toContainText(`${3 + (await modelRows.count())} pontos para conferir`);
  await expect(rules).toHaveCount(3);
  const firstRuns = await runsOnDevice(page);
  expect(firstRuns).toHaveLength(1);
  expect(firstRuns[0]!.row.status).toBe('done');
  expect(typeof firstRuns[0]!.row.snapshot_seq).toBe('number');

  // A reading changed afterwards (from another device): the dialog marks the result, the old findings stay, dimmed.
  await pushDrafts(page, database, [put(`sheet/${transformer.blockId}/test/isolacao/cell/0/1`, measured('12', 'GΩ'))]);
  modal = await openDialog(page, relatorioId);
  await expect(modal.getByText(STALE)).toBeVisible({ timeout: 30_000 });
  await expect(modelRows.first()).toHaveClass(/e25-audit-old/);
  await expect(rules.first()).not.toHaveClass(/e25-audit-old/);
  // Nothing ran by itself: once the change was pulled and the dialog opened, the device still holds the one run, and the button waits for a tap.
  expect(await runsOnDevice(page)).toHaveLength(1);
  await expect(auditButton(modal)).toHaveText('Conferir antes de emitir');

  // "Conferir de novo" runs it again; when it finishes the mark goes.
  await modal.locator('.e25-audit-stale').getByRole('button', { name: 'Conferir de novo' }).click();
  await expect(modal.getByText(STALE)).toHaveCount(0, { timeout: AUDIT_TIMEOUT });
  await expect(auditButton(modal)).toHaveText('Conferir antes de emitir', { timeout: AUDIT_TIMEOUT });
  await expect(modelRows.first()).not.toHaveClass(/e25-audit-old/);
  await expect(rules).toHaveCount(3);
  const secondRuns = await runsOnDevice(page);
  expect(secondRuns).toHaveLength(2);
  const points = secondRuns.map((record) => record.row.snapshot_seq ?? 0).sort((a, b) => a - b);
  expect(points[1]!).toBeGreaterThan(points[0]!);
});
