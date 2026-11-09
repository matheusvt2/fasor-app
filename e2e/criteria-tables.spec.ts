import { evaluateTest, getDefinition, instrumentHeaderOf, instrumentLimitNoteText, NOT_APPLICABLE_TEXT, type BlockRow, type InstrumentRow, type OpDraft, type TestEvaluation } from '@app/domain';
import type { Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { escapeDialog } from './support/dialogs.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { confirmIssue, setParecer } from './support/relatorio-flow.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Batch e23a (Stories 23.2 and 23.4, seed v13): a new relatório's dry transformer (EPÓXI, 13,8 kV /
 * 380 V, from the office) judged row by row by ANSI/NETA MTS-2023 Table 100.5, as a person records it
 * at 1280 px. The AT row's 20 GΩ is out of its ≥ 25.000 MΩ (the v12 > 400 MΩ would pass it), the BT
 * row's 600 MΩ within its ≥ 500 MΩ; the source details name the table and its edition. "OL" with the
 * picked megger's 2 TΩ limit is within, the standard note shows under the table; "> 1G" (1 GΩ) is
 * out of ≥ 25.000 MΩ. With every row within the floor reads Aprovado · Sem restrições, and the issued
 * DOCX prints ACEITÁVEL "POR LINHA", each row's minimum in its own column, POLARIZAÇÃO N/A on the row
 * above the limit and the note after the table. Every expected text is the kernel's. It issues a
 * revision through the api's one queue and LibreOffice, so it runs in the serial group.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  // This worker's Empresa B (E6-Q7): its company, its user and its device database.
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const toast = (page: Page) => page.getByTestId('toast');
const outboxValues = async (page: Page, path: string) => (await readStore<{ path: string; value: unknown }>(page, database, 'outbox')).filter((row) => row.path === path).map((row) => row.value);

/** The 10 kV megger with its 2 TΩ limit. */
function megger(id: string): InstrumentRow {
  return {
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
    test_resistencia_contato: null,
    test_relacao_transformacao: null,
    range_isolacao: { raw: '2', unit: 'TΩ' },
    certificate_file_id: null,
    removed_at: null,
  };
}

/** The kernel's evaluation of the transformer's insulation as this device stores the block. */
async function insulation(page: Page, blockId: string): Promise<TestEvaluation> {
  const record = (await readStore<{ entity: string; id: string; row: BlockRow }>(page, database, 'entities')).find((row) => row.entity === 'block' && row.id === blockId)!;
  const definition = getDefinition(record.row.seed_version, 'cabine_primaria', record.row.block_type);
  return evaluateTest(record.row, definition, definition.tests.find((candidate) => candidate.key === 'isolacao')!);
}

test('@p0 23.2-E2E-001 a v13 dry transformer judged by NETA Table 100.5 row by row; "OL" with a 2 TΩ megger within and noted, 1 GΩ out; the DOCX prints POR LINHA, each row\'s minimum, the note and POLARIZAÇÃO N/A', async ({ page }) => {
  test.setTimeout(300_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const tf = built.sheets.find((sheet) => sheet.blockType === 'transformador_forca')!;
  const row = megger(newId());
  const create: OpDraft = { kind: 'create', scope: 'company', company_id: account.companyId, project_id: null, relatorio_id: null, path: `registry/instrument/${row.id}`, value: row as never, prev_op_id: null, batch_id: null, meta: null, actor_id: account.userId };
  const plate = (key: string, value: unknown) => officeDraft(account, { relatorioId: built.relatorioId }, `sheet/${tf.blockId}/nameplate/${key}`, value);
  await pushDrafts(page, database, [
    create,
    ...built.drafts,
    emCampoDraft(account, built.relatorioId),
    plate('tipo_de_isolacao', 'EPÓXI'),
    plate('tensao_nominal_at', { raw: '13.8', unit: 'kV', state: 'measured' }),
    plate('tensao_nominal_bt', { raw: '380', unit: 'V', state: 'measured' }),
    plate('ligacao_secundaria', 'Dyn1'),
    officeDraft(account, { relatorioId: built.relatorioId }, `sheet/${tf.blockId}/test/isolacao/instrument`, instrumentHeaderOf(row, 'isolacao')),
  ]);
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  await page.goto(`/relatorio/${built.relatorioId}/ficha/${tf.blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  const section = page.locator('section[data-test-key="isolacao"]');
  await expect(section.getByRole('button', { name: /^Instrumento MEG-10/ })).toBeVisible({ timeout: 30_000 });

  // The criterion row: per row, the source details naming the table and its edition.
  const before = await insulation(page, tf.blockId);
  expect(before.perRow).toBe(true);
  expect(before.tables[0]!.rows.map((r) => r.criterionText)).toEqual(['≥ 25.000 MΩ', '≥ 25.000 MΩ', '≥ 500 MΩ']);
  await expect(section.locator('.mt-criterion')).toHaveText(`Aceitável ${before.criterionText}`);
  await section.locator('summary', { hasText: 'Fonte do critério' }).click();
  await expect(section.locator('.mt-source [data-source-line]')).toHaveText(before.sourceLines!);
  expect(before.sourceLines!.every((line) => line.startsWith('Tabela 100.5 (ANSI/NETA MTS-2023), seco, '))).toBe(true);

  // AT 20 GΩ: out of its ≥ 25.000 MΩ; BT 600 MΩ: within its ≥ 500 MΩ.
  const at = section.locator('.ficha-cell[data-cell="isolacao:0:1"]').filter({ visible: true });
  const second = section.locator('.ficha-cell[data-cell="isolacao:1:1"]').filter({ visible: true });
  const bt = section.locator('.ficha-cell[data-cell="isolacao:2:1"]').filter({ visible: true });
  await at.locator('input.mf-value').click();
  await page.keyboard.type('20G');
  await page.keyboard.press('Enter');
  await bt.locator('input.mf-value').click();
  await page.keyboard.type('600M');
  await page.keyboard.press('Enter');
  await expect.poll(() => outboxValues(page, `sheet/${tf.blockId}/test/isolacao/cell/2/1`)).toEqual([{ raw: '600', unit: 'MΩ', state: 'measured' }]);
  const judged = await insulation(page, tf.blockId);
  expect(judged.tables[0]!.rows.map((r) => r.cells[0]!.verdict)).toEqual(['out', null, 'within']);
  await expect(at.locator('.measurement-field')).toHaveAttribute('data-state', 'out-of-limit');
  await expect(at.locator('.mf-helper[role="status"]')).toContainText(judged.tables[0]!.rows[0]!.cells[0]!.helperText!);
  await expect(bt.locator('.measurement-field')).not.toHaveAttribute('data-state', 'out-of-limit');

  // "OL" on the AT row: the 2 TΩ limit meets ≥ 25.000 MΩ, and the note shows under the table.
  await at.locator('input.mf-value').fill('OL');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await outboxValues(page, `sheet/${tf.blockId}/test/isolacao/cell/0/1`)).at(-1)).toEqual({ raw: '2', unit: 'TΩ', state: 'over_range' });
  const note = section.locator('p.helper[data-limit-note]');
  await expect(note).toHaveText(instrumentLimitNoteText('2', 'TΩ'));
  expect((await insulation(page, tf.blockId)).limitNote).toBe(instrumentLimitNoteText('2', 'TΩ'));
  await expect(at.locator('.measurement-field')).not.toHaveAttribute('data-state', 'out-of-limit');

  // "> 1G" on the second AT row: 1 GΩ cannot prove ≥ 25.000 MΩ, out.
  await second.locator('input.mf-value').click();
  await page.keyboard.type('> 1G');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await outboxValues(page, `sheet/${tf.blockId}/test/isolacao/cell/1/1`)).at(-1)).toEqual({ raw: '1', unit: 'GΩ', state: 'over_range' });
  await expect(second.locator('.measurement-field')).toHaveAttribute('data-state', 'out-of-limit');
  expect((await insulation(page, tf.blockId)).tables[0]!.rows[1]!.cells[0]!.verdict).toBe('out');

  // 30 GΩ there: every row within, the floor Aprovado · Sem restrições.
  await second.locator('input.mf-value').fill('30G');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await outboxValues(page, `sheet/${tf.blockId}/test/isolacao/cell/1/1`)).at(-1)).toEqual({ raw: '30', unit: 'GΩ', state: 'measured' });
  await stepper(page).getByRole('button', { name: /^Conclusão/ }).click();
  await expect(page.getByRole('radiogroup', { name: 'Resultado' }).getByRole('radio', { name: 'Aprovado' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radiogroup', { name: 'Restrições' }).getByRole('radio', { name: 'Sem restrições' })).toHaveAttribute('aria-checked', 'true');

  // The issued DOCX. Nothing on the relatório is out, so the parecer is tapped (e22f S5) before issuing.
  await setParecer(page, built.relatorioId, 'Apto');
  const dialog = page.getByRole('dialog', { name: 'Gerar relatório' });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await dialog.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' }).click();
  await confirmIssue(dialog);
  await expect(toast(page)).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: 150_000 });
  await escapeDialog(page, dialog);
  const revision = (await readStore<{ entity: string; row: { id: string; number: number } }>(page, database, 'entities')).find((record) => record.entity === 'revision' && record.row.number === 1)!;
  const response = await page.request.get(`/api/revisions/${revision.row.id}/docx`);
  expect(response.status()).toBe(200);
  const structure = extractStructure(Buffer.from(await response.body()));
  const final = await insulation(page, tf.blockId);
  // The instrument header of the transformer's insulation: ACEITÁVEL "POR LINHA".
  const header = structure.tables.find((table) => table[0]?.[0] === 'ENSAIO DE ISOLAÇÃO' && table[2]?.[0] === 'Megger');
  expect(header?.[1]?.at(-1)).toBe('ACEITÁVEL');
  expect(header?.[2]?.at(-1)).toBe('POR LINHA');
  // The reading table: each row's minimum last, POLARIZAÇÃO N/A on the row above the limit.
  const table = structure.tables.find((candidate) => candidate[1]?.at(-1) === 'ACEITÁVEL' && candidate.some((r) => r.includes('> 2 TΩ') || r.includes('> 2')))!;
  expect(table).toBeDefined();
  const polarization = table[1]!.indexOf('POLARIZAÇÃO');
  expect(table.slice(2).map((r) => r.at(-1))).toEqual(final.tables[0]!.rows.map((r) => r.criterionText));
  expect(table.slice(2).map((r) => r[polarization])).toEqual([NOT_APPLICABLE_TEXT, '-', '-']);
  expect(structure.paragraphs).toContain(final.limitNote);
});
