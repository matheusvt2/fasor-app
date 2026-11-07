import { instrumentHeaderOf, type InstrumentRow, type OpDraft } from '@app/domain';
import type { Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { signInForDurability } from './support/durability.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Story 22.10 (contract 32) in the durability matrix (desktop Chrome, Android Chrome emulation,
 * WebKit, the built bundle): "OL" typed in an insulation cell whose picked instrument has a 2 TΩ
 * limit is in the outbox as the over-range value at once, and after a reload the store still holds
 * it and the cell still shows "> 2" with TΩ. The instrument and its pick come from the office.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  // This worker's Empresa B (E6-Q7): its company, its user and its device database.
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const OVER = { raw: '2', unit: 'TΩ', state: 'over_range' };

function instrument(id: string): InstrumentRow {
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

const outboxValues = async (page: Page, path: string) => (await readStore<{ path: string; value: unknown }>(page, database, 'outbox')).filter((row) => row.path === path).map((row) => row.value);
const storedCell = async (page: Page, blockId: string) => {
  const block = (await readStore<{ entity: string; id: string; row: { sheet: { test: Record<string, { cells: Record<string, Record<string, { value: unknown }>> }> } } }>(page, database, 'entities')).find(
    (record) => record.entity === 'block' && record.id === blockId,
  );
  return block?.row.sheet.test.isolacao?.cells['0']?.['0']?.value ?? null;
};

test('@p0 22.10-E2E-002 "OL" with the picked instrument\'s 2 TΩ limit is in the outbox as the over-range value, and survives a reload in the store and on screen', async ({ page, context }) => {
  test.setTimeout(150_000);
  await resetEmpresaB(account, { standard: true });
  await signInForDurability(page, context, account.email);
  const built = newRelatorioDrafts(account);
  const chave = built.sheets.find((sheet) => sheet.blockType === 'chave_seccionadora')!;
  const row = instrument(newId());
  const create: OpDraft = { kind: 'create', scope: 'company', company_id: account.companyId, project_id: null, relatorio_id: null, path: `registry/instrument/${row.id}`, value: row as never, prev_op_id: null, batch_id: null, meta: null, actor_id: account.userId };
  await pushDrafts(page, database, [
    create,
    ...built.drafts,
    emCampoDraft(account, built.relatorioId),
    officeDraft(account, { relatorioId: built.relatorioId }, `sheet/${chave.blockId}/test/isolacao/instrument`, instrumentHeaderOf(row, 'isolacao')),
  ]);
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  await page.goto(`/relatorio/${built.relatorioId}/ficha/${chave.blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' }).getByRole('button', { name: /^Ensaios,/ }).click();
  await expect(page.locator('section[data-test-key="isolacao"]').getByRole('button', { name: /^Instrumento MEG-10/ })).toBeVisible({ timeout: 30_000 });

  const cell = page.locator('.ficha-cell[data-cell="isolacao:0:0"]').filter({ visible: true });
  const input = cell.locator('input.mf-value');
  await input.click();
  await page.keyboard.type('OL');
  await page.keyboard.press('Enter');
  const path = `sheet/${chave.blockId}/test/isolacao/cell/0/0`;
  await expect.poll(() => outboxValues(page, path)).toEqual([OVER]);
  await expect.poll(() => storedCell(page, chave.blockId)).toEqual(OVER);
  await expect(input).toHaveValue('> 2');

  await page.reload();
  await page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' }).getByRole('button', { name: /^Ensaios,/ }).click();
  await expect(input).toHaveValue('> 2', { timeout: 30_000 });
  await expect(cell.locator('.unit-cycle')).toHaveAccessibleName('teraohms, toque para alternar');
  await expect.poll(() => storedCell(page, chave.blockId)).toEqual(OVER);
  expect(await outboxValues(page, path)).toEqual([OVER]);
});
