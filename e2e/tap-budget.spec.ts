import { getDefinition, type OpDraft } from '@app/domain';
import type { Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { pushLastNameplate } from './support/push-server-ops.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { instrumentDraft, newRelatorioDrafts, officeDraft, pushDrafts, type SeededSheet } from './support/relatorio-seed.ts';
import { syncNowAndReturn } from './support/sync.ts';
import { tapCounter, type TapCounter } from './support/taps.ts';

/*
 * Story 12.6 AC1 (5.1-E2E-001, test-design-progress-system.md): the tap budget as a test.
 * J1 (SEC-ENEL, a plate copied from the last visit) and J3 (SEC-ENEL-2, the next
 * seccionadora) of `review-journey-2026-09-24.md` § 6, at 768 x 1024, offline once seeded
 * and synced. Taps and keystrokes are counted by a page-level listener, not by the spec: one
 * trusted `pointerdown` per tap (immune to a click a `label` forwards) and one trusted
 * `keydown` per character, Enter, Tab or Backspace. Every tap is a `humanTap` whose effect
 * is awaited, so a lost tap fails instead of costing a second one. Navigation to the first
 * sheet is not counted; J1's "Concluir ficha" lands on J3's sheet.
 */

/**
 * The budget, in taps and keystrokes. The values are the counts measured after Story 12.5;
 * a change that adds a tap or a keystroke to either journey fails here.
 *
 * - Journey review baseline (`main` at d149a22, 768 px): J1 24 taps + 1 lost, 87 keystrokes
 *   (a typed plate); J3 9 taps + 2 lost, 36 keystrokes.
 * - Batch C (Stories 12.3/12.4, 12.3-E2E-004, a typed plate): J1 21 taps, 83 keystrokes;
 *   J3 7 taps, 47 keystrokes.
 * - Story targets (epic 12 context): J1 at most 12 taps with a copied plate; J3 at most 5
 *   taps. J3 is narrowed to 7 taps and 47 keystrokes: D-3 never copies IDENTIFICAÇÃO and
 *   Nº SÉRIE, so the second seccionadora types its own two per-unit fields (2 taps, 11 keys).
 */
export const TAP_BUDGET = {
  J1: { taps: 9, keys: 36 },
  J3: { taps: 7, keys: 47 },
} as const;

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  // This worker's Empresa B (E6-Q7): its company, its user and its device database.
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});
const EFFECT_MS = 3_000;
const READINGS = ['150', '160', '170', '180', '190', '200', '100', '110', '120'];
const SECCIONADORA = getDefinition('v2', 'cabine_primaria', 'chave_seccionadora');

const toast = (page: Page) => page.getByTestId('toast');
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const bulk = (page: Page, name: string) => page.locator('#ficha-step-verificacoes .bulk-action-bar').getByRole('button', { name });

/** The page-level counter: installed before any script of every document the context loads. */
function installCounter(): void {
  const w = window as unknown as { tapBudget: { taps: number; keys: number } };
  w.tapBudget = { taps: 0, keys: 0 };
  window.addEventListener(
    'pointerdown',
    (event) => {
      if (event.isTrusted) w.tapBudget.taps += 1;
    },
    true,
  );
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.isTrusted && (event.key.length === 1 || event.key === 'Enter' || event.key === 'Tab' || event.key === 'Backspace')) w.tapBudget.keys += 1;
    },
    true,
  );
}

const resetCount = (page: Page) => page.evaluate(() => ((window as unknown as { tapBudget: { taps: number; keys: number } }).tapBudget = { taps: 0, keys: 0 }));
const readCount = (page: Page) => page.evaluate(() => ({ ...(window as unknown as { tapBudget: { taps: number; keys: number } }).tapBudget }));

/** A text field tapped and typed. */
async function typeField(page: Page, c: TapCounter, label: string, value: string): Promise<void> {
  const input = page.getByLabel(label, { exact: true });
  await c.tap(label, input, () => expect(input).toBeFocused({ timeout: EFFECT_MS }));
  await c.type(value);
}

/** Both pickers of a seccionadora with no suggestion yet: open, pick MG-01 (two taps each). */
async function pickInstruments(page: Page, c: TapCounter): Promise<void> {
  for (const testKey of ['isolacao', 'resistencia_contato']) {
    const section = page.locator(`section[data-test-key="${testKey}"]`);
    await c.tap(`${testKey} picker`, section.getByRole('button', { name: /^Instrumento/ }), () =>
      expect(section.getByRole('radiogroup', { name: 'Instrumentos cadastrados' })).toBeVisible({ timeout: EFFECT_MS }),
    );
    await c.tap(`${testKey} MG-01`, section.getByRole('radio', { name: /^MG-01/ }), () =>
      expect(section.getByRole('button', { name: 'Instrumento MG-01 — Megôhmetro' })).toBeVisible({ timeout: EFFECT_MS }),
    );
  }
}

/** The first reading tapped, the nine typed with Enter (the run ends on the primary). */
async function readings(page: Page, c: TapCounter): Promise<void> {
  const first = page.getByRole('textbox', { name: 'T1, Valor', exact: true });
  await c.tap('first reading', first, () => expect(first).toBeFocused({ timeout: EFFECT_MS }));
  for (const value of READINGS) {
    await c.type(value);
    await c.press('Enter');
  }
  await expect(page.locator('#ficha-primary')).toBeFocused();
  await expect(stepper(page).getByRole('button', { name: 'Ensaios, 0 faltando' })).toBeVisible();
}

/** The suggested conclusion pair confirmed with one tap. */
async function confirmPair(page: Page, c: TapCounter): Promise<void> {
  await c.tap('Confirmar the suggestion', page.getByRole('group', { name: 'Sugestão' }).getByRole('button', { name: 'Confirmar' }), () =>
    expect(page.getByRole('radiogroup', { name: 'Restrições' }).getByRole('radio', { name: 'Sem restrições' })).toHaveAttribute('aria-checked', 'true', { timeout: EFFECT_MS }),
  );
}

async function conclude(page: Page, c: TapCounter, nextBlockId: string): Promise<void> {
  await expect(page.getByTestId('ficha-progress')).toHaveText('Ficha completa');
  await c.tap('Concluir ficha', page.locator('#ficha-primary'), async () => {
    await expect(toast(page)).toContainText('Ficha concluída', { timeout: EFFECT_MS });
    await expect(page).toHaveURL(new RegExp(`/ficha/${nextBlockId}$`), { timeout: EFFECT_MS });
  });
}

/** Records one journey's count as an annotation and on the console; the counter and the spec's own tally must agree. */
async function report(page: Page, label: string, c: TapCounter): Promise<{ taps: number; keys: number }> {
  const counted = await readCount(page);
  const text = `${counted.taps} taps, ${counted.keys} keystrokes (budget ${TAP_BUDGET[label as keyof typeof TAP_BUDGET].taps} taps, ${TAP_BUDGET[label as keyof typeof TAP_BUDGET].keys} keystrokes)`;
  test.info().annotations.push({ type: `5.1-E2E-001 ${label}`, description: text });
  console.log(`5.1-E2E-001 ${label}: ${text}`);
  expect(counted, `${label}: the page listener and the spec's taps agree`).toEqual({ taps: c.taps, keys: c.keys });
  return counted;
}

/** The sheet right after `sheet` in tree (template) order. */
function after(sheets: readonly SeededSheet[], sheet: SeededSheet): SeededSheet {
  const at = sheets.findIndex((s) => s.blockId === sheet.blockId);
  expect(sheets.length, `a sheet after ${sheet.tag}`).toBeGreaterThan(at + 1);
  return sheets[at + 1]!;
}

/** The value a plate field of each kind holds, as the office typed it on the last visit. */
function plateValue(kind: string, key: string, unit: string | undefined, options: readonly string[] | undefined): unknown {
  if (kind === 'number') return { raw: '630', unit: unit ?? null, state: 'measured' };
  if (kind === 'date') return '2020-01-01';
  if (kind === 'select') return options![0];
  if (kind === 'voltage_class') return '15';
  return `LV-${key}`;
}

test('@p0 5.1-E2E-001 the tap budget at 768 px, offline: J1 with the plate copied from the last visit and J3 the next seccionadora stay within TAP_BUDGET, every tap on the first try', async ({ page, context }) => {
  test.setTimeout(240_000);
  await context.addInitScript(installCounter);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  await signIn(page, account.email);

  const built = newRelatorioDrafts(account);
  const scope = { relatorioId: built.relatorioId };
  const enel = built.sheets.filter((sheet) => sheet.blockType === 'chave_seccionadora' && sheet.locationName === 'Cubículo Enel');
  expect(enel).toHaveLength(2);
  const [secEnel, secEnel2] = enel as [SeededSheet, SeededSheet];
  const created = (prefix: string) => built.drafts.filter((d) => d.kind === 'create' && d.path.startsWith(prefix)).map((d) => d.value as Record<string, unknown>);
  const cabineId = created('location/').find((row) => row.name === 'Cubículo Enel')!.id as string;
  const equipmentId = created('block/').find((row) => row.id === secEnel.blockId)!.equipment_id as string;
  // The cabine's data complete, so the sheets start at their own plate.
  const n = (raw: string, unit: string) => ({ raw, unit, state: 'measured' as const });
  const cabine: OpDraft[] = [
    officeDraft(account, scope, `location/${cabineId}/se/type`, 'BLINDADA'),
    officeDraft(account, scope, `location/${cabineId}/se/primary_kv`, n('13.8', 'kV')),
    officeDraft(account, scope, `location/${cabineId}/se/secondary_kv`, n('380', 'V')),
    officeDraft(account, scope, `location/${cabineId}/se/installed_kva`, n('1500', 'kVA')),
    officeDraft(account, scope, `location/${cabineId}/env/temperature_c`, n('25', '°C')),
    officeDraft(account, scope, `location/${cabineId}/env/humidity_pct`, n('65', '%')),
  ];
  await pushDrafts(page, database, [...built.drafts, instrumentDraft(account), ...cabine]);
  // SEC-ENEL's plate from its last issued relatório (every field but the TAG, which the block prefills).
  const fields = Object.fromEntries(SECCIONADORA.nameplate.filter((f) => f.key !== 'tag').map((f) => [f.key, plateValue(f.kind, f.key, f.unit, f.options)]));
  await pushLastNameplate(
    account.companyId,
    built.projectId,
    equipmentId,
    { relatorio_id: newId(), revision_number: 1, issued_at: '2025-09-08T12:00:00.000Z', seed_version: 'v2', block_type: 'chave_seccionadora', fields: fields as never },
    account.userId,
  );
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  await syncNowAndReturn(page);

  // --- J1 SEC-ENEL: the plate from the last visit ------------------------------------------
  await page.goto(`/relatorio/${built.relatorioId}/ficha/${secEnel.blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  const lastVisit = page.getByRole('group', { name: 'Copiar dados de placa' }).getByRole('button', { name: `Copiar da última visita (${secEnel.tag})` });
  await expect(lastVisit).toBeVisible({ timeout: 30_000 });
  await expect(stepper(page).getByRole('button', { name: 'Ensaios, 9 faltando' })).toBeVisible();
  await context.setOffline(true);
  await resetCount(page);

  const j1 = tapCounter(page, EFFECT_MS);
  await j1.tap('Copiar da última visita', lastVisit, async () => {
    await expect(toast(page)).toContainText('copiados', { timeout: EFFECT_MS });
    await expect(stepper(page).getByRole('button', { name: 'Placa, 0 faltando' })).toBeVisible({ timeout: EFFECT_MS });
  });
  await j1.tap('Marcar os restantes como Conforme', bulk(page, 'Marcar os restantes como Conforme'), async () => {
    await expect(toast(page)).toContainText('marcados Conforme', { timeout: EFFECT_MS });
    await expect(stepper(page).getByRole('button', { name: 'Verificações, 0 faltando' })).toBeVisible({ timeout: EFFECT_MS });
  });
  await pickInstruments(page, j1);
  await readings(page, j1);
  await confirmPair(page, j1);
  await conclude(page, j1, secEnel2.blockId);
  const j1Count = await report(page, 'J1', j1);

  // --- J3 SEC-ENEL-2: "Igual à", its own unit, "Repetir", the suggested instruments --------
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible();
  await resetCount(page);
  const j3 = tapCounter(page, EFFECT_MS);
  const chips = page.getByRole('group', { name: 'Copiar dados de placa' });
  await j3.tap(`Igual à ${secEnel.tag}?`, chips.getByRole('button', { name: `Igual à ${secEnel.tag}?` }), async () => {
    await expect(toast(page)).toContainText(`Copiado de ${secEnel.tag}`, { timeout: EFFECT_MS });
    await expect(chips).toHaveCount(0, { timeout: EFFECT_MS });
  });
  await typeField(page, j3, 'Identificação', 'SC-02');
  await typeField(page, j3, 'Nº série', '654321');
  await expect(stepper(page).getByRole('button', { name: 'Placa, 0 faltando' })).toBeVisible();
  await j3.tap('Repetir da ficha anterior do mesmo tipo', bulk(page, 'Repetir da ficha anterior do mesmo tipo'), async () => {
    await expect(toast(page)).toContainText(`Padrão de ${secEnel.tag} repetido`, { timeout: EFFECT_MS });
    await expect(stepper(page).getByRole('button', { name: 'Verificações, 0 faltando' })).toBeVisible({ timeout: EFFECT_MS });
  });
  for (const testKey of ['isolacao', 'resistencia_contato']) {
    await expect(page.locator(`section[data-test-key="${testKey}"] .instrument-picker`)).toHaveAttribute('data-state', 'suggested');
  }
  await readings(page, j3);
  await confirmPair(page, j3);
  await conclude(page, j3, after(built.sheets, secEnel2).blockId);
  const j3Count = await report(page, 'J3', j3);
  await context.setOffline(false);

  expect(j1Count.taps, 'J1 taps').toBeLessThanOrEqual(TAP_BUDGET.J1.taps);
  expect(j1Count.keys, 'J1 keystrokes').toBeLessThanOrEqual(TAP_BUDGET.J1.keys);
  expect(j3Count.taps, 'J3 taps').toBeLessThanOrEqual(TAP_BUDGET.J3.taps);
  expect(j3Count.keys, 'J3 keystrokes').toBeLessThanOrEqual(TAP_BUDGET.J3.keys);
});
