import { cellAddressesOf, getDefinition, type OpDraft } from '@app/domain';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { signInForDurability } from './support/durability.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { pushPlateSuggestions, transformerPlateFields } from './support/reading-ops.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { newRelatorioDrafts, officeDraft, pushDrafts, type SeededSheet } from './support/relatorio-seed.ts';
import { syncNow, syncNowAndReturn } from './support/sync.ts';

/*
 * Review 2026-10-08, Decision 2 (H-4, MKT-7), amended 2026-10-09 (Matheus): a dry transformador
 * de força, TP or TC of the standard template (no subtype) can be concluded. Confirming,
 * picking or copying a dry TIPO DE ISOLAÇÃO writes only what it wrote before; a stored EPÓXI or
 * Á SECO, however written, offers the chip "Marcar N itens de óleo como NA", whose tap writes
 * the oil items still unanswered as NA in one batch with "Desfazer", and VOL. ÓLEO stops counting
 * as missing. Once used, the chip is not offered again on this device. The plate reading is
 * seeded as the reading job writes it (`pushPlateSuggestions`, without its photo); what no AC
 * exercises (the cabine, the readings, the non-oil checklist items, the conclusion pair, a
 * source plate) is seeded by office ops. Runs on the durability projects (the matrix covers the
 * commit path); each worker has its own Empresa B (E6-Q7).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const TF = getDefinition('v1', 'cabine_primaria', 'transformador_forca');
/** The eight oil items in checklist order (seed v1 `OIL_RELATED_ITEMS`). */
const OIL = [
  'valvula_de_alivio',
  'elemento_secante',
  'juntas_vedacoes_e_vazamentos',
  'indicador_nivel_de_oleo',
  'registros_radiadores',
  'rele_de_gas_funcionamento',
  'termometro',
  'oleo_isolante_indicador_de_nivel',
];
const NON_OIL = TF.checklist!.map((item) => item.key).filter((key) => !OIL.includes(key));

interface OutboxRow {
  op_id: string;
  kind: string;
  path: string;
  value: unknown;
  batch_id: string | null;
  status: string;
}

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const toast = (page: Page) => page.getByTestId('toast');
const section = (page: Page) => page.locator('#ficha-nameplate');
const field = (page: Page, key: string): Locator => page.locator(`#ficha-nameplate [data-field-key="${key}"]`);
/** The field's own missing marker (on the field or on its input). */
const missingMarker = (page: Page, key: string): Locator =>
  page.locator(`#ficha-nameplate [data-field-key="${key}"][data-missing-field], #ficha-nameplate [data-field-key="${key}"] [data-missing-field]`);
const row = (page: Page, key: string): Locator => page.locator(`#ficha-step-verificacoes li.checklist-row[data-item-key="${key}"]`);
const checked = (page: Page, key: string): Locator => row(page, key).locator('[role="radio"][aria-checked="true"]');
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });

const n = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' as const });

type Scope = { relatorioId: string };

/** Every cabine of the relatório complete, so its first sheet starts at its own plate. */
function seedCabines(scope: Scope, drafts: readonly OpDraft[]): OpDraft[] {
  const cabines = drafts.filter((d) => d.kind === 'create' && d.path.startsWith('location/') && (d.value as { kind?: string }).kind === 'cabine');
  return cabines.flatMap((d) => {
    const id = (d.value as { id: string }).id;
    return [
      officeDraft(account, scope, `location/${id}/se/type`, 'BLINDADA'),
      officeDraft(account, scope, `location/${id}/se/primary_kv`, n('13.8', 'kV')),
      officeDraft(account, scope, `location/${id}/se/secondary_kv`, n('380', 'V')),
      officeDraft(account, scope, `location/${id}/se/installed_kva`, n('1500', 'kVA')),
      officeDraft(account, scope, `location/${id}/env/temperature_c`, n('25', '°C')),
      officeDraft(account, scope, `location/${id}/env/humidity_pct`, n('65', '%')),
    ];
  });
}

/** Every reading of the sheet within its criterion (insulation and the ratio's captures and inputs). */
function seedReadings(scope: Scope, blockId: string): OpDraft[] {
  return TF.tests.flatMap((t) =>
    cellAddressesOf(TF, t.key).map((c) =>
      officeDraft(account, scope, `sheet/${blockId}/test/${c.testKey}/cell/${c.row}/${c.col}`, c.testKey === 'isolacao' ? n('150', 'GΩ') : n('100', null)),
    ),
  );
}

/** The non-oil checklist items answered C. */
const seedNonOil = (scope: Scope, blockId: string): OpDraft[] => NON_OIL.map((key) => officeDraft(account, scope, `sheet/${blockId}/checklist/${key}/result`, 'C'));

const seedConclusion = (scope: Scope, blockId: string): OpDraft[] => [
  officeDraft(account, scope, `sheet/${blockId}/conclusion/result`, 'aprovado'),
  officeDraft(account, scope, `sheet/${blockId}/conclusion/restriction`, 'sem_restricoes'),
];

/**
 * Resets Empresa B, signs in, pushes a standard relatório plus `seed` and opens the first sheet
 * of `type` (no subtype in the standard template) by address, with, given `plate`, the reading
 * job's suggestions of those plate keys pulled.
 */
async function setUp(
  page: Page,
  context: BrowserContext,
  seed: (scope: Scope, sheet: SeededSheet, drafts: readonly OpDraft[], sheets: readonly SeededSheet[]) => OpDraft[],
  plate: readonly string[] = [],
  type = 'transformador_forca',
): Promise<{ relatorioId: string; sheet: SeededSheet; suggestions: Record<string, string> }> {
  await resetEmpresaB(account, { standard: true });
  await signInForDurability(page, context, account.email);
  const built = newRelatorioDrafts(account);
  const scope = { relatorioId: built.relatorioId };
  const sheet = built.sheets.find((s) => s.blockType === type)!;
  await pushDrafts(page, database, [...built.drafts, ...seed(scope, sheet, built.drafts, built.sheets)]);
  const all = transformerPlateFields();
  const suggestions =
    plate.length === 0
      ? {}
      : await pushPlateSuggestions(account.companyId, built.relatorioId, { blockId: sheet.blockId, photoId: newId(), fields: Object.fromEntries(plate.map((key) => [key, all[key]!])) });
  await page.goto(`/relatorio/${built.relatorioId}/ficha/${sheet.blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await syncNowAndReturn(page);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  return { relatorioId: built.relatorioId, sheet, suggestions };
}

/** The outbox rows of the batch that wrote `path` (its latest op); the op alone when it has no batch. */
async function batchOf(page: Page, path: string): Promise<OutboxRow[]> {
  const rows = await outbox(page);
  const op = rows.filter((r) => r.path === path).at(-1)!;
  return op.batch_id === null ? [op] : rows.filter((r) => r.batch_id === op.batch_id);
}

const markPaths = (blockId: string, keys: readonly string[]) => keys.map((key) => `sheet/${blockId}/checklist/${key}/result`).sort();
const chipNamed = (page: Page, n: number) => field(page, 'tipo_de_isolacao').getByRole('button', { name: `Marcar ${n} ${n === 1 ? 'item' : 'itens'} de óleo como NA` });
const anyChip = (page: Page) => page.getByRole('button', { name: /itens? de óleo como NA$/ });

/** The plate keys the reading suggests in R8DRY-E2E-001 (the manufacturer and TAP ATUAL are the office's). */
const READ_KEYS = ['identificacao', 'n_serie', 'tipo', 'tipo_de_isolacao', 'potencia_nominal', 'data_fabricacao', 'tensao_nominal_at', 'tensao_nominal_bt', 'ligacao_secundaria'];

test('@p0 R8DRY-E2E-001 a dry transformador with no subtype is concluded: "Confirmar todos" writes the confirm pairs alone, the chip marks the eight oil items NA, VOL. ÓLEO is never missing', async ({ page, context }) => {
  test.setTimeout(240_000);
  const { relatorioId, sheet } = await setUp(
    page,
    context,
    (scope, s, drafts) => [
      ...seedCabines(scope, drafts),
      officeDraft(account, scope, `sheet/${s.blockId}/nameplate/fabricacao`, 'WEG'),
      officeDraft(account, scope, `sheet/${s.blockId}/nameplate/tap_atual`, '3'),
      ...seedNonOil(scope, s.blockId),
      ...seedReadings(scope, s.blockId),
      ...seedConclusion(scope, s.blockId),
    ],
    READ_KEYS,
  );
  const blockId = sheet.blockId;
  await expect(anyChip(page)).toHaveCount(0);

  // "Confirmar todos (9)": the nine confirm pairs alone, the plain toast; then the chip.
  await section(page).locator('.suggestion-group-head').getByRole('button', { name: 'Confirmar todos (9)' }).click();
  await expect(toast(page)).toContainText('9 campos confirmados');
  await expect(toast(page)).not.toContainText('itens de óleo');
  const confirmBatch = await batchOf(page, `sheet/${blockId}/nameplate/tipo_de_isolacao`);
  expect(confirmBatch).toHaveLength(9 * 2);
  expect(confirmBatch.some((r) => r.path.includes('/checklist/'))).toBe(false);
  for (const key of OIL) await expect(checked(page, key)).toHaveCount(0);
  await expect(missingMarker(page, 'vol_oleo')).toHaveCount(0);

  // The chip: one batch of exactly the eight NA puts, "Desfazer", the chip gone.
  await chipNamed(page, 8).click();
  await expect(toast(page)).toContainText('8 itens de óleo marcados NA');
  await expect(toast(page).getByRole('button', { name: 'Desfazer' })).toBeVisible();
  await expect(anyChip(page)).toHaveCount(0);
  const marks = await batchOf(page, `sheet/${blockId}/checklist/valvula_de_alivio/result`);
  expect(marks.map((r) => r.path).sort()).toEqual(markPaths(blockId, OIL));
  for (const mark of marks) expect(mark).toMatchObject({ kind: 'put', value: 'NA' });
  for (const key of OIL) await expect(checked(page, key)).toHaveAttribute('data-value', 'na');
  await expect(stepper(page).getByRole('button', { name: 'Placa, 0 faltando' })).toBeVisible();
  await expect(page.getByTestId('ficha-progress')).toHaveText('Ficha completa');

  // "Concluir ficha" concludes; no VOL. ÓLEO op was ever written.
  await page.getByRole('button', { name: `Mais opções da ficha ${sheet.tag}` }).click();
  await page.getByRole('menuitem', { name: 'Concluir ficha' }).click();
  await expect.poll(async () => (await outbox(page)).some((r) => r.path === `block/${blockId}/concluded_by`)).toBe(true);
  expect((await outbox(page)).some((r) => r.path === `sheet/${blockId}/nameplate/vol_oleo`)).toBe(false);

  // Reopened from the store: concluded, the eight rows NA, VOL. ÓLEO not marked, no chip.
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(page.locator('.sheet-header .sheet-meta').filter({ hasText: /^Concluída por / })).toBeVisible({ timeout: 30_000 });
  for (const key of OIL) await expect(checked(page, key)).toHaveAttribute('data-value', 'na');
  await expect(missingMarker(page, 'vol_oleo')).toHaveCount(0);
  await expect(anyChip(page)).toHaveCount(0);
});

test('@p0 R8DRY-E2E-002 the chip after "Confirmar" on EPÓXI: its "Desfazer" puts the eight results back, the insulation stays, the chip never comes back; the inverse syncs', async ({ page, context }) => {
  test.setTimeout(240_000);
  const { relatorioId, sheet, suggestions } = await setUp(page, context, (scope, _s, drafts) => seedCabines(scope, drafts), ['tipo_de_isolacao']);
  const blockId = sheet.blockId;
  const fill = field(page, 'tipo_de_isolacao').locator('.field.suggestion-field');
  await expect(fill).toBeVisible({ timeout: 30_000 });
  await expect(missingMarker(page, 'vol_oleo')).toHaveCount(1);

  await fill.getByRole('button', { name: 'Sugerido, EPÓXI, confirmar' }).click();
  await expect(toast(page)).toContainText('— confirmado');
  const confirm = await batchOf(page, `suggestion/${suggestions.tipo_de_isolacao}/status`);
  expect(confirm).toHaveLength(2);
  await expect(missingMarker(page, 'vol_oleo')).toHaveCount(0);

  await chipNamed(page, 8).click();
  await expect(toast(page)).toContainText('8 itens de óleo marcados NA');
  for (const key of OIL) await expect(checked(page, key)).toHaveAttribute('data-value', 'na');

  // "Desfazer": one inverse batch, the 8 results to null; the insulation stays EPÓXI.
  await toast(page).getByRole('button', { name: 'Desfazer' }).click();
  await expect.poll(async () => (await outbox(page)).filter((r) => r.path.endsWith('/valvula_de_alivio/result')).length).toBe(2);
  const inverse = await batchOf(page, `sheet/${blockId}/checklist/valvula_de_alivio/result`);
  expect(inverse.map((r) => r.path).sort()).toEqual(markPaths(blockId, OIL));
  for (const unmark of inverse) expect(unmark.value ?? null).toBeNull();
  for (const key of OIL) await expect(checked(page, key)).toHaveCount(0);
  await expect(field(page, 'tipo_de_isolacao').locator('select')).toHaveValue('EPÓXI');
  await expect(missingMarker(page, 'vol_oleo')).toHaveCount(0);
  await expect(anyChip(page)).toHaveCount(0);

  // The inverse syncs and is accepted: no outbox row is dead; after a reload the chip stays gone.
  await syncNow(page);
  expect((await outbox(page)).filter((r) => r.status === 'dead')).toHaveLength(0);
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(field(page, 'tipo_de_isolacao').locator('select')).toHaveValue('EPÓXI', { timeout: 30_000 });
  for (const key of OIL) await expect(checked(page, key)).toHaveCount(0);
  await expect(anyChip(page)).toHaveCount(0);
});

test('@p0 R8DRY-E2E-003 Á SECO picked by hand writes the insulation alone; the chip counts seven and never marks the item tapped C before', async ({ page, context }) => {
  test.setTimeout(240_000);
  const { relatorioId, sheet } = await setUp(page, context, (scope, _s, drafts) => seedCabines(scope, drafts));
  const blockId = sheet.blockId;
  await row(page, 'valvula_de_alivio').getByRole('radio', { name: 'Conforme', exact: true }).click();
  await expect(checked(page, 'valvula_de_alivio')).toHaveAttribute('data-value', 'c');

  await field(page, 'tipo_de_isolacao').locator('select').selectOption('Á SECO');
  await expect.poll(async () => (await outbox(page)).some((r) => r.path === `sheet/${blockId}/nameplate/tipo_de_isolacao` && r.value === 'Á SECO')).toBe(true);
  const pick = await batchOf(page, `sheet/${blockId}/nameplate/tipo_de_isolacao`);
  expect(pick.map((r) => r.path)).toEqual([`sheet/${blockId}/nameplate/tipo_de_isolacao`]);
  await expect(missingMarker(page, 'vol_oleo')).toHaveCount(0);

  await chipNamed(page, 7).click();
  await expect(toast(page)).toContainText('7 itens de óleo marcados NA');
  const marks = await batchOf(page, `sheet/${blockId}/checklist/elemento_secante/result`);
  expect(marks.map((r) => r.path).sort()).toEqual(markPaths(blockId, OIL.slice(1)));
  expect(marks.some((r) => r.path.includes('/valvula_de_alivio/'))).toBe(false);

  await toast(page).getByRole('button', { name: 'Desfazer' }).click();
  for (const key of OIL.slice(1)) await expect(checked(page, key)).toHaveCount(0);
  await expect(checked(page, 'valvula_de_alivio')).toHaveAttribute('data-value', 'c');

  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(checked(page, 'valvula_de_alivio')).toHaveAttribute('data-value', 'c', { timeout: 30_000 });
  for (const key of OIL.slice(1)) await expect(checked(page, key)).toHaveCount(0);
  await expect(field(page, 'tipo_de_isolacao').locator('select')).toHaveValue('Á SECO');
});

test('@p1 R8DRY-E2E-004 a TP whose plate is copied with "Igual à ⟨TAG⟩?" from a sheet holding EPÓXI: VOL. ÓLEO is not missing and the chip is offered', async ({ page, context }) => {
  test.setTimeout(240_000);
  let source: SeededSheet | null = null;
  const { sheet } = await setUp(
    page,
    context,
    (scope, target, _drafts, sheets) => {
      source = sheets.find((s) => s.blockType === 'tp' && s.blockId !== target.blockId)!;
      return [
        officeDraft(account, scope, `sheet/${source.blockId}/nameplate/fabricacao`, 'WEG'),
        officeDraft(account, scope, `sheet/${source.blockId}/nameplate/tipo`, 'TPU-15'),
        officeDraft(account, scope, `sheet/${source.blockId}/nameplate/tipo_de_isolacao`, 'EPÓXI'),
      ];
    },
    [],
    'tp',
  );
  const blockId = sheet.blockId;
  const from = source!;
  await expect(missingMarker(page, 'vol_oleo')).toHaveCount(1);
  await expect(anyChip(page)).toHaveCount(0);

  await page.getByRole('button', { name: `Igual à ${from.tag}?` }).click();
  await expect.poll(async () => (await outbox(page)).some((r) => r.path === `sheet/${blockId}/nameplate/tipo_de_isolacao` && r.value === 'EPÓXI')).toBe(true);
  const copy = await batchOf(page, `sheet/${blockId}/nameplate/tipo_de_isolacao`);
  expect(copy.some((r) => r.path.includes('/checklist/'))).toBe(false);
  await expect(field(page, 'tipo_de_isolacao').locator('select')).toHaveValue('EPÓXI');
  await expect(missingMarker(page, 'vol_oleo')).toHaveCount(0);
  await expect(chipNamed(page, 8)).toBeVisible();
});

test('@p1 R8DRY-E2E-005 "Confirmar" on EPÓXI with every oil item already answered: no chip, the confirm pair alone, a plain toast with no "Desfazer"', async ({ page, context }) => {
  test.setTimeout(240_000);
  const { sheet, suggestions } = await setUp(
    page,
    context,
    (scope, s, drafts) => [...seedCabines(scope, drafts), ...OIL.map((key) => officeDraft(account, scope, `sheet/${s.blockId}/checklist/${key}/result`, 'C'))],
    ['tipo_de_isolacao'],
  );
  const blockId = sheet.blockId;
  const fill = field(page, 'tipo_de_isolacao').locator('.field.suggestion-field');
  await expect(fill).toBeVisible({ timeout: 30_000 });
  for (const key of OIL) await expect(checked(page, key)).toHaveAttribute('data-value', 'c');

  await fill.getByRole('button', { name: 'Sugerido, EPÓXI, confirmar' }).click();
  await expect(toast(page)).toContainText('— confirmado');
  await expect(toast(page)).not.toContainText('itens de óleo');
  await expect(toast(page).getByRole('button', { name: 'Desfazer' })).toHaveCount(0);
  const batch = await batchOf(page, `sheet/${blockId}/nameplate/tipo_de_isolacao`);
  expect(batch.map((r) => r.path).sort()).toEqual([`sheet/${blockId}/nameplate/tipo_de_isolacao`, `suggestion/${suggestions.tipo_de_isolacao}/status`].sort());
  await expect(field(page, 'tipo_de_isolacao').locator('select')).toHaveValue('EPÓXI');
  await expect(anyChip(page)).toHaveCount(0);
  for (const key of OIL) await expect(checked(page, key)).toHaveAttribute('data-value', 'c');
});
