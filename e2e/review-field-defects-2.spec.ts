import { cellAddressesOf, getDefinition, instrumentHeaderOf, photoToken, SEED_VERSION, type InstrumentRow, type OpDraft } from '@app/domain';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Locator, Page, Route } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { plainJpeg } from './fixtures/photos/synthetic.ts';
import { EXPORT_RELATORIO_ID, resetEmpresaBWithFixture } from './support/export-fixture.ts';
import { deviceDatabaseName, expect, signIn, syncBadge, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { devicePhotos } from './support/photos.ts';
import { holdPhotoBytes } from './support/reading-ops.ts';
import { setParecer } from './support/relatorio-flow.ts';
import { instrumentDraft, newRelatorioDrafts, officeDraft, pushDrafts, type SeededSheet } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNow, syncNowAndReturn } from './support/sync.ts';

/*
 * Review fixes 2026-10-06, batch 2 (`spec-review-fixes-field-defects-2.md`): the field defects
 * of the MVP hands-on review, driven as the engineer drives them, each asserting what the
 * device committed (the outbox or the store) or what the issued document holds, and what the
 * screen shows. Every test resets Empresa B and pushes what its scenario needs from an
 * "office" device. Two tests issue revisions through the api's one queue and LibreOffice and
 * one loads the fixed-id Porto Seguro fixture, so this spec runs in the serial group.
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
  client_ts: string;
}

interface EntityRecord<T = Record<string, unknown>> {
  entity: string;
  id: string;
  row: T;
}

/** The job's own time: 94 sheets through two LibreOffice passes. */
const JOB_TIMEOUT = 240_000;
const TRT = '2620262602583';

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const entities = <T,>(page: Page) => readStore<EntityRecord<T>>(page, database, 'entities');
const toast = (page: Page) => page.getByTestId('toast');
const sumario = (page: Page) => page.getByRole('list', { name: 'Sumário do relatório' });
const footButton = (page: Page) => page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' });
const exportDialog = (page: Page) => page.getByRole('dialog', { name: 'Gerar relatório' });
const generateButton = (page: Page) => exportDialog(page).locator('.generate-row').getByRole('button', { name: /^(Gerar relatório|Gerando…)$/ });
const field = (page: Page, key: string): Locator => page.locator(`[data-field-key="${key}"]`);

type Scope = { relatorioId: string };

interface Built {
  relatorioId: string;
  projectId: string;
  sheets: SeededSheet[];
}

/** A client of the company, created from the office device. */
function clientDraft(clientId: string, name: string): OpDraft {
  return {
    kind: 'create',
    scope: 'company',
    company_id: account.companyId,
    project_id: null,
    relatorio_id: null,
    path: `registry/client/${clientId}`,
    value: { id: clientId, kind: 'client', name, cnpj: null, contact_name: null, contact_phone: null, sites: [], removed_at: null },
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: account.userId,
  };
}

/**
 * Resets Empresa B, signs in at `width`, pushes a relatório of the standard template (its
 * project under a client of the company, so the cover has one) plus `extra` drafts, and
 * opens its Sumário.
 */
async function setUp(page: Page, extra: (scope: Scope, built: Built) => OpDraft[] = () => [], width = 1280): Promise<Built> {
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const clientId = newId();
  const drafts = built.drafts.map((draft) =>
    draft.kind === 'create' && draft.path === `project/${built.projectId}` ? { ...draft, value: { ...(draft.value as Record<string, unknown>), client_id: clientId } as never } : draft,
  );
  const scope = { relatorioId: built.relatorioId };
  await pushDrafts(page, database, [clientDraft(clientId, 'Cliente da Revisão'), ...drafts, ...extra(scope, built)]);
  await openSumario(page, built.relatorioId);
  return built;
}

async function openSumario(page: Page, relatorioId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(sumario(page).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
}

async function openSheet(page: Page, relatorioId: string, blockId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
}

/** The Cubículo Enel seccionadoras of the relatório, in tree order. */
function enelSeccionadoras(built: Built): [SeededSheet, SeededSheet] {
  const enel = built.sheets.filter((sheet) => sheet.blockType === 'chave_seccionadora' && sheet.locationName === 'Cubículo Enel');
  expect(enel).toHaveLength(2);
  return enel as [SeededSheet, SeededSheet];
}

/** A seccionadora complete from the office: plate, checklist C, readings within criterion, the instruments, the pair. */
function completeSheet(scope: Scope, blockId: string, instrument: InstrumentRow): OpDraft[] {
  const definition = getDefinition(SEED_VERSION, 'cabine_primaria', 'chave_seccionadora');
  const plate = (kind: string, unit: string | undefined, options: readonly string[] | undefined, key: string): unknown =>
    kind === 'number' ? { raw: '630', unit: unit ?? null, state: 'measured' } : kind === 'date' ? '2020-01-01' : kind === 'select' ? options![0] : kind === 'voltage_class' ? '15' : `P-${key}`;
  return [
    ...definition.nameplate.filter((f) => f.key !== 'tag').map((f) => officeDraft(account, scope, `sheet/${blockId}/nameplate/${f.key}`, plate(f.kind, f.unit, f.options, f.key))),
    ...(definition.checklist ?? []).map((item) => officeDraft(account, scope, `sheet/${blockId}/checklist/${item.key}/result`, 'C')),
    ...definition.tests
      .flatMap((t) => cellAddressesOf(definition, t.key))
      .map((c) =>
        officeDraft(account, scope, `sheet/${blockId}/test/${c.testKey}/cell/${c.row}/${c.col}`, c.testKey === 'isolacao' ? { raw: '150', unit: 'GΩ', state: 'measured' } : { raw: '100', unit: 'µΩ', state: 'measured' }),
      ),
    ...definition.tests.map((t) => officeDraft(account, scope, `sheet/${blockId}/test/${t.key}/instrument`, instrumentHeaderOf(instrument, t.key))),
    officeDraft(account, scope, `sheet/${blockId}/conclusion/result`, 'aprovado'),
    officeDraft(account, scope, `sheet/${blockId}/conclusion/restriction`, 'sem_restricoes'),
  ];
}

// --- F-02 ----------------------------------------------------------------------------------

test('@p0 F-02 a typed altitude is written when the field is left and when "Concluir dados do relatório" is pressed, ahead of the status; the sheet shows it', async ({ page }) => {
  test.setTimeout(180_000);
  const instrument = instrumentDraft(account);
  const instrumentId = (instrument.value as { id: string }).id;
  const built = await setUp(page, (scope) => [
    instrument,
    officeDraft(account, scope, 'relatorio/setup/responsible_user_id', account.userId),
    officeDraft(account, scope, 'relatorio/setup/art_trt_number', TRT),
    officeDraft(account, scope, 'relatorio/setup/instrument_ids', [instrumentId]),
  ]);
  await syncNowAndReturn(page);
  const altitudeOps = async () => (await outbox(page)).filter((row) => row.path === 'relatorio/setup/site_altitude_m');

  // Typed and left for another field: written, and still there after a reload.
  await page.goto(`/relatorio/${built.relatorioId}/setup?etapa=5`);
  const altitude = page.getByLabel('Altitude do site', { exact: true });
  await expect(altitude).toBeVisible({ timeout: 30_000 });
  await altitude.fill('760');
  await page.getByLabel('Justificativa').click();
  await expect.poll(async () => (await altitudeOps()).map((row) => row.value)).toEqual([760]);
  await page.reload();
  await expect(page.getByLabel('Altitude do site', { exact: true })).toHaveValue('760', { timeout: 30_000 });

  // Typed, then "Concluir dados do relatório" at once: the altitude lands before the status.
  await page.getByLabel('Altitude do site', { exact: true }).fill('840');
  const complete = page.getByRole('button', { name: 'Concluir dados do relatório' });
  await expect(complete).not.toHaveAttribute('aria-disabled', 'true');
  await complete.click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${built.relatorioId}$`));
  await expect.poll(async () => (await altitudeOps()).map((row) => row.value)).toEqual([760, 840]);
  const rows = await outbox(page);
  const typed = rows.filter((row) => row.path === 'relatorio/setup/site_altitude_m').at(-1)!;
  const status = rows.find((row) => row.path === 'relatorio/status')!;
  expect(status.value).toBe('em_campo');
  expect(typed.client_ts <= status.client_ts).toBe(true);
  const relatorio = (await entities<{ setup: { site_altitude_m: number | null } }>(page)).find((record) => record.entity === 'relatorio' && record.id === built.relatorioId)!;
  expect(relatorio.row.setup.site_altitude_m).toBe(840);

  // The cabine's first sheet reads it, "Do setup do relatório".
  const [first] = enelSeccionadoras(built);
  await openSheet(page, built.relatorioId, first.blockId);
  const shown = page.getByRole('textbox', { name: 'Altitude', exact: true });
  await expect(shown.locator('.mf-value')).toHaveText('840');
  await expect(shown.locator('.mf-unit')).toHaveText('m');
  await expect(page.getByText('Do setup do relatório')).toBeVisible();
});

test('@p1 F-02 "Confirmar" writes the typed altitude once, with the confirmation', async ({ page }) => {
  test.setTimeout(150_000);
  const built = await setUp(page);
  await page.goto(`/relatorio/${built.relatorioId}/setup?etapa=5`);
  const altitude = page.getByLabel('Altitude do site', { exact: true });
  await expect(altitude).toBeVisible({ timeout: 30_000 });
  await altitude.fill('760');
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText('Altitude do site: < 1000 m — confirmada')).toBeVisible();
  await expect.poll(async () => (await outbox(page)).filter((row) => row.path === 'relatorio/setup/site_altitude_confirmed').map((row) => row.value)).toEqual([true]);
  expect((await outbox(page)).filter((row) => row.path === 'relatorio/setup/site_altitude_m').map((row) => row.value)).toEqual([760]);
});

// --- F-03 and F-04 -------------------------------------------------------------------------

test('@p0 F-03 F-04 issuing with 93 empty sheets asks first, naming the counts; "Voltar" issues nothing; the issued cover leaves the empty optional row out and keeps a required placeholder', async ({ page }) => {
  test.setTimeout(420_000);
  const generateRequests: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/api\/relatorios\/[0-9a-f-]{36}\/generate$/.test(new URL(request.url()).pathname)) generateRequests.push(request.url());
  });
  const instrument = instrumentDraft(account);
  const built = await setUp(page, (scope, b) => [instrument, ...completeSheet(scope, enelSeccionadoras(b)[1].blockId, instrument.value as InstrumentRow), officeDraft(account, scope, `block/${enelSeccionadoras(b)[1].blockId}/concluded_by`, { actor_id: account.userId, at: '2026-09-07T12:00:00.000Z' })]);
  await setParecer(page, built.relatorioId);

  // The Sumário names the empty sheets on row 9, and the foot says the issue asks first.
  const row9 = sumario(page).locator('li[data-row="section_9"]');
  await expect(row9.locator('.sum-status').first()).toContainText('93 fichas vazias', { timeout: 30_000 });
  // DF-6 (review fixes 2026-10-08): the worker seed's Empresa and this client have no CNPJ, and no logo is registered.
  await expect(page.locator('.sticky-action-bar .btn-reason').first()).toHaveText(
    /^Nada impede gerar\. Emitir pede confirmação: 93 fichas vazias, \d+ campos? em branco, os CNPJs do contratante e da contratada em branco e o logo da empresa não cadastrado\.$/,
  );

  // The dialog's own line, then the question with "Pré-visualizar" first.
  await footButton(page).click();
  await expect(exportDialog(page).locator('.precheck li', { hasText: '93 fichas vazias' })).toBeVisible();
  const statusBefore = (await outbox(page)).filter((row) => row.path === 'relatorio/status').length;
  await generateButton(page).click();
  const question = exportDialog(page).getByRole('group', {
    name: /^Emitir com 93 fichas vazias, \d+ campos? em branco, os CNPJs do contratante e da contratada em branco e o logo da empresa não cadastrado\?$/,
  });
  await expect(question).toBeVisible();
  await expect(question.getByRole('button')).toHaveText(['Pré-visualizar', 'Voltar', 'Emitir mesmo assim']);

  // "Voltar": nothing issued, no request, no status op; the focus back on "Gerar relatório".
  await question.getByRole('button', { name: 'Voltar' }).click();
  await expect(question).toHaveCount(0);
  await expect(generateButton(page)).toBeFocused();
  await page.waitForTimeout(1_000);
  expect(generateRequests).toEqual([]);
  expect((await outbox(page)).filter((row) => row.path === 'relatorio/status').length).toBe(statusBefore);

  // "Emitir mesmo assim" issues revision 1.
  await generateButton(page).click();
  await exportDialog(page).getByRole('button', { name: 'Emitir mesmo assim' }).click();
  await expect(toast(page)).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
  expect(generateRequests.length).toBeGreaterThanOrEqual(1);
  const revision = (await entities<{ id: string; number: number; relatorio_id: string }>(page)).find(
    (record) => record.entity === 'revision' && record.row.relatorio_id === built.relatorioId && record.row.number === 1,
  )!;
  expect(revision).toBeDefined();

  // F-04: the cover has no "Informações adicionais" row (the field is empty), never its
  // placeholder; section 1 keeps the required "[Empresa executora]" the question counted.
  const response = await page.request.get(`/api/revisions/${revision.row.id}/docx`);
  expect(response.status()).toBe(200);
  const structure = extractStructure(Buffer.from(await response.body()));
  const cover = structure.tables[0]!;
  expect(cover.map((row) => row[0])).not.toContain('Informações adicionais');
  expect(JSON.stringify(structure)).not.toContain('[Informações adicionais]');
  expect(structure.paragraphs.some((p) => p.includes('[Empresa executora]'))).toBe(true);
});

// --- F-05 ----------------------------------------------------------------------------------

test('@p0 F-05 a point citing a photo after "etc." prints "…, conforme Imagem 1. <ação>" as its section 8 bullet in the issued DOCX', async ({ page }) => {
  test.setTimeout(420_000);
  await resetEmpresaBWithFixture(account);
  await signIn(page, account.email);

  // One photo in the gallery, through "Adicionar fotos".
  await page.goto(`/relatorio/${EXPORT_RELATORIO_ID}/fotos`);
  await expect(page.getByRole('heading', { level: 2, name: /^Registro fotográfico \(\d+\)$/ })).toBeVisible({ timeout: 30_000 });
  const chooser = page.waitForEvent('filechooser');
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Adicionar fotos' }).click();
  await (await chooser).setFiles([await plainJpeg(page, 'placas.jpg')]);
  const which = page.getByRole('dialog', { name: /^De qual equipamento\?/ });
  await expect(which).toBeVisible();
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(1);
  await which.getByRole('button', { name: 'Cancelar' }).click();
  const [photo] = await devicePhotos(page, database);

  // A point whose text ends with the photo after "etc.", and its action, from the office.
  const pointId = newId();
  const action = 'Instalar placas de sinalização NR-10 nas portas das cabines';
  await pushDrafts(page, database, [
    officeDraft(
      account,
      { relatorioId: EXPORT_RELATORIO_ID },
      `point/${pointId}`,
      {
        id: pointId,
        relatorio_id: EXPORT_RELATORIO_ID,
        text: `Ausência de identificação da função dos transformadores etc. ${photoToken(photo!.id)}`,
        equipment_id: null,
        origin: 'manual',
        order_key: 'a0',
        removed_at: null,
        action,
        priority: null,
        deadline: null,
        owner: null,
      },
      'create',
    ),
  ]);

  await setParecer(page, EXPORT_RELATORIO_ID);
  await footButton(page).click();
  await expect(generateButton(page)).toBeEnabled({ timeout: 30_000 });
  await generateButton(page).click();
  // The "Geral" photo's vision caption may take the toast meanwhile: the dialog's own result is read.
  await expect(exportDialog(page).getByRole('heading', { level: 2, name: 'Revisão 1 pronta' })).toBeVisible({ timeout: JOB_TIMEOUT });
  const revision = (await entities<{ id: string; number: number; relatorio_id: string }>(page)).find(
    (record) => record.entity === 'revision' && record.row.relatorio_id === EXPORT_RELATORIO_ID && record.row.number === 1,
  )!;
  const response = await page.request.get(`/api/revisions/${revision.row.id}/docx`);
  const structure = extractStructure(Buffer.from(await response.body()));
  expect(structure.paragraphs).toContain(`Ausência de identificação da função dos transformadores etc., conforme Imagem 1. ${action}`);
  // The action-plan table keeps the point's own text.
  expect(structure.tables.some((table) => table.some((row) => row[1] === 'Ausência de identificação da função dos transformadores etc. Imagem 1'))).toBe(true);
});

// --- F-08 ----------------------------------------------------------------------------------

test('@p1 F-08 an unregistered company says where to fill it in under "Empresa executora"; the link opens Cadastros › Empresa, and the pointer is gone once the razão social is typed', async ({ page }) => {
  test.setTimeout(150_000);
  const built = await setUp(page);
  await page.goto(`/relatorio/${built.relatorioId}/setup?etapa=2`);
  const band = page.getByRole('heading', { level: 2, name: 'Etapa 2 — Objetivo e escopo' }).locator('xpath=ancestor::section[1]');
  const pointer = band.getByRole('button', { name: 'Cadastre a empresa em Cadastros › Empresa' });
  await expect(pointer).toBeVisible({ timeout: 30_000 });
  await pointer.click();
  await expect(page).toHaveURL(/\/cadastros$/);
  await expect(page.getByRole('tab', { name: 'Empresa' })).toHaveAttribute('aria-selected', 'true');
  await page.getByLabel('Razão social').fill('Engenharia da Revisão Ltda');
  await page.getByLabel('Razão social').blur();
  await expect
    .poll(async () => (await outbox(page)).some((row) => /^registry\/empresa\//.test(row.path) && JSON.stringify(row.value).includes('Engenharia da Revisão Ltda')))
    .toBe(true);
  // The App bar's "Voltar" returns to Etapa 2, which now shows the name and no pointer.
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${built.relatorioId}/setup\\?etapa=2$`));
  await expect(band.getByText('Engenharia da Revisão Ltda')).toBeVisible();
  await expect(band.getByRole('button', { name: 'Cadastre a empresa em Cadastros › Empresa' })).toHaveCount(0);
});

// --- F-09 ----------------------------------------------------------------------------------

test('@p0 F-09 a company seeded with the standard template holds 13,8 · 15 · 24,2 · 36,2 kV: the plate\'s "Tensão de placa" offers them without typing, and a pick stores the kV number', async ({ page }) => {
  test.setTimeout(150_000);
  const built = await setUp(page);
  await expect
    .poll(async () =>
      (await entities<{ kind?: string; name?: string; removed_at?: string | null }>(page))
        .filter((record) => record.entity === 'registry' && record.row.kind === 'voltage_class' && record.row.removed_at === null)
        .map((record) => record.row.name)
        .sort(),
    )
    .toEqual(['13,8', '15', '24,2', '36,2']);
  const [first] = enelSeccionadoras(built);
  await openSheet(page, built.relatorioId, first.blockId);
  // No manufacturer is seeded: its empty list says how to add one, under the field.
  await expect(field(page, 'fabricacao').locator('.helper')).toHaveText('Nenhum fabricante cadastrado ainda — digite o nome para criar');
  const tensao = field(page, 'tensao_de_placa');
  await expect(tensao.locator('.helper')).toHaveCount(0);
  // The list opens from the keyboard with nothing typed (ArrowDown in the Combobox).
  await tensao.getByRole('combobox').focus();
  await page.keyboard.press('ArrowDown');
  const options = page.getByRole('listbox').getByRole('option');
  await expect(options).toHaveText(['13,8 kV', '15 kV', '24,2 kV', '36,2 kV']);
  await expect(page.getByRole('option', { name: /^Criar/ })).toHaveCount(0);
  await page.getByRole('option', { name: '15 kV', exact: true }).click();
  await expect(tensao.getByRole('combobox')).toHaveValue('15 kV');
  await expect.poll(async () => (await outbox(page)).filter((row) => row.path === `sheet/${first.blockId}/nameplate/tensao_de_placa`).map((row) => row.value)).toEqual(['15']);
});

// --- F-12 ----------------------------------------------------------------------------------

test('@p0 F-12 a complete sheet\'s primary reads "Concluir e avançar": it concludes, opens the next sheet and says "Ficha concluída" there; the menu keeps "Concluir ficha"', async ({ page }) => {
  test.setTimeout(150_000);
  const instrument = instrumentDraft(account);
  const built = await setUp(page, (scope, b) => [instrument, ...completeSheet(scope, enelSeccionadoras(b)[1].blockId, instrument.value as InstrumentRow)]);
  await syncNowAndReturn(page);
  const [, second] = enelSeccionadoras(built);
  const next = built.sheets[built.sheets.findIndex((sheet) => sheet.blockId === second.blockId) + 1]!;
  await openSheet(page, built.relatorioId, second.blockId);
  await expect(page.getByTestId('ficha-progress')).toHaveText('Ficha completa', { timeout: 30_000 });
  const primary = page.locator('#ficha-primary');
  await expect(primary).toHaveText(/Concluir e avançar/);
  // The header Overflow keeps the item's own words.
  await page.getByRole('button', { name: /^Mais opções da ficha / }).click();
  await expect(page.getByRole('menuitem', { name: 'Concluir ficha' })).toBeVisible();
  await page.keyboard.press('Escape');

  await primary.click();
  await expect(page).toHaveURL(new RegExp(`/ficha/${next.blockId}$`));
  await expect(page.locator('.sheet-header .sheet-title')).toContainText(next.tag);
  await expect(toast(page)).toContainText('Ficha concluída');
  await expect.poll(async () => (await outbox(page)).filter((row) => row.path === `block/${second.blockId}/concluded_by`).map((row) => (row.value as { actor_id: string }).actor_id)).toEqual([account.userId]);
});

// --- F-13 ----------------------------------------------------------------------------------

const PLATE = readFileSync(resolve(import.meta.dirname, '../services/ocr/tests/fixtures/plate-transformador.jpg'));

test('@p1 F-13 online, a plate shot reads "Lendo…" and its toast speaks of no queue', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    const none = () => Promise.reject(new DOMException('Requested device not found', 'NotFoundError'));
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: none, configurable: true });
  });
  await holdPhotoBytes(page);
  const built = await setUp(page);
  const trafo = built.sheets.find((sheet) => sheet.blockType === 'transformador_forca')!;
  await openSheet(page, built.relatorioId, trafo.blockId);
  await expect(syncBadge(page)).toHaveAttribute('data-state', 'ok', { timeout: 60_000 });
  const section = page.locator('#ficha-nameplate');
  const chooser = page.waitForEvent('filechooser');
  await section.locator('.camera-group').getByRole('button', { name: 'Fotografar placa' }).click();
  await (await chooser).setFiles({ name: 'placa.jpg', mimeType: 'image/jpeg', buffer: PLATE });
  await expect(toast(page)).toHaveText('Foto salva — enviando', { timeout: 20_000 });
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 20_000 }).toBe(1);
  const [photo] = await devicePhotos(page, database);
  expect(photo).toMatchObject({ reading_kind: 'plate' });
  await expect(section.locator('.ficha-np-photo .photo-tile[data-photo-id]')).toBeVisible({ timeout: 20_000 });
  await expect(section.locator('.ficha-np-photo .reading-line')).toHaveText('Lendo…');
  await expect(section.locator('.ficha-np-photo .queued-banner')).toHaveCount(0);
  await expect(page.getByText(/fila de envio|quando houver sinal/)).toHaveCount(0);
});

// --- F-14 ----------------------------------------------------------------------------------

test('@p0 F-14 Sync status: while a cycle runs the headline and the button both say "Sincronizando…", idle both read synced; this device\'s own row says "Este aparelho" on every load', async ({ page }) => {
  test.setTimeout(150_000);
  await setUp(page);
  // Watches every load for a row drawn "Outro aparelho" beyond the office device's one.
  await page.addInitScript(() => {
    const probe = window as unknown as { otherRows: number };
    probe.otherRows = 0;
    new MutationObserver(() => {
      const others = [...document.querySelectorAll('[data-testid="sync-last-send-row"] .sr-secondary')].filter((el) => el.textContent === 'Outro aparelho').length;
      probe.otherRows = Math.max(probe.otherRows, others);
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  // One change of this device's own, sent: its own "Último envio" row.
  await page.goto('/cadastros');
  await page.getByRole('tab', { name: 'Fabricantes' }).click();
  await page.getByRole('button', { name: /^(Novo|Cadastrar) fabricante$/ }).click();
  await page.locator('.registry-panel').getByLabel('Nome').fill('Fabricante do aparelho');
  await page.locator('.registry-panel').getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(page.getByRole('button', { name: /Fabricante do aparelho/ })).toBeVisible();
  await syncNow(page);
  await expect(page).toHaveURL(/\/sync$/);
  const button = page.getByRole('button', { name: 'Sincronizar agora' });

  // A cycle held at its company pull, with nothing pending: one state on both.
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/sync/company**', async (route: Route) => {
    await held;
    await route.continue();
  });
  await button.click();
  const word = page.locator('.sync-headline .sh-state');
  await expect(button).toHaveAttribute('aria-disabled', 'true');
  await expect(button).toHaveAccessibleDescription('Sincronizando…');
  await expect(word).toHaveText('Sincronizando…');
  release();
  await expect(button).not.toHaveAttribute('aria-disabled', 'true', { timeout: 60_000 });
  await expect(word).toHaveText('Sincronizado');
  await page.unroute('**/api/sync/company**');

  // The own row, on three loads: "Este aparelho", never drawn as another device.
  const rows = page.getByTestId('sync-last-send-row');
  for (let load = 0; load < 3; load++) {
    if (load > 0) await page.reload();
    await expect(rows.filter({ hasText: account.name }).locator('.sr-secondary', { hasText: 'Este aparelho' })).toHaveCount(1, { timeout: 30_000 });
    const others = await rows.locator('.sr-secondary', { hasText: 'Outro aparelho' }).count();
    expect(await page.evaluate(() => (window as unknown as { otherRows: number }).otherRows)).toBeLessThanOrEqual(others);
  }
});

// --- F-20 ----------------------------------------------------------------------------------

test('@p1 F-20 Cadastros opens on Empresa while the company is not registered, and on Instrumentos once it is', async ({ page }) => {
  test.setTimeout(120_000);
  await resetEmpresaB(account, { standard: true });
  await signIn(page, account.email);
  await page.getByRole('link', { name: /Cadastros/ }).click();
  await expect(page.getByRole('tab', { name: 'Empresa' })).toHaveAttribute('aria-selected', 'true');
  await page.getByLabel('Razão social').fill('Engenharia Cadastrada Ltda');
  await page.getByLabel('Razão social').blur();
  await expect.poll(async () => (await outbox(page)).some((row) => /^registry\/empresa\//.test(row.path))).toBe(true);
  await page.goto('/');
  await page.getByRole('link', { name: /Cadastros/ }).click();
  await expect(page.getByRole('tab', { name: 'Instrumentos' })).toHaveAttribute('aria-selected', 'true');
});

// --- F-21 ----------------------------------------------------------------------------------

test('@p1 F-21 Account counts the photos kept on this device, and a second line the ones waiting to be sent', async ({ page, context }) => {
  test.setTimeout(150_000);
  const built = await setUp(page);
  await page.goto(`/relatorio/${built.relatorioId}/fotos`);
  await expect(page.getByRole('heading', { level: 2, name: /^Registro fotográfico \(\d+\)$/ })).toBeVisible({ timeout: 30_000 });
  await context.setOffline(true);
  const chooser = page.waitForEvent('filechooser');
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Adicionar fotos' }).click();
  await (await chooser).setFiles([await plainJpeg(page, 'offline.jpg')]);
  const which = page.getByRole('dialog', { name: /^De qual equipamento\?/ });
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(1);
  await which.getByRole('button', { name: 'Cancelar' }).click();
  expect((await outbox(page)).some((row) => row.kind === 'create' && row.path.startsWith('file/'))).toBe(true);

  await page.getByRole('link', { name: 'Conta' }).click();
  await expect(page.getByTestId('storage-value')).toContainText('· 1 relatório · 1 foto neste aparelho', { timeout: 30_000 });
  await expect(page.getByTestId('storage-awaiting')).toHaveText('1 foto aguardando envio');
  await context.setOffline(false);
});

// --- F-27 ----------------------------------------------------------------------------------

/** A registry instrument that fits one test (its default for it set), from the office. */
function fittingInstrument(code: string, fits: 'isolacao' | 'resistencia_contato' | 'relacao_transformacao'): OpDraft {
  const draft = instrumentDraft(account);
  const value = draft.value as Record<string, unknown>;
  return { ...draft, value: { ...value, code, name: `Instrumento ${code}`, [`test_${fits}`]: { raw: '5 kV', unit: null } } as never };
}

test('@p1 F-27 the isolação instrument picker lists the fitting and ticked one first, then the ticked one, then the rest; a pick stores it', async ({ page }) => {
  test.setTimeout(150_000);
  const ttr = fittingInstrument('1T', 'relacao_transformacao');
  const meg = fittingInstrument('2E', 'isolacao');
  const micro = fittingInstrument('3M', 'resistencia_contato');
  const id = (draft: OpDraft) => (draft.value as { id: string }).id;
  const built = await setUp(page, (scope) => [ttr, meg, micro, officeDraft(account, scope, 'relatorio/setup/instrument_ids', [id(ttr), id(meg)])]);
  await syncNowAndReturn(page);
  const [first] = enelSeccionadoras(built);
  await openSheet(page, built.relatorioId, first.blockId);
  const picker = page.locator('section[data-test-key="isolacao"] .instrument-picker');
  await picker.locator('button.input').click();
  const list = page.getByRole('radiogroup', { name: 'Instrumentos cadastrados' });
  await expect(list.locator('.ip-code')).toHaveText(['2E', '1T', '3M']);
  await list.getByRole('radio').first().click();
  await expect
    .poll(async () => (await outbox(page)).filter((row) => row.path === `sheet/${first.blockId}/test/isolacao/instrument`).map((row) => (row.value as { instrument_id: string }).instrument_id))
    .toEqual([id(meg)]);
});

// --- F-28 ----------------------------------------------------------------------------------

test('@p1 F-28 Home "Novo relatório" for an obra with a relatório: the second step, "Novo relatório — tipo e datas", opens at once on the Obra page, which still lists its relatório', async ({ page }) => {
  test.setTimeout(150_000);
  await setUp(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Novo relatório', exact: true }).click();
  const start = page.getByRole('dialog', { name: 'Novo relatório', exact: true });
  await start.getByRole('combobox', { name: 'Cliente' }).fill('Cliente da Revisão');
  await page.getByRole('option', { name: 'Cliente da Revisão', exact: true }).click();
  await start.getByRole('button', { name: /Abrir lista/ }).nth(1).click();
  await page.getByRole('option', { name: 'Obra da árvore', exact: true }).click();
  await start.getByRole('button', { name: 'Continuar' }).click();
  await expect(page).toHaveURL(/\/project\/[0-9a-f-]{36}$/);
  const second = page.getByRole('dialog', { name: 'Novo relatório — tipo e datas', exact: true });
  await expect(second).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Relatórios desta obra (1)', includeHidden: true })).toBeAttached();
  const before = (await outbox(page)).filter((row) => row.kind === 'create' && /^relatorio\/[0-9a-f-]{36}$/.test(row.path)).length;
  await second.getByRole('button', { name: 'Criar relatório' }).click();
  await expect(page).toHaveURL(/\/relatorio\/[0-9a-f-]{36}\/setup\?etapa=1$/, { timeout: 30_000 });
  await expect.poll(async () => (await outbox(page)).filter((row) => row.kind === 'create' && /^relatorio\/[0-9a-f-]{36}$/.test(row.path)).length).toBe(before + 1);
});
