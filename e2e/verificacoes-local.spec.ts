import { photoToken, SEED_VERSION, siteChecklistOf, siteItems, type BlockRow, type LocationRow, type OpDraft, type PointRow } from '@app/domain';
import type { BrowserContext, Page, Route } from '@playwright/test';
import { paragraphText, readZipEntries } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { escapeDialog } from './support/dialogs.ts';
import { downloadBytes, downloadFrom } from './support/download.ts';
import { addLocal } from './support/local.ts';
import { deviceDatabaseName, expect, horizontalOverflow, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { expectCameraOpen, shoot } from './support/photos.ts';
import { serverRow } from './support/reading-ops.ts';
import { confirmIssue, createProjectFromHome, createRelatorio, setParecer } from './support/relatorio-flow.ts';
import { emCampoDraft, newRelatorioDrafts, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNowAndReturn } from './support/sync.ts';
import { expandLocation } from './support/tree.ts';

/*
 * 14.3/14.4-E2E. "Verificações do local", driven as a person would: a relatório born from the
 * standard template (the current seed, its site list read from the kernel) is opened at its local's tree row, every site item is
 * answered offline (a chip, an observation, a photo, the bulk action and its undo, a point of
 * attention from the NC item), read back after a reload and synced; then the generated DOCX is
 * read from its own headings: VERIFICAÇÕES DO LOCAL once per local right after AMBIENTE DE
 * ENSAIO, the site photo under its local only (Story 17.1: never in section 7) and the point
 * in section 8.
 *
 * 14.3-E2E-001 and 14.3-E2E-002 generate through the one queue and LibreOffice of the api, so
 * the file is in the serial group. This project blocks the service worker (no shell cache), so
 * the reload of 14.3-E2E-001 runs with every api request refused, which keeps the outbox as
 * offline does; the reload truly offline is `verificacoes-local.durability.spec.ts`.
 * E14-CO-B-E2E-001 counts animation frames against the camera's focus watch, which the serial
 * group keeps off a shared CPU too. Each test resets this worker's own Empresa B (E6-Q7).
 */

const SAO_PAULO = { latitude: -23.5505, longitude: -46.6333 };

test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['camera', 'geolocation'],
  geolocation: SAO_PAULO,
});

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

interface OutboxRow {
  op_id: string;
  kind: string;
  path: string;
  value: unknown;
  batch_id: string | null;
  status: string;
  relatorio_id: string | null;
}
interface EntityRecord<T> {
  entity: string;
  id: string;
  row: T;
}
type Local = Extract<LocationRow, { kind: 'cabine' }>;
interface PhotoRow {
  id: string;
  kind: string;
  relatorio_id: string;
  block_id: string | null;
  item_key: string | null;
  location_id?: string | null;
  caption: string | null;
  reading_kind: string | null;
  uploaded_at: string | null;
  removed_at: string | null;
}

const ENEL = 'Cubículo Enel';
const EMPTY_LOCAL = 'Sala dos painéis';
const LUVAS = 'luvas_isolantes_compativeis_com_a_tensao_com_ensaio_dieletrico_valido';
const TAPETE = 'tapete_ou_estrado_isolante';
const BACIA = 'bacia_de_contencao_de_oleo';
const EMERGENCIA = 'iluminacao_de_emergencia_autonomia_minima_de_2_h';
const CAPTION = 'Verificação de iluminação de emergência (autonomia mínima de 2 h) do Cubículo Enel';
const NC_PHRASE = 'Autonomia abaixo de 2 h';
const NA_NOTE = 'Sem equipamento a óleo no local';
const POINT_TEXT = 'Luminária de emergência inoperante';
const POINT_ACTION = 'Substituir as baterias';
const SITE_TITLE = 'VERIFICAÇÕES DO LOCAL';
const GROUPS = ['SEGURANÇA E EPC NO LOCAL', 'COMBATE A INCÊNDIO', 'ILUMINAÇÃO', 'ATERRAMENTO', 'SINALIZAÇÃO E DOCUMENTAÇÃO', 'AMBIENTE'];
/** The site list of a relatório born from the standard template: its seed version's (21 items on v9, Story 15.3), read from the kernel. */
const SITE = siteItems(SEED_VERSION);
const SITE_ITEM_KEYS = SITE.map((item) => item.key);
const N = SITE.length;
/** The items per group, in group order. */
const GROUP_SIZES = siteChecklistOf(SEED_VERSION)!.groups.map((group) => group.items.length);
/** The group rows of the printed table (`apps/api/src/jobs/generate/sections/section-9.ts` `GROUP_ROW_FILL`, the print mock's `.pt-group`). */
const GROUP_FILL = 'F0F0F0';
const MARK_SENT = 'Marcar como enviado ao cliente';
/** The job's own time: flush, queue pick-up, two LibreOffice passes. */
const JOB_TIMEOUT = 150_000;
const NOT_FOUND = 'Verificações do local não encontradas neste relatório.';
const NC_WITHOUT_POINT = 'Verificações do local com NC sem ponto de atenção: Cubículo Enel';

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
/** Not acknowledged by the server yet: waiting to be pushed, or pushed with no answer. */
const unsynced = (op: OutboxRow) => op.status === 'pending' || op.status === 'sent';
const entities = <T,>(page: Page) => readStore<EntityRecord<T>>(page, database, 'entities');
const toast = (page: Page) => page.getByTestId('toast');
const sumario = (page: Page) => page.getByRole('list', { name: 'Sumário do relatório' });
const tree = (page: Page) => page.getByRole('list', { name: 'Locais do relatório' });
const local = (page: Page, name: string) => tree(page).locator(':scope > li.s9-local').filter({ has: page.locator(':scope > .s9-loc-row .s9-loc-name', { hasText: name }) });
// Story 15.2 (the 15.1 mocks changed the markup, Bruno's answer 5): the local's "Verificações do local" is a card, the first
// under its open local (`ul.s9-site`), its progress "N de 19" in `.s9-site-count`; it was a button in the local's row.
const siteButton = (page: Page, name: string) => local(page, name).locator(':scope > ul.s9-site .s9-verif');
const siteCount = (page: Page, name: string) => siteButton(page, name).locator('.s9-site-count');
/** The local's site card, its local expanded first (the card is drawn only under an open local). */
async function siteCard(page: Page, name: string) {
  await expandLocation(page, name);
  return siteButton(page, name);
}
const row = (page: Page, itemKey: string) => page.locator(`li.checklist-row[data-item-key="${itemKey}"]`);
const seg = (page: Page, itemKey: string, name: 'Conforme' | 'Não conforme' | 'Não se aplica') => row(page, itemKey).getByRole('radio', { name, exact: true });
const progress = (page: Page) => page.getByTestId('local-progress');
const title = (page: Page) => page.locator('.sheet-header .sheet-title');
const bulk = (page: Page) => page.getByRole('group', { name: 'Ações em lote das verificações do local' }).getByRole('button', { name: 'Marcar os restantes como Conforme' });
const headerPill = (page: Page) => page.locator('.sheet-meta .status-pill');
const banner = (page: Page) => page.locator('.banner-slot .banner');
const bar = (page: Page) => page.locator('.sticky-action-bar');
const exportDialog = (page: Page) => page.getByRole('dialog', { name: 'Gerar relatório' });
const resultPath = (locationId: string, itemKey: string) => `location/${locationId}/checklist/${itemKey}/result`;
const observationPath = (locationId: string, itemKey: string) => `location/${locationId}/checklist/${itemKey}/observation`;
const surfaceUrl = (relatorioId: string, locationId: string) => `/relatorio/${relatorioId}/local/${locationId}/verificacoes`;

async function openSumario(page: Page, relatorioId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(sumario(page).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
}

async function openSection9(page: Page): Promise<void> {
  const chevron = page.getByRole('button', { name: 'Expandir ou recolher a seção 9' });
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expect(tree(page)).toBeVisible();
}

/** The live root locals of the relatório on this device, in tree order. */
async function locals(page: Page, relatorioId: string): Promise<Local[]> {
  return (await entities<LocationRow>(page))
    .filter((record) => record.entity === 'location')
    .map((record) => record.row)
    .filter((location): location is Local => location.relatorio_id === relatorioId && location.kind === 'cabine' && location.parent_id === null && location.removed_at === null)
    .sort((a, b) => (a.order_key < b.order_key ? -1 : a.order_key > b.order_key ? 1 : 0));
}

async function photosOf(page: Page, relatorioId: string): Promise<PhotoRow[]> {
  return (await entities<PhotoRow>(page)).filter((record) => record.entity === 'file' && record.row.kind === 'photo' && record.row.relatorio_id === relatorioId).map((record) => record.row);
}

async function pointsOf(page: Page, relatorioId: string): Promise<PointRow[]> {
  return (await entities<PointRow>(page)).filter((record) => record.entity === 'point' && record.row.relatorio_id === relatorioId).map((record) => record.row);
}

const isApi = (url: URL) => url.pathname.startsWith('/api/');
const refuse = (route: Route) => route.abort('internetdisconnected');
const NO_NETWORK_FLAG = 'e2e:no-network';

/**
 * A reload with the network gone, on a project that has no service worker to serve the shell
 * (`ai-features-off.spec.ts`'s way): the document still loads, every api request is refused and
 * the page reads as offline. Returns what puts the network back.
 */
async function reloadWithoutNetwork(page: Page, context: BrowserContext): Promise<() => Promise<void>> {
  await page.evaluate((flag) => window.localStorage.setItem(flag, '1'), NO_NETWORK_FLAG);
  await page.route(isApi, refuse);
  await context.setOffline(false);
  await page.reload();
  return async () => {
    await page.evaluate((flag) => window.localStorage.removeItem(flag), NO_NETWORK_FLAG);
    await page.unroute(isApi, refuse);
    await page.reload();
  };
}

// --- reading the DOCX ---------------------------------------------------------------------

const paragraphsOf = (xml: string): string[] => [...xml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>|<w:p(?:\s[^>]*)?\/>/g)].map((m) => paragraphText(m[0]));
const tablesOf = (xml: string): string[][][] =>
  [...xml.matchAll(/<w:tbl>([\s\S]*?)<\/w:tbl>/g)].map((table) =>
    [...table[1]!.matchAll(/<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/g)].map((tr) => [...tr[1]!.matchAll(/<w:tc(?:\s[^>]*)?>([\s\S]*?)<\/w:tc>/g)].map((cell) => paragraphsOf(cell[1]!).join('\n'))),
  );

/** The body XML between section `n`'s Heading 1 and the next Heading 1 (E7-A6: read from the heading, never by position). */
function sectionXml(document: string, n: number): string {
  const headings = [...document.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].filter((m) => m[0].includes('w:val="Heading1"'));
  const at = headings.findIndex((m) => paragraphText(m[0]).startsWith(`${n} `));
  expect(at, `the document has a section ${n}`).toBeGreaterThanOrEqual(0);
  return document.slice(headings[at]!.index!, headings[at + 1]?.index ?? document.length);
}

/** Section 9 cut at its Heading 2 paragraphs: each subsection's heading text and its XML up to the next one. */
function subsections(nine: string): { heading: string; xml: string }[] {
  const headings = [...nine.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].filter((m) => m[0].includes('w:val="Heading2"'));
  return headings.map((m, i) => ({ heading: paragraphText(m[0]), xml: nine.slice(m.index!, headings[i + 1]?.index ?? nine.length) }));
}

/** The item rows of a printed site table (five cells), without its header row. */
const itemRows = (table: string[][]): string[][] => table.filter((cells) => cells.length === 5).slice(1);

/** Presses the dialog's "Gerar relatório", answers the blank-fields question when it is asked, and waits for revision `n`. */
async function generateRevision(page: Page, n: number): Promise<void> {
  const modal = exportDialog(page);
  await expect(modal).toBeVisible();
  const again = modal.getByRole('button', { name: 'Gerar de novo' });
  const generate = modal.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' });
  await expect(again.or(generate).first()).toBeVisible({ timeout: 30_000 });
  if (await again.isVisible()) await again.click();
  await expect(generate).toBeEnabled({ timeout: 30_000 });
  await generate.click();
  const question = modal.getByRole('group', { name: /^Gerar com / });
  const ready = modal.getByRole('heading', { level: 2, name: `Revisão ${n} pronta` });
  await expect(question.or(ready).or(modal.locator('.gen-progress')).first()).toBeVisible({ timeout: 30_000 });
  if (await question.isVisible()) await question.getByRole('button', { name: 'Gerar mesmo assim' }).click();
  await expect(toast(page)).toHaveText(`Revisão ${n} pronta — DOCX e PDF`, { timeout: JOB_TIMEOUT });
  await expect(ready).toBeVisible();
}

async function downloadDocx(page: Page, n: number): Promise<string> {
  const download = await downloadFrom(page, () => exportDialog(page).getByRole('button', { name: 'DOCX — abrir no Word' }).click());
  expect(download.suggestedFilename()).toBe(`relatorio-rev-${n}.docx`);
  return readZipEntries(await downloadBytes(download)).get('word/document.xml')!.toString('utf8');
}

// --- a small relatório pushed from the office ----------------------------------------------

/**
 * The standard relatório cut down to one local, Cubículo Enel, with no equipment (its section
 * blocks kept), Em campo: what the tests that are not about the sheets need, generated in
 * seconds. `seedVersion` rewrites the version the relatório and its blocks are born on.
 */
function smallRelatorio(options: { seedVersion?: string; keepSheets?: boolean } = {}): { relatorioId: string; enelId: string; colunaId: string | null; firstSheetId: string | null; drafts: OpDraft[] } {
  const built = newRelatorioDrafts(account);
  const created = <T,>(prefix: string) => built.drafts.filter((draft) => draft.kind === 'create' && draft.path.startsWith(prefix)).map((draft) => draft.value as unknown as T);
  const all = created<LocationRow>('location/');
  const enel = all.find((location) => location.kind === 'cabine' && location.name === ENEL)!;
  const keepSheets = options.keepSheets === true;
  const coluna = all.find((location) => location.kind === 'coluna') ?? null;
  const drafts = built.drafts
    .filter((draft) => {
      if (keepSheets || draft.kind !== 'create') return true;
      if (draft.path.startsWith('location/')) return (draft.value as unknown as LocationRow).id === enel.id;
      if (draft.path.startsWith('block/')) return (draft.value as unknown as BlockRow).location_id === null;
      return !draft.path.startsWith('equipment/');
    })
    .map((draft) => {
      const value = draft.value as Record<string, unknown> | null;
      if (options.seedVersion === undefined || value === null || typeof value !== 'object' || !('seed_version' in value)) return draft;
      return { ...draft, value: { ...value, seed_version: options.seedVersion } } as OpDraft;
    });
  const firstSheet = created<BlockRow>('block/').find((block) => block.location_id === enel.id) ?? null;
  return { relatorioId: built.relatorioId, enelId: enel.id, colunaId: coluna?.id ?? null, firstSheetId: keepSheets ? (firstSheet?.id ?? null) : null, drafts: [...drafts, emCampoDraft(account, built.relatorioId)] };
}

async function setUp(page: Page, width: number, options: { seedVersion?: string; keepSheets?: boolean } = {}) {
  await resetEmpresaB(account, { standard: true });
  await signIn(page, account.email);
  const built = smallRelatorio(options);
  await pushDrafts(page, database, built.drafts);
  await page.setViewportSize({ width, height: width < 768 ? 844 : 1024 });
  await openSumario(page, built.relatorioId);
  return built;
}

async function openSurface(page: Page, relatorioId: string, locationId: string): Promise<void> {
  await page.goto(surfaceUrl(relatorioId, locationId));
  await expect(title(page)).toBeVisible({ timeout: 30_000 });
}

// --- 14.3-E2E-001 -------------------------------------------------------------------------

test('@p0 14.3-E2E-001 at 768 px: a relatório on the current seed, the surface opened from the local\'s tree row, every site item answered offline (chip, observation, photo, bulk action and its undo, a point from the NC item), read back after a reload and synced; the DOCX prints the table once per local right after AMBIENTE DE ENSAIO, the photo under its local only (never in section 7) and the point in section 8', async ({
  page,
  context,
}) => {
  test.setTimeout(900_000);
  await page.addInitScript((flag) => {
    if (window.localStorage.getItem(flag) === '1') Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
  }, NO_NETWORK_FLAG);
  await resetEmpresaB(account, { standard: true });
  await signIn(page, account.email);
  await expect(page.locator('.shortcut-sub', { hasText: '1 template' })).toBeVisible({ timeout: 30_000 });
  await createProjectFromHome(page);
  const relatorioId = await createRelatorio(page);
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(headerPill(page)).toHaveText('Rascunho');
  // The Rascunho sentence of a relatório with a site checklist names it.
  await expect(page.getByTestId('status-next-step')).toHaveText(/ Preencher uma ficha ou as verificações do local passa o relatório a Em campo\.$/);

  // A second local with no equipment (structure: the relatório stays Rascunho).
  await openSection9(page);
  await addLocal(page, { funcao: 'Distribuição', name: EMPTY_LOCAL });
  await expect(local(page, EMPTY_LOCAL)).toHaveCount(1);
  await expect(headerPill(page)).toHaveText('Rascunho');
  const before = await locals(page, relatorioId);
  // The standard template's six locals, then the new one.
  const names = [ENEL, '1° Subsolo', 'Oxigênio', 'Cobertura A', 'Cobertura B', 'Geradores', EMPTY_LOCAL];
  expect(before.map((location) => location.name)).toEqual(names);
  const enelId = before[0]!.id;
  const emptyId = before.at(-1)!.id;
  // The creation and the new local reach the server before the field work starts.
  await syncNowAndReturn(page);
  await openSection9(page);

  // Every local's row shows its counter; the row opens the surface.
  for (const location of before) {
    await expect(await siteCard(page, location.name)).toHaveAccessibleName(`Verificações do local · 0 de ${N} — ${location.name}`);
    await expect(siteCount(page, location.name)).toHaveText(`0 de ${N}`);
  }
  await expect(siteButton(page, ENEL)).toHaveAccessibleName(`Verificações do local · 0 de ${N} — Cubículo Enel`);
  await expect(siteButton(page, ENEL).locator('.s9-state')).toHaveText('○ Vazia');
  await siteButton(page, ENEL).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}/local/${enelId}/verificacoes$`));
  await expect(title(page)).toHaveText('Verificações do local — Cubículo Enel');
  await expect(page.locator('.app-bar-title')).toHaveText('Verificações do local');
  await expect(page.locator('.sheet-header .sheet-summary')).toHaveText('Uma vez por local, vale para todos os equipamentos dele.');
  await expect(progress(page)).toHaveText(`0 de ${N}`);
  await expect(progress(page)).toHaveAttribute('data-state', 'pending');
  await expect(page.locator('.content > section.vl-group h3.vl-group-title')).toHaveText(['Segurança e EPC no local', 'Combate a incêndio', 'Iluminação', 'Aterramento', 'Sinalização e documentação', 'Ambiente']);
  await expect(page.locator('.content > section.vl-group .section-head .btn-reason')).toHaveText(GROUP_SIZES.map((size) => `0 de ${size}`));
  await expect(page.locator('li.checklist-row')).toHaveCount(N);
  expect(await page.locator('li.checklist-row').evaluateAll((rows) => rows.map((element) => (element as HTMLElement).dataset.itemKey))).toEqual(SITE_ITEM_KEYS);
  await expect(page.locator('.vl-intro .checklist-legend')).toHaveText('C Conforme · NC Não conforme · NA Não se aplica');

  // --- offline from here ---
  await context.setOffline(true);

  // The first answer carries the Em campo status op in its own batch, and says so.
  await seg(page, LUVAS, 'Conforme').click();
  await expect(seg(page, LUVAS, 'Conforme')).toHaveAttribute('aria-checked', 'true');
  await expect(toast(page)).toContainText('Relatório em campo', { timeout: 15_000 });
  await expect(progress(page)).toHaveText(`1 de ${N}`);
  await expect(row(page, LUVAS).locator('xpath=ancestor::section[1]').locator('.section-head .btn-reason')).toHaveText('1 de 7');
  {
    const ops = await outbox(page);
    const answer = ops.find((op) => op.path === resultPath(enelId, LUVAS));
    const status = ops.find((op) => op.path === 'relatorio/status' && op.relatorio_id === relatorioId);
    expect(answer).toMatchObject({ kind: 'put', value: 'C' });
    expect(status).toMatchObject({ value: 'em_campo' });
    expect(answer!.batch_id).not.toBeNull();
    expect(status!.batch_id).toBe(answer!.batch_id);
  }
  await expect(page.getByTestId('local-filled-by')).toHaveText(new RegExp(`^Preenchido por ${account.name} · \\d{2}/\\d{2} \\d{2}:\\d{2}$`));

  // NA with an observation, from the row's Overflow.
  await seg(page, BACIA, 'Não se aplica').click();
  await expect(seg(page, BACIA, 'Não se aplica')).toHaveAttribute('aria-checked', 'true');
  await row(page, BACIA).getByRole('button', { name: 'Mais opções de Bacia de contenção de óleo', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Observação' }).click();
  const naField = row(page, BACIA).getByRole('textbox', { name: 'Observação do item 9' });
  await naField.click();
  await naField.fill(NA_NOTE);
  await page.keyboard.press('Tab');
  await expect.poll(async () => (await outbox(page)).filter((op) => op.path === observationPath(enelId, BACIA)).map((op) => op.value)).toEqual([NA_NOTE]);
  // Nothing on an NA row asks for a photo or a point.
  await expect(row(page, BACIA).getByRole('button', { name: 'Adicionar foto' })).toHaveCount(0);

  // NC: the seed's chips, the required observation written by a chip, a photo, then the point.
  const nc = row(page, EMERGENCIA);
  await seg(page, EMERGENCIA, 'Não conforme').click();
  await expect(seg(page, EMERGENCIA, 'Não conforme')).toHaveAttribute('aria-checked', 'true');
  const chips = nc.getByRole('group', { name: 'Observações sugeridas do item 11' });
  await expect(chips.getByRole('button')).toHaveText(['Luminária de emergência inoperante', NC_PHRASE, 'Sem iluminação de emergência']);
  const ncField = nc.getByRole('textbox', { name: 'Observação do item 11' });
  await expect(ncField).toHaveAttribute('aria-invalid', 'true');
  await expect(nc.locator('.helper[data-tone="red"]')).toHaveText('Obrigatória em item não conforme');
  await chips.getByRole('button', { name: NC_PHRASE }).click();
  await expect(ncField).toHaveValue(NC_PHRASE);
  // The chip hands the caret back to the field; leaving it commits the observation.
  await expect(ncField).toBeFocused();
  await page.keyboard.press('Tab');
  await expect.poll(async () => (await outbox(page)).filter((op) => op.path === observationPath(enelId, EMERGENCIA)).map((op) => op.value)).toEqual([NC_PHRASE]);
  await expect(ncField).not.toHaveAttribute('aria-invalid', 'true');

  const addPhoto = nc.getByRole('button', { name: 'Adicionar foto' });
  await expect(nc.locator('.row-wrap .btn-reason')).toHaveText('Recomendada para não conforme');
  await addPhoto.click();
  const camera = await expectCameraOpen(page);
  await expect(camera.locator('.cam-context')).toHaveText(`Contexto: ${CAPTION}`);
  await shoot(page, 1);
  await camera.getByRole('button', { name: 'Concluir fotos' }).click();
  await expect(page.getByRole('dialog', { name: 'Câmera' })).toHaveCount(0);
  const tiles = nc.locator('.photo-list .photo-row');
  await expect(tiles).toHaveCount(1);
  await expect(tiles.locator('.photo-meta')).toHaveText(CAPTION);
  await expect(tiles.locator('.upload-pill')).toHaveText('Aguardando envio');
  await expect.poll(async () => (await photosOf(page, relatorioId)).length, { timeout: 15_000 }).toBe(1);
  const [photo] = await photosOf(page, relatorioId);
  expect(photo).toMatchObject({ block_id: null, item_key: EMERGENCIA, location_id: enelId, caption: CAPTION, reading_kind: null, uploaded_at: null });
  const photoId = photo!.id;

  // "Marcar os restantes como Conforme": N - 3 puts in one batch; its "Desfazer" writes as many inverses in a new one; then again.
  const idsBefore = new Set((await outbox(page)).map((op) => op.op_id));
  const since = async (known: ReadonlySet<string>) => (await outbox(page)).filter((op) => !known.has(op.op_id));
  const byPath = (ops: readonly OutboxRow[]) => ops.map((op) => [op.path, op.value] as const).sort((a, b) => a[0].localeCompare(b[0]));
  await bulk(page).click();
  await expect(toast(page)).toContainText(`${N - 3} itens marcados Conforme`);
  await expect(progress(page)).toHaveText(`${N} de ${N}`);
  await expect(progress(page)).toHaveAttribute('data-state', 'complete');
  const marked = await since(idsBefore);
  expect(marked).toHaveLength(N - 3);
  expect(new Set(marked.map((op) => op.batch_id)).size).toBe(1);
  const rest = SITE_ITEM_KEYS.filter((key) => ![LUVAS, BACIA, EMERGENCIA].includes(key));
  expect(byPath(marked)).toEqual(rest.map((key) => [resultPath(enelId, key), 'C'] as const).sort((a, b) => a[0].localeCompare(b[0])));
  await toast(page).getByRole('button', { name: 'Desfazer' }).click();
  await expect(progress(page)).toHaveText(`3 de ${N}`);
  await expect(seg(page, TAPETE, 'Conforme')).toHaveAttribute('aria-checked', 'false');
  const undone = await since(new Set([...idsBefore, ...marked.map((op) => op.op_id)]));
  expect(undone).toHaveLength(N - 3);
  expect(new Set(undone.map((op) => op.batch_id)).size).toBe(1);
  expect(undone[0]!.batch_id).not.toBe(marked[0]!.batch_id);
  expect(undone.every((op) => op.kind === 'put')).toBe(true);
  expect(byPath(undone)).toEqual(rest.map((key) => [resultPath(enelId, key), null] as const).sort((a, b) => a[0].localeCompare(b[0])));
  // The three answers given by hand stood through both.
  await expect(seg(page, LUVAS, 'Conforme')).toHaveAttribute('aria-checked', 'true');
  await expect(seg(page, BACIA, 'Não se aplica')).toHaveAttribute('aria-checked', 'true');
  await expect(seg(page, EMERGENCIA, 'Não conforme')).toHaveAttribute('aria-checked', 'true');
  await bulk(page).click();
  await expect(progress(page)).toHaveText(`${N} de ${N}`);
  await expect(page.locator('.content > section.vl-group .section-head .btn-reason')).toHaveText(GROUP_SIZES.map((size) => `${size} de ${size}`));
  await expect(bulk(page)).toHaveAttribute('aria-disabled', 'true');

  // Epic 14 QA Q-4: the NC item has no point of attention yet, so one pending row before issue
  // names the local on section 9 of the Sumário; it goes once the point exists (below).
  await bar(page).getByRole('button', { name: 'Concluir verificações' }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}$`));
  await expect(sumario(page).locator('li.sum-s9 .sum-status').first()).toContainText(NC_WITHOUT_POINT);
  await (await siteCard(page, ENEL)).click();
  await expect(title(page)).toHaveText('Verificações do local — Cubículo Enel');

  // "Criar ponto de atenção" on the NC item: a point of this local, citing the item's photo.
  const create = nc.getByRole('button', { name: 'Criar ponto de atenção' });
  await create.click();
  const editor = page.getByRole('dialog', { name: 'Criar ponto de atenção' });
  await expect(editor).toBeVisible();
  await expect(editor.locator('.poa-equipment')).toHaveText('Cubículo Enel · Verificações do local');
  const text = editor.getByRole('textbox', { name: 'Texto' });
  await expect(text.locator('.photo-ref')).toHaveText('Imagem 1');
  await text.click();
  await page.keyboard.press('Home');
  await page.keyboard.type(`${POINT_TEXT} `);
  await editor.getByRole('textbox', { name: 'Ação recomendada' }).fill(POINT_ACTION);
  await editor.getByRole('button', { name: 'Concluir' }).click();
  await expect(editor).toHaveCount(0);
  await expect(nc.locator('.nc-point-ref')).toHaveText('Ponto de atenção 1');
  await expect.poll(async () => (await pointsOf(page, relatorioId)).map((stored) => stored.action)).toEqual([POINT_ACTION]);
  const [point] = await pointsOf(page, relatorioId);
  expect(point).toMatchObject({ location_id: enelId, equipment_id: null, origin: 'manual', action: POINT_ACTION, text: `${POINT_TEXT} ${photoToken(photoId)}` });

  // "Concluir verificações" with nothing missing returns to the tree; the row reads N de N.
  await bar(page).getByRole('button', { name: 'Concluir verificações' }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}$`));
  await expandLocation(page, ENEL);
  await expect(siteCount(page, ENEL)).toHaveText(`${N} de ${N}`);
  await expect(siteButton(page, ENEL).locator('.s9-state')).toHaveText('✓ Concluída');
  // Its one NC item carries the card's NC badge (F37).
  await expect(siteButton(page, ENEL).locator('.nc-badge')).toHaveText('1 NC');
  await expandLocation(page, EMPTY_LOCAL);
  await expect(siteCount(page, EMPTY_LOCAL)).toHaveText(`0 de ${N}`);
  await expect(headerPill(page)).toHaveText('Em campo');
  await siteButton(page, ENEL).click();
  await expect(title(page)).toHaveText('Verificações do local — Cubículo Enel');

  // --- a reload with the network still gone: everything is read back from the device ---
  const pendingBefore = (await outbox(page)).filter(unsynced).map((op) => op.op_id);
  // The first answer and its status op, the NA and NC answers with their observations, the photo, three bulk batches of 16, the point.
  expect(pendingBefore.length).toBeGreaterThanOrEqual(2 + 2 + 2 + 1 + 48 + 1);
  const restore = await reloadWithoutNetwork(page, context);
  await expect(title(page)).toHaveText('Verificações do local — Cubículo Enel', { timeout: 30_000 });
  await expect(progress(page)).toHaveText(`${N} de ${N}`);
  await expect(page.locator('li.checklist-row [role="radio"][aria-checked="true"]')).toHaveCount(N);
  await expect(seg(page, LUVAS, 'Conforme')).toHaveAttribute('aria-checked', 'true');
  await expect(seg(page, BACIA, 'Não se aplica')).toHaveAttribute('aria-checked', 'true');
  await expect(seg(page, EMERGENCIA, 'Não conforme')).toHaveAttribute('aria-checked', 'true');
  // The NA row's observation is one line with "Editar"; the NC row keeps its field, its photo and its point mark.
  const line = row(page, BACIA).locator('.vl-obs-line');
  await expect(line.locator('.vl-obs-label')).toHaveText('Observação');
  await expect(line.locator('.vl-obs-text')).toHaveText(NA_NOTE);
  await expect(line.getByRole('button', { name: 'Editar a observação do item 9' })).toHaveText('Editar');
  await expect(row(page, EMERGENCIA).getByRole('textbox', { name: 'Observação do item 11' })).toHaveValue(NC_PHRASE);
  await expect(row(page, EMERGENCIA).locator('.photo-list .photo-row')).toHaveCount(1);
  await expect(row(page, EMERGENCIA).locator('.nc-point-ref')).toHaveText('Ponto de atenção 1');
  const stillPending = (await outbox(page)).filter(unsynced).map((op) => op.op_id);
  expect(stillPending).toEqual(pendingBefore);

  // --- online again: one sync drains the outbox ---
  await restore();
  await expect(title(page)).toBeVisible({ timeout: 30_000 });
  await syncNowAndReturn(page);
  expect((await outbox(page)).filter((op) => unsynced(op) || op.status === 'dead')).toEqual([]);
  await expect
    .poll(
      async () => {
        const uploaded = (await photosOf(page, relatorioId))[0]?.uploaded_at ?? null;
        if (uploaded === null) await syncNowAndReturn(page);
        return uploaded !== null;
      },
      { timeout: 120_000, intervals: [1_000, 3_000, 5_000] },
    )
    .toBe(true);
  // The device and the server hold the same N cells, the photo's local and item, and the point's local and token.
  const expected = Object.fromEntries(SITE_ITEM_KEYS.map((key) => [key, key === EMERGENCIA ? 'NC' : key === BACIA ? 'NA' : 'C']));
  const resultsOf = (location: Local | undefined) => Object.fromEntries(Object.entries(location?.checklist ?? {}).map(([key, entry]) => [key, entry?.result?.value ?? null]));
  const deviceEnel = (await locals(page, relatorioId)).find((location) => location.id === enelId);
  expect(resultsOf(deviceEnel)).toEqual(expected);
  expect(deviceEnel!.checklist![BACIA]!.observation!.value).toBe(NA_NOTE);
  expect(deviceEnel!.checklist![EMERGENCIA]!.observation!.value).toBe(NC_PHRASE);
  const serverEnel = (await serverRow(account.companyId, 'location', enelId)) as unknown as Local;
  expect(resultsOf(serverEnel)).toEqual(expected);
  expect(serverEnel.checklist![EMERGENCIA]!.observation!.value).toBe(NC_PHRASE);
  expect((await serverRow(account.companyId, 'location', emptyId)) as unknown as Local).not.toHaveProperty('checklist');
  expect(await serverRow(account.companyId, 'file', photoId)).toMatchObject({ location_id: enelId, item_key: EMERGENCIA, block_id: null, reading_kind: null, caption: CAPTION });
  expect(await serverRow(account.companyId, 'point', point!.id)).toMatchObject({ location_id: enelId, equipment_id: null, text: `${POINT_TEXT} ${photoToken(photoId)}` });

  // --- the Sumário and the Export dialog: one non-blocking row names the locals left; the parecer alone blocks ---
  await openSumario(page, relatorioId);
  const row9 = sumario(page).locator('li.sum-s9 .sum-status').first();
  await expect(row9).toContainText(
    `Verificações do local sem resposta: 1° Subsolo (${N} itens), Oxigênio (${N} itens), Cobertura A (${N} itens), Cobertura B (${N} itens), Geradores (${N} itens) e Sala dos painéis (${N} itens)`,
  );
  await expect(row9).not.toContainText('Cubículo Enel (');
  // Epic 14 QA Q-4: the NC item has its point now: no row names it.
  await expect(row9).not.toContainText(NC_WITHOUT_POINT);
  await expect(row9).not.toHaveClass(/is-blocking/);
  await expect(sumario(page).locator('.sum-status.is-blocking')).toHaveText(['Parecer não preenchido']);
  // Section 8 names the point by its local.
  await page.goto(`/relatorio/${relatorioId}/pontos`);
  await expect(page.locator('.poa-list > .point-of-attention-card:not(.is-auto) .poa-title').first()).toHaveText('Cubículo Enel · Verificações do local', { timeout: 30_000 });

  // --- "Gerar relatório": revision 1, its DOCX read back ---
  await setParecer(page, relatorioId);
  await bar(page).getByRole('button', { name: 'Gerar relatório' }).click();
  const modal = exportDialog(page);
  await expect(modal).toBeVisible();
  await expect(modal.locator('.precheck li.is-blocking')).toHaveCount(0);
  const generate = modal.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' });
  await expect(generate).toBeEnabled({ timeout: 30_000 });
  await generate.click();
  await confirmIssue(modal, /^Gerar com 94 fichas vazias/);
  await expect(toast(page)).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
  const document = await downloadDocx(page, 1);

  const nine = sectionXml(document, 9);
  const parts = subsections(nine);
  // Exactly once per local: seven locals, seven tables, each in the first subsection printed for its local.
  const withTable = parts.filter((part) => tablesOf(part.xml).some((table) => table[0]![0] === SITE_TITLE));
  expect(paragraphsOf(nine).filter((paragraph) => paragraph === SITE_TITLE)).toHaveLength(names.length);
  expect(withTable).toHaveLength(names.length);
  // A local with no type grouping prints under its own name; 1° Subsolo and Geradores (grouped by type) under their first type group.
  expect(withTable.map((part) => part.heading.replace(/^9\.\d+ /, ''))).toEqual([
    ENEL,
    expect.stringContaining('1° Subsolo'),
    'Oxigênio',
    'Cobertura A',
    'Cobertura B',
    expect.stringContaining('Geradores'),
    EMPTY_LOCAL,
  ]);
  for (const part of withTable) {
    const tables = tablesOf(part.xml);
    // Right after AMBIENTE DE ENSAIO, before any sheet: the subsection's first three tables, in this order.
    expect(tables.slice(0, 3).map((table) => table[0]![0]), part.heading).toEqual(['CARACTERÍSTICAS DA SE', 'AMBIENTE DE ENSAIO', SITE_TITLE]);
    expect(tables.filter((table) => table[0]![0] === SITE_TITLE), part.heading).toHaveLength(1);
    const table = tables[2]!;
    expect(table[1]).toEqual(['ÍTEM', 'C', 'NC', 'NA', 'OBSERVAÇÕES']);
    expect(table.filter((cells) => cells.length === 1).map((cells) => cells[0])).toEqual([SITE_TITLE, ...GROUPS]);
    const items = itemRows(table);
    expect(items).toHaveLength(N);
    expect(items.map((cells) => cells[0]!.split('.')[0])).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)));
    expect(items.every((cells) => cells[0] === cells[0]!.toLocaleUpperCase('pt-BR'))).toBe(true);
  }
  // No sheet repeats the local's tables: the cabine tables print once per local in all.
  expect(paragraphsOf(nine).filter((paragraph) => paragraph === 'CARACTERÍSTICAS DA SE')).toHaveLength(names.length);
  expect(paragraphsOf(nine).filter((paragraph) => paragraph === 'AMBIENTE DE ENSAIO')).toHaveLength(names.length);

  // Cubículo Enel: the answers as marks, the observations, then the item's photo, then its first sheet.
  const enelPart = withTable[0]!;
  const enelItems = itemRows(tablesOf(enelPart.xml)[2]!);
  expect(enelItems[0]).toEqual(['1. LUVAS ISOLANTES COMPATÍVEIS COM A TENSÃO, COM ENSAIO DIELÉTRICO VÁLIDO', 'X', '', '', '']);
  expect(enelItems[8]).toEqual(['9. BACIA DE CONTENÇÃO DE ÓLEO', '', '', 'X', NA_NOTE]);
  expect(enelItems[10]).toEqual(['11. ILUMINAÇÃO DE EMERGÊNCIA (AUTONOMIA MÍNIMA DE 2 H)', '', 'X', '', NC_PHRASE]);
  expect(enelItems.filter((cells) => cells[1] === 'X')).toHaveLength(N - 2);
  const enelParagraphs = paragraphsOf(enelPart.xml);
  const photoLine = `Imagem 1: ${CAPTION}.`;
  const order = [enelPart.heading, 'CARACTERÍSTICAS DA SE', 'AMBIENTE DE ENSAIO', SITE_TITLE, GROUPS[0]!, `${N}. ${SITE.at(-1)!.label.toLocaleUpperCase('pt-BR')}`, photoLine].map((paragraph) => enelParagraphs.indexOf(paragraph));
  expect(order.every((index) => index > -1), `the parts of Cubículo Enel are printed: ${JSON.stringify(order)}`).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  // The local's parts come before its first sheet's own tables.
  const firstSheet = enelParagraphs.indexOf('DADOS DO EQUIPAMENTO');
  expect(firstSheet).toBeGreaterThan(order.at(-1)!);

  // The group rows: one cell across the five columns, shaded and bold (the print mock's `.pt-group`).
  const groupRows = [...nine.matchAll(/<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/g)].map((m) => m[1]!).filter((tr) => GROUPS.includes(paragraphText(tr)));
  expect(groupRows).toHaveLength(names.length * GROUPS.length);
  for (const tr of groupRows) {
    expect(tr).toContain('<w:gridSpan w:val="5"/>');
    expect(tr).toContain(`w:fill="${GROUP_FILL}"`);
    expect(tr).toMatch(/<w:b\/>/);
  }

  // The local with no equipment: its own numbered heading, the cabine tables and the table with no mark, and no sheet.
  const emptyPart = withTable.at(-1)!;
  expect(emptyPart.heading).toMatch(/^9\.\d+ Sala dos painéis$/);
  expect(itemRows(tablesOf(emptyPart.xml)[2]!).every((cells) => cells.slice(1).every((mark) => mark === ''))).toBe(true);
  expect(tablesOf(emptyPart.xml)).toHaveLength(3);
  expect(parts.at(-1)!.heading).toBe(emptyPart.heading);

  // Story 17.1: section 7 holds only the "Geral" photos, so the site item's photo prints once, under its local above.
  const seven = paragraphsOf(sectionXml(document, 7));
  expect(seven).not.toContain(photoLine);
  expect(seven.some((paragraph) => /^Imagem \d+[.:]/.test(paragraph))).toBe(false);
  expect(paragraphsOf(document).filter((paragraph) => paragraph === photoLine)).toHaveLength(1);
  // Section 8: the point, and its row naming the local.
  const eight = sectionXml(document, 8);
  expect(paragraphsOf(eight)).toContain(`${POINT_TEXT}, conforme Imagem 1. ${POINT_ACTION}`);
  const [plan] = tablesOf(eight);
  expect(plan![1]![0]).toBe('1');
  expect(plan![1]).toContain('Cubículo Enel · Verificações do local');
  expect(plan![1]).toContain(POINT_ACTION);
});

// --- 14.3-E2E-002 -------------------------------------------------------------------------

test('@p0 14.3-E2E-002 an item answered on an Emitido relatório: the banner says these verificações reopen it, the answer reopens it as Em revisão in its batch, "Marcar como enviado ao cliente" is withdrawn and the next generate is revision 2 with the answer printed', async ({
  page,
}) => {
  test.setTimeout(600_000);
  const { relatorioId, enelId } = await setUp(page, 1280);
  await expect(headerPill(page)).toHaveText('Em campo', { timeout: 30_000 });
  await setParecer(page, relatorioId);

  // Revision 1, then sent: Emitido.
  await bar(page).getByRole('button', { name: 'Gerar relatório' }).click();
  await generateRevision(page, 1);
  await exportDialog(page).getByRole('button', { name: MARK_SENT }).click();
  await expect(exportDialog(page).locator('.row-wrap .status-pill')).toHaveText('Emitido');
  await escapeDialog(page, exportDialog(page));
  await expect(headerPill(page)).toHaveText('Emitido');

  // The surface of an Emitido relatório says that editing reopens it, in its own words.
  await openSection9(page);
  await (await siteCard(page, ENEL)).click();
  await expect(title(page)).toHaveText('Verificações do local — Cubículo Enel');
  const sentence = 'Relatório emitido (revisão 1). Editar estas verificações reabre o relatório como Em revisão e gera a revisão 2.';
  await expect(banner(page)).toContainText(sentence);

  await seg(page, TAPETE, 'Não se aplica').click();
  await expect(toast(page)).toHaveText('Relatório reaberto em revisão. A próxima emissão gera a revisão 2.', { timeout: 20_000 });
  await expect(page.getByText(sentence)).toHaveCount(0);
  const ops = await outbox(page);
  const answer = ops.find((op) => op.path === resultPath(enelId, TAPETE));
  const reopened = ops.filter((op) => op.path === 'relatorio/status' && op.relatorio_id === relatorioId).at(-1);
  expect(answer).toMatchObject({ value: 'NA' });
  expect(reopened).toMatchObject({ value: 'em_revisao' });
  expect(reopened!.batch_id).toBe(answer!.batch_id);

  // The Sumário: Em revisão with newer edits; "Marcar como enviado ao cliente" is withdrawn until revision 2 exists.
  await bar(page).getByRole('button', { name: 'Ver árvore' }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}$`));
  await expect(tree(page)).toBeVisible();
  await expect(headerPill(page)).toHaveText('Em revisão');
  await expect(page.getByTestId('status-next-step')).toHaveText('Em revisão: há alterações desde a revisão 1. Gere a revisão 2 antes de marcar como enviado ao cliente.');
  await expect(bar(page).getByRole('button', { name: MARK_SENT })).toHaveCount(0);
  await expect(sumario(page).locator('li[data-row="controle"]')).toContainText('Rev. 2 na próxima emissão');
  await expandLocation(page, ENEL);
  await expect(siteCount(page, ENEL)).toHaveText(`1 de ${N}`);

  // The next generate builds revision 2 (never `unchanged`), with the answer in the table.
  await bar(page).getByRole('button', { name: 'Gerar relatório' }).click();
  await generateRevision(page, 2);
  await expect(exportDialog(page).locator('.revision-row')).toHaveCount(2);
  const document = await downloadDocx(page, 2);
  const tables = tablesOf(sectionXml(document, 9)).filter((table) => table[0]![0] === SITE_TITLE);
  expect(tables).toHaveLength(1);
  const items = itemRows(tables[0]!);
  expect(items[1]).toEqual(['2. TAPETE OU ESTRADO ISOLANTE', '', '', 'X', '']);
  expect(items.filter((cells) => cells.slice(1, 4).some((mark) => mark === 'X'))).toHaveLength(1);
});

// --- @p1 ----------------------------------------------------------------------------------

test('@p1 14.3-E2E-003 the sheet\'s "Do local" block carries the entry line with the counter; "Abrir" opens the surface, and the line follows the answers', async ({ page }) => {
  test.setTimeout(180_000);
  const { relatorioId, enelId, firstSheetId } = await setUp(page, 1280, { keepSheets: true });
  await page.goto(`/relatorio/${relatorioId}/ficha/${firstSheetId}`);
  await expect(title(page)).toBeVisible({ timeout: 30_000 });
  const line = page.getByRole('group', { name: 'Verificações do local', exact: true });
  await expect(line).toHaveClass(/cabine-line/);
  await expect(line).toHaveClass(/ficha-local-line/);
  await expect(line.locator('.cl-name')).toHaveText('Verificações do local');
  await expect(line.locator('.cl-values')).toHaveText(`0 de ${N}`);
  // Under the "Do local" block: after "Ambiente de ensaio", before the sheet's own checklist.
  const lineY = (await line.boundingBox())!.y;
  expect(lineY).toBeGreaterThan((await page.locator('section.ficha-amb').boundingBox())!.y);
  expect(lineY).toBeLessThan((await page.locator('#ficha-step-verificacoes').boundingBox())!.y);
  // The rail's level-1 row under the open local, and its entry.
  const railRow = page.locator(`aside.rail li[data-site-of="${enelId}"] > .tree-row`);
  await expect(railRow).toHaveAttribute('data-level', '1');
  // Story 15.2 (the 15.1 mocks changed the markup): a card of the sheet kind, "N de 19" beside its label and the
  // state glyph (hidden from assistive technology) and word under it.
  await expect(railRow).toHaveClass(/\beq-card\b/);
  await expect(railRow).toHaveClass(/\bsite-card\b/);
  await expect(railRow.locator('.tree-id .tree-meta')).toHaveText(`0 de ${N}`);
  await expect(railRow.locator('.tree-state')).toHaveText(/^\SVazia$/);
  await expect(railRow.locator('.tree-state')).toHaveAttribute('data-state', 'vazia');

  await line.getByRole('button', { name: 'Abrir', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/local/${enelId}/verificacoes$`));
  await expect(title(page)).toHaveText('Verificações do local — Cubículo Enel');
  await seg(page, LUVAS, 'Conforme').click();
  await seg(page, TAPETE, 'Não conforme').click();
  await expect(progress(page)).toHaveText(`2 de ${N}`);

  // "Concluir verificações" with items missing: it says what is missing and goes to the first unanswered row.
  await bar(page).getByRole('button', { name: 'Concluir verificações' }).click();
  await expect(toast(page)).toHaveText(`${N - 2} itens sem resposta — o primeiro é o item 3, Vara de manobra com ensaio dielétrico válido`);
  await expect(row(page, 'vara_de_manobra_com_ensaio_dieletrico_valido').getByRole('radio').first()).toBeFocused();
  await expect(page).toHaveURL(new RegExp(`/local/${enelId}/verificacoes$`));

  // Back on the sheet (and in its rail) the counter followed.
  await page.goto(`/relatorio/${relatorioId}/ficha/${firstSheetId}`);
  await expect(line.locator('.cl-values')).toHaveText(`2 de ${N}`, { timeout: 30_000 });
  await expect(railRow.locator('.tree-id .tree-meta')).toHaveText(`2 de ${N}`);
  await expect(railRow.locator('.tree-state')).toHaveText(/^\SEm preenchimento$/);
  await expect(railRow.locator('.tree-state')).toHaveAttribute('data-state', 'em-preenchimento');
  // Its NC item carries the card's NC badge (F37).
  await expect(railRow.locator('.eq-card-status .nc-badge')).toHaveText('1 NC');
  // Story 15.2: the card's NC badge is part of its name.
  await railRow.getByRole('button', { name: 'Verificações do local · 1 NC — Cubículo Enel', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/local/${enelId}/verificacoes$`));
});

test('@p1 14.3-E2E-004 no sideways scroll at 390, 768 and 1280 px, with an NC row open, an observation line and the point dialog; at 390 px the header stacks and the tri-state takes the row', async ({ page }) => {
  test.setTimeout(180_000);
  const { relatorioId, enelId } = await setUp(page, 390);
  await openSurface(page, relatorioId, enelId);
  // An NC row with its chips, field and buttons; an NA row with its observation as a line.
  await seg(page, EMERGENCIA, 'Não conforme').click();
  await row(page, EMERGENCIA).getByRole('group', { name: 'Observações sugeridas do item 11' }).getByRole('button', { name: 'Luminária de emergência inoperante' }).click();
  await page.keyboard.press('Tab');
  await seg(page, BACIA, 'Não se aplica').click();
  await row(page, BACIA).getByRole('button', { name: 'Mais opções de Bacia de contenção de óleo', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Observação' }).click();
  await row(page, BACIA).getByRole('textbox', { name: 'Observação do item 9' }).fill(NA_NOTE);
  await page.keyboard.press('Tab');
  await expect.poll(async () => (await outbox(page)).filter((op) => op.path === observationPath(enelId, BACIA)).length).toBe(1);
  await page.reload();
  await expect(title(page)).toBeVisible({ timeout: 30_000 });
  await expect(row(page, BACIA).locator('.vl-obs-line')).toBeVisible();
  await expect(row(page, EMERGENCIA).getByRole('button', { name: 'Criar ponto de atenção' })).toBeVisible();

  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    await expect(title(page)).toBeVisible();
    expect(await horizontalOverflow(page), `${width} px`).toBeLessThanOrEqual(0);
    // Every row, the bulk bar and the sticky bar stay inside the viewport's width.
    const widest = await page.locator('.sheet-header, .vl-intro, li.checklist-row, .vl-obs-line, .row-expand, .sticky-action-bar').evaluateAll((elements) => Math.max(...elements.map((element) => element.getBoundingClientRect().right)));
    expect(widest, `${width} px`).toBeLessThanOrEqual(width + 0.5);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  // The header stacks: the counter under the title block; the tri-state under its label, as wide as the row.
  const titleBox = (await title(page).boundingBox())!;
  const counterBox = (await progress(page).boundingBox())!;
  expect(counterBox.y).toBeGreaterThan(titleBox.y + titleBox.height - 1);
  const labelBox = (await row(page, LUVAS).locator('.row-label').boundingBox())!;
  const triBox = (await row(page, LUVAS).locator('.tri-state').boundingBox())!;
  expect(triBox.y).toBeGreaterThan(labelBox.y + labelBox.height - 1);
  expect(triBox.width).toBeGreaterThan(300);
  // Glove targets: every segment at least 56 px tall, "Editar" on the observation line at least 48 by 48.
  expect((await seg(page, LUVAS, 'Conforme').boundingBox())!.height).toBeGreaterThanOrEqual(56);
  const editBox = (await row(page, BACIA).getByRole('button', { name: 'Editar a observação do item 9' }).boundingBox())!;
  expect(Math.round(editBox.width)).toBeGreaterThanOrEqual(48);
  expect(Math.round(editBox.height)).toBeGreaterThanOrEqual(48);
  // The sticky bar's two buttons stack on a phone.
  const verArvore = (await bar(page).getByRole('button', { name: 'Ver árvore' }).boundingBox())!;
  const concluir = (await bar(page).getByRole('button', { name: 'Concluir verificações' }).boundingBox())!;
  expect(concluir.y).toBeGreaterThan(verArvore.y + verArvore.height - 1);

  // A dialog: the point editor opened from the NC row; closed with nothing typed, it writes nothing
  // and hands the focus back to the row's button.
  const create = row(page, EMERGENCIA).getByRole('button', { name: 'Criar ponto de atenção' });
  await create.click();
  const editor = page.getByRole('dialog', { name: 'Criar ponto de atenção' });
  await expect(editor).toBeVisible();
  await expect(editor.locator('.poa-equipment')).toHaveText('Cubículo Enel · Verificações do local');
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  expect(await editor.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
  await expect(create).toBeFocused();
  expect((await outbox(page)).filter((op) => op.path.startsWith('point/'))).toEqual([]);
});

test('@p0 E14-CO-B-E2E-001 E14-A7: on the Checklist row, a point dialog opened and closed inside the camera\'s focus watch (about 3 s after "Concluir fotos") hands the focus back to "Criar ponto de atenção", not to "Adicionar foto"; the point is in the store and the outbox', async ({ page }) => {
  test.setTimeout(180_000);
  const { relatorioId, enelId } = await setUp(page, 768);
  await openSurface(page, relatorioId, enelId);
  const nc = row(page, EMERGENCIA);
  await seg(page, EMERGENCIA, 'Não conforme').click();
  await expect(seg(page, EMERGENCIA, 'Não conforme')).toHaveAttribute('aria-checked', 'true');
  // The observation an NC item requires, from a chip; leaving the field commits it.
  await nc.getByRole('group', { name: 'Observações sugeridas do item 11' }).getByRole('button', { name: NC_PHRASE }).click();
  await page.keyboard.press('Tab');
  await expect.poll(async () => (await outbox(page)).filter((op) => op.path === observationPath(enelId, EMERGENCIA)).map((op) => op.value)).toEqual([NC_PHRASE]);

  const addPhoto = nc.getByRole('button', { name: 'Adicionar foto' });
  await addPhoto.click();
  const camera = await expectCameraOpen(page);
  await shoot(page, 1);
  // The camera's watch is frame-based (`LIST_FOCUS_WATCH_FRAMES`, 180): the frames are counted
  // from before "Concluir fotos", so a count under 180 when the dialog closes is inside it.
  await page.evaluate(() => {
    const counter = window as unknown as { e2eFrames: number };
    counter.e2eFrames = 0;
    const tick = () => {
      counter.e2eFrames += 1;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const frames = () => page.evaluate(() => (window as unknown as { e2eFrames: number }).e2eFrames);
  await camera.getByRole('button', { name: 'Concluir fotos' }).click();
  await expect(page.getByRole('dialog', { name: 'Câmera' })).toHaveCount(0);
  await expect(addPhoto).toBeFocused();

  // The point dialog from the same row, opened and saved at once.
  const create = nc.getByRole('button', { name: 'Criar ponto de atenção' });
  await create.click();
  const editor = page.getByRole('dialog', { name: 'Criar ponto de atenção' });
  await expect(editor).toBeVisible();
  await editor.getByRole('textbox', { name: 'Ação recomendada' }).fill(POINT_ACTION);
  await editor.getByRole('button', { name: 'Concluir' }).click();
  await expect(editor).toHaveCount(0);
  expect(await frames(), "the dialog closed inside the camera's focus watch").toBeLessThan(180);
  // Past the end of the watch, the focus is where the dialog put it back.
  await expect.poll(frames).toBeGreaterThan(200);
  expect(await create.evaluate((element) => element === document.activeElement)).toBe(true);
  await expect(create).toBeFocused();
  await expect(addPhoto).not.toBeFocused();

  // E12-A6: the point is committed: in the device's store and in the outbox.
  await expect.poll(async () => (await pointsOf(page, relatorioId)).map((stored) => stored.action)).toEqual([POINT_ACTION]);
  const [point] = await pointsOf(page, relatorioId);
  expect(point).toMatchObject({ location_id: enelId, equipment_id: null, origin: 'manual', action: POINT_ACTION });
  expect((await outbox(page)).filter((op) => op.path.startsWith(`point/${point!.id}`)).length).toBeGreaterThan(0);
});

test('@p0 14.3-E2E-007 Epic 14 QA Q-5: a local with no equipment fills its CARACTERÍSTICAS DA SE and AMBIENTE DE ENSAIO on the Verificações surface; the location ops are in the outbox, back after a reload, and the block fits at 390 px', async ({ page }) => {
  test.setTimeout(180_000);
  const { relatorioId, enelId } = await setUp(page, 390);
  await openSurface(page, relatorioId, enelId);
  // The "Do local" block, expanded above the intro and the items, with no line back to this surface.
  const se = page.locator('.content > section.se-block').filter({ has: page.getByRole('heading', { name: 'Características da SE' }) });
  const env = page.locator('.content > section.se-block').filter({ has: page.getByRole('heading', { name: 'Ambiente de ensaio' }) });
  await expect(se.locator('.ficha-da-cabine')).toHaveText('Do local · Cubículo Enel');
  await expect(env.locator('.ficha-da-cabine')).toHaveText('Do local · Cubículo Enel');
  expect(await se.evaluate((section) => section.compareDocumentPosition(document.querySelector('.content > .vl-intro')!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
  await expect(page.locator('.ficha-local-line')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ler visor' })).toHaveCount(0);

  const primaria = se.getByLabel('Tensão primária', { exact: true });
  await primaria.fill('13,8');
  await primaria.press('Tab');
  const temperatura = env.getByLabel('Temperatura', { exact: true });
  await temperatura.fill('19');
  await temperatura.press('Tab');
  await expect
    .poll(async () => (await outbox(page)).filter((op) => op.path.startsWith(`location/${enelId}/se/`) || op.path.startsWith(`location/${enelId}/env/`)).map((op) => [op.path, op.value]))
    .toEqual([
      [`location/${enelId}/se/primary_kv`, { raw: '13.8', unit: 'kV', state: 'measured' }],
      [`location/${enelId}/env/temperature_c`, { raw: '19', unit: '°C', state: 'measured' }],
    ]);
  expect((await outbox(page)).some((op) => op.path.startsWith('sheet/'))).toBe(false);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  const widest = await page.locator('.content > section.se-block').evaluateAll((elements) => Math.max(...elements.map((element) => element.getBoundingClientRect().right)));
  expect(widest).toBeLessThanOrEqual(390 + 0.5);

  await page.reload();
  await expect(title(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('Tensão primária', { exact: true })).toHaveValue('13,8');
  await expect(page.getByLabel('Temperatura', { exact: true })).toHaveValue('19');
});

test('@p0 14.3-E2E-008 2026-10-14 (Bruno): a site item answered NC counts in "NC abertos", the tap focuses the local\'s site row, Etapa 6 suggests Apto com restrições and the summary names the item; the local removed, neither carries it', async ({ page }) => {
  test.setTimeout(180_000);
  // One local, Cubículo Enel, with no equipment: the only NC the relatório can hold is a site item.
  const { relatorioId, enelId } = await setUp(page, 1280);
  const summary = page.getByRole('group', { name: 'Resumo do relatório' });
  await expect(summary.getByRole('button', { name: '0 NC abertos', exact: true })).toBeVisible();

  await openSurface(page, relatorioId, enelId);
  await seg(page, EMERGENCIA, 'Não conforme').click();
  await expect(seg(page, EMERGENCIA, 'Não conforme')).toHaveAttribute('aria-checked', 'true');
  await expect.poll(async () => (await outbox(page)).filter((op) => op.path === resultPath(enelId, EMERGENCIA)).at(-1)?.value).toBe('NC');

  // The Sumário counts it; the tap opens section 9 and moves the focus to the local's "Verificações do local".
  await openSumario(page, relatorioId);
  const nc = summary.getByRole('button', { name: '1 NC aberto', exact: true });
  await expect(nc).toBeVisible();
  await nc.click();
  await expect(tree(page)).toBeVisible();
  // Story 15.2: the card is drawn under its local, which the tap opens; the card carries the NC badge, equal to the header's count (F37).
  await expect(siteButton(page, ENEL)).toBeFocused();
  await expect(local(page, ENEL)).toHaveClass(/\bis-open\b/);
  await expect(siteButton(page, ENEL).locator('.nc-badge')).toHaveText('1 NC');
  await expect(tree(page).locator('.nc-badge')).toHaveCount(1);

  // Etapa 6: the suggestion and its hint count the site NC; the composed summary names the item.
  const item = siteItems(SEED_VERSION).find((entry) => entry.key === EMERGENCIA)!;
  const sentence = `Verificações do local não conformes: item ${item.number} (${item.label.toLocaleLowerCase('pt-BR')}) em 1 local.`;
  await page.goto(`/relatorio/${relatorioId}/setup?etapa=6`);
  await expect(page.getByRole('heading', { level: 2, name: 'Etapa 6 — Conclusão e parecer' })).toBeFocused({ timeout: 30_000 });
  const hint = page.locator('.conclusion-hint').first();
  await expect(hint).toContainText('Sugerido pelas contagens: Apto com restrições?');
  await expect(hint).toContainText('1 NC nas verificações do local');
  const verdict = page.getByRole('radiogroup', { name: 'Parecer' }).getByRole('radio', { name: 'Apto com restrições', exact: true });
  await verdict.click();
  await expect(verdict).toHaveAttribute('aria-checked', 'true');
  const field = page.locator('.suggestion-field.is-generated');
  await expect(field.locator('.generated-text')).toContainText(sentence);
  await expect(field.locator('.criteria-line')).toContainText(`verificações do local, item ${item.number} NC (1)`);
  // Confirmed: the stored summary carries the site sentence.
  await field.getByRole('button', { name: 'Confirmar' }).click();
  await expect(field).toHaveAttribute('data-state', 'confirmed');
  await expect
    .poll(async () => (await outbox(page)).filter((op) => op.path === 'relatorio/setup/parecer').at(-1)?.value)
    .toMatchObject({ verdict: 'apto_com_restricoes', text_status: 'confirmed', text: expect.stringContaining(sentence) });

  // The local removed: its site items count nowhere.
  await openSumario(page, relatorioId);
  await openSection9(page);
  await page.getByRole('button', { name: `Mais opções de ${ENEL}`, exact: true }).click();
  await page.getByRole('menuitem', { name: 'Remover', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: `Remover ${ENEL}?`, exact: true });
  await confirm.getByRole('button', { name: 'Remover local', exact: true }).click();
  await expect(confirm).toBeHidden();
  await expect(local(page, ENEL)).toHaveCount(0);
  await expect.poll(async () => (await outbox(page)).some((op) => op.path === `location/${enelId}/removed_at` && op.kind === 'remove')).toBe(true);
  await expect(summary.getByRole('button', { name: '0 NC abertos', exact: true })).toBeVisible();
  await page.goto(`/relatorio/${relatorioId}/setup?etapa=6`);
  await expect(page.getByRole('heading', { level: 2, name: 'Etapa 6 — Conclusão e parecer' })).toBeFocused({ timeout: 30_000 });
  // No sheet and no site NC left: nothing to suggest, so no hint at all; the confirmed summary
  // (which named the item) is now stale; the criteria line is the recomposed one, without the item.
  await expect(page.locator('.suggestion-alt')).toContainText('Sugerido: texto atualizado');
  await expect(page.locator('.conclusion-hint')).toHaveCount(0);
  await expect(page.getByText('NC nas verificações do local')).toHaveCount(0);
  await expect(field.locator('.generated-text')).toContainText(sentence);
  await expect(field.locator('.criteria-line')).toBeVisible();
  await expect(field.locator('.criteria-line')).not.toContainText('verificações do local');
});

test('@p1 14.3-E2E-005 a coluna and a relatório on seed v3 offer no entry: no tree button, no rail row, no line on the sheet, and the address says the checklist was not found', async ({ page }) => {
  test.setTimeout(240_000);
  // Seed v4: the locals carry the entry, a coluna never does.
  const v4 = await setUp(page, 1280, { keepSheets: true });
  await openSection9(page);
  // One per local of the standard template. Story 15.2: the card is drawn under its open local.
  for (const name of [ENEL, '1° Subsolo', 'Oxigênio', 'Cobertura A', 'Cobertura B', 'Geradores']) await expandLocation(page, name);
  await expect(tree(page).locator('.s9-verif')).toHaveCount(6);
  await expect(tree(page).locator('li.s9-coluna').first()).toBeVisible();
  await expect(tree(page).locator('li.s9-coluna .s9-verif')).toHaveCount(0);
  await page.goto(surfaceUrl(v4.relatorioId, v4.colunaId!));
  await expect(page.getByText(NOT_FOUND)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('li.checklist-row')).toHaveCount(0);
  await page.goto(surfaceUrl(v4.relatorioId, '019966c1-0143-7000-8000-00000000dead'));
  await expect(page.getByText(NOT_FOUND)).toBeVisible({ timeout: 30_000 });

  // Seed v3: nothing anywhere, and no pre-issue row for it.
  const v3 = smallRelatorio({ seedVersion: 'v3', keepSheets: true });
  await pushDrafts(page, database, v3.drafts);
  await openSumario(page, v3.relatorioId);
  await openSection9(page);
  await expandLocation(page, ENEL);
  await expect(local(page, ENEL).locator(':scope > .s9-eqs > li.s9-eq').first()).toBeVisible();
  await expect(tree(page).locator('.s9-verif')).toHaveCount(0);
  await expect(sumario(page).locator('li.sum-s9 .sum-status').first()).not.toContainText('Verificações do local');
  await page.goto(`/relatorio/${v3.relatorioId}/ficha/${v3.firstSheetId}`);
  await expect(title(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('section.ficha-amb')).toBeVisible();
  await expect(page.locator('.ficha-local-line')).toHaveCount(0);
  await expect(page.locator('aside.rail li[data-block-id]').first()).toBeVisible();
  await expect(page.locator('aside.rail li[data-site-of]')).toHaveCount(0);
  await page.goto(surfaceUrl(v3.relatorioId, v3.enelId));
  await expect(page.getByText(NOT_FOUND)).toBeVisible({ timeout: 30_000 });
});

test('@p0 15.4-E2E-001 the App bar "Voltar" from a local\'s Verificações lands on the Sumário at 390 and 1280 px: section 9 open, that local\'s "Verificações do local" focused and in view; the navigation writes nothing', async ({ page }) => {
  test.setTimeout(120_000);
  const { relatorioId, enelId } = await setUp(page, 390);
  await openSection9(page);
  const before = await locals(page, relatorioId);
  expect(before.map((location) => location.id)).toEqual([enelId]);
  const opsBefore = (await outbox(page)).length;

  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1024 });
    // Story 15.2: the card is drawn under its open local (the first round opens it; "Voltar" leaves it open).
    await (await siteCard(page, ENEL)).click();
    await expect(page).toHaveURL(new RegExp(`${surfaceUrl(relatorioId, enelId)}$`));
    await expect(title(page)).toBeVisible();
    await page.getByRole('button', { name: 'Voltar', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}$`));
    await expect(page.getByRole('button', { name: 'Expandir ou recolher a seção 9' })).toHaveAttribute('aria-expanded', 'true');
    await expect(siteButton(page, ENEL)).toBeFocused();
    await expect(siteButton(page, ENEL)).toBeInViewport();
    // Nothing on the Sumário links to the tree surface.
    await expect(page.locator('a[href$="/arvore"]')).toHaveCount(0);
  }

  // The committed state: the local row as it was, and no op written by the round trips.
  expect(await locals(page, relatorioId)).toEqual(before);
  expect((await outbox(page)).length).toBe(opsBefore);
});
