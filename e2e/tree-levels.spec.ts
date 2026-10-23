import { addCabine, addColuna, addPainel, blockTypeLabel, funcaoLabel, instantiateTemplate, SEED_VERSION, setQuantity, siteItems, standardTemplate, type OpDraft } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { deviceDatabaseName, expect, horizontalOverflow, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { emCampoDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { expandLocation, section9Chevron } from './support/tree.ts';

/*
 * Story 15.2 (the Story 15.1 mocks, `40-relatorio-overview.html`; Bruno's "Melhorias produto"
 * item 1 and answers 5 and 6; ux-pass-2026-10-22.md F50, F19, F37), driven as a person would on
 * a relatório born on "another device" from a template of one local: a painel with two colunas
 * (Coluna 1 with a seccionadora and a disjuntor, Coluna 2 with a seccionadora) and one
 * transformer directly on the local. Every count and label is read from the kernel, never typed.
 *
 * 15.2-E2E-001 (390 x 844): the local is a band with the kicker "Local", its name and its Função
 * line; its "Verificações do local" is the first card under it ("0 de N", "Vazia"); the painel's
 * kicker and "2 colunas"; each coluna header's kicker and "N de M"; the transformer's card under
 * "Equipamentos no local"; "Adicionar equipamento no local" the local's last row. A sheet opened
 * from its card gets one item answered NC (held in the outbox, E12-A6); "Voltar" lands on that
 * card, focused, and the header's "1 NC aberto" equals the one badge "1 NC" on it (F37). The four
 * header counters sit in two rows of two and the first Sumário row is on screen unscrolled (F50).
 *
 * 15.2-E2E-002 (1180 x 820, F19): every card shows its type label beside its TAG.
 *
 * Neither test times a tap against a render: the file runs in the parallel group. Each test resets
 * this worker's own Empresa B (E6-Q7).
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

const LOCAL = 'Cabine de níveis';
const FUNCAO = 'entrada';
const PAINEL = 'Painel de média tensão';
const SITE_N = siteItems(SEED_VERSION).length;

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const tree = (page: Page) => page.getByRole('list', { name: 'Locais do relatório' });
const local = (page: Page) => tree(page).locator(':scope > li.s9-local').filter({ has: page.locator(':scope > .s9-loc-row .s9-loc-name', { hasText: LOCAL }) });
const card = (page: Page, blockId: string) => tree(page).locator(`li.s9-eq[data-block-id="${blockId}"]`);
const summary = (page: Page) => page.getByRole('group', { name: 'Resumo do relatório' });

interface Built {
  relatorioId: string;
  /** The live equipment sheets by where they sit: the transformer on the local, the colunas' sheets in order. */
  direct: { blockId: string; tag: string; type: string };
  coluna1: { blockId: string; tag: string; type: string }[];
  coluna2: { blockId: string; tag: string; type: string }[];
  drafts: OpDraft[];
}

/** The project and the relatório of the one-local template, as drafts (the standard template's sections kept, its skeleton replaced). */
function levelsRelatorio(): Built {
  const projectId = newId();
  const project: OpDraft = {
    kind: 'create',
    scope: 'company',
    company_id: account.companyId,
    project_id: null,
    relatorio_id: null,
    path: `project/${projectId}`,
    value: { id: projectId, client_id: null, name: 'Obra dos níveis', site: 'Obra dos níveis', removed_at: null },
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: account.userId,
  };
  let skeleton = addCabine([], 'tl-local', LOCAL, FUNCAO);
  skeleton = addPainel(skeleton, 'tl-local', 'tl-painel', PAINEL);
  skeleton = addColuna(skeleton, 'tl-painel', 'tl-c1', 'Coluna 1');
  skeleton = addColuna(skeleton, 'tl-painel', 'tl-c2', 'Coluna 2');
  // The standard template's section blocks stay; its equipment, placed on refs this skeleton does not hold, is dropped by `setQuantity`.
  const base = { ...standardTemplate({ id: newId() }), skeleton };
  let blocks = setQuantity(base, 'tl-local', 'transformador_forca', 1);
  blocks = setQuantity({ ...base, blocks }, 'tl-c1', 'chave_seccionadora', 1);
  blocks = setQuantity({ ...base, blocks }, 'tl-c1', 'disjuntor_mt', 1);
  blocks = setQuantity({ ...base, blocks }, 'tl-c2', 'chave_seccionadora', 1);
  const { relatorioId, drafts } = instantiateTemplate(
    { ...base, blocks },
    { id: projectId },
    { service_start: '2026-10-20', service_end: '2026-10-22', existingEquipment: [], responsible_user_id: null },
    { newId, actorId: account.userId, companyId: account.companyId },
  );
  const rows = (prefix: string) => drafts.filter((draft) => draft.kind === 'create' && draft.path.startsWith(prefix)).map((draft) => draft.value as Record<string, unknown>);
  const locationId = new Map(rows('location/').map((row) => [row.name as string, row.id as string]));
  const tagOf = new Map(rows('equipment/').map((row) => [row.id as string, row.tag as string]));
  const sheetsOn = (name: string) =>
    rows('block/')
      .filter((row) => row.equipment_id !== null && row.location_id === locationId.get(name))
      .sort((a, b) => ((a.order_key as string) < (b.order_key as string) ? -1 : 1))
      .map((row) => ({ blockId: row.id as string, tag: tagOf.get(row.equipment_id as string) ?? '', type: row.block_type as string }));
  const direct = sheetsOn(LOCAL);
  expect(direct).toHaveLength(1);
  return { relatorioId, direct: direct[0]!, coluna1: sheetsOn('Coluna 1'), coluna2: sheetsOn('Coluna 2'), drafts: [project, ...drafts, emCampoDraft(account, relatorioId)] };
}

async function setUp(page: Page, viewport: { width: number; height: number }): Promise<Built> {
  await resetEmpresaB(account);
  await page.setViewportSize(viewport);
  await signIn(page, account.email);
  const built = levelsRelatorio();
  expect(built.coluna1).toHaveLength(2);
  expect(built.coluna2).toHaveLength(1);
  await pushDrafts(page, database, built.drafts);
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  return built;
}

async function openSection9(page: Page): Promise<void> {
  const chevron = section9Chevron(page);
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expect(tree(page)).toBeVisible();
}

const box = async (locator: Locator) => (await locator.boundingBox())!;

test('@p0 15.2-E2E-001 at 390 px the tree reads Local, Painel, Coluna and the cards; the site checklist is the first card; an NC on a sheet is one badge equal to the header count; "Voltar" focuses the card; the counters sit 2 x 2 above the first row', async ({ page }) => {
  test.setTimeout(180_000);
  const built = await setUp(page, { width: 390, height: 844 });

  // F50: the four counters in two rows of two, and the first Sumário row on screen without scrolling.
  const counters = summary(page).getByRole('button');
  await expect(counters).toHaveCount(4);
  await page.evaluate(() => window.scrollTo(0, 0));
  const [c0, c1, c2, c3] = await Promise.all([0, 1, 2, 3].map((i) => box(counters.nth(i))));
  expect(Math.abs(c0!.y - c1!.y)).toBeLessThanOrEqual(2);
  expect(Math.abs(c2!.y - c3!.y)).toBeLessThanOrEqual(2);
  expect(c2!.y).toBeGreaterThanOrEqual(c0!.y + c0!.height - 1);
  expect(Math.abs(c0!.x - c2!.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(c1!.x - c3!.x)).toBeLessThanOrEqual(2);
  expect(c1!.x).toBeGreaterThan(c0!.x + c0!.width - 1);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const firstRow = page.locator('ol.sumario > li.sum-row').first();
  expect((await box(firstRow)).y).toBeLessThan(844);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await openSection9(page);
  await expandLocation(page, LOCAL);
  const li = local(page);
  await expect(li).toHaveClass(/\bis-open\b/);

  // The local: a band with its kicker, its name and its Função line.
  const band = li.locator(':scope > .s9-loc-row');
  await expect(band.locator('.s9-loc-body > .level-kicker')).toHaveText('Local');
  await expect(band.locator('.s9-loc-name')).toHaveText(LOCAL);
  await expect(band.locator('.s9-loc-meta')).toContainText(funcaoLabel(FUNCAO)!);
  await expect(band.locator('.progress-counter')).toHaveText('0 de 4');

  // The order under the band: the site card, "Equipamentos no local" and its card, the painéis, "Adicionar …" last.
  const order = await li.evaluate((element) =>
    [...element.children].map((child) => ['s9-loc-row', 's9-site', 's9-col-direct', 's9-eqs', 's9-pnls', 's9-add'].find((name) => child.classList.contains(name)) ?? child.className),
  );
  expect(order).toEqual(['s9-loc-row', 's9-site', 's9-col-direct', 's9-eqs', 's9-pnls', 's9-add']);

  // The Verificações do local: the first card, "0 de N" and "Vazia".
  const site = li.locator(':scope > ul.s9-site > li.s9-site-card');
  await expect(site).toHaveClass(/\beq-card\b/);
  await expect(site.locator('.s9-site-name')).toHaveText('Verificações do local');
  await expect(site.locator('.s9-site-count')).toHaveText(`0 de ${SITE_N}`);
  await expect(site.locator('.s9-state')).toHaveText('○ Vazia');
  await expect(site.getByRole('button')).toHaveAccessibleName(`Verificações do local · 0 de ${SITE_N} — ${LOCAL}`);

  // The direct sheet: a card under "Equipamentos no local", TAG and type as its title.
  await expect(li.locator(':scope > p.s9-col-direct .s9-col-name')).toHaveText('Equipamentos no local');
  await expect(li.locator(':scope > p.s9-col-direct .s9-col-meta')).toHaveText('0 de 1');
  const direct = card(page, built.direct.blockId);
  await expect(li.locator(':scope > ul.s9-eqs:not(.s9-site) > li.s9-eq')).toHaveCount(1);
  await expect(direct).toHaveClass(/\beq-card\b/);
  await expect(direct).toHaveClass(/\bblock-card\b/);
  await expect(direct.locator('.eq-card-title .block-tag')).toHaveText(built.direct.tag);
  await expect(direct.locator('.eq-card-title .s9-eq-name')).toHaveText(blockTypeLabel(SEED_VERSION, built.direct.type));
  await expect(direct.locator('.eq-card-status .s9-state')).toHaveText('○ Vazia');

  // The painel: its kicker and "2 colunas"; each coluna header its kicker and "N de M".
  const painel = li.locator('li.s9-painel');
  await expect(painel).toHaveCount(1);
  await expect(painel.locator(':scope > .s9-pnl-row .level-kicker')).toHaveText('Painel');
  await expect(painel.locator(':scope > .s9-pnl-row .s9-pnl-name')).toHaveText(PAINEL);
  await expect(painel.locator(':scope > .s9-pnl-row .s9-pnl-meta')).toHaveText('2 colunas');
  const colunas = painel.locator(':scope > .s9-cols > li.s9-coluna');
  await expect(colunas).toHaveCount(2);
  await expect(colunas.locator(':scope > .s9-col > .level-kicker')).toHaveText(['Coluna', 'Coluna']);
  await expect(colunas.locator(':scope > .s9-col > .s9-col-name')).toHaveText(['Coluna 1', 'Coluna 2']);
  await expect(colunas.locator(':scope > .s9-col > .s9-col-meta')).toHaveText(['0 de 2', '0 de 1']);
  await expect(colunas.nth(0).locator(':scope > .s9-eqs > li.s9-eq .block-tag')).toHaveText(built.coluna1.map((sheet) => sheet.tag));
  await expect(colunas.nth(1).locator(':scope > .s9-eqs > li.s9-eq .block-tag')).toHaveText(built.coluna2.map((sheet) => sheet.tag));

  // "Adicionar equipamento no local": the local's last row, after its painéis.
  const add = li.locator(':scope > .s9-add');
  await expect(add).toHaveAccessibleName(`Adicionar equipamento no local ${LOCAL}`);
  expect((await box(add)).y).toBeGreaterThan((await box(painel)).y);
  // No card carries an NC badge yet.
  await expect(tree(page).locator('.nc-badge')).toHaveCount(0);
  await expect(summary(page).getByRole('button', { name: '0 NC abertos', exact: true })).toBeVisible();

  // A sheet opened from its card: one checklist item answered NC.
  const target = built.coluna1[0]!;
  await card(page, target.blockId).locator('.s9-eq-open').click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${built.relatorioId}/ficha/${target.blockId}$`));
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  const row = page.locator('#ficha-step-verificacoes li.checklist-row').first();
  const itemKey = (await row.getAttribute('data-item-key'))!;
  await row.getByRole('radio', { name: 'Não conforme' }).click();
  await expect(row.getByRole('radio', { name: 'Não conforme' })).toHaveAttribute('aria-checked', 'true');
  // E12-A6: the device holds the NC.
  await expect.poll(async () => (await outbox(page)).filter((op) => op.path === `sheet/${target.blockId}/checklist/${itemKey}/result`).at(-1)?.value).toBe('NC');

  // "Voltar": the Sumário, that card focused; the header's one NC is the one badge, on that card (F37).
  await page.locator('.app-bar').getByRole('button', { name: 'Voltar', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${built.relatorioId}$`));
  await expect(card(page, target.blockId).locator('.s9-eq-open')).toBeFocused();
  await expect(card(page, target.blockId).locator('.s9-eq-open')).toBeInViewport();
  const nc = summary(page).getByRole('button', { name: /^\d+ NC abertos?$/ });
  await expect(nc).toHaveText('1 NC aberto');
  const badges = tree(page).locator('.nc-badge');
  await expect(badges).toHaveCount(1);
  await expect(badges).toHaveText('1 NC');
  await expect(card(page, target.blockId).locator('.eq-card-status .nc-badge')).toHaveText('1 NC');
  const headerCount = Number.parseInt((await nc.textContent())!, 10);
  const badgeSum = (await badges.allTextContents()).reduce((sum, text) => sum + Number.parseInt(text, 10), 0);
  expect(badgeSum).toBe(headerCount);
  // The sheet is the current one: its card says so, and its state follows the answer.
  await expect(card(page, target.blockId)).toHaveClass(/\bis-current\b/);
  await expect(card(page, target.blockId).locator('.eq-card-status .sum-here')).toHaveText('você parou aqui');
  await expect(card(page, target.blockId).locator('.eq-card-status .s9-state')).toHaveText('● Em preenchimento');
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

test('@p0 15.2-E2E-002 at 1180 px (F19) every card shows its type label beside its TAG', async ({ page }) => {
  test.setTimeout(120_000);
  const built = await setUp(page, { width: 1180, height: 820 });
  await openSection9(page);
  await expandLocation(page, LOCAL);
  const sheets = [built.direct, ...built.coluna1, ...built.coluna2];
  await expect(tree(page).locator('li.s9-eq')).toHaveCount(sheets.length);
  for (const sheet of sheets) {
    const title = card(page, sheet.blockId).locator('.eq-card-title');
    const tag = title.locator('.block-tag');
    const name = title.locator('.s9-eq-name');
    await expect(tag).toHaveText(sheet.tag);
    await expect(name).toHaveText(blockTypeLabel(SEED_VERSION, sheet.type));
    await name.scrollIntoViewIfNeeded();
    const tagBox = await box(tag);
    const nameBox = await box(name);
    expect(nameBox.width, `${sheet.tag}: the type label has no width`).toBeGreaterThan(0);
    expect(nameBox.height, `${sheet.tag}: the type label has no height`).toBeGreaterThan(0);
    // Beside the TAG: on the same line, after it.
    expect(nameBox.x, `${sheet.tag}: the type label is not after the TAG`).toBeGreaterThanOrEqual(tagBox.x + tagBox.width - 1);
    expect(nameBox.y < tagBox.y + tagBox.height && nameBox.y + nameBox.height > tagBox.y, `${sheet.tag}: the type label is not on the TAG's line`).toBe(true);
  }
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});
