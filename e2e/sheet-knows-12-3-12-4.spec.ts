import { cellAddressesOf, getDefinition, instrumentHeaderOf, type FieldDef, type InstrumentRow, type OpDraft } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { deviceDatabaseName, expect, signIn, test, TEST_SEED } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { instrumentDraft, newRelatorioDrafts, officeDraft, pushDrafts, type SeededSheet } from './support/relatorio-seed.ts';
import { syncNowAndReturn } from './support/sync.ts';

/*
 * Stories 12.3 and 12.4 (journey review J-02, J-03, J-07, J-08, J-09, J-10, J-16), driven
 * as a person would at 768 px (the tablet): clicks, typing and reloads, never an op
 * written by hand on this device. Every test resets Empresa B and pushes a relatório of the
 * standard template (seed v2) from an "office" device, with whatever the scenario needs
 * already filled there (another sheet's plate, its instruments), then works on the sheet.
 */

const account = TEST_SEED.companies[1];
const database = deviceDatabaseName(account.userId);
const SECC = getDefinition('v2', 'cabine_primaria', 'chave_seccionadora');
const CHECKLIST = SECC.checklist!;

interface OutboxRow {
  path: string;
  value: unknown;
  batch_id: string | null;
}

type Scope = { relatorioId: string };

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const toast = (page: Page) => page.getByTestId('toast');
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const field = (page: Page, key: string) => page.locator(`[data-field-key="${key}"]`);
const checklistRow = (page: Page, n: number) => page.locator('#ficha-step-verificacoes li.checklist-row').nth(n - 1);
const cabineRow = (page: Page, name: string) =>
  page.getByRole('list', { name: 'Locais do relatório' }).locator(':scope > li.s9-cabine').filter({ has: page.locator(':scope > .s9-cab-row .s9-cab-name', { hasText: name }) });

/** The count a step's accessible name reads ("Placa, 3 faltando"). */
async function stepMissing(page: Page, step: string): Promise<number> {
  const label = await stepper(page).getByRole('button', { name: new RegExp(`^${step},`) }).getAttribute('aria-label');
  return Number(/, (\d+) faltando/.exec(label ?? '')?.[1] ?? NaN);
}

/** A filled value of the field's kind, as the office would have typed it. */
function plateValue(f: FieldDef): unknown {
  if (f.kind === 'number') return { raw: '630', unit: f.unit ?? null, state: 'measured' };
  if (f.kind === 'date') return '2020-01-01';
  if (f.kind === 'select') return f.options![0];
  if (f.kind === 'voltage_class') return '15';
  return `P-${f.key}`;
}

/**
 * A complete sheet of `blockType` but its instruments: plate (never the TAG, which the block
 * prefills), checklist C, readings within criterion, the pair.
 */
function completeButInstruments(scope: Scope, blockId: string, blockType = 'chave_seccionadora'): OpDraft[] {
  const definition = getDefinition('v2', 'cabine_primaria', blockType);
  return [
    ...definition.nameplate.filter((f) => f.key !== 'tag').map((f) => officeDraft(account, scope, `sheet/${blockId}/nameplate/${f.key}`, plateValue(f))),
    ...(definition.checklist ?? []).map((item) => officeDraft(account, scope, `sheet/${blockId}/checklist/${item.key}/result`, 'C')),
    ...definition.tests
      .flatMap((t) => cellAddressesOf(definition, t.key))
      .map((c) =>
        officeDraft(account, scope, `sheet/${blockId}/test/${c.testKey}/cell/${c.row}/${c.col}`, c.testKey === 'isolacao' ? { raw: '150', unit: 'GΩ', state: 'measured' } : { raw: '100', unit: 'µΩ', state: 'measured' }),
      ),
    officeDraft(account, scope, `sheet/${blockId}/conclusion/result`, 'aprovado'),
    officeDraft(account, scope, `sheet/${blockId}/conclusion/restriction`, 'sem_restricoes'),
  ];
}

/**
 * Resets Empresa B, signs in at 768 x 1024, pushes a standard relatório (plus what `seed`
 * adds for its sheets) and opens its Sumário. With `instrument`, MG-01 is pushed too and
 * pulled with "Sincronizar agora". Returns the Cubículo Enel seccionadoras, in tree order.
 */
async function setUp(
  page: Page,
  seed: (scope: Scope, enel: [SeededSheet, SeededSheet], sheets: SeededSheet[], instrument: InstrumentRow | null, drafts: readonly OpDraft[]) => OpDraft[] = () => [],
  withInstrument = false,
): Promise<{ relatorioId: string; enel: [SeededSheet, SeededSheet]; sheets: SeededSheet[] }> {
  await resetEmpresaB({ standard: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const scope = { relatorioId: built.relatorioId };
  const enel = built.sheets.filter((sheet) => sheet.blockType === 'chave_seccionadora' && sheet.locationName === 'Cubículo Enel') as [SeededSheet, SeededSheet];
  expect(enel).toHaveLength(2);
  const instrument = withInstrument ? instrumentDraft(account) : null;
  const row = instrument === null ? null : (instrument.value as InstrumentRow);
  await pushDrafts(page, database, [...built.drafts, ...(instrument === null ? [] : [instrument]), ...seed(scope, enel, built.sheets, row, built.drafts)]);
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  if (withInstrument) await syncNowAndReturn(page);
  return { relatorioId: built.relatorioId, enel, sheets: built.sheets };
}

async function openSheet(page: Page, relatorioId: string, blockId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
}

/** Section 9 of the Sumário open. */
async function openSection9(page: Page): Promise<void> {
  const chevron = page.getByRole('button', { name: 'Expandir ou recolher a seção 9' });
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expect(page.getByRole('list', { name: 'Locais do relatório' })).toBeVisible();
}

test('@p0 12.3-E2E-001 the plate: every field visible with the chips above, no "Digitar"; TAG prefilled from the block and following its rename; "Igual à" keeps IDENTIFICAÇÃO, Nº SÉRIE and TAG, with Desfazer; "Outro…" types at once', async ({ page }) => {
  test.setTimeout(150_000);
  const { relatorioId, enel } = await setUp(page, (scope, [source]) => [
    officeDraft(account, scope, `sheet/${source.blockId}/nameplate/identificacao`, 'SC-01'),
    officeDraft(account, scope, `sheet/${source.blockId}/nameplate/fabricacao`, 'Celtta'),
    officeDraft(account, scope, `sheet/${source.blockId}/nameplate/n_serie`, '123456'),
    officeDraft(account, scope, `sheet/${source.blockId}/nameplate/tag`, source.tag),
    officeDraft(account, scope, `sheet/${source.blockId}/nameplate/tipo`, 'Rotativa'),
  ]);
  const [source, target] = enel;
  await openSheet(page, relatorioId, target.blockId);

  // D-6: the fields are there from the start, the copy chips above them, no "Digitar".
  await expect(page.getByRole('button', { name: 'Digitar' })).toHaveCount(0);
  const chips = page.getByRole('group', { name: 'Copiar dados de placa' });
  await expect(chips).toBeVisible();
  for (const f of SECC.nameplate) await expect(field(page, f.key)).toBeVisible();
  const chipsBox = (await chips.boundingBox())!;
  const gridBox = (await page.locator('#ficha-nameplate .nameplate-grid').boundingBox())!;
  expect(chipsBox.y + chipsBox.height).toBeLessThanOrEqual(gridBox.y);

  // J-09: the TAG field shows the block's TAG, counted as filled, nothing written.
  const tag = page.getByLabel('TAG', { exact: true });
  await expect(tag).toHaveValue(target.tag);
  await expect(tag).toHaveAccessibleDescription('Do bloco · editável');
  await expect(tag).not.toHaveAttribute('data-missing-field');
  expect(await stepMissing(page, 'Placa')).toBe(SECC.nameplate.length - 1);

  // D-3: "Igual à" copies the plate but the per-unit fields; the toast undoes it.
  await chips.getByRole('button', { name: `Igual à ${source.tag}?` }).click();
  await expect(toast(page)).toContainText(`Copiado de ${source.tag}`);
  await expect(toast(page).getByRole('button', { name: 'Desfazer' })).toBeVisible();
  await expect(page.getByLabel('Tipo', { exact: true })).toHaveValue('Rotativa');
  await expect(page.getByLabel('Identificação', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Nº série', { exact: true })).toHaveValue('');
  await expect(tag).toHaveValue(target.tag);
  const copied = (await outbox(page)).filter((row) => row.path.startsWith(`sheet/${target.blockId}/nameplate/`));
  expect(copied.map((row) => row.path.split('/').at(-1)).sort()).toEqual(['fabricacao', 'tipo']);
  expect(new Set(copied.map((row) => row.batch_id)).size).toBe(1);
  await toast(page).getByRole('button', { name: 'Desfazer' }).click();
  await expect(page.getByLabel('Tipo', { exact: true })).toHaveValue('');
  await expect(chips.getByRole('button', { name: `Igual à ${source.tag}?` })).toBeVisible();

  // J-09: "Outro…" lands in the Combobox it opens; typing goes straight in; "Criar" works offline.
  await field(page, 'fabricacao').getByRole('button', { name: 'Outro…' }).click();
  const fabricacao = field(page, 'fabricacao').getByRole('combobox');
  await expect(fabricacao).toBeFocused();
  await page.keyboard.type('Fabricante Doze');
  await expect(fabricacao).toHaveValue('Fabricante Doze');
  await page.getByRole('option', { name: 'Criar “Fabricante Doze”' }).click();
  await expect(fabricacao).toHaveValue('Fabricante Doze');
  await expect.poll(async () => (await outbox(page)).filter((row) => row.path === `sheet/${target.blockId}/nameplate/fabricacao`).at(-1)?.value).toBe('Fabricante Doze');

  // Renaming the block moves the untouched nameplate TAG with it.
  await page.getByRole('button', { name: `TAG ${target.tag} — renomear` }).click();
  const rename = page.getByRole('dialog', { name: `Renomear TAG ${target.tag}` });
  await rename.getByRole('textbox', { name: 'TAG' }).fill('SEC-NOVA');
  await rename.getByRole('button', { name: 'Salvar' }).click();
  await expect(tag).toHaveValue('SEC-NOVA');
  expect((await outbox(page)).some((row) => row.path === `sheet/${target.blockId}/nameplate/tag`)).toBe(false);

  // A TAG typed on the plate is the plate's own from then on, and survives a reload.
  await tag.fill('PLACA-01');
  await tag.press('Tab');
  await expect.poll(async () => (await outbox(page)).find((row) => row.path === `sheet/${target.blockId}/nameplate/tag`)?.value).toBe('PLACA-01');
  await expect(tag).not.toHaveAccessibleDescription('Do bloco · editável');
  await page.reload();
  await expect(page.getByLabel('TAG', { exact: true })).toHaveValue('PLACA-01');
  await expect(page.getByLabel('Identificação', { exact: true })).toBeVisible();
});

test('@p0 12.3-E2E-002 the instrument last used for a test kind is suggested on the next sheet; "Próxima ficha" writes nothing, "Concluir ficha" writes it with the conclusion; the reload shows it stored', async ({ page }) => {
  test.setTimeout(150_000);
  const { relatorioId, enel, sheets } = await setUp(
    page,
    (scope, [first, second], _sheets, instrument) => [
      officeDraft(account, scope, `sheet/${first.blockId}/test/isolacao/instrument`, instrumentHeaderOf(instrument!, 'isolacao')),
      officeDraft(account, scope, `sheet/${first.blockId}/test/resistencia_contato/instrument`, instrumentHeaderOf(instrument!, 'resistencia_contato')),
      ...completeButInstruments(scope, second.blockId),
    ],
    true,
  );
  const [, second] = enel;
  const instrumentOps = async (blockId: string) => (await outbox(page)).filter((row) => /\/test\/[a-z_]+\/instrument$/.test(row.path) && row.path.startsWith(`sheet/${blockId}/`));

  // An incomplete seccionadora elsewhere: the suggestion shows, "Próxima ficha" leaves it unwritten.
  const other = sheets.find((sheet) => sheet.blockType === 'chave_seccionadora' && sheet.locationName !== 'Cubículo Enel')!;
  await openSheet(page, relatorioId, other.blockId);
  const otherPicker = page.locator('section[data-test-key="isolacao"] .instrument-picker');
  await expect(otherPicker).toHaveAttribute('data-state', 'suggested');
  await page.locator('#ficha-primary').click();
  await expect(page).not.toHaveURL(new RegExp(`/ficha/${other.blockId}$`));
  expect(await instrumentOps(other.blockId)).toEqual([]);

  // The complete sheet: both tests suggest MG-01, amber "Sugerido" with the mock's helper.
  await openSheet(page, relatorioId, second.blockId);
  for (const testKey of ['isolacao', 'resistencia_contato']) {
    const picker = page.locator(`section[data-test-key="${testKey}"] .instrument-picker`);
    await expect(picker).toHaveClass(/suggestion-field/);
    await expect(picker).toHaveAttribute('data-state', 'suggested');
    await expect(picker.locator('.suggested-pill')).toHaveText('Sugerido');
    await expect(picker.getByRole('button', { name: 'Instrumento MG-01 — Megôhmetro' })).toHaveAccessibleDescription(
      'Último usado neste relatório · confirmado ao concluir a ficha, ou toque para trocar',
    );
  }
  expect(await instrumentOps(second.blockId)).toEqual([]);
  await expect(page.getByTestId('ficha-progress')).toHaveText('Ficha completa');

  // "Concluir ficha": the two instruments in the conclusion's batch.
  await expect(page.locator('#ficha-primary')).toHaveText(/Concluir ficha/);
  await page.locator('#ficha-primary').click();
  await expect(toast(page)).toContainText('Ficha concluída');
  await expect(page).not.toHaveURL(new RegExp(`/ficha/${second.blockId}$`));
  const written = await instrumentOps(second.blockId);
  expect(written.map((row) => row.path.split('/')[3]).sort()).toEqual(['isolacao', 'resistencia_contato']);
  const concluded = (await outbox(page)).find((row) => row.path === `block/${second.blockId}/concluded_by`)!;
  expect(concluded).toBeDefined();
  expect(new Set([...written.map((row) => row.batch_id), concluded.batch_id]).size).toBe(1);
  expect(written[0]!.value).toMatchObject({ code: 'MG-01', model: 'DMG10Ki' });
  // The plate's TAG was the block's, prefilled and never written: it still let the sheet conclude.
  expect((await outbox(page)).some((row) => row.path === `sheet/${second.blockId}/nameplate/tag`)).toBe(false);

  // Stored now: the picker shows it as a value, no suggestion.
  await openSheet(page, relatorioId, second.blockId);
  const stored = page.locator('section[data-test-key="isolacao"] .instrument-picker');
  await expect(stored.getByRole('button', { name: 'Instrumento MG-01 — Megôhmetro' })).toBeVisible();
  await expect(stored).not.toHaveAttribute('data-state', 'suggested');
  await expect(stored.locator('.suggested-pill')).toHaveCount(0);
});

test('@p0 12.4-E2E-004 a voltage class created with its unit ("15 kV") through "Outro…" is kept through a Tab away and a reload: "15" stored once, never a later null, read with its unit (E12-Q1)', async ({ page }) => {
  test.setTimeout(120_000);
  const { relatorioId, enel } = await setUp(page);
  const [secEnel] = enel;
  await openSheet(page, relatorioId, secEnel.blockId);
  const tensao = field(page, 'tensao_de_placa');
  await expect(tensao).toHaveAttribute('data-missing-field', '');
  const placaBefore = await stepMissing(page, 'Placa');

  await tensao.getByRole('button', { name: 'Outro…' }).click();
  const combobox = tensao.getByRole('combobox');
  await expect(combobox).toBeFocused();
  await page.keyboard.type('15 kV');
  await page.getByRole('option', { name: 'Criar “15 kV”' }).click();
  await expect(combobox).toHaveValue('15 kV');
  await expect.poll(async () => (await outbox(page)).filter((row) => row.path === `sheet/${secEnel.blockId}/nameplate/tensao_de_placa`).map((row) => row.value)).toEqual(['15']);
  // The created row arrives, then the engineer tabs away: the value stays.
  await combobox.focus();
  await page.keyboard.press('Tab');
  await expect(combobox).toHaveValue('15 kV');
  await expect(tensao).not.toHaveAttribute('data-missing-field');
  expect(await stepMissing(page, 'Placa')).toBe(placaBefore - 1);

  await page.reload();
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await expect(field(page, 'tensao_de_placa').getByRole('button', { name: '15 kV', pressed: true })).toBeVisible();
  await expect(field(page, 'tensao_de_placa')).not.toHaveAttribute('data-missing-field');
  expect(await stepMissing(page, 'Placa')).toBe(placaBefore - 1);
  expect((await outbox(page)).filter((row) => row.path === `sheet/${secEnel.blockId}/nameplate/tensao_de_placa`).map((row) => row.value)).toEqual(['15']);
});

test('@p0 12.1-E2E-008 a primary still labelled "Próxima ficha" when the last reading commits concludes on the fresh rows: the suggested instruments and the conclusion in one batch, then the next sheet (E12-Q6, open question D-4 kept)', async ({ page }) => {
  test.setTimeout(150_000);
  const cells = SECC.tests.flatMap((t) => cellAddressesOf(SECC, t.key));
  const last = cells.at(-1)!;
  const lastPath = (blockId: string) => `sheet/${blockId}/test/${last.testKey}/cell/${last.row}/${last.col}`;
  const { relatorioId, enel } = await setUp(
    page,
    (scope, [first, second], _sheets, instrument) => [
      officeDraft(account, scope, `sheet/${first.blockId}/test/isolacao/instrument`, instrumentHeaderOf(instrument!, 'isolacao')),
      officeDraft(account, scope, `sheet/${first.blockId}/test/resistencia_contato/instrument`, instrumentHeaderOf(instrument!, 'resistencia_contato')),
      ...completeButInstruments(scope, second.blockId).filter((draft) => draft.path !== lastPath(second.blockId)),
    ],
    true,
  );
  const [, second] = enel;
  await openSheet(page, relatorioId, second.blockId);
  const primary = page.locator('#ficha-primary');
  await page.locator(`.ficha-cell[data-cell="${last.testKey}:${last.row}:${last.col}"]`).filter({ visible: true }).locator('input').click();
  await page.keyboard.type(last.testKey === 'isolacao' ? '150' : '100');
  // The value is typed but not committed: this render still offers "Próxima ficha".
  await expect(primary).toHaveText(/Próxima ficha/);
  // In a fixed order: the pointer goes down on the primary, which blurs the reading and so
  // commits it; once that value's op is in the outbox the pointer comes up. The click runs the
  // primary this render labelled "Próxima ficha", and it concludes on the fresh rows.
  const box = (await primary.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(async () => (await outbox(page)).some((row) => row.path === lastPath(second.blockId)), { intervals: [20] }).toBe(true);
  await page.mouse.up();

  await expect(toast(page)).toContainText('Ficha concluída');
  await expect(page).not.toHaveURL(new RegExp(`/ficha/${second.blockId}$`));
  const rows = await outbox(page);
  const instruments = rows.filter((row) => row.path.startsWith(`sheet/${second.blockId}/test/`) && row.path.endsWith('/instrument'));
  const concluded = rows.filter((row) => row.path === `block/${second.blockId}/concluded_by`);
  expect(instruments.map((row) => row.path.split('/')[3]).sort()).toEqual(['isolacao', 'resistencia_contato']);
  expect(concluded).toHaveLength(1);
  expect(new Set([...instruments, ...concluded].map((row) => row.batch_id)).size).toBe(1);
  // The reading was committed before the conclusion read the rows (the one edit queue).
  expect(rows.some((row) => row.path === lastPath(second.blockId))).toBe(true);
});

test('@p0 12.3-E2E-003 the cabine: its empty fields counted on its first sheet and named on the Sumário row; editable while incomplete on a later sheet; one line with "Editar" once complete, the edit reaching every sheet', async ({ page }) => {
  test.setTimeout(180_000);
  const { relatorioId } = await setUp(page);

  // The Sumário names what the cabine lacks, on its row and in the section 9 pending line.
  await openSection9(page);
  await expect(cabineRow(page, 'Cubículo Enel').locator('.s9-cab-meta .cl-missing')).toHaveText('faltam 6 campos');
  await expect(page.locator('li.sum-s9 .sum-status')).toContainText('Cubículo Enel: faltam 6 campos');

  // The first sheet counts the six fields in Placa; "Concluir ficha" lands on the first one.
  await page.getByRole('button', { name: 'Mais opções de Cubículo Enel' }).click();
  await page.getByRole('menuitem', { name: 'Abrir primeira ficha (dados da cabine)' }).click();
  await expect(page).toHaveURL(/\/ficha\//);
  const firstUrl = page.url();
  await expect(page.getByRole('heading', { name: 'Características da SE' })).toBeVisible();
  const withCabine = await stepMissing(page, 'Placa');
  expect(withCabine).toBeGreaterThanOrEqual(6);
  // E12-Q10: the cabine's first sheet holds no plate field left, and the header names the six as the cabine's;
  // E12-Q8: the count in `.n-missing`.
  expect(withCabine).toBe(6);
  await expect(page.getByTestId('ficha-progress')).toHaveText(/^Faltam 6 campos da cabine, /);
  await expect(page.getByTestId('ficha-progress').locator('.n-missing').first()).toHaveText('6');
  const tag = (await page.locator('.sheet-header .tag-btn').textContent())!.trim();
  await page.getByRole('button', { name: `Mais opções da ficha ${tag}` }).click();
  await page.getByRole('menuitem', { name: 'Concluir ficha' }).click();
  await expect(page.getByLabel('Tipo de SE', { exact: true })).toBeFocused();

  await page.getByLabel('Tipo de SE', { exact: true }).selectOption('BLINDADA');
  for (const [label, value] of [
    ['Tensão primária', '13,8'],
    ['Tensão secundária', '380'],
    ['Potência instalada', '1500'],
    ['Temperatura', '25'],
  ] as const) {
    const input = page.getByLabel(label, { exact: true });
    await input.fill(value);
    await input.press('Tab');
  }
  await expect.poll(() => stepMissing(page, 'Placa')).toBe(withCabine - 5);

  // The Sumário row now says the one field left.
  await page.goto(`/relatorio/${relatorioId}`);
  await openSection9(page);
  await expect(cabineRow(page, 'Cubículo Enel').locator('.s9-cab-meta .cl-missing')).toHaveText('falta a umidade');
  await expect(page.locator('li.sum-s9 .sum-status')).toContainText('Cubículo Enel: falta a umidade');

  // A later sheet of the incomplete cabine: expanded and editable, not counted there.
  await page.goto(firstUrl);
  await expect(page.getByRole('heading', { name: 'Características da SE' })).toBeVisible();
  await page.locator('#ficha-primary').click();
  await expect(page).not.toHaveURL(firstUrl);
  await expect(page.getByRole('heading', { name: 'Características da SE' })).toBeVisible();
  const umidade = page.getByLabel('Umidade relativa do ar', { exact: true });
  await expect(umidade).toBeEditable();
  await expect(umidade).not.toHaveAttribute('data-missing-field');
  const laterPlaca = await stepMissing(page, 'Placa');
  await umidade.fill('65');
  await umidade.press('Enter');
  // Completing the cabine here folds nothing under the finger, and changes no count here.
  await expect(page.getByRole('heading', { name: 'Características da SE' })).toBeVisible();
  expect(await stepMissing(page, 'Placa')).toBe(laterPlaca);

  // The next sheet: one line, the values, "Editar".
  await page.locator('#ficha-primary').click();
  const line = page.getByRole('group', { name: 'Da cabine' });
  await expect(line).toBeVisible();
  await expect(line.locator('.cl-name')).toHaveText('Cubículo Enel');
  await expect(line.locator('.cl-values')).toHaveText('BLINDADA · 13,8 kV · 380 V · 1.500 kVA · 25 °C · 65 %');
  await expect(page.getByRole('heading', { name: 'Características da SE' })).toHaveCount(0);
  const editar = line.getByRole('button', { name: 'Editar' });
  expect(Math.round((await editar.boundingBox())!.height)).toBeGreaterThanOrEqual(48);
  await editar.click();
  await expect(page.getByRole('heading', { name: 'Características da SE' })).toBeVisible();
  const temperatura = page.getByLabel('Temperatura', { exact: true });
  await temperatura.fill('26');
  await temperatura.press('Tab');
  await expect.poll(async () => (await outbox(page)).filter((row) => row.path.endsWith('/env/temperature_c')).at(-1)?.value).toEqual({ raw: '26', unit: '°C', state: 'measured' });

  // Complete: the Sumário row has its values and nothing missing; the first sheet shows the edit.
  await page.goto(`/relatorio/${relatorioId}`);
  await openSection9(page);
  await expect(cabineRow(page, 'Cubículo Enel').locator('.s9-cab-meta')).toHaveText('BLINDADA · 13,8 kV · 26 °C · 65 %');
  await expect(cabineRow(page, 'Cubículo Enel').locator('.cl-missing')).toHaveCount(0);
  await expect(page.locator('li.sum-s9 .sum-status')).not.toContainText('Cubículo Enel:');
  await page.goto(firstUrl);
  await expect(page.getByLabel('Temperatura', { exact: true })).toHaveValue('26');
  expect(await stepMissing(page, 'Placa')).toBe(withCabine - 6);
});

test('@p0 12.3-E2E-005 a cabine first sheet complete but one cabine field: "Próxima ficha" and the menu\'s "Concluir ficha" conclude nothing, the menu lands on the cabine field; once typed, the primary concludes', async ({ page }) => {
  test.setTimeout(150_000);
  const n = (raw: string, unit: string) => ({ raw, unit, state: 'measured' as const });
  let firstSheet: SeededSheet | null = null;
  const { relatorioId } = await setUp(page, (scope, _enel, sheets, _instrument, drafts) => {
    const cabine = drafts.find((d) => d.kind === 'create' && d.path.startsWith('location/') && (d.value as { name?: string }).name === 'Cubículo Enel')!;
    const cabineId = (cabine.value as { id: string }).id;
    firstSheet = sheets.find((sheet) => sheet.locationName === 'Cubículo Enel')!;
    return [
      ...completeButInstruments(scope, firstSheet.blockId, firstSheet.blockType),
      officeDraft(account, scope, `location/${cabineId}/se/type`, 'BLINDADA'),
      officeDraft(account, scope, `location/${cabineId}/se/primary_kv`, n('13.8', 'kV')),
      officeDraft(account, scope, `location/${cabineId}/se/secondary_kv`, n('380', 'V')),
      officeDraft(account, scope, `location/${cabineId}/se/installed_kva`, n('1500', 'kVA')),
      officeDraft(account, scope, `location/${cabineId}/env/temperature_c`, n('25', '°C')),
    ];
  });
  const first = firstSheet!;
  const concludedOps = async () => (await outbox(page)).filter((row) => row.path === `block/${first.blockId}/concluded_by`);

  // It is the cabine's first sheet: the one empty cabine field is the one thing it lacks.
  await openSection9(page);
  await page.getByRole('button', { name: 'Mais opções de Cubículo Enel' }).click();
  await page.getByRole('menuitem', { name: 'Abrir primeira ficha (dados da cabine)' }).click();
  await expect(page).toHaveURL(new RegExp(`/ficha/${first.blockId}$`));
  // E12-Q10: the field is the cabine's, and the sentence names it so; E12-Q8: its count in `.n-missing`.
  await expect(page.getByTestId('ficha-progress')).toHaveText('Verificações, leituras e conclusão prontas · falta 1 campo da cabine');
  await expect(page.getByTestId('ficha-progress').locator('.n-missing')).toHaveText(['1']);
  expect(await stepMissing(page, 'Placa')).toBe(1);

  // The primary reads "Próxima ficha" and moves on without concluding.
  await expect(page.locator('#ficha-primary')).toHaveText(/Próxima ficha/);
  await page.locator('#ficha-primary').click();
  await expect(page).not.toHaveURL(new RegExp(`/ficha/${first.blockId}$`));
  expect(await concludedOps()).toEqual([]);

  // The menu's "Concluir ficha" concludes nothing and lands on the empty cabine field.
  await openSheet(page, relatorioId, first.blockId);
  await page.getByRole('button', { name: `Mais opções da ficha ${first.tag}` }).click();
  await page.getByRole('menuitem', { name: 'Concluir ficha' }).click();
  const umidade = page.getByLabel('Umidade relativa do ar', { exact: true });
  await expect(umidade).toBeFocused();
  await expect(umidade).toHaveAttribute('data-missing-field', '');
  expect(await concludedOps()).toEqual([]);

  // Typed and entered: the primary concludes at once, on the fresh rows.
  await page.keyboard.type('65');
  await page.keyboard.press('Enter');
  await page.locator('#ficha-primary').click();
  await expect(toast(page)).toContainText('Ficha concluída');
  await expect.poll(async () => (await concludedOps()).length).toBe(1);
});

test('@p0 12.4-E2E-003 the suggested sheet observation: its own "Confirmar" writes exactly the suggestion; a tap and typing replace it whole', async ({ page }) => {
  test.setTimeout(150_000);
  const { relatorioId, enel } = await setUp(page);
  const n = CHECKLIST.findIndex((item) => item.nc_phrases.includes('conexão frouxa')) + 1;
  expect(n).toBeGreaterThan(0);
  const observations = async (blockId: string) => (await outbox(page)).filter((row) => row.path === `sheet/${blockId}/observations`);
  const markNc = async () => {
    await checklistRow(page, n).getByRole('radio', { name: 'Não conforme' }).click();
    await checklistRow(page, n).getByRole('group', { name: `Observações sugeridas do item ${n}` }).getByRole('button', { name: 'conexão frouxa' }).click();
    await expect(page.getByLabel(`Observação do item ${n}`, { exact: true })).toHaveValue('conexão frouxa');
  };
  const observation = page.getByLabel('Observações da ficha', { exact: true });
  const suggested = page.locator('.field.suggestion-field[data-state="suggested"]').filter({ has: observation });

  // Its own "Confirmar": one op, exactly the suggestion, and the suggestion gone.
  const [a, b] = enel;
  await openSheet(page, relatorioId, a.blockId);
  await markNc();
  await expect(observation).toHaveValue(`Item ${n}: conexão frouxa`);
  await suggested.getByRole('button', { name: 'Confirmar' }).click();
  await expect.poll(async () => (await observations(a.blockId)).map((row) => row.value)).toEqual([`Item ${n}: conexão frouxa`]);
  await expect(suggested).toHaveCount(0);
  await expect(observation).toHaveValue(`Item ${n}: conexão frouxa`);

  // Another sheet: a tap on the suggestion and typing write exactly what was typed.
  await openSheet(page, relatorioId, b.blockId);
  await markNc();
  await expect(suggested).toHaveCount(1);
  await observation.click();
  await expect(observation).toHaveValue('');
  await page.keyboard.type('Texto do engenheiro');
  await observation.blur();
  await expect.poll(async () => (await observations(b.blockId)).at(-1)?.value).toBe('Texto do engenheiro');
  expect((await observations(b.blockId)).map((row) => row.value)).toEqual(['Texto do engenheiro']);
  await expect(observation).toHaveValue('Texto do engenheiro');
  await expect(suggested).toHaveCount(0);
});

test('@p0 12.4-E2E-001an NC item observation becomes the suggested sheet observation, written with the conclusion text: Com restrições with nothing typed', async ({ page }) => {
  test.setTimeout(150_000);
  const { relatorioId, enel } = await setUp(page);
  const [sheet] = enel;
  await openSheet(page, relatorioId, sheet.blockId);

  // One NC with its chip, the rest Conforme.
  const n = CHECKLIST.findIndex((item) => item.nc_phrases.includes('conexão frouxa')) + 1 || 1;
  const item = CHECKLIST[n - 1]!;
  const phrase = item.nc_phrases.includes('conexão frouxa') ? 'conexão frouxa' : item.nc_phrases[0]!;
  await checklistRow(page, n).getByRole('radio', { name: 'Não conforme' }).click();
  await checklistRow(page, n).getByRole('group', { name: `Observações sugeridas do item ${n}` }).getByRole('button', { name: phrase }).click();
  await expect(page.getByLabel(`Observação do item ${n}`, { exact: true })).toHaveValue(phrase);
  await page.locator('#ficha-step-verificacoes .bulk-action-bar').getByRole('button', { name: 'Marcar os restantes como Conforme' }).click();
  await expect(toast(page)).toContainText('marcados Conforme');

  // The sheet observation stands as a suggestion: amber, "Sugerido", the mock's helper.
  const observation = page.getByLabel('Observações da ficha', { exact: true });
  const suggested = page.locator('.field.suggestion-field[data-state="suggested"]').filter({ has: observation });
  await expect(observation).toHaveValue(`Item ${n}: ${phrase}`);
  await expect(suggested.locator('.suggested-pill')).toHaveText('Sugerido');
  await expect(observation).toHaveAccessibleDescription('Montada dos itens NC · confirmada com o texto da conclusão');

  // Com restrições: the pair suggestion, then no red "required" while the suggestion stands.
  await page.getByRole('group', { name: 'Sugestão' }).getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByRole('radiogroup', { name: 'Restrições' }).getByRole('radio', { name: 'Com restrições' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Obrigatória com restrições')).toHaveCount(0);
  await expect(suggested.getByRole('button', { name: 'Confirmar' })).toHaveAttribute('data-missing-field', '');
  expect(await stepMissing(page, 'Conclusão')).toBe(1);
  expect((await outbox(page)).some((row) => row.path === `sheet/${sheet.blockId}/observations`)).toBe(false);

  // A focus and a blur without typing write nothing.
  await observation.click();
  await observation.blur();
  expect((await outbox(page)).some((row) => row.path === `sheet/${sheet.blockId}/observations`)).toBe(false);

  // Confirming the conclusion text writes the observation in the same batch.
  await page.locator('.ficha-conc-text').getByRole('button', { name: 'Confirmar' }).click();
  await expect.poll(async () => (await outbox(page)).find((row) => row.path === `sheet/${sheet.blockId}/observations`)?.value).toBe(`Item ${n}: ${phrase}`);
  const ops = await outbox(page);
  const observationBatch = ops.find((row) => row.path === `sheet/${sheet.blockId}/observations`)!.batch_id;
  expect(ops.find((row) => row.path === `sheet/${sheet.blockId}/conclusion/text`)!.batch_id).toBe(observationBatch);
  await expect(page.locator('.field.suggestion-field').filter({ has: observation })).toHaveCount(0);
  await expect(observation).toHaveValue(`Item ${n}: ${phrase}`);
  await expect.poll(() => stepMissing(page, 'Conclusão')).toBe(0);
  await page.reload();
  await expect(page.getByLabel('Observações da ficha', { exact: true })).toHaveValue(`Item ${n}: ${phrase}`);
});

test('@p0 12.4-E2E-002 "Marcar não ensaiado" from the sheet menu and the tree menu: nothing preselected, the primary waits with its reason, the third standard reason, "Outro" needs text', async ({ page }) => {
  test.setTimeout(150_000);
  const { relatorioId, enel } = await setUp(page);
  const [first, second] = enel;

  // From the sheet header's menu.
  await openSheet(page, relatorioId, first.blockId);
  await page.getByRole('button', { name: `Mais opções da ficha ${first.tag}` }).click();
  await page.getByRole('menuitem', { name: 'Marcar não ensaiado' }).click();
  let dialog = page.getByRole('dialog', { name: 'Marcar não ensaiado' });
  const reasons = ['Impossibilidade de desligamento', 'Solicitação do cliente', 'Equipamento inacessível', 'Outro'];
  await expect(dialog.getByRole('radio')).toHaveText(reasons);
  for (const reason of reasons) await expect(dialog.getByRole('radio', { name: reason })).toHaveAttribute('aria-checked', 'false');
  let primary: Locator = dialog.getByRole('button', { name: 'Marcar não ensaiado' });
  await expect(primary).toHaveAttribute('aria-disabled', 'true');
  await expect(primary).toHaveAccessibleDescription('Escolha um motivo');
  // A tap on the disabled primary (`aria-disabled`, still pressable) records nothing.
  await primary.click({ force: true });
  await expect(dialog).toBeVisible();
  expect((await outbox(page)).some((row) => row.path === `block/${first.blockId}/not_tested`)).toBe(false);

  await dialog.getByRole('radio', { name: 'Outro' }).click();
  const text = dialog.getByLabel('Descreva o motivo');
  await expect(text).toBeVisible();
  await expect(primary).toHaveAttribute('aria-disabled', 'true');
  await expect(primary).toHaveAccessibleDescription('Descreva o motivo');
  await text.fill('   ');
  await expect(primary).toHaveAttribute('aria-disabled', 'true');
  await text.fill('Chave travada');
  await expect(primary).not.toHaveAttribute('aria-disabled');

  // The third standard reason prints its own justification: no text asked.
  await dialog.getByRole('radio', { name: 'Equipamento inacessível' }).click();
  await expect(dialog.getByLabel('Descreva o motivo')).toHaveCount(0);
  await expect(primary).not.toHaveAttribute('aria-disabled');
  await primary.click();
  await expect(dialog).toBeHidden();
  await expect(toast(page)).toContainText('Marcada como não ensaiada — entra na seção 8');
  await expect(page.locator('.not-tested-band .band-reason')).toHaveText('Equipamento inacessível');
  expect((await outbox(page)).find((row) => row.path === `block/${first.blockId}/not_tested`)).toMatchObject({ value: { reason: 'equipamento_inacessivel', text: null } });

  // From the tree row's menu: nothing preselected there either, even after a mark.
  await page.goto(`/relatorio/${relatorioId}`);
  await openSection9(page);
  const expand = page.getByRole('button', { name: 'Expandir Cubículo Enel' });
  if ((await expand.count()) > 0) await expand.click();
  await page.getByRole('button', { name: `Mais opções de ${second.tag}`, exact: true }).click();
  await page.getByRole('menuitem', { name: 'Marcar não ensaiado' }).click();
  dialog = page.getByRole('dialog', { name: 'Marcar não ensaiado' });
  await expect(dialog.locator('[role="radio"][aria-checked="true"]')).toHaveCount(0);
  primary = dialog.getByRole('button', { name: 'Marcar não ensaiado' });
  await expect(primary).toHaveAttribute('aria-disabled', 'true');
  await dialog.getByRole('radio', { name: 'Outro' }).click();
  await dialog.getByLabel('Descreva o motivo').fill('Acesso bloqueado pela obra');
  await primary.click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('li.s9-eq').filter({ has: page.locator('.block-tag', { hasText: new RegExp(`^${second.tag}$`) }) }).locator('.s9-state')).toHaveText(
    '⊘ Não ensaiada · Acesso bloqueado pela obra',
  );
});
