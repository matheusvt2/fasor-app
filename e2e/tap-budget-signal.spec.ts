import { getDefinition, type OpDraft } from '@app/domain';
import type { Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { expectCameraOpen } from './support/photos.ts';
import { pushLastNameplate } from './support/push-server-ops.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { instrumentDraft, newRelatorioDrafts, officeDraft, pushDrafts, type SeededSheet } from './support/relatorio-seed.ts';
import { syncNowAndReturn } from './support/sync.ts';
import { tapCounter, type TapCounter } from './support/taps.ts';

/*
 * Story 9.1, SM-3 (EXPERIENCE.md › Interaction budget; E12-A5 recount): a fully conforme
 * seccionadora with its plate copied from the last visit, filled with signal, costs at most
 * 20 taps and 15 keystrokes, the readings coming from "Ler visor". J1 of `tap-budget.spec.ts`
 * (SEC-ENEL at 768 x 1024, the cabine complete, one instrument), online: the plate copy, the
 * bulk Conforme and the two instruments (8 base taps with the conclusion pair and "Concluir
 * ficha"), then "Ler visor", nine shutters and "Concluir", one tap on the first suggested
 * cell and Enter down the run. The chromium fake camera stands in for the tablet's; the
 * compose api reads each shot with the `fake` providers (147 GΩ on the insulation tables,
 * 87 µΩ on the contact resistance). "Sincronizar agora" stands in for the sync timer
 * (decision C-4) and is pressed outside the count. Taps and keystrokes are counted by the
 * same page listener as the offline budget.
 */

export const SIGNAL_BUDGET = { taps: 20, keys: 15 } as const;

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

const EFFECT_MS = 3_000;
const SECCIONADORA = getDefinition('v2', 'cabine_primaria', 'chave_seccionadora');
const GOHM = 'GΩ';
const MICRO = 'µΩ';
/** The nine cells in run order, their accessible names and what the display reads there. */
const CELLS: { name: string; path: (blockId: string) => string; value: { raw: string; unit: string } }[] = [
  ...[0, 1, 2, 3, 4, 5].map((row) => ({
    name: `${['T1', 'T3', 'T5', 'Fase A', 'Fase B', 'Fase C'][row]}, Valor`,
    path: (blockId: string) => `sheet/${blockId}/test/isolacao/cell/${row}/0`,
    value: { raw: '147', unit: GOHM },
  })),
  ...[0, 1, 2].map((row) => ({
    name: `${['T1-T2', 'T3-T4', 'T5-T6'][row]}, Valor`,
    path: (blockId: string) => `sheet/${blockId}/test/resistencia_contato/cell/${row}/0`,
    value: { raw: '87', unit: MICRO },
  })),
];

const toast = (page: Page) => page.getByTestId('toast');
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const bulk = (page: Page, name: string) => page.locator('#ficha-step-verificacoes .bulk-action-bar').getByRole('button', { name });

/** The page-level counter (as `tap-budget.spec.ts`): one trusted pointerdown per tap, one trusted keydown per key. */
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

type Count = { taps: number; keys: number };
const setCount = (page: Page, count: Count) => page.evaluate((next) => ((window as unknown as { tapBudget: Count }).tapBudget = { ...next }), count);
const readCount = (page: Page) => page.evaluate(() => ({ ...(window as unknown as { tapBudget: Count }).tapBudget }));

/** Both pickers of a seccionadora: open, pick MG-01 (two taps each). */
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

/** "Sincronizar agora", outside the count (the stand-in for the sync timer): the counter is put back as it was. */
async function syncOutsideCount(page: Page): Promise<void> {
  const saved = await readCount(page);
  await syncNowAndReturn(page);
  await setCount(page, saved);
}

/** The value a plate field of each kind holds, as the office typed it on the last visit. */
function plateValue(kind: string, key: string, unit: string | undefined, options: readonly string[] | undefined): unknown {
  if (kind === 'number') return { raw: '630', unit: unit ?? null, state: 'measured' };
  if (kind === 'date') return '2020-01-01';
  if (kind === 'select') return options![0];
  if (kind === 'voltage_class') return '15';
  return `LV-${key}`;
}

test('@p0 9.1-E2E-005 SM-3 with signal: a conforme seccionadora with a copied plate and its readings from "Ler visor" in at most 20 taps and 15 keystrokes', async ({ page, context }) => {
  test.setTimeout(300_000);
  await context.addInitScript(installCounter);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  await signIn(page, account.email);

  const built = newRelatorioDrafts(account);
  const scope = { relatorioId: built.relatorioId };
  const enel = built.sheets.filter((sheet) => sheet.blockType === 'chave_seccionadora' && sheet.locationName === 'Cubículo Enel');
  const [secEnel, secEnel2] = enel as [SeededSheet, SeededSheet];
  const created = (prefix: string) => built.drafts.filter((d) => d.kind === 'create' && d.path.startsWith(prefix)).map((d) => d.value as Record<string, unknown>);
  const cabineId = created('location/').find((row) => row.name === 'Cubículo Enel')!.id as string;
  const equipmentId = created('block/').find((row) => row.id === secEnel.blockId)!.equipment_id as string;
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

  await page.goto(`/relatorio/${built.relatorioId}/ficha/${secEnel.blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  const lastVisit = page.getByRole('group', { name: 'Copiar dados de placa' }).getByRole('button', { name: `Copiar da última visita (${secEnel.tag})` });
  await expect(lastVisit).toBeVisible({ timeout: 30_000 });
  await expect(stepper(page).getByRole('button', { name: 'Ensaios, 9 faltando' })).toBeVisible();
  await setCount(page, { taps: 0, keys: 0 });

  const c = tapCounter(page, EFFECT_MS);
  await c.tap('Copiar da última visita', lastVisit, async () => {
    await expect(toast(page)).toContainText('copiados', { timeout: EFFECT_MS });
    await expect(stepper(page).getByRole('button', { name: 'Placa, 0 faltando' })).toBeVisible({ timeout: EFFECT_MS });
  });
  await c.tap('Marcar os restantes como Conforme', bulk(page, 'Marcar os restantes como Conforme'), async () => {
    await expect(toast(page)).toContainText('marcados Conforme', { timeout: EFFECT_MS });
    await expect(stepper(page).getByRole('button', { name: 'Verificações, 0 faltando' })).toBeVisible({ timeout: EFFECT_MS });
  });
  await pickInstruments(page, c);

  // "Ler visor" on the first table: nine shots, one per row across the sheet's three tables.
  const opener = page.locator('#ficha-step-ensaios .ficha-mt[data-table-key="contato_aberto"] .mt-actions').getByRole('button', { name: 'Ler visor' });
  let view = page.getByRole('dialog', { name: 'Câmera' });
  await c.tap('Ler visor', opener, async () => {
    view = await expectCameraOpen(page);
  });
  for (let shot = 1; shot <= 9; shot++) {
    await c.tap(`Disparar ${shot}`, view.getByRole('button', { name: 'Disparar' }), () => expect(view.locator('.cam-count')).toContainText(`${shot} foto`, { timeout: EFFECT_MS }));
  }
  await expect(view.locator('.cam-hint')).toHaveText('Nada mais a ler nesta ficha');
  await c.tap('Concluir', view.getByRole('button', { name: 'Concluir', exact: true }), () => expect(page.getByRole('dialog', { name: 'Câmera' })).toHaveCount(0, { timeout: 15_000 }));

  // The nine readings arrive (the sync timer's work, outside the count).
  const suggested = page.locator('#ficha-step-ensaios .ficha-cell .field.suggestion-field');
  const deadline = Date.now() + 120_000;
  while ((await suggested.count()) < 9) {
    expect(Date.now(), 'the nine display readings arrive').toBeLessThan(deadline);
    await syncOutsideCount(page);
    await expect(suggested).toHaveCount(9, { timeout: 5_000 }).catch(() => undefined);
  }

  // One tap on the first suggested cell, then Enter confirms each and runs down the sheet.
  const first = page.getByRole('textbox', { name: CELLS[0]!.name, exact: true });
  await c.tap('the first suggested reading', first, () => expect(first).toBeFocused({ timeout: EFFECT_MS }));
  for (let i = 0; i < CELLS.length; i++) {
    await c.press('Enter');
    const next = CELLS[i + 1];
    if (next === undefined) await expect(page.locator('#ficha-primary')).toBeFocused({ timeout: EFFECT_MS });
    else await expect(page.getByRole('textbox', { name: next.name, exact: true })).toBeFocused({ timeout: EFFECT_MS });
  }
  // The nine confirms were queued at key speed; they land one after the other.
  const queuedAt = Date.now();
  await expect(stepper(page).getByRole('button', { name: 'Ensaios, 0 faltando' })).toBeVisible({ timeout: 20_000 });
  console.log(`9.1-E2E-005 the nine confirms landed ${Date.now() - queuedAt} ms after the last Enter`);

  await c.tap('Confirmar the suggestion', page.getByRole('group', { name: 'Sugestão' }).getByRole('button', { name: 'Confirmar' }), () =>
    expect(page.getByRole('radiogroup', { name: 'Restrições' }).getByRole('radio', { name: 'Sem restrições' })).toHaveAttribute('aria-checked', 'true', { timeout: EFFECT_MS }),
  );
  await expect(page.getByTestId('ficha-progress')).toHaveText('Ficha completa');
  // F-12 (D2, 2026-10-06): the complete sheet's primary reads "Concluir e avançar".
  await expect(page.locator('#ficha-primary')).toHaveText(/Concluir e avançar/);
  await c.tap('Concluir e avançar', page.locator('#ficha-primary'), async () => {
    await expect(toast(page)).toContainText('Ficha concluída', { timeout: EFFECT_MS });
    await expect(page).toHaveURL(new RegExp(`/ficha/${secEnel2.blockId}$`), { timeout: EFFECT_MS });
  });

  const counted = await readCount(page);
  const text = `${counted.taps} taps, ${counted.keys} keystrokes (budget ${SIGNAL_BUDGET.taps} taps, ${SIGNAL_BUDGET.keys} keystrokes)`;
  test.info().annotations.push({ type: '9.1-E2E-005 SM-3 with signal', description: text });
  console.log(`9.1-E2E-005 SM-3 with signal: ${text}`);
  expect(counted, 'the page listener and the spec agree').toEqual({ taps: c.taps, keys: c.keys });
  expect(counted.taps).toBeLessThanOrEqual(SIGNAL_BUDGET.taps);
  expect(counted.keys).toBeLessThanOrEqual(SIGNAL_BUDGET.keys);

  // What was committed: every reading the display gave, with its provenance.
  const outbox = await readStore<{ path: string; value: unknown; meta: { source_suggestion_id?: string } | null }>(page, database, 'outbox');
  for (const cell of CELLS) {
    const put = outbox.filter((op) => op.path === cell.path(secEnel.blockId)).at(-1);
    expect(put?.value, cell.name).toEqual({ ...cell.value, state: 'measured' });
    expect(put?.meta?.source_suggestion_id, cell.name).toEqual(expect.any(String));
  }
});
