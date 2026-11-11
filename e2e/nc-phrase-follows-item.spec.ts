import { EMPTY_DEFINITION_CONTEXT, getDefinition, initialOrderKey, insertPhrase, newEquipmentBlock, SEED_VERSION, siteItems, type LocationRow, type OpDraft } from '@app/domain';
import type { BrowserContext, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { pdfTextItems } from './support/pdf-text.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNowAndReturn } from './support/sync.ts';

/*
 * Story 24.6 (every seed, screen only): the NC phrase follows its item. Driven as a person would at
 * 1280 px on a new relatório (seed v13), on an Inspeção de QGBT in a coluna of Geradores whose plate the
 * office filled:
 * - 24.6-E2E-001: item 1 NC with one tapped chip set to Conforme and item 2 NC with two chips set to
 *   N.A. lose their observation in the result's batch, with no warning; item 3, NC with a typed
 *   observation, set to Conforme keeps it with "Observação mantida: o texto foi editado.". The draft
 *   PDF's section 9 holds the kept text and neither removed phrase.
 * - 24.6-E2E-002: a local's site item with a typed observation set to Conforme shows the same warning;
 *   "Apagar observação" removes it and "Desfazer" brings it back. On a second sheet of the type, the
 *   phrase the company learned (stored without its final period) and the recent observation (with it)
 *   are offered once.
 * The draft goes through the api's one queue and LibreOffice: the `queue` lane (`e2e/support/groups.ts`).
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
const ITEM1 = DEFINITION.checklist![0]!;
const ITEM2 = DEFINITION.checklist![1]!;
const ITEM3 = DEFINITION.checklist![2]!;
const ONE_CHIP = ITEM1.nc_phrases[0]!;
const TWO_CHIPS = insertPhrase(ITEM2.nc_phrases[0]!, ITEM2.nc_phrases[1]!).text;
const TYPED = 'Fixação da tampa frouxa no lado direito do quadro';
const KEPT = 'Observação mantida: o texto foi editado.';
const LEARNED = 'Barramento com marcas de aquecimento antigo';
const ENEL = 'Cubículo Enel';
const SITE_ITEM = siteItems(SEED_VERSION)[2]!;
const SITE_TYPED = 'Sinalização apagada na porta de acesso ao cubículo';

interface OutboxRow {
  kind: string;
  path: string;
  value: unknown;
  batch_id: string | null;
}

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const writes = async (page: Page, path: string) => (await outbox(page)).filter((row) => row.path === path);
const compact = (text: string) => text.replace(/\s+/g, '');
const checklistRow = (page: Page, itemKey: string) => page.locator(`li.checklist-row[data-item-key="${itemKey}"]`);

/** The standard relatório (Em campo) with Inspeções de QGBT in a coluna of Geradores, their plates filled; `checklist` writes per sheet. */
function relatorioWith(sheets: readonly Record<string, { result: string; observation?: string }>[]): { relatorioId: string; blockIds: string[]; enelId: string; drafts: OpDraft[] } {
  const built = newRelatorioDrafts(account);
  const scope = { relatorioId: built.relatorioId };
  const locations = built.drafts.filter((draft) => draft.kind === 'create' && draft.path.startsWith('location/')).map((draft) => draft.value as unknown as LocationRow);
  const geradores = locations.find((location) => location.kind === 'cabine' && location.name === 'Geradores')!;
  const enelId = locations.find((location) => location.kind === 'cabine' && location.name === ENEL)!.id;
  const painelId = newId();
  const colunaId = newId();
  const drafts: OpDraft[] = [
    ...built.drafts,
    officeDraft(account, scope, `location/${painelId}`, { id: painelId, relatorio_id: built.relatorioId, parent_id: geradores.id, kind: 'painel', name: 'Painel 1', order_key: initialOrderKey(90), removed_at: null }, 'create'),
    officeDraft(account, scope, `location/${colunaId}`, { id: colunaId, relatorio_id: built.relatorioId, parent_id: painelId, kind: 'coluna', name: 'Coluna 1', order_key: initialOrderKey(0), removed_at: null }, 'create'),
  ];
  const blockIds: string[] = [];
  sheets.forEach((checklist, i) => {
    const { equipment, block } = newEquipmentBlock({
      blockId: newId(),
      definitions: EMPTY_DEFINITION_CONTEXT,
      equipmentId: newId(),
      relatorioId: built.relatorioId,
      projectId: built.projectId,
      locationId: colunaId,
      type: TYPE,
      tag: `QGBT-NC-${i + 1}`,
      seedVersion: SEED_VERSION,
      orderKey: initialOrderKey(i),
    });
    blockIds.push(block.id);
    drafts.push(
      officeDraft(account, { projectId: built.projectId }, `equipment/${equipment.id}`, equipment, 'create'),
      officeDraft(account, scope, `block/${block.id}`, block, 'create'),
      ...DEFINITION.nameplate.map((f) =>
        officeDraft(account, scope, `sheet/${block.id}/nameplate/${f.key}`, f.kind === 'number' ? { raw: '380', unit: f.unit ?? null, state: 'measured' } : f.kind === 'date' ? '2020-01-01' : f.kind === 'select' ? f.options![0] : 'QGBT GERAL'),
      ),
      ...Object.entries(checklist).flatMap(([key, cell]) => [
        officeDraft(account, scope, `sheet/${block.id}/checklist/${key}/result`, cell.result),
        ...(cell.observation === undefined ? [] : [officeDraft(account, scope, `sheet/${block.id}/checklist/${key}/observation`, cell.observation)]),
      ]),
    );
  });
  drafts.push(emCampoDraft(account, built.relatorioId));
  return { relatorioId: built.relatorioId, blockIds, enelId, drafts };
}

async function openSheet(page: Page, relatorioId: string, blockId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
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

test('@p0 24.6-E2E-001 one chip and two chips leave with the NC (to C and to N.A.), a typed observation stays with the warning; the draft prints only the kept text', async ({ page, context }) => {
  test.setTimeout(300_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const seeded = relatorioWith([{ [ITEM1.key]: { result: 'NC', observation: ONE_CHIP }, [ITEM2.key]: { result: 'NC', observation: TWO_CHIPS } }]);
  const { relatorioId } = seeded;
  const blockId = seeded.blockIds[0]!;
  await pushDrafts(page, database, seeded.drafts);
  await openSheet(page, relatorioId, blockId);
  const path = (key: string, field: 'result' | 'observation') => `sheet/${blockId}/checklist/${key}/${field}`;

  // Item 1, one tapped chip, set to Conforme: the observation leaves in the result's batch.
  await expect(checklistRow(page, ITEM1.key).getByRole('textbox')).toHaveValue(ONE_CHIP, { timeout: 30_000 });
  await checklistRow(page, ITEM1.key).getByRole('radio', { name: 'Conforme', exact: true }).click();
  await expect.poll(async () => (await writes(page, path(ITEM1.key, 'observation'))).map((row) => row.value)).toEqual([null]);
  const [result1] = await writes(page, path(ITEM1.key, 'result'));
  expect(result1?.value).toBe('C');
  expect(result1?.batch_id).toBe((await writes(page, path(ITEM1.key, 'observation')))[0]?.batch_id);
  await expect(checklistRow(page, ITEM1.key).getByText(KEPT)).toHaveCount(0);

  // Item 2, two chips joined as a tap joins them, set to N.A.: removed too.
  await checklistRow(page, ITEM2.key).getByRole('radio', { name: 'Não se aplica', exact: true }).click();
  await expect.poll(async () => (await writes(page, path(ITEM2.key, 'observation'))).map((row) => row.value)).toEqual([null]);
  expect((await writes(page, path(ITEM2.key, 'result'))).map((row) => row.value)).toEqual(['NA']);
  await expect(checklistRow(page, ITEM2.key).getByText(KEPT)).toHaveCount(0);

  // Item 3, typed on this device, then set to Conforme: kept, with the warning heard once (a status line).
  const row3 = checklistRow(page, ITEM3.key);
  await row3.getByRole('radio', { name: 'Não conforme', exact: true }).click();
  const field = row3.getByRole('textbox');
  await field.fill(TYPED);
  await field.press('Tab');
  await expect.poll(async () => (await writes(page, path(ITEM3.key, 'observation'))).at(-1)?.value).toBe(TYPED);
  await row3.getByRole('radio', { name: 'Conforme', exact: true }).click();
  await expect.poll(async () => (await writes(page, path(ITEM3.key, 'result'))).at(-1)?.value).toBe('C');
  expect((await writes(page, path(ITEM3.key, 'observation'))).map((row) => row.value)).toEqual([TYPED]);
  const line = row3.locator('.e24-kept-line');
  await expect(line).toHaveAttribute('role', 'status');
  await expect(line).toContainText(KEPT);
  await expect(line.getByRole('button', { name: 'Apagar observação' })).toBeVisible();
  await expect(row3.getByRole('textbox')).toHaveValue(TYPED);

  // The draft's section 9: the kept text, neither removed phrase.
  const text = await previewText(page, context, relatorioId);
  expect(text).toContain(compact(TYPED));
  expect(text).not.toContain(compact(ONE_CHIP));
  expect(text).not.toContain(compact(TWO_CHIPS));
});

test('24.6-E2E-002 a local\'s item keeps a typed observation with the warning, "Apagar observação" and "Desfazer"; a learned phrase and its recent spelling with a period are offered once', async ({ page }) => {
  test.setTimeout(240_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  // The first sheet's item 1 holds a typed observation ending with a period: the server learns it without the period.
  const seeded = relatorioWith([{ [ITEM1.key]: { result: 'NC', observation: `${LEARNED}.` } }, {}]);
  const { relatorioId, enelId } = seeded;
  await pushDrafts(page, database, seeded.drafts);
  await syncNowAndReturn(page);
  await expect
    .poll(async () => (await readStore<{ entity: string; row: { kind?: string; name?: string } }>(page, database, 'entities')).some((record) => record.entity === 'registry' && record.row.kind === 'nc_phrase' && record.row.name === LEARNED))
    .toBe(true);

  // The local's item: NC, typed, then Conforme: the warning; "Apagar observação", then "Desfazer".
  await page.goto(`/relatorio/${relatorioId}/local/${enelId}/verificacoes`);
  const site = checklistRow(page, SITE_ITEM.key);
  await site.getByRole('radio', { name: 'Não conforme', exact: true }).click({ timeout: 30_000 });
  await site.getByRole('textbox').fill(SITE_TYPED);
  await site.getByRole('textbox').press('Tab');
  const sitePath = `location/${enelId}/checklist/${SITE_ITEM.key}/observation`;
  await expect.poll(async () => (await writes(page, sitePath)).at(-1)?.value).toBe(SITE_TYPED);
  await site.getByRole('radio', { name: 'Conforme', exact: true }).click();
  await expect(site.locator('.e24-kept-line')).toContainText(KEPT);
  await site.getByRole('button', { name: 'Apagar observação' }).click();
  await expect.poll(async () => (await writes(page, sitePath)).at(-1)?.value).toBeNull();
  await expect(site.locator('.e24-kept-line')).toHaveCount(0);
  const toast = page.getByTestId('toast');
  await expect(toast).toContainText('Observação apagada');
  await toast.getByRole('button', { name: 'Desfazer' }).click();
  await expect.poll(async () => (await writes(page, sitePath)).at(-1)?.value).toBe(SITE_TYPED);

  // The second sheet's item 1, set to NC: the learned phrase and the recent with its period are one chip.
  await openSheet(page, relatorioId, seeded.blockIds[1]!);
  const row = checklistRow(page, ITEM1.key);
  await row.getByRole('radio', { name: 'Não conforme', exact: true }).click();
  const chips = row.getByRole('group', { name: /^Observações sugeridas do item / });
  await expect(chips).toBeVisible();
  const texts = await chips.getByRole('button').allTextContents();
  expect(texts.filter((chip) => chip.replace(/\.$/, '') === LEARNED)).toHaveLength(1);
});
