import { templateRowSchema, type TemplateRow } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { pushNewRelatorio } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Story 11.3 (FR-14): "Salvar como template" in the Sumário header Overflow names the
 * template (prefilled with the obra's name), commits one company-scope `template/{id}`
 * create of the relatório's structure (the kernel's `templateFromRelatorio`: locations,
 * "Agrupar por tipo", each block's config and quantity per column, none of the relatório's
 * data), lists it in /templates, and "Desfazer" removes it (11.3-UNDO). A block moved first
 * counts in its new column (11.3-AFTER-MOVE).
 */

const toast = (page: Page) => page.getByTestId('toast');
const tree = (page: Page) => page.getByRole('list', { name: 'Locais do relatório' });
const coluna = (page: Page, name: string) => page.locator('li.s9-coluna').filter({ has: page.locator(':scope > .s9-col .s9-col-name', { hasText: new RegExp(`^${name}$`) }) });
const tagsIn = (li: Locator) => li.locator(':scope > .s9-eqs > li.s9-eq .block-tag');
const activeList = (page: Page) => page.getByRole('list', { name: 'Templates ativos' });
const names = (list: Locator) => list.locator('.rr-primary');

interface OutboxOp {
  path: string;
  kind: string;
  value: unknown;
}

async function openRelatorio(page: Page, account: SeedAccount): Promise<string> {
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const { relatorioId } = await pushNewRelatorio(page, account, deviceDatabaseName(account.userId));
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  return relatorioId;
}

/** "Salvar como template" from the header Overflow, naming it `name`. */
async function saveAsTemplate(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Mais opções do relatório' }).click();
  const labels = await page.getByRole('menu').getByRole('menuitem').allTextContents();
  // `40-relatorio-overview.html` `#sum-menu-rel`: right after "Restaurar ficha removida".
  expect(labels[labels.indexOf('Restaurar ficha removida') + 1]).toBe('Salvar como template');
  await page.getByRole('menuitem', { name: 'Salvar como template' }).click();
  const dialog = page.getByRole('dialog', { name: 'Salvar como template' });
  const field = dialog.getByRole('textbox', { name: 'Nome do template' });
  await expect(field).toHaveValue('Obra da árvore');
  await field.fill('   ');
  await expect(dialog.getByRole('button', { name: 'Salvar', exact: true })).toHaveAttribute('aria-disabled', 'true');
  await expect(dialog.getByText('Salvar: falta o nome')).toBeVisible();
  await field.fill(name);
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(toast(page)).toContainText(`Template ${name} salvo`);
}

async function templateCreates(page: Page, account: SeedAccount): Promise<TemplateRow[]> {
  const ops = await readStore<OutboxOp>(page, deviceDatabaseName(account.userId), 'outbox');
  return ops.filter((op) => op.kind === 'create' && op.path.startsWith('template/')).map((op) => templateRowSchema.parse(op.value));
}

/** Back to Home as a person would (the Sumário has no Templates link), then its "Templates" link. */
async function openTemplates(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('group', { name: 'Relatórios por status' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('link', { name: /Templates/ }).click();
  await expect(page).toHaveURL(/\/templates$/);
}

test('@p0 11.3-E2E-001 "Salvar como template" from the Sumário header: one template create carrying the structure and no data, listed in /templates', async ({ page, seed }) => {
  test.setTimeout(120_000);
  const account = seed.companies[1];
  await openRelatorio(page, account);
  await saveAsTemplate(page, 'Modelo da árvore');

  const creates = await templateCreates(page, account);
  expect(creates).toHaveLength(1);
  const template = creates[0]!;
  expect(template).toMatchObject({ name: 'Modelo da árvore', version: 1, archived_at: null, removed_at: null });
  expect(template.skeleton.filter((node) => node.kind === 'cabine')).toHaveLength(6);
  expect(template.skeleton.filter((node) => node.kind === 'coluna')).toHaveLength(17);
  expect(template.skeleton.find((node) => node.name === '1° Subsolo')).toMatchObject({ kind: 'cabine', agrupar_por_tipo: true });
  expect(template.blocks.filter((block) => block.skeleton_location_ref !== null).reduce((sum, block) => sum + block.quantity, 0)).toBe(94);
  const text = JSON.stringify(template);
  expect(text).not.toContain('SEC-C05');
  expect(text).not.toContain('equipment_id');
  expect(text).not.toContain('sheet');

  await openTemplates(page);
  await expect(names(activeList(page))).toContainText(['Modelo da árvore']);
});

test('@p0 11.3-E2E-002 11.3-UNDO: "Desfazer" on the toast removes the saved template from /templates', async ({ page, seed }) => {
  test.setTimeout(120_000);
  const account = seed.companies[1];
  await openRelatorio(page, account);
  await saveAsTemplate(page, 'Modelo desfeito');
  const [template] = await templateCreates(page, account);
  await toast(page).getByRole('button', { name: 'Desfazer' }).click();
  await expect
    .poll(async () => {
      const records = await readStore<{ entity: string; id: string; row: TemplateRow }>(page, deviceDatabaseName(account.userId), 'entities');
      return records.find((record) => record.entity === 'template' && record.id === template!.id)?.row.removed_at ?? null;
    })
    .not.toBeNull();
  // The focus is back on the header's Overflow trigger.
  await expect(page.getByRole('button', { name: 'Mais opções do relatório' })).toBeFocused();
  await openTemplates(page);
  await expect(names(activeList(page)).first()).toBeVisible();
  await expect(names(activeList(page))).not.toContainText(['Modelo desfeito']);
});

test('@p1 11.3-E2E-003 11.3-AFTER-MOVE: SEC-C05 moved to Coluna 9, then saved: the composer shows one seccionadora in Coluna 9', async ({ page, seed }) => {
  test.setTimeout(150_000);
  const account = seed.companies[1];
  await openRelatorio(page, account);
  await page.getByRole('button', { name: 'Expandir ou recolher a seção 9' }).click();
  await expect(tree(page)).toBeVisible();
  await page.getByRole('button', { name: 'Expandir 1° Subsolo' }).click();
  await page.getByRole('button', { name: 'Mais opções de SEC-C05', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Mover para…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Mover SEC-C05 para…' });
  await dialog.getByRole('radio', { name: '1° Subsolo › Coluna 9', exact: true }).click();
  await dialog.getByRole('button', { name: 'Mover', exact: true }).click();
  await expect(tagsIn(coluna(page, 'Coluna 9'))).toHaveText(['SEC-C05']);

  await saveAsTemplate(page, 'Modelo movido');
  const [template] = await templateCreates(page, account);
  const col9 = template!.skeleton.find((node) => node.name === 'Coluna 9')!;
  expect(template!.blocks.filter((block) => block.skeleton_location_ref === col9.ref)).toMatchObject([{ block_type: 'chave_seccionadora', quantity: 1 }]);

  await openTemplates(page);
  await page.getByRole('button', { name: 'Abrir template Modelo movido', exact: true }).click();
  await expect(page).toHaveURL(/\/templates\/[0-9a-f-]{36}$/);
  await page.getByRole('button', { name: /^Coluna 9/ }).click();
  await expect(page.locator('.column-row.is-open .col-body').getByRole('group', { name: 'Seccionadoras, 1' })).toBeVisible();
});
