import { EMPTY_DEFINITION_CONTEXT, getDefinition, initialOrderKey, newEquipmentBlock, SEED_VERSION, type LocationRow, type OpDraft } from '@app/domain';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { openStep } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { pdfTextItems } from './support/pdf-text.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Story 24.5 (every seed, screen only): the pair the app proposes reads as a preview until the
 * technician stores it. Driven as a person would on a new relatório: two Inspeções de QGBT in a coluna
 * of Geradores, their plates filled and their items Conforme on the office device, so each has the floor
 * Aprovado · Sem restrições and no stored pair. The Conclusão step shows "Prévia da conclusão" with the
 * pill "Prévia", both radiogroups in the preview state (no segment checked, the floor's `.is-floor`,
 * dashed) and the line "Prévia: só vale depois de Confirmar ou de Concluir ficha." as the groups'
 * description; the draft PDF ("Pré-visualizar") prints no conclusion mark; "Confirmar" stores the pair
 * (the outbox), and "Concluir ficha" on the second ficha writes it as before. The draft goes through the
 * api's one queue and LibreOffice, so this spec runs in the `queue` lane (`e2e/support/groups.ts`).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const JOB_TIMEOUT = 150_000;
const TYPE = 'inspecao_qgbt';
const DEFINITION = getDefinition(SEED_VERSION, 'cabine_primaria', TYPE);
const LOCAL = 'Geradores';
const TAGS = ['QGBT-PRV-1', 'QGBT-PRV-2'] as const;
const PREVIEW_LINE = 'Prévia: só vale depois de Confirmar ou de Concluir ficha.';

interface OutboxRow {
  path: string;
  value: unknown;
  batch_id: string | null;
}

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const written = async (page: Page, path: string) => (await outbox(page)).filter((row) => row.path === path);
const compact = (text: string) => text.replace(/\s+/g, '');
const resultGroup = (page: Page) => page.getByRole('radiogroup', { name: 'Resultado' });
const restrictionGroup = (page: Page) => page.getByRole('radiogroup', { name: 'Restrições' });
const previewRow = (page: Page) => page.getByRole('group', { name: 'Prévia da conclusão' });

/** The standard relatório (Em campo) with a painel and its coluna in Geradores holding two Inspeções de QGBT, plates filled and items Conforme. */
function relatorioWithInspections(): { relatorioId: string; blockIds: string[]; drafts: OpDraft[] } {
  const built = newRelatorioDrafts(account);
  const scope = { relatorioId: built.relatorioId };
  const locations = built.drafts.filter((draft) => draft.kind === 'create' && draft.path.startsWith('location/')).map((draft) => draft.value as unknown as LocationRow);
  const geradores = locations.find((location) => location.kind === 'cabine' && location.name === LOCAL)!;
  const painelId = newId();
  const colunaId = newId();
  const painel = { id: painelId, relatorio_id: built.relatorioId, parent_id: geradores.id, kind: 'painel', name: 'Painel 1', order_key: initialOrderKey(90), removed_at: null };
  const coluna = { id: colunaId, relatorio_id: built.relatorioId, parent_id: painelId, kind: 'coluna', name: 'Coluna 1', order_key: initialOrderKey(0), removed_at: null };
  const drafts: OpDraft[] = [...built.drafts, officeDraft(account, scope, `location/${painelId}`, painel, 'create'), officeDraft(account, scope, `location/${colunaId}`, coluna, 'create')];
  const blockIds: string[] = [];
  TAGS.forEach((tag, i) => {
    const { equipment, block } = newEquipmentBlock({
      blockId: newId(),
      definitions: EMPTY_DEFINITION_CONTEXT,
      equipmentId: newId(),
      relatorioId: built.relatorioId,
      projectId: built.projectId,
      locationId: colunaId,
      type: TYPE,
      tag,
      seedVersion: SEED_VERSION,
      orderKey: initialOrderKey(i),
    });
    blockIds.push(block.id);
    drafts.push(
      officeDraft(account, { projectId: built.projectId }, `equipment/${equipment.id}`, equipment, 'create'),
      officeDraft(account, scope, `block/${block.id}`, block, 'create'),
      ...DEFINITION.nameplate.map((f) =>
        officeDraft(
          account,
          scope,
          `sheet/${block.id}/nameplate/${f.key}`,
          f.kind === 'number' ? { raw: '380', unit: f.unit ?? null, state: 'measured' } : f.kind === 'date' ? '2020-01-01' : f.kind === 'select' ? f.options![0] : 'QGBT GERAL',
        ),
      ),
      ...DEFINITION.checklist!.map((item) => officeDraft(account, scope, `sheet/${block.id}/checklist/${item.key}/result`, 'C')),
    );
  });
  drafts.push(emCampoDraft(account, built.relatorioId));
  return { relatorioId: built.relatorioId, blockIds, drafts };
}

async function seeded(page: Page, width: number): Promise<{ relatorioId: string; blockIds: string[] }> {
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width, height: width < 768 ? 844 : 1024 });
  await signIn(page, account.email);
  const built = relatorioWithInspections();
  await pushDrafts(page, database, built.drafts);
  return { relatorioId: built.relatorioId, blockIds: built.blockIds };
}

/** The preview state of one group: no segment checked, the floor's segment `.is-floor` with the mock's dashed outline. */
async function expectPreview(group: Locator, floor: string): Promise<void> {
  await expect(group.locator('.seg[aria-checked="true"]')).toHaveCount(0);
  const segment = group.getByRole('radio', { name: floor, exact: true });
  await expect(segment).toHaveClass(/\bis-floor\b/);
  expect(await segment.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('dashed');
  await expect(group).toHaveAccessibleDescription(new RegExp(PREVIEW_LINE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

/** "Pré-visualizar" in the Export dialog; the draft PDF's text, compacted. */
async function previewText(page: Page, context: BrowserContext, relatorioId: string): Promise<string> {
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  const dialog = page.getByRole('dialog', { name: 'Gerar relatório' });
  const preview = dialog.locator('.generate-row').getByRole('button', { name: 'Pré-visualizar' });
  await expect(preview).toBeEnabled({ timeout: 30_000 });
  const tabPromise = context.waitForEvent('page');
  await preview.click();
  const tab = await tabPromise;
  const requested = await tab.waitForRequest(/\/api\/relatorios\/[0-9a-f-]{36}\/preview\.pdf\?v=[0-9a-f-]{36}$/, { timeout: JOB_TIMEOUT });
  const pdf = await page.request.get(requested.url());
  expect(pdf.status()).toBe(200);
  await tab.close();
  await page.keyboard.press('Escape');
  return compact((await pdfTextItems(new Uint8Array(await pdf.body()))).join(' '));
}

test('@p0 24.5-E2E-001 at 768 px the floor reads as a preview, the draft prints no mark for it; "Confirmar" stores the pair and "Concluir ficha" writes it as before', async ({ page, context }) => {
  test.setTimeout(300_000);
  const { relatorioId, blockIds } = await seeded(page, 768);
  const [first, second] = blockIds as [string, string];

  await openStep(page, relatorioId, first, 'Conclusão');
  await expect(previewRow(page)).toContainText('Aprovado · Sem restrições?', { timeout: 30_000 });
  await expect(previewRow(page).locator('.suggested-pill')).toHaveText('Prévia');
  await expectPreview(resultGroup(page), 'Aprovado');
  await expectPreview(restrictionGroup(page), 'Sem restrições');
  await expect(page.locator('.e24-preview-line')).toHaveText(PREVIEW_LINE);
  expect(await written(page, `sheet/${first}/conclusion/result`)).toEqual([]);

  // The draft: a preview pair prints no conclusion mark (as before the story: only a chosen pair prints).
  const text = await previewText(page, context, relatorioId);
  expect(text).toContain(compact(TAGS[0]));
  for (const marked of ['APROVADOX', 'REPROVADOX', 'SEMRESTRIÇÕESX', 'OBSERVAÇÕES)X']) expect(text, marked).not.toContain(marked);

  // "Confirmar": both halves stored in one batch; the row and the line leave, the groups read checked.
  await openStep(page, relatorioId, first, 'Conclusão');
  await previewRow(page).getByRole('button', { name: 'Confirmar' }).click();
  await expect.poll(async () => (await written(page, `sheet/${first}/conclusion/result`)).map((row) => row.value)).toEqual(['aprovado']);
  const [result] = await written(page, `sheet/${first}/conclusion/result`);
  const [restriction] = await written(page, `sheet/${first}/conclusion/restriction`);
  expect(restriction?.value).toBe('sem_restricoes');
  expect(restriction?.batch_id).toBe(result?.batch_id);
  await expect(previewRow(page)).toHaveCount(0);
  await expect(page.locator('.e24-preview-line')).toHaveCount(0);
  await expect(resultGroup(page).getByRole('radio', { name: 'Aprovado', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.conclusion-pair .seg.is-floor')).toHaveCount(0);

  // The second ficha concluded by "Concluir ficha": the pair written with the conclude, nothing a preview.
  await openStep(page, relatorioId, second, 'Conclusão');
  await expectPreview(resultGroup(page), 'Aprovado');
  await page.getByRole('button', { name: `Mais opções da ficha ${TAGS[1]}` }).click();
  await page.getByRole('menuitem', { name: 'Concluir ficha' }).click();
  await expect(page.getByTestId('toast')).toContainText('Ficha concluída');
  await expect.poll(async () => (await written(page, `sheet/${second}/conclusion/result`)).at(-1)?.value).toBe('aprovado');
  expect((await written(page, `sheet/${second}/conclusion/restriction`)).at(-1)?.value).toBe('sem_restricoes');
  await openStep(page, relatorioId, second, 'Conclusão');
  await expect(page.locator('.conclusion-pair .seg.is-floor')).toHaveCount(0);
  await expect(page.locator('.e24-preview-line')).toHaveCount(0);
  await expect(previewRow(page)).toHaveCount(0);
});

test('24.5-E2E-002 at 390 and 1280 px, dark theme: a half stored by a tap leaves only the other group in the preview, which the line describes', async ({ page }) => {
  test.setTimeout(240_000);
  await page.emulateMedia({ colorScheme: 'dark' });
  const { relatorioId, blockIds } = await seeded(page, 390);
  const [first, second] = blockIds as [string, string];

  // 390 px: a tap on Aprovado stores the result alone; the restriction group stays a preview.
  await openStep(page, relatorioId, first, 'Conclusão');
  await expectPreview(resultGroup(page), 'Aprovado');
  await expectPreview(restrictionGroup(page), 'Sem restrições');
  await resultGroup(page).getByRole('radio', { name: 'Aprovado', exact: true }).click();
  await expect.poll(async () => (await written(page, `sheet/${first}/conclusion/result`)).map((row) => row.value)).toEqual(['aprovado']);
  expect(await written(page, `sheet/${first}/conclusion/restriction`)).toEqual([]);
  await expect(resultGroup(page).getByRole('radio', { name: 'Aprovado', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(resultGroup(page).locator('.seg.is-floor')).toHaveCount(0);
  await expect(resultGroup(page)).not.toHaveAccessibleDescription(new RegExp('Prévia: só vale'));
  await expectPreview(restrictionGroup(page), 'Sem restrições');
  await expect(previewRow(page)).toHaveCount(0);
  await expect(page.locator('.e24-preview-line')).toBeVisible();

  // 1280 px: the other ficha, both groups a preview, described by the line.
  await page.setViewportSize({ width: 1280, height: 900 });
  await openStep(page, relatorioId, second, 'Conclusão');
  await expect(previewRow(page)).toContainText('Aprovado · Sem restrições?', { timeout: 30_000 });
  await expectPreview(resultGroup(page), 'Aprovado');
  await expectPreview(restrictionGroup(page), 'Sem restrições');
});
