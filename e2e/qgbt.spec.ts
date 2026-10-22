import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  getDefinition,
  paletteItems,
  screenLabel,
  SEED_VERSION,
  suggestTag,
  type BlockRow,
  type EquipmentRow,
  type LocationRow,
  type TemplateRow,
} from '@app/domain';
import type { Page } from '@playwright/test';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { downloadBytes, downloadFrom } from './support/download.ts';
import { addLocal } from './support/local.ts';
import { deviceDatabaseName, expect, horizontalOverflow, signIn, syncBadge, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { paletteTypes, typeLabels, typeRows } from './support/palette.ts';
import { devicePhotos } from './support/photos.ts';
import { confirmIssue, createProjectFromHome, createRelatorio, setParecer } from './support/relatorio-flow.ts';
import { officeDraft, pushDrafts, pushNewRelatorio } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNow, syncNowAndReturn } from './support/sync.ts';
import { expandLocation, section9Chevron } from './support/tree.ts';

/*
 * 14.9-E2E. The Quadro elétrico (QGBT/QD), the library type of seed v6 on the seeded nameplate,
 * checklist and single-table insulation grammars, driven as a person would.
 *
 * 14.9-E2E-001 (1280 px): the Template composer adds one from "Outros equipamentos" after the CTA
 * to a local and one to a coluna of a painel (the empty painel offers no placement); a relatório
 * is born from it with the kernel's QD TAGs; the plate is read through "Fotografar placa" (the
 * fake fixture fills the nine fields as suggestions) and confirmed, which carries Em campo; then,
 * offline, IP is picked from its list, the hints show under items 8 and 16, one item is NC with a
 * chip and the rest Conforme, and the four insulation rows hold one under 0,5 MΩ at 380 V; the
 * conclusion is suggested and confirmed; every value is in the outbox; after a reload and a sync
 * the DOCX prints the QGBT under "Outros equipamentos" with ACEITÁVEL MΩ 0,5, no hint text and the
 * NC conclusion. 14.9-E2E-002 (768 then 390 px): offline, the field palette lists the type after
 * the CTA and creates one; at 390 px its sheet and four-row table fit with no sideways scroll, and
 * the hint line wraps.
 *
 * 14.9-E2E-001 generates through the one queue and LibreOffice of the api, so the file is in the
 * serial group (`support/groups.ts`). Each test resets this worker's own Empresa B (E6-Q7).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

// No camera on this device: "Fotografar placa" opens the system picker, which gets the plate.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const none = () => Promise.reject(new DOMException('Requested device not found', 'NotFoundError'));
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: none, configurable: true });
  });
});

interface OutboxRow {
  kind: string;
  path: string;
  value: unknown;
  batch_id: string | null;
  relatorio_id: string | null;
}
interface EntityRecord<T> {
  entity: string;
  id: string;
  row: T;
}

const QD = 'quadro_eletrico';
const CTA = 'chave_transferencia_automatica';
const DEFINITION = getDefinition(SEED_VERSION, 'cabine_primaria', QD);
const QD_NAME = DEFINITION.label;
const NEW_TEMPLATE = 'Novo template';
const LOCAL = 'Quadros';
const OUTROS = 'Outros equipamentos';
const PLATE = resolve(import.meta.dirname, '..', 'apps/api/src/jobs/reading/fixtures/images/plate-quadro-eletrico.png');
const IP_CODES = DEFINITION.nameplate.find((field) => field.key === 'ip')!.options!;
const JOB_TIMEOUT = 150_000;
const ROWS = ['Fase A', 'Fase B', 'Fase C', 'Neutro'];

const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' });
const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const entities = <T,>(page: Page) => readStore<EntityRecord<T>>(page, database, 'entities');
const lastWritten = async (page: Page, path: string) => (await outbox(page)).filter((op) => op.path === path).at(-1)?.value;
const toast = (page: Page) => page.getByTestId('toast');

const palette = (page: Page) => page.getByRole('complementary', { name: 'Paleta de blocos' });
const localCard = (page: Page, name: string) =>
  page.getByRole('list', { name: 'Locais do template' }).locator(':scope > li.local-card').filter({ has: page.locator(':scope > .block-body .block-name', { hasText: new RegExp(`^${name}$`) }) });
const tree = (page: Page) => page.getByRole('list', { name: 'Locais do relatório' });
const eqRow = (page: Page, tag: string) => page.locator('li.s9-eq').filter({ has: page.locator('.block-tag', { hasText: new RegExp(`^${tag}$`) }) });
const headerPill = (page: Page) => page.locator('.sheet-meta .status-pill');
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const field = (page: Page, key: string) => page.locator(`#ficha-nameplate [data-field-key="${key}"]`);
const checklistRow = (page: Page, key: string) => page.locator(`#ficha-step-verificacoes li.checklist-row[data-item-key="${key}"]`);
const cellInput = (page: Page, row: string) => page.getByRole('textbox', { name: `${row}, 1 minuto`, exact: true });
const cellBox = (page: Page, row: number) => page.locator(`.ficha-cell[data-cell="isolacao:${row}:1"]`).filter({ visible: true });

async function openNewTemplate(page: Page): Promise<string> {
  await page.getByRole('link', { name: /Templates/ }).click();
  await expect(page).toHaveURL(/\/templates$/);
  await page.getByRole('button', { name: 'Novo template' }).click();
  await expect(page).toHaveURL(/\/templates\/[0-9a-f-]{36}$/);
  return new URL(page.url()).pathname.split('/')[2]!;
}

async function openSection9(page: Page): Promise<void> {
  const chevron = section9Chevron(page);
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expect(tree(page)).toBeVisible();
}

async function goToStep(page: Page, name: string, step: string): Promise<void> {
  await stepper(page).getByRole('button', { name: new RegExp(`^${name},`) }).click();
  await expect(page.locator(`#ficha-step-${step}`)).toBeFocused();
}

async function openSheet(page: Page, relatorioId: string, blockId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
}

/** Types a reading into the 1 MINUTO cell of `row` and leaves it with Tab: the blur commits it. */
async function typeReading(page: Page, row: string, text: string): Promise<void> {
  const input = cellInput(page, row);
  await input.click();
  await input.fill(text);
  await input.press('Tab');
}

// --- 14.9-E2E-001 ------------------------------------------------------------------------

test('@p0 14.9-E2E-001 at 1280: the composer adds a Quadro elétrico from "Outros equipamentos" on a local and on a coluna; the plate is read and confirmed with Em campo; offline the IP is picked, the hints show, an item is NC and a reading is out at 380 V; the DOCX prints it under "Outros equipamentos" with ACEITÁVEL MΩ 0,5, no hint and the NC conclusion', async ({
  page,
  context,
}) => {
  test.setTimeout(600_000);
  await resetEmpresaB(account);
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const templateId = await openNewTemplate(page);

  // --- the Template composer: one QGBT directly on the local, a painel, one QGBT in its coluna ---
  await addLocal(page, { funcao: 'Distribuição', name: LOCAL });
  await expect(palette(page).locator('.pal-target')).toHaveText(`Toque para adicionar em: ${LOCAL}, direto no local`);
  // The library types after the eight under their heading, the QGBT after the CTA (E14-A3: from the kernel).
  const types = paletteTypes(SEED_VERSION);
  expect(types.library.indexOf(QD)).toBeGreaterThan(types.library.indexOf(CTA));
  const steppers = palette(page).locator('.palette-item.is-stepper');
  await expect(steppers).toHaveCount(types.seeded.length + types.library.length);
  const qdStepper = steppers.nth(types.seeded.length + types.library.indexOf(QD));
  await expect(qdStepper.locator('.pi-text > span').first()).toHaveText(QD_NAME);
  await expect(qdStepper.locator('.pi-meta')).toHaveText('17 itens · até 1 ensaio');
  await palette(page).getByRole('group', { name: 'Quadros elétricos, 0' }).getByRole('button', { name: 'Mais um' }).click();
  const direct = localCard(page, LOCAL).locator(':scope > .block-expand > .loc-direct');
  await expect(direct.getByRole('group', { name: 'Quadros elétricos, 1' })).toBeVisible();
  // A painel with no coluna yet says it takes no equipment: nothing is placed on it.
  await page.getByRole('button', { name: 'Adicionar painel' }).click();
  await expect(page.getByRole('list', { name: `Painéis de ${LOCAL}`, exact: true }).getByRole('note')).toContainText('não recebe equipamento direto');
  await page.getByRole('button', { name: 'Adicionar coluna' }).click();
  await expect(palette(page).locator('.pal-target')).toHaveText('Toque para adicionar em: Coluna 1 · Painel 1');
  await palette(page).getByRole('group', { name: 'Quadros elétricos, 0' }).getByRole('button', { name: 'Mais um' }).click();
  await expect(page.locator('.column-row.is-open .col-body').getByRole('group', { name: 'Quadros elétricos, 1' })).toBeVisible();
  await expect(page.locator('.composer-meta')).toHaveText('2 quadros elétricos');
  const template = (await entities<TemplateRow>(page)).find((record) => record.entity === 'template' && record.id === templateId)!.row;
  expect(template.seed_version).toBe(SEED_VERSION);
  expect(template.blocks.filter((block) => block.block_type === QD).map((block) => block.quantity)).toEqual([1, 1]);
  await syncNow(page);

  // --- a relatório from it: the QGBTs born with the kernel's TAGs ---
  await page.goto('/');
  await expect(page.locator('.shortcut-sub', { hasText: '1 template' })).toBeVisible({ timeout: 30_000 });
  await createProjectFromHome(page);
  const relatorioId = await createRelatorio(page, { template: NEW_TEMPLATE });
  const scope = { relatorioId };
  const records = await entities<LocationRow | BlockRow | EquipmentRow>(page);
  const locations = records.filter((record) => record.entity === 'location').map((record) => record.row as LocationRow).filter((row) => row.relatorio_id === relatorioId);
  const localRow = locations.find((row) => row.kind === 'cabine')!;
  const colunaRow = locations.find((row) => row.kind === 'coluna')!;
  const tagOf = new Map(records.filter((record) => record.entity === 'equipment').map((record) => [record.id, (record.row as EquipmentRow).tag]));
  const sheets = records
    .filter((record) => record.entity === 'block')
    .map((record) => record.row as BlockRow)
    .filter((row) => row.relatorio_id === relatorioId && row.location_id !== null)
    .map((row) => ({ blockId: row.id, blockType: row.block_type, locationId: row.location_id, tag: tagOf.get(row.equipment_id ?? '') ?? '' }));
  const localTag = suggestTag(QD, { kind: 'cabine', name: LOCAL }, []);
  expect(localTag.startsWith('QD-')).toBe(true);
  expect(sheets.map((sheet) => [sheet.tag, sheet.blockType, sheet.locationId]).sort()).toEqual(
    [
      [localTag, QD, localRow.id],
      ['QD-C01', QD, colunaRow.id],
    ].sort(),
  );
  const blockId = sheets.find((sheet) => sheet.locationId === localRow.id)!.blockId;
  await openSection9(page);
  await expandLocation(page, LOCAL);
  await expect(eqRow(page, localTag).locator('.s9-eq-name')).toHaveText(QD_NAME);

  // The office groups the local by type and fills its own fields (no criterion here is about them).
  await syncNowAndReturn(page);
  await pushDrafts(page, database, [
    officeDraft(account, scope, `location/${localRow.id}/agrupar_por_tipo`, true),
    officeDraft(account, scope, `location/${localRow.id}/se/type`, 'BLINDADA'),
    officeDraft(account, scope, `location/${localRow.id}/se/primary_kv`, measured('13.8', 'kV')),
    officeDraft(account, scope, `location/${localRow.id}/se/secondary_kv`, measured('380', 'V')),
    officeDraft(account, scope, `location/${localRow.id}/se/installed_kva`, measured('1500', 'kVA')),
    officeDraft(account, scope, `location/${localRow.id}/env/temperature_c`, measured('25', '°C')),
    officeDraft(account, scope, `location/${localRow.id}/env/humidity_pct`, measured('65', '%')),
  ]);
  await syncNowAndReturn(page);
  await expect(headerPill(page)).toHaveText('Rascunho');

  // --- the sheet: the plate read through the tile by the real job under the fake providers ---
  await openSheet(page, relatorioId, blockId);
  await expect(page.locator('.sheet-header .sheet-title')).toContainText(QD_NAME);
  await expect(page.locator('.sheet-header .sheet-title .lib-pill')).toHaveText('Tipo da biblioteca');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#ficha-nameplate .camera-group').getByRole('button', { name: 'Fotografar placa' }).click();
  await (await chooser).setFiles({ name: 'placa.png', mimeType: 'image/png', buffer: readFileSync(PLATE) });
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(1);
  // The plate photo is the first field write on the Rascunho relatório: it carries Em campo in its own batch, and says so.
  await expect(toast(page)).toContainText('Relatório em campo', { timeout: 15_000 });
  {
    const photoId = (await devicePhotos(page, database))[0]!.id;
    const ops = await outbox(page);
    const create = ops.find((op) => op.kind === 'create' && op.path === `file/${photoId}`)!;
    const status = ops.filter((op) => op.path === 'relatorio/status' && op.relatorio_id === relatorioId);
    expect(status.map((op) => op.value)).toEqual(['em_campo']);
    expect(status[0]!.batch_id).not.toBeNull();
    expect(status[0]!.batch_id).toBe(create.batch_id);
  }
  // The nine plate fields arrive as suggestions; the SELV/PELV mark is never on a plate.
  await expect(page.locator('#ficha-nameplate .field.suggestion-field')).toHaveCount(9, { timeout: 60_000 });
  await expect(field(page, 'circuito_selv_pelv').locator('.field.suggestion-field')).toHaveCount(0);
  // "Criar Brivolta?" registers the maker with its field; "Confirmar todos" takes the other eight.
  await field(page, 'fabricante').getByRole('button', { name: 'Criar Brivolta?, sugerido' }).click();
  await expect.poll(async () => lastWritten(page, `sheet/${blockId}/nameplate/fabricante`)).toBe('Brivolta');
  await page.locator('#ficha-nameplate .suggestion-group-head').getByRole('button', { name: 'Confirmar todos (8)' }).click();
  await expect.poll(async () => lastWritten(page, `sheet/${blockId}/nameplate/tensao_nominal`)).toEqual(measured('380', 'V'));

  // --- offline from here on ---
  await context.setOffline(true);
  // IP is picked from the twelve codes, never typed.
  const ip = field(page, 'ip').locator('select');
  await expect(ip).toHaveCount(1);
  expect((await ip.locator('option').allTextContents()).slice(-IP_CODES.length)).toEqual(IP_CODES);
  await ip.selectOption('IP55');
  await expect.poll(async () => lastWritten(page, `sheet/${blockId}/nameplate/ip`)).toBe('IP55');
  await expect(field(page, 'tensao_nominal').locator('input')).toHaveValue('380');
  // The SELV/PELV mark is optional: the plate has nothing left to fill.
  await expect(stepper(page).getByRole('button', { name: 'Placa, 0 faltando' })).toBeVisible({ timeout: 15_000 });

  // The checklist: the two hints under their items; item 11 NC with a chip, then the rest Conforme.
  const items = DEFINITION.checklist!;
  await goToStep(page, 'Verificações', 'verificacoes');
  for (const item of items) {
    const hint = checklistRow(page, item.key).locator('.row-hint');
    if (item.hint === undefined) await expect(hint, item.key).toHaveCount(0);
    else await expect(hint, item.key).toHaveText(screenLabel(item.hint));
  }
  await expect(checklistRow(page, 'disjuntores_termomagneticos').locator('.row-hint')).toHaveText('Funcionamento mecânico (liga/desliga/trip)');
  const nc = items.findIndex((item) => item.key === 'barramentos');
  const ncItem = items[nc]!;
  await checklistRow(page, ncItem.key).getByRole('radiogroup', { name: `${nc + 1}. ${screenLabel(ncItem.label)}` }).getByRole('radio', { name: 'Não conforme' }).click();
  const phrase = ncItem.nc_phrases[0]!;
  await checklistRow(page, ncItem.key).getByRole('group', { name: `Observações sugeridas do item ${nc + 1}` }).getByRole('button', { name: phrase }).click();
  await expect(page.getByLabel(`Observação do item ${nc + 1}`, { exact: true })).toHaveValue(phrase);
  await page.locator('#ficha-step-verificacoes .bulk-action-bar').getByRole('button', { name: 'Marcar os restantes como Conforme' }).click();
  await expect(toast(page)).toContainText('marcados Conforme');
  await expect(stepper(page).getByRole('button', { name: 'Verificações, 0 faltando' })).toBeVisible({ timeout: 15_000 });

  // The insulation: four rows against MASSA judged by the 380 V band; FASE C under 0,5 MΩ.
  await goToStep(page, 'Ensaios', 'ensaios');
  await expect(page.locator('.ficha-mt').first().locator('.mt-criterion')).toHaveText('Aceitável >=0,5 MΩ');
  await page.locator('.ficha-mt').first().locator('details.mt-source summary').click();
  await expect(page.locator('.ficha-mt').first().locator('details.mt-source p')).toHaveText('NBR 5410');
  const readings = ['850', '1200', '0,4', '900'];
  for (const [i, row] of ROWS.entries()) await typeReading(page, row, readings[i]!);
  await expect(cellBox(page, 2).locator('.measurement-field')).toHaveAttribute('data-state', 'out-of-limit');
  await expect(cellBox(page, 2).locator('.mf-helper[role="status"]')).toContainText('Abaixo do aceitável (>=0,5 MΩ)');
  for (const row of [0, 1, 3]) await expect(cellBox(page, row).locator('.measurement-field')).not.toHaveAttribute('data-state', 'out-of-limit');
  await expect(stepper(page).getByRole('button', { name: 'Ensaios, 0 faltando' })).toBeVisible({ timeout: 15_000 });

  // The conclusion: suggested from the NC item and the out reading; its text names both.
  await goToStep(page, 'Conclusão', 'conclusao');
  const suggestion = page.getByRole('group', { name: 'Sugestão' });
  await expect(suggestion).toContainText('Aprovado · Com restrições?');
  await suggestion.getByRole('button', { name: 'Confirmar' }).click();
  const text = page.getByRole('textbox', { name: 'Texto da conclusão' });
  await expect(text).toContainText(`quadro elétrico ${localTag}`);
  await expect(text).toContainText('0,4 MΩ em Fase C–Massa');
  await expect(text).toContainText(`(item ${nc + 1}, NC)`);
  await page.locator('.suggestion-field.is-generated').getByRole('button', { name: 'Confirmar' }).click();
  await expect.poll(async () => lastWritten(page, `sheet/${blockId}/conclusion/text_status`)).toBe('confirmed');

  // Every value is in the outbox, as the kernel stores it.
  await expect
    .poll(async () => ({
      ip: await lastWritten(page, `sheet/${blockId}/nameplate/ip`),
      nc: await lastWritten(page, `sheet/${blockId}/checklist/${ncItem.key}/result`),
      observation: await lastWritten(page, `sheet/${blockId}/checklist/${ncItem.key}/observation`),
      readings: await Promise.all(ROWS.map((_, row) => lastWritten(page, `sheet/${blockId}/test/isolacao/cell/${row}/1`))),
      restriction: await lastWritten(page, `sheet/${blockId}/conclusion/restriction`),
    }))
    .toEqual({
      ip: 'IP55',
      nc: 'NC',
      observation: phrase,
      readings: [measured('850', 'MΩ'), measured('1200', 'MΩ'), measured('0.4', 'MΩ'), measured('900', 'MΩ')],
      restriction: 'com_restricoes',
    });

  // --- back online: reload, sync, generate, read the DOCX ---
  await context.setOffline(false);
  await page.reload();
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await syncNowAndReturn(page);
  await expect(syncBadge(page)).toHaveAttribute('data-pending', '0', { timeout: 60_000 });
  await setParecer(page, relatorioId);
  const modal = page.getByRole('dialog', { name: 'Gerar relatório' });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await expect(modal).toBeVisible();
  const generate = modal.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' });
  await expect(generate).toBeEnabled({ timeout: 30_000 });
  await generate.click();
  // The coluna's QGBT was left empty.
  await confirmIssue(modal);
  await expect(toast(page)).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
  const download = await downloadFrom(page, () => modal.getByRole('button', { name: 'DOCX — abrir no Word' }).click());
  const structure = extractStructure(await downloadBytes(download));

  const level1 = structure.headings.filter((h) => h.level === 1).map((h) => h.text);
  const tests = level1.find((heading) => /^\d+ RELATÓRIOS DOS ENSAIOS$/.test(heading))!;
  const number = tests.split(' ')[0]!;
  const level2 = structure.headings.filter((h) => h.level === 2 && h.text.startsWith(`${number}.`)).map((h) => h.text);
  expect(level2[0]).toMatch(new RegExp(`^${number}\\.1 ${OUTROS}`));
  const sheetTitle = `QGBT/QD's ${localTag}`;
  expect(structure.paragraphs).toContain(sheetTitle);
  expect(structure.paragraphs).toContain("QGBT/QD's QD-C01");
  const titled = (title: string) => structure.tables.filter((table) => table[0]?.[0] === title);
  const plate = titled('DADOS DO EQUIPAMENTO').find((table) => table[1]?.[0] === 'IDENTIFICAÇÃO' && table[1]?.[1] === 'QD-01')!;
  expect(plate[3]).toEqual(['CORRENTE DE CURTO', '50 kA', 'TENSÃO NOMINAL', '380 V', 'IP', 'IP55']);
  const checklist = titled('VERIFICAÇÕES GERAIS').find((table) => table.some((row) => row[2] === 'X' && row[4] === phrase))!;
  expect(checklist).toHaveLength(2 + 17);
  expect(checklist[2 + nc]).toEqual([`${nc + 1}. ${ncItem.label}`, '', 'X', '', phrase]);
  expect(JSON.stringify(structure)).not.toContain('FUNCIONAMENTO MECÂNICO');
  expect(JSON.stringify(structure)).not.toContain('CANALETA, CHICOTE');
  const header = titled('ENSAIO DE ISOLAÇÃO').find((table) => table[1]?.at(-1) === 'ACEITÁVEL MΩ' && table[2]?.at(-1) === '0,5');
  expect(header, JSON.stringify(titled('ENSAIO DE ISOLAÇÃO'))).toBeDefined();
  const conclusion = titled('CONCLUSÃO').find((table) => (table[2]?.[0] ?? '').includes(localTag))!;
  expect(conclusion[1]).toEqual(['APROVADO', 'X', 'REPROVADO', '', 'SEM RESTRIÇÕES', '', 'COM RESTRIÇÕES (VER OBSERVAÇÕES)', 'X']);
  expect(conclusion[2]![0]).toContain(`(item ${nc + 1}, NC)`);
  expect(conclusion[2]![0]).toContain('0,4 MΩ em Fase C–Massa (critério: >=0,5 MΩ, NBR 5410)');
});

// --- 14.9-E2E-002 ------------------------------------------------------------------------

test('@p0 14.9-E2E-002 at 768 then 390: offline, the field palette lists the Quadro elétrico after the CTA with its TAG and creates it; at 390 its sheet and four-row table fit with no sideways scroll and the hint line wraps', async ({ page, context }) => {
  test.setTimeout(240_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  await signIn(page, account.email);
  const { relatorioId } = await pushNewRelatorio(page, account, database);
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await openSection9(page);
  await expandLocation(page, 'Geradores');

  await context.setOffline(true);
  await page.getByRole('button', { name: 'Adicionar equipamento no local Geradores', exact: true }).click();
  const fieldPalette = page.getByRole('dialog', { name: 'Adicionar bloco' });
  const rows = fieldPalette.locator('.pf-field');
  await expect(rows.locator('.pi-text > span:first-child')).toHaveText(typeLabels(SEED_VERSION));
  const item = paletteItems(SEED_VERSION, { kind: 'cabine', name: 'Geradores' }, []).find((entry) => entry.type === QD)!;
  const qdRow = typeRows(fieldPalette, [QD]);
  const meta = (await qdRow.locator('.pi-meta').innerText()).trim();
  expect(meta).toMatch(new RegExp(`^${item.summary} · ${item.tag}(-\\d+)?$`));
  const tag = meta.slice(`${item.summary} · `.length);
  await qdRow.click();
  await expect(fieldPalette).toBeHidden();
  await expect(eqRow(page, tag).locator('.s9-eq-name')).toHaveText(QD_NAME);
  const blockCreate = (await outbox(page)).find((op) => op.kind === 'create' && op.path.startsWith('block/') && (op.value as { block_type?: string }).block_type === QD)!;
  expect(blockCreate.value).toMatchObject({ block_type: QD, seed_version: SEED_VERSION, relatorio_id: relatorioId });
  const blockId = (blockCreate.value as { id: string }).id;

  await eqRow(page, tag).locator('.s9-eq-open').click();
  await expect(page).toHaveURL(new RegExp(`/ficha/${blockId}$`));
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.sheet-header .sheet-title')).toContainText(QD_NAME);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await goToStep(page, 'Verificações', 'verificacoes');
  const hint = checklistRow(page, 'organizacao_interna').locator('.row-hint');
  await expect(hint).toHaveText('Canaleta, chicote, cabos...');
  // The hint sits on its own line inside the row's label, never wider than it.
  const [hintBox, labelBox] = await Promise.all([hint.boundingBox(), checklistRow(page, 'organizacao_interna').locator('.row-label').boundingBox()]);
  expect(hintBox!.x + hintBox!.width).toBeLessThanOrEqual(labelBox!.x + labelBox!.width + 1);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await goToStep(page, 'Ensaios', 'ensaios');
  for (const row of ROWS) await expect(cellInput(page, row)).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  // A reading typed at 390 lands in the outbox.
  await typeReading(page, 'Neutro', '900');
  await expect.poll(async () => lastWritten(page, `sheet/${blockId}/test/isolacao/cell/3/1`)).toEqual(measured('900', 'MΩ'));
});
