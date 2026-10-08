import type { Locator, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { pushLastNameplate } from './support/push-server-ops.ts';
import { openTransformerSheet } from './support/reading-ops.ts';
import { officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { syncNowAndReturn } from './support/sync.ts';

/*
 * E78-Q3 and E78-Q4 as a person meets them: a transformer's plate copied from its last visit
 * holds a month-only date written as "07/2025" and a manufacturer the company never
 * registered ("SIEMENS"). The copy stores the date in the canonical shape and the field
 * shows it; the manufacturer shows its name and "Criar SIEMENS?", one tap writes one registry
 * row and the chip reads it selected. Every other stored date shape shows too, never blank.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

interface OutboxRow {
  op_id: string;
  kind: string;
  path: string;
  value: unknown;
}
interface EntityRecord {
  entity: string;
  id: string;
  row: Record<string, unknown>;
}

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const field = (page: Page, key: string): Locator => page.locator(`#ficha-nameplate [data-field-key="${key}"]`);

test('@p0 E78-Q3 E78-Q4 8.1-E2E-010 "Copiar da última visita" of "07/2025" stores 2025-07 and shows it; an unregistered manufacturer shows its name and one tap on "Criar SIEMENS?" registers it', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const { relatorioId, blockId } = await openTransformerSheet(page, account, database, { width: 768 });
  const records = await readStore<EntityRecord>(page, database, 'entities');
  const block = records.find((record) => record.entity === 'block' && record.id === blockId)!.row;
  const relatorio = records.find((record) => record.entity === 'relatorio' && record.id === relatorioId)!.row;
  await pushLastNameplate(
    account.companyId,
    relatorio.project_id as string,
    block.equipment_id as string,
    {
      relatorio_id: newId(),
      revision_number: 1,
      issued_at: '2025-09-08T12:00:00.000Z',
      seed_version: block.seed_version as string,
      block_type: 'transformador_forca',
      fields: { fabricacao: 'SIEMENS', data_fabricacao: '07/2025', n_serie: 'SX-1' },
    },
    account.userId,
  );
  await syncNowAndReturn(page);

  const copy = page.getByRole('button', { name: /^Copiar da última visita \(.+\)$/ });
  await expect(copy).toBeVisible({ timeout: 30_000 });
  await copy.click();
  const put = async (key: string) => (await outbox(page)).filter((op) => op.path === `sheet/${blockId}/nameplate/${key}`).map((op) => op.value);
  await expect.poll(() => put('data_fabricacao'), { timeout: 15_000 }).toEqual(['2025-07']);
  expect(await put('fabricacao')).toEqual(['SIEMENS']);

  // The month-only date shows as the kernel writes it, never a blank date field.
  // A value the date picker cannot hold is a plain text input under the same label.
  const date = field(page, 'data_fabricacao').locator('input.input');
  await expect(date).toHaveValue('07/2025');
  await expect(date).toHaveAccessibleName('Data fabricação');

  // The manufacturer the registry does not hold: its name and "Criar SIEMENS?".
  const maker = field(page, 'fabricacao');
  await expect(maker.locator('.word-unregistered-name')).toHaveText('SIEMENS');
  const create = maker.getByRole('button', { name: 'Criar SIEMENS?', exact: true });
  await create.click();
  const creates = async () => (await outbox(page)).filter((op) => op.kind === 'create' && op.path.startsWith('registry/manufacturer/'));
  await expect.poll(async () => (await creates()).length, { timeout: 15_000 }).toBe(1);
  expect((await creates())[0]!.value).toMatchObject({ kind: 'manufacturer', name: 'SIEMENS' });
  await expect(create).toHaveCount(0);
  await expect(maker.getByRole('button', { name: 'SIEMENS', pressed: true })).toBeVisible();
  // One tap, one registry row; the plate itself is not written again.
  expect(await put('fabricacao')).toEqual(['SIEMENS']);

  // Another shape a cell can hold (a year alone): shown as stored; a typed text the kernel
  // cannot read keeps the stored value and says why.
  // Written on another device over this one's value (its `prev_op_id`, so it is no stale write).
  await syncNowAndReturn(page);
  const mine = (await outbox(page)).filter((op) => op.path === `sheet/${blockId}/nameplate/data_fabricacao`).at(-1)!;
  await pushDrafts(page, database, [{ ...officeDraft(account, { relatorioId }, `sheet/${blockId}/nameplate/data_fabricacao`, '2012'), prev_op_id: mine.op_id }]);
  await syncNowAndReturn(page);
  await expect(date).toHaveValue('2012', { timeout: 30_000 });
  const before = (await put('data_fabricacao')).length;
  await date.fill('13/2024');
  await date.press('Enter');
  await expect(field(page, 'data_fabricacao').locator('.helper[data-tone="red"]')).toHaveText('Data não reconhecida — use dd/mm/aaaa, mm/aaaa ou aaaa');
  expect((await put('data_fabricacao')).length).toBe(before);
  // A month typed in the plate's order is stored canonical.
  await date.fill('08/2024');
  await date.press('Enter');
  await expect.poll(async () => (await put('data_fabricacao')).at(-1), { timeout: 15_000 }).toBe('2024-08');
  await expect(date).toHaveValue('08/2024');
});
