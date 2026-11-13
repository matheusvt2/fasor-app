import { RELAY_CLAUSE, SEED_VERSION, STANDARD_TEMPLATE_NAME } from '@app/domain';
import type { Page } from '@playwright/test';
import { extractStructure, type DocxStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { escapeDialog } from './support/dialogs.ts';
import { sheetTitle } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { confirmIssue, setParecer } from './support/relatorio-flow.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Story 25.22 (seed v15 `obra_reads_site`, `relay_clause_by_exclusions`, `validity_line_without_number` and its own
 * section texts and ratio headers; the names "TP" and "TC" on every seed), at 1280 px. A new v15 relatório whose obra
 * has a site and whose Etapa 2 holds a Local and an exclusion naming the relays, the ART left blank: the TP's and the
 * TC's sheets are named "TP" and "TC"; its issued DOCX prints the site on the cover and in section 1 as the unit,
 * section 3's first paragraph without the relay, the corrected texts of sections 2 and 4 to 6, the validity line with
 * no number and no bracket, and the ratio tables headed "TPs" and "TCs". The template's palette and type dialog read
 * "TP" and "TC". The issue goes through the api's one queue and LibreOffice, so this spec runs in the `queue` lane.
 * Every value is invented.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const SITE = 'Unidade Sintética Norte';
const NAME = 'Obra sintética 2522';
const LOCAL = 'Sala elétrica sintética';

/** Issues revision 1 from the Sumário and returns its DOCX's structure. */
async function issueAndRead(page: Page, relatorioId: string): Promise<DocxStructure> {
  await setParecer(page, relatorioId, 'Apto');
  const dialog = page.getByRole('dialog', { name: 'Gerar relatório' });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await dialog.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' }).click();
  await confirmIssue(dialog);
  await expect(page.getByTestId('toast')).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: 150_000 });
  await escapeDialog(page, dialog);
  const revision = (await readStore<{ entity: string; row: { id: string; number: number } }>(page, database, 'entities')).find((record) => record.entity === 'revision' && record.row.number === 1)!;
  const response = await page.request.get(`/api/revisions/${revision.row.id}/docx`);
  expect(response.status()).toBe(200);
  return extractStructure(Buffer.from(await response.body()));
}

test('@p0 25.22-E2E-001 a v15 relatório: the cover and section 1 read the site, the fixed texts and the ratio headers are corrected, and the TP and the TC are named plainly', async ({ page }) => {
  test.setTimeout(300_000);
  expect(SEED_VERSION).toBe('v15');
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const project = built.drafts[0]!;
  project.value = { ...(project.value as Record<string, unknown>), name: NAME, site: SITE };
  const scope = { relatorioId: built.relatorioId };
  await pushDrafts(page, database, [
    ...built.drafts,
    emCampoDraft(account, built.relatorioId),
    officeDraft(account, scope, 'relatorio/setup/local', LOCAL),
    officeDraft(account, scope, 'relatorio/setup/exclusions', ['Quadros elétricos terminais', 'Relés de proteção']),
  ]);

  // The names on screen: the TP's and the TC's sheets.
  for (const type of ['tp', 'tc'] as const) {
    const sheet = built.sheets.find((one) => one.blockType === type)!;
    await page.goto(`/relatorio/${built.relatorioId}/ficha/${sheet.blockId}`);
    await expect(sheetTitle(page)).toBeVisible({ timeout: 30_000 });
    await expect(sheetTitle(page)).toHaveText(new RegExp(`^${type.toUpperCase()}\\b`));
    await expect(sheetTitle(page)).not.toContainText('proteção');
  }

  const { tables, paragraphs } = await issueAndRead(page, built.relatorioId);
  const all = paragraphs.join('\n');
  // The cover and section 1: the site, never the Local.
  expect(tables.flat().find((row) => row[0] === 'Cidade/local')?.[1]).toBe(SITE);
  expect(paragraphs.find((p) => p.startsWith('O presente relatório tem por objetivo'))).toMatch(new RegExp(`nas Cabines Primárias de Proteção, Distribuição e Transformação da .+, unidade ${SITE}\\.$`));
  expect(all).not.toContain(LOCAL);
  // Section 2 and sections 4 to 6.
  expect(all).not.toContain('NBR 5419');
  expect(all).toContain('falhas iminentes');
  for (const word of ['EPCs', 'EPIs', 'QGBTs', 'Transformador de Força (a seco)', 'Conforme NR-10, item 10.5.1:']) expect(all, word).toContain(word);
  for (const word of ['EPC’s', 'EPI’s', 'QGBT’s', 'à seco', 'capítulo 5.1', 'eminentes']) expect(all, word).not.toContain(word);
  // Section 3: the relays are excluded, so the first paragraph ends before the relay.
  const section3 = paragraphs.find((p) => p.startsWith('Os serviços executados limitam-se'))!;
  expect(section3.endsWith('de Média Tensão.')).toBe(true);
  expect(section3).not.toContain(RELAY_CLAUSE);
  // Section 10: one validity line, no number and no bracket.
  expect(paragraphs.filter((p) => p.startsWith('Este relatório tem validade apenas'))).toEqual([expect.stringMatching(/^Este relatório tem validade apenas acompanhado da respectiva (ART|TRT|ART\/TRT)\.$/)]);
  expect(all).not.toMatch(/\[(ART|TRT|ART\/TRT)\]/);
  // The ratio tables.
  const headers = new Set(tables.flat(2));
  for (const header of ['TPs', 'TCs']) expect(headers.has(header), header).toBe(true);
  for (const header of ["TP's", 'TPS']) expect(headers.has(header), header).toBe(false);

  // The palette and the type dialog of the template.
  await page.goto('/templates');
  await page.getByRole('button', { name: `Abrir template ${STANDARD_TEMPLATE_NAME}`, exact: true }).click();
  await expect(page).toHaveURL(/\/templates\/[0-9a-f-]{36}$/);
  const palette = page.getByRole('complementary', { name: 'Paleta de blocos' });
  await expect(palette.getByRole('button', { name: 'Editar padrões de TP', exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(palette.getByRole('button', { name: 'Editar padrões de TC', exact: true })).toBeVisible();
  await expect(palette).not.toContainText('proteção');
  await palette.getByRole('button', { name: 'Editar padrões de TC', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Padrões de TC', exact: true });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
