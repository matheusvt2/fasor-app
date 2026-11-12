import { getDefinition, headerParameterView, rowTestVoltage, storedInstrumentHeader, type BlockRow, type InstrumentRow, type OpDraft } from '@app/domain';
import type { Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { escapeDialog } from './support/dialogs.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { confirmIssue, setParecer } from './support/relatorio-flow.ts';
import { emCampoDraft, newRelatorioDrafts, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNowAndReturn } from './support/sync.ts';

/*
 * Story 25.11 (M06; Story 25.1 Part B's frame): the instrument header's TENSÃO ENSAIO is a field of the sheet.
 * On a new relatório's arrester (para-raios) at 1280 px, the megôhmetro registered at 10 kV is picked on the
 * insulation test; 5 typed and left is one instrument put holding "5 kV", shows "Alterada nesta ficha · cadastro:
 * 10 kV", and the row with no voltage of its own (no MCOV on the plate) follows the header; "Usar a do
 * instrumento" stores 10 kV back and the sign goes; picking another instrument takes that one's default; the
 * registry row never changes. Typed 5 again, the issued DOCX prints 5 kV under TENSÃO ENSAIO of the arrester's
 * insulation header. Every expected text is the kernel's. It issues a revision through the api's one queue and
 * LibreOffice, so it runs in the serial group's queue lane (`e2e/support/groups.ts`).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  // This worker's Empresa B (E6-Q7): its company, its user and its device database.
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const MEGGER_SERIAL = 'PR-2511-A';
const OTHER_SERIAL = 'PR-2511-B';

function instrumentDraft(id: string, fields: Record<string, unknown>): OpDraft {
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
      code: 'X1',
      name: 'Megôhmetro',
      manufacturer: 'Instrum',
      model: 'DMG10Ki',
      serial: null,
      cert_number: '37428/26',
      laboratory: null,
      calibrated_at: '2026-08-28',
      calibration_interval_months: 12,
      rbc_accredited: null,
      test_isolacao: null,
      test_resistencia_contato: null,
      test_relacao_transformacao: null,
      certificate_file_id: null,
      removed_at: null,
      ...fields,
    },
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: account.userId,
  } as OpDraft;
}

type Entity = { entity: string; id: string; row: unknown };
const entities = (page: Page) => readStore<Entity>(page, database, 'entities');
const outboxValues = async (page: Page, path: string) => (await readStore<{ path: string; value: unknown }>(page, database, 'outbox')).filter((row) => row.path === path).map((row) => row.value);
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const toast = (page: Page) => page.getByTestId('toast');

/** The arrester's block and the registry's instruments as this device stores them, and the kernel's view of the field. */
async function kernel(page: Page, blockId: string) {
  const records = await entities(page);
  const block = records.find((record) => record.entity === 'block' && record.id === blockId)!.row as BlockRow;
  const instruments = records.filter((record) => record.entity === 'registry' && (record.row as { kind?: string }).kind === 'instrument').map((record) => record.row as InstrumentRow);
  const test = getDefinition(block.seed_version, 'cabine_primaria', block.block_type).tests.find((one) => one.key === 'isolacao')!;
  return { block, instruments, view: headerParameterView(block, 'isolacao', instruments), row0: rowTestVoltage(block, test, 0, getDefinition(block.seed_version, 'cabine_primaria', block.block_type)) };
}

test('@p0 25.11-E2E-001 the arrester\'s megôhmetro registered at 10 kV: 5 typed in the header\'s TENSÃO ENSAIO stores "5 kV", shows as changed and moves the row\'s voltage; "Usar a do instrumento" takes 10 kV back; another instrument takes its own default; the registry never changes; the DOCX prints 5 kV', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const arrester = built.sheets.find((sheet) => sheet.blockType === 'para_raio')!;
  const meggerId = newId();
  const otherId = newId();
  await pushDrafts(page, database, [
    ...built.drafts,
    emCampoDraft(account, built.relatorioId),
    instrumentDraft(meggerId, { code: '2E', serial: MEGGER_SERIAL, test_isolacao: { raw: '10', unit: 'kV' } }),
    instrumentDraft(otherId, { code: '3E', serial: OTHER_SERIAL, test_isolacao: { raw: '2.5', unit: 'kV' } }),
  ]);
  await syncNowAndReturn(page);
  await page.goto(`/relatorio/${built.relatorioId}/ficha/${arrester.blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();

  const section = page.locator('section[data-test-key="isolacao"]');
  const path = `sheet/${arrester.blockId}/test/isolacao/instrument`;
  const parameter = async () => (await outboxValues(page, path)).map((value) => (value as { test_parameter: string | null }).test_parameter).at(-1);
  const field = section.locator('.e25-header-param');
  const input = field.getByRole('textbox', { name: 'Tensão de ensaio' });
  const sign = field.locator('.e25-changed');
  const rowVoltage = section.locator('.ficha-cell[data-row-voltage="0"] select');

  // No instrument yet: no field.
  await expect(section.locator('.instrument-picker')).toBeVisible();
  await expect(field).toHaveCount(0);

  // Pick the megôhmetro: the header holds the registry's 10 kV, the field reads it, no sign.
  await section.getByRole('button', { name: /^Instrumento/ }).click();
  await section.getByRole('radiogroup', { name: 'Instrumentos cadastrados' }).getByRole('radio', { name: /^2E/ }).click();
  await expect.poll(parameter).toBe('10 kV');
  const picked = await kernel(page, arrester.blockId);
  expect(picked.view).toMatchObject({ label: 'Tensão de ensaio', text: '10', unit: 'kV', changed: false });
  await expect(input).toHaveValue(picked.view!.text);
  await expect(field.locator('.mf-unit')).toHaveText('kV');
  await expect(sign).toHaveCount(0);
  await expect(field).toHaveClass(/is-default/);
  expect(picked.row0).not.toBeNull();
  await expect(rowVoltage).toHaveValue(picked.row0!.text);

  // 5 typed and left: one put with "5 kV", the sign naming the registry's value, the row with no voltage of its own follows.
  await input.fill('5');
  await input.press('Tab');
  await expect.poll(parameter).toBe('5 kV');
  const typed = await kernel(page, arrester.blockId);
  expect(typed.view).toMatchObject({ text: '5', changed: true, changedText: 'Alterada nesta ficha · cadastro: 10 kV' });
  await expect(sign.locator('.e25-changed-word')).toHaveText(typed.view!.changedText!);
  await expect(input).toHaveValue('5');
  expect(typed.row0!.kv).toBe('5');
  await expect(rowVoltage).toHaveValue(typed.row0!.text);
  // Every other field of the header stays the pick's.
  expect((await outboxValues(page, path)).at(-1)).toEqual({ ...((await outboxValues(page, path)).at(0) as object), test_parameter: '5 kV' });

  // "Usar a do instrumento": 10 kV again, the sign goes, the toast names the value.
  await field.getByRole('button', { name: 'Usar a do instrumento' }).click();
  await expect.poll(parameter).toBe('10 kV');
  await expect(sign).toHaveCount(0);
  await expect(input).toHaveValue('10');
  await expect(toast(page)).toHaveText('Tensão de ensaio voltou a 10 kV, a do instrumento');
  const back = await kernel(page, arrester.blockId);
  await expect(rowVoltage).toHaveValue(back.row0!.text);

  // 5 again, then another instrument: that one's default (2,5 kV), no sign.
  await input.fill('5');
  await input.press('Tab');
  await expect.poll(parameter).toBe('5 kV');
  await section.getByRole('button', { name: /^Instrumento/ }).click();
  await section.getByRole('radiogroup', { name: 'Instrumentos cadastrados' }).getByRole('radio', { name: /^3E/ }).click();
  await expect.poll(parameter).toBe('2,5 kV');
  await expect(input).toHaveValue('2,5');
  await expect(sign).toHaveCount(0);

  // The megôhmetro again, 5 typed for the document; the registry rows never changed.
  await section.getByRole('button', { name: /^Instrumento/ }).click();
  await section.getByRole('radiogroup', { name: 'Instrumentos cadastrados' }).getByRole('radio', { name: /^2E/ }).click();
  await expect.poll(parameter).toBe('10 kV');
  await input.fill('5');
  await input.press('Enter');
  await expect.poll(parameter).toBe('5 kV');
  await syncNowAndReturn(page);
  const final = await kernel(page, arrester.blockId);
  expect(final.instruments.find((row) => row.id === meggerId)!.test_isolacao).toEqual({ raw: '10', unit: 'kV' });
  expect(final.instruments.find((row) => row.id === otherId)!.test_isolacao).toEqual({ raw: '2.5', unit: 'kV' });
  expect((await readStore<{ path: string }>(page, database, 'outbox')).filter((row) => row.path.startsWith('registry/'))).toEqual([]);

  // The issued DOCX: the arrester's insulation header prints 5 kV under TENSÃO ENSAIO (the parecer is what issuing asks for).
  await setParecer(page, built.relatorioId);
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
  // The instrument header: its labels row holds TENSÃO ENSAIO, its values row the megôhmetro's serial.
  const headers = tables.flatMap((table) =>
    table.flatMap((cells, index) => {
      const values = table[index + 1];
      const column = cells.indexOf('TENSÃO ENSAIO');
      return column === -1 || values === undefined || !values.includes(MEGGER_SERIAL) ? [] : [values[column]];
    }),
  );
  const stored = storedInstrumentHeader(final.block.sheet.test.isolacao?.instrument?.value)!.test_parameter;
  expect(stored).toBe('5 kV');
  expect(headers).toEqual([stored]);
});
