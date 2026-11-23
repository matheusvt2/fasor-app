import { choiceValue, EARTH_RESISTANCE_PARAGRAPH, SEED_VERSION, type BlockRow } from '@app/domain';
import type { Page } from '@playwright/test';
import { escapeDialog } from './support/dialogs.ts';
import { kernelOf, openStep, outbox, outboxValues, setUpRelatorio, testSection } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { typeRows } from './support/palette.ts';
import { pdfTextItems } from './support/pdf-text.ts';
import { confirmIssue, setParecer } from './support/relatorio-flow.ts';
import { expandLocation, section9Chevron } from './support/tree.ts';

/*
 * 28.10-E2E-001 (batch e28c, Story 28.10; B-14, B-12, B-3), at 1280 px. A v18 relatório from the standard template, which
 * holds no Malha de aterramento: its revision 1 PDF reads section 1 "Transformação de ⟨cliente⟩" and section 2 has no
 * paragraph on earth resistance. A Malha de aterramento is added as a person adds it ("Adicionar equipamento no local
 * Geradores"), and revision 2's PDF prints the paragraph citing NBR 15749 and NBR 15751. Then, on a v15 relatório, a TP's
 * thermography marked out of load and applied by hand shows Bruno's band. The two revisions go through the api's one
 * queue and LibreOffice, so this spec runs in the queue lane. Narrowing: "the two relatórios" of the story's Definition of
 * Done are the same relatório before and after its Malha (revisions 1 and 2), which also shows the rule reads the live tree.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const JOB_TIMEOUT = 150_000;
const LOCAL = 'Geradores';
const MALHA = 'malha_aterramento';
const THERMO = 'termografia';

/** Issues the next revision `number` from the Sumário and returns its PDF's text on one line. */
async function issuePdfText(page: Page, relatorioId: string, number: number): Promise<string> {
  await setParecer(page, relatorioId, 'Apto');
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  const dialog = page.getByRole('dialog', { name: 'Gerar relatório' });
  await expect(dialog).toBeVisible();
  await dialog.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' }).click();
  await confirmIssue(dialog);
  await expect(page.getByTestId('toast')).toHaveText(`Revisão ${number} pronta — DOCX e PDF`, { timeout: JOB_TIMEOUT });
  await escapeDialog(page, dialog);
  let revisionId = '';
  await expect
    .poll(async () => {
      const records = await readStore<{ entity: string; row: { id: string; relatorio_id: string; number: number } }>(page, database, 'entities');
      revisionId = records.find((record) => record.entity === 'revision' && record.row.relatorio_id === relatorioId && record.row.number === number)?.row.id ?? '';
      return revisionId;
    })
    .not.toBe('');
  const pdf = await page.request.get(`/api/revisions/${revisionId}/pdf`);
  expect(pdf.status()).toBe(200);
  return (await pdfTextItems(new Uint8Array(await pdf.body()))).join(' ').replace(/\s+/gu, ' ');
}

test('@p0 28.10-E2E-001 v18: section 1 reads "de ⟨cliente⟩"; section 2 prints the earth paragraph only once a Malha de aterramento is in the relatório; a v15 thermography applied by hand reads Bruno\'s band', async ({ page }) => {
  test.setTimeout(540_000);
  expect(SEED_VERSION).toBe('v18');
  const { relatorioId } = await setUpRelatorio(page, account, database);

  // Revision 1, no Malha: "de" in section 1, no paragraph on earth resistance.
  const without = await issuePdfText(page, relatorioId, 1);
  expect(without).toMatch(/Distribuição e Transformação de \S/u);
  expect(without).not.toContain('Transformação da ');
  expect(without).not.toContain('Resistência Ôhmica de Aterramento');
  expect(without).not.toContain('NBR 15749');

  // A Malha de aterramento added in the local, as a person adds it on a tablet (the field palette's rows are drawn below
  // 1280 px; at 1280 the office rows stand in their place).
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  const chevron = section9Chevron(page);
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expandLocation(page, LOCAL);
  await page.getByRole('button', { name: `Adicionar equipamento no local ${LOCAL}`, exact: true }).click();
  const palette = page.getByRole('dialog', { name: 'Adicionar bloco' });
  await typeRows(palette, [MALHA]).click();
  await expect(palette).toBeHidden();
  await expect
    .poll(async () => (await outbox(database, page)).filter((op) => op.kind === 'create' && op.path.startsWith('block/') && (op.value as Partial<BlockRow>).block_type === MALHA).length)
    .toBe(1);

  await page.setViewportSize({ width: 1280, height: 900 });

  // Revision 2: the paragraph after the one on insulation, before "Obs:".
  const withMalha = await issuePdfText(page, relatorioId, 2);
  const insulation = withMalha.indexOf('Resistência de Isolação:');
  const earth = withMalha.indexOf('Resistência Ôhmica de Aterramento:');
  const obs = withMalha.indexOf('Obs: Em todas as manutenções');
  expect(insulation).toBeGreaterThan(-1);
  expect(earth).toBeGreaterThan(insulation);
  expect(obs).toBeGreaterThan(earth);
  // The kernel's words, read across the PDF's line breaks (a wrapped line is one space).
  expect(withMalha.slice(earth, obs).trim()).toBe(EARTH_RESISTANCE_PARAGRAPH.replace(/\s+/gu, ' '));
  expect(withMalha).toContain('exigida pelas normas NBR 15749 e NBR 15751.');
  expect(withMalha).not.toContain('NBR 5419');

  // The band, on every seed: a v15 TP's thermography out of load, applied by hand.
  const v15 = await setUpRelatorio(page, account, database, () => [], 'v15');
  const tp = v15.sheets.find((sheet) => sheet.blockType === 'tp')!;
  await openStep(page, v15.relatorioId, tp.blockId, 'Ensaios');
  const load = `sheet/${tp.blockId}/test/${THERMO}/value/em_carga`;
  await testSection(page, THERMO).getByRole('radiogroup', { name: 'Equipamento em carga' }).getByRole('radio', { name: 'Não' }).click();
  await expect.poll(async () => (await outboxValues(database, page, load)).at(-1)).toEqual(choiceValue('nao'));
  await expect(testSection(page, THERMO)).toHaveAttribute('data-applicability', 'na');
  await testSection(page, THERMO).getByRole('button', { name: 'Aplicar este ensaio' }).click();
  await expect.poll(async () => (await outboxValues(database, page, `sheet/${tp.blockId}/test/${THERMO}/applicability`)).at(-1)).toBe('applied');
  const applied = (await kernelOf(page, database, v15.relatorioId, tp.blockId)).measurement(THERMO).applicability;
  expect(`${applied.appliedLead} ${applied.appliedText}`).toBe('Ensaio aplicado por você. O app tinha marcado N.A.: equipamento fora de carga.');
  await expect(testSection(page, THERMO).locator('.v13-applied-band .band-text')).toHaveText('Ensaio aplicado por você. O app tinha marcado N.A.: equipamento fora de carga.');
});
