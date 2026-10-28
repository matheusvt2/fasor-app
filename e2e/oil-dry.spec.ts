import { getDefinition, SEED_VERSION, type BlockRow } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { serverRow } from './support/reading-ops.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts, type SeededSheet } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNowAndReturn } from './support/sync.ts';

/*
 * 14.11-E2E. The insulation and the extinction medium drive the oil items (seed v6 on), driven as
 * a person would on sheets of the standard template (born on the current seed version, Em campo).
 *
 * 14.11-E2E-001 (transformer): Á SECO shows the eight oil items NA with no tap and VOL. ÓLEO not
 * missing; ÓLEO brings them back unanswered; with an oil item answered C, VOL. ÓLEO typed and a
 * photo on that item, ÓLEO to Á SECO clears the three in one batch (the item NA, VOL. ÓLEO empty,
 * the photo still on the sheet but no longer on the item) with "N itens de óleo apagados", and
 * "Desfazer" restores all three; a reload and a sync keep it, the server rows agreeing.
 * 14.11-E2E-002: the disjuntor's MEIO DE EXTINÇÃO (read from the kernel: since seed v7, Story
 * 14.14, "Vácuo" and "Óleo") and its one oil item; the seccionadora's list (AR, SF6); a TP's ÓLEO. Each test resets this worker's Empresa B (E6-Q7).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

interface OutboxRow {
  kind: string;
  path: string;
  value: unknown;
  batch_id: string | null;
}
interface EntityRecord<T> {
  entity: string;
  id: string;
  row: T;
}

const OIL = getDefinition(SEED_VERSION, 'cabine_primaria', 'transformador_forca').oil_rule!.items;
const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const entities = <T,>(page: Page) => readStore<EntityRecord<T>>(page, database, 'entities');
const toast = (page: Page) => page.getByTestId('toast');
const field = (page: Page, key: string): Locator => page.locator(`#ficha-nameplate [data-field-key="${key}"]`);
const select = (page: Page, key: string): Locator => field(page, key).locator('select');
const missingMarker = (page: Page, key: string): Locator =>
  page.locator(`#ficha-nameplate [data-field-key="${key}"][data-missing-field], #ficha-nameplate [data-field-key="${key}"] [data-missing-field]`);
const naControl = (page: Page, label: string): Locator => page.getByRole('button', { name: `Marcar ${label} como não aplicável`, exact: true });
const row = (page: Page, key: string): Locator => page.locator(`#ficha-step-verificacoes li.checklist-row[data-item-key="${key}"]`);
const checked = (page: Page, key: string): Locator => row(page, key).locator('[role="radio"][aria-checked="true"]');
const strip = (page: Page) => page.getByRole('region', { name: /^Fotos da ficha \(\d+\)$/ });
const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' });

/** Resets Empresa B, signs in, pushes a standard relatório (Em campo) plus `extra`, and opens the first sheet of `type` by address. */
async function openSheet(page: Page, type: string, extra: (relatorioId: string, sheet: SeededSheet) => ReturnType<typeof officeDraft>[] = () => []): Promise<{ relatorioId: string; sheet: SeededSheet }> {
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const sheet = built.sheets.find((s) => s.blockType === type)!;
  await pushDrafts(page, database, [...built.drafts, emCampoDraft(account, built.relatorioId), ...extra(built.relatorioId, sheet)]);
  await page.goto(`/relatorio/${built.relatorioId}/ficha/${sheet.blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await syncNowAndReturn(page);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  return { relatorioId: built.relatorioId, sheet };
}

/** A photo row on the block's checklist item, as an import from the NC row writes it (no bytes on this device). */
function photoDraft(relatorioId: string, blockId: string, itemKey: string): { draft: ReturnType<typeof officeDraft>; id: string } {
  const id = newId();
  const value = {
    id,
    company_id: account.companyId,
    relatorio_id: relatorioId,
    kind: 'photo',
    sha256: 'f'.repeat(64),
    mime: 'image/jpeg',
    size: 1000,
    uploaded_at: null,
    variants: null,
    removed_at: null,
    captured_at: '2026-10-20T12:00:00.000Z',
    tz_offset: -180,
    coords: null,
    local_seq: 1,
    block_id: blockId,
    item_key: itemKey,
    caption: null,
    reading_kind: null,
    reading_target: null,
    reading_status: 'none',
    people_in_photo: false,
  };
  return { draft: officeDraft(account, { relatorioId }, `file/${id}`, value, 'create'), id };
}

async function pick(page: Page, key: string, option: string): Promise<void> {
  await select(page, key).selectOption(option);
  await expect(select(page, key)).toHaveValue(option);
}

const blockOf = async (page: Page, blockId: string) => (await entities<BlockRow>(page)).find((record) => record.entity === 'block' && record.id === blockId)!.row;
const photoOf = async (page: Page, id: string) => (await entities<{ item_key: string | null; block_id: string | null; removed_at: string | null }>(page)).find((record) => record.entity === 'file' && record.id === id)?.row;

test('@p0 14.11-E2E-001 a transformer: Á SECO marks the oil items NA with no tap and offers no N/A beside VOL. ÓLEO, ÓLEO brings them back; ÓLEO to Á SECO clears an answered item, VOL. ÓLEO and the photo tie in one batch with "Desfazer", which restores all three; a reload and a sync keep it', async ({ page }) => {
  test.setTimeout(240_000);
  const { relatorioId, sheet } = await openSheet(page, 'transformador_forca');
  const blockId = sheet.blockId;
  await expect(select(page, 'tipo_de_isolacao').locator('option')).toContainText(['EPÓXI', 'Á SECO', 'ÓLEO']);

  // Á SECO: the oil items (the current seed's, seven on v9) read NA with no tap, VOL. ÓLEO is not missing, no chip.
  await pick(page, 'tipo_de_isolacao', 'Á SECO');
  for (const key of OIL) await expect(checked(page, key), key).toHaveAttribute('data-value', 'na');
  await expect(checked(page, 'limpeza')).toHaveCount(0);
  await expect(missingMarker(page, 'vol_oleo')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /itens? de óleo como NA$/ })).toHaveCount(0);
  // QA G1 (fx17r): the excused VOL. ÓLEO offers no N/A control; Potência nominal keeps its own.
  await expect(naControl(page, 'Vol. óleo')).toHaveCount(0);
  await expect(naControl(page, 'Potência nominal')).toHaveCount(1);
  // Nothing was written for them: the NA is the kernel's reading of the plate.
  expect((await outbox(page)).filter((op) => op.path.includes('/checklist/'))).toEqual([]);

  // ÓLEO: they are back, unanswered and counted, and VOL. ÓLEO is missing.
  await pick(page, 'tipo_de_isolacao', 'ÓLEO');
  for (const key of OIL) await expect(checked(page, key), key).toHaveCount(0);
  await expect(missingMarker(page, 'vol_oleo')).toHaveCount(1);
  await expect(naControl(page, 'Vol. óleo')).toHaveCount(1);

  // A photo on the termometro item (from another device), an answer C on it and VOL. ÓLEO typed.
  const photo = photoDraft(relatorioId, blockId, 'termometro');
  await pushDrafts(page, database, [photo.draft]);
  await syncNowAndReturn(page);
  await expect.poll(async () => (await photoOf(page, photo.id))?.item_key, { timeout: 30_000 }).toBe('termometro');
  await expect(row(page, 'termometro').locator('.photo-list .photo-row')).toHaveCount(1);
  await row(page, 'termometro').getByRole('radio', { name: 'Conforme', exact: true }).click();
  await expect(checked(page, 'termometro')).toHaveAttribute('data-value', 'c');
  const volume = field(page, 'vol_oleo').locator('input');
  await volume.fill('320');
  await volume.press('Tab');
  await expect.poll(async () => (await outbox(page)).filter((op) => op.path === `sheet/${blockId}/nameplate/vol_oleo`).at(-1)?.value).toEqual(measured('320', 'L'));
  await expect(strip(page)).toHaveAccessibleName('Fotos da ficha (1)');

  // ÓLEO to Á SECO: one batch clears the three, with the toast that counts them.
  await pick(page, 'tipo_de_isolacao', 'Á SECO');
  await expect(toast(page)).toContainText('2 itens de óleo apagados');
  await expect(checked(page, 'termometro')).toHaveAttribute('data-value', 'na');
  await expect(volume).toHaveValue('');
  await expect(missingMarker(page, 'vol_oleo')).toHaveCount(0);
  await expect(row(page, 'termometro').locator('.photo-list .photo-row')).toHaveCount(0);
  // The photo stays on the sheet: in its strip, untied from the item, never removed.
  await expect(strip(page)).toHaveAccessibleName('Fotos da ficha (1)');
  expect(await photoOf(page, photo.id)).toMatchObject({ block_id: blockId, item_key: null, removed_at: null });
  {
    const ops = await outbox(page);
    const insulation = ops.filter((op) => op.path === `sheet/${blockId}/nameplate/tipo_de_isolacao`).at(-1)!;
    const batch = ops.filter((op) => op.batch_id === insulation.batch_id).map((op) => [op.path, op.value]);
    expect(batch).toEqual([
      [`sheet/${blockId}/nameplate/tipo_de_isolacao`, 'Á SECO'],
      [`sheet/${blockId}/checklist/termometro/result`, null],
      [`sheet/${blockId}/nameplate/vol_oleo`, null],
      [`file/${photo.id}/item_key`, null],
    ]);
  }

  // "Desfazer" restores all three.
  await toast(page).getByRole('button', { name: 'Desfazer' }).click();
  await expect(select(page, 'tipo_de_isolacao')).toHaveValue('ÓLEO');
  await expect(checked(page, 'termometro')).toHaveAttribute('data-value', 'c');
  await expect(volume).toHaveValue('320');
  await expect(row(page, 'termometro').locator('.photo-list .photo-row')).toHaveCount(1);
  await expect.poll(async () => (await photoOf(page, photo.id))?.item_key).toBe('termometro');

  // A reload and a sync keep it; the server folded the same rows.
  await page.reload();
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await expect(select(page, 'tipo_de_isolacao')).toHaveValue('ÓLEO');
  await expect(checked(page, 'termometro')).toHaveAttribute('data-value', 'c');
  await syncNowAndReturn(page);
  await expect
    .poll(async () => {
      const server = (await serverRow(account.companyId, 'block', blockId)) as BlockRow | undefined;
      return { insulation: server?.sheet.nameplate.tipo_de_isolacao?.value, termometro: server?.sheet.checklist.termometro?.result?.value, volume: server?.sheet.nameplate.vol_oleo?.value };
    }, { timeout: 30_000 })
    .toEqual({ insulation: 'ÓLEO', termometro: 'C', volume: measured('320', 'L') });
  expect(await serverRow(account.companyId, 'file', photo.id)).toMatchObject({ item_key: 'termometro', block_id: blockId });
  expect((await blockOf(page, blockId)).sheet.checklist.termometro?.result?.value).toBe('C');
});

test('@p0 14.11-E2E-002 the disjuntor\'s medium: a non-oil medium marks its oil item NA, the oil one brings it back; the seccionadora keeps its own list; a TP offers ÓLEO and marks its oil items NA on EPÓXI', async ({ page }) => {
  test.setTimeout(240_000);
  const { relatorioId } = await openSheet(page, 'disjuntor_mt');
  // Story 14.14: the media are read from the kernel (seed v7: Ar, Gás SF6, Vácuo, Óleo, Outro).
  const disjuntor = getDefinition(SEED_VERSION, 'cabine_primaria', 'disjuntor_mt');
  const media = disjuntor.nameplate.find((f) => f.key === 'meio_de_extincao')!.options!;
  const rule = disjuntor.oil_rule!;
  const oil = rule.oil_values[0]!;
  const nonOil = media.filter((option) => !rule.oil_values.includes(option) && !(rule.full_values ?? []).includes(option)).at(-1)!;
  expect((await select(page, 'meio_de_extincao').locator('option').allTextContents()).slice(-media.length)).toEqual(media);
  await pick(page, 'meio_de_extincao', nonOil);
  await expect(checked(page, 'oleo_isolante_indicador_de_nivel')).toHaveAttribute('data-value', 'na');
  await expect(checked(page, 'camara_de_extincao')).toHaveCount(0);
  await expect(missingMarker(page, 'vol_oleo')).toHaveCount(0);
  await pick(page, 'meio_de_extincao', oil);
  await expect(checked(page, 'oleo_isolante_indicador_de_nivel')).toHaveCount(0);
  await expect(missingMarker(page, 'vol_oleo')).toHaveCount(1);
  // Answered on the oil unit, then the non-oil medium: cleared, NA again, with the toast.
  await row(page, 'oleo_isolante_indicador_de_nivel').getByRole('radio', { name: 'Conforme', exact: true }).click();
  await expect(checked(page, 'oleo_isolante_indicador_de_nivel')).toHaveAttribute('data-value', 'c');
  await pick(page, 'meio_de_extincao', nonOil);
  await expect(toast(page)).toContainText('1 item de óleo apagado');
  await expect(checked(page, 'oleo_isolante_indicador_de_nivel')).toHaveAttribute('data-value', 'na');
  await page.reload();
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await expect(select(page, 'meio_de_extincao')).toHaveValue(nonOil);
  await expect(checked(page, 'oleo_isolante_indicador_de_nivel')).toHaveAttribute('data-value', 'na');

  // The seccionadora of the same relatório keeps AR and SF6 (none of the disjuntor's v7 media); a TP offers ÓLEO.
  const built = await entities<BlockRow>(page);
  const blockOfType = (type: string) => built.find((record) => record.entity === 'block' && record.row.relatorio_id === relatorioId && record.row.block_type === type)!.row;
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockOfType('chave_seccionadora').id}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  const own = getDefinition(SEED_VERSION, 'cabine_primaria', 'chave_seccionadora').nameplate.find((f) => f.key === 'meio_de_extincao')!.options!;
  expect(own).toEqual(['AR', 'SF6']);
  const seccionadora = await select(page, 'meio_de_extincao').locator('option').allTextContents();
  expect(seccionadora.slice(-own.length)).toEqual(own);
  expect(seccionadora.filter((option) => media.includes(option))).toEqual([]);
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockOfType('tp').id}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await expect(select(page, 'tipo_de_isolacao').locator('option', { hasText: 'ÓLEO' })).toHaveCount(1);
  await pick(page, 'tipo_de_isolacao', 'EPÓXI');
  for (const key of OIL) await expect(checked(page, key), key).toHaveAttribute('data-value', 'na');
  await pick(page, 'tipo_de_isolacao', 'ÓLEO');
  for (const key of OIL) await expect(checked(page, key), key).toHaveCount(0);
});
