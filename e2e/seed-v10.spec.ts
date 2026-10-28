import { getDefinition, initialOrderKey, newEquipmentBlock, oilNaChipText, SEED_VERSION, type BlockRow, type LocationRow, type OpDraft } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { paragraphText, readZipEntries } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { downloadBytes, downloadFrom } from './support/download.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { setParecer } from './support/relatorio-flow.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Story 15.7 (seed v10, contract 27), driven as a person would on a relatório of the standard
 * template, born on the current seed. Every count, key and label is the kernel's
 * (`getDefinition`), never a literal list (E14-A3).
 *
 * 15.7-E2E-001: the TC sheet asks the TC's own seven items in the definition's order, none of
 * the transformer list's; Á SECO shows VASAMENTO NA through the oil rule with no chip; the TC
 * still has its ratio test; the TP keeps the transformer list.
 * 15.7-E2E-002: a TC with every item answered prints its seven VERIFICAÇÕES GERAIS rows,
 * numbered 1 to 7 in the definition's order, in the generated DOCX. It generates through the
 * one queue and LibreOffice of the api, so the file is in the serial group. Each test resets
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

const TC = getDefinition(SEED_VERSION, 'cabine_primaria', 'tc');
const TP = getDefinition(SEED_VERSION, 'cabine_primaria', 'tp');
const ENEL = 'Cubículo Enel';
/** The job's own time: flush, queue pick-up, two LibreOffice passes. */
const JOB_TIMEOUT = 150_000;

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const toast = (page: Page) => page.getByTestId('toast');
const sheetTitle = (page: Page) => page.locator('.sheet-header .sheet-title');
const rowsOf = (page: Page): Locator => page.locator('#ficha-step-verificacoes li.checklist-row');
const checklistRow = (page: Page, key: string): Locator => page.locator(`#ficha-step-verificacoes li.checklist-row[data-item-key="${key}"]`);
const checked = (page: Page, key: string): Locator => checklistRow(page, key).locator('[role="radio"][aria-checked="true"]');
const plateField = (page: Page, key: string): Locator => page.locator(`#ficha-nameplate [data-field-key="${key}"]`);
const exportDialog = (page: Page) => page.getByRole('dialog', { name: 'Gerar relatório' });

async function openSheet(page: Page, relatorioId: string, blockId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(sheetTitle(page)).toBeVisible({ timeout: 30_000 });
  await expect(rowsOf(page).first()).toBeVisible();
}

test('@p0 15.7-E2E-001 v10 TC sheet: its own seven items in order, VASAMENTO NA on Á SECO with no chip, the ratio test kept; the TP keeps the transformer list', async ({ page }) => {
  test.setTimeout(180_000);
  expect(SEED_VERSION).toBe('v10');
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  await pushDrafts(page, database, [...built.drafts, emCampoDraft(account, built.relatorioId)]);
  const sheetOf = (type: string) => built.sheets.find((sheet) => sheet.blockType === type)!;

  const tc = sheetOf('tc');
  await openSheet(page, built.relatorioId, tc.blockId);
  const items = TC.checklist!;
  await expect(rowsOf(page)).toHaveCount(items.length);
  expect(await rowsOf(page).evaluateAll((elements) => elements.map((element) => (element as HTMLElement).dataset.itemKey))).toEqual(items.map((item) => item.key));
  const vasamento = items.find((item) => item.key === 'vasamento')!;
  const buchas = items.find((item) => item.key === 'buchas')!;
  await expect(checklistRow(page, vasamento.key)).toContainText(vasamento.label, { ignoreCase: true });
  await expect(checklistRow(page, buchas.key)).toContainText(buchas.label, { ignoreCase: true });
  await expect(rowsOf(page).filter({ hasText: /válvula de alívio/i })).toHaveCount(0);
  await expect(checklistRow(page, 'valvula_de_alivio')).toHaveCount(0);

  // Á SECO: the oil rule shows VASAMENTO NA, nothing else; no chip offers to mark oil items.
  const insulation = plateField(page, 'tipo_de_isolacao').locator('select');
  await insulation.selectOption('Á SECO');
  await expect(insulation).toHaveValue('Á SECO');
  expect(TC.oil_rule!.items).toEqual([vasamento.key]);
  await expect(checked(page, vasamento.key)).toHaveAttribute('data-value', 'na');
  await expect(checked(page, 'limpeza_pintura_e_corrosao')).toHaveCount(0);
  await expect(page.getByRole('button', { name: oilNaChipText(TC.oil_rule!.items.length) })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /itens? de óleo como NA$/ })).toHaveCount(0);
  await expect.poll(async () => (await outbox(page)).filter((op) => op.path === `sheet/${tc.blockId}/nameplate/tipo_de_isolacao`).at(-1)?.value).toBe('Á SECO');

  // The ratio test is still the TC's.
  expect(TC.tests.map((t) => t.key)).toContain('relacao_transformacao');
  await expect(page.locator('#ficha-step-ensaios').getByText(/relação de transformação/i).first()).toBeAttached();

  // The TP keeps the transformer list.
  await openSheet(page, built.relatorioId, sheetOf('tp').blockId);
  await expect(rowsOf(page)).toHaveCount(TP.checklist!.length);
  await expect(checklistRow(page, 'valvula_de_alivio')).toHaveCount(1);
});

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

/**
 * The standard relatório cut down to Cubículo Enel with no equipment (its section blocks kept)
 * plus one TC there with every checklist item answered C, Em campo: generated in seconds.
 */
function smallRelatorioWithTc(): { relatorioId: string; tcId: string; drafts: OpDraft[] } {
  const built = newRelatorioDrafts(account);
  const locations = built.drafts.filter((draft) => draft.kind === 'create' && draft.path.startsWith('location/')).map((draft) => draft.value as unknown as LocationRow);
  const enel = locations.find((location) => location.kind === 'cabine' && location.name === ENEL)!;
  const drafts = built.drafts.filter((draft) => {
    if (draft.kind !== 'create') return true;
    if (draft.path.startsWith('location/')) return (draft.value as unknown as LocationRow).id === enel.id;
    if (draft.path.startsWith('block/')) return (draft.value as unknown as BlockRow).location_id === null;
    return !draft.path.startsWith('equipment/');
  });
  const scope = { relatorioId: built.relatorioId };
  const { equipment, block } = newEquipmentBlock({
    blockId: newId(),
    equipmentId: newId(),
    relatorioId: built.relatorioId,
    projectId: built.projectId,
    locationId: enel.id,
    type: 'tc',
    tag: 'TC-01',
    seedVersion: SEED_VERSION,
    orderKey: initialOrderKey(0),
  });
  return {
    relatorioId: built.relatorioId,
    tcId: block.id,
    drafts: [
      ...drafts,
      officeDraft(account, { projectId: built.projectId }, `equipment/${equipment.id}`, equipment, 'create'),
      officeDraft(account, scope, `block/${block.id}`, block, 'create'),
      ...TC.checklist!.map((item) => officeDraft(account, scope, `sheet/${block.id}/checklist/${item.key}/result`, 'C')),
      emCampoDraft(account, built.relatorioId),
    ],
  };
}

test('@p1 15.7-E2E-002 v10 TC: the DOCX prints its seven VERIFICAÇÕES GERAIS rows numbered 1 to 7 in the definition order', async ({ page }) => {
  test.setTimeout(420_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = smallRelatorioWithTc();
  await pushDrafts(page, database, built.drafts);
  await openSheet(page, built.relatorioId, built.tcId);
  await expect(rowsOf(page)).toHaveCount(TC.checklist!.length);

  await setParecer(page, built.relatorioId);
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  const modal = exportDialog(page);
  await expect(modal).toBeVisible();
  const generate = modal.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' });
  await expect(generate).toBeEnabled({ timeout: 30_000 });
  await generate.click();
  const question = modal.getByRole('group', { name: /^Gerar com / });
  const ready = modal.getByRole('heading', { level: 2, name: 'Revisão 1 pronta' });
  await expect(question.or(ready).or(modal.locator('.gen-progress')).first()).toBeVisible({ timeout: 30_000 });
  if (await question.isVisible()) await question.getByRole('button', { name: 'Gerar mesmo assim' }).click();
  await expect(toast(page)).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
  const download = await downloadFrom(page, () => modal.getByRole('button', { name: 'DOCX — abrir no Word' }).click());
  const document = readZipEntries(await downloadBytes(download)).get('word/document.xml')!.toString('utf8');

  const tables = tablesOf(sectionXml(document, 9)).filter((table) => table[0]![0] === 'VERIFICAÇÕES GERAIS');
  expect(tables).toHaveLength(1);
  const numbered = tables[0]!.map((cells) => cells[0]!).filter((text) => /^\d+\. /.test(text));
  const upper = (text: string) => text.toLocaleUpperCase('pt-BR');
  expect(numbered).toEqual(TC.checklist!.map((item, at) => `${at + 1}. ${upper(item.label)}`));
});
