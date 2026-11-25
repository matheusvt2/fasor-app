import { EMPTY_DEFINITION_CONTEXT, instantiateTemplate, standardTemplate, type EquipmentRow, type OpDraft } from '@app/domain';
import type { Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { deviceDatabaseName, expect, horizontalOverflow, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { confirmIssue, setParecer } from './support/relatorio-flow.ts';
import { newRelatorioDrafts, pushDrafts, pushNewRelatorio } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { waitForCompanyPull } from './support/sync.ts';
import { expandLocation } from './support/tree.ts';

/*
 * Story 30.1 (the open-work audit of 2026-11-24): the app fixes driven as a person would. B, a
 * setup field keeps every key typed while its earlier commit echoes back (on a slowed CPU); C, a
 * server refusal `409 pre_issue_blocked` names its blocking rows in the Gerar dialog with "Ver no
 * sumário"; E, a 40-character TAG on the phone Sumário stays whole with no sideways scroll; K, the
 * TAG the palette suggests after a local holding numbered equipment was removed.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  // This worker's Empresa B (E6-Q7): its company, its user and its device database.
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

interface EntityRecord<T = Record<string, unknown>> {
  entity: string;
  id: string;
  row: T;
}
interface OutboxRow {
  kind: string;
  path: string;
  value: unknown;
}

const tree = (page: Page) => page.getByRole('list', { name: 'Locais do relatório' });
const sumario = (page: Page) => page.getByRole('list', { name: 'Sumário do relatório' });

async function openSumario(page: Page, relatorioId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(sumario(page).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
}

async function openSection9(page: Page): Promise<void> {
  const chevron = page.getByRole('button', { name: /^Expandir ou recolher a seção \d+$/ });
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expect(tree(page)).toBeVisible();
}

test('@p0 30.1-E2E-B a setup text field keeps the keys typed while its first commit echoes back, on a slowed CPU', async ({ page }) => {
  test.setTimeout(120_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 768, height: 1000 });
  await signIn(page, account.email);
  const { relatorioId } = await pushNewRelatorio(page, account, database);
  await page.goto(`/relatorio/${relatorioId}/setup?etapa=2`);
  const field = page.getByLabel('Local', { exact: true });
  await expect(field).toBeVisible({ timeout: 30_000 });
  // A slow tablet: the idle commit's echo comes back through the live query while the next keys are typed.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  try {
    await field.click();
    await field.pressSequentially('da Torre');
    // Past the 500 ms idle: "da Torre" commits, and its echo is on the way.
    await page.waitForTimeout(550);
    await field.pressSequentially(' Norte, bloco B', { delay: 40 });
    await expect(field).toHaveValue('da Torre Norte, bloco B');
    await field.blur();
  } finally {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  }
  await expect(field).toHaveValue('da Torre Norte, bloco B');
  // Committed: the last put of the field is the whole text.
  await expect
    .poll(async () => (await readStore<OutboxRow>(page, database, 'outbox')).filter((op) => op.path === 'relatorio/setup/local').map((op) => op.value).at(-1), { timeout: 10_000 })
    .toBe('da Torre Norte, bloco B');
  await page.reload();
  await expect(page.getByLabel('Local', { exact: true })).toHaveValue('da Torre Norte, bloco B', { timeout: 30_000 });
});

for (const width of [390, 1280]) {
  test(`@p0 30.1-E2E-C at ${width}: a server refusal "pre_issue_blocked" names the blocking row in the Gerar dialog, and "Ver no sumário" marks its row`, async ({ page }) => {
    test.setTimeout(120_000);
    await resetEmpresaB(account, { standard: true });
    await page.setViewportSize({ width, height: 900 });
    await signIn(page, account.email);
    const { relatorioId } = await pushNewRelatorio(page, account, database, { emCampo: true });
    // The server found a blocking row this device does not hold (the device's parecer reads as set here).
    let asked = 0;
    await page.route(`**/api/relatorios/${relatorioId}/generate`, async (route) => {
      asked += 1;
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'pre_issue_blocked', message: 'A blocking pre-issue row stands; the revision cannot be issued.', details: { rows: ['conclusion_stale'] } }),
      });
    });
    // Nothing is judged, so the parecer is tapped first (e22f S5): this device then holds no blocking row.
    await setParecer(page, relatorioId);
    await openSumario(page, relatorioId);
    const dialog = page.getByRole('dialog', { name: 'Gerar relatório' });
    await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
    await dialog.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' }).click();
    // F-03: the empty sheets are asked about first.
    await confirmIssue(dialog);
    const alert = dialog.getByRole('alert');
    await expect(alert).toContainText('Não foi possível gerar o relatório.', { timeout: 30_000 });
    await expect(alert.locator('li.is-blocking')).toHaveText(['Texto de conclusão desatualizado']);
    await expect(dialog.locator('.btn-reason', { hasText: /^Atualize/ })).toHaveText('Atualize o texto da conclusão para emitir a revisão 1. O rascunho pode ser visto antes.');
    expect(asked).toBe(1);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `test-results/e30a/30.1-E2E-C-${width}.png` });
    await alert.getByRole('button', { name: 'Ver no sumário' }).click();
    await expect(dialog).toBeHidden();
    // Section 9's row (the sheets) is marked on the Sumário.
    await expect(sumario(page).locator('.sum-row.sum-s9')).toHaveClass(/is-highlighted/);
  });
}

test('@p0 30.1-E2E-E at 390: a TAG of 40 characters stays whole on the phone Sumário, with no sideways scroll', async ({ page }) => {
  test.setTimeout(120_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, account.email);
  const LONG = 'CE-ENEL-ALIMENTACAO-PRINCIPAL-SUBESTACAO';
  expect(LONG).toHaveLength(40);
  const seeded = newRelatorioDrafts(account);
  const drafts: OpDraft[] = seeded.drafts.map((draft) =>
    draft.kind === 'create' && draft.path.startsWith('equipment/') && (draft.value as unknown as EquipmentRow).tag === 'CE-ENEL'
      ? { ...draft, value: { ...(draft.value as Record<string, unknown>), tag: LONG } as OpDraft['value'] }
      : draft,
  );
  await pushDrafts(page, database, drafts);
  await openSumario(page, seeded.relatorioId);
  await openSection9(page);
  await expandLocation(page, 'Cubículo Enel');
  const tag = page.locator('li.s9-eq .block-tag', { hasText: LONG });
  await expect(tag).toBeVisible();
  // Nothing scrolls sideways, and the whole TAG lies inside the page.
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  const box = (await tag.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await tag.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  expect(await tag.evaluate((el) => (el.textContent ?? '').replace(/\s/g, ''))).toBe(LONG);
  // A TAG that fits keeps the F-07 rule: one line.
  const short = page.locator('li.s9-eq .block-tag', { hasText: /^PR-ENEL$/ }).first();
  if ((await short.count()) > 0) {
    const lineHeight = await short.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
    expect((await short.boundingBox())!.height).toBeLessThan(lineHeight * 1.5);
  }
  await page.screenshot({ path: 'test-results/e30a/30.1-E2E-E-390.png', fullPage: false });
});

test('@p1 30.1-E2E-K after a local holding numbered equipment is removed, the palette suggests the lowest number it freed', async ({ page }) => {
  test.setTimeout(180_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  // The standard template with today's TAG rule (PREFIX-NN), pushed from the office.
  const projectId = newId();
  const project: OpDraft = {
    kind: 'create',
    scope: 'company',
    company_id: account.companyId,
    project_id: null,
    relatorio_id: null,
    path: `project/${projectId}`,
    value: { id: projectId, client_id: null, name: 'Obra das TAGs', site: 'Obra das TAGs', removed_at: null },
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: account.userId,
  };
  const { relatorioId, drafts } = instantiateTemplate(
    standardTemplate({ id: newId() }),
    { id: projectId },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
    { newId, actorId: account.userId, companyId: account.companyId },
  );
  const rows = (prefix: string) => drafts.filter((draft) => draft.kind === 'create' && draft.path.startsWith(prefix)).map((draft) => draft.value as unknown as Record<string, unknown>);
  const locations = rows('location/');
  const rootOf = (id: string): Record<string, unknown> => {
    const row = locations.find((one) => one.id === id)!;
    return row.parent_id === null ? row : rootOf(row.parent_id as string);
  };
  const equipment = new Map(rows('equipment/').map((row) => [row.id as string, row.tag as string]));
  const sheets = rows('block/').filter((row) => row.equipment_id !== null && row.location_id !== null);
  const djSheet = sheets.find((row) => equipment.get(row.equipment_id as string) === 'DJ-01')!;
  const removedLocal = rootOf(djSheet.location_id as string);
  const keptLocal = locations.find((row) => row.parent_id === null && row.id !== removedLocal.id)!;
  // The DJ numbers the other locals keep; the lowest one free once the local is gone.
  const kept = new Set(sheets.filter((row) => rootOf(row.location_id as string).id !== removedLocal.id).map((row) => equipment.get(row.equipment_id as string)!));
  let n = 1;
  while (kept.has(`DJ-${String(n).padStart(2, '0')}`)) n += 1;
  const expected = `DJ-${String(n).padStart(2, '0')}`;
  await pushDrafts(page, database, [project, ...drafts]);
  await openSumario(page, relatorioId);
  await waitForCompanyPull(page, database);
  await openSection9(page);

  const removedName = removedLocal.name as string;
  const keptName = keptLocal.name as string;
  const palette = page.getByRole('dialog', { name: 'Adicionar bloco' });
  const type = palette.locator('.pf-office').filter({ hasText: 'Disjuntor MT' });
  // Before: DJ-01 is held, so the palette offers a later number.
  await expandLocation(page, keptName);
  await page.getByRole('button', { name: `Adicionar bloco em ${keptName}`, exact: true }).click();
  await type.locator('.palette-item').click();
  await expect(type.getByRole('textbox', { name: 'TAG' })).not.toHaveValue('DJ-01');
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();
  await page.getByRole('button', { name: `Mais opções de ${removedName}`, exact: true }).click();
  await page.getByRole('menuitem', { name: 'Remover', exact: true }).click();
  await page.getByRole('dialog', { name: `Remover ${removedName}?`, exact: true }).getByRole('button', { name: 'Remover local', exact: true }).click();
  await expect(tree(page).locator(':scope > li.s9-local').filter({ hasText: removedName })).toHaveCount(0);
  // The removal tombstoned the equipment it freed, DJ-01 among it.
  await expect
    .poll(async () => (await readStore<EntityRecord<EquipmentRow>>(page, database, 'entities')).find((record) => record.entity === 'equipment' && record.row.tag === 'DJ-01')?.row.removed_at ?? null, { timeout: 10_000 })
    .not.toBeNull();

  await expandLocation(page, keptName);
  await page.getByRole('button', { name: `Adicionar bloco em ${keptName}`, exact: true }).click();
  await type.locator('.palette-item').click();
  await expect(type.getByRole('textbox', { name: 'TAG' })).toHaveValue(expected);
  expect(expected).toBe('DJ-01');
});
