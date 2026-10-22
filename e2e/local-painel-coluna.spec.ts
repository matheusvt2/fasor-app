import {
  cellAddressesOf,
  defaultBlockConfig,
  getDefinition,
  instantiateTemplate,
  newEquipmentBlock,
  newPointRow,
  SEED_VERSION,
  SITE_ITEM_KEYS,
  standardTemplate,
  type BlockRow,
  type EquipmentRow,
  type FieldDef,
  type LocationRow,
  type OpDraft,
  type TemplateRow,
} from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { extractStructure, paragraphText, readZipEntries } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { newId } from '../apps/api/src/ids.ts';
import { downloadBytes, downloadFrom } from './support/download.ts';
import { addLocal } from './support/local.ts';
import { deviceDatabaseName, expect, horizontalOverflow, signIn, syncBadge, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { confirmIssue, createProjectFromHome, createRelatorio, setParecer } from './support/relatorio-flow.ts';
import { pushRevision } from './support/push-server-ops.ts';
import { emCampoDraft, officeDraft, pushDrafts, pushNewRelatorio } from './support/relatorio-seed.ts';
import { resetEmpresaB, withSeedDb } from './support/reset-empresa-b.ts';
import { SYNC_CYCLE_TIMEOUT, syncNowAndReturn, waitForCompanyPull } from './support/sync.ts';
import { expandLocation, section9Chevron } from './support/tree.ts';

/*
 * 14.2-E2E. Local › Painel › Coluna, driven as a person would: the Template composer builds
 * the three levels, a relatório is born from that template, its tree draws them, and the
 * generated DOCX prints the painel as a band over its sheets.
 *
 * 14.2-E2E-001 generates through the one queue and LibreOffice of the api, so the file is in
 * the serial group. What no criterion of the story exercises (the plate, the checklist, the
 * readings and the conclusion pair of the two sheets it concludes, and the local's own
 * fields) is seeded by office ops, as 5.1-E2E-003 does; the conclude itself is the tap.
 * Each test resets this worker's own Empresa B (E6-Q7).
 *
 * 14.2-E2E-004 (second pass, 2026-10-13) removes and restores locations in the relatório tree
 * and ends on the rows themselves: the device's `entities` store against the server's.
 *
 * 14.10-E2E-006 (Story 14.10 part 8, 2026-10-15) turns "Agrupar por tipo" on for a local whose
 * painel holds a seccionadora in each of two colunas, generates, and reads the type-group
 * titles of section 9 and the ÍNDICE: one group per coluna, naming the coluna, the painel and
 * the local. It generates too, in the same serial group.
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
  batch_id: string | null;
}
interface EntityRecord<T> {
  entity: string;
  id: string;
  row: T;
}

const NEW_TEMPLATE = 'Novo template';
const LOCAL = 'Cabine de transformação';
const PAINEL_EMPTY = 'Este painel ainda não tem colunas. Um painel só agrupa colunas e não recebe equipamento direto: adicione uma coluna e coloque os equipamentos nela.';
/** The painel band of section 9 (`apps/api/src/jobs/generate/sections/section-9.ts`): bold white on dark grey. */
const BAND_FILL = '404040';
const BAND_COLOR = 'FFFFFF';
/** The job's own time: flush, queue pick-up, two LibreOffice passes. */
const JOB_TIMEOUT = 150_000;

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const entities = <T,>(page: Page) => readStore<EntityRecord<T>>(page, database, 'entities');
const toast = (page: Page) => page.locator('.toast');

// --- the Template composer ---------------------------------------------------------------

const palette = (page: Page) => page.getByRole('complementary', { name: 'Paleta de blocos' });
const composerAnnouncer = (page: Page) => page.getByTestId('composer-announcer');
const skeletonHeading = (page: Page) => page.locator('.composer-main h2').first();
const localCards = (page: Page) => page.getByRole('list', { name: 'Locais do template' }).locator(':scope > li.local-card');
const localCard = (page: Page, name: string) => localCards(page).filter({ has: page.locator(':scope > .block-body .block-name', { hasText: new RegExp(`^${name}$`) }) });
const painelCards = (page: Page, local: string) => page.getByRole('list', { name: `Painéis de ${local}`, exact: true }).locator(':scope > li.painel-card');
const painelCard = (page: Page, local: string, name: string) => painelCards(page, local).filter({ has: page.locator(':scope > .block-body .block-name', { hasText: new RegExp(`^${name}$`) }) });
const colunaNames = (page: Page, parent: string) => page.getByRole('list', { name: `Colunas de ${parent}`, exact: true }).locator('.col-name');
const menuOf = (page: Page, name: string) => page.getByRole('button', { name: `Mais opções de ${name}`, exact: true });
/**
 * The name a painel's controls read (coordinator review 2026-10-13): with its local, since every local's first painel is
 * "Painel 1". The composer words it "⟨painel⟩ em ⟨local⟩" (mock 42), the relatório tree "⟨painel⟩ de ⟨local⟩" (mock 40).
 */
const painelInComposer = (name: string, localName: string) => `${name} em ${localName}`;
const painelInTree = (name: string, localName: string) => `${name} de ${localName}`;
/** The name a coluna's controls read in the relatório tree (second pass, 2026-10-13): with its painel and its local, since every painel's first coluna is "Coluna 1". */
const colunaInTree = (name: string, painelName: string, localName: string) => `${name} de ${painelInTree(painelName, localName)}`;

async function openNewTemplate(page: Page): Promise<string> {
  await page.getByRole('link', { name: /Templates/ }).click();
  await expect(page).toHaveURL(/\/templates$/);
  await page.getByRole('button', { name: 'Novo template' }).click();
  await expect(page).toHaveURL(/\/templates\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('textbox', { name: 'Nome do template' })).toHaveValue(NEW_TEMPLATE);
  return new URL(page.url()).pathname.split('/')[2]!;
}

// --- the relatório tree ------------------------------------------------------------------

const tree = (page: Page) => page.getByRole('list', { name: 'Locais do relatório' });
const treeAnnouncer = (page: Page) => page.getByTestId('sumario-announcer');
const local = (page: Page, name: string) => tree(page).locator(':scope > li.s9-local').filter({ has: page.locator(':scope > .s9-loc-row .s9-loc-name', { hasText: name }) });
const painel = (page: Page, name: string) => page.locator('li.s9-painel').filter({ has: page.locator(':scope > .s9-pnl-row .s9-pnl-name', { hasText: new RegExp(`^${name}`) }) });
const painelNames = (page: Page, localName: string) => local(page, localName).locator(':scope > .s9-pnls > li.s9-painel > .s9-pnl-row .s9-pnl-name');
const coluna = (page: Page, name: string) => page.locator('li.s9-coluna').filter({ has: page.locator(':scope > .s9-col .s9-col-name', { hasText: new RegExp(`^${name}$`) }) });
const eqRow = (page: Page, tag: string) => page.locator('li.s9-eq').filter({ has: page.locator('.block-tag', { hasText: new RegExp(`^${tag}$`) }) });

async function openSection9(page: Page): Promise<void> {
  const chevron = section9Chevron(page);
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expect(tree(page)).toBeVisible();
}

/**
 * A mouse drag of `row` from its handle until its centre passes the centre of `above`, its
 * sibling: the rule the reorder applies on release (`use-reorder.ts`), whatever the two rows'
 * heights are.
 */
async function dragAbove(page: Page, handle: Locator, row: Locator, above: Locator): Promise<void> {
  const grip = (await handle.boundingBox())!;
  const own = (await row.boundingBox())!;
  const target = (await above.boundingBox())!;
  const delta = target.y + target.height / 2 - (own.y + own.height / 2) - 12;
  const x = grip.x + grip.width / 2;
  const y = grip.y + grip.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + delta, { steps: 8 });
  await page.mouse.up();
}

// --- office seeds ------------------------------------------------------------------------

type Scope = { relatorioId: string };
const n = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' as const });

/** A filled value of the field's kind, as the office would have typed it. */
function plateValue(f: FieldDef): unknown {
  if (f.kind === 'number') return { raw: '630', unit: f.unit ?? null, state: 'measured' };
  if (f.kind === 'date') return '2020-01-01';
  if (f.kind === 'select') return f.options![0];
  if (f.kind === 'voltage_class') return '15';
  return `P-${f.key}`;
}

/** A sheet of `blockType` complete from the office: plate (never the TAG), checklist C, readings within criterion, the pair. */
function completeSheet(scope: Scope, blockId: string, blockType: string): OpDraft[] {
  const definition = getDefinition(SEED_VERSION, 'cabine_primaria', blockType);
  const reading = (testKey: string) => (testKey === 'isolacao' ? n('150', 'GΩ') : blockType === 'chave_seccionadora' ? n('100', 'µΩ') : n('100', null));
  return [
    ...definition.nameplate.filter((f) => f.key !== 'tag').map((f) => officeDraft(account, scope, `sheet/${blockId}/nameplate/${f.key}`, plateValue(f))),
    ...(definition.checklist ?? []).map((item) => officeDraft(account, scope, `sheet/${blockId}/checklist/${item.key}/result`, 'C')),
    ...definition.tests.flatMap((t) => cellAddressesOf(definition, t.key)).map((c) => officeDraft(account, scope, `sheet/${blockId}/test/${c.testKey}/cell/${c.row}/${c.col}`, reading(c.testKey))),
    officeDraft(account, scope, `sheet/${blockId}/conclusion/result`, 'aprovado'),
    officeDraft(account, scope, `sheet/${blockId}/conclusion/restriction`, 'sem_restricoes'),
  ];
}

/** The local's own fields (CARACTERÍSTICAS DA SE, AMBIENTE DE ENSAIO), which its first sheet carries. */
function localFields(scope: Scope, localId: string): OpDraft[] {
  return [
    officeDraft(account, scope, `location/${localId}/se/type`, 'BLINDADA'),
    officeDraft(account, scope, `location/${localId}/se/primary_kv`, n('13.8', 'kV')),
    officeDraft(account, scope, `location/${localId}/se/secondary_kv`, n('380', 'V')),
    officeDraft(account, scope, `location/${localId}/se/installed_kva`, n('1500', 'kVA')),
    officeDraft(account, scope, `location/${localId}/env/temperature_c`, n('25', '°C')),
    officeDraft(account, scope, `location/${localId}/env/humidity_pct`, n('65', '%')),
  ];
}

/** Opens a sheet by its address, concludes it with the primary and waits for its `concluded_by` op. */
async function concludeSheet(page: Page, relatorioId: string, blockId: string, locationText: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.sheet-header .sheet-meta').first()).toHaveText(locationText);
  await expect(page.getByTestId('ficha-progress')).toHaveText('Ficha completa', { timeout: 30_000 });
  const primary = page.locator('.sticky-action-bar .btn-primary');
  await expect(primary).toHaveText(/Concluir e avançar/);
  await primary.click();
  await expect(page.getByTestId('toast')).toContainText('Ficha concluída');
  await expect.poll(async () => (await outbox(page)).some((row) => row.path === `block/${blockId}/concluded_by`)).toBe(true);
}

// --- 14.2-E2E-001 ------------------------------------------------------------------------

test('@p0 14.2-E2E-001 at 1280: a template of one local (Transformação) with two transformers directly and a painel of three colunas makes a relatório of three location kinds with the kernel TAGs; two sheets concluded, kept on reload; the DOCX prints the direct sheets, then the painel band over its own', async ({
  page,
}) => {
  test.setTimeout(480_000);
  await resetEmpresaB(account);
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const templateId = await openNewTemplate(page);

  // The local, through the Função dialog: the name comes from the Função.
  await addLocal(page, { funcao: 'Transformação' });
  await expect(composerAnnouncer(page)).toHaveText(`${LOCAL} adicionada`);
  await expect(localCards(page).locator(':scope > .block-body .block-name')).toHaveText([LOCAL]);
  await expect(localCard(page, LOCAL).locator(':scope > .block-body .block-sub')).toHaveText('Função: transformação · Agrupar por tipo: desativado');

  // Two transformers directly on the local: the local just added is the palette's target.
  await expect(palette(page).locator('.pal-target')).toHaveText(`Toque para adicionar em: ${LOCAL}, direto no local`);
  await palette(page).getByRole('group', { name: 'Transformadores, 0' }).getByRole('button', { name: 'Mais um' }).click();
  await palette(page).getByRole('group', { name: 'Transformadores, 1' }).getByRole('button', { name: 'Mais um' }).click();
  const direct = localCard(page, LOCAL).locator(':scope > .block-expand > .loc-direct');
  await expect(direct.getByText('Equipamentos no local')).toBeVisible();
  await expect(direct.getByRole('group', { name: 'Transformadores, 2' })).toBeVisible();

  // One painel with three colunas, a seccionadora in each: the new coluna is the palette's target.
  await page.getByRole('button', { name: 'Adicionar painel' }).click();
  await expect(composerAnnouncer(page)).toHaveText('Painel 1 adicionado');
  await expect(painelCard(page, LOCAL, 'Painel 1').getByRole('note')).toHaveText(PAINEL_EMPTY);
  for (const index of [1, 2, 3]) {
    await page.getByRole('button', { name: 'Adicionar coluna' }).click();
    await expect(colunaNames(page, `Painel 1 em ${LOCAL}`)).toHaveCount(index);
    await expect(palette(page).locator('.pal-target')).toHaveText(`Toque para adicionar em: Coluna ${index} · Painel 1`);
    await palette(page).getByRole('group', { name: 'Seccionadoras, 0' }).getByRole('button', { name: 'Mais um' }).click();
    await expect(page.locator('.column-row.is-open .col-body').getByRole('group', { name: 'Seccionadoras, 1' })).toBeVisible();
  }
  await expect(painelCard(page, LOCAL, 'Painel 1').getByRole('note')).toHaveCount(0);
  await expect(skeletonHeading(page)).toHaveText('Esqueleto de locais · 1 local · 1 painel · 3 colunas · 5 blocos');
  await expect(page.locator('.composer-meta')).toHaveText('3 seccionadoras · 2 trafos');

  // The template on the device: the three node kinds, the Função on the local.
  const template = (await entities<TemplateRow>(page)).find((record) => record.entity === 'template' && record.id === templateId)!.row;
  expect(template.skeleton.map((node) => node.kind)).toEqual(['cabine', 'painel', 'coluna', 'coluna', 'coluna']);
  expect(template.skeleton[0]).toMatchObject({ kind: 'cabine', name: LOCAL, funcao: 'transformacao' });
  await expect(syncBadge(page)).toHaveAttribute('data-pending', '0', { timeout: SYNC_CYCLE_TIMEOUT });

  // A relatório from it, as a person makes one.
  await page.goto('/');
  await expect(page.locator('.shortcut-sub', { hasText: '1 template' })).toBeVisible({ timeout: 30_000 });
  await createProjectFromHome(page);
  const relatorioId = await createRelatorio(page, { template: NEW_TEMPLATE });
  const scope = { relatorioId };

  // The device holds the three kinds, the Função, each block on its location and the kernel's TAGs.
  const records = await entities<LocationRow | BlockRow | EquipmentRow>(page);
  const locations = records.filter((record) => record.entity === 'location').map((record) => record.row as LocationRow).filter((row) => row.relatorio_id === relatorioId);
  expect(locations.map((row) => row.kind).sort()).toEqual(['cabine', 'coluna', 'coluna', 'coluna', 'painel']);
  const localRow = locations.find((row) => row.kind === 'cabine')!;
  const painelRow = locations.find((row) => row.kind === 'painel')!;
  const colunaRows = locations.filter((row) => row.kind === 'coluna').sort((a, b) => a.name.localeCompare(b.name));
  expect(localRow).toMatchObject({ parent_id: null, name: LOCAL, funcao: 'transformacao', agrupar_por_tipo: false });
  expect(painelRow).toMatchObject({ parent_id: localRow.id, name: 'Painel 1' });
  // A painel holds no data of its own.
  expect(Object.keys(painelRow)).not.toEqual(expect.arrayContaining(['se']));
  expect(Object.keys(painelRow)).not.toEqual(expect.arrayContaining(['funcao']));
  expect(colunaRows.map((row) => [row.name, row.parent_id])).toEqual([1, 2, 3].map((index) => [`Coluna ${index}`, painelRow.id]));
  const tagOf = new Map(records.filter((record) => record.entity === 'equipment').map((record) => [record.id, (record.row as EquipmentRow).tag]));
  const sheets = records
    .filter((record) => record.entity === 'block')
    .map((record) => record.row as BlockRow)
    .filter((row) => row.relatorio_id === relatorioId && row.location_id !== null)
    .map((row) => ({ blockId: row.id, blockType: row.block_type, locationId: row.location_id!, tag: tagOf.get(row.equipment_id ?? '') ?? '' }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
  expect(sheets.map((sheet) => [sheet.tag, sheet.blockType, sheet.locationId])).toEqual([
    ['SEC-C01', 'chave_seccionadora', colunaRows[0]!.id],
    ['SEC-C02', 'chave_seccionadora', colunaRows[1]!.id],
    ['SEC-C03', 'chave_seccionadora', colunaRows[2]!.id],
    ['TR-1', 'transformador_forca', localRow.id],
    ['TR-2', 'transformador_forca', localRow.id],
  ]);
  const sheetOf = (tag: string) => sheets.find((sheet) => sheet.tag === tag)!;

  // The tree draws them: the local's own sheets first, then the painel with its colunas.
  await openSection9(page);
  await expandLocation(page, LOCAL);
  const localLi = local(page, LOCAL);
  await expect(localLi.locator(':scope > .s9-loc-row .s9-loc-meta')).toContainText('Transformação');
  await expect(localLi.locator(':scope > .s9-loc-row .progress-counter')).toHaveText('0 de 5');
  await expect(localLi.locator(':scope > .s9-col-direct .s9-col-name')).toHaveText('Equipamentos no local');
  await expect(page.getByRole('list', { name: `Equipamentos direto em ${LOCAL}` }).locator(':scope > li.s9-eq .block-tag')).toHaveText(['TR-1', 'TR-2']);
  await expect(painelNames(page, LOCAL)).toHaveText(['Painel 1']);
  await expect(painel(page, 'Painel 1').locator(':scope > .s9-pnl-row .s9-pnl-meta')).toHaveText('Painel · 3 colunas');
  await expandLocation(page, painelInTree('Painel 1', LOCAL));
  await expect(painel(page, 'Painel 1').locator(':scope > .s9-cols > li.s9-coluna > .s9-col .s9-col-name')).toHaveText(['Coluna 1', 'Coluna 2', 'Coluna 3']);
  await expandLocation(page, colunaInTree('Coluna 1', 'Painel 1', LOCAL));
  await expect(coluna(page, 'Coluna 1').locator('.block-tag')).toHaveText(['SEC-C01']);

  // The creation reaches the server; the office fills one sheet on the local and one in a coluna.
  await syncNowAndReturn(page);
  await pushDrafts(page, database, [
    emCampoDraft(account, relatorioId),
    ...localFields(scope, localRow.id),
    ...completeSheet(scope, sheetOf('TR-1').blockId, 'transformador_forca'),
    ...completeSheet(scope, sheetOf('SEC-C01').blockId, 'chave_seccionadora'),
  ]);
  await syncNowAndReturn(page);

  // Both are concluded by the tap; the sheet in the coluna names its whole path.
  await concludeSheet(page, relatorioId, sheetOf('TR-1').blockId, LOCAL);
  await expect(page).toHaveURL(new RegExp(`/ficha/${sheetOf('TR-2').blockId}$`));
  await concludeSheet(page, relatorioId, sheetOf('SEC-C01').blockId, `${LOCAL} › Painel 1 › Coluna 1`);
  await expect(page).toHaveURL(new RegExp(`/ficha/${sheetOf('SEC-C02').blockId}$`));

  // A reload reads it all back from the device.
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await openSection9(page);
  await expandLocation(page, LOCAL);
  await expandLocation(page, painelInTree('Painel 1', LOCAL));
  await expandLocation(page, colunaInTree('Coluna 1', 'Painel 1', LOCAL));
  await expect(local(page, LOCAL).locator(':scope > .s9-loc-row .s9-loc-meta')).toContainText('Transformação · BLINDADA · 13,8 kV · 25 °C · 65 %');
  await expect(local(page, LOCAL).locator(':scope > .s9-loc-row .progress-counter')).toHaveText('2 de 5');
  await expect(local(page, LOCAL).locator(':scope > .s9-col-direct .s9-col-meta')).toHaveText('1 de 2');
  await expect(painel(page, 'Painel 1').locator(':scope > .s9-pnl-row .progress-counter')).toHaveText('1 de 3');
  await expect(eqRow(page, 'TR-1').locator('.s9-state')).toHaveAttribute('data-state', 'ok');
  await expect(eqRow(page, 'SEC-C01').locator('.s9-state')).toHaveAttribute('data-state', 'ok');

  // "Gerar relatório": revision 1, its DOCX read back.
  await setParecer(page, relatorioId);
  const modal = page.getByRole('dialog', { name: 'Gerar relatório' });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await expect(modal).toBeVisible();
  const generate = modal.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' });
  await expect(generate).toBeEnabled({ timeout: 30_000 });
  await generate.click();
  await confirmIssue(modal, /^Gerar com 3 fichas vazias/);
  await expect(page.getByTestId('toast')).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
  const download = await downloadFrom(page, () => modal.getByRole('button', { name: 'DOCX — abrir no Word' }).click());
  expect(download.suggestedFilename()).toBe('relatorio-rev-1.docx');
  const bytes = await downloadBytes(download);
  const structure = extractStructure(bytes);
  const document = readZipEntries(bytes).get('word/document.xml')!.toString('utf8');

  // The tests section, from its own heading to the next section's or the document's end (E7-A6:
  // never by position). A template born from "Novo template" holds no numbered section block
  // before it, so FO.SERV-03's section 9 takes the number the document gives it.
  const level1 = structure.headings.filter((h) => h.level === 1).map((h) => h.text);
  const tests = level1.find((text) => /^\d+ RELATÓRIOS DOS ENSAIOS$/.test(text));
  expect(tests, `the Heading 1 list: ${JSON.stringify(level1)}`).toBeDefined();
  const number = tests!.split(' ')[0]!;
  const next = level1[level1.indexOf(tests!) + 1];
  const from = structure.paragraphs.lastIndexOf(tests!);
  const to = next === undefined ? structure.paragraphs.length : structure.paragraphs.lastIndexOf(next);
  expect(from).toBeGreaterThan(-1);
  expect(to).toBeGreaterThan(from);
  const section = structure.paragraphs.slice(from, to);
  const heading = `${number}.1 ${LOCAL}`;
  // The local heading, the local's own parts (Story 14.4, seed v4: the SE, the environment and the site table, once, before
  // any sheet), its own sheets, then the band over the painel's sheets.
  const expected = [
    heading,
    'CARACTERÍSTICAS DA SE',
    'AMBIENTE DE ENSAIO',
    'VERIFICAÇÕES DO LOCAL',
    'TRANSFORMADOR DE FORÇA TR-1',
    'TRANSFORMADOR DE FORÇA TR-2',
    'PAINEL 1',
    'CHAVE SECCIONADORA SEC-C01',
    'CHAVE SECCIONADORA SEC-C02',
    'CHAVE SECCIONADORA SEC-C03',
  ];
  const at = expected.map((text) => section.indexOf(text));
  expect(at.every((index) => index > -1), `every part of section 9 is printed: ${JSON.stringify(at)}`).toBe(true);
  expect([...at].sort((a, b) => a - b)).toEqual(at);
  for (const once of [heading, 'CARACTERÍSTICAS DA SE', 'AMBIENTE DE ENSAIO', 'VERIFICAÇÕES DO LOCAL', 'PAINEL 1']) expect(section.filter((text) => text === once), once).toHaveLength(1);
  expect(section).toContain('BLINDADA');
  // The band is not a heading: the section has the local's Heading 2 alone, and the ÍNDICE no line for the painel.
  expect(structure.headings.filter((h) => h.level === 2 && h.text.startsWith(`${number}.`))).toEqual([{ level: 2, text: heading }]);
  expect(structure.paragraphs.slice(0, from).some((text) => text.toLocaleUpperCase('pt-BR').startsWith('PAINEL 1'))).toBe(false);
  const band = [...document.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].map((match) => match[0]).filter((xml) => paragraphText(xml) === 'PAINEL 1');
  expect(band).toHaveLength(1);
  expect(band[0]).toContain(`w:fill="${BAND_FILL}"`);
  expect(band[0]).toContain(`<w:color w:val="${BAND_COLOR}"/>`);
  expect(band[0]).not.toContain('<w:pStyle w:val="Heading2"/>');
});

// --- 14.10-E2E-006 -----------------------------------------------------------------------

/**
 * A relatório of one local ("Cabine primária") holding a painel ("Painel 1") of two colunas,
 * one seccionadora in each, born on "another device" from a template built off the standard
 * one (its section blocks kept), as `pushNewRelatorio` does.
 */
async function pushPainelRelatorio(page: Page): Promise<{ relatorioId: string }> {
  const standard = standardTemplate({ id: newId() });
  const seccionadora = (ref: string) => ({ ...defaultBlockConfig(SEED_VERSION, 'chave_seccionadora'), quantity: 1, skeleton_location_ref: ref, section_text: null });
  const template: TemplateRow = {
    ...standard,
    skeleton: [
      { ref: 'local', kind: 'cabine', parent_ref: null, name: 'Cabine primária', agrupar_por_tipo: false, funcao: 'primaria' },
      { ref: 'painel', kind: 'painel', parent_ref: 'local', name: 'Painel 1' },
      { ref: 'coluna-1', kind: 'coluna', parent_ref: 'painel', name: 'Coluna 1' },
      { ref: 'coluna-2', kind: 'coluna', parent_ref: 'painel', name: 'Coluna 2' },
    ],
    blocks: [...standard.blocks.filter((block) => block.skeleton_location_ref === null), seccionadora('coluna-1'), seccionadora('coluna-2')],
  };
  const projectId = newId();
  const project: OpDraft = {
    kind: 'create',
    scope: 'company',
    company_id: account.companyId,
    project_id: null,
    relatorio_id: null,
    path: `project/${projectId}`,
    value: { id: projectId, client_id: null, name: 'Obra do painel', site: 'Obra do painel', removed_at: null },
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: account.userId,
  };
  const { relatorioId, drafts } = instantiateTemplate(
    template,
    { id: projectId },
    { service_start: '2026-10-14', service_end: '2026-10-15', existingEquipment: [], responsible_user_id: null },
    { newId, actorId: account.userId, companyId: account.companyId },
  );
  // Born Em campo, as a relatório being filled on site is (status flow 2026-10-10).
  await pushDrafts(page, database, [project, ...drafts, emCampoDraft(account, relatorioId)]);
  return { relatorioId };
}

test('@p0 14.10-E2E-006 at 1280: "Agrupar por tipo" on a local whose painel holds a seccionadora in each of two colunas, stored on the device; the DOCX prints one type group per coluna titled with the coluna, the painel and the local, and the ÍNDICE lines equal those headings', async ({
  page,
}) => {
  test.setTimeout(360_000);
  const LOCAL_NAME = 'Cabine primária';
  await resetEmpresaB(account);
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const { relatorioId } = await pushPainelRelatorio(page);
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await openSection9(page);
  await expect(local(page, LOCAL_NAME)).toBeVisible({ timeout: 30_000 });

  // The local's overflow turns the flag on, as a person does; the tree says so.
  await menuOf(page, LOCAL_NAME).click();
  const agrupar = page.getByRole('menuitemcheckbox', { name: 'Agrupar por tipo na seção 9' });
  await expect(agrupar).toHaveAttribute('aria-checked', 'false');
  await agrupar.click();
  await expect(treeAnnouncer(page)).toHaveText(`Agrupar por tipo ativado em ${LOCAL_NAME}`);

  // Stored on the device: the outbox holds the put, the local's row holds the flag.
  const localRow = (await entities<LocationRow>(page)).map((record) => record.row).find((row) => row.relatorio_id === relatorioId && row.kind === 'cabine')!;
  await expect.poll(async () => (await outbox(page)).filter((row) => row.path === `location/${localRow.id}/agrupar_por_tipo`).map((row) => row.value)).toEqual([true]);
  await expect
    .poll(async () => (await entities<LocationRow>(page)).find((record) => record.entity === 'location' && record.id === localRow.id)?.row)
    .toMatchObject({ kind: 'cabine', agrupar_por_tipo: true });
  await syncNowAndReturn(page);

  // "Gerar relatório": revision 1, its DOCX read back.
  await setParecer(page, relatorioId);
  const modal = page.getByRole('dialog', { name: 'Gerar relatório' });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await expect(modal).toBeVisible();
  const generate = modal.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' });
  await expect(generate).toBeEnabled({ timeout: 30_000 });
  await generate.click();
  await confirmIssue(modal, /^Gerar com 2 fichas vazias/);
  await expect(page.getByTestId('toast')).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
  const download = await downloadFrom(page, () => modal.getByRole('button', { name: 'DOCX — abrir no Word' }).click());
  const structure = extractStructure(await downloadBytes(download));

  // Section 9 from its own heading to the next section's (E7-A6: never by position).
  const level1 = structure.headings.filter((h) => h.level === 1).map((h) => h.text);
  const tests = level1.find((text) => /^\d+ RELATÓRIOS DOS ENSAIOS$/.test(text));
  expect(tests, `the Heading 1 list: ${JSON.stringify(level1)}`).toBeDefined();
  const number = tests!.split(' ')[0]!;
  const next = level1[level1.indexOf(tests!) + 1];
  const from = structure.paragraphs.lastIndexOf(tests!);
  const to = next === undefined ? structure.paragraphs.length : structure.paragraphs.lastIndexOf(next);
  expect(to).toBeGreaterThan(from);
  const section = structure.paragraphs.slice(from, to);
  // authored: Story 14.10 part 8, open for Bruno.
  const coluna1 = `${number}.2 Seccionadoras dos Cubículos de MT da Coluna 1 do Painel 1 — ${LOCAL_NAME}`;
  const coluna2 = `${number}.3 Seccionadoras dos Cubículos de MT da Coluna 2 do Painel 1 — ${LOCAL_NAME}`;
  const headings = [`${number}.1 ${LOCAL_NAME}`, coluna1, coluna2];
  expect(structure.headings.filter((h) => h.level === 2 && h.text.startsWith(`${number}.`)).map((h) => h.text)).toEqual(headings);
  const expected = [headings[0]!, 'VERIFICAÇÕES DO LOCAL', 'PAINEL 1', coluna1, 'CHAVE SECCIONADORA SEC-C01', coluna2, 'CHAVE SECCIONADORA SEC-C02'];
  const at = expected.map((text) => section.indexOf(text));
  expect(at.every((index) => index > -1), `every part of section 9 is printed: ${JSON.stringify(at)}`).toBe(true);
  expect([...at].sort((a, b) => a - b)).toEqual(at);
  // The ÍNDICE: its section 9 lines (text, a tab, the page) are the headings, word for word.
  const toc = structure.paragraphs
    .slice(0, from)
    .filter((text) => text.startsWith(`${number}.`) && text.includes('\t'))
    .map((text) => text.split('\t')[0]);
  expect(toc).toEqual(headings);
});

// --- 14.2-E2E-002 ------------------------------------------------------------------------

test('@p0 14.2-E2E-002 at 768: the composer and the tree add a local through the Função dialog, a painel (empty-painel note) and a coluna, rename the painel, move it the four ways with each move said, and "Função e nome" with its undo; only template ops, then only location ops', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  await signIn(page, account.email);

  // --- the Template composer ---
  const templateId = await openNewTemplate(page);
  // The dialog: nothing chosen, the primary says why; "Outra" asks which and names the local after it.
  await page.getByRole('button', { name: 'Adicionar local', exact: true }).click();
  const add = page.getByRole('dialog', { name: 'Adicionar local' });
  const addPrimary = add.getByRole('button', { name: 'Adicionar local', exact: true });
  await expect(add.getByRole('radiogroup', { name: 'Função' }).getByRole('radio')).toHaveText(['Entrada', 'Primária', 'Transformação', 'Distribuição', 'Outra']);
  await expect(addPrimary).toHaveAttribute('aria-disabled', 'true');
  await expect(add.locator('.btn-reason')).toHaveText('Escolha a função');
  await expect(add.getByRole('textbox', { name: 'Qual função' })).toHaveCount(0);
  await add.getByRole('radio', { name: 'Outra', exact: true }).click();
  await expect(add.locator('.btn-reason')).toHaveText('Informe a função');
  await add.getByRole('textbox', { name: 'Qual função' }).fill('Medição');
  await expect(add.getByRole('textbox', { name: 'Nome', exact: true })).toHaveValue('Cabine de medição');
  await add.getByRole('radio', { name: 'Primária', exact: true }).click();
  await expect(add.getByRole('textbox', { name: 'Qual função' })).toHaveCount(0);
  await expect(add.getByRole('textbox', { name: 'Nome', exact: true })).toHaveValue('Cabine primária');
  await expect(addPrimary).not.toHaveAttribute('aria-disabled', 'true');
  await addPrimary.click();
  await expect(add).toBeHidden();
  await expect(composerAnnouncer(page)).toHaveText('Cabine primária adicionada');
  const card = localCard(page, 'Cabine primária');
  await expect(card.locator(':scope > .block-body .loc-flag')).toHaveText('sem painéis · 0 blocos');
  await expect(card.locator(':scope > .block-body .block-sub')).toHaveText('Função: primária · Agrupar por tipo: desativado');

  // Below 1024 px the palette is a drawer. The local just added is already its target, so one tap on
  // "Adicionar equipamento" opens it on that local, and one more after closing opens it again
  // (coordinator review 2026-10-13: the tap used to release the target and open nothing).
  const addEquipamento = card.getByRole('button', { name: 'Adicionar equipamento', exact: true });
  await expect(palette(page)).toBeHidden();
  await expect(card).toHaveClass(/is-current/);
  await expect(addEquipamento).toHaveAttribute('aria-pressed', 'true');
  const drawer = page.getByRole('dialog', { name: 'Blocos', exact: true });
  for (let tap = 0; tap < 2; tap++) {
    await addEquipamento.click();
    await expect(drawer.locator('.pal-target')).toHaveText('Toque para adicionar em: Cabine primária, direto no local');
    await expect(drawer.getByRole('group', { name: 'Transformadores, 0' })).toBeVisible();
    await drawer.getByRole('button', { name: 'Fechar', exact: true }).click();
    await expect(drawer).toBeHidden();
    await expect(card).toHaveClass(/is-current/);
    await expect(addEquipamento).toHaveAttribute('aria-pressed', 'true');
    await expect(card.locator(':scope > .block-expand > .loc-direct .loc-current')).toBeVisible();
  }

  // A painel: empty, it says why it takes no equipment; a coluna ends the note.
  await page.getByRole('button', { name: 'Adicionar painel' }).click();
  await expect(composerAnnouncer(page)).toHaveText('Painel 1 adicionado');
  const firstPainel = painelCard(page, 'Cabine primária', 'Painel 1');
  await expect(firstPainel.getByRole('note')).toHaveText(PAINEL_EMPTY);
  await expect(firstPainel.locator(':scope > .block-body .loc-flag')).toHaveText('sem colunas · 0 blocos');
  await firstPainel.getByRole('button', { name: 'Adicionar coluna' }).click();
  await expect(composerAnnouncer(page)).toHaveText('Coluna 1 adicionada');
  await expect(colunaNames(page, painelInComposer('Painel 1', 'Cabine primária'))).toHaveText(['Coluna 1']);
  // The control that added the first coluna still holds the focus, drawn now as the text button.
  await expect(firstPainel.getByRole('button', { name: 'Adicionar coluna' })).toBeFocused();
  await expect(firstPainel.getByRole('note')).toHaveCount(0);
  await expect(skeletonHeading(page)).toHaveText('Esqueleto de locais · 1 local · 1 painel · 1 coluna');

  // A second painel from the local's Overflow, renamed.
  await menuOf(page, 'Cabine primária').click();
  await page.getByRole('menuitem', { name: 'Adicionar painel' }).click();
  await expect(composerAnnouncer(page)).toHaveText('Painel 2 adicionado');
  await menuOf(page, painelInComposer('Painel 2', 'Cabine primária')).click();
  await page.getByRole('menuitem', { name: 'Renomear' }).click();
  const renameCard = page.getByRole('dialog', { name: 'Renomear Painel 2' });
  await renameCard.getByRole('textbox', { name: 'Nome' }).fill('Média tensão');
  await renameCard.getByRole('button', { name: 'Salvar' }).click();
  await expect(composerAnnouncer(page)).toHaveText('Painel Média tensão renomeado');
  const cardNames = painelCards(page, 'Cabine primária').locator(':scope > .block-body .block-name');
  await expect(cardNames).toHaveText(['Painel 1', 'Média tensão']);

  // The four ways to move it, each said.
  const moved = (position: number) => `Painel Média tensão movido para a posição ${position} de 2`;
  const second = painelCard(page, 'Cabine primária', 'Média tensão');
  await second.locator(':scope > .block-body').focus();
  await page.keyboard.press('Alt+ArrowUp');
  await expect(composerAnnouncer(page)).toHaveText(moved(1));
  await expect(cardNames).toHaveText(['Média tensão', 'Painel 1']);
  await expect(second.locator(':scope > .block-body')).toBeFocused();
  await menuOf(page, painelInComposer('Média tensão', 'Cabine primária')).click();
  await page.getByRole('menuitem', { name: 'Descer' }).click();
  await expect(composerAnnouncer(page)).toHaveText(moved(2));
  await expect(cardNames).toHaveText(['Painel 1', 'Média tensão']);
  await dragAbove(page, page.getByRole('button', { name: `Reordenar ${painelInComposer('Média tensão', 'Cabine primária')}`, exact: true }), second, painelCard(page, 'Cabine primária', 'Painel 1'));
  await expect(composerAnnouncer(page)).toHaveText(moved(1));
  await expect(cardNames).toHaveText(['Média tensão', 'Painel 1']);
  const cardBox = page.getByRole('textbox', { name: 'Posição de Média tensão entre os painéis de Cabine primária', exact: true });
  await cardBox.fill('2');
  await cardBox.press('Enter');
  await expect(composerAnnouncer(page)).toHaveText(moved(2));
  await expect(cardNames).toHaveText(['Painel 1', 'Média tensão']);

  // "Função e nome" on the local, and its undo.
  await menuOf(page, 'Cabine primária').click();
  await page.getByRole('menuitem', { name: 'Função e nome' }).click();
  const editCard = page.getByRole('dialog', { name: 'Função e nome' });
  await expect(editCard.getByRole('radio', { name: 'Primária', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(editCard.getByRole('textbox', { name: 'Nome', exact: true })).toHaveValue('Cabine primária');
  await editCard.getByRole('radio', { name: 'Transformação', exact: true }).click();
  // A local being edited keeps its own name until it is typed over.
  await expect(editCard.getByRole('textbox', { name: 'Nome', exact: true })).toHaveValue('Cabine primária');
  await editCard.getByRole('textbox', { name: 'Nome', exact: true }).fill('Cabine do térreo');
  await editCard.getByRole('button', { name: 'Salvar' }).click();
  await expect(composerAnnouncer(page)).toHaveText('Cabine do térreo atualizada');
  await expect(localCard(page, 'Cabine do térreo').locator(':scope > .block-body .block-sub')).toHaveText('Função: transformação · Agrupar por tipo: desativado');
  await toast(page).getByRole('button', { name: 'Desfazer' }).click();
  await expect(localCard(page, 'Cabine primária').locator(':scope > .block-body .block-sub')).toHaveText('Função: primária · Agrupar por tipo: desativado');
  await expect(localCard(page, 'Cabine do térreo')).toHaveCount(0);

  // Every op of the composer walk is the template's own: its create, then skeleton puts.
  const templateOps = await outbox(page);
  expect(templateOps.length).toBeGreaterThan(8);
  expect([...new Set(templateOps.map((op) => op.path))].sort()).toEqual([`template/${templateId}`, `template/${templateId}/skeleton`]);
  const skeleton = (await entities<TemplateRow>(page)).find((record) => record.entity === 'template' && record.id === templateId)!.row.skeleton;
  expect(skeleton.map((node) => [node.kind, node.name])).toEqual([
    ['cabine', 'Cabine primária'],
    ['painel', 'Painel 1'],
    ['coluna', 'Coluna 1'],
    ['painel', 'Média tensão'],
  ]);
  expect(skeleton[0]).toMatchObject({ funcao: 'primaria' });
  await expect(syncBadge(page)).toHaveAttribute('data-pending', '0', { timeout: SYNC_CYCLE_TIMEOUT });

  // --- the relatório tree ---
  const { relatorioId } = await pushNewRelatorio(page, account, database);
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  await openSection9(page);
  await expect(tree(page).locator(':scope > li.s9-local')).toHaveCount(6);

  // "Adicionar local" at the foot asks the Função and the name.
  const NEW_LOCAL = 'Cabine de distribuição';
  await addLocal(page, { funcao: 'Distribuição' });
  await expect(toast(page)).toContainText(`${NEW_LOCAL} adicionada`);
  await expect(page.getByRole('button', { name: `Expandir ${NEW_LOCAL}`, exact: true })).toBeFocused();
  await expect(tree(page).locator(':scope > li.s9-local')).toHaveCount(7);
  await expect(local(page, NEW_LOCAL).locator(':scope > .s9-loc-row .s9-loc-meta')).toHaveText('Distribuição · sem painéis');

  // A painel under it: open, with its note, "Adicionar coluna" and no "Adicionar bloco".
  await menuOf(page, NEW_LOCAL).click();
  await expect(page.getByRole('menuitem', { name: 'Adicionar coluna' })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Adicionar painel' }).click();
  await expect(toast(page)).toContainText('Painel 1 adicionado');
  await expect(page.getByRole('button', { name: `Recolher ${painelInTree('Painel 1', NEW_LOCAL)}`, exact: true })).toBeFocused();
  const treePainel = painel(page, 'Painel 1');
  await expect(treePainel.locator(':scope > .s9-pnl-row .s9-pnl-meta')).toHaveText('Painel · sem colunas');
  await expect(treePainel.getByRole('note')).toHaveText(PAINEL_EMPTY);
  await expect(treePainel.getByRole('button', { name: /^Adicionar bloco/ })).toHaveCount(0);
  await treePainel.getByRole('button', { name: 'Adicionar coluna' }).click();
  await expect(toast(page)).toContainText('Coluna 1 adicionada');
  await expect(treePainel.getByRole('note')).toHaveCount(0);
  await expect(treePainel.locator(':scope > .s9-pnl-row .s9-pnl-meta')).toHaveText('Painel · 1 coluna');
  await expect(treePainel.getByRole('button', { name: `Adicionar bloco em ${painelInTree('Painel 1', NEW_LOCAL)}` })).toBeVisible();

  // A second painel, renamed.
  await menuOf(page, NEW_LOCAL).click();
  await page.getByRole('menuitem', { name: 'Adicionar painel' }).click();
  await expect(toast(page)).toContainText('Painel 2 adicionado');
  await menuOf(page, painelInTree('Painel 2', NEW_LOCAL)).click();
  await page.getByRole('menuitem', { name: 'Renomear' }).click();
  const renameRow = page.getByRole('dialog', { name: 'Renomear Painel 2' });
  await renameRow.getByRole('textbox', { name: 'Nome' }).fill('Média tensão');
  await renameRow.getByRole('button', { name: 'Salvar' }).click();
  await expect(treeAnnouncer(page)).toHaveText('Painel Média tensão renomeado');
  await expect(page.getByRole('button', { name: `Recolher ${painelInTree('Média tensão', NEW_LOCAL)}`, exact: true })).toBeFocused();
  await expect(painelNames(page, NEW_LOCAL)).toHaveText(['Painel 1', 'Média tensão']);

  // The four ways to move it, each said.
  await page.getByRole('button', { name: new RegExp(`^(Expandir|Recolher) ${painelInTree('Média tensão', NEW_LOCAL)}$`) }).focus();
  await page.keyboard.press('Alt+ArrowUp');
  await expect(treeAnnouncer(page)).toHaveText(moved(1));
  await expect(painelNames(page, NEW_LOCAL)).toHaveText(['Média tensão', 'Painel 1']);
  await menuOf(page, painelInTree('Média tensão', NEW_LOCAL)).click();
  await page.getByRole('menuitem', { name: 'Descer' }).click();
  await expect(treeAnnouncer(page)).toHaveText(moved(2));
  await expect(painelNames(page, NEW_LOCAL)).toHaveText(['Painel 1', 'Média tensão']);
  await dragAbove(page, page.getByRole('button', { name: `Reordenar ${painelInTree('Média tensão', NEW_LOCAL)}`, exact: true }), painel(page, 'Média tensão'), painel(page, 'Painel 1'));
  await expect(treeAnnouncer(page)).toHaveText(moved(1));
  await expect(painelNames(page, NEW_LOCAL)).toHaveText(['Média tensão', 'Painel 1']);
  const rowBox = page.getByRole('textbox', { name: `Posição de ${painelInTree('Média tensão', NEW_LOCAL)}`, exact: true });
  await rowBox.fill('2');
  await rowBox.press('Enter');
  await expect(treeAnnouncer(page)).toHaveText(moved(2));
  await expect(painelNames(page, NEW_LOCAL)).toHaveText(['Painel 1', 'Média tensão']);

  // "Função e nome": both written in one batch, both undone by "Desfazer".
  await menuOf(page, NEW_LOCAL).click();
  await page.getByRole('menuitem', { name: 'Função e nome' }).click();
  const editRow = page.getByRole('dialog', { name: 'Função e nome' });
  await expect(editRow.getByRole('radio', { name: 'Distribuição', exact: true })).toHaveAttribute('aria-checked', 'true');
  await editRow.getByRole('radio', { name: 'Entrada', exact: true }).click();
  await editRow.getByRole('textbox', { name: 'Nome', exact: true }).fill('Cabine da rua');
  await editRow.getByRole('button', { name: 'Salvar' }).click();
  await expect(treeAnnouncer(page)).toHaveText('Cabine da rua atualizada');
  await expect(local(page, 'Cabine da rua').locator(':scope > .s9-loc-row .s9-loc-meta')).toHaveText('Entrada');
  const locationOps = async () => (await outbox(page)).filter((op) => !op.path.startsWith('template/'));
  const localId = (await local(page, 'Cabine da rua').getAttribute('data-location-id'))!;
  const written = (await locationOps()).filter((op) => op.path === `location/${localId}/funcao` || op.path === `location/${localId}/name`);
  expect(written.map((op) => [op.path.split('/')[2], op.value]).sort()).toEqual([
    ['funcao', 'entrada'],
    ['name', 'Cabine da rua'],
  ]);
  expect(written[0]!.batch_id).not.toBeNull();
  expect(written[1]!.batch_id).toBe(written[0]!.batch_id);
  await toast(page).getByRole('button', { name: 'Desfazer' }).click();
  await expect(local(page, NEW_LOCAL).locator(':scope > .s9-loc-row .s9-loc-meta')).toHaveText('Distribuição');
  await expect(local(page, 'Cabine da rua')).toHaveCount(0);

  // A block born from each of the tree's new entry points (coordinator review 2026-10-13). Below 1280 px a tap on a type creates it at once.
  const fieldPalette = page.getByRole('dialog', { name: 'Adicionar bloco' });
  const painelId = (await treePainel.getAttribute('data-location-id'))!;
  /** The location the device stores for the one live block whose equipment carries `tag`. */
  const storedLocationOf = async (tag: string): Promise<string | null> => {
    const records = await entities<BlockRow | EquipmentRow>(page);
    const equipmentIds = records.filter((record) => record.entity === 'equipment' && (record.row as EquipmentRow).tag === tag).map((record) => record.id);
    expect(equipmentIds, `equipment rows tagged ${tag}`).toHaveLength(1);
    const blocks = records.filter((record) => record.entity === 'block' && (record.row as BlockRow).equipment_id === equipmentIds[0]).map((record) => record.row as BlockRow);
    expect(blocks, `blocks of ${tag}`).toHaveLength(1);
    return blocks[0]!.location_id;
  };

  // "Adicionar equipamento no local ⟨local⟩": the palette names the local, and the block is stored on the local itself.
  await page.getByRole('button', { name: `Adicionar equipamento no local ${NEW_LOCAL}`, exact: true }).click();
  await expect(fieldPalette.locator('.palette-where')).toHaveText(`Em: ${NEW_LOCAL}`);
  const trafo = fieldPalette.getByRole('button', { name: /Transformador de força/ });
  const trafoTag = (await trafo.locator('.pi-meta').innerText()).trim();
  expect(trafoTag).toMatch(/^TR-\d+$/);
  await trafo.click();
  await expect(fieldPalette).toBeHidden();
  await expect(toast(page)).toContainText(`${trafoTag} criada em ${NEW_LOCAL}`);
  await expect(local(page, NEW_LOCAL).locator(':scope > .s9-col-direct .s9-col-name')).toHaveText('Equipamentos no local');
  await expect(page.getByRole('list', { name: `Equipamentos direto em ${NEW_LOCAL}`, exact: true }).locator(':scope > li.s9-eq .block-tag')).toHaveText([trafoTag]);
  expect(await storedLocationOf(trafoTag)).toBe(localId);

  // "Adicionar bloco em ⟨painel⟩": the palette names the painel's last coluna, and the block is stored on that coluna, never on the painel.
  await menuOf(page, painelInTree('Painel 1', NEW_LOCAL)).click();
  await page.getByRole('menuitem', { name: 'Adicionar coluna' }).click();
  await expect(toast(page)).toContainText('Coluna 2 adicionada');
  const painelColunas = treePainel.locator(':scope > .s9-cols > li.s9-coluna');
  await expect(painelColunas.locator(':scope > .s9-col .s9-col-name')).toHaveText(['Coluna 1', 'Coluna 2']);
  const lastColunaId = (await painelColunas.last().getAttribute('data-location-id'))!;
  await treePainel.getByRole('button', { name: `Adicionar bloco em ${painelInTree('Painel 1', NEW_LOCAL)}`, exact: true }).click();
  await expect(fieldPalette.locator('.palette-where')).toHaveText(`Em: ${NEW_LOCAL} › Painel 1 › Coluna 2`);
  const seccionadora = fieldPalette.getByRole('button', { name: /Chave seccionadora/ });
  const seccionadoraTag = (await seccionadora.locator('.pi-meta').innerText()).trim();
  // The TAG names the coluna alone, never the painel.
  expect(seccionadoraTag).toMatch(/^SEC-C02(-\d+)?$/);
  await seccionadora.click();
  await expect(fieldPalette).toBeHidden();
  await expect(toast(page)).toContainText(`${seccionadoraTag} criada na Coluna 2`);
  await expect(painelColunas.last().locator('li.s9-eq .block-tag')).toHaveText([seccionadoraTag]);
  expect(await storedLocationOf(seccionadoraTag)).toBe(lastColunaId);
  expect(lastColunaId).not.toBe(painelId);
  // The painel still holds no block of its own on the device, and its row counts the new sheet through its coluna.
  expect((await entities<BlockRow>(page)).filter((record) => record.entity === 'block' && record.row.location_id === painelId)).toEqual([]);
  await expect(treePainel.locator(':scope > .s9-pnl-row .s9-pnl-meta')).toHaveText('Painel · 2 colunas');
  await expect(treePainel.locator(':scope > .s9-pnl-row .progress-counter')).toHaveText('0 de 1');
  await expect(treePainel.locator(':scope > .s9-eqs')).toHaveCount(0);

  // Every op of the tree walk is a location op (five creates, then names, Funções and order keys),
  // but for the two blocks born above: an equipment create and a block create each.
  const treeOps = await locationOps();
  const born = treeOps.filter((op) => !op.path.startsWith('location/'));
  expect(born.map((op) => [op.path.split('/')[0], op.kind])).toEqual([
    ['equipment', 'create'],
    ['block', 'create'],
    ['equipment', 'create'],
    ['block', 'create'],
  ]);
  expect(born.filter((op) => op.path.startsWith('block/')).map((op) => (op.value as BlockRow).location_id)).toEqual([localId, lastColunaId]);
  const ops = treeOps.filter((op) => op.path.startsWith('location/'));
  expect(ops.filter((op) => op.kind === 'create').map((op) => (op.value as LocationRow).kind)).toEqual(['cabine', 'painel', 'coluna', 'painel', 'coluna']);
  expect(ops.find((op) => op.kind === 'create')!.value).toMatchObject({ kind: 'cabine', name: NEW_LOCAL, funcao: 'distribuicao', parent_id: null });
  expect([...new Set(ops.filter((op) => op.kind !== 'create').map((op) => op.path.split('/').slice(2).join('/')))].sort()).toEqual(['funcao', 'name', 'order_key']);
  expect(ops.filter((op) => op.path === `location/${localId}/funcao`).map((op) => op.value)).toEqual(['entrada', 'distribuicao']);
  expect(ops.filter((op) => op.path === `location/${localId}/name`).map((op) => op.value)).toEqual(['Cabine da rua', NEW_LOCAL]);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

// --- 14.2-E2E-003 ------------------------------------------------------------------------

test('@p1 14.2-E2E-003 at 390 the composer with a local, a painel and a coluna, the Função dialog and the Sumário with a painel never scroll sideways', async ({ page }) => {
  test.setTimeout(240_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, account.email);
  const fitsViewport = async (locator: Locator, what: string) => {
    const box = (await locator.boundingBox())!;
    expect(box.x, `${what}: left edge`).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `${what}: right edge`).toBeLessThanOrEqual(390);
  };

  // The Sumário with a painel and its empty note, then with a coluna.
  const { relatorioId } = await pushNewRelatorio(page, account, database);
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  await openSection9(page);
  await menuOf(page, 'Cubículo Enel').click();
  await page.getByRole('menuitem', { name: 'Adicionar painel' }).click();
  const treePainel = painel(page, 'Painel 1');
  await expect(treePainel.getByRole('note')).toHaveText(PAINEL_EMPTY);
  expect(await horizontalOverflow(page), 'Sumário with an empty painel at 390px').toBeLessThanOrEqual(0);
  await fitsViewport(treePainel.getByRole('note'), 'the empty-painel note');
  await treePainel.getByRole('button', { name: 'Adicionar coluna' }).click();
  await expect(treePainel.locator(':scope > .s9-pnl-row .s9-pnl-meta')).toHaveText('Painel · 1 coluna');
  await expect(coluna(page, 'Coluna 1')).toHaveCount(1);
  expect(await horizontalOverflow(page), 'Sumário with a painel and a coluna at 390px').toBeLessThanOrEqual(0);
  await fitsViewport(treePainel.locator(':scope > .s9-pnl-row'), 'the painel row');
  await fitsViewport(local(page, 'Cubículo Enel').locator(':scope > .s9-loc-row'), 'the local row');

  // The Função dialog, from the tree's foot: with "Outra" open it shows every field it has.
  await page.getByRole('button', { name: 'Adicionar local', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Adicionar local' });
  await dialog.getByRole('radio', { name: 'Outra', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Qual função' }).fill('Medição de faturamento da concessionária');
  await expect(dialog.getByRole('textbox', { name: 'Nome', exact: true })).toHaveValue('Cabine de medição de faturamento da concessionária');
  expect(await horizontalOverflow(page), 'the Função dialog at 390px').toBeLessThanOrEqual(0);
  await fitsViewport(dialog, 'the Função dialog');
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  for (const radio of await dialog.getByRole('radio').all()) expect(Math.round((await radio.boundingBox())!.height)).toBeGreaterThanOrEqual(48);
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();

  // The composer with the three levels.
  await page.goto('/');
  await expect(page.getByRole('group', { name: 'Relatórios por status' })).toBeVisible();
  await openNewTemplate(page);
  await addLocal(page, { funcao: 'Transformação' });
  await expect(localCards(page)).toHaveCount(1);
  expect(await horizontalOverflow(page), 'composer with a local at 390px').toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: 'Adicionar painel' }).click();
  await expect(painelCard(page, LOCAL, 'Painel 1').getByRole('note')).toHaveText(PAINEL_EMPTY);
  expect(await horizontalOverflow(page), 'composer with an empty painel at 390px').toBeLessThanOrEqual(0);
  await painelCard(page, LOCAL, 'Painel 1').getByRole('button', { name: 'Adicionar coluna' }).click();
  await expect(colunaNames(page, `Painel 1 em ${LOCAL}`)).toHaveText(['Coluna 1']);
  expect(await horizontalOverflow(page), 'composer with a painel and a coluna at 390px').toBeLessThanOrEqual(0);
  await fitsViewport(localCard(page, LOCAL), 'the local card');
  await fitsViewport(painelCard(page, LOCAL, 'Painel 1'), 'the painel card');
});

// --- 14.2-E2E-004 ------------------------------------------------------------------------

type TreeRow = LocationRow | BlockRow | EquipmentRow;
const TREE_ENTITIES = ['location', 'block', 'equipment'];
const RECOVERABLE = 'Dá para recuperar até a emissão, em "Restaurar ficha removida".';

/** The location, block and equipment rows this device holds, keyed "entity/id". */
async function deviceTreeRows(page: Page): Promise<Map<string, TreeRow>> {
  const records = await entities<TreeRow>(page);
  return new Map(records.filter((record) => TREE_ENTITIES.includes(record.entity)).map((record) => [`${record.entity}/${record.id}`, record.row]));
}

/** The rows the server holds for `ids` in this worker's company, keyed "entity/id" (`serverRow` of `support/reading-ops.ts`, many at once). */
function serverTreeRows(ids: readonly string[]): Promise<Map<string, unknown>> {
  return withSeedDb(async (db) => {
    const found = await db.query.entities.findMany({
      columns: { entity: true, id: true, row: true },
      where: (t, { and, eq, inArray }) => and(eq(t.company_id, account.companyId), inArray(t.id, [...ids])),
    });
    return new Map(found.map((record) => [`${record.entity}/${record.id}`, record.row as unknown]));
  });
}

/** The whole batch the one `kind` op on `path` belongs to, in the order it was written. */
async function batchOf(page: Page, path: string, kind: string): Promise<OutboxRow[]> {
  const rows = await outbox(page);
  const lead = rows.filter((op) => op.path === path && op.kind === kind);
  expect(lead, `one ${kind} on ${path}`).toHaveLength(1);
  expect(lead[0]!.batch_id).not.toBeNull();
  return rows.filter((op) => op.batch_id === lead[0]!.batch_id);
}

test('@p0 14.2-E2E-004 at 768: a coluna holding a sheet is removed after its confirm, in one batch, and undone; a painel is removed, stays gone on reload and comes back from "Restaurar ficha removida" as one entry with its colunas, sheets and TAGs; a local is removed; after "Sincronizar agora" the device and the server hold the same rows', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  await signIn(page, account.email);
  const { relatorioId } = await pushNewRelatorio(page, account, database);
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  // A removal frees an equipment only once this device holds the whole company stream (`equipmentFreedByRemoval`).
  await waitForCompanyPull(page, database);
  await openSection9(page);

  // The standard relatório: six locals, 94 sheets. Oxigênio holds five sheets itself; 1° Subsolo holds ten, and seventeen colunas.
  const PAINEL_LOCAL = 'Oxigênio';
  const OTHER_LOCAL = '1° Subsolo';
  const PAINEL = painelInTree('Painel 1', PAINEL_LOCAL);
  const COLUNA_1 = colunaInTree('Coluna 1', 'Painel 1', PAINEL_LOCAL);
  const COLUNA_2 = colunaInTree('Coluna 2', 'Painel 1', PAINEL_LOCAL);
  const total = (sheets: number) => page.getByRole('button', { name: `0 de ${sheets} fichas concluídas`, exact: true });
  const localCounter = (name: string) => local(page, name).locator(':scope > .s9-loc-row .progress-counter');
  const directTags = page.getByRole('list', { name: `Equipamentos direto em ${PAINEL_LOCAL}`, exact: true }).locator(':scope > li.s9-eq .block-tag');
  await expect(tree(page).locator(':scope > li.s9-local')).toHaveCount(6);
  await expect(total(94)).toBeVisible();

  // A painel under Oxigênio with two colunas, a sheet in each, as a person builds it. Below 1280 px a tap on a type creates it at once.
  await menuOf(page, PAINEL_LOCAL).click();
  await page.getByRole('menuitem', { name: 'Adicionar painel' }).click();
  await expect(toast(page)).toContainText('Painel 1 adicionado');
  const treePainel = painel(page, 'Painel 1');
  const painelColunas = treePainel.locator(':scope > .s9-cols > li.s9-coluna');
  const painelCounter = treePainel.locator(':scope > .s9-pnl-row .progress-counter');
  const painelMeta = treePainel.locator(':scope > .s9-pnl-row .s9-pnl-meta');
  const colunaTags = (name: string) => painelColunas.filter({ has: page.locator(':scope > .s9-col .s9-col-name', { hasText: new RegExp(`^${name}$`) }) }).locator(':scope > .s9-eqs > li.s9-eq .block-tag');
  const fieldPalette = page.getByRole('dialog', { name: 'Adicionar bloco' });
  /** Taps "Disjuntor MT" in the open palette and returns the TAG it proposed, which the new sheet carries. */
  const addDisjuntor = async (where: string, colunaName: string): Promise<string> => {
    await expect(fieldPalette.locator('.palette-where')).toHaveText(`Em: ${where}`);
    const item = fieldPalette.getByRole('button', { name: /Disjuntor MT/ });
    const tag = (await item.locator('.pi-meta').innerText()).trim();
    expect(tag).toMatch(/^DJ-C0\d(-\d+)?$/);
    await item.click();
    await expect(fieldPalette).toBeHidden();
    await expect(toast(page)).toContainText(`${tag} criada na ${colunaName}`);
    return tag;
  };
  await treePainel.getByRole('button', { name: 'Adicionar coluna' }).click();
  await expect(toast(page)).toContainText('Coluna 1 adicionada');
  await menuOf(page, COLUNA_1).click();
  await page.getByRole('menuitem', { name: 'Adicionar bloco' }).click();
  const tag1 = await addDisjuntor(`${PAINEL_LOCAL} › Painel 1 › Coluna 1`, 'Coluna 1');
  await menuOf(page, PAINEL).click();
  await page.getByRole('menuitem', { name: 'Adicionar coluna' }).click();
  await expect(toast(page)).toContainText('Coluna 2 adicionada');
  await treePainel.getByRole('button', { name: `Adicionar bloco em ${PAINEL}`, exact: true }).click();
  const tag2 = await addDisjuntor(`${PAINEL_LOCAL} › Painel 1 › Coluna 2`, 'Coluna 2');
  expect(tag2).not.toBe(tag1);

  // What stands before any removal: the local's own five sheets, the painel with its two colunas, each sheet with its TAG.
  await expandLocation(page, COLUNA_1);
  await expandLocation(page, COLUNA_2);
  await expect(directTags).toHaveCount(5);
  await expect(painelColunas.locator(':scope > .s9-col .s9-col-name')).toHaveText(['Coluna 1', 'Coluna 2']);
  await expect(colunaTags('Coluna 1')).toHaveText([tag1]);
  await expect(colunaTags('Coluna 2')).toHaveText([tag2]);
  await expect(painelMeta).toHaveText('Painel · 2 colunas');
  await expect(painelCounter).toHaveText('0 de 2');
  await expect(localCounter(PAINEL_LOCAL)).toHaveText('0 de 7');
  await expect(total(96)).toBeVisible();
  const painelId = (await treePainel.getAttribute('data-location-id'))!;
  const colunaIds = await painelColunas.evaluateAll((rows) => rows.map((row) => row.getAttribute('data-location-id')));
  expect(colunaIds).toEqual([expect.any(String), expect.any(String)]);
  const coluna1Id = colunaIds[0]!;
  const coluna2Id = colunaIds[1]!;
  const block1Id = (await eqRow(page, tag1).getAttribute('data-block-id'))!;
  const block2Id = (await eqRow(page, tag2).getAttribute('data-block-id'))!;
  const built = await deviceTreeRows(page);
  const equipment1Id = (built.get(`block/${block1Id}`) as BlockRow).equipment_id!;
  const equipment2Id = (built.get(`block/${block2Id}`) as BlockRow).equipment_id!;
  expect((built.get(`block/${block1Id}`) as BlockRow).location_id).toBe(coluna1Id);
  expect((built.get(`block/${block2Id}`) as BlockRow).location_id).toBe(coluna2Id);
  expect((built.get(`equipment/${equipment1Id}`) as EquipmentRow).tag).toBe(tag1);
  expect((built.get(`equipment/${equipment2Id}`) as EquipmentRow).tag).toBe(tag2);
  const painelKeys = [
    `location/${painelId}`,
    `location/${coluna1Id}`,
    `location/${coluna2Id}`,
    `block/${block1Id}`,
    `block/${block2Id}`,
    `equipment/${equipment1Id}`,
    `equipment/${equipment2Id}`,
  ];
  const coluna1Keys = [`location/${coluna1Id}`, `block/${block1Id}`, `equipment/${equipment1Id}`];
  const removedAtOf = async (keys: readonly string[]) => {
    const rows = await deviceTreeRows(page);
    return keys.map((key) => rows.get(key)!.removed_at);
  };

  // --- a coluna holding a sheet: the confirm names the count; one batch; "Desfazer" ---
  await menuOf(page, COLUNA_1).click();
  await page.getByRole('menuitem', { name: 'Remover', exact: true }).click();
  const confirmColuna = page.getByRole('dialog', { name: `Remover ${COLUNA_1}?`, exact: true });
  await expect(confirmColuna).toHaveAccessibleDescription(`A coluna e 1 ficha saem do relatório. ${RECOVERABLE}`);
  await expect(confirmColuna.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
  await confirmColuna.getByRole('button', { name: 'Remover coluna', exact: true }).click();
  await expect(confirmColuna).toBeHidden();
  await expect(toast(page)).toContainText('Coluna e suas fichas removidas — recuperável até a emissão');
  await expect(treeAnnouncer(page)).toHaveText(`${COLUNA_1} removida`);
  // The row and its sheet leave; the painel's and the local's counters close up.
  await expect(painelColunas.locator(':scope > .s9-col .s9-col-name')).toHaveText(['Coluna 2']);
  await expect(eqRow(page, tag1)).toHaveCount(0);
  await expect(painelMeta).toHaveText('Painel · 1 coluna');
  await expect(painelCounter).toHaveText('0 de 1');
  await expect(localCounter(PAINEL_LOCAL)).toHaveText('0 de 6');
  await expect(total(95)).toBeVisible();
  // The focus goes to the row now in its slot.
  await expect(page.getByRole('button', { name: new RegExp(`^(Expandir|Recolher) ${COLUNA_2}$`) })).toBeFocused();
  // One batch: the coluna, its sheet and the equipment the sheet frees, each a tombstone.
  const colunaBatch = await batchOf(page, `location/${coluna1Id}/removed_at`, 'remove');
  expect(colunaBatch.map((op) => [op.path, op.kind])).toEqual([
    [`location/${coluna1Id}/removed_at`, 'remove'],
    [`block/${block1Id}/removed_at`, 'remove'],
    [`equipment/${equipment1Id}/removed_at`, 'remove'],
  ]);
  const colunaRemovedAt = await removedAtOf(coluna1Keys);
  expect(colunaRemovedAt[0]).toEqual(expect.any(String));
  expect(new Set(colunaRemovedAt).size).toBe(1);
  // "Desfazer" brings the coluna, its sheet and its TAG back; the focus goes to the coluna's Overflow.
  await toast(page).getByRole('button', { name: 'Desfazer' }).click();
  await expect(painelColunas.locator(':scope > .s9-col .s9-col-name')).toHaveText(['Coluna 1', 'Coluna 2']);
  await expect(menuOf(page, COLUNA_1)).toBeFocused();
  await expandLocation(page, COLUNA_1);
  await expect(colunaTags('Coluna 1')).toHaveText([tag1]);
  await expect(painelCounter).toHaveText('0 de 2');
  await expect(localCounter(PAINEL_LOCAL)).toHaveText('0 de 7');
  await expect(total(96)).toBeVisible();
  expect(await removedAtOf(coluna1Keys)).toEqual([null, null, null]);

  // --- the painel: confirmed, gone, and still gone after a reload ---
  await menuOf(page, PAINEL).click();
  await page.getByRole('menuitem', { name: 'Remover', exact: true }).click();
  const confirmPainel = page.getByRole('dialog', { name: `Remover ${PAINEL}?`, exact: true });
  await expect(confirmPainel).toHaveAccessibleDescription(`O painel, 2 colunas e 2 fichas saem do relatório. ${RECOVERABLE}`);
  await confirmPainel.getByRole('button', { name: 'Remover painel', exact: true }).click();
  await expect(confirmPainel).toBeHidden();
  await expect(toast(page)).toContainText('Painel, suas colunas e fichas removidos — recuperável até a emissão');
  await expect(treeAnnouncer(page)).toHaveText(`${PAINEL} removido`);
  await expect(treePainel).toHaveCount(0);
  // One batch: the painel first, its colunas in tree order, their sheets, the equipment they free.
  const painelBatch = await batchOf(page, `location/${painelId}/removed_at`, 'remove');
  expect(painelBatch.map((op) => [op.path, op.kind])).toEqual(painelKeys.map((key) => [`${key}/removed_at`, 'remove']));
  const painelRemovedAt = await removedAtOf(painelKeys);
  expect(painelRemovedAt[0]).toEqual(expect.any(String));
  expect(new Set(painelRemovedAt).size).toBe(1);

  await page.reload();
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  await openSection9(page);
  await expandLocation(page, PAINEL_LOCAL);
  // The local shows its own five sheets and nothing else; its counter and the relatório's total exclude the painel's two.
  await expect(directTags).toHaveCount(5);
  await expect(local(page, PAINEL_LOCAL).locator('li.s9-painel')).toHaveCount(0);
  await expect(local(page, PAINEL_LOCAL).locator('li.s9-coluna')).toHaveCount(0);
  await expect(eqRow(page, tag1)).toHaveCount(0);
  await expect(eqRow(page, tag2)).toHaveCount(0);
  await expect(localCounter(PAINEL_LOCAL)).toHaveText('0 de 5');
  await expect(total(94)).toBeVisible();
  expect(await removedAtOf(painelKeys)).toEqual(painelRemovedAt);

  // --- "Restaurar ficha removida": the painel is one entry, and comes back whole ---
  await page.getByRole('button', { name: 'Mais opções do relatório' }).click();
  await page.getByRole('menuitem', { name: 'Restaurar ficha removida' }).click();
  const restore = page.getByRole('dialog', { name: 'Restaurar ficha removida' });
  const entries = restore.locator('.restore-list > li');
  // Its colunas and sheets are not listed one by one: they come back with it.
  await expect(entries).toHaveCount(1);
  await expect(entries).toHaveAttribute('data-location-id', painelId);
  await expect(entries.locator('.rr-primary')).toHaveText(PAINEL);
  await expect(entries.locator('.rr-secondary')).toHaveText('Painel · 2 colunas · 2 fichas');
  await restore.getByRole('button', { name: `Restaurar ${PAINEL} — Painel · 2 colunas · 2 fichas`, exact: true }).click();
  await expect(restore).toBeHidden();
  await expect(toast(page)).toContainText('Painel restaurado');
  await expect(treeAnnouncer(page)).toHaveText(`${PAINEL} restaurado`);
  await expect(menuOf(page, PAINEL)).toBeFocused();
  await expandLocation(page, PAINEL);
  await expect(painelColunas.locator(':scope > .s9-col .s9-col-name')).toHaveText(['Coluna 1', 'Coluna 2']);
  await expandLocation(page, COLUNA_1);
  await expandLocation(page, COLUNA_2);
  // The same sheets with the same TAGs as before.
  await expect(colunaTags('Coluna 1')).toHaveText([tag1]);
  await expect(colunaTags('Coluna 2')).toHaveText([tag2]);
  expect(await eqRow(page, tag1).getAttribute('data-block-id')).toBe(block1Id);
  expect(await eqRow(page, tag2).getAttribute('data-block-id')).toBe(block2Id);
  await expect(painelMeta).toHaveText('Painel · 2 colunas');
  await expect(painelCounter).toHaveText('0 de 2');
  await expect(localCounter(PAINEL_LOCAL)).toHaveText('0 de 7');
  await expect(total(96)).toBeVisible();
  expect(await removedAtOf(painelKeys)).toEqual(painelKeys.map(() => null));

  // --- a local: 1° Subsolo, with its seventeen colunas and every sheet under it ---
  const standing = await deviceTreeRows(page);
  const rowsOf = <T extends TreeRow>(entity: string) => [...standing].filter(([key]) => key.startsWith(`${entity}/`)).map(([, row]) => row as T);
  const otherLocal = rowsOf<LocationRow>('location').find((row) => row.relatorio_id === relatorioId && row.parent_id === null && row.name === OTHER_LOCAL)!;
  const otherColunas = rowsOf<LocationRow>('location').filter((row) => row.parent_id === otherLocal.id);
  expect(otherColunas.map((row) => [row.kind, row.removed_at])).toEqual(Array.from({ length: 17 }, () => ['coluna', null]));
  const otherLocationIds = [otherLocal.id, ...otherColunas.map((row) => row.id)];
  const otherBlocks = rowsOf<BlockRow>('block').filter((row) => row.location_id !== null && otherLocationIds.includes(row.location_id));
  expect(otherBlocks.every((row) => row.removed_at === null && row.equipment_id !== null)).toBe(true);
  const otherEquipmentIds = otherBlocks.map((row) => row.equipment_id!);
  expect(new Set(otherEquipmentIds).size).toBe(otherBlocks.length);
  // The standard template's own numbers: ten sheets on the local, thirty-nine in its colunas.
  const sheets = 49;
  expect(otherBlocks).toHaveLength(sheets);
  await expect(localCounter(OTHER_LOCAL)).toHaveText(`0 de ${sheets}`);
  const otherKeys = [...otherLocationIds.map((id) => `location/${id}`), ...otherBlocks.map((row) => `block/${row.id}`), ...otherEquipmentIds.map((id) => `equipment/${id}`)];

  await menuOf(page, OTHER_LOCAL).click();
  await page.getByRole('menuitem', { name: 'Remover', exact: true }).click();
  const confirmLocal = page.getByRole('dialog', { name: `Remover ${OTHER_LOCAL}?`, exact: true });
  await expect(confirmLocal).toHaveAccessibleDescription(`O local, 17 colunas e ${sheets} fichas saem do relatório. ${RECOVERABLE}`);
  await confirmLocal.getByRole('button', { name: 'Remover local', exact: true }).click();
  await expect(confirmLocal).toBeHidden();
  await expect(toast(page)).toContainText('Local, seus painéis e fichas removidos — recuperável até a emissão');
  await expect(treeAnnouncer(page)).toHaveText(`Local ${OTHER_LOCAL} removido`);
  await expect(local(page, OTHER_LOCAL)).toHaveCount(0);
  await expect(tree(page).locator(':scope > li.s9-local')).toHaveCount(5);
  await expect(total(96 - sheets)).toBeVisible();
  // One batch of tombstones: the local first, then its colunas, then every sheet, then every equipment they free.
  const localBatch = await batchOf(page, `location/${otherLocal.id}/removed_at`, 'remove');
  expect(localBatch.every((op) => op.kind === 'remove')).toBe(true);
  const localPaths = localBatch.map((op) => op.path);
  expect(localPaths[0]).toBe(`location/${otherLocal.id}/removed_at`);
  expect(localPaths.map((path) => path.split('/')[0])).toEqual([...otherLocationIds.map(() => 'location'), ...otherBlocks.map(() => 'block'), ...otherEquipmentIds.map(() => 'equipment')]);
  expect([...localPaths].sort()).toEqual(otherKeys.map((key) => `${key}/removed_at`).sort());

  // --- "Sincronizar agora": the badge settles, and the server holds what the device holds ---
  await syncNowAndReturn(page);
  const device = await deviceTreeRows(page);
  const server = await serverTreeRows([...otherKeys, ...painelKeys].map((key) => key.split('/')[1]!));
  const held = (rows: ReadonlyMap<string, unknown>, keys: readonly string[]) => Object.fromEntries(keys.map((key) => [key, rows.get(key)]));
  const removedAts = (rows: ReadonlyMap<string, unknown>, keys: readonly string[]) => [...new Set(keys.map((key) => (rows.get(key) as TreeRow | undefined)?.removed_at))];
  // The removed local, its colunas, their sheets and equipment: one `removed_at`, the removal's own, on both sides.
  const localRemovedAt = removedAts(device, otherKeys);
  expect(localRemovedAt).toEqual([expect.any(String)]);
  expect(removedAts(server, otherKeys)).toEqual(localRemovedAt);
  expect(held(server, otherKeys)).toEqual(held(device, otherKeys));
  // The restored painel, its colunas, sheets and equipment: live on both sides, with the TAGs they had.
  expect(removedAts(device, painelKeys)).toEqual([null]);
  expect(removedAts(server, painelKeys)).toEqual([null]);
  expect(held(server, painelKeys)).toEqual(held(device, painelKeys));
  expect([equipment1Id, equipment2Id].map((id) => (server.get(`equipment/${id}`) as EquipmentRow).tag)).toEqual([tag1, tag2]);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

/** Opens "Restaurar ficha removida" from the relatório's Overflow and returns the dialog. */
async function openRestore(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Mais opções do relatório' }).click();
  await page.getByRole('menuitem', { name: 'Restaurar ficha removida' }).click();
  const restore = page.getByRole('dialog', { name: 'Restaurar ficha removida' });
  await expect(restore).toBeVisible();
  return restore;
}

test('@p1 14.2-E2E-005 Epic 14 QA Q-6: a local holding only its site work (answers, a photo, a point) asks before it leaves; the sentence and the restore entry name them', async ({ page }) => {
  test.setTimeout(240_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  await signIn(page, account.email);
  const { relatorioId } = await pushNewRelatorio(page, account, database, { emCampo: true });
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  await openSection9(page);

  // A local with no equipment, its 19 site items answered on its Verificações surface.
  const NAME = 'Sala só de verificações';
  await addLocal(page, { funcao: 'Distribuição', name: NAME });
  await local(page, NAME).locator(':scope > .s9-loc-row .s9-loc-body .s9-verif').click();
  await expect(page.locator('.sheet-header .sheet-title')).toHaveText(`Verificações do local — ${NAME}`, { timeout: 30_000 });
  await page.getByRole('group', { name: 'Ações em lote das verificações do local' }).getByRole('button', { name: 'Marcar os restantes como Conforme' }).click();
  await expect(page.getByTestId('local-progress')).toHaveText('19 de 19');
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Ver árvore' }).click();
  await expect(tree(page)).toBeVisible({ timeout: 30_000 });

  // A photo of one of its site items and the point made from it, written on another device and pulled.
  const localId = [...(await deviceTreeRows(page))].map(([, row]) => row as LocationRow).find((row) => row.relatorio_id === relatorioId && row.name === NAME)!.id;
  const itemKey = SITE_ITEM_KEYS[0];
  const photoId = newId();
  const scope = { relatorioId };
  const photo = {
    id: photoId,
    company_id: account.companyId,
    relatorio_id: relatorioId,
    kind: 'photo',
    sha256: 'e'.repeat(64),
    mime: 'image/jpeg',
    size: 1000,
    uploaded_at: null,
    variants: null,
    removed_at: null,
    captured_at: '2026-09-07T12:00:00.000Z',
    tz_offset: -180,
    coords: null,
    local_seq: 1,
    block_id: null,
    item_key: itemKey,
    location_id: localId,
    caption: null,
    reading_kind: null,
    reading_target: null,
    reading_status: 'none',
  };
  const point = newPointRow({ id: newId(), relatorioId, text: 'Extintor vencido', equipmentId: null, origin: 'manual', action: 'Trocar', locationId: localId }, []);
  await pushDrafts(page, database, [officeDraft(account, scope, `file/${photoId}`, photo, 'create'), officeDraft(account, scope, `point/${point.id}`, point, 'create')]);
  await syncNowAndReturn(page);
  await expect.poll(async () => (await entities<{ id: string }>(page)).filter((record) => record.id === photoId || record.id === point.id).length, { timeout: 30_000 }).toBe(2);
  await openSection9(page);

  // "Remover" asks first now, and names what leaves with the local.
  await menuOf(page, NAME).click();
  await page.getByRole('menuitem', { name: 'Remover', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: `Remover ${NAME}?`, exact: true });
  await expect(confirm).toHaveAccessibleDescription(`O local, 19 respostas das verificações, 1 foto e 1 ponto de atenção saem do relatório. ${RECOVERABLE}`);
  await expect(confirm.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
  await confirm.getByRole('button', { name: 'Remover local', exact: true }).click();
  await expect(confirm).toBeHidden();
  await expect(local(page, NAME)).toHaveCount(0);

  // The restore entry says what comes back.
  const restore = await openRestore(page);
  const entry = restore.locator('.restore-list > li').filter({ has: page.locator('.rr-primary', { hasText: NAME }) });
  const detail = 'Local · 19 respostas das verificações · 1 foto · 1 ponto de atenção';
  await expect(entry.locator('.rr-secondary')).toHaveText(detail);
  await restore.getByRole('button', { name: `Restaurar ${NAME} — ${detail}`, exact: true }).click();
  await expect(restore).toBeHidden();
  await expect(local(page, NAME).locator(':scope > .s9-loc-row .s9-loc-body .s9-verif')).toHaveText('Verificações do local · 19 de 19');
});

test('@p1 14.2-E2E-006 Epic 14 QA ledger (h): a sheet another device created in a local removed before the newest revision is its own restore entry, and restoring it brings back only that local', async ({ page }) => {
  test.setTimeout(240_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  await signIn(page, account.email);
  const { relatorioId, projectId } = await pushNewRelatorio(page, account, database, { emCampo: true });
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  await waitForCompanyPull(page, database);
  await openSection9(page);

  // This device removes Geradores (its own sheet goes with it) and syncs.
  const GERADORES = 'Geradores';
  const rows = [...(await deviceTreeRows(page))];
  const geradores = rows.filter(([key]) => key.startsWith('location/')).map(([, row]) => row as LocationRow).find((row) => row.relatorio_id === relatorioId && row.parent_id === null && row.name === GERADORES)!;
  const ownSheets = rows.filter(([key]) => key.startsWith('block/')).map(([, row]) => row as BlockRow).filter((row) => row.location_id === geradores.id);
  expect(ownSheets.length).toBeGreaterThan(0);
  await menuOf(page, GERADORES).click();
  await page.getByRole('menuitem', { name: 'Remover', exact: true }).click();
  await page.getByRole('dialog', { name: `Remover ${GERADORES}?`, exact: true }).getByRole('button', { name: 'Remover local', exact: true }).click();
  await expect(local(page, GERADORES)).toHaveCount(0);
  await syncNowAndReturn(page);

  // A revision is issued after the removal: the local's own entry is cut from the list.
  await pushRevision(account.companyId, relatorioId, { number: 1, createdBy: account.userId, createdAt: new Date(Date.now() + 1_000) });

  // A second device that had not seen the removal pushes a sheet it created on Geradores.
  const created = newEquipmentBlock({
    blockId: newId(),
    equipmentId: newId(),
    relatorioId,
    projectId,
    locationId: geradores.id,
    type: 'tc',
    tag: 'TC-GER-B',
    seedVersion: SEED_VERSION,
    orderKey: 'z0',
  });
  await pushDrafts(page, database, [
    officeDraft(account, { projectId }, `equipment/${created.equipment.id}`, created.equipment, 'create'),
    officeDraft(account, { relatorioId }, `block/${created.block.id}`, created.block, 'create'),
  ]);
  await syncNowAndReturn(page);
  await openSection9(page);
  await expect(local(page, GERADORES)).toHaveCount(0);

  // The stranded sheet is its own entry, naming where it is and what its restore brings back.
  const restore = await openRestore(page);
  const label = 'TC-GER-B — Geradores · restaura Geradores';
  await expect(restore.getByRole('button', { name: `Restaurar ${label}`, exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(restore.locator('.restore-list > li').filter({ has: page.locator('.rr-primary', { hasText: GERADORES }) })).toHaveCount(0);
  await restore.getByRole('button', { name: `Restaurar ${label}`, exact: true }).click();
  await expect(restore).toBeHidden();

  // Geradores is back with that sheet alone: the sheets the removal tombstoned stay removed.
  await expandLocation(page, GERADORES);
  await expect(local(page, GERADORES).locator('li.s9-eq .block-tag')).toHaveText(['TC-GER-B']);
  const after = await deviceTreeRows(page);
  expect((after.get(`location/${geradores.id}`) as LocationRow).removed_at).toBeNull();
  for (const sheet of ownSheets) expect((after.get(`block/${sheet.id}`) as BlockRow).removed_at).toEqual(expect.any(String));
});
