import { getDefinition, newPointRow, STANDARD_TEMPLATE_NAME, type OpDraft, type PointRow } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { deviceDatabaseName, expect, horizontalOverflow, signIn, syncBadge, test, type SeedAccount } from './support/merged-fixtures.ts';
import { pushCellSuggestion } from './support/reading-ops.ts';
import { newRelatorioDrafts, officeDraft, pushDrafts, type SeededSheet } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Review fixes 2026-10-06, batch 3 (`spec-review-fixes-layout-copy-3.md`): the layout and copy
 * defects of the MVP hands-on review, looked at as the engineer sees them at the viewport each
 * one names (390, 768 or 1280 px): the sticky App bar (F-06), a focused reading clear of the
 * Sticky action bar (F-11), no toast over a picked priority's Prazo (F-25), the rail labels
 * (F-07), the phone's photo button (F-10), the certificates row (F-15), the Sumário title
 * (F-16), the Export dialog's warnings (F-17), the headers at 390 (F-18), the options menu
 * (F-19), the display-read comparison (F-22), "Abrindo câmera…" (F-26) and the phone Sync
 * badge (F-29). Every check measures what the browser draws against the viewport the page
 * really has (`document.documentElement.clientWidth`, a scrollbar excluded), so it runs in the
 * serial group (`e2e/support/groups.ts`), not beside other workers' renders.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

type Scope = { relatorioId: string };

interface Built {
  relatorioId: string;
  projectId: string;
  drafts: OpDraft[];
  sheets: SeededSheet[];
}

const sumario = (page: Page) => page.getByRole('list', { name: 'Sumário do relatório' });
const toast = (page: Page) => page.getByTestId('toast');
const appBar = (page: Page) => page.locator('header.app-bar');
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });

/** Resets Empresa B, signs in at `width` x `height`, pushes a standard relatório plus `extra` drafts and opens its Sumário. */
async function setUp(
  page: Page,
  extra: (scope: Scope, built: Built) => OpDraft[] = () => [],
  viewport = { width: 1280, height: 800 },
  edit: (drafts: OpDraft[], built: Built) => OpDraft[] = (drafts) => drafts,
): Promise<Built> {
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize(viewport);
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  await pushDrafts(page, database, [...edit(built.drafts, built), ...extra({ relatorioId: built.relatorioId }, built)]);
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

/** The second Cubículo Enel seccionadora ("SEC-ENEL-2" in the standard template). */
function secEnel2(built: Built): SeededSheet {
  const enel = built.sheets.filter((sheet) => sheet.blockType === 'chave_seccionadora' && sheet.locationName === 'Cubículo Enel');
  expect(enel.length).toBeGreaterThanOrEqual(2);
  return enel[1]!;
}

/** One checklist item written from the office: the sheet is "Em preenchimento". */
function startSheet(scope: Scope, blockId: string): OpDraft {
  const item = getDefinition('v1', 'cabine_primaria', 'chave_seccionadora').checklist![0]!;
  return officeDraft(account, scope, `sheet/${blockId}/checklist/${item.key}/result`, 'C');
}

/** An instrument of the company with `code`, created from the office device, with no certificate file. */
function instrument(code: string): OpDraft {
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
      code,
      name: `Instrumento ${code}`,
      manufacturer: 'Instrum',
      model: 'X1',
      serial: `S-${code}`,
      cert_number: `${code}/26`,
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

/** The App bar is at the top of the viewport with its back button and Sync badge in view. */
async function expectAppBarOnTop(page: Page, where: string): Promise<{ bottom: number }> {
  const bar = (await appBar(page).boundingBox())!;
  expect(Math.abs(bar.y), `${where}: the App bar left the top`).toBeLessThanOrEqual(0.5);
  await expect(appBar(page).getByRole('button', { name: 'Voltar' })).toBeInViewport();
  await expect(syncBadge(page)).toBeInViewport();
  return { bottom: bar.y + bar.height };
}

async function scrollToBottom(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
}

// --- @p0 --------------------------------------------------------------------------------------

test('@p0 F-06 the App bar stays at the top of a long page (setup, Sumário, sheet); Etapa 1 and a step jump land below it', async ({ page }) => {
  test.setTimeout(180_000);
  const built = await setUp(page);

  // Setup opened at Etapa 1: the heading below the bar, and the bar still there at the bottom of the page.
  await page.goto(`/relatorio/${built.relatorioId}/setup?etapa=1`);
  const etapa1 = page.getByRole('heading', { level: 2, name: 'Etapa 1 — Capa' });
  await expect(etapa1).toBeFocused({ timeout: 30_000 });
  const { bottom } = await expectAppBarOnTop(page, 'setup at Etapa 1');
  expect((await etapa1.boundingBox())!.y).toBeGreaterThanOrEqual(bottom - 0.5);
  await scrollToBottom(page);
  await expectAppBarOnTop(page, 'setup scrolled');
  // The banner slot is not part of the bar: nothing else sticks with it.
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('header.app-bar')!).position)).toBe('sticky');

  // The Sumário, scrolled to its end.
  await openSumario(page, built.relatorioId);
  await scrollToBottom(page);
  await expectAppBarOnTop(page, 'Sumário scrolled');

  // A sheet: the rail sticks under the bar; a step jump lands its section below the bar.
  const sheet = secEnel2(built);
  await openSheet(page, built.relatorioId, sheet.blockId);
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  const ensaios = page.locator('#ficha-step-ensaios');
  await expect(ensaios).toBeFocused();
  const onSheet = await expectAppBarOnTop(page, 'sheet at Ensaios');
  expect((await ensaios.boundingBox())!.y).toBeGreaterThanOrEqual(onSheet.bottom - 0.5);
  await scrollToBottom(page);
  await expectAppBarOnTop(page, 'sheet scrolled');
  const rail = (await page.locator('aside.rail').boundingBox())!;
  expect(rail.y).toBeGreaterThanOrEqual(onSheet.bottom - 0.5);
  expect(rail.y + rail.height).toBeLessThanOrEqual(800 + 0.5);

  // The Template composer: the palette beside the long skeleton sticks under the bar, inside the viewport.
  await page.goto('/templates');
  await page.getByRole('button', { name: `Abrir template ${STANDARD_TEMPLATE_NAME}`, exact: true }).click({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/templates\/[0-9a-f-]{36}$/);
  const palette = page.getByRole('complementary', { name: 'Paleta de blocos' });
  await expect(palette).toBeVisible();
  await scrollToBottom(page);
  const onComposer = await expectAppBarOnTop(page, 'composer scrolled');
  const paletteBox = (await palette.boundingBox())!;
  expect(paletteBox.y).toBeGreaterThanOrEqual(onComposer.bottom - 0.5);
  expect(paletteBox.y + paletteBox.height).toBeLessThanOrEqual(800 + 0.5);
});

test('@p0 F-11 at 1280 x 800, Tab through the readings: every focused reading sits above the Sticky action bar and below the App bar', async ({ page }) => {
  test.setTimeout(150_000);
  const built = await setUp(page);
  const sheet = secEnel2(built);
  await openSheet(page, built.relatorioId, sheet.blockId);
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  await page.getByRole('textbox', { name: 'T1, Valor', exact: true }).focus();
  await page.evaluate(() => window.scrollTo(0, 0));
  let checked = 0;
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    const box = await page.evaluate(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLInputElement) || active.closest('#ficha-step-ensaios .measurement-field') === null) return null;
      const field = active.getBoundingClientRect();
      const bar = document.querySelector('[data-route="/relatorio/:id/ficha/:blockId"] .sticky-action-bar')!.getBoundingClientRect();
      const top = Math.max(0, document.querySelector('header.app-bar')!.getBoundingClientRect().bottom);
      return { name: active.getAttribute('aria-label') ?? '', top: field.top, bottom: field.bottom, barTop: bar.top, appBar: top };
    });
    if (box === null) continue;
    checked += 1;
    expect(box.bottom, `${box.name} under the Sticky action bar`).toBeLessThanOrEqual(box.barTop + 1);
    expect(box.top, `${box.name} under the App bar`).toBeGreaterThanOrEqual(box.appBar - 1);
  }
  expect(checked).toBeGreaterThan(3);
  // The padding is the height the bar covers, measured.
  const padding = await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom);
  const covered = await page.evaluate(() => window.innerHeight - document.querySelector('[data-route="/relatorio/:id/ficha/:blockId"] .sticky-action-bar')!.getBoundingClientRect().top);
  expect(Math.abs(parseFloat(padding) - covered)).toBeLessThanOrEqual(1);
});

test('@p0 F-25 a priority picked on a point shows no toast; the Prazo it filled says "Sugerido" in view', async ({ page }) => {
  test.setTimeout(150_000);
  let point: PointRow | null = null;
  const built = await setUp(page, (scope) => {
    point = newPointRow({ id: newId(), relatorioId: scope.relatorioId, text: 'Plaquetas de identificação ausentes.', equipmentId: null, origin: 'manual', action: null }, []);
    return [officeDraft(account, scope, 'relatorio/setup/next_intervention_date', '2027-09-08'), officeDraft(account, scope, `point/${point.id}`, point, 'create')];
  });
  expect(point).not.toBeNull();
  await page.goto(`/relatorio/${built.relatorioId}/pontos`);
  await page.getByRole('button', { name: 'Editar o ponto 1, Geral' }).click({ timeout: 30_000 });
  const editor = page.getByRole('article', { name: 'Ponto de atenção 1 em edição' });
  await editor.getByRole('radiogroup', { name: 'Prioridade' }).getByRole('radio', { name: 'P1, Curto prazo, 30 dias', exact: true }).click();
  const prazo = editor.locator('.poa-prazo-sf');
  await expect(prazo).toHaveAttribute('data-state', 'suggested');
  await expect(prazo.locator('.suggested-pill')).toHaveText('Sugerido');
  await expect(prazo).toBeInViewport();
  await page.waitForTimeout(500);
  await expect(toast(page)).toHaveCount(0);
});

// --- @p1 --------------------------------------------------------------------------------------

/** Per rail row with a state: whether label and state overlap, which words split across lines, and the TAG's line count. */
function railRows(scope: Locator) {
  return scope.locator('.tree-row').evaluateAll((rows) =>
    rows
      .filter((row) => row.getClientRects().length > 0 && row.querySelector(':scope > .tree-state') !== null)
      .map((row) => {
        const body = row.querySelector('.tree-body')!;
        const range = document.createRange();
        range.selectNodeContents(body);
        const text = range.getBoundingClientRect();
        const state = row.querySelector(':scope > .tree-state')!.getBoundingClientRect();
        const rowBox = row.getBoundingClientRect();
        const split: string[] = [];
        const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
          for (const match of (node.textContent ?? '').matchAll(/\S+/g)) {
            const word = document.createRange();
            word.setStart(node, match.index);
            word.setEnd(node, match.index + match[0].length);
            const lines = new Set([...word.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.top)));
            if (lines.size > 1) split.push(match[0]);
          }
        }
        const tag = row.querySelector('.tree-tag');
        return {
          name: body.textContent ?? '',
          apart: text.right <= state.left + 0.5 || text.bottom <= state.top + 0.5,
          below: state.top >= text.bottom - 0.5,
          stateRightGap: rowBox.right - state.right,
          split,
          tagLines: tag === null ? 0 : new Set([...tag.getClientRects()].map((rect) => Math.round(rect.top))).size,
        };
      }),
  );
}

test('@p1 F-07 the rail at 320 px and the tree at 390 px: no word split, the TAG whole, the state beside or under the label', async ({ page }) => {
  test.setTimeout(150_000);
  let target: SeededSheet | null = null;
  const built = await setUp(page, (scope, b) => {
    target = secEnel2(b);
    return [startSheet(scope, target.blockId)];
  });
  const sheet = target!;
  await openSheet(page, built.relatorioId, sheet.blockId);
  const rail = page.locator('aside.rail');
  expect(Math.round((await rail.boundingBox())!.width)).toBe(320);
  const current = rail.locator('.tree-row[aria-current="true"]');
  await expect(current.locator('.tree-body')).toContainText('Chave seccionadora');
  await expect(current.locator('.tree-tag')).toHaveText(sheet.tag);
  await expect(current.locator('.tree-state')).toHaveText('●Em preenchimento');
  const rows = await railRows(rail);
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    expect(row.apart, `${row.name}: label and state overlap`).toBe(true);
    expect(row.split, `${row.name}: split words`).toEqual([]);
    expect(row.tagLines, `${row.name}: the TAG breaks`).toBeLessThanOrEqual(1);
    // A state dropped under the label sits at the right.
    if (row.below) expect(row.stateRightGap, `${row.name}: the dropped state is not right-aligned`).toBeLessThanOrEqual(16);
  }
  expect(await rail.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/relatorio/${built.relatorioId}/arvore`);
  const tree = page.getByRole('list', { name: 'Árvore do relatório' });
  await expect(tree).toBeVisible({ timeout: 30_000 });
  await expect(tree.locator('.tree-row[aria-current="true"] .tree-tag')).toHaveText(sheet.tag);
  for (const row of await railRows(tree)) {
    expect(row.apart, `${row.name}: label and state overlap at 390`).toBe(true);
    expect(row.split, `${row.name}: split words at 390`).toEqual([]);
  }
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

test('@p1 F-07 a TAG with no break opportunity never runs the 320 px rail sideways: it ends in an ellipsis', async ({ page }) => {
  test.setTimeout(150_000);
  const LONG = 'SEC-ENEL-SUBESTACAO-PRINCIPAL-GALPAO-NORTE-0002';
  let target: SeededSheet | null = null;
  const built = await setUp(page, () => [], { width: 1280, height: 800 }, (drafts, b) => {
    target = secEnel2(b);
    const block = drafts.find((draft) => draft.kind === 'create' && draft.path === `block/${target!.blockId}`)!;
    const equipmentId = (block.value as { equipment_id: string }).equipment_id;
    return drafts.map((draft) =>
      draft.kind === 'create' && draft.path === `equipment/${equipmentId}` ? { ...draft, value: { ...(draft.value as Record<string, unknown>), tag: LONG } as never } : draft,
    );
  });
  await openSheet(page, built.relatorioId, target!.blockId);
  const rail = page.locator('aside.rail');
  const tag = rail.locator('.tree-row[aria-current="true"] .tree-tag');
  await expect(tag).toHaveText(LONG);
  expect(await tag.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await tag.evaluate((el) => getComputedStyle(el).textOverflow)).toBe('ellipsis');
  expect(await rail.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  const row = (await rail.locator('.tree-row[aria-current="true"]').boundingBox())!;
  const railBox = (await rail.boundingBox())!;
  expect(row.x + row.width).toBeLessThanOrEqual(railBox.x + railBox.width + 0.5);
});

test('@p1 F-10 at 390 px "Adicionar fotos" is a 56 px square beside the camera and "Próxima ficha", one row', async ({ page }) => {
  test.setTimeout(150_000);
  const built = await setUp(page, () => [], { width: 390, height: 844 });
  await openSheet(page, built.relatorioId, secEnel2(built).blockId);
  const buttons = page.locator('.sticky-action-bar .bar-buttons');
  const add = buttons.getByRole('button', { name: 'Adicionar fotos' });
  await expect(add).toBeVisible();
  const box = (await add.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(64);
  expect(box.width).toBeGreaterThanOrEqual(48);
  expect(box.height).toBeGreaterThanOrEqual(48);
  await expect(add.locator('use')).toHaveAttribute('href', '/sprite.svg#i-image');
  const camera = (await buttons.getByRole('button', { name: 'Tirar foto' }).boundingBox())!;
  const primary = (await buttons.locator('#ficha-primary').boundingBox())!;
  for (const other of [camera, primary]) expect(Math.abs(other.y - box.y)).toBeLessThanOrEqual(2);
  expect(primary.x + primary.width).toBeLessThanOrEqual(await page.evaluate(() => document.documentElement.clientWidth));

  // From 480 px the word shows again.
  await page.setViewportSize({ width: 600, height: 900 });
  await expect(add.locator('.add-photos-word')).toHaveText('Adicionar fotos');
  expect((await add.locator('.add-photos-word').boundingBox())!.width).toBeGreaterThan(40);
});

test('@p1 F-15 three instruments and no certificate: row 11 reads "3 instrumentos · nenhum certificado anexado"; the Export dialog still counts their warnings', async ({ page }) => {
  test.setTimeout(150_000);
  const drafts = ['1T', '2E', '3M'].map(instrument);
  const ids = drafts.map((draft) => (draft.value as { id: string }).id);
  const built = await setUp(page, (scope) => [...drafts, officeDraft(account, scope, 'relatorio/setup/instrument_ids', ids)]);
  const row11 = sumario(page).locator('li.sum-row[data-row="section_11"] .sum-status');
  await expect(row11).toHaveText('3 instrumentos · nenhum certificado anexado', { timeout: 30_000 });
  await expect(row11).not.toContainText('sem certificado');

  // The Export dialog keeps the three "sem certificado" warnings in its count: the same relatório
  // with the three certificates attached counts three warnings fewer.
  const warnings = async (): Promise<number> => {
    await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
    const dialog = page.getByRole('dialog', { name: 'Gerar relatório' });
    const line = dialog.locator('.precheck li').filter({ has: page.getByRole('button', { name: 'Ver no sumário' }) }).locator('.pc-text');
    await expect(line).toContainText(/^\d+ avisos? — /);
    const count = Number(/^(\d+)/.exec((await line.textContent()) ?? '')![1]);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    return count;
  };
  const withoutCertificates = await warnings();
  expect(withoutCertificates).toBeGreaterThanOrEqual(3);
  // "Ver no sumário" marks row 11 among the rows its warnings stand on.
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await page.getByRole('dialog', { name: 'Gerar relatório' }).getByRole('button', { name: 'Ver no sumário' }).click();
  await expect(sumario(page).locator('li.sum-row.is-highlighted[data-row="section_11"]')).toBeVisible();

  // The three certificates attached from the office (a registry field put per instrument).
  await pushDrafts(
    page,
    database,
    ids.map(
      (id): OpDraft => ({
        kind: 'put',
        scope: 'company',
        company_id: account.companyId,
        project_id: null,
        relatorio_id: null,
        path: `registry/instrument/${id}/certificate_file_id`,
        value: newId(),
        prev_op_id: null,
        batch_id: null,
        meta: null,
        actor_id: account.userId,
      }),
    ),
  );
  await openSumario(page, built.relatorioId);
  await expect(row11).toHaveText('3 instrumentos', { timeout: 30_000 });
  expect(await warnings()).toBe(withoutCertificates - 3);
});

test('@p1 F-16 the Sumário names the relatório once from 1280 px (the App bar), and in both places below, where the bar ellipsizes', async ({ page }) => {
  test.setTimeout(150_000);
  await setUp(page);
  const h2 = page.locator('.sheet-header h2.sheet-title');
  const name = (await h2.textContent())!.trim();
  expect(name).not.toBe('');
  await expect(appBar(page).locator('h1')).toHaveText(name);
  // 1280: still a heading in the tree, with the same name, but drawn 1 px wide.
  await expect(page.getByRole('heading', { level: 2, name, exact: true })).toHaveCount(1);
  expect((await h2.boundingBox())!.width).toBeLessThanOrEqual(1);
  for (const viewport of [
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    expect((await h2.boundingBox())!.width, `at ${viewport.width}`).toBeGreaterThan(100);
    await expect(h2).toBeInViewport();
  }
});

test('@p1 F-17 the Export dialog at 390 px: the warnings sentence takes the full row, "Ver no sumário" under it', async ({ page }) => {
  test.setTimeout(150_000);
  await setUp(page, () => [], { width: 390, height: 844 });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  const dialog = page.getByRole('dialog', { name: 'Gerar relatório' });
  const row = dialog.locator('.precheck li').filter({ has: page.getByRole('button', { name: 'Ver no sumário' }) });
  await expect(row).toBeVisible();
  const text = (await row.locator('.pc-text').boundingBox())!;
  const actions = (await row.locator('.pc-actions').boundingBox())!;
  const rowBox = (await row.boundingBox())!;
  expect(text.width).toBeGreaterThanOrEqual(rowBox.width - 1);
  expect(actions.y).toBeGreaterThanOrEqual(text.y + text.height - 1);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

/** The "…" trigger's box against the first line box of the header's h2. */
async function triggerOnTitleLine(
  page: Page,
  trigger: Locator,
): Promise<{ overlaps: boolean; rightOfTitle: boolean; size: { width: number; height: number }; titleShare: number; titleLines: number }> {
  const line = await page.locator('.sheet-header h2.sheet-title').evaluate((h2) => {
    const range = document.createRange();
    range.selectNodeContents(h2);
    const rects = [...range.getClientRects()].filter((rect) => rect.width > 0);
    const first = [...rects].sort((a, b) => a.top - b.top)[0]!;
    const header = h2.closest('.sheet-header')!;
    const column = header.firstElementChild!;
    // Line boxes: distinct tops, rects on one line within a few px of each other.
    const tops: number[] = [];
    for (const rect of rects.sort((a, b) => a.top - b.top)) if (tops.every((top) => Math.abs(top - rect.top) > 6)) tops.push(rect.top);
    return {
      top: first.top,
      bottom: first.bottom,
      right: h2.getBoundingClientRect().right,
      share: column.getBoundingClientRect().width / header.getBoundingClientRect().width,
      lines: tops.length,
    };
  });
  const box = (await trigger.boundingBox())!;
  return {
    overlaps: box.y < line.bottom && box.y + box.height > line.top,
    rightOfTitle: box.x >= line.right - 0.5,
    size: { width: box.width, height: box.height },
    titleShare: line.share,
    titleLines: line.lines,
  };
}

test('@p1 F-18 at 390 px the "…" trigger stays on the title line, top right, on the Sumário and on the sheet; the counts keep 48 px targets', async ({ page }) => {
  test.setTimeout(150_000);
  const built = await setUp(page, () => [], { width: 390, height: 844 });
  const sumarioTrigger = page.getByRole('button', { name: 'Mais opções do relatório' });
  const onSumario = await triggerOnTitleLine(page, sumarioTrigger);
  expect(onSumario.overlaps, 'Sumário: the trigger left the title line').toBe(true);
  expect(onSumario.rightOfTitle).toBe(true);
  expect(onSumario.size.width).toBeGreaterThanOrEqual(48);
  expect(onSumario.size.height).toBeGreaterThanOrEqual(48);
  // The title keeps its room beside the trigger: at least 55 % of the header, never a word per line.
  expect(onSumario.titleShare).toBeGreaterThanOrEqual(0.55);
  expect(onSumario.titleLines).toBeLessThanOrEqual(3);
  const counts = page.locator('.sheet-header .sum-summary .btn-text');
  expect(await counts.count()).toBe(4);
  for (let i = 0; i < 4; i++) expect((await counts.nth(i).boundingBox())!.height).toBeGreaterThanOrEqual(48);
  expect(await page.locator('.sheet-header .sum-summary').evaluate((el) => getComputedStyle(el).columnGap)).toBe('12px');
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  const sheet = secEnel2(built);
  await openSheet(page, built.relatorioId, sheet.blockId);
  const sheetTrigger = page.locator('.sheet-header .ficha-head-side .overflow-trigger');
  const onSheet = await triggerOnTitleLine(page, sheetTrigger);
  expect(onSheet.overlaps, 'sheet: the trigger left the title line').toBe(true);
  expect(onSheet.rightOfTitle).toBe(true);
  expect(onSheet.size.width).toBeGreaterThanOrEqual(48);
  expect(onSheet.titleShare).toBeGreaterThanOrEqual(0.55);
  expect(onSheet.titleLines).toBeLessThanOrEqual(3);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

test('@p1 F-19 at 1280 px "Mais opções do relatório" opens inside the viewport, right-aligned to its trigger', async ({ page }) => {
  test.setTimeout(150_000);
  await setUp(page);
  const trigger = page.getByRole('button', { name: 'Mais opções do relatório' });
  await trigger.click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  const box = (await menu.boundingBox())!;
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(box.x + box.width).toBeLessThanOrEqual(clientWidth - 8);
  const triggerBox = (await trigger.boundingBox())!;
  expect(Math.abs(box.x + box.width - (triggerBox.x + triggerBox.width))).toBeLessThanOrEqual(2);
  expect(box.y).toBeGreaterThanOrEqual(triggerBox.y + triggerBox.height - 1);
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});

test('@p1 F-22 a display reading that differs from the typed value reads on two lines, the values still taps', async ({ page }) => {
  test.setTimeout(150_000);
  let target: SeededSheet | null = null;
  const built = await setUp(page, (scope, b) => {
    target = secEnel2(b);
    return [officeDraft(account, scope, `sheet/${target.blockId}/test/isolacao/cell/0/0`, { raw: '1000', unit: 'GΩ', state: 'measured' })];
  });
  const sheet = target!;
  await pushCellSuggestion(account.companyId, built.relatorioId, {
    targetPath: `sheet/${sheet.blockId}/test/isolacao/cell/0/0`,
    value: { raw: '1.45', unit: 'GΩ', state: 'measured' },
    photoId: newId(),
  });
  await openSheet(page, built.relatorioId, sheet.blockId);
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  const line = page.getByRole('group', { name: 'Leitura do visor diferente do valor digitado' });
  await expect(line).toHaveText('Visor: 1,45 GΩ · digitado 1.000 GΩ — Conferir', { timeout: 30_000 });
  const lines = line.locator('.mismatch-line');
  await expect(lines).toHaveCount(2);
  await expect(lines.nth(0)).toHaveText('Visor: 1,45 GΩ ·');
  await expect(lines.nth(1)).toHaveText('digitado 1.000 GΩ — Conferir');
  const [first, second] = [(await lines.nth(0).boundingBox())!, (await lines.nth(1).boundingBox())!];
  expect(second.y).toBeGreaterThanOrEqual(first.y + first.height - 1);
  // Each line on one line of its own.
  for (const box of [first, second]) expect(box.height).toBeLessThan(60);
  await expect(line.getByRole('button', { name: '1,45 GΩ' })).toBeVisible();
  await expect(line.getByRole('button', { name: '1.000 GΩ' })).toBeVisible();
});

test('@p1 F-23 the Sync live region announces a transition as a word with no count, then empties', async ({ page, context }) => {
  test.setTimeout(150_000);
  await setUp(page);
  await expect(syncBadge(page)).toHaveAttribute('data-state', 'ok', { timeout: 60_000 });
  const region = page.getByTestId('sync-announcer');
  await expect(region).toHaveAttribute('role', 'status');
  await context.setOffline(true);
  try {
    await expect(syncBadge(page)).toHaveAttribute('data-state', 'offline');
    await expect(region).toHaveText('Sem conexão');
    expect(await region.textContent()).not.toMatch(/\d/);
    // Cleared a few seconds later, so a virtual cursor never reads a stale word.
    await expect(region).toHaveText('', { timeout: 8_000 });
  } finally {
    await context.setOffline(false);
  }
});

test('@p1 F-24 the composer says why the section numbers skip 7 and 9', async ({ page }) => {
  test.setTimeout(150_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, account.email);
  await page.goto('/templates');
  await page.getByRole('button', { name: `Abrir template ${STANDARD_TEMPLATE_NAME}`, exact: true }).click({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/templates\/[0-9a-f-]{36}$/);
  const note = page.locator('.section-note').filter({ hasText: 'entram sozinhos no relatório' });
  await expect(note).toHaveText('Ordem inicial da árvore; o engenheiro reordena no relatório. 7 Registro fotográfico e 9 Relatórios dos ensaios entram sozinhos no relatório.');
  await expect(note).toBeVisible();
  // Both numbers stay (EXPERIENCE.md keeps the Position box): the tags skip 7 and 9.
  await expect(page.getByRole('list', { name: 'Blocos do template' }).locator('.block-tag')).toHaveText(['1', '2', '3', '4', '5', '6', '8', '10', '11']);
});

test('@p1 F-26 "Fotografar placa" while the camera permission prompt is open reads "Abrindo câmera…", is busy, and a second press asks nothing more', async ({ page }) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => {
    const w = window as unknown as { cameraAsks: number };
    w.cameraAsks = 0;
    // The permission prompt never answers in this test.
    const pending = () => {
      w.cameraAsks += 1;
      return new Promise<MediaStream>(() => undefined);
    };
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: pending, configurable: true });
  });
  const built = await setUp(page);
  const trafo = built.sheets.find((sheet) => sheet.blockType === 'transformador_forca')!;
  await openSheet(page, built.relatorioId, trafo.blockId);
  const tile = page.locator('#ficha-nameplate .camera-group').getByRole('button', { name: 'Fotografar placa' });
  await expect(tile).not.toHaveAttribute('aria-busy');
  await tile.click();
  await expect(tile).toHaveAttribute('aria-busy', 'true');
  await expect(tile).toHaveAttribute('data-state', 'opening');
  await expect(tile).toContainText('Abrindo câmera…');
  await expect(page.getByRole('status').filter({ hasText: 'Abrindo câmera…' })).toHaveCount(1);
  await expect(tile).not.toHaveAttribute('aria-disabled');
  await tile.click();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as unknown as { cameraAsks: number }).cameraAsks)).toBe(1);
});

test('@p1 F-29 under 768 px the Sync badge reads "Sinc." when all is sent; the title does not clip', async ({ page }) => {
  test.setTimeout(150_000);
  const built = await setUp(page, () => [], { width: 390, height: 844 });
  await openSheet(page, built.relatorioId, secEnel2(built).blockId);
  await expect(syncBadge(page)).toHaveAttribute('data-state', 'ok', { timeout: 60_000 });
  await expect(syncBadge(page).locator('.sync-short')).toHaveText('Sinc.');
  await expect(syncBadge(page).locator('.sync-short')).toBeVisible();
  await expect(syncBadge(page).locator('.sync-long')).toBeHidden();
  // The accessible name is unchanged.
  await expect(page.getByRole('button', { name: 'Sincronização: sincronizado. Abrir status' })).toBeVisible();
  const title = appBar(page).locator('h1');
  expect(await title.evaluate((h1) => h1.scrollWidth - h1.clientWidth)).toBeLessThanOrEqual(0);
});
