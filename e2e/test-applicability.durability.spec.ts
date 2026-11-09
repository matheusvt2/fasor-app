import {
  cellAddressesOf,
  getDefinition,
  NA_REASON_LEAD,
  publishedText,
  SEED_VERSION,
  testApplicability,
  type BlockDefinition,
  type BlockRow,
  type EquipmentTypeRow,
  type EquipmentTypeVersionRow,
  type LocationRow,
  type OpDraft,
} from '@app/domain';
import type { Locator, Page, Route } from '@playwright/test';
import { extractStructure, type DocxStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { duplicateLibraryType, openTypeList, publishButton, typeRows } from './support/company-type.ts';
import { escapeDialog } from './support/dialogs.ts';
import { downloadBytes, downloadFrom } from './support/download.ts';
import { signInForDurability, waitForShellCache } from './support/durability.ts';
import { deviceDatabaseName, expect, horizontalOverflow, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { serverRow } from './support/reading-ops.ts';
import { setParecer } from './support/relatorio-flow.ts';
import { emCampoDraft, newRelatorioDrafts, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNow, syncNowAndReturn } from './support/sync.ts';
import { expandLocation, section9Chevron } from './support/tree.ts';

/*
 * Story 23.9 (seed v13, decision J) in the durability matrix (desktop Chrome, Android Chrome
 * emulation, WebKit), against the built bundle. The fixture is the spec's: the v13 Chave
 * seccionadora duplicated in Templates › "Tipos de equipamento", its contact resistance test given
 * a condition over TIPO DE SECCIONADORA by a put of the draft from the office (the type editor has
 * no control for it; no seeded v13 test carries one yet), and published in the UI as v1. The
 * company sheet is added on site from the tree's Block palette at 768 px. With no fuses on the
 * plate the test shows NA: the pill, the kernel's reason, nothing counted missing, absent from the
 * DOCX; "Aplicar este ensaio" offline writes the one override op, the cells open and are typed,
 * a reload made before any sync keeps it, the sync lands it and the next DOCX prints the test; a
 * plate that meets the condition applies it with the stored override harmless; "Seguir a placa"
 * clears it. At 390 px the NA section fits; at 768 px its button stops above the Sticky action
 * bar. Every derived word is the kernel's (`testApplicability` over the device's own block row);
 * the values are invented. It generates through the one queue and LibreOffice of the api, so the
 * file is in the serial group (`e2e/support/groups.ts`). Empresa B is this worker's own (E6-Q7).
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

/** The job's own time: flush, queue pick-up, two LibreOffice passes. */
const JOB_TIMEOUT = 150_000;
const TYPE = 'chave_seccionadora' as const;
const TEST_KEY = 'resistencia_contato';
const LOCAL = 'Cubículo Enel';
const FUSED = 'SOB CARGA COM FUSÍVEIS';
const NO_FUSES = 'SEM CARGA';
/** The spec's fixture condition: the contact resistance applies only with fuses. */
const CONDITION = { op: 'in', field: 'tipo_seccionadora', values: [FUSED], unmet: 'sem fusíveis' } as const;
const SEEDED = getDefinition(SEED_VERSION, 'cabine_primaria', TYPE);
const LABEL = SEEDED.tests.find((t) => t.key === TEST_KEY)!.label;
const CELLS = cellAddressesOf(SEEDED, TEST_KEY);

const toast = (page: Page) => page.getByTestId('toast');
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const sheetTitle = (page: Page) => page.locator('.sheet-header .sheet-title');
const plateSelect = (page: Page, key: string) => page.locator(`#ficha-nameplate [data-field-key="${key}"] select`);
const testSection = (page: Page): Locator => page.locator(`section[data-test-key="${TEST_KEY}"]`);
// The reading cells only: since batch e23a (Story 23.3) the section also holds the manufacturer's value field (`.v13-mfr`).
const cellInputs = (page: Page) => testSection(page).locator('.measurement-table input.mf-value, .measurement-cards input.mf-value').filter({ visible: true });
const exportDialog = (page: Page) => page.getByRole('dialog', { name: 'Gerar relatório' });
const frames = (page: Page) => page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))));

/** The count a step's accessible name reads ("Ensaios, 3 faltando"). */
async function stepMissing(page: Page, step: string): Promise<number> {
  const label = await stepper(page).getByRole('button', { name: new RegExp(`^${step},`) }).getAttribute('aria-label');
  return Number(/, (\d+) faltando/.exec(label ?? '')?.[1] ?? NaN);
}

/** The printed tables of the contact resistance test: its instrument band, and the table after it. */
function printedTest(structure: DocxStructure): string[][][] {
  const at = structure.tables.findIndex((table) => table[0]?.[0] === LABEL);
  return at === -1 ? [] : [structure.tables[at]!, structure.tables[at + 1]!];
}

test('@p0 23.9-E2E-001 a company copy of the v13 seccionadora whose contact resistance applies only with fuses: NA by the plate (reason, nothing missing, absent from the DOCX); "Aplicar este ensaio" offline survives a reload and the sync and prints; a plate with fuses applies it, the override harmless; "Seguir a placa" clears it; 390 fits, 768 clear of the bar', async ({
  page,
  context,
  seed,
  browserName,
}) => {
  test.setTimeout(600_000);
  const account: SeedAccount = seed.companies[1];
  const database = deviceDatabaseName(account.userId);
  const outbox = () => readStore<OutboxRow>(page, database, 'outbox');
  const written = async (path: string) => (await outbox()).filter((row) => row.path === path).map((row) => row.value);
  const overridePath = (blockId: string) => `sheet/${blockId}/test/${TEST_KEY}/applicability`;
  await resetEmpresaB(account);
  await signInForDurability(page, context, account.email);
  await waitForShellCache(page);

  // --- the type: "Duplicar" of the v13 seccionadora, the condition put on its draft from the office, published as v1 ---
  await openTypeList(page);
  const typeId = await duplicateLibraryType(page, TYPE);
  const openEditor = async () => {
    await page.goto(`/templates/tipos/${typeId}`);
    await expect(page.locator('.tipo-head h2')).toBeVisible({ timeout: 30_000 });
  };
  // The copy reaches the server before the office writes its draft.
  await syncNow(page);
  await openEditor();
  const duplicated = (await typeRows<EquipmentTypeRow, EquipmentTypeVersionRow>(page, database, typeId)).type!;
  const draft = duplicated.draft as { tests: { key: string }[] } & Record<string, unknown>;
  expect(draft.tests.map((t) => t.key)).toContain(TEST_KEY);
  const conditioned = { ...draft, tests: draft.tests.map((t) => (t.key === TEST_KEY ? { ...t, applies_when: CONDITION } : t)) };
  const put: OpDraft = {
    kind: 'put',
    scope: 'company',
    company_id: account.companyId,
    project_id: null,
    relatorio_id: null,
    path: `equipment_type/${typeId}/draft`,
    value: conditioned as never,
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: account.userId,
  };
  await pushDrafts(page, database, [put]);
  await syncNow(page);
  await expect
    .poll(async () => ((await typeRows<EquipmentTypeRow, EquipmentTypeVersionRow>(page, database, typeId)).type?.draft as { tests?: { key: string; applies_when?: unknown }[] } | null)?.tests?.find((t) => t.key === TEST_KEY)?.applies_when)
    .toEqual(CONDITION);
  await openEditor();
  await publishButton(page).click();
  await expect(toast(page)).toHaveText(publishedText(1));
  await expect(page.locator('.tipo-head .status-pill')).toHaveText('Publicado · versão 1');
  const { versions } = await typeRows<EquipmentTypeRow, EquipmentTypeVersionRow>(page, database, typeId);
  expect(versions).toHaveLength(1);
  const definition = versions[0]!.definition as unknown as BlockDefinition;
  expect(definition.tests.find((t) => t.key === TEST_KEY)!.applies_when).toEqual(CONDITION);
  await syncNow(page);

  // --- a relatório cut down to Cubículo Enel with one TC, Em campo; the company sheet added from the Block palette at 768 ---
  const built = newRelatorioDrafts(account);
  const created = <T,>(prefix: string) => built.drafts.filter((d) => d.kind === 'create' && d.path.startsWith(prefix)).map((d) => d.value as unknown as T);
  const enel = created<LocationRow>('location/').find((row) => row.kind === 'cabine' && row.name === LOCAL)!;
  const tc = created<BlockRow>('block/').find((row) => row.location_id === enel.id && row.block_type === 'tc')!;
  const drafts = built.drafts.filter((d) => {
    if (d.kind !== 'create') return true;
    const value = d.value as Record<string, unknown>;
    if (d.path.startsWith('location/')) return value.id === enel.id;
    if (d.path.startsWith('block/')) return value.location_id === null || value.id === tc.id;
    if (d.path.startsWith('equipment/')) return value.id === tc.equipment_id;
    return true;
  });
  await pushDrafts(page, database, [...drafts, emCampoDraft(account, built.relatorioId)]);
  const relatorioId = built.relatorioId;
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  const chevron = section9Chevron(page);
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expandLocation(page, LOCAL);
  await page.getByRole('button', { name: `Adicionar equipamento no local ${LOCAL}`, exact: true }).click();
  const palette = page.getByRole('dialog', { name: 'Adicionar bloco' });
  await palette.locator(`.palette-type[data-block-type="type:${typeId}"] .pf-field`).click();
  await expect(palette).toBeHidden();
  let blockId = '';
  await expect
    .poll(async () => {
      const create = (await outbox()).find((row) => row.path.startsWith('block/') && (row.value as { block_type?: string }).block_type === `type:${typeId}`);
      blockId = (create?.value as { id?: string } | undefined)?.id ?? '';
      return blockId !== '';
    })
    .toBe(true);
  const deviceBlock = async () => (await readStore<EntityRecord<BlockRow>>(page, database, 'entities')).find((record) => record.entity === 'block' && record.id === blockId)!.row;
  const openSheet = async () => {
    await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
    await expect(sheetTitle(page)).toBeVisible({ timeout: 30_000 });
  };
  await page.setViewportSize({ width: 1280, height: 900 });
  await openSheet();

  // --- TIPO DE SECCIONADORA empty: the test applies (the conservative reading), its cells counted ---
  await expect(testSection(page)).not.toHaveAttribute('data-applicability');
  await expect(cellInputs(page)).toHaveCount(CELLS.length);
  const applying = await stepMissing(page, 'Ensaios');

  // --- no fuses on the plate: NA, its reason the kernel's, its cells gone and counted nothing ---
  await plateSelect(page, 'tipo_seccionadora').selectOption(NO_FUSES);
  await expect.poll(() => written(`sheet/${blockId}/nameplate/tipo_seccionadora`)).toEqual([NO_FUSES]);
  const na = testApplicability(await deviceBlock(), definition, TEST_KEY);
  expect(na.state).toBe('na');
  expect(na.reason).toBe(`${NA_REASON_LEAD} TIPO DE SECCIONADORA sem fusíveis.`);
  const section = page.locator(`section.v13-na[data-test-key="${TEST_KEY}"][data-applicability="na"]`);
  await expect(section).toBeVisible();
  await expect(section.locator('.section-head .v13-na-pill')).toHaveText('Não se aplica');
  const band = section.locator('.v13-na-band[role="status"]');
  await expect(band.locator('.band-text')).toContainText(na.reason!);
  await expect(band.locator('.band-sub')).toHaveText('Pela placa. Não conta como faltando e não sai no relatório.');
  const apply = band.getByRole('button', { name: 'Aplicar este ensaio' });
  await expect(apply).toBeVisible();
  await expect(cellInputs(page)).toHaveCount(0);
  await expect(section.locator('.instrument-picker')).toHaveCount(0);
  await expect.poll(() => stepMissing(page, 'Ensaios')).toBe(applying - CELLS.length);

  // 390 px: the section fits, no sideways scroll, the button inside the viewport.
  await page.setViewportSize({ width: 390, height: 844 });
  await apply.scrollIntoViewIfNeeded();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  const phone = (await apply.boundingBox())!;
  expect(phone.x).toBeGreaterThanOrEqual(0);
  expect(phone.x + phone.width).toBeLessThanOrEqual(390);
  // 768 px: the button left just under the Sticky action bar, then focused: the page brings it above the bar.
  await page.setViewportSize({ width: 768, height: 1024 });
  await frames(page);
  await apply.evaluate((button) => window.scrollBy(0, button.getBoundingClientRect().bottom - window.innerHeight + 12));
  await apply.focus();
  await frames(page);
  const tablet = await apply.evaluate((button) => {
    const bar = document.querySelector('[data-route="/relatorio/:id/ficha/:blockId"] .sticky-action-bar')!.getBoundingClientRect();
    const box = button.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom, barTop: bar.top };
  });
  expect(tablet.bottom, 'the NA band\'s button under the Sticky action bar').toBeLessThanOrEqual(tablet.barTop + 1);
  expect(tablet.top).toBeGreaterThanOrEqual(0);
  await page.setViewportSize({ width: 1280, height: 900 });

  // --- synced, revision 1 prints no contact resistance ---
  await syncNowAndReturn(page);
  await setParecer(page, relatorioId);
  const docx = async (n: number): Promise<DocxStructure> => {
    await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
    const modal = exportDialog(page);
    await expect(modal).toBeVisible();
    const again = modal.getByRole('button', { name: 'Gerar de novo' });
    const generate = modal.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' });
    await expect(again.or(generate).first()).toBeVisible({ timeout: 30_000 });
    if (await again.isVisible()) await again.click();
    await expect(generate).toBeEnabled({ timeout: 30_000 });
    await generate.click();
    const question = modal.getByRole('group', { name: /^Gerar com / });
    const ready = modal.getByRole('heading', { level: 2, name: `Revisão ${n} pronta` });
    await expect(question.or(ready).or(modal.locator('.gen-progress')).first()).toBeVisible({ timeout: 30_000 });
    if (await question.isVisible()) await question.getByRole('button', { name: 'Gerar mesmo assim' }).click();
    await expect(toast(page)).toHaveText(`Revisão ${n} pronta — DOCX e PDF`, { timeout: JOB_TIMEOUT });
    const download = await downloadFrom(page, () => modal.getByRole('button', { name: 'DOCX — abrir no Word' }).click());
    const structure = extractStructure(await downloadBytes(download));
    await escapeDialog(page, modal);
    return structure;
  };
  const first = await docx(1);
  expect(printedTest(first), 'the NA test is absent from revision 1').toEqual([]);

  // --- offline: "Aplicar este ensaio" writes the one override op; the cells open and are typed ---
  await openSheet();
  await context.setOffline(true);
  const cellWrites = async () => (await outbox()).filter((row) => row.path.startsWith(`sheet/${blockId}/test/${TEST_KEY}/`)).length;
  expect(await cellWrites()).toBe(0);
  await section.getByRole('button', { name: 'Aplicar este ensaio' }).click();
  await expect(toast(page)).toContainText('Ensaio aplicado — os campos abrem e ele sai no relatório');
  // One op: the override cell, and nothing else of the test.
  await expect.poll(() => written(overridePath(blockId))).toEqual(['applied']);
  expect(await cellWrites()).toBe(1);
  const applied = testApplicability(await deviceBlock(), definition, TEST_KEY);
  expect(applied.state).toBe('applied');
  const appliedSection = page.locator(`section.is-applied[data-test-key="${TEST_KEY}"][data-applicability="applied"]`);
  await expect(appliedSection.locator('.v13-applied-band .band-text')).toHaveText(`Aplicado por você. ${applied.appliedText}`);
  await expect(appliedSection.locator('.v13-applied-band').getByRole('button', { name: 'Seguir a placa' })).toBeVisible();
  await expect(cellInputs(page)).toHaveCount(CELLS.length);
  await expect.poll(() => stepMissing(page, 'Ensaios')).toBe(applying);
  for (const cell of CELLS) {
    const input = page.locator(`.ficha-cell[data-cell="${TEST_KEY}:${cell.row}:${cell.col}"] input.mf-value`).filter({ visible: true });
    await input.click();
    await page.keyboard.type('50');
    await page.keyboard.press('Tab');
    await expect.poll(() => written(`sheet/${blockId}/test/${TEST_KEY}/cell/${cell.row}/${cell.col}`)).toEqual([{ raw: '50', unit: 'µΩ', state: 'measured' }]);
  }
  await expect.poll(() => stepMissing(page, 'Ensaios')).toBe(applying - CELLS.length);
  // Offline, the override waits in the outbox.
  const overrideStatus = async () => (await outbox()).find((row) => row.path === overridePath(blockId))!.status;
  expect(await overrideStatus()).not.toBe('acked');

  // Playwright's WebKit cuts the network below the service worker (`cta.durability.spec.ts`): there
  // the reload runs online with every sync request refused, which keeps the ops in the outbox.
  const isSync = (url: URL) => url.pathname.startsWith('/api/sync');
  const refuseSync = (route: Route) => route.abort('internetdisconnected');
  if (browserName === 'webkit') {
    await page.route(isSync, refuseSync);
    await context.setOffline(false);
  }
  await page.reload();
  await expect(sheetTitle(page)).toBeVisible({ timeout: 30_000 });
  await expect(appliedSection.locator('.v13-applied-band')).toBeVisible();
  await expect(cellInputs(page).first()).toHaveValue('50');
  expect(await written(overridePath(blockId))).toEqual(['applied']);
  // The reload kept it unsent, except on WebKit, where the reload runs online (above) and the matrix
  // run of 2026-11-08 saw the push land despite the route's refusal.
  if (browserName !== 'webkit') expect(await overrideStatus()).not.toBe('acked');

  // --- back online: the sync lands it on the server; revision 2 prints the test with its readings ---
  if (browserName === 'webkit') await page.unroute(isSync, refuseSync);
  await context.setOffline(false);
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await syncNowAndReturn(page);
  await expect.poll(async () => [...new Set((await outbox()).filter((row) => row.path.startsWith(`sheet/${blockId}`)).map((row) => row.status))]).toEqual(['acked']);
  const server = (await serverRow(account.companyId, 'block', blockId)) as unknown as BlockRow;
  expect(server.sheet.test[TEST_KEY]!.applicability!.value).toBe('applied');
  const second = await docx(2);
  const printed = printedTest(second);
  expect(printed, 'the applied test prints in revision 2').toHaveLength(2);
  expect(printed[1]!.flat()).toContain('50');

  // --- a plate with fuses meets the condition: the test applies with no band, the stored override harmless ---
  await openSheet();
  await plateSelect(page, 'tipo_seccionadora').selectOption(FUSED);
  await expect.poll(() => written(`sheet/${blockId}/nameplate/tipo_seccionadora`)).toEqual([NO_FUSES, FUSED]);
  expect(testApplicability(await deviceBlock(), definition, TEST_KEY).state).toBe('met');
  await expect(testSection(page)).not.toHaveAttribute('data-applicability');
  await expect(page.locator('.v13-na-band, .v13-applied-band')).toHaveCount(0);
  await expect(cellInputs(page).first()).toHaveValue('50');
  expect(await written(overridePath(blockId))).toEqual(['applied']);

  // --- back to no fuses, the override still applies it; "Seguir a placa" clears it: NA again ---
  await plateSelect(page, 'tipo_seccionadora').selectOption(NO_FUSES);
  await expect(appliedSection.locator('.v13-applied-band')).toBeVisible();
  await appliedSection.getByRole('button', { name: 'Seguir a placa' }).click();
  await expect(toast(page)).toContainText('Voltou a seguir a placa — não se aplica');
  await expect.poll(() => written(overridePath(blockId))).toEqual(['applied', null]);
  await expect(section).toBeVisible();
  await expect(cellInputs(page)).toHaveCount(0);
  expect(testApplicability(await deviceBlock(), definition, TEST_KEY).state).toBe('na');
  await syncNowAndReturn(page);
  await expect.poll(async () => ((await serverRow(account.companyId, 'block', blockId)) as unknown as BlockRow | undefined)?.sheet.test[TEST_KEY]?.applicability?.value).toBeNull();
});
