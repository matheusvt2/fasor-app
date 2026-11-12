import {
  buildSnapshot,
  cellAddressesOf,
  entityKey,
  getDefinition,
  SEED_VERSION,
  seedRule,
  sheetPointFindings,
  type Entity,
  type EntityRow,
  type PointRow,
  type RelatorioSnapshot,
  type SheetPointFinding,
} from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { escapeDialog } from './support/dialogs.ts';
import { downloadBytes, downloadFrom } from './support/download.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { confirmIssue, setParecer } from './support/relatorio-flow.ts';
import { emCampoDraft, newRelatorioDrafts, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNowAndReturn } from './support/sync.ts';

/*
 * Story 25.10 (batch e25c, seed v15 `names_every_reading_out`; M14), as a person does it at 1280 px on a new
 * relatório. 25.10-E2E-001: the chave seccionadora's three contact poles typed at 273, 266 and 548 µΩ against
 * < 250 µΩ; "Criar ponto de atenção" under the test opens the editor with a text naming the three poles in row
 * order with their values and the criterion once; "Concluir" stores one point of origin `reading` with that text;
 * the DOCX's section 8, found by its own heading, prints the three readings in the point's bullet and in its
 * action-plan row. It issues a revision through the api's one queue and LibreOffice, so it runs in the `queue`
 * lane. Every expected text is the kernel's over the device's own rows. Synthetic values. Empresa B is this
 * worker's own (E6-Q7).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const TYPE = 'chave_seccionadora' as const;
const TEST_KEY = 'resistencia_contato';
const POLES = ['273', '266', '548'];
const JOB_TIMEOUT = 150_000;

interface OutboxRow {
  path: string;
  kind: string;
  value: unknown;
}
interface EntityRecord {
  entity: string;
  id: string;
  row: Record<string, unknown>;
}

const toast = (page: Page) => page.getByTestId('toast');
const sheetTitle = (page: Page) => page.locator('.sheet-header .sheet-title');
const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const pointCreates = async (page: Page) => (await outbox(page)).filter((row) => row.kind === 'create' && row.path.startsWith('point/'));
const storedPoints = async (page: Page) =>
  (await readStore<{ entity: string; row: PointRow }>(page, database, 'entities')).filter((record) => record.entity === 'point').map((record) => record.row);
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const placeOf = (scope: Locator) => scope.locator('.e24-point-place');
const testSection = (page: Page) => page.locator(`section[data-test-key="${TEST_KEY}"]`);
const editorOf = (page: Page) => page.getByRole('dialog', { name: 'Criar ponto de atenção' });

/** The kernel's findings of one sheet over the relatório as this device holds it. */
async function findingsOf(page: Page, relatorioId: string, blockId: string): Promise<SheetPointFinding[]> {
  const records = await readStore<EntityRecord>(page, database, 'entities');
  const snapshot: RelatorioSnapshot = buildSnapshot(new Map(records.map((record) => [entityKey(record.entity as Entity, record.id), record.row as unknown as EntityRow])), relatorioId);
  return sheetPointFindings(snapshot, blockId);
}

test('@p0 25.10-E2E-001 a v15 switch with three poles out: the tap starts a point naming the three with their values and the criterion once; the point is stored; the DOCX section 8 prints the three', async ({ page }) => {
  test.setTimeout(300_000);
  // The story's rule is the v15 flag: a later seed keeps it until a story says otherwise.
  expect(seedRule(SEED_VERSION, 'names_every_reading_out')).toBe(true);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  await pushDrafts(page, database, [...built.drafts, emCampoDraft(account, built.relatorioId)]);
  const relatorioId = built.relatorioId;
  const blockId = built.sheets.find((sheet) => sheet.blockType === TYPE)!.blockId;

  // --- the sheet: the three poles typed in a run ---
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(sheetTitle(page)).toBeVisible({ timeout: 30_000 });
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  const [first] = cellAddressesOf(getDefinition(SEED_VERSION, 'cabine_primaria', TYPE), TEST_KEY);
  await testSection(page).locator(`.ficha-cell[data-cell="${TEST_KEY}:${first!.row}:${first!.col}"]`).filter({ visible: true }).locator('input.mf-value').click();
  for (const value of POLES) {
    await page.keyboard.type(value);
    await page.keyboard.press('Enter');
  }
  await expect.poll(async () => (await outbox(page)).filter((row) => row.path.startsWith(`sheet/${blockId}/test/${TEST_KEY}/cell/`)).map((row) => (row.value as { raw?: string }).raw)).toEqual(POLES);

  // The kernel's finding over the device's rows: the three poles in row order, the criterion once.
  const finding = (await findingsOf(page, relatorioId, blockId)).find((one) => one.testKey === TEST_KEY)!;
  expect(finding).toMatchObject({ origin: 'reading', testKey: TEST_KEY, place: 'test', positions: [] });
  expect(finding.text).toMatch(/^Ensaio de resistência ôhmica de contato fora do critério \(<250 µΩ\): .+ 273 µΩ; .+ 266 µΩ; .+ 548 µΩ\.$/);
  expect(finding.text.split('<250 µΩ')).toHaveLength(2);

  // --- the tap: the editor opens with that text; "Concluir" stores one point ---
  const place = placeOf(testSection(page));
  await expect(place).toHaveCount(1);
  await place.getByRole('button', { name: 'Criar ponto de atenção' }).click();
  const editor = editorOf(page);
  await expect(editor).toBeVisible();
  await expect(editor.locator('.poa-text-area')).toHaveText(finding.text);
  const before = (await pointCreates(page)).length;
  await editor.getByRole('button', { name: 'Concluir' }).click();
  await expect(editor).toHaveCount(0);
  await expect.poll(async () => (await pointCreates(page)).length).toBe(before + 1);
  const create = (await pointCreates(page)).at(-1)!;
  expect(create.value).toMatchObject({ relatorio_id: relatorioId, origin: 'reading', test_key: TEST_KEY, text: finding.text });
  await expect(place.locator('.nc-point-ref')).toHaveText('Ponto de atenção 1');
  await expect.poll(async () => (await storedPoints(page)).map((point) => [point.origin, point.test_key, point.text])).toEqual([['reading', TEST_KEY, finding.text]]);

  // --- the DOCX: section 8, found by its own heading (E7-A6) ---
  await syncNowAndReturn(page);
  await setParecer(page, relatorioId);
  const dialog = page.getByRole('dialog', { name: 'Gerar relatório' });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await expect(dialog).toBeVisible();
  const generate = dialog.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' });
  await expect(generate).toBeEnabled({ timeout: 30_000 });
  await generate.click();
  await confirmIssue(dialog);
  await expect(toast(page)).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
  const download = await downloadFrom(page, () => dialog.getByRole('button', { name: 'DOCX — abrir no Word' }).click());
  const structure = extractStructure(await downloadBytes(download));
  await escapeDialog(page, dialog);
  const level1 = structure.headings.filter((heading) => heading.level === 1).map((heading) => heading.text);
  const points = level1.find((heading) => / PONTOS DE ATENÇÃO/.test(heading));
  expect(points, JSON.stringify(level1)).toBeDefined();
  const next = level1[level1.indexOf(points!) + 1];
  const from = structure.paragraphs.lastIndexOf(points!);
  const to = next === undefined ? structure.paragraphs.length : structure.paragraphs.lastIndexOf(next);
  const section = structure.paragraphs.slice(from, to);
  expect(section.some((paragraph) => paragraph.includes(finding.text)), JSON.stringify(section)).toBe(true);
  const plan = structure.tables.find((table) => table[0]?.[1] === 'Ponto de atenção' && table[0]?.[5] === 'Ação recomendada');
  expect(plan, 'the action plan').toBeDefined();
  expect(plan!.slice(1).map((row) => row[1])).toEqual([finding.text]);
});
