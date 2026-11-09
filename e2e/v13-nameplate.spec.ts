import {
  EMPTY_DEFINITION_CONTEXT,
  evaluateSheetReadings,
  getDefinition,
  nameplateAcceptsNotApplicable,
  screenLabel,
  SEED_VERSION,
  tapPickerOf,
  tapsHelperText,
  type BlockRow,
  type FieldDef,
  type OpDraft,
} from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts, type SeededSheet } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Story 23.7 (seed v13, decision K), driven as a person does on a fresh standard relatório of
 * Empresa B (no fixed ids), each sheet opened by its address: the nameplate fields the tests
 * depend on, typed or picked field by field, each write read back from the outbox as the
 * committed op (E12-A6). The transformer's TAPS is typed as a list (an invalid one refused, nothing
 * written) and its TAP ATUAL is then picked from them; the para-raio's DESLIGADOR ÍNTEGRO counts
 * missing while empty; a TP's "13,8/√3" over "115/√3" and a TC's "200-5" give VAL CALCULADO.
 * Every derived word and number asserted is the kernel's (the helper, the picker's options, VAL
 * CALCULADO, from the device's own block row); the sample values are invented.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  // This worker's Empresa B (E6-Q7): its company, its user and its device database.
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

interface OutboxRow {
  path: string;
  value: unknown;
}
interface EntityRecord<T> {
  entity: string;
  id: string;
  row: T;
}

const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' });
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const field = (page: Page, key: string): Locator => page.locator(`#ficha-nameplate [data-field-key="${key}"]`);
const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const lastValue = async (page: Page, path: string) => (await outbox(page)).filter((row) => row.path === path).at(-1)?.value;
const written = (page: Page, blockId: string, key: string) => (async () => lastValue(page, `sheet/${blockId}/nameplate/${key}`)) as () => Promise<unknown>;
const plateOf = (type: string): readonly FieldDef[] => getDefinition(SEED_VERSION, 'cabine_primaria', type).nameplate;

/** The device's own row of the block, as Dexie holds it. */
async function blockRow(page: Page, blockId: string): Promise<BlockRow> {
  const records = await readStore<EntityRecord<BlockRow>>(page, database, 'entities');
  return records.find((record) => record.entity === 'block' && record.id === blockId)!.row;
}

/** Resets Empresa B, signs in at 1280 and pushes a standard relatório of the current seed (Em campo) plus `extra` drafts. */
async function setUp(page: Page, extra: (scope: { relatorioId: string }, sheets: readonly SeededSheet[]) => OpDraft[] = () => []) {
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const scope = { relatorioId: built.relatorioId };
  await pushDrafts(page, database, [...built.drafts, emCampoDraft(account, built.relatorioId), ...extra(scope, built.sheets)]);
  return built;
}

/** The first sheet of `type` in `cabine`. */
function sheetOf(sheets: readonly SeededSheet[], type: string, cabine: string): SeededSheet {
  const sheet = sheets.find((candidate) => candidate.blockType === type && candidate.locationName === cabine);
  expect(sheet, `no ${type} sheet in ${cabine}`).toBeDefined();
  return sheet!;
}

async function openSheet(page: Page, relatorioId: string, blockId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
}

/** Types `text` into the plate field `key` and leaves it with Tab, as a person does. */
async function typeIn(page: Page, key: string, text: string): Promise<void> {
  const input = field(page, key).locator('input').first();
  await input.click();
  await input.fill(text);
  await input.press('Tab');
}

/** Picks `option` in the plate select `key`. */
async function pick(page: Page, key: string, option: string): Promise<void> {
  await field(page, key).locator('select').selectOption(option);
}

test('@p0 23.7-E2E-001 the v13 transformador de força: TAPS typed as a list (an invalid one refused, nothing written), TAP ATUAL picked from them, then IMPEDÂNCIA, MATERIAL DO ENROLAMENTO, the two temperatures and CLASSE TÉRMICA', async ({ page }) => {
  test.setTimeout(180_000);
  const built = await setUp(page);
  const sheet = sheetOf(built.sheets, 'transformador_forca', 'Oxigênio');
  await openSheet(page, built.relatorioId, sheet.blockId);
  const value = written(page, sheet.blockId, 'taps');

  // The fields the plate gains, in the seed's order: TAPS and TAP ATUAL where v12's text TAP ATUAL was.
  const keys = plateOf('transformador_forca').map((f) => f.key);
  expect(keys.indexOf('tap_atual_kv')).toBe(keys.indexOf('taps') + 1);
  expect(keys).not.toContain('tap_atual');
  for (const key of ['taps', 'tap_atual_kv', 'impedancia_pct', 'material_enrolamento', 'temperatura_oleo_c', 'temperatura_enrolamento_c', 'classe_termica']) {
    await expect(field(page, key), key).toBeVisible();
  }

  // TAPS empty: TAP ATUAL is a plain kV number field, no picker yet.
  await expect(field(page, 'tap_atual_kv').getByRole('combobox')).toHaveCount(0);
  await expect(field(page, 'tap_atual_kv').locator('input')).toHaveAttribute('inputmode', 'decimal');
  // TAPS takes text (a list), its helper the kernel's.
  const taps = field(page, 'taps').locator('input').first();
  await expect(taps).toHaveAttribute('inputmode', 'text');
  await expect(field(page, 'taps').locator('.helper')).toHaveText(tapsHelperText(null));

  // A repeated value is no list: the helper says so and nothing is written.
  await typeIn(page, 'taps', '12; 12');
  await expect(field(page, 'taps').locator('.helper')).toHaveText('Lista não reconhecida: dois ou mais valores diferentes, separados por ;');
  expect(await value()).toBeUndefined();

  // Five taps, separated by ";": stored as the dot-decimal list in kV, shown with "·", counted by the helper.
  await typeIn(page, 'taps', '13,8; 13,2; 12,6; 12; 11,4');
  await expect.poll(value).toEqual(measured('13.8;13.2;12.6;12;11.4', 'kV'));
  await expect(taps).toHaveValue('13,8 · 13,2 · 12,6 · 12 · 11,4');
  await expect(field(page, 'taps').locator('.helper')).toHaveText(tapsHelperText(measured('13.8;13.2;12.6;12;11.4', 'kV')));

  // TAP ATUAL is now the picker of the kernel's options, "N — V kV" in plate order, then "N/A"; a pick writes the tap's kV.
  const definition = getDefinition(SEED_VERSION, 'cabine_primaria', 'transformador_forca');
  const tapAtual = definition.nameplate.find((f) => f.key === 'tap_atual_kv')!;
  const row = await blockRow(page, sheet.blockId);
  const picker = tapPickerOf(row, definition, tapAtual, { acceptsNotApplicable: nameplateAcceptsNotApplicable(row, tapAtual.key, EMPTY_DEFINITION_CONTEXT) })!;
  expect(picker.options.map((option) => option.label)).toEqual(['1 — 13,8 kV', '2 — 13,2 kV', '3 — 12,6 kV', '4 — 12 kV', '5 — 11,4 kV', 'N/A']);
  const combobox = field(page, 'tap_atual_kv').getByRole('combobox', { name: screenLabel(tapAtual.label) });
  const openList = () => field(page, 'tap_atual_kv').getByRole('button', { name: 'Abrir lista' }).click();
  // The select's empty option leads the list, as on every plate select, and reads while nothing is stored.
  await expect(combobox).toHaveValue('Selecione');
  await openList();
  await expect(page.getByRole('option')).toHaveText(['Selecione', ...picker.options.map((option) => option.label)]);
  await page.getByRole('option', { name: picker.options[2]!.label, exact: true }).click();
  await expect.poll(written(page, sheet.blockId, 'tap_atual_kv')).toEqual(measured('12.6', 'kV'));
  await expect(combobox).toHaveValue(picker.options[2]!.label);
  // "N/A" writes the not-applicable value; the empty option clears it.
  await openList();
  await page.getByRole('option', { name: 'N/A', exact: true }).click();
  await expect.poll(written(page, sheet.blockId, 'tap_atual_kv')).toEqual({ raw: '', unit: null, state: 'not_applicable' });
  await expect(combobox).toHaveValue('N/A');
  await openList();
  await page.getByRole('option', { name: 'Selecione', exact: true }).click();
  await expect.poll(written(page, sheet.blockId, 'tap_atual_kv')).toBeNull();
  await expect(combobox).toHaveValue('Selecione');
  await openList();
  await page.getByRole('option', { name: picker.options[2]!.label, exact: true }).click();
  await expect.poll(written(page, sheet.blockId, 'tap_atual_kv')).toEqual(measured('12.6', 'kV'));
  await expect(combobox).toHaveValue(picker.options[2]!.label);

  // The fields after DESLOCAMENTO ANGULAR.
  await typeIn(page, 'impedancia_pct', '5,5');
  await expect.poll(written(page, sheet.blockId, 'impedancia_pct')).toEqual(measured('5.5', '%'));
  await pick(page, 'material_enrolamento', 'Cu');
  await expect.poll(written(page, sheet.blockId, 'material_enrolamento')).toBe('Cu');
  await typeIn(page, 'temperatura_oleo_c', '45');
  await expect.poll(written(page, sheet.blockId, 'temperatura_oleo_c')).toEqual(measured('45', '°C'));
  await typeIn(page, 'temperatura_enrolamento_c', '60');
  await expect.poll(written(page, sheet.blockId, 'temperatura_enrolamento_c')).toEqual(measured('60', '°C'));
  await pick(page, 'classe_termica', 'F (155)');
  await expect.poll(written(page, sheet.blockId, 'classe_termica')).toBe('F (155)');

  // A reload reads them all back from the device.
  await page.reload();
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await expect(field(page, 'taps').locator('input').first()).toHaveValue('13,8 · 13,2 · 12,6 · 12 · 11,4');
  await expect(field(page, 'tap_atual_kv').getByRole('combobox')).toHaveValue(picker.options[2]!.label);
  await expect(field(page, 'material_enrolamento').locator('select')).toHaveValue('Cu');
  await expect(field(page, 'classe_termica').locator('select')).toHaveValue('F (155)');
});

test('@p0 23.7-E2E-002 the v13 disjuntor, seccionadora, para-raio and cables: every new field written; the seccionadora\'s ACIONAMENTO offers MOTORIZADO; the cables open on a Placa step', async ({ page }) => {
  test.setTimeout(240_000);
  const built = await setUp(page);
  const go = async (type: string, cabine: string) => {
    const sheet = sheetOf(built.sheets, type, cabine);
    await openSheet(page, built.relatorioId, sheet.blockId);
    return sheet.blockId;
  };

  // Disjuntor MT: MONTAGEM, TENSÃO DE COMANDO (text), ACIONAMENTO, the counter and the maker's times.
  const dj = await go('disjuntor_mt', 'Cubículo Enel');
  await pick(page, 'tipo_montagem', 'EXTRAÍVEL');
  await expect.poll(written(page, dj, 'tipo_montagem')).toBe('EXTRAÍVEL');
  await typeIn(page, 'tensao_comando_v', '125 Vcc');
  await expect.poll(written(page, dj, 'tensao_comando_v')).toBe('125 Vcc');
  await pick(page, 'acionamento', 'MOLA MOTORIZADA');
  await expect.poll(written(page, dj, 'acionamento')).toBe('MOLA MOTORIZADA');
  await typeIn(page, 'contador_operacoes', '1520');
  await expect.poll(written(page, dj, 'contador_operacoes')).toEqual(measured('1520', null));
  await typeIn(page, 'tempo_abertura_fab_ms', '45');
  await expect.poll(written(page, dj, 'tempo_abertura_fab_ms')).toEqual(measured('45', 'ms'));
  await typeIn(page, 'tempo_fechamento_fab_ms', '60');
  await expect.poll(written(page, dj, 'tempo_fechamento_fab_ms')).toEqual(measured('60', 'ms'));

  // Chave seccionadora: TIPO DE SECCIONADORA, CORRENTE DO FUSÍVEL, MOTORIZADO among the ACIONAMENTO options.
  const sc = await go('chave_seccionadora', 'Cubículo Enel');
  const acionamento = plateOf('chave_seccionadora').find((f) => f.key === 'acionamento')!;
  expect(acionamento.options).toContain('MOTORIZADO');
  await expect(field(page, 'acionamento').locator('select option')).toHaveText(['Selecione', ...acionamento.options!]);
  await pick(page, 'acionamento', 'MOTORIZADO');
  await expect.poll(written(page, sc, 'acionamento')).toBe('MOTORIZADO');
  await pick(page, 'tipo_seccionadora', 'SOB CARGA COM FUSÍVEIS');
  await expect.poll(written(page, sc, 'tipo_seccionadora')).toBe('SOB CARGA COM FUSÍVEIS');
  await typeIn(page, 'fusivel_corrente_a', '40');
  await expect.poll(written(page, sc, 'fusivel_corrente_a')).toEqual(measured('40', 'A'));

  // Para-raio: MCOV, INVÓLUCRO, DESLIGADOR ÍNTEGRO.
  const pr = await go('para_raio', 'Cubículo Enel');
  await typeIn(page, 'mcov_kv', '12,7');
  await expect.poll(written(page, pr, 'mcov_kv')).toEqual(measured('12.7', 'kV'));
  await pick(page, 'involucro', 'POLIMÉRICO');
  await expect.poll(written(page, pr, 'involucro')).toBe('POLIMÉRICO');
  await pick(page, 'desligador_integro', 'SIM');
  await expect.poll(written(page, pr, 'desligador_integro')).toBe('SIM');

  // Cabos de saída: the sheet opens on Placa now (Story 23.7), its six fields.
  const cb = await go('cabos_saida', 'Cubículo Enel');
  await expect(stepper(page).getByRole('button')).toHaveText([/Placa/, /Verificações/, /Ensaios/, /Conclusão/]);
  const cablePlate = plateOf('cabos_saida');
  expect(cablePlate.map((f) => f.key)).toEqual(['classe_cabo', 'isolacao_cabo', 'secao_mm2', 'comprimento_m', 'tipo_terminacao', 'condicao_cabo']);
  await expect(stepper(page).getByRole('button', { name: `Placa, ${cablePlate.length} faltando` })).toBeVisible();
  await pick(page, 'classe_cabo', '8,7/15 kV');
  await expect.poll(written(page, cb, 'classe_cabo')).toBe('8,7/15 kV');
  await pick(page, 'isolacao_cabo', 'EPR');
  await expect.poll(written(page, cb, 'isolacao_cabo')).toBe('EPR');
  await typeIn(page, 'secao_mm2', '50');
  await expect.poll(written(page, cb, 'secao_mm2')).toEqual(measured('50', 'mm²'));
  await typeIn(page, 'comprimento_m', '120');
  await expect.poll(written(page, cb, 'comprimento_m')).toEqual(measured('120', 'm'));
  await pick(page, 'tipo_terminacao', 'TERMOCONTRÁTIL');
  await expect.poll(written(page, cb, 'tipo_terminacao')).toBe('TERMOCONTRÁTIL');
  await pick(page, 'condicao_cabo', 'EM SERVIÇO (MANUTENÇÃO)');
  await expect.poll(written(page, cb, 'condicao_cabo')).toBe('EM SERVIÇO (MANUTENÇÃO)');
  await expect(stepper(page).getByRole('button', { name: 'Placa, 0 faltando' })).toBeVisible();
});

test('@p0 23.7-E2E-003 a v13 para-raio with DESLIGADOR ÍNTEGRO empty counts it missing: the Placa step, its marker and "Concluir ficha" land on it; picked, the plate is complete', async ({ page }) => {
  test.setTimeout(180_000);
  const fields = plateOf('para_raio');
  let target: SeededSheet | null = null;
  // Every plate field but DESLIGADOR ÍNTEGRO filled from the office.
  const built = await setUp(page, (scope, sheets) => {
    target = sheetOf(sheets, 'para_raio', 'Cubículo Enel');
    return fields
      .filter((f) => f.key !== 'desligador_integro')
      .map((f) =>
        officeDraft(account, scope, `sheet/${target!.blockId}/nameplate/${f.key}`, f.kind === 'number' ? measured('10', f.unit ?? null) : f.kind === 'select' ? f.options![0]! : f.kind === 'voltage_class' ? '15' : 'X'),
      );
  });
  const sheet = target!;
  await openSheet(page, built.relatorioId, sheet.blockId);

  const desligador = field(page, 'desligador_integro').locator('select');
  await expect(stepper(page).getByRole('button', { name: 'Placa, 1 faltando' })).toBeVisible({ timeout: 30_000 });
  await expect(desligador).toHaveAttribute('data-missing-field', '');
  // "Concluir ficha" goes to the first missing field: DESLIGADOR ÍNTEGRO.
  await page.getByRole('button', { name: `Mais opções da ficha ${sheet.tag}` }).click();
  await page.getByRole('menuitem', { name: 'Concluir ficha' }).click();
  await expect(page.getByTestId('ficha-announcer')).toHaveText('Faltam obrigatórios — indo para o primeiro campo faltando');
  await expect(desligador).toBeFocused();
  expect((await outbox(page)).some((row) => row.path === `block/${sheet.blockId}/concluded_by`)).toBe(false);

  await desligador.selectOption('NÃO');
  await expect.poll(written(page, sheet.blockId, 'desligador_integro')).toBe('NÃO');
  await expect(stepper(page).getByRole('button', { name: 'Placa, 0 faltando' })).toBeVisible();
  await expect(desligador).not.toHaveAttribute('data-missing-field');
});

test('@p0 23.7-E2E-004 a v13 TP typed "13,8/√3" over "115/V3" and a v13 TC typed "200-5": both read their nominal values and VAL CALCULADO is computed', async ({ page }) => {
  test.setTimeout(180_000);
  const built = await setUp(page);
  const ratioRow = (p: Page) => p.locator('.ficha-mt[data-table-key="relacao_transformacao"] table tbody tr').first();

  // TP: AT and BT over √3, stored canonical ("N/√3", the spelling "V3" read as √3) and shown so.
  const tp = sheetOf(built.sheets, 'tp', 'Cubículo Enel');
  await openSheet(page, built.relatorioId, tp.blockId);
  await expect(field(page, 'tensao_nominal_at').locator('input')).toHaveAttribute('inputmode', 'text');
  await typeIn(page, 'tensao_nominal_at', '13,8/√3');
  await expect.poll(written(page, tp.blockId, 'tensao_nominal_at')).toEqual(measured('13.8/√3', 'kV'));
  await typeIn(page, 'tensao_nominal_bt', '115/V3');
  await expect.poll(written(page, tp.blockId, 'tensao_nominal_bt')).toEqual(measured('115/√3', 'V'));
  await expect(field(page, 'tensao_nominal_bt').locator('input')).toHaveValue('115/√3');
  await pick(page, 'grupo_ligacao_tp', '2 (FASE-TERRA, SISTEMA ATERRADO)');
  await expect.poll(written(page, tp.blockId, 'grupo_ligacao_tp')).toBe('2 (FASE-TERRA, SISTEMA ATERRADO)');
  const tpCalculated = evaluateSheetReadings(await blockRow(page, tp.blockId), getDefinition(SEED_VERSION, 'cabine_primaria', 'tp')).find((t) => t.testKey === 'relacao_transformacao')!.tables[0]!.rows[0]!.calculated!.text;
  expect(tpCalculated).toBe('120,00');
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  await expect(ratioRow(page).locator('td.cell-calc').first()).toContainText(tpCalculated);

  // TC: "200-5" read as 200 over 5.
  const tc = sheetOf(built.sheets, 'tc', 'Cubículo Enel');
  await openSheet(page, built.relatorioId, tc.blockId);
  await typeIn(page, 'relacao', '200-5');
  await expect.poll(written(page, tc.blockId, 'relacao')).toBe('200-5');
  const tcCalculated = evaluateSheetReadings(await blockRow(page, tc.blockId), getDefinition(SEED_VERSION, 'cabine_primaria', 'tc')).find((t) => t.testKey === 'relacao_transformacao')!.tables[0]!.rows[0]!.calculated!.text;
  expect(tcCalculated).toBe('40,00');
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  await expect(ratioRow(page).locator('td.cell-calc').first()).toContainText(tcCalculated);
});
