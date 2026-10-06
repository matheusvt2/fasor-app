import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getDefinition, instantiateTemplate, standardTemplate, type OpDraft, type PointRow, type TemplateRow } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { plainJpeg } from './fixtures/photos/synthetic.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { devicePhotos, openChaveSheet } from './support/photos.ts';
import { holdPhotoBytes, pushPlateSuggestions, transformerPlateFields } from './support/reading-ops.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { newRelatorioDrafts, officeDraft, pushDrafts, type SeededSheet } from './support/relatorio-seed.ts';
import { syncNow, syncNowAndReturn } from './support/sync.ts';

/*
 * Review fixes 2026-09-30, batch rff (`spec-review-fixes-field-defects.md`): the field defects
 * of the hands-on review, driven as the engineer drives them, each asserting what the device
 * committed (the outbox or the store) and what the screen shows. Every test resets Empresa B
 * and pushes a relatório of the standard template from an "office" device, with whatever the
 * scenario needs, then works through the app's own taps and keys.
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

interface EntityRecord<T = Record<string, unknown>> {
  entity: string;
  id: string;
  row: T;
}

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const entities = <T,>(page: Page) => readStore<EntityRecord<T>>(page, database, 'entities');
const toast = (page: Page) => page.getByTestId('toast');
const nameplateField = (page: Page, key: string): Locator => page.locator(`#ficha-nameplate [data-field-key="${key}"]`);

type Scope = { relatorioId: string };

interface Built {
  relatorioId: string;
  projectId: string;
  sheets: SeededSheet[];
  drafts: OpDraft[];
}

/** Resets Empresa B, signs in at `width`, pushes a relatório of the standard template plus `extra` drafts and opens its Sumário. */
async function setUp(page: Page, extra: (scope: Scope, built: Omit<Built, 'relatorioId'> & Scope) => OpDraft[] = () => [], width = 1280): Promise<Built> {
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const scope = { relatorioId: built.relatorioId };
  await pushDrafts(page, database, [...built.drafts, ...extra(scope, { ...built, ...scope })]);
  await openSumario(page, built.relatorioId);
  return built;
}

async function openSumario(page: Page, relatorioId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
}

async function openSheet(page: Page, relatorioId: string, blockId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
}

/** The first transformer sheet of the relatório with some suggestions of the fixture plate pulled; their ids by field. */
async function transformerWithSuggestions(page: Page, keys: readonly string[]): Promise<{ built: Built; blockId: string; ids: Record<string, string> }> {
  const built = await setUp(page);
  const blockId = built.sheets.find((sheet) => sheet.blockType === 'transformador_forca')!.blockId;
  await openSheet(page, built.relatorioId, blockId);
  const all = transformerPlateFields();
  const fields = Object.fromEntries(keys.map((key) => [key, all[key]!]));
  const ids = await pushPlateSuggestions(account.companyId, built.relatorioId, { blockId, photoId: newId(), fields });
  await syncNowAndReturn(page);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  return { built, blockId, ids };
}

/** The first transformer sheet of the relatório, with the TAP ATUAL suggestion of the fixture plate ("5 · Verificar") pulled. */
async function transformerWithTapSuggestion(page: Page): Promise<{ built: Built; blockId: string; suggestionId: string }> {
  const { built, blockId, ids } = await transformerWithSuggestions(page, ['tap_atual']);
  const tap = nameplateField(page, 'tap_atual').locator('.field.suggestion-field');
  await expect(tap).toHaveAttribute('data-state', 'verify', { timeout: 30_000 });
  await expect(tap.locator('input.sv')).toHaveValue('5');
  return { built, blockId, suggestionId: ids.tap_atual! };
}

test('@p1 F-25 the "confirmado" toast is said once the field is drawn confirmed, never while its pill still shows', async ({ page }) => {
  test.setTimeout(180_000);
  await transformerWithSuggestions(page, ['identificacao']);
  const suggested = nameplateField(page, 'identificacao').locator('.field.suggestion-field');
  await expect(suggested).toHaveAttribute('data-state', 'suggested', { timeout: 30_000 });
  // Watches the page: at the moment the toast appears, is the field's pill still drawn?
  await page.evaluate(() => {
    const probe = window as unknown as { pillWithToast: boolean | null };
    probe.pillWithToast = null;
    new MutationObserver(() => {
      const shown = document.querySelector('[data-testid="toast"]');
      if (shown === null || !(shown.textContent ?? '').includes('confirmado') || probe.pillWithToast !== null) return;
      probe.pillWithToast = document.querySelector('#ficha-nameplate [data-field-key="identificacao"] .suggested-pill') !== null;
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  await suggested.getByRole('button', { name: 'Sugerido, TR-01, confirmar' }).click();
  await expect(toast(page)).toContainText('TR-01 — confirmado');
  expect(await page.evaluate(() => (window as unknown as { pillWithToast: boolean | null }).pillWithToast)).toBe(false);
  await expect(nameplateField(page, 'identificacao').locator('.suggested-pill')).toHaveCount(0);
});

/** The TAP ATUAL guess corrected with two keystrokes, as the engineer does it. */
async function typeThreeOverTap(page: Page): Promise<void> {
  const guess = nameplateField(page, 'tap_atual').locator('.field.suggestion-field input.sv');
  await guess.click();
  await guess.press('End');
  await guess.press('Backspace');
  await guess.press('3');
}

/** The typed "3" landed once with the discard of its suggestion, one batch, and survives a reload without the pill. */
async function expectTapCommitted(page: Page, blockId: string, suggestionId: string): Promise<void> {
  await expect.poll(async () => (await outbox(page)).filter((row) => row.path === `sheet/${blockId}/nameplate/tap_atual`).length, { timeout: 10_000 }).toBe(1);
  const rows = await outbox(page);
  const typed = rows.find((row) => row.path === `sheet/${blockId}/nameplate/tap_atual`)!;
  const discard = rows.find((row) => row.path === `suggestion/${suggestionId}/status`)!;
  expect(typed.value).toBe('3');
  expect(discard.value).toBe('discarded');
  expect(typed.batch_id).toBe(discard.batch_id);
  await page.reload();
  const field = nameplateField(page, 'tap_atual');
  await expect(field.locator('input')).toHaveValue('3', { timeout: 30_000 });
  await expect(field.locator('.suggestion-field, .verify-pill')).toHaveCount(0);
}

test('@p0 F-01 a value typed over the "Verificar" TAP ATUAL is committed when the engineer leaves with Tab', async ({ page }) => {
  test.setTimeout(180_000);
  const { blockId, suggestionId } = await transformerWithTapSuggestion(page);
  await typeThreeOverTap(page);
  await page.keyboard.press('Tab');
  await expectTapCommitted(page, blockId, suggestionId);
});

test('@p0 F-01 a value typed over the "Verificar" TAP ATUAL is committed when the engineer taps another field', async ({ page }) => {
  test.setTimeout(180_000);
  const { blockId, suggestionId } = await transformerWithTapSuggestion(page);
  await typeThreeOverTap(page);
  await nameplateField(page, 'vol_oleo').locator('input').click();
  await expectTapCommitted(page, blockId, suggestionId);
});

/** The toast and its "Desfazer" sit inside the viewport and above the page's sticky action bar. */
async function expectToastInView(page: Page): Promise<void> {
  const viewport = page.viewportSize()!;
  await expect(toast(page)).toBeVisible();
  const box = (await toast(page).boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  const undo = (await toast(page).getByRole('button', { name: 'Desfazer' }).boundingBox())!;
  expect(undo.y).toBeGreaterThanOrEqual(0);
  expect(undo.y + undo.height).toBeLessThanOrEqual(viewport.height);
  const bar = (await page.locator('main .sticky-action-bar').first().boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(bar.y + 0.5);
}

test('@p0 F-02 on a long sheet the bulk action toast and its "Desfazer" are in view above the sticky bar, at 1280 and at 390 px', async ({ page }) => {
  test.setTimeout(180_000);
  const { blockId } = await openChaveSheet(page, account, database);
  const bulk = page.locator('#ficha-step-verificacoes .bulk-action-bar').getByRole('button', { name: 'Marcar os restantes como Conforme' });
  const marked = async () => (await outbox(page)).filter((row) => row.path.startsWith(`sheet/${blockId}/checklist/`) && row.value === 'C').length;

  await bulk.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
  await bulk.click();
  await expect(toast(page)).toContainText('marcados Conforme');
  await expect.poll(marked).toBeGreaterThan(0);
  await expectToastInView(page);

  // Undone from the toast, then the same at phone width.
  await toast(page).getByRole('button', { name: 'Desfazer' }).click();
  await expect(bulk).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await bulk.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
  await bulk.click();
  await expect(toast(page)).toContainText('marcados Conforme');
  await expectToastInView(page);
});

test('@p1 F-03 "Restaurar texto do template" brings back the template\'s own section text, shown and stored', async ({ page }) => {
  test.setTimeout(180_000);
  const CUSTOM = '[UX-CUSTOM] Definições próprias da empresa para este template.';
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const standard = standardTemplate({ id: newId() });
  const template: TemplateRow = { ...standard, name: 'Template da empresa', blocks: standard.blocks.map((block) => (block.block_type === 'section_2' ? { ...block, section_text: CUSTOM } : block)) };
  const projectId = newId();
  const { relatorioId, drafts } = instantiateTemplate(
    template,
    { id: projectId },
    { service_start: '2026-09-06', service_end: '2026-09-08', existingEquipment: [], responsible_user_id: null },
    { newId, actorId: account.userId, companyId: account.companyId },
  );
  const company = (path: string, value: unknown): OpDraft => ({ ...officeDraft(account, { projectId }, path, value, 'create'), scope: 'company', project_id: null });
  await pushDrafts(page, database, [
    company(`template/${template.id}`, template),
    company(`project/${projectId}`, { id: projectId, client_id: null, name: 'Obra do template', site: 'Obra do template', removed_at: null }),
    ...drafts,
  ]);
  const section2 = drafts.map((draft) => draft.value as { id?: string; block_type?: string }).find((row) => row.block_type === 'section_2')!.id!;
  await syncNow(page);
  await openSumario(page, relatorioId);
  await page.goto(`/relatorio/${relatorioId}/secao/${section2}`);
  const area = page.getByRole('textbox', { name: 'Texto da seção' });
  await expect(area).toContainText('[UX-CUSTOM]', { timeout: 30_000 });

  await area.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' EDIT-REL');
  await page.keyboard.press('Tab');
  const stored = async () => ((await entities<{ config: { section_text?: string | null; section_text_edited?: boolean } }>(page)).find((record) => record.entity === 'block' && record.id === section2)!.row.config);
  await expect.poll(async () => (await stored()).section_text ?? '').toContain('EDIT-REL');

  await page.getByRole('button', { name: 'Restaurar texto do template' }).click();
  await expect(toast(page)).toContainText('Texto do template restaurado nesta seção');
  await expect(area).toContainText('[UX-CUSTOM]');
  await expect(area).not.toContainText('EDIT-REL');
  await expect.poll(async () => (await stored()).section_text).toBe(CUSTOM);
  expect((await stored()).section_text_edited).toBe(false);
});

test('@p1 F-05 a registered client\'s site is offered in "Local (obra)"; picking it creates the obra of that site', async ({ page }) => {
  test.setTimeout(180_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const clientId = newId();
  await pushDrafts(page, database, [
    {
      kind: 'create',
      scope: 'company',
      company_id: account.companyId,
      project_id: null,
      relatorio_id: null,
      path: `registry/client/${clientId}`,
      value: { id: clientId, kind: 'client', name: 'Cliente UX', cnpj: null, contact_name: null, contact_phone: null, sites: [{ id: newId(), address: 'Obra UX' }], removed_at: null },
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: account.userId,
    },
  ]);
  await syncNow(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Novo relatório', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Novo relatório' });
  await dialog.getByRole('combobox', { name: 'Cliente' }).fill('Cliente UX');
  await page.getByRole('option', { name: 'Cliente UX', exact: true }).click();
  await expect(dialog.getByRole('combobox', { name: 'Cliente' })).toHaveValue('Cliente UX');
  // The obra list, opened by its chevron with nothing typed, already holds the site.
  await dialog.getByRole('button', { name: /Abrir lista/ }).nth(1).click();
  await page.getByRole('option', { name: 'Obra UX', exact: true }).click();
  await expect(dialog.getByRole('combobox', { name: 'Local (obra)' })).toHaveValue('Obra UX');
  await expect
    .poll(async () => (await outbox(page)).filter((row) => row.kind === 'create' && row.path.startsWith('project/')).map((row) => row.value))
    .toEqual([expect.objectContaining({ client_id: clientId, site: 'Obra UX', name: 'Obra UX' })]);
  await dialog.getByRole('button', { name: 'Continuar' }).click();
  await expect(page).toHaveURL(/\/project\/[0-9a-f-]{36}$/);
});

test('@p1 F-07 "Igual à ⟨TAG⟩?" copies Fabricação and Tensão de placa too: both stored and shown', async ({ page }) => {
  test.setTimeout(180_000);
  let source: SeededSheet | undefined;
  let target: SeededSheet | undefined;
  const built = await setUp(page, (scope, { sheets }) => {
    [source, target] = sheets.filter((sheet) => sheet.blockType === 'chave_seccionadora' && sheet.locationName === 'Cubículo Enel');
    return [
      officeDraft(account, scope, `sheet/${source!.blockId}/nameplate/fabricacao`, 'Celtta'),
      officeDraft(account, scope, `sheet/${source!.blockId}/nameplate/tensao_de_placa`, '15'),
      officeDraft(account, scope, `sheet/${source!.blockId}/nameplate/tipo`, 'Manual'),
    ];
  });
  await openSheet(page, built.relatorioId, target!.blockId);
  await page.locator('.ficha-nameplate-chips').getByRole('button', { name: `Igual à ${source!.tag}?` }).click();
  await expect(toast(page)).toContainText(`Copiado de ${source!.tag}`);
  const nameplate = async () =>
    (await entities<{ sheet: { nameplate: Record<string, { value: unknown }> } }>(page)).find((record) => record.entity === 'block' && record.id === target!.blockId)!.row.sheet.nameplate;
  await expect.poll(async () => (await nameplate()).fabricacao?.value).toBe('Celtta');
  expect((await nameplate()).tensao_de_placa?.value).toBe('15');
  expect((await nameplate()).tipo?.value).toBe('Manual');
  await expect(nameplateField(page, 'fabricacao').getByRole('combobox')).toHaveValue('Celtta');
  await expect(nameplateField(page, 'tensao_de_placa').getByRole('combobox')).toHaveValue('15 kV');
  await expect(nameplateField(page, 'tipo').locator('input')).toHaveValue('Manual');
  // A moment later (a blur, a re-render) nothing has let go of them.
  await nameplateField(page, 'tipo').locator('input').click();
  await page.keyboard.press('Tab');
  await expect(nameplateField(page, 'fabricacao').getByRole('combobox')).toHaveValue('Celtta');
  expect((await nameplate()).fabricacao?.value).toBe('Celtta');
});

/** Every control and helper of the Instrumentos panel lies inside the panel (and the viewport). */
async function expectPanelContained(page: Page): Promise<void> {
  const viewport = page.viewportSize()!;
  const panel = (await page.locator('.registry-panel').boundingBox())!;
  const right = Math.min(panel.x + panel.width, viewport.width);
  const boxes = await page.locator('.registry-panel .field, .registry-panel .field .btn, .registry-panel .field .helper').evaluateAll((elements) =>
    elements.filter((element) => element.getClientRects().length > 0).map((element) => {
      const rect = element.getBoundingClientRect();
      return { name: `${element.className} ${element.textContent?.slice(0, 30) ?? ''}`, left: rect.left, right: rect.right };
    }),
  );
  expect(boxes.length).toBeGreaterThan(5);
  for (const box of boxes) {
    expect(box.left, box.name).toBeGreaterThanOrEqual(panel.x - 0.5);
    expect(box.right, box.name).toBeLessThanOrEqual(right + 0.5);
  }
}

test('@p1 F-08 the instrument editor keeps its certificate row and every field inside the panel, at 1280 and at 390 px', async ({ page }) => {
  test.setTimeout(150_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  await page.getByRole('link', { name: /Cadastros/ }).click();
  await page.getByRole('tab', { name: 'Instrumentos' }).click();
  await page.getByRole('button', { name: /^(Novo|Cadastrar) instrumento$/ }).click();
  const panel = page.locator('.registry-panel');
  await panel.getByLabel('Código').fill('9Z');
  await panel.getByLabel('Nome').fill('Megôhmetro de revisão');
  const chooser = page.waitForEvent('filechooser');
  await panel.getByRole('button', { name: /— Arquivo do certificado$/ }).first().click();
  await (await chooser).setFiles({ name: 'certificado-de-calibracao-megohmetro-digital-2026-rbc-numero-000123456789.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF\n') });
  await expect(panel.getByRole('button', { name: 'Abrir — Arquivo do certificado' })).toBeVisible({ timeout: 15_000 });
  await expectPanelContained(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel).toBeVisible();
  await expectPanelContained(page);
});

test('@p1 F-09 a photo picked into a point lands after the text with a space, never glued to it', async ({ page }) => {
  test.setTimeout(150_000);
  const photoId = newId();
  const built = await setUp(page, (scope) => [
    officeDraft(
      account,
      scope,
      `file/${photoId}`,
      {
        id: photoId,
        company_id: account.companyId,
        relatorio_id: scope.relatorioId,
        kind: 'photo',
        sha256: '1'.padStart(64, '0'),
        mime: 'image/jpeg',
        size: 1001,
        uploaded_at: null,
        variants: null,
        removed_at: null,
        captured_at: '2026-09-07T12:01:00.000Z',
        tz_offset: -180,
        coords: null,
        local_seq: 1,
        block_id: null,
        item_key: null,
        caption: 'Foto 1 da visita',
        reading_kind: null,
        reading_target: null,
        reading_status: 'none',
      },
      'create',
    ),
  ]);
  await page.locator('li.sum-row[data-row="section_8"]').getByRole('button', { name: /^Pontos de atenção/ }).click();
  await expect(page).toHaveURL(/\/pontos$/);
  await page.getByRole('button', { name: 'Criar', exact: true }).click();
  const editor = page.getByRole('article', { name: 'Novo ponto de atenção em edição' });
  await expect(editor.getByRole('textbox', { name: 'Texto' })).toBeFocused();
  // A quick text first, then the photo, as the reviewer did: the chip goes after the words.
  await editor.getByRole('group', { name: 'Textos rápidos' }).getByRole('button').first().click();
  await editor.getByRole('button', { name: 'Escolher fotos' }).click();
  await page.getByRole('dialog', { name: 'Escolher fotos' }).getByRole('button', { name: 'Imagem 1, Foto 1 da visita, referenciar' }).click();
  await editor.getByRole('textbox', { name: 'Ação recomendada' }).fill('Instalar');
  await editor.getByRole('button', { name: 'Concluir' }).click();
  await expect(editor).toHaveCount(0);
  const points = async () => (await entities<PointRow>(page)).filter((record) => record.entity === 'point' && record.row.relatorio_id === built.relatorioId).map((record) => record.row);
  await expect.poll(async () => (await points()).length).toBe(1);
  const text = (await points())[0]!.text;
  expect(text).toMatch(new RegExp(`^\\S.*\\S \\[\\[foto:${photoId}\\]\\]$`, 's'));
});

/** Every rail row's label ends before its state begins. */
async function expectRailRowsApart(page: Page): Promise<void> {
  const rows = await page.locator('.rail .relatorio-tree .tree-row').evaluateAll((elements) =>
    elements
      .filter((row) => row.getClientRects().length > 0 && row.querySelector('.tree-state') !== null && row.querySelector('.tree-body') !== null)
      .map((row) => {
        const body = row.querySelector('.tree-body')!;
        const range = document.createRange();
        range.selectNodeContents(body);
        const text = range.getBoundingClientRect();
        const state = row.querySelector('.tree-state')!.getBoundingClientRect();
        return { name: body.textContent ?? '', textRight: text.right, stateLeft: state.left };
      }),
  );
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) expect(row.textRight, row.name).toBeLessThanOrEqual(row.stateLeft + 0.5);
}

test('@p1 F-10 the rail rows never draw their label under their state, at 1280 and at 1024 by 768 px', async ({ page }) => {
  test.setTimeout(150_000);
  const built = await setUp(page);
  const chave = built.sheets.find((sheet) => sheet.blockType === 'chave_seccionadora')!;
  await openSheet(page, built.relatorioId, chave.blockId);
  await expect(page.locator('.rail .relatorio-tree .tree-row').first()).toBeVisible();
  await expectRailRowsApart(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.locator('.rail .relatorio-tree .tree-row').first()).toBeVisible();
  await expectRailRowsApart(page);
});

const PLATE = readFileSync(resolve(import.meta.dirname, '../services/ocr/tests/fixtures/plate-transformador.jpg'));

test('@p1 F-13 a plate shot shows its reading state at once, and photos added from a sheet say so in view', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    const none = () => Promise.reject(new DOMException('Requested device not found', 'NotFoundError'));
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: none, configurable: true });
  });
  await holdPhotoBytes(page);
  const built = await setUp(page);
  const trafo = built.sheets.find((sheet) => sheet.blockType === 'transformador_forca')!;
  await openSheet(page, built.relatorioId, trafo.blockId);
  const section = page.locator('#ficha-nameplate');
  // A slow device: the shot takes its time to be stored, as on the tablet the reviewer used.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 8 });
  const chooser = page.waitForEvent('filechooser');
  await section.locator('.camera-group').getByRole('button', { name: 'Fotografar placa' }).click();
  await (await chooser).setFiles({ name: 'placa.jpg', mimeType: 'image/jpeg', buffer: PLATE });
  await expect(section.locator('.ficha-np-photo .reading-line')).toHaveText('Lendo…', { timeout: 1_500 });
  await expect(section.getByRole('button', { name: 'Fotografar placa' })).toHaveCount(0);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 20_000 }).toBe(1);
  await expect(section.locator('.ficha-np-photo .photo-tile[data-photo-id]')).toBeVisible({ timeout: 20_000 });

  // "Adicionar fotos" on the sheet (the picker at once, then "Adicionar 1 foto", Story 11.11):
  // the toast is said where the engineer can see it.
  const files = page.waitForEvent('filechooser');
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Adicionar fotos' }).click();
  await (await files).setFiles([await plainJpeg(page, 'a.jpg')]);
  await page.getByRole('dialog', { name: /^De qual equipamento\?/ }).getByRole('button', { name: 'Adicionar 1 foto' }).click();
  await expect(toast(page)).toContainText('1 foto adicionada', { timeout: 20_000 });
  const box = (await toast(page).boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
});

test('@p1 F-14 the rich text toolbar shows every tool whole at 390 px, none on a hidden row', async ({ page }) => {
  test.setTimeout(150_000);
  const built = await setUp(page, () => [], 390);
  const section2 = built.drafts.map((draft) => draft.value as { id?: string; block_type?: string }).find((row) => row.block_type === 'section_2')!.id!;
  await page.goto(`/relatorio/${built.relatorioId}/secao/${section2}`);
  const toolbar = page.getByRole('toolbar');
  await expect(toolbar).toBeVisible({ timeout: 30_000 });
  const bar = (await toolbar.boundingBox())!;
  const tools = toolbar.locator('.rt-tool');
  expect(await tools.count()).toBeGreaterThanOrEqual(4);
  for (const tool of await tools.all()) {
    const box = (await tool.boundingBox())!;
    expect(box.y, await tool.textContent() ?? '').toBeGreaterThanOrEqual(bar.y - 0.5);
    expect(box.y + box.height, (await tool.textContent()) ?? '').toBeLessThanOrEqual(bar.y + bar.height + 0.5);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }
  // The last tool, on the wrapped row, takes a tap.
  await tools.last().click();
});

test('@p1 F-21 the setup cover tile names its label and file in full at 1280 px', async ({ page }) => {
  test.setTimeout(150_000);
  const built = await setUp(page);
  await page.goto(`/relatorio/${built.relatorioId}/setup`);
  const name = page.locator('.brand-tile .tile-name').first();
  await expect(name).toHaveText('Foto de capa · Nenhum arquivo', { timeout: 30_000 });
  const fits = await name.evaluate((element) => element.scrollWidth <= element.clientWidth + 0.5 && getComputedStyle(element).textOverflow !== 'ellipsis');
  expect(fits).toBe(true);
});

test('@p1 F-24 a Sumário count takes the engineer to the first sheet it counts', async ({ page }) => {
  test.setTimeout(150_000);
  const item = getDefinition('v3', 'cabine_primaria', 'chave_seccionadora').checklist![0]!;
  let nc: SeededSheet | undefined;
  const built = await setUp(page, (scope, { sheets }) => {
    nc = sheets.filter((sheet) => sheet.blockType === 'chave_seccionadora' && sheet.locationName === 'Cubículo Enel')[1];
    return [officeDraft(account, scope, `sheet/${nc!.blockId}/checklist/${item.key}/result`, 'NC')];
  });
  await openSumario(page, built.relatorioId);
  const summary = page.getByRole('group', { name: 'Resumo do relatório' });
  await summary.getByRole('button', { name: '1 NC aberto' }).click();
  const row = page.locator(`li.s9-eq[data-block-id="${nc!.blockId}"]`);
  await expect(row).toBeVisible();
  await expect(row.locator('[data-tree-open]').first()).toBeFocused();
  await expect(row).toBeInViewport();
});
