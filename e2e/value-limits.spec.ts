import {
  artLabel,
  artTrtRemarkText,
  cabineEnvCopy,
  exportPrecheck,
  HUMIDITY_RANGE_PCT,
  makeOp,
  newLocation,
  outOfRangeText,
  preIssue,
  RESISTANCE_POSITIVE_ONLY_TEXT,
  SITE_ALTITUDE_RANGE_M,
  temperatureRemarkText,
  type LocationRow,
  type RelatorioRow,
  type SuggestionRow,
} from '@app/domain';
import { newId } from '../apps/api/src/ids.ts';
import type { Page } from '@playwright/test';
import { copy } from '../apps/web/src/copy/pt-br.ts';
import { deviceSnapshot } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { applyAsServer, pushSuggestion } from './support/push-server-ops.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { SYNC_CYCLE_TIMEOUT, syncNowAndReturn } from './support/sync.ts';

/*
 * Story 27.2 (batch e27a, F2 to F6 and F11 of the 2026-11-21 pass; decision 3: the impossible is refused, the
 * improbable remarked, never blocking), driven as a person types at 1280 px. On the ficha: UMIDADE RELATIVA 150
 * is refused with the range, no op is written and the store keeps the 60 typed before; TEMPERATURA 999 is saved
 * with the amber remark; a contact resistance of 0 is refused as a negative one is. In the setup: an ART "abc"
 * is saved with its amber remark, an altitude of 99999 shows the range and writes nothing. The Gerar dialog
 * names the temperature and the ART rows and "Gerar relatório" stays enabled. In Cadastros › Clientes a CNPJ
 * with wrong check digits is refused with the new message and a valid one is saved. A device on contract 55
 * gets 426 and the update notice. Every expected word is the kernel's; the outbox and the store are asserted
 * with the screen (E12-A6). Nothing is issued.
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
}

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const valuesAt = async (page: Page, path: string) => (await outbox(page)).filter((row) => row.path === path).map((row) => row.value);
const storedRow = async <T>(page: Page, entity: string, id: string): Promise<T | null> =>
  ((await readStore<{ entity: string; id: string; row: T }>(page, database, 'entities')).find((record) => record.entity === entity && record.id === id)?.row ?? null);
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Gerar relatório' });
const env = (page: Page) => page.locator('section.ficha-amb');
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });

test('@p0 27.2-E2E-001 humidity 150 refused, 999 °C remarked, 0 µΩ refused, ART "abc" remarked, altitude 99999 refused with its range; the Gerar dialog names the two remarks and stays enabled', async ({ page }) => {
  test.setTimeout(240_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const scope = { relatorioId: built.relatorioId };
  const disjuntor = built.sheets.find((sheet) => sheet.blockType === 'disjuntor_mt')!;
  const created = (prefix: string) => built.drafts.filter((draft) => draft.kind === 'create' && draft.path.startsWith(prefix)).map((draft) => draft.value as Record<string, unknown>);
  const locations = new Map(created('location/').map((row) => [row.id as string, row]));
  let cabine = locations.get(created('block/').find((row) => row.id === disjuntor.blockId)!.location_id as string)!;
  while (cabine.parent_id !== null) cabine = locations.get(cabine.parent_id as string)!;
  const cabineId = cabine.id as string;
  // A stored parecer, so "Parecer não preenchido" (the one blocking row of a relatório nothing was judged in) is not
  // the reason a disabled "Gerar relatório" would show: the two remarks of this story must not block by themselves.
  await pushDrafts(page, database, [
    ...built.drafts,
    emCampoDraft(account, built.relatorioId),
    officeDraft(account, scope, 'relatorio/setup/responsible_user_id', account.userId),
    officeDraft(account, scope, 'relatorio/setup/parecer', { verdict: 'apto', text: null, text_status: null, text_basis: null }),
  ]);

  // The ficha's AMBIENTE DE ENSAIO: 60 % is saved, then 150 % is refused with the range and writes nothing.
  await page.goto(`/relatorio/${built.relatorioId}/ficha/${disjuntor.blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  const humidityPath = `location/${cabineId}/env/humidity_pct`;
  const humidity = env(page).locator('[data-field-key="humidity_pct"]');
  await humidity.locator('input.mf-value').fill('60');
  await humidity.locator('input.mf-value').press('Tab');
  await expect.poll(() => valuesAt(page, humidityPath)).toEqual([{ raw: '60', unit: '%', state: 'measured' }]);
  await humidity.locator('input.mf-value').fill('150');
  await humidity.locator('input.mf-value').press('Tab');
  await expect(humidity.locator('.helper[data-tone="red"]')).toHaveText(outOfRangeText(HUMIDITY_RANGE_PCT, '%'));
  await expect(humidity.locator('input.mf-value')).toHaveAttribute('aria-invalid', 'true');
  expect(await valuesAt(page, humidityPath)).toEqual([{ raw: '60', unit: '%', state: 'measured' }]);
  expect((await storedRow<Extract<LocationRow, { kind: 'cabine' }>>(page, 'location', cabineId))?.env.humidity_pct).toEqual({ raw: '60', unit: '%', state: 'measured' });

  // TEMPERATURA 999 °C: saved, with the amber remark under it.
  const temperaturePath = `location/${cabineId}/env/temperature_c`;
  const temperature = env(page).locator('[data-field-key="temperature_c"]');
  await temperature.locator('input.mf-value').fill('999');
  await temperature.locator('input.mf-value').press('Tab');
  await expect.poll(() => valuesAt(page, temperaturePath)).toEqual([{ raw: '999', unit: '°C', state: 'measured' }]);
  const stored = (await storedRow<Extract<LocationRow, { kind: 'cabine' }>>(page, 'location', cabineId))!;
  expect(stored.env.temperature_c).toEqual({ raw: '999', unit: '°C', state: 'measured' });
  await expect(temperature.locator('.helper[data-tone="amber"][data-remark]')).toHaveText(temperatureRemarkText(stored.env.temperature_c)!);
  await expect(temperature.locator('.helper[data-tone="amber"][data-remark]')).toHaveText('Temperatura incomum: confira o valor (o usual é de -10 a 60 °C)');

  // A contact resistance of 0 µΩ (an absolute criterion, < 250 µΩ): refused as a negative one is, nothing written.
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  const contact = page.locator('section[data-test-key="resistencia_contato"] .ficha-cell[data-cell="resistencia_contato:0:0"]').filter({ visible: true });
  const contactPath = `sheet/${disjuntor.blockId}/test/resistencia_contato/cell/0/0`;
  await contact.locator('input.mf-value').click();
  await page.keyboard.type('0');
  await page.keyboard.press('Enter');
  await expect(contact).toContainText(RESISTANCE_POSITIVE_ONLY_TEXT);
  await contact.locator('input.mf-value').fill('-5');
  await contact.locator('input.mf-value').press('Enter');
  await expect(contact).toContainText(RESISTANCE_POSITIVE_ONLY_TEXT);
  expect(await valuesAt(page, contactPath)).toEqual([]);
  await contact.locator('input.mf-value').fill('35');
  await contact.locator('input.mf-value').press('Enter');
  await expect.poll(() => valuesAt(page, contactPath)).toEqual([{ raw: '35', unit: 'µΩ', state: 'measured' }]);

  // Etapa 3: the ART "abc" is saved, with the amber remark; it never blocks.
  await page.goto(`/relatorio/${built.relatorioId}/setup?etapa=3`);
  const etapa3 = page.locator('section[aria-labelledby="setup-e3"]');
  const art = etapa3.locator('input.input.tabular');
  await expect(art).toBeVisible({ timeout: 30_000 });
  await art.fill('abc');
  await art.press('Tab');
  await expect.poll(() => valuesAt(page, 'relatorio/setup/art_trt_number')).toEqual(['abc']);
  await expect.poll(async () => (await storedRow<RelatorioRow>(page, 'relatorio', built.relatorioId))?.setup.art_trt_number).toBe('abc');
  const snapshot = await deviceSnapshot(page, database, built.relatorioId);
  const artRemark = artTrtRemarkText(artLabel(snapshot.responsible?.council ?? null), 'abc')!;
  await expect(etapa3.locator('.helper[data-tone="amber"][data-remark]')).toHaveText(artRemark);

  // Etapa 5: 99999 m shows the range and nothing is written.
  await page.goto(`/relatorio/${built.relatorioId}/setup?etapa=5`);
  const altitude = page.locator('[data-telemetry="setup.altitude"]');
  await expect(altitude).toBeVisible({ timeout: 30_000 });
  await altitude.fill('99999');
  await altitude.press('Tab');
  await expect(page.locator('.altitude-field .helper[data-tone="red"]')).toHaveText(outOfRangeText(SITE_ALTITUDE_RANGE_M, 'm'));
  await expect(page.locator('.altitude-field .helper[data-tone="red"]')).toHaveText('Fora da faixa: -500 a 9000 m');
  expect(await valuesAt(page, 'relatorio/setup/site_altitude_m')).toEqual([]);
  expect((await storedRow<RelatorioRow>(page, 'relatorio', built.relatorioId))?.setup.site_altitude_m).toBeNull();

  // The Gerar dialog: the temperature row naming the local and the ART row, by the kernel; "Gerar relatório" enabled.
  const rows = preIssue(await deviceSnapshot(page, database, built.relatorioId), undefined, { now: new Date() });
  const explicit = exportPrecheck(rows).explicit;
  const temperatureRows = explicit.filter((row) => row.kind === 'temperature_unusual');
  const artRows = explicit.filter((row) => row.kind === 'art_trt_not_numeric');
  expect(temperatureRows).toHaveLength(1);
  expect(artRows).toHaveLength(1);
  expect(temperatureRows[0]!.text).toContain(cabine.name as string);
  expect(artRows[0]!.text).toMatch(/: abc$/);
  const named = [temperatureRows[0]!.text, artRows[0]!.text];
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await expect(dialog(page).locator('ul.precheck')).toBeVisible();
  const listed = await dialog(page).locator('ul.precheck > li:not(.is-blocking) .pc-text').allTextContents();
  for (const text of named) expect(listed).toContain(text);
  await expect(dialog(page).locator('ul.precheck > li.is-blocking')).toHaveCount(0);
  await expect(dialog(page).getByRole('button', { name: 'Gerar relatório', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape');
});

test('@p0 27.2-E2E-002 Cadastros › Clientes: 11.111.111/1111-11 is refused with the new message and writes nothing; a CNPJ with valid check digits is saved', async ({ page }) => {
  test.setTimeout(120_000);
  await resetEmpresaB(account);
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  await page.getByRole('link', { name: /Cadastros/ }).click();
  await page.getByRole('tab', { name: 'Clientes' }).click();
  await page.getByRole('button', { name: /^(Novo|Cadastrar) cliente$/ }).click();
  const panel = page.locator('.registry-panel');
  await panel.getByLabel('Nome').fill('Cliente dos dígitos');
  const cnpj = panel.getByLabel('CNPJ');
  await cnpj.fill('11.111.111/1111-11');
  await panel.getByLabel('Nome').click();
  await expect(panel.getByRole('alert')).toHaveText(copy.registries.cnpjInvalid);
  await expect(panel.getByRole('alert')).toHaveText('CNPJ inválido: este número não existe. Confira os 14 dígitos.');
  const cnpjPuts = async () => (await outbox(page)).filter((row) => row.path.startsWith('registry/client/') && (row.path.endsWith('/cnpj') || (row.kind === 'create' && (row.value as { cnpj?: unknown }).cnpj !== null)));
  expect(await cnpjPuts()).toEqual([]);

  await cnpj.fill('11.222.333/0001-81');
  await panel.getByLabel('Nome').click();
  await expect(panel.getByRole('alert')).toHaveCount(0);
  await expect.poll(async () => (await cnpjPuts()).map((row) => (row.kind === 'create' ? (row.value as { cnpj: unknown }).cnpj : row.value))).toEqual(['11.222.333/0001-81']);
  await panel.getByRole('button', { name: 'Fechar edição' }).click();
  await expect(page.getByRole('button', { name: /Cliente dos dígitos/ })).toContainText('CNPJ 11.222.333/0001-81');
});

test('@p0 27.2-E2E-003 a device on contract 55 is answered 426 by the server and shows the update notice', async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, account.email);
  // The device's bundle is one contract behind: its pulls carry 55, which the server on 56 refuses.
  await page.route(
    (url) => url.pathname === '/api/sync/company',
    (route) => route.continue({ headers: { ...route.request().headers(), 'x-contract-version': '55' } }),
  );
  const outdated = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/sync/company' && response.status() === 426, { timeout: SYNC_CYCLE_TIMEOUT });
  await page.reload();
  const response = await outdated;
  expect(((await response.json()) as { code?: string }).code).toBe('contract_outdated');
  await expect(page.getByRole('heading', { level: 1, name: 'Atualização necessária' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Atualizar' })).toBeVisible();
});

test('@p0 27.2-E2E-004 e27a-review R2: a humidity of 150 % reaches no op on the other device paths: "Copiar do local anterior" skips it and says so, the thermo-hygrometer suggestion cannot be confirmed and says why, and a correction typed over it is refused alike', async ({ page }) => {
  test.setTimeout(240_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const scope = { relatorioId: built.relatorioId };
  const locations = built.drafts.filter((draft) => draft.kind === 'create' && draft.path.startsWith('location/')).map((draft) => draft.value as LocationRow);
  // The last local in order: the one a new local, placed after every sibling, copies from.
  const previous = locations.filter((row) => row.parent_id === null).sort((a, b) => (a.order_key < b.order_key ? -1 : 1)).at(-1)!;
  expect(previous.kind).toBe('cabine');
  // A second local after the first: its "Copiar do local anterior" reads the first one.
  const fresh = newLocation(locations, { id: newId(), relatorioId: built.relatorioId, parentId: null, kind: 'cabine', name: 'Local da cópia' });
  await pushDrafts(page, database, [...built.drafts, emCampoDraft(account, built.relatorioId), officeDraft(account, scope, `location/${fresh.id}`, fresh, 'create')]);
  // The first local's environment as an op stored before Story 27.2 left it: 25 °C and 150 %, written as the server holds it.
  const stored = [
    officeDraft(account, scope, `location/${previous.id}/env/temperature_c`, { raw: '25', unit: '°C', state: 'measured' }),
    officeDraft(account, scope, `location/${previous.id}/env/humidity_pct`, { raw: '150', unit: '%', state: 'measured' }),
  ].map((draft) => makeOp({ ...draft, device_id: 'office-e27a' }, { newId, now: new Date() }));
  await applyAsServer(account.companyId, stored);

  // The second local's own surface (no sheet): its AMBIENTE DE ENSAIO with the copy chip.
  await page.goto(`/relatorio/${built.relatorioId}/local/${fresh.id}/verificacoes`);
  await syncNowAndReturn(page);
  await expect.poll(async () => (await storedRow<Extract<LocationRow, { kind: 'cabine' }>>(page, 'location', previous.id))?.env.humidity_pct, { timeout: SYNC_CYCLE_TIMEOUT }).toEqual({ raw: '150', unit: '%', state: 'measured' });
  const freshHumidity = `location/${fresh.id}/env/humidity_pct`;
  const freshTemperature = `location/${fresh.id}/env/temperature_c`;
  const plan = cabineEnvCopy({ cabineId: previous.id, name: previous.name, temperature_c: { raw: '25', unit: '°C', state: 'measured' }, humidity_pct: { raw: '150', unit: '%', state: 'measured' } }, fresh.id, 'v16');
  expect(plan.skippedText).toBe(`Umidade relativa do ar não copiada: ${outOfRangeText(HUMIDITY_RANGE_PCT, '%')}`);
  await env(page).getByRole('button', { name: 'Copiar do local anterior' }).click();
  await expect(page.getByTestId('toast')).toContainText(copy.ficha.cabine.copiedFromSkipping(previous.name, plan.skippedText!));
  await expect.poll(() => valuesAt(page, freshTemperature)).toEqual([{ raw: '25', unit: '°C', state: 'measured' }]);
  expect(await valuesAt(page, freshHumidity)).toEqual([]);
  expect((await storedRow<Extract<LocationRow, { kind: 'cabine' }>>(page, 'location', fresh.id))?.env.humidity_pct).toBeNull();

  // A thermo-hygrometer reading of 150 % on the second local's empty humidity: Confirmar is refused with the range and writes nothing.
  const suggestionId = await pushSuggestion(account.companyId, built.relatorioId, { targetPath: freshHumidity, value: { raw: '150', unit: '%', state: 'measured' }, actorId: account.userId });
  await syncNowAndReturn(page);
  const fill = env(page).locator(`.ficha-suggestion[data-suggestion-id="${suggestionId}"]`);
  await expect(fill).toBeVisible({ timeout: SYNC_CYCLE_TIMEOUT });
  await fill.locator('.confirm-btn').click();
  await expect(fill.locator('.helper[data-tone="red"]')).toHaveText(outOfRangeText(HUMIDITY_RANGE_PCT, '%'));
  await expect(fill.locator('input.mf-value')).toHaveAttribute('aria-invalid', 'true');
  const statusPath = `suggestion/${suggestionId}/status`;
  expect(await valuesAt(page, statusPath)).toEqual([]);
  expect(await valuesAt(page, freshHumidity)).toEqual([]);
  expect((await storedRow<SuggestionRow>(page, 'suggestion', suggestionId))?.status).toBe('pending');

  // A correction typed over it, 120 %, is refused the same way; 65 % is written and the suggestion discarded.
  await fill.locator('input.mf-value').fill('120');
  await fill.locator('input.mf-value').press('Enter');
  await expect(fill.locator('.helper[data-tone="red"]')).toHaveText(outOfRangeText(HUMIDITY_RANGE_PCT, '%'));
  expect(await valuesAt(page, freshHumidity)).toEqual([]);
  expect(await valuesAt(page, statusPath)).toEqual([]);
  await fill.locator('input.mf-value').fill('65');
  await fill.locator('input.mf-value').press('Enter');
  await expect.poll(() => valuesAt(page, freshHumidity)).toEqual([{ raw: '65', unit: '%', state: 'measured' }]);
  expect(await valuesAt(page, statusPath)).toEqual(['discarded']);
  await expect.poll(async () => (await storedRow<Extract<LocationRow, { kind: 'cabine' }>>(page, 'location', fresh.id))?.env.humidity_pct).toEqual({ raw: '65', unit: '%', state: 'measured' });
});
