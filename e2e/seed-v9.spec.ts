import { getDefinition, oilNaChipText, SEED_VERSION, SEED_VERSIONS, siteChecklistOf, siteItems, type BlockRow, type LocationRow, type OpDraft } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { paragraphText, readZipEntries } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { downloadBytes, downloadFrom } from './support/download.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { setParecer } from './support/relatorio-flow.ts';
import { emCampoDraft, newRelatorioDrafts, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Stories 15.3 and 15.6 (seed v9, contract 25), driven as a person would on a relatório of the
 * standard template, born on the current seed. Every count and closed list is the kernel's
 * (`getDefinition`, `siteItems`), never a literal.
 *
 * 15.3-E2E-001: the transformador de força asks about the oil level once (its checklist rows are
 * the definition's, without INDICADOR NÍVEL DE ÓLEO); Á SECO shows its oil items NA (the oil
 * rule's seven) with no "Marcar N itens de óleo como NA" chip, that chip being seeds v1 to v5's;
 * the TC has no POTÊNCIA NOMINAL while the TP keeps it.
 * 15.3-E2E-002: on the local's Verificações surface the two new Ambiente items, 20 and 21, are
 * answered; the outbox holds their ops; the generated DOCX prints them in VERIFICAÇÕES DO LOCAL.
 * It generates through the one queue and LibreOffice of the api, so the file is in the serial
 * group. Each test resets this worker's own Empresa B (E6-Q7).
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
interface EntityRecord<T> {
  entity: string;
  id: string;
  row: T;
}

const TRANSFORMER = getDefinition(SEED_VERSION, 'cabine_primaria', 'transformador_forca');
const OIL = TRANSFORMER.oil_rule!.items;
const SITE = siteItems(SEED_VERSION);
const [GRADES, PINTURA] = SITE.slice(-2);
const ENEL = 'Cubículo Enel';
const SITE_TITLE = 'VERIFICAÇÕES DO LOCAL';
/** The job's own time: flush, queue pick-up, two LibreOffice passes. */
const JOB_TIMEOUT = 150_000;

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const entities = <T,>(page: Page) => readStore<EntityRecord<T>>(page, database, 'entities');
const toast = (page: Page) => page.getByTestId('toast');
const sheetTitle = (page: Page) => page.locator('.sheet-header .sheet-title');
const checklistRow = (page: Page, key: string): Locator => page.locator(`#ficha-step-verificacoes li.checklist-row[data-item-key="${key}"]`);
const checked = (page: Page, key: string): Locator => checklistRow(page, key).locator('[role="radio"][aria-checked="true"]');
const plateField = (page: Page, key: string): Locator => page.locator(`#ficha-nameplate [data-field-key="${key}"]`);
const siteRow = (page: Page, key: string): Locator => page.locator(`li.checklist-row[data-item-key="${key}"]`);
const exportDialog = (page: Page) => page.getByRole('dialog', { name: 'Gerar relatório' });

/** The standard relatório, Em campo, pushed from the office; the seed version of every row is the current one. */
async function pushStandard(page: Page) {
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  await pushDrafts(page, database, [...built.drafts, emCampoDraft(account, built.relatorioId)]);
  return built;
}

async function openSheet(page: Page, relatorioId: string, blockId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(sheetTitle(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#ficha-step-verificacoes li.checklist-row').first()).toBeVisible();
}

test('@p0 15.3-E2E-001 v9 sheets: the transformer asks about the oil level once and a dry one shows its seven oil items NA with no chip; the TC has no POTÊNCIA NOMINAL, the TP keeps it', async ({ page }) => {
  test.setTimeout(180_000);
  expect(Object.keys(SEED_VERSIONS)).toContain('v9');
  const built = await pushStandard(page);
  const sheetOf = (type: string) => built.sheets.find((sheet) => sheet.blockType === type)!;
  const transformer = sheetOf('transformador_forca');
  await openSheet(page, built.relatorioId, transformer.blockId);
  const block = (await entities<BlockRow>(page)).find((record) => record.entity === 'block' && record.id === transformer.blockId)!.row;
  expect(block.seed_version).toBe(SEED_VERSION);

  // The checklist rows are the definition's: one oil-level item, ÓLEO ISOLANTE/INDICADOR DE NÍVEL.
  const rows = page.locator('#ficha-step-verificacoes li.checklist-row');
  await expect(rows).toHaveCount(TRANSFORMER.checklist!.length);
  expect(await rows.evaluateAll((elements) => elements.map((element) => (element as HTMLElement).dataset.itemKey))).toEqual(TRANSFORMER.checklist!.map((item) => item.key));
  await expect(checklistRow(page, 'indicador_nivel_de_oleo')).toHaveCount(0);
  await expect(checklistRow(page, 'oleo_isolante_indicador_de_nivel')).toHaveCount(1);

  // Á SECO: the oil rule shows its items NA (seven on v9); no chip offers to mark them.
  const insulation = plateField(page, 'tipo_de_isolacao').locator('select');
  await insulation.selectOption('Á SECO');
  await expect(insulation).toHaveValue('Á SECO');
  expect(OIL).toHaveLength(7);
  for (const key of OIL) await expect(checked(page, key), key).toHaveAttribute('data-value', 'na');
  await expect(checked(page, 'limpeza')).toHaveCount(0);
  await expect(page.getByRole('button', { name: oilNaChipText(OIL.length) })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /itens? de óleo como NA$/ })).toHaveCount(0);
  await expect.poll(async () => (await outbox(page)).filter((op) => op.path === `sheet/${transformer.blockId}/nameplate/tipo_de_isolacao`).at(-1)?.value).toBe('Á SECO');

  // The TC: every field of its definition, none of them POTÊNCIA NOMINAL.
  const tc = getDefinition(SEED_VERSION, 'cabine_primaria', 'tc');
  await openSheet(page, built.relatorioId, sheetOf('tc').blockId);
  for (const field of tc.nameplate) await expect(plateField(page, field.key).first(), field.key).toBeAttached();
  await expect(plateField(page, 'potencia_nominal')).toHaveCount(0);
  await expect(page.locator('#ficha-nameplate').getByText(/potência nominal/i)).toHaveCount(0);

  // The TP keeps its POTÊNCIA NOMINAL.
  await openSheet(page, built.relatorioId, sheetOf('tp').blockId);
  await expect(plateField(page, 'potencia_nominal').first()).toBeAttached();
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

/** The item rows of a printed site table (five cells), without its header row. */
const itemRows = (table: string[][]): string[][] => table.filter((cells) => cells.length === 5).slice(1);

/** The standard relatório cut down to Cubículo Enel with no equipment (its section blocks kept), Em campo: generated in seconds. */
function smallRelatorio(): { relatorioId: string; enelId: string; drafts: OpDraft[] } {
  const built = newRelatorioDrafts(account);
  const locations = built.drafts.filter((draft) => draft.kind === 'create' && draft.path.startsWith('location/')).map((draft) => draft.value as unknown as LocationRow);
  const enel = locations.find((location) => location.kind === 'cabine' && location.name === ENEL)!;
  const drafts = built.drafts.filter((draft) => {
    if (draft.kind !== 'create') return true;
    if (draft.path.startsWith('location/')) return (draft.value as unknown as LocationRow).id === enel.id;
    if (draft.path.startsWith('block/')) return (draft.value as unknown as BlockRow).location_id === null;
    return !draft.path.startsWith('equipment/');
  });
  return { relatorioId: built.relatorioId, enelId: enel.id, drafts: [...drafts, emCampoDraft(account, built.relatorioId)] };
}

test('@p0 15.3-E2E-002 v9 local: items 20 and 21 close Ambiente, are answered into the outbox, and the DOCX prints them in VERIFICAÇÕES DO LOCAL', async ({ page }) => {
  test.setTimeout(420_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = smallRelatorio();
  await pushDrafts(page, database, built.drafts);
  await page.goto(`/relatorio/${built.relatorioId}/local/${built.enelId}/verificacoes`);
  await expect(page.locator('.sheet-header .sheet-title')).toHaveText(`Verificações do local — ${ENEL}`, { timeout: 30_000 });

  // The surface counts the seed's items (21 on v9), the two new ones last, in the Ambiente group.
  expect(SITE).toHaveLength(21);
  expect([GRADES!.number, PINTURA!.number]).toEqual([20, 21]);
  await expect(page.getByTestId('local-progress')).toHaveText(`0 de ${SITE.length}`);
  await expect(page.locator('li.checklist-row')).toHaveCount(SITE.length);
  const ambiente = page.locator('.content > section.vl-group').last();
  await expect(ambiente.locator('h3.vl-group-title')).toHaveText('Ambiente');
  const ambienteSize = siteChecklistOf(SEED_VERSION)!.groups.at(-1)!.items.length;
  await expect(ambiente.locator('li.checklist-row')).toHaveCount(ambienteSize);
  await expect(ambiente.locator('li.checklist-row').nth(ambienteSize - 2)).toHaveAttribute('data-item-key', GRADES!.key);
  await expect(ambiente.locator('li.checklist-row').last()).toHaveAttribute('data-item-key', PINTURA!.key);
  await expect(siteRow(page, GRADES!.key)).toContainText(GRADES!.label);
  await expect(siteRow(page, PINTURA!.key)).toContainText(PINTURA!.label);

  // Item 20 NC with one of its chips; item 21 C.
  const phrase = GRADES!.nc_phrases[1]!;
  await siteRow(page, GRADES!.key).getByRole('radio', { name: 'Não conforme', exact: true }).click();
  await expect(siteRow(page, GRADES!.key).getByRole('radio', { name: 'Não conforme', exact: true })).toHaveAttribute('aria-checked', 'true');
  const chips = siteRow(page, GRADES!.key).getByRole('group', { name: `Observações sugeridas do item ${GRADES!.number}` });
  await expect(chips.getByRole('button')).toHaveText(GRADES!.nc_phrases);
  await chips.getByRole('button', { name: phrase }).click();
  const observation = siteRow(page, GRADES!.key).getByRole('textbox', { name: `Observação do item ${GRADES!.number}` });
  await expect(observation).toHaveValue(phrase);
  // The chip hands the caret back to the field; leaving it commits the observation.
  await expect(observation).toBeFocused();
  await page.keyboard.press('Tab');
  await siteRow(page, PINTURA!.key).getByRole('radio', { name: 'Conforme', exact: true }).click();
  await expect(siteRow(page, PINTURA!.key).getByRole('radio', { name: 'Conforme', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('local-progress')).toHaveText(`2 de ${SITE.length}`);
  const path = (key: string, field: 'result' | 'observation') => `location/${built.enelId}/checklist/${key}/${field}`;
  await expect
    .poll(async () => {
      const ops = await outbox(page);
      const last = (p: string) => ops.filter((op) => op.path === p).at(-1)?.value;
      return [last(path(GRADES!.key, 'result')), last(path(GRADES!.key, 'observation')), last(path(PINTURA!.key, 'result'))];
    })
    .toEqual(['NC', phrase, 'C']);

  // Revision 1: the DOCX prints both items, numbered 20 and 21, under AMBIENTE.
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
  const tables = tablesOf(sectionXml(document, 9)).filter((table) => table[0]![0] === SITE_TITLE);
  expect(tables).toHaveLength(1);
  const items = itemRows(tables[0]!);
  expect(items).toHaveLength(SITE.length);
  const upper = (text: string) => text.toLocaleUpperCase('pt-BR');
  expect(items[19]).toEqual([`20. ${upper(GRADES!.label)}`, '', 'X', '', phrase]);
  expect(items[20]).toEqual([`21. ${upper(PINTURA!.label)}`, 'X', '', '', '']);
  // Both sit after the AMBIENTE group row, the table's last group.
  const groupAt = tables[0]!.findIndex((cells) => cells.length === 1 && cells[0] === 'AMBIENTE');
  const gradesAt = tables[0]!.findIndex((cells) => cells[0] === `20. ${upper(GRADES!.label)}`);
  expect(groupAt).toBeGreaterThan(0);
  expect(gradesAt).toBeGreaterThan(groupAt);
});
