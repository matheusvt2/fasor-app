import { cellAddressesOf, getDefinition, itensMarcadosConformeText, type FieldDef, type OpDraft } from '@app/domain';
import type { BrowserContext, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { signInForDurability } from './support/durability.ts';
import { deviceDatabaseName, expect, syncBadge, test, TEST_SEED } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { newRelatorioDrafts, officeDraft, pushDrafts, type SeededSheet } from './support/relatorio-seed.ts';
import { humanTap, touchPressAcross } from './support/taps.ts';

/*
 * Story 12.1 (J-01): the first tap after a field commit is never lost. For each control of
 * the review's scripts, and for each delay of 50, 200 and 400 ms, the section before the
 * tapped one is completed by typing its last missing value (the rest seeded by ops) and
 * pressing Enter (or, for the picker, by leaving the typed value to the blur commit the
 * tap itself causes); after the delay a human-like tap (pointer down, about 80 ms, pointer
 * up at the same point; a real touch on the touch project) must be applied exactly once,
 * with its feedback.
 *
 * Each control gets one relatório and one chave seccionadora sheet per delay, opened by
 * address. Runs on the three durability projects against the built bundle, one at a time
 * (`workers: 1`, the shared Empresa B).
 */

const account = TEST_SEED.companies[1];
const database = deviceDatabaseName(account.userId);
const SECC = getDefinition('v1', 'cabine_primaria', 'chave_seccionadora');
const CHECKLIST = SECC.checklist!;
const CELLS = SECC.tests.flatMap((t) => cellAddressesOf(SECC, t.key));
const DELAYS = [50, 200, 400] as const;
/** A lost tap never shows its feedback; a tap that landed shows it well within this. */
const EFFECT_MS = 5_000;

interface OutboxRow {
  path: string;
  value: unknown;
}

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const toast = (page: Page) => page.getByTestId('toast');
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const checklistRow = (page: Page, n: number) => page.locator('#ficha-step-verificacoes li.checklist-row').nth(n - 1);

/** What the stepper says is missing in the checklist ("Verificações, 12 faltando"): the NA-default items never count. */
async function checklistMissing(page: Page): Promise<number> {
  const label = await stepper(page).getByRole('button', { name: /^Verificações,/ }).getAttribute('aria-label');
  return Number(/(\d+) faltando/.exec(label ?? '')?.[1] ?? NaN);
}

function plateValue(field: FieldDef): unknown {
  if (field.kind === 'number') return { raw: '630', unit: field.unit ?? null, state: 'measured' };
  if (field.kind === 'date') return '2020-01-01';
  if (field.kind === 'select') return field.options![0];
  return 'X';
}

type Scope = { relatorioId: string };

/** Every nameplate field but `except`. */
const seedPlate = (scope: Scope, blockId: string, except: string | null = null): OpDraft[] =>
  SECC.nameplate.filter((f) => f.key !== except).map((f) => officeDraft(account, scope, `sheet/${blockId}/nameplate/${f.key}`, plateValue(f)));

/** Every checklist item C but the ones in `except`. */
const seedChecklist = (scope: Scope, blockId: string, except: readonly string[] = []): OpDraft[] =>
  CHECKLIST.filter((item) => !except.includes(item.key)).map((item) => officeDraft(account, scope, `sheet/${blockId}/checklist/${item.key}/result`, 'C'));

/** Every reading within its criterion but the cells at the indexes in `except`. */
const seedReadings = (scope: Scope, blockId: string, except: readonly number[] = []): OpDraft[] =>
  CELLS.filter((_cell, index) => !except.includes(index)).map((c) =>
    officeDraft(account, scope, `sheet/${blockId}/test/${c.testKey}/cell/${c.row}/${c.col}`, c.testKey === 'isolacao' ? { raw: '150', unit: 'GΩ', state: 'measured' } : { raw: '100', unit: 'µΩ', state: 'measured' }),
  );

const seedConclusion = (scope: Scope, blockId: string): OpDraft[] => [
  officeDraft(account, scope, `sheet/${blockId}/conclusion/result`, 'aprovado'),
  officeDraft(account, scope, `sheet/${blockId}/conclusion/restriction`, 'sem_restricoes'),
];

/** One instrument, company scope, pushed from the office device. */
function instrumentDraft(): OpDraft {
  const id = newId();
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
      code: 'MG-01',
      name: 'Megôhmetro',
      manufacturer: 'Instrum',
      model: 'DMG10Ki',
      serial: 'IN919021',
      cert_number: '37428/26',
      laboratory: null,
      calibrated_at: '2026-08-28',
      calibration_interval_months: 12,
      rbc_accredited: null,
      test_isolacao: null,
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

/**
 * Resets Empresa B, signs in, pushes a standard relatório plus the seed `seed` builds for
 * the chave seccionadora sheets, and opens its Sumário (the pull on open). With
 * `instruments`, one instrument is pushed too and pulled with "Sincronizar agora".
 */
async function setUp(page: Page, context: BrowserContext, seed: (scope: Scope, secc: SeededSheet[]) => OpDraft[], instruments = false): Promise<{ relatorioId: string; secc: SeededSheet[] }> {
  await resetEmpresaB({ standard: true });
  // The API sign-in with the cookie set on the context, then the one-time "Baixar do
  // servidor": the form's cookie does not stick on WebKit over plain http.
  await signInForDurability(page, context, account.email);
  const built = newRelatorioDrafts(account);
  const scope = { relatorioId: built.relatorioId };
  const secc = built.sheets.filter((sheet) => sheet.blockType === 'chave_seccionadora');
  await pushDrafts(page, database, [...built.drafts, ...seed(scope, secc), ...(instruments ? [instrumentDraft()] : [])]);
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  if (instruments) {
    await syncBadge(page).click();
    const button = page.getByRole('button', { name: 'Sincronizar agora' });
    await expect(button).not.toHaveAttribute('aria-disabled', 'true', { timeout: 30_000 });
    await button.click();
    await expect(syncBadge(page)).toHaveAttribute('data-pending', '0', { timeout: 30_000 });
  }
  return { relatorioId: built.relatorioId, secc };
}

async function openSheet(page: Page, relatorioId: string, blockId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
}

/** Types the last missing nameplate value (Nº SÉRIE) and presses Enter; returns when Enter went down. */
async function typeLastPlateValueAndEnter(page: Page, value: string): Promise<number> {
  const serie = page.getByLabel('Nº série', { exact: true });
  await serie.click();
  await page.keyboard.type(value);
  await page.keyboard.press('Enter');
  return Date.now();
}

/** Waits what is left of `delay` since `since`. */
async function waitUntil(page: Page, since: number, delay: number): Promise<void> {
  const left = delay - (Date.now() - since);
  if (left > 0) await page.waitForTimeout(left);
}

/** The nth seccionadora of the delay loop: the Subsolo ones, after the source Enel ones. */
function target(secc: SeededSheet[], i: number): SeededSheet {
  expect(secc.length, 'seccionadoras in the standard relatório').toBeGreaterThan(2 + i);
  return secc[2 + i]!;
}

test('@p0 12.1-E2E-001 lost tap: "Marcar os restantes como Conforme" right after Enter in the last nameplate field applies once, with its toast', async ({ page, context }, info) => {
  test.setTimeout(150_000);
  const { relatorioId, secc } = await setUp(page, context, (scope, rows) => DELAYS.flatMap((_d, i) => seedPlate(scope, target(rows, i).blockId, 'n_serie')));
  for (const [i, delay] of DELAYS.entries()) {
    const sheet = target(secc, i);
    await openSheet(page, relatorioId, sheet.blockId);
    const unset = await checklistMissing(page);
    const since = await typeLastPlateValueAndEnter(page, `SN-${delay}`);
    const bulk = page.locator('#ficha-step-verificacoes .bulk-action-bar').getByRole('button', { name: 'Marcar os restantes como Conforme' });
    await humanTap(page, bulk, info, () => waitUntil(page, since, delay));
    await expect(toast(page), `bulk at ${delay} ms`).toContainText(itensMarcadosConformeText(unset), { timeout: EFFECT_MS });
    await expect(stepper(page).getByRole('button', { name: 'Verificações, 0 faltando' })).toBeVisible();
    await expect.poll(async () => (await outbox(page)).filter((row) => row.path.startsWith(`sheet/${sheet.blockId}/checklist/`)).length).toBe(unset);
    await expect.poll(async () => (await outbox(page)).some((row) => row.path === `sheet/${sheet.blockId}/nameplate/n_serie`)).toBe(true);
  }
});

test('@p0 12.1-E2E-002 lost tap: "Repetir da ficha anterior do mesmo tipo" right after Enter in Nº SÉRIE applies once, with its toast', async ({ page, context }, info) => {
  test.setTimeout(150_000);
  const { relatorioId, secc } = await setUp(page, context, (scope, rows) => [
    ...seedChecklist(scope, rows[0]!.blockId),
    officeDraft(account, scope, `block/${rows[0]!.blockId}/concluded_by`, { actor_id: account.userId, at: new Date().toISOString() }),
    ...DELAYS.flatMap((_d, i) => seedPlate(scope, target(rows, i).blockId, 'n_serie')),
  ]);
  for (const [i, delay] of DELAYS.entries()) {
    const sheet = target(secc, i);
    await openSheet(page, relatorioId, sheet.blockId);
    const unset = await checklistMissing(page);
    const since = await typeLastPlateValueAndEnter(page, `SN-${delay}`);
    const repeat = page.locator('#ficha-step-verificacoes .bulk-action-bar').getByRole('button', { name: 'Repetir da ficha anterior do mesmo tipo' });
    await humanTap(page, repeat, info, () => waitUntil(page, since, delay));
    await expect(toast(page), `Repetir at ${delay} ms`).toContainText(`Padrão de ${secc[0]!.tag} repetido`, { timeout: EFFECT_MS });
    await expect(stepper(page).getByRole('button', { name: 'Verificações, 0 faltando' })).toBeVisible();
    await expect.poll(async () => (await outbox(page)).filter((row) => row.path.startsWith(`sheet/${sheet.blockId}/checklist/`)).length).toBe(unset);
  }
});

test('@p0 12.1-E2E-003 lost tap: the instrument picker opens on a touch tap right after "Repetir" completed the checklist above it', async ({ page, context }, info) => {
  test.setTimeout(150_000);
  // The review's script (SEC-ENEL-2): "Repetir" completes the checklist, then the picker
  // below it is tapped. A touch tap on every Chromium project, so the gap between pointerup
  // and the tap's click (where the "Repetir" write re-renders the sheet) is in the gate.
  const { relatorioId, secc } = await setUp(
    page,
    context,
    (scope, rows) => [
      ...seedChecklist(scope, rows[0]!.blockId),
      officeDraft(account, scope, `block/${rows[0]!.blockId}/concluded_by`, { actor_id: account.userId, at: new Date().toISOString() }),
      ...DELAYS.flatMap((_d, i) => seedPlate(scope, target(rows, i).blockId)),
    ],
    true,
  );
  for (const [i, delay] of DELAYS.entries()) {
    const sheet = target(secc, i);
    await openSheet(page, relatorioId, sheet.blockId);
    const unset = await checklistMissing(page);
    expect(unset).toBeGreaterThan(0);
    const repeat = page.locator('#ficha-step-verificacoes .bulk-action-bar').getByRole('button', { name: 'Repetir da ficha anterior do mesmo tipo' });
    await humanTap(page, repeat, info);
    const since = Date.now();
    const section = page.locator('section[data-test-key="isolacao"]');
    const trigger = section.getByRole('button', { name: /^Instrumento/ });
    await humanTap(page, trigger, info, () => waitUntil(page, since, delay), { touch: true });
    await expect(section.getByRole('radiogroup', { name: 'Instrumentos cadastrados' }), `picker at ${delay} ms`).toBeVisible({ timeout: EFFECT_MS });
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(stepper(page).getByRole('button', { name: 'Verificações, 0 faltando' })).toBeVisible();
    await expect.poll(async () => (await outbox(page)).filter((row) => row.path.startsWith(`sheet/${sheet.blockId}/checklist/`)).length).toBe(unset);
  }
});

test('@p0 12.1-E2E-004 lost tap: "Concluir ficha" right after Enter on the last reading concludes on the fresh rows and moves on', async ({ page, context }, info) => {
  test.setTimeout(150_000);
  const lastIndex = CELLS.length - 1;
  const { relatorioId, secc } = await setUp(page, context, (scope, rows) =>
    DELAYS.flatMap((_d, i) => {
      const blockId = target(rows, i).blockId;
      return [...seedPlate(scope, blockId), ...seedChecklist(scope, blockId), ...seedReadings(scope, blockId, [lastIndex]), ...seedConclusion(scope, blockId)];
    }),
  );
  const cell = CELLS[lastIndex]!;
  for (const [i, delay] of DELAYS.entries()) {
    const sheet = target(secc, i);
    await openSheet(page, relatorioId, sheet.blockId);
    await expect(stepper(page).getByRole('button', { name: 'Ensaios, 1 faltando' })).toBeVisible();
    await page.locator(`.ficha-cell[data-cell="${cell.testKey}:${cell.row}:${cell.col}"]`).filter({ visible: true }).locator('input').click();
    await page.keyboard.type('120');
    await page.keyboard.press('Enter');
    const since = Date.now();
    // The Enter run ends on the primary.
    const primary = page.locator('#ficha-primary');
    await expect(primary).toBeFocused();
    await humanTap(page, primary, info, () => waitUntil(page, since, delay));
    await expect(toast(page), `Concluir at ${delay} ms`).toContainText('Ficha concluída', { timeout: EFFECT_MS });
    await expect(page).not.toHaveURL(new RegExp(`/ficha/${sheet.blockId}$`));
    await expect.poll(async () => (await outbox(page)).filter((row) => row.path === `block/${sheet.blockId}/concluded_by`).length).toBe(1);
  }
});

/**
 * E12-R2: how 12.1-E2E-007 times the finger, measured from before the touch start is sent.
 * The Enter commit's render lands a few hundred ms after the commit reaches the outbox (the
 * relatório's live query rebuilds the whole snapshot), and the commit itself takes longer on
 * a loaded machine. So the finger stays down `RENDER_MS` past the commit, at least
 * `MIN_DOWN_MS` and never past `LIFT_CEILING_MS`, which leaves the touch-end round trip well
 * under `HOLD_CAP_MS` (800 ms from pointerdown, `input/press-hold.ts`) and the touch
 * long-press delay: with the hold every tap lands; without it the render moves the action
 * under the finger. One round alone raced that render and could pass without the fix, so
 * the test runs `ROUNDS` sheets and fails when no round had the commit before the lift.
 */
const ROUNDS = 3;
const MIN_DOWN_MS = 350;
const RENDER_MS = 300;
const LIFT_CEILING_MS = 650;

test('@p0 12.1-E2E-007 lost tap (E12-Q6): a commit landing while the finger is down, its tap click 100 ms or more after the finger lifts (the Android gap), still applies "Marcar os restantes como Conforme" once', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'the touch is dispatched through the Chromium DevTools protocol');
  test.setTimeout(150_000);
  // The gate's own witness of `useHeldWhilePressed`: the Enter commit of the last plate
  // value is made while a touch is down on the bulk action, so its render (the Placa step
  // left and complete collapses once the tap moves the focus, the action moves up) lands
  // between the pointer down and the tap's click. Held, the click lands on the action;
  // drawn at once, it misses it.
  const { relatorioId, secc } = await setUp(page, context, (scope, rows) => Array.from({ length: ROUNDS }, (_r, i) => seedPlate(scope, target(rows, i).blockId, 'n_serie')).flat());
  // The rounds whose commit reached the outbox before the finger lifted: only those witness the hold.
  let covered = 0;
  for (let i = 0; i < ROUNDS; i++) {
    const sheet = target(secc, i);
    await openSheet(page, relatorioId, sheet.blockId);
    const unset = await checklistMissing(page);
    await page.getByLabel('Nº série', { exact: true }).click();
    await page.keyboard.type(`SN-HELD-${i}`);
    const bulk = page.locator('#ficha-step-verificacoes .bulk-action-bar').getByRole('button', { name: 'Marcar os restantes como Conforme' });
    let downMs = 0;
    await touchPressAcross(page, bulk, async (touchedAt) => {
      await page.keyboard.press('Enter');
      const committed = await expect
        .poll(async () => (await outbox(page)).some((row) => row.path === `sheet/${sheet.blockId}/nameplate/n_serie`), {
          intervals: [20],
          timeout: Math.max(0, LIFT_CEILING_MS - (Date.now() - touchedAt)),
        })
        .toBe(true)
        .then(
          () => true,
          () => false,
        );
      const committedMs = Date.now() - touchedAt;
      if (committed && committedMs < LIFT_CEILING_MS) covered += 1;
      downMs = Math.min(LIFT_CEILING_MS, Math.max(MIN_DOWN_MS, committedMs + RENDER_MS));
      await waitUntil(page, touchedAt, downMs);
    });
    await expect(toast(page), `the tap held across the commit (round ${i + 1}, finger down ${downMs} ms)`).toContainText(itensMarcadosConformeText(unset), { timeout: EFFECT_MS });
    await expect(stepper(page).getByRole('button', { name: 'Verificações, 0 faltando' })).toBeVisible();
    await expect.poll(async () => (await outbox(page)).filter((row) => row.path.startsWith(`sheet/${sheet.blockId}/checklist/`)).length).toBe(unset);
  }
  expect(covered, `no round had its commit in the outbox before the finger lifted (by ${LIFT_CEILING_MS} ms): the machine was too loaded for this test to witness the hold`).toBeGreaterThan(0);
});

test('@p1 12.1-E2E-005 lost tap: a checklist tri-state segment right after Enter in the last nameplate field is set once', async ({ page, context }, info) => {
  test.setTimeout(150_000);
  const { relatorioId, secc } = await setUp(page, context, (scope, rows) => DELAYS.flatMap((_d, i) => seedPlate(scope, target(rows, i).blockId, 'n_serie')));
  for (const [i, delay] of DELAYS.entries()) {
    const sheet = target(secc, i);
    await openSheet(page, relatorioId, sheet.blockId);
    const unset = await checklistMissing(page);
    const since = await typeLastPlateValueAndEnter(page, `SN-${delay}`);
    const conforme = checklistRow(page, 1).getByRole('radio', { name: 'Conforme', exact: true });
    await humanTap(page, conforme, info, () => waitUntil(page, since, delay));
    await expect(conforme, `tri-state at ${delay} ms`).toHaveAttribute('aria-checked', 'true', { timeout: EFFECT_MS });
    await expect(stepper(page).getByRole('button', { name: `Verificações, ${unset - 1} faltando` })).toBeVisible();
    await expect.poll(async () => (await outbox(page)).filter((row) => row.path === `sheet/${sheet.blockId}/checklist/${CHECKLIST[0]!.key}/result`).map((row) => row.value)).toEqual(['C']);
  }
});

test('@p1 12.1-E2E-006 lost tap: an NC observation chip right after Enter in the last nameplate field inserts its phrase once', async ({ page, context }, info) => {
  test.setTimeout(150_000);
  const first = CHECKLIST[0]!;
  const phrase = first.nc_phrases[0]!;
  const { relatorioId, secc } = await setUp(page, context, (scope, rows) =>
    DELAYS.flatMap((_d, i) => {
      const blockId = target(rows, i).blockId;
      return [...seedPlate(scope, blockId, 'n_serie'), officeDraft(account, scope, `sheet/${blockId}/checklist/${first.key}/result`, 'NC')];
    }),
  );
  for (const [i, delay] of DELAYS.entries()) {
    const sheet = target(secc, i);
    await openSheet(page, relatorioId, sheet.blockId);
    const since = await typeLastPlateValueAndEnter(page, `SN-${delay}`);
    const chip = checklistRow(page, 1).getByRole('group', { name: 'Observações sugeridas do item 1' }).getByRole('button', { name: phrase });
    await humanTap(page, chip, info, () => waitUntil(page, since, delay));
    await expect(page.getByLabel('Observação do item 1', { exact: true }), `chip at ${delay} ms`).toHaveValue(phrase, { timeout: EFFECT_MS });
    await expect.poll(async () => (await outbox(page)).filter((row) => row.path === `sheet/${sheet.blockId}/checklist/${first.key}/observation`).map((row) => row.value)).toEqual([phrase]);
  }
});
