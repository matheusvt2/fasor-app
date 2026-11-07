import {
  blockTypeLabel,
  duplicateSeededType,
  getDefinition,
  initialOrderKey,
  newEquipmentBlock,
  publishedText,
  SEED_VERSION,
  type BlockRow,
  type EquipmentRow,
  type LocationRow,
  type MeasurementTest,
} from '@app/domain';
import type { Page, Route } from '@playwright/test';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { newId } from '../apps/api/src/ids.ts';
import { duplicateLibraryType, editorTab, openTypeList, publishButton, typeInto } from './support/company-type.ts';
import { escapeDialog } from './support/dialogs.ts';
import { downloadBytes, downloadFrom } from './support/download.ts';
import { signInForDurability, waitForShellCache } from './support/durability.ts';
import { addLocal } from './support/local.ts';
import { deviceDatabaseName, expect, test } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { confirmIssue, createProjectFromHome, createRelatorio, setParecer } from './support/relatorio-flow.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNow, syncNowAndReturn } from './support/sync.ts';

/*
 * Story 14.8 in the durability matrix (desktop Chrome, Android Chrome emulation, WebKit), against
 * the built bundle, its DoD end to end: the library CTA is duplicated in Templates › "Tipos de
 * equipamento", one criterion (the insulation minimum) and one checklist item are changed, and the
 * copy is published as v1; a template places it beside a transformer; a relatório created from the
 * template (R1) takes v1; its company sheet is filled offline (the item marked, a reading below the
 * new minimum), survives a reload made before any sync, syncs, and generates a DOCX whose section
 * 9 prints the sheet under "Outros equipamentos" after Transformadores with the edited item and
 * the reading. Then the type is renamed and published as v2: a relatório created afterwards (R2)
 * takes v2's name, R1 keeps v1's, and a relatório created from the library CTA before any of it
 * (R0) is unchanged. It generates through the one queue and LibreOffice of the api, so the file is
 * in the serial group (`e2e/support/groups.ts`). Empresa B is this worker's own (E6-Q7).
 */

interface EntityRecord<T> {
  entity: string;
  id: string;
  row: T;
}
interface OutboxRow {
  path: string;
  value: unknown;
  status: string;
}

const CTA = 'chave_transferencia_automatica' as const;
const CTA_NAME = blockTypeLabel(SEED_VERSION, CTA);
const E2 = 'cta_isolamento_principal';
const DEFINITION = getDefinition(SEED_VERSION, 'cabine_primaria', CTA);
const e2 = (): MeasurementTest => DEFINITION.measurement_tests!.find((test) => test.key === E2)!;
const E2_ROW = e2().rows.findIndex((row) => row.key === 'a_t');
const E2_COL = e2().columns.findIndex((column) => column.key === 'normal_fechada');
const NAME_V1 = 'No-break de comando';
const NAME_V2 = 'No-break de comando 125 V';
const ITEM_TEXT = 'Placa do no-break confere com o projeto';
const LOCAL = 'Geradores';
const OUTROS = 'Outros equipamentos';
const NEW_TEMPLATE = 'Novo template';
const JOB_TIMEOUT = 150_000;
const ISOLATION = duplicateSeededType(SEED_VERSION, CTA).draft.criteria.find((criterion) => criterion.key === 'isolacao')!;

const toast = (page: Page) => page.getByTestId('toast');
const palette = (page: Page) => page.getByRole('complementary', { name: 'Paleta de blocos' });
const localCard = (page: Page, name: string) =>
  page.getByRole('list', { name: 'Locais do template' }).locator(':scope > li.local-card').filter({ has: page.locator(':scope > .block-body .block-name', { hasText: new RegExp(`^${name}$`) }) });
const sheetTitle = (page: Page) => page.locator('.sheet-header .sheet-title');
const cellInput = (page: Page) => page.locator(`input[data-cell-input="${E2}:${E2_ROW}:${E2_COL}"]`).filter({ visible: true });

async function openSheet(page: Page, relatorioId: string, blockId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(sheetTitle(page)).toBeVisible({ timeout: 30_000 });
}

/** The company block of a relatório, its TAG and the version its config names, as the device holds them. */
async function companyBlockOf(page: Page, database: string, relatorioId: string, typeId: string): Promise<{ blockId: string; tag: string; typeVersion: number | undefined; locationId: string | null }> {
  let found: { blockId: string; tag: string; typeVersion: number | undefined; locationId: string | null } | undefined;
  await expect
    .poll(async () => {
      const records = await readStore<EntityRecord<BlockRow | EquipmentRow>>(page, database, 'entities');
      const block = records.find((record) => record.entity === 'block' && (record.row as BlockRow).relatorio_id === relatorioId && (record.row as BlockRow).block_type === `type:${typeId}`)?.row as BlockRow | undefined;
      if (block === undefined) return false;
      const tag = (records.find((record) => record.entity === 'equipment' && record.id === block.equipment_id)?.row as EquipmentRow | undefined)?.tag ?? '';
      found = { blockId: block.id, tag, typeVersion: (block.config as { type_version?: number }).type_version, locationId: block.location_id };
      return true;
    })
    .toBe(true);
  return found!;
}

/** Templates › "Novo template": its composer, and its id. */
async function openNewTemplate(page: Page): Promise<string> {
  await page.goto('/templates');
  await page.getByRole('button', { name: 'Novo template' }).click();
  await expect(page).toHaveURL(/\/templates\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('textbox', { name: 'Nome do template' })).toHaveValue(NEW_TEMPLATE);
  return new URL(page.url()).pathname.split('/')[2]!;
}

test('@p0 14.8-E2E-001 a copy of the library CTA with one criterion and one item changed is published, placed in a template and filled offline in a relatório; the reload keeps it, the sync lands it, the DOCX prints it under "Outros equipamentos"; after v2 the earlier relatório keeps v1 and a CTA relatório from before is unchanged', async ({
  page,
  context,
  seed,
  browserName,
}) => {
  test.setTimeout(600_000);
  const account = seed.companies[1];
  const database = deviceDatabaseName(account.userId);
  const outbox = () => readStore<OutboxRow>(page, database, 'outbox');
  const written = async (path: string) => (await outbox()).filter((row) => row.path === path).map((row) => row.value);
  await resetEmpresaB(account);
  await signInForDurability(page, context, account.email);
  await waitForShellCache(page);

  // --- R0: a relatório with a library CTA, created before any company type (office ops) ---
  const r0 = newRelatorioDrafts(account);
  const geradores = r0.drafts.find((draft) => draft.kind === 'create' && draft.path.startsWith('location/') && (draft.value as { name?: string }).name === 'Geradores')!.value as { id: string };
  const r0Pair = newEquipmentBlock({
    blockId: newId(),
    equipmentId: newId(),
    relatorioId: r0.relatorioId,
    projectId: r0.projectId,
    locationId: geradores.id,
    type: CTA,
    tag: 'CTA-ANTES',
    seedVersion: SEED_VERSION,
    orderKey: initialOrderKey(999),
  });
  await pushDrafts(page, database, [
    ...r0.drafts,
    emCampoDraft(account, r0.relatorioId),
    officeDraft(account, { projectId: r0.projectId }, `equipment/${r0Pair.equipment.id}`, r0Pair.equipment, 'create'),
    officeDraft(account, { relatorioId: r0.relatorioId }, `block/${r0Pair.block.id}`, r0Pair.block, 'create'),
  ]);

  // --- the type: "Duplicar" of the library CTA, renamed, one criterion and one item changed, published as v1 ---
  await openTypeList(page);
  const typeId = await duplicateLibraryType(page, CTA);
  await typeInto(page.getByRole('textbox', { name: 'Nome do tipo' }), NAME_V1);
  await typeInto(page.getByRole('textbox', { name: 'Prefixo da TAG' }), 'NB');
  await typeInto(page.getByRole('textbox', { name: 'Nome no singular' }), 'no-break');
  await typeInto(page.getByRole('textbox', { name: 'Nome no plural' }), 'no-breaks');
  await page.getByRole('radio', { name: 'Masculino (o)' }).click();
  await editorTab(page, 'Verificações');
  await page.getByRole('list', { name: 'Itens de verificação' }).locator('li.registry-row').first().locator('button.rr-text').click();
  await typeInto(page.getByRole('textbox', { name: 'Texto do item' }), ITEM_TEXT);
  await editorTab(page, 'Critérios');
  await typeInto(page.getByRole('textbox', { name: `Valor de ${ISOLATION.label}`, exact: true }), '500');
  await expect.poll(async () => ((await written(`equipment_type/${typeId}/draft`)).at(-1) as { criteria?: { key: string; value: number }[] } | undefined)?.criteria?.find((c) => c.key === 'isolacao')?.value).toBe(500);
  await publishButton(page).click();
  await expect(toast(page)).toHaveText(publishedText(1));
  await expect(page.locator('.tipo-head .status-pill')).toHaveText('Publicado · versão 1');
  await syncNow(page);

  // --- the template: one local holding a transformer and, from "Outros equipamentos", the company type ---
  const templateId = await openNewTemplate(page);
  await addLocal(page, { funcao: 'Distribuição', name: LOCAL });
  await expect(localCard(page, LOCAL)).toHaveCount(1);
  await palette(page).getByRole('group', { name: 'Transformadores, 0' }).getByRole('button', { name: 'Mais um' }).click();
  const companyStepper = palette(page).locator('.palette-item.is-stepper', { hasText: NAME_V1 });
  await expect(companyStepper.locator('.pi-meta')).not.toContainText('versão');
  await palette(page).getByRole('group', { name: 'No-breaks, 0' }).getByRole('button', { name: 'Mais um' }).click();
  // Placed, the palette row says the version the template records (AD-21 item 5).
  await expect(companyStepper.locator('.pi-meta')).toContainText('versão 1');
  const direct = localCard(page, LOCAL).locator(':scope > .block-expand > .loc-direct');
  await expect(direct.getByRole('group', { name: 'No-breaks, 1' })).toBeVisible();
  await expect(direct.locator(`.qty-row[data-type="type:${typeId}"] .qty-name`)).toHaveText(`${NAME_V1} · versão 1`);
  await expect(page.locator('.composer-meta')).toHaveText('1 trafo · 1 no-break');
  await expect
    .poll(async () => {
      const records = await readStore<EntityRecord<{ blocks: { block_type: string; type_version?: number; quantity: number }[] }>>(page, database, 'entities');
      return records.find((record) => record.entity === 'template' && record.id === templateId)?.row.blocks.filter((block) => block.block_type === `type:${typeId}`).map((block) => [block.quantity, block.type_version]);
    })
    .toEqual([[1, 1]]);
  await syncNow(page);

  // --- R1 from it: the company block is born at v1, named by v1 ---
  await page.goto('/');
  await expect(page.locator('.shortcut-sub', { hasText: '1 template' })).toBeVisible({ timeout: 30_000 });
  await createProjectFromHome(page);
  const projectUrl = page.url();
  const r1 = await createRelatorio(page, { template: NEW_TEMPLATE });
  const r1Block = await companyBlockOf(page, database, r1, typeId);
  expect(r1Block.typeVersion).toBe(1);
  expect(r1Block.tag).toMatch(/^NB-/);
  // No field surface leads to the type editor (UX-DR70).
  await expect(page.locator('a[href*="/templates/tipos"]')).toHaveCount(0);

  // The office groups the local by type, so section 9 prints its group titles, and fills its own fields.
  await syncNowAndReturn(page);
  const records = await readStore<EntityRecord<LocationRow>>(page, database, 'entities');
  const local = records.find((record) => record.entity === 'location' && record.row.relatorio_id === r1 && record.row.kind === 'cabine')!.row;
  const measured = (raw: string, unit: string) => ({ raw, unit, state: 'measured' });
  await pushDrafts(page, database, [
    officeDraft(account, { relatorioId: r1 }, `location/${local.id}/agrupar_por_tipo`, true),
    officeDraft(account, { relatorioId: r1 }, `location/${local.id}/se/type`, 'BLINDADA'),
    officeDraft(account, { relatorioId: r1 }, `location/${local.id}/se/primary_kv`, measured('13.8', 'kV')),
    officeDraft(account, { relatorioId: r1 }, `location/${local.id}/se/secondary_kv`, measured('380', 'V')),
    officeDraft(account, { relatorioId: r1 }, `location/${local.id}/se/installed_kva`, measured('1500', 'kVA')),
    officeDraft(account, { relatorioId: r1 }, `location/${local.id}/env/temperature_c`, measured('25', '°C')),
    officeDraft(account, { relatorioId: r1 }, `location/${local.id}/env/humidity_pct`, measured('65', '%')),
  ]);
  await syncNowAndReturn(page);

  // --- the company sheet, filled offline: the edited item marked C, a reading below the new minimum ---
  await openSheet(page, r1, r1Block.blockId);
  await expect(sheetTitle(page)).toContainText(NAME_V1);
  await context.setOffline(true);
  // In MT the CTA's E2 is judged by the type's insulation criterion, the one edited to 500 MΩ (in BT by its own).
  const configuracao = page.locator('section[data-section="configuracao"]');
  await configuracao.getByRole('radiogroup', { name: 'Tensão' }).getByRole('radio', { name: 'MT', exact: true }).click();
  await expect(configuracao.getByRole('radiogroup', { name: 'Tensão' }).getByRole('radio', { name: 'MT', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator(`.lib-test[data-test-key="${E2}"] .mt-criterion`).first()).toContainText('500 MΩ');
  const item = page.locator('#ficha-step-verificacoes li.checklist-row').first();
  await expect(item).toContainText(ITEM_TEXT);
  await item.getByRole('radio', { name: 'Conforme', exact: true }).click();
  await expect(item.getByRole('radio', { name: 'Conforme', exact: true })).toHaveAttribute('aria-checked', 'true');
  const firstItemKey = DEFINITION.checklist![0]!.key;
  await expect.poll(() => written(`sheet/${r1Block.blockId}/checklist/${firstItemKey}/result`)).toEqual(['C']);
  const input = cellInput(page);
  await input.scrollIntoViewIfNeeded();
  await input.click();
  await page.keyboard.type('450');
  await page.keyboard.press('Tab');
  const cellPath = `sheet/${r1Block.blockId}/test/${E2}/cell/${E2_ROW}/${E2_COL}`;
  await expect.poll(() => written(cellPath)).toEqual([{ raw: '450', unit: 'MΩ', state: 'measured' }]);

  // Playwright's WebKit cuts the network below the service worker (`cta.durability.spec.ts`): there
  // the reload runs online with every sync request refused, which keeps the ops in the outbox.
  const isSync = (url: URL) => url.pathname.startsWith('/api/sync');
  const refuseSync = (route: Route) => route.abort('internetdisconnected');
  if (browserName === 'webkit') {
    await page.route(isSync, refuseSync);
    await context.setOffline(false);
  }
  await page.reload();
  await expect(sheetTitle(page)).toContainText(NAME_V1, { timeout: 30_000 });
  await expect(cellInput(page)).toHaveValue('450');
  await expect(page.locator('#ficha-step-verificacoes li.checklist-row').first().getByRole('radio', { name: 'Conforme', exact: true })).toHaveAttribute('aria-checked', 'true');
  expect(await written(cellPath)).toEqual([{ raw: '450', unit: 'MΩ', state: 'measured' }]);

  // --- back online: sync, generate, read the DOCX ---
  if (browserName === 'webkit') await page.unroute(isSync, refuseSync);
  await context.setOffline(false);
  await page.goto(`/relatorio/${r1}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await syncNowAndReturn(page);
  await expect.poll(async () => [...new Set((await outbox()).filter((row) => row.path.startsWith(`sheet/${r1Block.blockId}`)).map((row) => row.status))]).toEqual(['acked']);
  await setParecer(page, r1);
  const modal = page.getByRole('dialog', { name: 'Gerar relatório' });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await expect(modal).toBeVisible();
  const generate = modal.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' });
  await expect(generate).toBeEnabled({ timeout: 30_000 });
  await generate.click();
  await confirmIssue(modal);
  await expect(toast(page)).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
  const download = await downloadFrom(page, () => modal.getByRole('button', { name: 'DOCX — abrir no Word' }).click());
  const structure = extractStructure(await downloadBytes(download));
  await escapeDialog(page, modal);

  const level1 = structure.headings.filter((h) => h.level === 1).map((h) => h.text);
  const tests = level1.find((heading) => /^\d+ RELATÓRIOS DOS ENSAIOS$/.test(heading));
  expect(tests, JSON.stringify(level1)).toBeDefined();
  const number = tests!.split(' ')[0]!;
  const next = level1[level1.indexOf(tests!) + 1];
  const from = structure.paragraphs.lastIndexOf(tests!);
  const to = next === undefined ? structure.paragraphs.length : structure.paragraphs.lastIndexOf(next);
  const section = structure.paragraphs.slice(from, to);
  const level2 = structure.headings.filter((h) => h.level === 2 && h.text.startsWith(`${number}.`)).map((h) => h.text);
  expect(level2, JSON.stringify(level2)).toHaveLength(2);
  expect(level2[0]).toMatch(new RegExp(`^${number}\\.1 Transformadores`));
  expect(level2[1]).toMatch(new RegExp(`^${number}\\.2 ${OUTROS}`));
  const companyTitle = `${NAME_V1.toUpperCase()} ${r1Block.tag}`;
  const order = [level2[0]!, level2[1]!, companyTitle].map((part) => section.indexOf(part));
  expect(order.every((index) => index > -1), `every part of section 9 is printed: ${JSON.stringify(order)}`).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  const titled = (title: RegExp) => structure.tables.filter((table) => title.test(table[0]?.[0] ?? ''));
  const checklist = titled(/^VERIFICAÇÕES GERAIS$/).find((table) => table[2]?.[0] === `1. ${ITEM_TEXT.toUpperCase()}`);
  expect(checklist, 'the edited item prints in the sheet\'s checklist').toBeDefined();
  expect(checklist![2]![1]).toBe('X');
  const e2Table = titled(/ISOLAMENTO PRINCIPAL$/);
  expect(e2Table.length).toBeGreaterThan(0);
  expect(e2Table.flat(2)).toContain('450');

  // --- v2: the type renamed and published again; R1 keeps v1, a relatório created now takes v2 ---
  await page.goto(`/templates/tipos/${typeId}`);
  await expect(page.locator('.tipo-head h2')).toHaveText(NAME_V1, { timeout: 30_000 });
  await typeInto(page.getByRole('textbox', { name: 'Nome do tipo' }), NAME_V2);
  await expect(publishButton(page)).toHaveText('Publicar versão 2');
  await publishButton(page).click();
  await expect(toast(page)).toHaveText(publishedText(2));
  await syncNow(page);

  await page.goto(projectUrl);
  await page.getByRole('button', { name: 'Novo relatório a partir de template' }).first().click();
  const r2 = await createRelatorio(page, { template: NEW_TEMPLATE });
  const r2Block = await companyBlockOf(page, database, r2, typeId);
  expect(r2Block.typeVersion).toBe(2);
  await openSheet(page, r2, r2Block.blockId);
  await expect(sheetTitle(page)).toContainText(NAME_V2);
  await openSheet(page, r1, r1Block.blockId);
  await expect(sheetTitle(page)).toContainText(NAME_V1);
  await expect(sheetTitle(page)).not.toContainText(NAME_V2);

  // --- R0, the CTA relatório from before, is unchanged: the library type, by its own name ---
  await openSheet(page, r0.relatorioId, r0Pair.block.id);
  await expect(sheetTitle(page)).toContainText(CTA_NAME);
  const r0Row = (await readStore<EntityRecord<BlockRow>>(page, database, 'entities')).find((record) => record.entity === 'block' && record.id === r0Pair.block.id)!.row;
  expect(r0Row.block_type).toBe(CTA);
  expect(r0Row.config).toEqual(r0Pair.block.config);
});
