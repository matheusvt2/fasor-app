import { getDefinition, type FieldDef, type OpDraft } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { deviceDatabaseName, expect, horizontalOverflow, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { pushCellSuggestion } from './support/reading-ops.ts';
import { CLIENT, SITE } from './support/relatorio-flow.ts';
import { newRelatorioDrafts, officeDraft, pushDrafts, type SeededSheet } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNowAndReturn } from './support/sync.ts';
import { splitWordsIn } from './support/word-split.ts';

/*
 * Review fixes 2026-10-08, batch r8lay (`spec-review-fixes-2026-10-08-layout-interaction.md`): the
 * layout and interaction defects of the agent browser pass (report section 13), looked at as the
 * engineer sees them at the viewport each one names: the transformer ratio (TTR) table at every
 * tablet width (DC-1), the TP's (AC2), the phone tables (DB-3), the unit tap on a concluded sheet
 * (DB-2), Enter in the plate and cabine fields (DB-7), a manufacturer typed and left (DH-1), one the
 * registry does not hold (DH-3), the phone dialogs (DA-1), the Sticky action bar beside the open
 * rail (DA-8), the phone Sumário tree rows (DA-6) and the Condição colour. Every check measures
 * what the browser draws (`document.documentElement.clientWidth`, `horizontalOverflow`), so the
 * spec runs in the serial group (`e2e/support/groups.ts`).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

interface OutboxRow {
  path: string;
  kind: string;
  value: unknown;
  batch_id: string | null;
}

interface Built {
  relatorioId: string;
  projectId: string;
  sheets: SeededSheet[];
}

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const TABLET_SIZES = [
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
] as const;

/** Resets Empresa B, signs in at `viewport` and pushes a standard relatório plus `extra` drafts from the office. */
async function setUp(page: Page, viewport: { width: number; height: number }, extra: (built: Built) => OpDraft[] = () => []): Promise<Built> {
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize(viewport);
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const result = { relatorioId: built.relatorioId, projectId: built.projectId, sheets: built.sheets };
  await pushDrafts(page, database, [...built.drafts, ...extra(result)]);
  return result;
}

function sheetOf(built: Built, type: string, nth = 0): SeededSheet {
  const sheets = built.sheets.filter((sheet) => sheet.blockType === type);
  expect(sheets.length, `no ${type} sheet`).toBeGreaterThan(nth);
  return sheets[nth]!;
}

async function openSheet(page: Page, relatorioId: string, blockId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
}

const table = (page: Page, key: string) => page.locator(`#ficha-step-ensaios .ficha-mt[data-table-key="${key}"]`);
const cellPath = (blockId: string, testKey: string, row: number, col: number) => `sheet/${blockId}/test/${testKey}/cell/${row}/${col}`;

/** The resolved colour of a token, read through a probe beside `element` (so the same theme applies). */
async function tokenColour(element: Locator, token: string): Promise<{ actual: string; expected: string }> {
  return element.evaluate((el, name) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    el.parentElement!.appendChild(probe);
    const expected = getComputedStyle(probe).color;
    probe.remove();
    return { actual: getComputedStyle(el).color, expected };
  }, token);
}

interface TableGeometry {
  inputs: { width: number; height: number; scrollWidth: number; clientWidth: number; value: string }[];
  mtScrollLeft: number;
  scroller: { scrollWidth: number; clientWidth: number };
  /** Each column's header and drawn width, and its first row cell's parts (for a failure message). */
  columns: string;
  viewportWidth: number;
}

/** What the browser draws for one `.ficha-mt`'s table: its value inputs, the section's and the scroller's scroll. */
function tableGeometry(mt: Locator): Promise<TableGeometry> {
  return mt.evaluate((el) => {
    const scroller = el.querySelector<HTMLElement>(':scope > .mt-scroll')!;
    const inputs = [...el.querySelectorAll<HTMLInputElement>('table input.mf-value')].filter((input) => input.getClientRects().length > 0);
    return {
      inputs: inputs.map((input) => {
        const box = input.getBoundingClientRect();
        return { width: box.width, height: box.height, scrollWidth: input.scrollWidth, clientWidth: input.clientWidth, value: input.value };
      }),
      mtScrollLeft: el.scrollLeft,
      scroller: { scrollWidth: scroller.scrollWidth, clientWidth: scroller.clientWidth },
      columns: [...el.querySelectorAll('table thead th')]
        .map((th, i) => {
          const cell = el.querySelectorAll('table tbody tr:first-child > td')[i];
          const parts = cell === undefined ? '' : [...cell.querySelectorAll('input, .mf-unit, .overflow-trigger, .calc-mark')].map((part) => `${part.className.split(' ')[0]}:${Math.round(part.getBoundingClientRect().width)}`).join(',');
          return `${th.textContent}=${Math.round(th.getBoundingClientRect().width)}(${parts})`;
        })
        .join(' '),
      viewportWidth: document.documentElement.clientWidth,
    };
  });
}

/** The words split across lines in a table's header and body cells. */
async function splitWordsOfTable(mt: Locator): Promise<{ text: string; split: string[] }[]> {
  return (await mt.locator('table th, table td').evaluateAll(splitWordsIn)).filter((cell) => cell.split.length > 0);
}

/**
 * The invariants of a measurement table at a tablet width: every input at least 48 px tall and
 * `minWidth` wide showing its whole value, no word split in a cell, no page overflow; once the last
 * input is focused the section has not scrolled sideways, its title row is in the viewport and the
 * input lies inside its table's own scroller.
 */
async function expectTableWhole(page: Page, mt: Locator, where: string, minWidth: number, last: Locator): Promise<TableGeometry> {
  const geometry = await tableGeometry(mt);
  expect(geometry.inputs.length, `${where}: no input drawn`).toBeGreaterThan(0);
  for (const [i, input] of geometry.inputs.entries()) {
    expect(input.height, `${where}: input ${i} height`).toBeGreaterThanOrEqual(48);
    expect(input.width, `${where}: input ${i} width`).toBeGreaterThanOrEqual(minWidth);
    expect(input.scrollWidth, `${where}: input ${i} ("${input.value}") clipped`).toBeLessThanOrEqual(input.clientWidth);
  }
  expect(await splitWordsOfTable(mt), `${where}: words split`).toEqual([]);
  await expectNoOverflow(page, `${where} [${geometry.columns}]`);
  // A focus that arrives now (the field may still hold it from the previous size, where focus() would not scroll).
  await last.blur();
  await last.focus();
  await expect(last).toBeFocused();
  const after = await mt.evaluate((el, input) => {
    const scroller = el.querySelector<HTMLElement>(':scope > .mt-scroll')!.getBoundingClientRect();
    const title = el.querySelector<HTMLElement>(':scope > .mt-title-row')!.getBoundingClientRect();
    const box = (input as HTMLElement).getBoundingClientRect();
    return {
      scrollLeft: el.scrollLeft,
      title: { left: title.left, right: title.right, top: title.top, bottom: title.bottom },
      inside: box.left >= scroller.left - 0.5 && box.right <= scroller.right + 0.5,
      viewport: { width: document.documentElement.clientWidth, height: window.innerHeight },
    };
  }, await last.elementHandle());
  expect(after.scrollLeft, `${where}: the section scrolled sideways`).toBe(0);
  expect(after.title.left, `${where}: title row left`).toBeGreaterThanOrEqual(0);
  expect(after.title.right, `${where}: title row right`).toBeLessThanOrEqual(after.viewport.width + 0.5);
  expect(after.title.top, `${where}: title row top`).toBeGreaterThanOrEqual(0);
  expect(after.title.bottom, `${where}: title row bottom`).toBeLessThanOrEqual(after.viewport.height);
  expect(after.inside, `${where}: the focused input outside its scroller's box`).toBe(true);
  await expectNoOverflow(page, `${where} after focus`);
  return geometry;
}

/** The page's horizontal overflow, with the outermost elements drawn past the viewport's right edge named in the message. */
async function expectNoOverflow(page: Page, where: string): Promise<void> {
  const overflow = await horizontalOverflow(page);
  if (overflow <= 0) return;
  const culprits = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const past = (element: Element) => element.getBoundingClientRect().right > width + 0.5;
    return [...document.body.querySelectorAll('*')]
      .filter((element) => element.getClientRects().length > 0 && past(element) && (element.parentElement === null || !past(element.parentElement)))
      .slice(0, 4)
      .map((element) => {
        const chain: string[] = [];
        for (let at: Element | null = element; at !== null && chain.length < 9; at = at.parentElement) {
          const box = at.getBoundingClientRect();
          chain.push(`${at.tagName.toLowerCase()}.${[...at.classList].join('.')}[l=${Math.round(box.left)} r=${Math.round(box.right)} sw=${at.scrollWidth} cw=${at.clientWidth} ox=${getComputedStyle(at).overflowX} d=${getComputedStyle(at).display}]`);
        }
        return `scrollX=${window.scrollX} ${chain.join(' < ')}`;
      });
  });
  expect(overflow, `${where}: page overflow by ${culprits.join(' | ')}`).toBeLessThanOrEqual(0);
}

/** Types `values` into the table's visible inputs in order, each committed with Enter. */
async function typeInto(inputs: Locator, values: readonly string[]): Promise<void> {
  for (const [i, value] of values.entries()) {
    const input = inputs.nth(i);
    await input.click();
    await input.fill(value);
    await input.press('Enter');
  }
}

// --- @p0 --------------------------------------------------------------------------------------

test('@p0 R8LAY-E2E-001 DC-1 the transformer TTR at 768, 1024 (rail open) and 1280: real inputs, whole words, its own scroller', async ({ page }) => {
  test.setTimeout(240_000);
  const built = await setUp(page, { width: 1280, height: 800 });
  const sheet = sheetOf(built, 'transformador_forca');
  await openSheet(page, built.relatorioId, sheet.blockId);
  const ttr = table(page, 'relacao_transformacao');
  await ttr.scrollIntoViewIfNeeded();
  const inputs = ttr.locator('table.ficha-ttr input.mf-value');
  await expect(inputs).toHaveCount(5);
  await typeInto(inputs, ['13,8', '380', '34,512', '39,48', '34,51']);
  const expected = [
    [0, { raw: '13.8', unit: 'kV', state: 'measured' }],
    [1, { raw: '380', unit: 'V', state: 'measured' }],
    [3, { raw: '34.512', unit: null, state: 'measured' }],
    [4, { raw: '39.48', unit: null, state: 'measured' }],
    [5, { raw: '34.51', unit: null, state: 'measured' }],
  ] as const;
  for (const [col, value] of expected) {
    await expect
      .poll(async () => (await outbox(page)).filter((row) => row.path === cellPath(sheet.blockId, 'relacao_transformacao', 0, col)).at(-1)?.value)
      .toEqual(value);
  }
  await expect(inputs.nth(4)).toHaveValue('34,51');

  for (const size of TABLET_SIZES) {
    await page.setViewportSize(size);
    if (size.width === 1024) await expect(page.locator('aside.rail')).toBeVisible();
    else if (size.width === 768) await expect(page.locator('aside.rail')).toBeHidden();
    const where = `${size.width}x${size.height}`;
    await expect(ttr.locator('table.ficha-ttr')).toBeVisible();
    const geometry = await expectTableWhole(page, ttr, where, 72, inputs.nth(4));
    expect(geometry.inputs.map((input) => input.value)).toEqual(['13,8', '380', '34,512', '39,48', '34,51']);
    await expect(ttr.locator('table.ficha-ttr thead th')).toHaveText(['TAP nº', 'V primário', 'V secundário', 'Calculado', 'H1-H3 / X1-X0', 'H2-H1 / X2-X0', 'H3-H2 / X3-X0', 'Condição']);
    if (size.width === 1280) expect(geometry.scroller.scrollWidth, `1280: the table scroller scrolls: ${geometry.columns}`).toBeLessThanOrEqual(geometry.scroller.clientWidth);
  }
});

test('@p0 R8LAY-E2E-002 DB-2 a concluded sheet: a unit tap with the input not focused only focuses it; a second tap cycles; an open sheet cycles at once', async ({ page }) => {
  test.setTimeout(180_000);
  const at = new Date().toISOString();
  const built = await setUp(page, { width: 390, height: 844 }, (b) => {
    const [concluded, open] = b.sheets.filter((s) => s.blockType === 'chave_seccionadora') as [SeededSheet, SeededSheet];
    const scope = { relatorioId: b.relatorioId };
    return [
      officeDraft(account, scope, cellPath(concluded.blockId, 'isolacao', 0, 0), { raw: '1.45', unit: 'GΩ', state: 'measured' }),
      officeDraft(account, scope, `block/${concluded.blockId}/concluded_by`, { actor_id: account.userId, at }),
      officeDraft(account, scope, cellPath(open.blockId, 'isolacao', 0, 0), { raw: '1.45', unit: 'GΩ', state: 'measured' }),
    ];
  });
  const [concluded, open] = built.sheets.filter((s) => s.blockType === 'chave_seccionadora') as [SeededSheet, SeededSheet];
  const path = cellPath(concluded.blockId, 'isolacao', 0, 0);

  await openSheet(page, built.relatorioId, concluded.blockId);
  const cell = page.locator('.ficha-cell[data-cell="isolacao:0:0"]').filter({ visible: true });
  const input = cell.locator('input.mf-value');
  const unit = cell.locator('.unit-cycle');
  await expect(input).toHaveValue('1,45');
  await expect(unit).toHaveText('GΩ');
  await unit.scrollIntoViewIfNeeded();
  await expect(input).not.toBeFocused();

  // No value input of the sheet's tables has a unit control 8 px under it.
  const under = await page.locator('.measurement-table input.mf-value').evaluateAll((all) =>
    all
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => {
        const box = element.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.bottom + 8);
        return hit !== null && hit.closest('.unit-cycle') !== null;
      }),
  );
  expect(under.length).toBeGreaterThan(0);
  expect(under.every((hitsUnit) => !hitsUnit)).toBe(true);

  await unit.click();
  await expect(input).toBeFocused();
  await expect(unit).toHaveText('GΩ');
  await page.waitForTimeout(600);
  expect((await outbox(page)).filter((row) => row.path === path)).toEqual([]);

  // Tapped again, while the input holds the focus: the value is stored in TΩ.
  await unit.click();
  await expect(unit).toHaveText('TΩ');
  await expect.poll(async () => (await outbox(page)).filter((row) => row.path === path).at(-1)?.value).toEqual({ raw: '1.45', unit: 'TΩ', state: 'measured' });

  // An open sheet: one tap cycles at once.
  await openSheet(page, built.relatorioId, open.blockId);
  const openCell = page.locator('.ficha-cell[data-cell="isolacao:0:0"]').filter({ visible: true });
  await expect(openCell.locator('input.mf-value')).toHaveValue('1,45');
  await openCell.locator('.unit-cycle').click();
  await expect
    .poll(async () => (await outbox(page)).filter((row) => row.path === cellPath(open.blockId, 'isolacao', 0, 0)).at(-1)?.value)
    .toEqual({ raw: '1.45', unit: 'TΩ', state: 'measured' });
});

/** The transformer's plate fields typed in order: key, text, the stored value. */
const PLATE_RUN: readonly [string, string, unknown][] = [
  ['vol_oleo', '120', { raw: '120', unit: 'L', state: 'measured' }],
  ['potencia_nominal', '500', { raw: '500', unit: 'kVA', state: 'measured' }],
  ['tap_atual', '3', '3'],
  ['data_fabricacao', '082024', '2024-08'],
  ['tensao_nominal_at', '13,8', { raw: '13.8', unit: 'kV', state: 'measured' }],
  ['tensao_nominal_bt', '380', { raw: '380', unit: 'V', state: 'measured' }],
  ['ligacao_secundaria', 'Dyn1', 'Dyn1'],
];

const plateInput = (page: Page, key: string) => page.locator(`#ficha-step-placa [data-field-key="${key}"] input`).filter({ visible: true }).first();
const focusedFieldKey = (page: Page) => page.evaluate(() => document.activeElement?.closest('[data-field-key]')?.getAttribute('data-field-key') ?? null);

for (const width of [1280, 390] as const) {
  test(`@p0 R8LAY-E2E-00${width === 1280 ? 3 : 4} DB-7 Enter in the transformer's plate at ${width}: each Enter writes its field and lands on the next empty one, then on the sheet's next missing field`, async ({ page }) => {
    test.setTimeout(240_000);
    const built = await setUp(page, { width, height: width === 1280 ? 800 : 844 });
    const sheet = sheetOf(built, 'transformador_forca');
    await openSheet(page, built.relatorioId, sheet.blockId);
    const nameplate = (key: string) => `sheet/${sheet.blockId}/nameplate/${key}`;
    const written = async (key: string, value: unknown) =>
      expect.poll(async () => (await outbox(page)).filter((row) => row.path === nameplate(key)).at(-1)?.value, { message: key }).toEqual(value);

    for (const key of ['identificacao', 'n_serie', 'tipo', ...PLATE_RUN.map(([k]) => k)]) {
      await expect(plateInput(page, key), key).toHaveAttribute('enterkeyhint', 'next');
    }
    // Identificação: Enter lands on Fabricação (a word field: its first control).
    await plateInput(page, 'identificacao').click();
    await page.keyboard.type('TR-A');
    await page.keyboard.press('Enter');
    await written('identificacao', 'TR-A');
    await expect.poll(() => focusedFieldKey(page)).toBe('fabricacao');
    // Nº série, Tipo: Enter lands on the next one, then on Tipo de isolação (a select).
    await plateInput(page, 'n_serie').click();
    await page.keyboard.type('PR2291');
    await page.keyboard.press('Enter');
    await written('n_serie', 'PR2291');
    await expect(plateInput(page, 'tipo')).toBeFocused();
    await page.keyboard.type('ONAN');
    await page.keyboard.press('Enter');
    await written('tipo', 'ONAN');
    await expect.poll(() => focusedFieldKey(page)).toBe('tipo_de_isolacao');
    // An invalid number keeps the focus with its helper and writes nothing.
    const vol = plateInput(page, 'vol_oleo');
    await vol.click();
    await page.keyboard.type('abc');
    await page.keyboard.press('Enter');
    await expect(vol).toBeFocused();
    await expect(page.locator('[data-field-key="vol_oleo"] .helper')).toBeVisible();
    expect((await outbox(page)).filter((row) => row.path === nameplate('vol_oleo'))).toEqual([]);
    await vol.fill('');
    for (const [i, [key, text, value]] of PLATE_RUN.entries()) {
      await expect(plateInput(page, key), `the run reached ${key}`).toBeFocused();
      await page.keyboard.type(text);
      await page.keyboard.press('Enter');
      await written(key, value);
      const next = PLATE_RUN[i + 1];
      if (next !== undefined) await expect(plateInput(page, next[0])).toBeFocused();
    }
    // The last plate field hands the focus to the sheet's next missing field: the first checklist item.
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.closest('#ficha-step-verificacoes li.checklist-row[data-missing-field]') !== null && document.activeElement?.closest('#ficha-step-verificacoes li.checklist-row') === document.querySelector('#ficha-step-verificacoes li.checklist-row')))
      .toBe(true);
  });
}

test('@p0 R8LAY-E2E-005 DB-7 on a cabine\'s first sheet Enter runs Tensão primária to Tensão secundária to the next field', async ({ page }) => {
  test.setTimeout(180_000);
  const built = await setUp(page, { width: 1280, height: 800 });
  await page.goto(`/relatorio/${built.relatorioId}`);
  const chevron = page.getByRole('button', { name: 'Expandir ou recolher a seção 9' });
  await expect(chevron).toBeVisible({ timeout: 30_000 });
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await page.getByRole('button', { name: 'Mais opções de Cubículo Enel' }).click();
  await page.getByRole('menuitem', { name: 'Abrir primeira ficha (dados da cabine)' }).click();
  await expect(page.getByRole('heading', { name: 'Características da SE' })).toBeVisible({ timeout: 30_000 });
  const primaria = page.getByLabel('Tensão primária', { exact: true });
  const secundaria = page.getByLabel('Tensão secundária', { exact: true });
  await expect(primaria).toHaveAttribute('enterkeyhint', 'next');
  await primaria.click();
  await page.keyboard.type('13,8');
  await page.keyboard.press('Enter');
  await expect(secundaria).toBeFocused();
  await expect.poll(async () => (await outbox(page)).some((row) => row.path.includes('/se/') && JSON.stringify(row.value) === JSON.stringify({ raw: '13.8', unit: 'kV', state: 'measured' }))).toBe(true);
  await page.keyboard.type('380');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await outbox(page)).some((row) => row.path.includes('/se/') && JSON.stringify(row.value) === JSON.stringify({ raw: '380', unit: 'V', state: 'measured' }))).toBe(true);
  await expect(page.getByLabel('Potência instalada', { exact: true })).toBeFocused();
});

/** A filled value of a plate field's kind, as the office would have typed it. */
function plateValue(field: FieldDef): unknown {
  if (field.kind === 'number') return { raw: '630', unit: field.unit ?? null, state: 'measured' };
  if (field.kind === 'date') return '2020-01-01';
  if (field.kind === 'select') return field.options![0];
  return 'X';
}

test('@p0 R8LAY-E2E-014 DB-7 Enter in the plate\'s last empty field lands in Verificações and leaves the completed plate expanded (Story 12.1)', async ({ page }) => {
  test.setTimeout(150_000);
  const plate = getDefinition('v1', 'cabine_primaria', 'chave_seccionadora').nameplate;
  const built = await setUp(page, { width: 1280, height: 800 }, (b) => {
    const sheet = sheetOf(b, 'chave_seccionadora');
    return plate.filter((field) => field.key !== 'n_serie').map((field) => officeDraft(account, { relatorioId: b.relatorioId }, `sheet/${sheet.blockId}/nameplate/${field.key}`, plateValue(field)));
  });
  const sheet = sheetOf(built, 'chave_seccionadora');
  await openSheet(page, built.relatorioId, sheet.blockId);
  const stepper = page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
  await expect(stepper.getByRole('button', { name: 'Placa, 1 faltando' })).toBeVisible();
  await plateInput(page, 'n_serie').click();
  await page.keyboard.type('SN-R8LAY');
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest('#ficha-step-verificacoes') !== null)).toBe(true);
  await expect.poll(async () => (await outbox(page)).filter((row) => row.path === `sheet/${sheet.blockId}/nameplate/n_serie`).map((row) => row.value)).toEqual(['SN-R8LAY']);
  // The plate is complete now, and stays expanded: the run is not the readings run.
  await expect(stepper.getByRole('button', { name: 'Placa, 0 faltando' })).toBeVisible();
  await expect(page.locator('#ficha-step-placa')).not.toHaveClass(/is-collapsed/);
  await expect(plateInput(page, 'n_serie')).toBeVisible();
});

/** Office drafts for Cadastros: the manufacturer Celtta, and instruments with no manufacturer and with an unregistered one. */
function registryDrafts(): OpDraft[] {
  const company = (path: string, value: Record<string, unknown>): OpDraft =>
    ({
      kind: 'create',
      scope: 'company',
      company_id: account.companyId,
      project_id: null,
      relatorio_id: null,
      path,
      value,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: account.userId,
    }) as OpDraft;
  const instrument = (code: string, manufacturer: string | null, serial: string) => {
    const id = newId();
    return company(`registry/instrument/${id}`, {
      id,
      kind: 'instrument',
      code,
      name: `Instrumento ${code}`,
      manufacturer,
      model: null,
      serial,
      cert_number: null,
      laboratory: null,
      calibrated_at: null,
      calibration_interval_months: null,
      rbc_accredited: null,
      test_isolacao: null,
      test_resistencia_contato: null,
      test_relacao_transformacao: null,
      certificate_file_id: null,
      removed_at: null,
    });
  };
  const celtta = newId();
  return [
    company(`registry/manufacturer/${celtta}`, { id: celtta, kind: 'manufacturer', name: 'Celtta', gender: null, number: null, removed_at: null }),
    instrument('R8A', null, 'MB5501234'),
    instrument('R8B', 'Hi-Tech', 'TEST-RAT-01'),
    instrument('R8C', null, 'CL0001'),
  ];
}

async function openInstrumentos(page: Page, width: number): Promise<void> {
  await page.goto('/cadastros');
  if (width < 768) {
    await page.getByRole('button', { name: /^(Empresa|Clientes|Instrumentos|Fabricantes|Classes de tensão|Critérios de aceitação)$/ }).click();
    await page.getByRole('menuitemradio', { name: 'Instrumentos' }).click();
  } else {
    await page.getByRole('tab', { name: 'Instrumentos' }).click();
  }
}

const instrumentRow = (page: Page, code: string) => page.getByRole('button', { name: new RegExp(`^${code} `) });
const panel = (page: Page) => page.locator('.registry-panel');

test('@p0 R8LAY-E2E-006 DH-1 a manufacturer typed under "Outro…" and left is written with its word; a known one left is selected', async ({ page }) => {
  test.setTimeout(240_000);
  const built = await setUp(page, { width: 768, height: 1024 }, () => registryDrafts());
  await syncNowAndReturn(page);
  await openInstrumentos(page, 768);

  // Escape then a tap elsewhere: the name is created and taken by the instrument, once.
  await instrumentRow(page, 'R8A').click();
  await panel(page).getByRole('button', { name: 'Outro…' }).click();
  const fabricante = panel(page).getByRole('combobox', { name: 'Fabricante' });
  await expect(fabricante).toBeFocused();
  await page.keyboard.type('Megabras');
  await page.keyboard.press('Escape');
  await panel(page).getByLabel('Nome', { exact: true }).click();
  await expect
    .poll(async () => (await outbox(page)).filter((row) => row.kind === 'create' && row.path.startsWith('registry/manufacturer/')).map((row) => (row.value as { name: string }).name))
    .toEqual(['Megabras']);
  await expect
    .poll(async () => (await outbox(page)).filter((row) => row.path.startsWith('registry/instrument/') && row.path.endsWith('/manufacturer')).map((row) => row.value))
    .toEqual(['Megabras']);
  await panel(page).getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(instrumentRow(page, 'R8A')).toContainText('Megabras · série MB5501234');
  await instrumentRow(page, 'R8A').click();
  await expect(panel(page).getByRole('button', { name: 'Megabras', pressed: true })).toBeVisible();
  await panel(page).getByRole('button', { name: 'Fechar', exact: true }).click();

  // "celtta" left with Tab selects Celtta, no new word.
  await instrumentRow(page, 'R8C').click();
  await panel(page).getByRole('button', { name: 'Outro…' }).click();
  await page.keyboard.type('celtta');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Tab');
  await expect
    .poll(async () => (await outbox(page)).filter((row) => row.path.startsWith('registry/instrument/') && row.path.endsWith('/manufacturer')).map((row) => row.value))
    .toEqual(['Megabras', 'Celtta']);
  expect((await outbox(page)).filter((row) => row.kind === 'create' && row.path.startsWith('registry/manufacturer/'))).toHaveLength(1);
  await panel(page).getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(instrumentRow(page, 'R8C')).toContainText('Celtta');

  // A sheet's Fabricante: a name typed and left is written with its word.
  const sheet = sheetOf(built, 'transformador_forca');
  await openSheet(page, built.relatorioId, sheet.blockId);
  const field = page.locator('#ficha-step-placa [data-field-key="fabricacao"]');
  await field.getByRole('button', { name: 'Outro…' }).click();
  await page.keyboard.type('Blutrafos');
  await page.keyboard.press('Escape');
  await page.locator('#ficha-step-placa [data-field-key="n_serie"] input').click();
  await expect
    .poll(async () => (await outbox(page)).filter((row) => row.path === `sheet/${sheet.blockId}/nameplate/fabricacao`).at(-1)?.value)
    .toBe('Blutrafos');
  await expect
    .poll(async () => (await outbox(page)).filter((row) => row.kind === 'create' && row.path.startsWith('registry/manufacturer/')).map((row) => (row.value as { name: string }).name))
    .toEqual(['Megabras', 'Blutrafos']);
});

test('@p0 R8LAY-E2E-007 DH-3 a stored manufacturer missing from Fabricantes shows with "Criar Hi-Tech?" at 1280, 390 and 768; the tap writes the word only', async ({ page }) => {
  test.setTimeout(240_000);
  await setUp(page, { width: 1280, height: 800 }, () => registryDrafts());
  await syncNowAndReturn(page);
  for (const size of [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 768, height: 1024 }] as const) {
    await page.setViewportSize(size);
    await openInstrumentos(page, size.width);
    await instrumentRow(page, 'R8B').click();
    const name = panel(page).locator('.word-unregistered-name');
    await expect(name, `${size.width}`).toHaveText('Hi-Tech');
    const criar = panel(page).getByRole('button', { name: 'Criar Hi-Tech?' });
    await expect(criar).toBeVisible();
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      const colour = await tokenColour(name, '--ink-primary');
      expect(colour.actual, `${size.width} ${scheme}`).toBe(colour.expected);
    }
    await page.emulateMedia({ colorScheme: 'light' });
    if (size.width !== 768) await panel(page).getByRole('button', { name: 'Fechar', exact: true }).click();
  }
  await panel(page).getByRole('button', { name: 'Criar Hi-Tech?' }).click();
  await expect
    .poll(async () => (await outbox(page)).filter((row) => row.kind === 'create' && row.path.startsWith('registry/manufacturer/')).map((row) => (row.value as { name: string }).name))
    .toEqual(['Hi-Tech']);
  expect((await outbox(page)).filter((row) => row.path.startsWith('registry/instrument/'))).toEqual([]);
  await expect(panel(page).getByRole('button', { name: 'Hi-Tech', pressed: true })).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'Criar Hi-Tech?' })).toHaveCount(0);
});

/** The open dialog's box, against the viewport the page has. */
function dialogBox(dialog: Locator) {
  return dialog.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return {
      top: box.top,
      bottom: box.bottom,
      left: box.left,
      right: box.right,
      centreX: box.left + box.width / 2,
      centreY: box.top + box.height / 2,
      overflowY: style.overflowY,
      maxHeight: Number.parseFloat(style.maxHeight),
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      viewport: { width: document.documentElement.clientWidth, height: window.innerHeight },
    };
  });
}

async function expectDialogFits(dialog: Locator, where: string, phone: boolean): Promise<void> {
  const box = await dialogBox(dialog);
  expect(box.top, `${where}: top`).toBeGreaterThanOrEqual(0);
  expect(box.left, `${where}: left`).toBeGreaterThanOrEqual(0);
  expect(box.bottom, `${where}: bottom`).toBeLessThanOrEqual(box.viewport.height + 0.5);
  expect(box.right, `${where}: right`).toBeLessThanOrEqual(box.viewport.width + 0.5);
  expect(box.overflowY, `${where}: overflow-y`).toBe('auto');
  expect(box.maxHeight, `${where}: max-height`).toBeLessThanOrEqual(box.viewport.height);
  if (!phone) {
    expect(box.scrollHeight, `${where}: scrolls`).toBeLessThanOrEqual(box.clientHeight);
    expect(Math.abs(box.centreY - box.viewport.height / 2), `${where}: not centred`).toBeLessThanOrEqual(1);
    expect(Math.abs(box.centreX - box.viewport.width / 2), `${where}: not centred`).toBeLessThanOrEqual(1);
  }
}

const DIALOG_SIZES = [{ width: 390, height: 700 }, { width: 360, height: 640 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }] as const;
const FIRST_DIALOG_SIZE = DIALOG_SIZES[0];

test('@p0 R8LAY-E2E-008 DA-1 the phone\'s "Novo relatório" dialogs fit the viewport and scroll inside, "Criar relatório" creates the relatório; centred on tablet and desktop', async ({ page }) => {
  test.setTimeout(300_000);
  await resetEmpresaB(account, { standard: true });
  for (const size of DIALOG_SIZES) {
    const phone = size.width < 768;
    const where = `${size.width}x${size.height}`;
    await page.setViewportSize(size);
    if (size === FIRST_DIALOG_SIZE) await signIn(page, account.email);
    else await page.goto('/');
    await page.getByRole('button', { name: 'Novo relatório' }).click();
    const first = page.getByRole('dialog', { name: 'Novo relatório', exact: true });
    await expect(first).toBeVisible();
    await expectDialogFits(first, `${where} Novo relatório`, phone);
    await first.getByRole('combobox', { name: 'Cliente' }).fill(`${CLIENT} ${size.width}`);
    await page.getByRole('option', { name: `Criar “${CLIENT} ${size.width}”` }).click();
    await first.getByRole('combobox', { name: 'Local (obra)' }).fill(`${SITE} ${size.width}`);
    await page.getByRole('option', { name: `Criar “${SITE} ${size.width}”` }).click();
    const proceed = first.getByRole('button', { name: 'Continuar' });
    await proceed.scrollIntoViewIfNeeded();
    await proceed.click();
    await expect(page).toHaveURL(/\/project\/[0-9a-f-]{36}$/);
    const second = page.getByRole('dialog', { name: 'Novo relatório — tipo e datas', exact: true });
    await expect(second).toBeVisible();
    await expectDialogFits(second, `${where} tipo e datas`, phone);
    const create = second.getByRole('button', { name: 'Criar relatório' });
    await create.scrollIntoViewIfNeeded();
    await expect(create).toBeInViewport({ ratio: 1 });
    await create.click();
    await expect(page).toHaveURL(/\/relatorio\/[0-9a-f-]{36}\/setup\?etapa=1$/, { timeout: 30_000 });
    const relatorioId = new URL(page.url()).pathname.split('/')[2]!;
    await expect
      .poll(async () => (await readStore<{ entity: string; id: string }>(page, database, 'entities')).some((row) => row.entity === 'relatorio' && row.id === relatorioId))
      .toBe(true);
  }
});

// --- @p1 --------------------------------------------------------------------------------------

test('@p1 R8LAY-E2E-009 the TP ratio table at 768, 1024 and 1280, and both ratio tables as cards at 390', async ({ page }) => {
  test.setTimeout(240_000);
  const built = await setUp(page, { width: 1280, height: 800 });
  const tp = sheetOf(built, 'tp');
  await openSheet(page, built.relatorioId, tp.blockId);
  const ttr = table(page, 'relacao_transformacao');
  await ttr.scrollIntoViewIfNeeded();
  const inputs = ttr.locator('table.ficha-ttr input.mf-value');
  await expect(inputs).toHaveCount(9);
  await typeInto(inputs, ['13800', '115', '120,135']);
  await expect
    .poll(async () => (await outbox(page)).filter((row) => row.path === cellPath(tp.blockId, 'relacao_transformacao', 0, 3)).at(-1)?.value)
    .toEqual({ raw: '120.135', unit: null, state: 'measured' });
  for (const size of TABLET_SIZES) {
    await page.setViewportSize(size);
    await expect(ttr.locator('table.ficha-ttr')).toBeVisible();
    const geometry = await expectTableWhole(page, ttr, `TP ${size.width}`, 72, inputs.last());
    if (size.width === 1280) expect(geometry.scroller.scrollWidth, `TP 1280: the table scroller scrolls: ${geometry.columns}`).toBeLessThanOrEqual(geometry.scroller.clientWidth);
  }
  // At 390 both ratio tables are their cards.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const blockId of [tp.blockId, sheetOf(built, 'transformador_forca').blockId]) {
    await openSheet(page, built.relatorioId, blockId);
    const cards = table(page, 'relacao_transformacao').locator('.ficha-cards');
    await expect(cards).toBeVisible();
    await expect(table(page, 'relacao_transformacao').locator('table.ficha-ttr')).toBeHidden();
    const heights = await cards.locator('input').evaluateAll((all) => all.filter((e) => e.getClientRects().length > 0).map((e) => e.getBoundingClientRect().height));
    expect(heights.length).toBeGreaterThan(0);
    for (const height of heights) expect(height).toBeGreaterThanOrEqual(48);
    await expectNoOverflow(page, 'page');
  }
});

test('@p1 R8LAY-E2E-010 DB-3 the phone tables: no split word or unit, 48 px inputs beside their unit, no page overflow; and at 768 and 1280', async ({ page }) => {
  test.setTimeout(300_000);
  const built = await setUp(page, { width: 390, height: 844 }, (b) => {
    const scope = { relatorioId: b.relatorioId };
    const transformer = sheetOf(b, 'transformador_forca');
    const paraRaio = sheetOf(b, 'para_raio');
    const sec = sheetOf(b, 'chave_seccionadora');
    return [
      officeDraft(account, scope, cellPath(transformer.blockId, 'isolacao', 0, 1), { raw: '3300', unit: 'GΩ', state: 'measured' }),
      officeDraft(account, scope, cellPath(paraRaio.blockId, 'isolacao', 0, 1), { raw: '3300', unit: 'MΩ', state: 'measured' }),
      officeDraft(account, scope, cellPath(sec.blockId, 'isolacao', 0, 0), { raw: '1.45', unit: 'GΩ', state: 'measured' }),
    ];
  });
  const cases = [
    { sheet: sheetOf(built, 'transformador_forca'), tables: ['isolacao'], suggested: cellPath(sheetOf(built, 'transformador_forca').blockId, 'isolacao', 1, 1), unit: 'GΩ' },
    { sheet: sheetOf(built, 'para_raio'), tables: ['isolacao'], suggested: cellPath(sheetOf(built, 'para_raio').blockId, 'isolacao', 1, 1), unit: 'MΩ' },
    { sheet: sheetOf(built, 'chave_seccionadora'), tables: ['contato_aberto', 'contato_fechado'], suggested: cellPath(sheetOf(built, 'chave_seccionadora').blockId, 'isolacao', 1, 0), unit: 'GΩ' },
  ];
  for (const c of cases) {
    await pushCellSuggestion(account.companyId, built.relatorioId, { targetPath: c.suggested, value: { raw: '2.5', unit: c.unit, state: 'measured' }, photoId: newId() });
  }
  for (const c of cases) {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSheet(page, built.relatorioId, c.sheet.blockId);
    // The reading is confirmed, so the cell is a confirmed reading's cell.
    const confirm = page.locator(`#ficha-step-ensaios .ficha-mt[data-table-key="${c.tables[0]}"] .suggestion-field[data-state="suggested"] .confirm-btn`);
    await expect(confirm).toBeVisible({ timeout: 30_000 });
    await confirm.click();
    await expect(page.locator(`#ficha-step-ensaios .ficha-mt[data-table-key="${c.tables[0]}"] .ficha-cell.suggestion-field[data-state="confirmed"]`)).toHaveCount(1);
    for (const size of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }] as const) {
      await page.setViewportSize(size);
      for (const key of c.tables) {
        const mt = table(page, key);
        await mt.scrollIntoViewIfNeeded();
        const where = `${c.sheet.blockType} ${key} ${size.width}`;
        expect(await splitWordsOfTable(mt), `${where}: words split`).toEqual([]);
        await expectNoOverflow(page, where);
        if (size.width !== 390) continue;
        const fields = await mt.locator('table td.cell-value .measurement-field').evaluateAll((all) =>
          all.map((field) => {
            const input = field.querySelector<HTMLInputElement>('input.mf-value')!.getBoundingClientRect();
            const unit = field.querySelector('.mf-unit')?.getBoundingClientRect() ?? null;
            const element = field.querySelector<HTMLInputElement>('input.mf-value')!;
            return {
              height: input.height,
              clipped: element.scrollWidth > element.clientWidth,
              unitOffset: unit === null ? 0 : Math.abs(unit.top + unit.height / 2 - (input.top + input.height / 2)),
            };
          }),
        );
        expect(fields.length).toBeGreaterThan(0);
        for (const [i, field] of fields.entries()) {
          expect(field.height, `${where}: input ${i} height`).toBeGreaterThanOrEqual(48);
          expect(field.clipped, `${where}: input ${i} clipped`).toBe(false);
          expect(field.unitOffset, `${where}: input ${i} unit off its line`).toBeLessThanOrEqual(4);
        }
        const last = mt.locator('table input.mf-value').last();
        await last.focus();
        expect(await mt.evaluate((el) => el.scrollLeft), `${where}: the section scrolled sideways`).toBe(0);
        const title = (await mt.locator('.mt-title-row').boundingBox())!;
        expect(title.x).toBeGreaterThanOrEqual(0);
        await expectNoOverflow(page, `${where} after focus`);
      }
    }
  }
});

test('@p1 R8LAY-E2E-011 DA-8 the sheet at 768 with the rail opened from its strip, and at 1024 with the rail open: no sideways scroll, every bar button whole', async ({ page }) => {
  test.setTimeout(180_000);
  const built = await setUp(page, { width: 768, height: 1024 });
  await openSheet(page, built.relatorioId, sheetOf(built, 'transformador_forca').blockId);
  await page.locator('aside.rail-collapsed button.rail-toggle').click();
  await expect(page.locator('aside.rail')).toBeVisible();
  for (const size of [{ width: 768, height: 1024 }, { width: 1024, height: 768 }] as const) {
    await page.setViewportSize(size);
    await expect(page.locator('aside.rail')).toBeVisible();
    const where = `${size.width}`;
    await expectNoOverflow(page, where);
    const buttons = await page.locator('.sticky-action-bar .btn').evaluateAll((all) =>
      all
        .filter((b) => b.getClientRects().length > 0)
        .map((b) => {
          const box = b.getBoundingClientRect();
          return { text: b.textContent ?? '', left: box.left, right: box.right, whole: b.scrollWidth <= b.clientWidth, viewport: document.documentElement.clientWidth };
        }),
    );
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button.left, `${where}: ${button.text}`).toBeGreaterThanOrEqual(0);
      expect(button.right, `${where}: ${button.text}`).toBeLessThanOrEqual(button.viewport + 0.5);
      expect(button.whole, `${where}: ${button.text} cut`).toBe(true);
    }
  }
});

test('@p1 R8LAY-E2E-012 DA-6 the phone Sumário tree: no split word in a row, each state on one line, no page overflow', async ({ page }) => {
  test.setTimeout(180_000);
  const built = await setUp(page, { width: 390, height: 844 }, (b) => {
    const scope = { relatorioId: b.relatorioId };
    return [officeDraft(account, scope, cellPath(sheetOf(b, 'transformador_forca').blockId, 'isolacao', 0, 1), { raw: '3300', unit: 'GΩ', state: 'measured' })];
  });
  await page.goto(`/relatorio/${built.relatorioId}`);
  const chevron = page.getByRole('button', { name: 'Expandir ou recolher a seção 9' });
  await expect(chevron).toBeVisible({ timeout: 30_000 });
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  const tree = page.getByRole('list', { name: 'Locais do relatório' });
  // Every cabine and coluna opened, one at a time (each click redraws the tree).
  const closed = tree.locator('button[aria-label^="Expandir "][aria-expanded="false"]');
  for (let i = 0; i < 30 && (await closed.count()) > 0; i++) {
    const before = await closed.count();
    await closed.first().click();
    await expect(closed).not.toHaveCount(before);
  }
  await expect(tree.locator('li.s9-eq').first()).toBeVisible();
  const rows = tree.locator('li.s9-eq .s9-eq-open');
  expect(await rows.count()).toBeGreaterThan(3);
  const split = (await tree.locator('li.s9-eq .s9-eq-open .block-tag, li.s9-eq .s9-eq-open .s9-eq-name, li.s9-eq .s9-eq-open .s9-state').evaluateAll(splitWordsIn)).filter((cell) => cell.split.length > 0);
  expect(split).toEqual([]);
  const stateLines = await tree.locator('li.s9-eq .s9-state').evaluateAll((all) =>
    all.map((state) => {
      const range = document.createRange();
      range.selectNodeContents(state);
      return new Set([...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.top + rect.height / 2))).size;
    }),
  );
  for (const lines of stateLines) expect(lines).toBe(1);
  await expectNoOverflow(page, 'page');
});

test('@p1 R8LAY-E2E-013 the Condição cell is drawn in --ink-secondary, light and dark', async ({ page }) => {
  test.setTimeout(150_000);
  const built = await setUp(page, { width: 1280, height: 800 });
  const tp = sheetOf(built, 'tp');
  await openSheet(page, built.relatorioId, tp.blockId);
  const ttr = table(page, 'relacao_transformacao');
  await ttr.scrollIntoViewIfNeeded();
  await typeInto(ttr.locator('table.ficha-ttr input.mf-value'), ['13800', '115', '120,135']);
  const condicao = ttr.locator('table.ficha-ttr tbody tr').first().locator('td').last();
  await expect(condicao).toHaveClass('cell-dim');
  await expect(condicao).toContainText('SATISFATÓRIO');
  await expect(ttr.locator('table.ficha-ttr thead th').last()).not.toHaveClass(/col-value/);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const colour = await tokenColour(condicao, '--ink-secondary');
    expect(colour.actual, scheme).toBe(colour.expected);
  }
});
