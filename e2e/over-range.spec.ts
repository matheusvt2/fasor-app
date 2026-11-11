import type { OpDraft } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { escapeDialog } from './support/dialogs.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { confirmIssue } from './support/relatorio-flow.ts';
import { emCampoDraft, newRelatorioDrafts, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNowAndReturn } from './support/sync.ts';

/*
 * Story 22.10 (contract 32): a megger or a micro-ohmmeter that shows OL, as a person records it
 * at 1280 px. Cadastros gets the instrument's two limits ("Limite de medição"); the sheet picks
 * the instrument, types "OL" in an insulation cell (stored as the 2 TΩ limit, shown "> 2" with
 * TΩ, within > 400 MΩ), records "> limite" on a contact resistance cell (the 2.000 µΩ limit,
 * out of < 250 µΩ, the conclusion Reprovado · Com restrições), and a ratio cell refuses "OL" and
 * offers no "> limite". The issued DOCX prints "> 2 TΩ". It issues a revision through the api's
 * one queue and LibreOffice, so this spec runs in the serial group (`e2e/support/groups.ts`).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  // This worker's Empresa B (E6-Q7): its company, its user and its device database.
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

interface OutboxRow {
  path: string;
  value: unknown;
}

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const written = async (page: Page, path: string) => (await outbox(page)).filter((row) => row.path === path).map((row) => row.value);
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const cellInput = (page: Page, name: string) => page.getByRole('textbox', { name, exact: true });
const cellBox = (page: Page, key: string): Locator => page.locator(`.ficha-cell[data-cell="${key}"]`).filter({ visible: true });
const toast = (page: Page) => page.getByTestId('toast');

/** The 10 kV megger and micro-ohmmeter of the test, no limits yet: Cadastros sets them. */
function instrumentDraft(id: string): OpDraft {
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
      code: 'MEG-10',
      name: 'Megôhmetro 10 kV',
      manufacturer: 'Megger',
      model: 'MIT1025',
      serial: 'MG-2210',
      cert_number: '22100/26',
      laboratory: null,
      calibrated_at: '2026-08-28',
      calibration_interval_months: 12,
      rbc_accredited: null,
      test_isolacao: { raw: '10', unit: 'kV' },
      test_resistencia_contato: { raw: '100', unit: 'A' },
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

/** Picks the registry instrument `code` on the test section `testKey` of the open sheet. */
async function pick(page: Page, testKey: string, code: string): Promise<void> {
  const section = page.locator(`section[data-test-key="${testKey}"]`);
  await section.getByRole('button', { name: /^Instrumento/ }).click();
  await section.getByRole('radiogroup', { name: 'Instrumentos cadastrados' }).getByRole('radio', { name: new RegExp(`^${code}`) }).click();
  await expect(section.getByRole('button', { name: new RegExp(`^Instrumento ${code}`) })).toBeVisible();
}

test('@p0 22.10-E2E-001 Cadastros sets the instrument limits; "OL" stores the 2 TΩ limit within > 400 MΩ, "> limite" the 2.000 µΩ one out of < 250 µΩ (Reprovado · Com restrições), a ratio cell refuses it, and the DOCX prints "> 2 TΩ"', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const megId = newId();
  const built = newRelatorioDrafts(account);
  await pushDrafts(page, database, [instrumentDraft(megId), ...built.drafts, emCampoDraft(account, built.relatorioId)]);
  const chave = built.sheets.find((sheet) => sheet.blockType === 'chave_seccionadora' && sheet.locationName === 'Cubículo Enel')!;
  const tp = built.sheets.find((sheet) => sheet.blockType === 'tp')!;
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });

  // Cadastros › Instrumentos: the two limits, typed as the test defaults are.
  await page.goto('/cadastros');
  await syncNowAndReturn(page);
  await page.getByRole('tab', { name: 'Instrumentos' }).click();
  await expect(page.getByRole('button', { name: /MEG-10/ })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /MEG-10/ }).click();
  const panel = page.locator('.registry-panel');
  const isoValue = panel.getByRole('textbox', { name: 'Limite de medição (Isolação) — Valor' });
  await isoValue.scrollIntoViewIfNeeded();
  await isoValue.fill('2');
  // e22g (review S1): the units as a keyboard types them, "T" and "uΩ", are committed as the Ω table's TΩ and µΩ; a unit
  // the cells cannot read shows Cadastros' helper until it is corrected.
  const isoUnit = panel.getByRole('textbox', { name: 'Limite de medição (Isolação) — Unidade' });
  await isoUnit.fill('T');
  await isoUnit.blur();
  await expect(isoUnit).toHaveValue('TΩ');
  await panel.getByRole('textbox', { name: 'Limite de medição (Resistência de contato) — Valor' }).fill('2.000');
  const contactUnit = panel.getByRole('textbox', { name: 'Limite de medição (Resistência de contato) — Unidade' });
  const unreadable = panel.getByText('Unidade não reconhecida: use µΩ, mΩ, Ω, kΩ, MΩ, GΩ ou TΩ (ex.: 2 e TΩ).');
  await contactUnit.fill('ohm?');
  await expect(unreadable).toBeVisible();
  await contactUnit.fill('uΩ');
  await expect(unreadable).toHaveCount(0);
  await contactUnit.blur();
  await expect(contactUnit).toHaveValue('µΩ');
  await panel.getByRole('button', { name: 'Fechar edição' }).click();
  await expect.poll(async () => (await written(page, `registry/instrument/${megId}/range_isolacao`)).at(-1)).toEqual({ raw: '2', unit: 'TΩ' });
  await expect.poll(async () => (await written(page, `registry/instrument/${megId}/range_resistencia_contato`)).at(-1)).toEqual({ raw: '2.000', unit: 'µΩ' });

  // The seccionadora: the megger picked on the insulation, "OL" typed on T1.
  await page.goto(`/relatorio/${built.relatorioId}/ficha/${chave.blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  await pick(page, 'isolacao', 'MEG-10');
  const t1 = cellInput(page, 'T1, Valor');
  await t1.click();
  await page.keyboard.type('OL');
  await expect(cellBox(page, 'isolacao:0:0').locator('.mf-echo')).toHaveText('= > 2 TΩ');
  await page.keyboard.press('Enter');
  await expect.poll(() => written(page, `sheet/${chave.blockId}/test/isolacao/cell/0/0`)).toEqual([{ raw: '2', unit: 'TΩ', state: 'over_range' }]);
  await expect(t1).toHaveValue('> 2');
  await expect(cellBox(page, 'isolacao:0:0').locator('.unit-cycle')).toHaveAccessibleName('teraohms, toque para alternar');
  // Within > 400 MΩ: no amber state, no helper.
  await expect(cellBox(page, 'isolacao:0:0').locator('.measurement-field')).not.toHaveAttribute('data-state', 'out-of-limit');
  await expect(cellBox(page, 'isolacao:0:0').locator('.mf-helper')).toHaveCount(0);
  // A second reading in GΩ, so the printed VALORES carries no single unit and the limit prints with its own.
  await expect(cellInput(page, 'T3, Valor')).toBeFocused();
  // e22g (review S2): the slot never follows a row above the limit (the instrument's TΩ): it shows the column's GΩ, so
  // the plain "150" typed after "OL" is stored in GΩ, not 1000 times off.
  await expect(cellBox(page, 'isolacao:1:0').locator('.unit-cycle')).toHaveAccessibleName('gigaohms, toque para alternar');
  await page.keyboard.type('150');
  await page.keyboard.press('Enter');
  await expect.poll(() => written(page, `sheet/${chave.blockId}/test/isolacao/cell/1/0`)).toEqual([{ raw: '150', unit: 'GΩ', state: 'measured' }]);

  // The contact resistance: the instrument's 2.000 µΩ limit from the cell's Overflow.
  await pick(page, 'resistencia_contato', 'MEG-10');
  const contact = cellBox(page, 'resistencia_contato:0:0');
  await contact.getByRole('button', { name: /^Mais opções de / }).click();
  await page.getByRole('menuitem', { name: '> limite' }).click();
  await expect.poll(() => written(page, `sheet/${chave.blockId}/test/resistencia_contato/cell/0/0`)).toEqual([{ raw: '2000', unit: 'µΩ', state: 'over_range' }]);
  await expect(contact.locator('input.mf-value')).toHaveValue('> 2.000');
  await expect(contact.locator('.measurement-field')).toHaveAttribute('data-state', 'out-of-limit');
  await expect(contact.locator('.mf-helper[role="status"]')).toContainText('Acima do aceitável (<250 µΩ)');
  // Story 22.4's floor: Reprovado · Com restrições.
  await stepper(page).getByRole('button', { name: /^Conclusão/ }).click();
  await expect(page.getByRole('radiogroup', { name: 'Resultado' }).getByRole('radio', { name: 'Reprovado' })).toHaveClass(/\bis-floor\b/);
  await expect(page.getByRole('radiogroup', { name: 'Restrições' }).getByRole('radio', { name: 'Com restrições' })).toHaveClass(/\bis-floor\b/);

  // The TP's ratio: "OL" refused with the authored line, nothing written, no "> limite".
  await page.goto(`/relatorio/${built.relatorioId}/ficha/${tp.blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  const ratio = cellBox(page, 'relacao_transformacao:0:3');
  await ratio.locator('input.mf-value').click();
  await page.keyboard.type('OL');
  await page.keyboard.press('Enter');
  await expect(ratio.locator('.helper')).toHaveText('O ensaio de relação de transformação não aceita valor acima do limite: informe o valor medido.');
  expect(await written(page, `sheet/${tp.blockId}/test/relacao_transformacao/cell/0/3`)).toEqual([]);
  await ratio.getByRole('button', { name: /^Mais opções de / }).click();
  await expect(page.getByRole('menuitem', { name: 'Não medido' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: '> limite' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // The issued DOCX: "> 2 TΩ" on T1 (the VALORES header names no single unit), "> 2.000" under "VALORES (µΩ)".
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  const dialog = page.getByRole('dialog', { name: 'Gerar relatório' });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await dialog.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' }).click();
  await confirmIssue(dialog);
  await expect(toast(page)).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: 150_000 });
  await escapeDialog(page, dialog);
  const revision = (await readStore<{ entity: string; row: { id: string; number: number } }>(page, database, 'entities')).find((record) => record.entity === 'revision' && record.row.number === 1)!;
  const response = await page.request.get(`/api/revisions/${revision.row.id}/docx`);
  expect(response.status()).toBe(200);
  const tables = extractStructure(Buffer.from(await response.body())).tables;
  // The seccionadora's paired insulation table (the other seccionadoras of the local print "-").
  // Seed v12 (Story 22.8, e22s): each half prints its row's TENSÃO (kV) right after the connections;
  // a row with a reading prints the instrument's 10 kV, a row with none "-".
  const insulation = tables.find((table) => table[0]?.[0] === 'SECCIONADORA CONTATO ABERTO' && table.some((row) => row[0] === 'T1' && row[4] !== '-'));
  expect(insulation).toBeDefined();
  // Batch e23v (seed v13, Story 23.5): each half also prints its 20 °C column beside VALORES, "-" on a reading above the limit
  // (never corrected) and on a row with none.
  expect(insulation!.find((row) => row[0] === 'T1')).toEqual(['T1', 'T2', 'MASSA', '10', '> 2 TΩ', '-', 'FASE A', 'MASSA', '', '-', '-', '-']);
  expect(insulation!.find((row) => row[0] === 'T3')?.[4]).toBe('150 GΩ');
  const contactTable = tables.find((table) => table.some((row) => row.includes('VALORES (µΩ)')) && table.some((row) => row[0] === 'T1-T2' && row[3] !== '-'));
  expect(contactTable?.find((row) => row[0] === 'T1-T2')).toEqual(['T1-T2', 'FASE A', 'MASSA', '> 2.000']);
});
