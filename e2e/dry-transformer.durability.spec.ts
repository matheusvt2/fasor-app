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
 * Review 2026-10-08, Decision 2 (H-4, MKT-7): a dry transformador de força of the standard
 * template (no subtype) can be concluded. Confirming its TIPO DE ISOLAÇÃO as EPÓXI or Á SECO
 * ("Confirmar todos", one "Confirmar", the select picked by hand, a value typed over the
 * guess) writes the oil items still unanswered as NA in the same batch, with "Desfazer", and
 * VOL. ÓLEO stops counting as missing. The plate reading is seeded as the reading job writes
 * it (`pushPlateSuggestions`, without its photo); what no AC exercises (the cabine, the
 * readings, the non-oil checklist items, the conclusion pair) is seeded by office ops. Runs on
 * the durability projects (the matrix covers the commit path); each worker has its own
 * Empresa B (E6-Q7).
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
 * Resets Empresa B, signs in, pushes a standard relatório plus `seed` for its first
 * transformador de força sheet and, with `plate`, the reading job's suggestions of those plate
 * keys; opens the sheet by address once the device holds them. No subtype: the standard
 * template's transformer has none.
 */
async function setUp(
  page: Page,
  context: BrowserContext,
  seed: (scope: Scope, sheet: SeededSheet, drafts: readonly OpDraft[]) => OpDraft[],
  plate: readonly string[] = [],
): Promise<{ relatorioId: string; sheet: SeededSheet; suggestions: Record<string, string> }> {
  await resetEmpresaB(account, { standard: true });
  await signInForDurability(page, context, account.email);
  const built = newRelatorioDrafts(account);
  const scope = { relatorioId: built.relatorioId };
  const sheet = built.sheets.find((s) => s.blockType === 'transformador_forca')!;
  await pushDrafts(page, database, [...built.drafts, ...seed(scope, sheet, built.drafts)]);
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

/** The outbox rows of the batch that wrote `path` (its latest op). */
async function batchOf(page: Page, path: string): Promise<OutboxRow[]> {
  const rows = await outbox(page);
  const op = rows.filter((r) => r.path === path).at(-1)!;
  expect(op.batch_id).not.toBeNull();
  return rows.filter((r) => r.batch_id === op.batch_id);
}

const markPaths = (blockId: string, keys: readonly string[]) => keys.map((key) => `sheet/${blockId}/checklist/${key}/result`).sort();

/** The plate keys the reading suggests in R8DRY-E2E-001 (the manufacturer and TAP ATUAL are the office's). */
const READ_KEYS = ['identificacao', 'n_serie', 'tipo', 'tipo_de_isolacao', 'potencia_nominal', 'data_fabricacao', 'tensao_nominal_at', 'tensao_nominal_bt', 'ligacao_secundaria'];

test('@p0 R8DRY-E2E-001 a dry transformador with no subtype is concluded: "Confirmar todos" with EPÓXI marks the eight oil items NA in its batch, VOL. ÓLEO is never missing', async ({ page, context }) => {
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
  for (const key of OIL) await expect(checked(page, key)).toHaveCount(0);

  // "Confirmar todos (9)": the nine plate fields and the eight oil marks, one batch, with "Desfazer".
  await section(page).locator('.suggestion-group-head').getByRole('button', { name: 'Confirmar todos (9)' }).click();
  await expect(toast(page)).toContainText('9 campos confirmados · 8 itens de óleo marcados NA');
  await expect(toast(page).getByRole('button', { name: 'Desfazer' })).toBeVisible();
  const batch = await batchOf(page, `sheet/${blockId}/nameplate/tipo_de_isolacao`);
  expect(batch).toHaveLength(9 * 2 + 8);
  const marks = batch.filter((r) => r.path.includes('/checklist/'));
  expect(marks.map((r) => r.path).sort()).toEqual(markPaths(blockId, OIL));
  for (const mark of marks) expect(mark).toMatchObject({ kind: 'put', value: 'NA' });
  for (const key of OIL) await expect(checked(page, key)).toHaveAttribute('data-value', 'na');

  // VOL. ÓLEO stays empty and is never marked missing; the plate step has nothing left.
  await expect(missingMarker(page, 'vol_oleo')).toHaveCount(0);
  await expect(stepper(page).getByRole('button', { name: 'Placa, 0 faltando' })).toBeVisible();
  await expect(page.getByTestId('ficha-progress')).toHaveText('Ficha completa');

  // "Concluir ficha" concludes.
  await page.getByRole('button', { name: `Mais opções da ficha ${sheet.tag}` }).click();
  await page.getByRole('menuitem', { name: 'Concluir ficha' }).click();
  await expect.poll(async () => (await outbox(page)).some((r) => r.path === `block/${blockId}/concluded_by`)).toBe(true);
  const rows = await outbox(page);
  expect(rows.some((r) => r.path === `sheet/${blockId}/nameplate/vol_oleo`)).toBe(false);
  expect(rows.filter((r) => r.path.includes('/checklist/') && r.batch_id !== batch[0]!.batch_id).filter((r) => OIL.some((key) => r.path.includes(`/${key}/`)))).toHaveLength(0);

  // Reopened from the store: concluded, the eight rows NA, VOL. ÓLEO empty and not marked.
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(page.locator('.sheet-header .sheet-meta').filter({ hasText: /^Concluída por / })).toBeVisible({ timeout: 30_000 });
  for (const key of OIL) await expect(checked(page, key)).toHaveAttribute('data-value', 'na');
  await expect(missingMarker(page, 'vol_oleo')).toHaveCount(0);
});

test('@p0 R8DRY-E2E-002 one "Confirmar" on EPÓXI says the eight marks and offers "Desfazer", which puts the results, the insulation and the suggestion back; the inverse syncs', async ({ page, context }) => {
  test.setTimeout(240_000);
  const { relatorioId, sheet, suggestions } = await setUp(page, context, (scope, _s, drafts) => seedCabines(scope, drafts), ['tipo_de_isolacao']);
  const blockId = sheet.blockId;
  const fill = field(page, 'tipo_de_isolacao').locator('.field.suggestion-field');
  await expect(fill).toBeVisible({ timeout: 30_000 });
  await expect(missingMarker(page, 'vol_oleo')).toHaveCount(1);

  await fill.getByRole('button', { name: 'Sugerido, EPÓXI, confirmar' }).click();
  await expect(toast(page)).toContainText('— confirmado · 8 itens de óleo marcados NA');
  const batch = await batchOf(page, `sheet/${blockId}/nameplate/tipo_de_isolacao`);
  expect(batch).toHaveLength(2 + 8);
  expect(batch.filter((r) => r.path.includes('/checklist/')).map((r) => r.path).sort()).toEqual(markPaths(blockId, OIL));
  for (const key of OIL) await expect(checked(page, key)).toHaveAttribute('data-value', 'na');
  await expect(missingMarker(page, 'vol_oleo')).toHaveCount(0);

  // "Desfazer": one inverse batch, the 8 results and the insulation to null, the suggestion pending.
  await toast(page).getByRole('button', { name: 'Desfazer' }).click();
  await expect.poll(async () => (await outbox(page)).some((r) => r.path === `suggestion/${suggestions.tipo_de_isolacao}/status` && r.value === 'pending')).toBe(true);
  const inverse = await batchOf(page, `suggestion/${suggestions.tipo_de_isolacao}/status`);
  expect(inverse).toHaveLength(2 + 8);
  expect(inverse.find((r) => r.path === `sheet/${blockId}/nameplate/tipo_de_isolacao`)?.value ?? null).toBeNull();
  const unmarks = inverse.filter((r) => r.path.includes('/checklist/'));
  expect(unmarks.map((r) => r.path).sort()).toEqual(markPaths(blockId, OIL));
  for (const unmark of unmarks) expect(unmark.value ?? null).toBeNull();

  // The field shows the suggestion again, the rows read unset, VOL. ÓLEO is missing again.
  await expect(fill).toBeVisible();
  for (const key of OIL) await expect(checked(page, key)).toHaveCount(0);
  await expect(missingMarker(page, 'vol_oleo')).toHaveCount(1);

  // The inverse syncs and is accepted: no outbox row is dead; the state holds after a reload.
  await syncNow(page);
  expect((await outbox(page)).filter((r) => r.status === 'dead')).toHaveLength(0);
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(field(page, 'tipo_de_isolacao').locator('.field.suggestion-field')).toBeVisible({ timeout: 30_000 });
  for (const key of OIL) await expect(checked(page, key)).toHaveCount(0);
});

test('@p0 R8DRY-E2E-003 Á SECO picked by hand marks the seven oil items left NA in one batch with "Desfazer"; the item tapped C before stays C', async ({ page, context }) => {
  test.setTimeout(240_000);
  const { sheet } = await setUp(page, context, (scope, _s, drafts) => seedCabines(scope, drafts));
  const blockId = sheet.blockId;
  await row(page, 'valvula_de_alivio').getByRole('radio', { name: 'Conforme', exact: true }).click();
  await expect(checked(page, 'valvula_de_alivio')).toHaveAttribute('data-value', 'c');

  await field(page, 'tipo_de_isolacao').locator('select').selectOption('Á SECO');
  await expect(toast(page)).toHaveText(/7 itens de óleo marcados NA/);
  await expect(toast(page).getByRole('button', { name: 'Desfazer' })).toBeVisible();
  const batch = await batchOf(page, `sheet/${blockId}/nameplate/tipo_de_isolacao`);
  expect(batch).toHaveLength(1 + 7);
  expect(batch.find((r) => r.path === `sheet/${blockId}/nameplate/tipo_de_isolacao`)?.value).toBe('Á SECO');
  expect(batch.filter((r) => r.path.includes('/checklist/')).map((r) => r.path).sort()).toEqual(markPaths(blockId, OIL.slice(1)));
  expect(batch.some((r) => r.path.includes('/valvula_de_alivio/'))).toBe(false);
  await expect(missingMarker(page, 'vol_oleo')).toHaveCount(0);

  await page.reload();
  await expect(checked(page, 'valvula_de_alivio')).toHaveAttribute('data-value', 'c', { timeout: 30_000 });
  for (const key of OIL.slice(1)) await expect(checked(page, key)).toHaveAttribute('data-value', 'na');
  await expect(field(page, 'tipo_de_isolacao').locator('select')).toHaveValue('Á SECO');
});

test('@p1 R8DRY-E2E-004 Á SECO typed over a pending EPÓXI writes the put, the discard and the eight marks in one batch with "Desfazer"', async ({ page, context }) => {
  test.setTimeout(240_000);
  const { sheet, suggestions } = await setUp(page, context, (scope, _s, drafts) => seedCabines(scope, drafts), ['tipo_de_isolacao']);
  const blockId = sheet.blockId;
  const guess = field(page, 'tipo_de_isolacao').locator('.field.suggestion-field input.sv');
  await expect(guess).toHaveValue('EPÓXI', { timeout: 30_000 });
  await guess.fill('Á SECO');
  await guess.press('Enter');
  await expect(toast(page)).toHaveText(/8 itens de óleo marcados NA/);
  await expect(toast(page).getByRole('button', { name: 'Desfazer' })).toBeVisible();
  const batch = await batchOf(page, `sheet/${blockId}/nameplate/tipo_de_isolacao`);
  expect(batch).toHaveLength(2 + 8);
  expect(batch.find((r) => r.path === `sheet/${blockId}/nameplate/tipo_de_isolacao`)?.value).toBe('Á SECO');
  expect(batch.find((r) => r.path === `suggestion/${suggestions.tipo_de_isolacao}/status`)?.value).toBe('discarded');
  expect(batch.filter((r) => r.path.includes('/checklist/')).map((r) => r.path).sort()).toEqual(markPaths(blockId, OIL));
});
