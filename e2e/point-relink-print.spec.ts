import { newPointRow, type OpDraft, type PointRow } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { paragraphText, readZipEntries } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { downloadBytes, downloadFrom } from './support/download.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { pdfTextItems } from './support/pdf-text.ts';
import { readStore } from './support/outbox.ts';
import { confirmIssue, setParecer } from './support/relatorio-flow.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts, type SeededSheet } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * 20.4-E2E-005: three points of attention relinked in "Equipamento ou local" as a person
 * would (two "Geral" points picked to an equipment and to a local, a point of an equipment
 * cleared to "Geral"), then one revision generated and section 8 read back from its own
 * heading (E7-A6: never by position) in the DOCX and in the PDF: the action-plan's Local/TAG
 * names each point by its new link, through `pointTitle`. It generates through the api's one
 * queue and LibreOffice, so it runs in the serial group (`e2e/support/groups.ts`).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const JOB_TIMEOUT = 150_000;
const POINTS_HEADING = 'PONTOS DE ATENÇÃO';
const TO_EQUIPMENT = 'Ponto religado ao equipamento';
const TO_LOCAL = 'Ponto religado ao local';
const TO_GERAL = 'Ponto devolvido ao Geral';
const LOCAL = '1° Subsolo';

const toast = (page: Page) => page.getByTestId('toast');
const cards = (page: Page) => page.locator('.poa-list > .point-of-attention-card:not(.is-auto):not(.is-editing)');
const storedPoints = async (page: Page) =>
  (await readStore<{ entity: string; row: PointRow }>(page, database, 'entities')).filter((record) => record.entity === 'point').map((record) => record.row);
const enelChaves = (sheets: readonly SeededSheet[]) => sheets.filter((sheet) => sheet.blockType === 'chave_seccionadora' && sheet.locationName === 'Cubículo Enel');
/** Text with every run of white space taken out: a PDF table cell may wrap anywhere. */
const compact = (text: string) => text.replace(/\s+/g, '');

/** "Editar" on the card titled `title`, a pick in its "Equipamento ou local", then "Concluir". */
async function relink(page: Page, position: number, title: string, option: string): Promise<void> {
  await page.getByRole('button', { name: `Editar o ponto ${position}, ${title}` }).click();
  const editor: Locator = page.getByRole('article', { name: `Ponto de atenção ${position} em edição` });
  const picker = editor.getByRole('button', { name: /Equipamento ou local/ });
  await picker.click();
  await page.getByRole('listbox').getByRole('option', { name: option, exact: true }).click();
  await expect(picker).toContainText(option);
  await editor.getByRole('button', { name: 'Concluir' }).click();
  await expect(editor).toHaveCount(0);
}

test('@p1 20.4-E2E-005 section 8 of the generated DOCX and PDF names each relinked point by its new equipment, local or "—"', async ({ page }) => {
  test.setTimeout(420_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const scope = { relatorioId: built.relatorioId };
  const equipmentOf = new Map(
    built.drafts
      .filter((draft) => draft.kind === 'create' && draft.path.startsWith('block/'))
      .map((draft) => draft.value as { id: string; equipment_id: string | null })
      .filter((row) => row.equipment_id !== null)
      .map((row) => [row.id, row.equipment_id!] as const),
  );
  const [first, second] = enelChaves(built.sheets);
  const rows: PointRow[] = [];
  rows.push(newPointRow({ id: newId(), relatorioId: built.relatorioId, text: TO_EQUIPMENT, equipmentId: null, origin: 'manual', action: null }, rows));
  rows.push(newPointRow({ id: newId(), relatorioId: built.relatorioId, text: TO_LOCAL, equipmentId: null, origin: 'manual', action: null }, rows));
  rows.push(newPointRow({ id: newId(), relatorioId: built.relatorioId, text: TO_GERAL, equipmentId: equipmentOf.get(first!.blockId)!, origin: 'manual', action: null }, rows));
  const points: OpDraft[] = rows.map((row) => officeDraft(account, scope, `point/${row.id}`, row, 'create'));
  await pushDrafts(page, database, [...built.drafts, emCampoDraft(account, built.relatorioId), ...points]);
  await page.goto(`/relatorio/${built.relatorioId}/pontos`);
  await expect(cards(page)).toHaveCount(3, { timeout: 30_000 });

  const equipmentTitle = `${second!.tag} · Cubículo Enel`;
  const localTitle = `${LOCAL} · Verificações do local`;
  await relink(page, 1, 'Geral', `${second!.tag} · Chave seccionadora · Cubículo Enel`);
  await relink(page, 2, 'Geral', localTitle);
  await relink(page, 3, `${first!.tag} · Cubículo Enel`, 'Geral');
  await expect(cards(page).locator('.poa-title')).toHaveText([equipmentTitle, localTitle, 'Geral']);
  await expect
    .poll(async () => (await storedPoints(page)).map((row) => [row.text, row.equipment_id, row.location_id ?? null]))
    .toEqual([
      [TO_EQUIPMENT, equipmentOf.get(second!.blockId), null],
      [TO_LOCAL, null, expect.any(String)],
      [TO_GERAL, null, null],
    ]);

  await setParecer(page, built.relatorioId);
  const dialog = page.getByRole('dialog', { name: 'Gerar relatório' });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await expect(dialog).toBeVisible();
  const generate = dialog.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' });
  await expect(generate).toBeEnabled({ timeout: 30_000 });
  await generate.click();
  // The relatório's sheets are empty, so the issue is confirmed first.
  await confirmIssue(dialog);
  await expect(toast(page)).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });

  // DOCX: section 8, from its own heading to the next one; the action-plan's Local/TAG column.
  const docx = await downloadFrom(page, () => dialog.getByRole('button', { name: 'DOCX — abrir no Word' }).click());
  const document = readZipEntries(await downloadBytes(docx)).get('word/document.xml')!.toString('utf8');
  const headings = [...document.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].filter((m) => m[0].includes('w:val="Heading1"'));
  const at = headings.findIndex((m) => paragraphText(m[0]).includes(POINTS_HEADING));
  expect(at, 'the document has the points section').toBeGreaterThanOrEqual(0);
  const section = document.slice(headings[at]!.index!, headings[at + 1]?.index ?? document.length);
  const table = section.slice(section.indexOf('<w:tbl>'));
  const tableRows = [...table.matchAll(/<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/g)].map((row) =>
    [...row[1]!.matchAll(/<w:tc(?:\s[^>]*)?>([\s\S]*?)<\/w:tc>/g)].map((cell) => paragraphText(cell[1]!)),
  );
  expect(tableRows[0]![2]).toBe('Local/TAG');
  expect(tableRows.slice(1).map((cells) => [cells[1], cells[2]])).toEqual([
    [TO_EQUIPMENT, equipmentTitle],
    [TO_LOCAL, localTitle],
    [TO_GERAL, '—'],
  ]);

  // PDF: the same section, read from the last (body) occurrence of its heading to the next
  // heading's (the ÍNDICE lists both first); each point's text is followed by its Local/TAG.
  const pdf = await downloadFrom(page, () => dialog.getByRole('button', { name: 'PDF — enviar ao cliente' }).click());
  expect(pdf.suggestedFilename()).toBe('relatorio-rev-1.pdf');
  const text = compact((await pdfTextItems(new Uint8Array(await downloadBytes(pdf)))).join(' '));
  const headingTitle = (m: RegExpMatchArray) => compact(paragraphText(m[0]).replace(/^\d+\s+/, ''));
  const from = text.lastIndexOf(headingTitle(headings[at]!));
  expect(from).toBeGreaterThanOrEqual(0);
  const next = headings[at + 1];
  const to = next === undefined ? text.length : text.lastIndexOf(headingTitle(next));
  expect(to).toBeGreaterThan(from);
  const eight = text.slice(from, to);
  for (const [pointText, local] of [
    [TO_EQUIPMENT, equipmentTitle],
    [TO_LOCAL, localTitle],
    [TO_GERAL, '—'],
  ] as const) {
    expect(eight, `${pointText} is followed by ${local}`).toContain(compact(`${pointText}${local}`));
  }
  // The point cleared to Geral prints no TAG of its old equipment.
  expect(eight).not.toContain(compact(`${TO_GERAL}${first!.tag}`));
});
