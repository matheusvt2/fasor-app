import { getDefinition, paletteItems, SEED_VERSION, SELV_VOLTAGE_NOTICE, TEST_VOLTAGE_NOT_CHECKED, type BlockRow, type OpDraft } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { deviceDatabaseName, expect, horizontalOverflow, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { expectCameraOpen } from './support/photos.ts';
import { serverRow } from './support/reading-ops.ts';
import { emCampoDraft, newRelatorioDrafts, pushDrafts, pushNewRelatorio } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNowAndReturn } from './support/sync.ts';
import { expandLocation } from './support/tree.ts';
import { typeRows } from './support/palette.ts';

/*
 * 14.14-E2E. Seed v7 (the version of a new template), driven as a person would on sheets of the
 * standard template (born on v7, Em campo).
 *
 * 14.14-E2E-001 (disjuntor, offline): "Outro" shows the oil item and VOL. ÓLEO in full and
 * unanswered; with the item answered and VOL. ÓLEO typed, "Ar" clears both in one batch with the
 * count toast, the item NA and VOL. ÓLEO excused; "Desfazer" restores both; the outbox holds the
 * ops; a reload and a sync keep the state, the server row agreeing.
 * 14.14-E2E-002 (Quadro elétrico): the SELV/PELV help under its field; SIM at 380 V shows the
 * SELV notice, NÃO removes it; with an instrument whose registry test voltage is 5.000 V the
 * insulation test reads "not checked", a display shot through "Ler visor" (the fake camera and
 * the fake reading) shows the test-voltage notice naming both voltages, and removing the photo
 * brings "not checked" back; no verdict changes; at 390 px the notices wrap with no sideways
 * scroll. Each test resets this worker's Empresa B (E6-Q7).
 */

test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['camera'],
});

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

const DISJUNTOR = getDefinition(SEED_VERSION, 'cabine_primaria', 'disjuntor_mt');
const MEDIA = DISJUNTOR.nameplate.find((f) => f.key === 'meio_de_extincao')!.options!;
const OIL_ITEM = DISJUNTOR.oil_rule!.items[0]!;
/** "Outro": the value that shows the oil items in full (Bruno 2026-10-21 answer 4). */
const FULL = DISJUNTOR.oil_rule!.full_values![0]!;
/** "Ar": the first non-oil medium. */
const NON_OIL = MEDIA.find((option) => !DISJUNTOR.oil_rule!.oil_values.includes(option) && option !== FULL)!;
const QD = 'quadro_eletrico';
const QD_DEFINITION = getDefinition(SEED_VERSION, 'cabine_primaria', QD);
const SELV_HELP = QD_DEFINITION.nameplate.find((f) => f.key === 'circuito_selv_pelv')!.help!;

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const entities = <T,>(page: Page) => readStore<EntityRecord<T>>(page, database, 'entities');
const toast = (page: Page) => page.getByTestId('toast');
const field = (page: Page, key: string): Locator => page.locator(`#ficha-nameplate [data-field-key="${key}"]`);
const select = (page: Page, key: string): Locator => field(page, key).locator('select');
const missingMarker = (page: Page, key: string): Locator =>
  page.locator(`#ficha-nameplate [data-field-key="${key}"][data-missing-field], #ficha-nameplate [data-field-key="${key}"] [data-missing-field]`);
const row = (page: Page, key: string): Locator => page.locator(`#ficha-step-verificacoes li.checklist-row[data-item-key="${key}"]`);
const checked = (page: Page, key: string): Locator => row(page, key).locator('[role="radio"][aria-checked="true"]');
const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' });
const sheetTitle = (page: Page) => page.locator('.sheet-header .sheet-title');

async function pick(page: Page, key: string, option: string): Promise<void> {
  await select(page, key).selectOption(option);
  await expect(select(page, key)).toHaveValue(option);
}

const blockOf = async (page: Page, blockId: string) => (await entities<BlockRow>(page)).find((record) => record.entity === 'block' && record.id === blockId)!.row;

test('@p0 14.14-E2E-001 offline, a disjuntor on "Outro" shows its oil item and VOL. ÓLEO in full; "Ar" clears both in one batch with "Desfazer", which restores them; a reload and a sync keep it', async ({ page, context }) => {
  test.setTimeout(240_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const sheet = built.sheets.find((s) => s.blockType === 'disjuntor_mt')!;
  await pushDrafts(page, database, [...built.drafts, emCampoDraft(account, built.relatorioId)]);
  await page.goto(`/relatorio/${built.relatorioId}/ficha/${sheet.blockId}`);
  await expect(sheetTitle(page)).toBeVisible({ timeout: 30_000 });
  await syncNowAndReturn(page);
  await expect(sheetTitle(page)).toBeVisible({ timeout: 30_000 });
  const blockId = sheet.blockId;
  expect((await blockOf(page, blockId)).seed_version).toBe(SEED_VERSION);

  await context.setOffline(true);
  // The five media in order, from the kernel.
  expect((await select(page, 'meio_de_extincao').locator('option').allTextContents()).slice(-MEDIA.length)).toEqual(MEDIA);

  // "Outro": the oil item unanswered and counted, VOL. ÓLEO missing.
  await pick(page, 'meio_de_extincao', FULL);
  await expect(checked(page, OIL_ITEM)).toHaveCount(0);
  await expect(missingMarker(page, 'vol_oleo')).toHaveCount(1);

  // The item answered C and VOL. ÓLEO typed.
  await row(page, OIL_ITEM).getByRole('radio', { name: 'Conforme', exact: true }).click();
  await expect(checked(page, OIL_ITEM)).toHaveAttribute('data-value', 'c');
  const volume = field(page, 'vol_oleo').locator('input');
  await volume.fill('45');
  await volume.press('Tab');
  await expect.poll(async () => (await outbox(page)).filter((op) => op.path === `sheet/${blockId}/nameplate/vol_oleo`).at(-1)?.value).toEqual(measured('45', 'L'));
  await expect(missingMarker(page, 'vol_oleo')).toHaveCount(0);

  // "Ar": one batch clears both, with the toast that counts them.
  await pick(page, 'meio_de_extincao', NON_OIL);
  await expect(toast(page)).toContainText('2 itens de óleo apagados');
  await expect(checked(page, OIL_ITEM)).toHaveAttribute('data-value', 'na');
  await expect(volume).toHaveValue('');
  await expect(missingMarker(page, 'vol_oleo')).toHaveCount(0);
  {
    const ops = await outbox(page);
    const medium = ops.filter((op) => op.path === `sheet/${blockId}/nameplate/meio_de_extincao`).at(-1)!;
    expect(ops.filter((op) => op.batch_id === medium.batch_id).map((op) => [op.path, op.value])).toEqual([
      [`sheet/${blockId}/nameplate/meio_de_extincao`, NON_OIL],
      [`sheet/${blockId}/checklist/${OIL_ITEM}/result`, null],
      [`sheet/${blockId}/nameplate/vol_oleo`, null],
    ]);
  }

  // "Desfazer" restores both.
  await toast(page).getByRole('button', { name: 'Desfazer' }).click();
  await expect(select(page, 'meio_de_extincao')).toHaveValue(FULL);
  await expect(checked(page, OIL_ITEM)).toHaveAttribute('data-value', 'c');
  await expect(volume).toHaveValue('45');

  // Back online, a reload keeps it and a sync brings the server to the same rows.
  await context.setOffline(false);
  await page.reload();
  await expect(sheetTitle(page)).toBeVisible({ timeout: 30_000 });
  await expect(select(page, 'meio_de_extincao')).toHaveValue(FULL);
  await expect(checked(page, OIL_ITEM)).toHaveAttribute('data-value', 'c');
  await syncNowAndReturn(page);
  await expect
    .poll(async () => {
      const server = (await serverRow(account.companyId, 'block', blockId)) as BlockRow | undefined;
      return { medium: server?.sheet.nameplate.meio_de_extincao?.value, item: server?.sheet.checklist[OIL_ITEM]?.result?.value, volume: server?.sheet.nameplate.vol_oleo?.value };
    }, { timeout: 30_000 })
    .toEqual({ medium: FULL, item: 'C', volume: measured('45', 'L') });
});

/** The instrument "2E" of the account's company, whose registry insulation test voltage is 5.000 V. */
function megohmmeter(id: string): OpDraft {
  return {
    kind: 'create',
    scope: 'company',
    company_id: account.companyId,
    project_id: null,
    relatorio_id: null,
    path: `registry/instrument/${id}`,
    value: {
      id,
      kind: 'instrument',
      code: '2E',
      name: 'Megôhmetro',
      manufacturer: 'Instrum',
      model: 'DMG10Ki',
      serial: 'IN919021',
      cert_number: '37428/26',
      laboratory: null,
      calibrated_at: '2026-08-28',
      calibration_interval_months: 12,
      rbc_accredited: null,
      test_isolacao: { raw: '5000', unit: 'V' },
      test_resistencia_contato: null,
      test_relacao_transformacao: null,
      certificate_file_id: null,
      removed_at: null,
    },
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: account.userId,
  } as OpDraft;
}

test('@p0 14.14-E2E-002 a Quadro elétrico: the SELV/PELV help, the SELV notice at 380 V; the test voltage not checked, then named against the band once the display is shot, and not checked again once the photo is removed; at 390 px the notices wrap', async ({ page }) => {
  test.setTimeout(240_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  await pushDrafts(page, database, [megohmmeter(newId())]);
  const { relatorioId } = await pushNewRelatorio(page, account, database, { emCampo: true });
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await syncNowAndReturn(page);
  const chevron = page.getByRole('button', { name: 'Expandir ou recolher a seção 9' });
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expandLocation(page, 'Geradores');

  // One Quadro elétrico from the field palette (at 768 px, as 14.9-E2E-002 adds it).
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.getByRole('button', { name: 'Adicionar equipamento no local Geradores', exact: true }).click();
  const fieldPalette = page.getByRole('dialog', { name: 'Adicionar bloco' });
  const item = paletteItems(SEED_VERSION, { kind: 'cabine', name: 'Geradores' }, []).find((entry) => entry.type === QD)!;
  const qdRow = typeRows(fieldPalette, [QD]);
  const tag = (await qdRow.locator('.pi-meta').innerText()).trim().slice(`${item.summary} · `.length);
  await qdRow.click();
  await expect(fieldPalette).toBeHidden();
  const eqRow = page.locator('li.s9-eq').filter({ has: page.locator('.block-tag', { hasText: new RegExp(`^${tag}$`) }) });
  const blockId = (await eqRow.getAttribute('data-block-id'))!;
  await eqRow.locator('.s9-eq-open').click();
  await expect(page).toHaveURL(new RegExp(`/ficha/${blockId}$`));
  await expect(sheetTitle(page)).toContainText(QD_DEFINITION.label);
  await page.setViewportSize({ width: 1280, height: 900 });

  // The help sits under the field; no notice while nothing disagrees.
  const selv = field(page, 'circuito_selv_pelv');
  await expect(selv.locator('.helper').first()).toHaveText(SELV_HELP);
  await expect(select(page, 'circuito_selv_pelv')).toHaveAccessibleDescription(SELV_HELP);
  const notice = selv.locator('.helper[data-tone="amber"]');
  await expect(notice).toHaveCount(0);
  const voltage = field(page, 'tensao_nominal').locator('input');
  await voltage.fill('380');
  await voltage.press('Tab');
  await expect.poll(async () => (await outbox(page)).filter((op) => op.path === `sheet/${blockId}/nameplate/tensao_nominal`).at(-1)?.value).toEqual(measured('380', 'V'));
  await pick(page, 'circuito_selv_pelv', 'SIM');
  await expect(notice).toHaveText(SELV_VOLTAGE_NOTICE);
  // The notice writes nothing: the last ops are the user's own.
  expect((await outbox(page)).filter((op) => op.path.startsWith(`sheet/${blockId}/`)).map((op) => op.path)).toEqual([
    `sheet/${blockId}/nameplate/tensao_nominal`,
    `sheet/${blockId}/nameplate/circuito_selv_pelv`,
  ]);
  await pick(page, 'circuito_selv_pelv', 'NÃO');
  await expect(notice).toHaveCount(0);

  // The insulation's instrument: the registry's 5.000 V lands as its TENSÃO ENSAIO; no shot yet, not checked.
  await page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' }).getByRole('button', { name: /^Ensaios,/ }).click();
  const iso = page.locator('section[data-test-key="isolacao"]');
  await iso.getByRole('button', { name: /^Instrumento/ }).click();
  await iso.getByRole('radiogroup', { name: 'Instrumentos cadastrados' }).getByRole('radio', { name: /^2E/ }).click();
  await expect(iso.getByRole('button', { name: 'Instrumento 2E — Megôhmetro' })).toBeVisible();
  await expect
    .poll(async () => ((await outbox(page)).filter((op) => op.path === `sheet/${blockId}/test/isolacao/instrument`).at(-1)?.value as { test_parameter?: string } | undefined)?.test_parameter)
    .toBe('5.000 V');
  const voltageNotice = iso.locator('[data-test-voltage]');
  await expect(voltageNotice).toHaveText(TEST_VOLTAGE_NOT_CHECKED);
  await expect(voltageNotice).toHaveAttribute('data-test-voltage', 'not_checked');
  const criterion = iso.locator('.mt-criterion');
  const criterionBefore = await criterion.innerText();

  // A display shot of the insulation table through "Ler visor": the notice names both voltages (band up to 500 V: 500 V).
  await iso.locator('.ficha-mt[data-table-key="isolacao"] .mt-actions').getByRole('button', { name: 'Ler visor' }).click();
  const camera = await expectCameraOpen(page);
  await camera.getByRole('button', { name: 'Disparar' }).click();
  await camera.getByRole('button', { name: 'Concluir', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Câmera' })).toHaveCount(0, { timeout: 15_000 });
  await expect(voltageNotice).toHaveText('Tensão de ensaio do instrumento (5.000 V) diferente da prevista para a faixa (500 V).');
  await expect(voltageNotice).toHaveAttribute('data-tone', 'amber');
  await expect(criterion).toHaveText(criterionBefore);

  // At 390 px both notices wrap inside the page.
  await pick(page, 'circuito_selv_pelv', 'SIM');
  await expect(notice).toHaveText(SELV_VOLTAGE_NOTICE);
  await expect(voltageNotice).toHaveText('Tensão de ensaio do instrumento (5.000 V) diferente da prevista para a faixa (250 V).');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(voltageNotice).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  for (const line of [notice, voltageNotice]) {
    const box = (await line.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  // The SELV band now judges the test (SIM): the photo's removal must not change it.
  const criterionSelv = await criterion.innerText();

  // The photo removed from the sheet's strip: not checked again.
  const shots = async () =>
    (await entities<{ kind: string; block_id: string | null; reading_kind: string | null; removed_at: string | null }>(page)).filter(
      (record) => record.entity === 'file' && record.row.block_id === blockId && record.row.reading_kind === 'display' && record.row.removed_at === null,
    );
  await expect.poll(async () => (await shots()).length, { timeout: 15_000 }).toBe(1);
  await page.getByRole('region', { name: /^Fotos da ficha \(\d+\)$/ }).getByRole('button', { name: /^Foto \d+, abrir$/ }).first().click();
  const viewer = page.getByRole('dialog', { name: /^Foto \d+ de \d+$/ });
  await viewer.getByRole('button', { name: 'Remover', exact: true }).click();
  await page.getByRole('dialog', { name: /^Remover a foto \d+ do relatório\?$/ }).getByRole('button', { name: 'Remover foto' }).click();
  await expect(page.locator('.photo-viewer')).toHaveCount(0);
  await expect.poll(async () => (await shots()).length, { timeout: 15_000 }).toBe(0);
  await expect(voltageNotice).toHaveText(TEST_VOLTAGE_NOT_CHECKED);
  await expect(criterion).toHaveText(criterionSelv);

  // A reload and a sync keep the marks; the server holds the mark and the instrument.
  await page.reload();
  await expect(sheetTitle(page)).toBeVisible({ timeout: 30_000 });
  await expect(field(page, 'circuito_selv_pelv').locator('.helper[data-tone="amber"]')).toHaveText(SELV_VOLTAGE_NOTICE);
  await expect(page.locator('section[data-test-key="isolacao"] [data-test-voltage]')).toHaveText(TEST_VOLTAGE_NOT_CHECKED);
  await syncNowAndReturn(page);
  await expect
    .poll(async () => {
      const server = (await serverRow(account.companyId, 'block', blockId)) as BlockRow | undefined;
      return [server?.sheet.nameplate.circuito_selv_pelv?.value, (server?.sheet.test.isolacao?.instrument?.value as { test_parameter?: string } | undefined)?.test_parameter];
    }, { timeout: 30_000 })
    .toEqual(['SIM', '5.000 V']);
});
