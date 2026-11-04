import { getDefinition, type BlockRow } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { serverRow } from './support/reading-ops.ts';
import { emCampoDraft, newRelatorioDrafts, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNowAndReturn } from './support/sync.ts';

/*
 * e20h-E2E-001 (2026-11-04, Matheus for Bruno): a relatório born on seed v5, before the oil
 * options of v6, offers VÁCUO and ÓLEO in the Disjuntor MT's MEIO DE EXTINÇÃO and ÓLEO in the
 * Transformador de força's TIPO DE ISOLAÇÃO, appended after the lists it always had
 * (`seed/legacy-options.ts`). Picking them is kept by a reload and accepted by the server; the
 * TP keeps its two insulation types. Resets this worker's Empresa B (E6-Q7).
 */

const SEED = 'v5';

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

interface EntityRecord<T> {
  entity: string;
  id: string;
  row: T;
}

const select = (page: Page, key: string): Locator => page.locator(`#ficha-nameplate [data-field-key="${key}"] select`);
const sheetTitle = (page: Page) => page.locator('.sheet-header .sheet-title');
const optionsOf = (blockType: string, key: string) => getDefinition(SEED, 'cabine_primaria', blockType).nameplate.find((f) => f.key === key)!.options!;

async function openSheet(page: Page, relatorioId: string, blockId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(sheetTitle(page)).toBeVisible({ timeout: 30_000 });
}

async function pick(page: Page, key: string, option: string): Promise<void> {
  await select(page, key).selectOption(option);
  await expect(select(page, key)).toHaveValue(option);
}

test('e20h-E2E-001 a v5 relatório offers VÁCUO and ÓLEO on the disjuntor and ÓLEO on the transformador de força; picks survive a reload and reach the server', async ({ page }) => {
  test.setTimeout(240_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account, { seedVersion: SEED });
  const disjuntor = built.sheets.find((s) => s.blockType === 'disjuntor_mt')!;
  const trafo = built.sheets.find((s) => s.blockType === 'transformador_forca')!;
  const tp = built.sheets.find((s) => s.blockType === 'tp')!;
  await pushDrafts(page, database, [...built.drafts, emCampoDraft(account, built.relatorioId)]);
  await openSheet(page, built.relatorioId, disjuntor.blockId);
  await syncNowAndReturn(page);
  await expect(sheetTitle(page)).toBeVisible({ timeout: 30_000 });
  const stored = await readStore<EntityRecord<BlockRow>>(page, database, 'entities');
  expect(stored.find((record) => record.entity === 'block' && record.id === disjuntor.blockId)!.row.seed_version).toBe(SEED);

  // The disjuntor: the old two, then VÁCUO and ÓLEO, as the kernel lists them.
  expect(optionsOf('disjuntor_mt', 'meio_de_extincao')).toEqual(['AR', 'SF6', 'VÁCUO', 'ÓLEO']);
  expect((await select(page, 'meio_de_extincao').locator('option').allTextContents()).slice(-4)).toEqual(['AR', 'SF6', 'VÁCUO', 'ÓLEO']);
  await pick(page, 'meio_de_extincao', 'VÁCUO');
  await pick(page, 'meio_de_extincao', 'ÓLEO');

  // The transformador de força: EPÓXI, Á SECO, then ÓLEO.
  await openSheet(page, built.relatorioId, trafo.blockId);
  expect((await select(page, 'tipo_de_isolacao').locator('option').allTextContents()).slice(-3)).toEqual(['EPÓXI', 'Á SECO', 'ÓLEO']);
  await pick(page, 'tipo_de_isolacao', 'ÓLEO');

  // The TP keeps its two.
  await openSheet(page, built.relatorioId, tp.blockId);
  expect((await select(page, 'tipo_de_isolacao').locator('option').allTextContents()).slice(-2)).toEqual(['EPÓXI', 'Á SECO']);
  await expect(select(page, 'tipo_de_isolacao').locator('option', { hasText: 'ÓLEO' })).toHaveCount(0);

  // A reload keeps both picks; a sync brings the server to the same values, with nothing refused.
  await page.reload();
  await openSheet(page, built.relatorioId, disjuntor.blockId);
  await expect(select(page, 'meio_de_extincao')).toHaveValue('ÓLEO');
  await openSheet(page, built.relatorioId, trafo.blockId);
  await expect(select(page, 'tipo_de_isolacao')).toHaveValue('ÓLEO');
  await syncNowAndReturn(page);
  await expect
    .poll(
      async () => {
        const server = (id: string) => serverRow(account.companyId, 'block', id) as Promise<BlockRow | undefined>;
        return {
          medium: (await server(disjuntor.blockId))?.sheet.nameplate.meio_de_extincao?.value,
          insulation: (await server(trafo.blockId))?.sheet.nameplate.tipo_de_isolacao?.value,
        };
      },
      { timeout: 30_000 },
    )
    .toEqual({ medium: 'ÓLEO', insulation: 'ÓLEO' });
  await expect(page.getByText('recusad', { exact: false })).toHaveCount(0);
});
