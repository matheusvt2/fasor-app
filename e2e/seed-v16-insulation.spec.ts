import { getDefinition, type FieldDef } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { pushLastNameplate } from './support/push-server-ops.ts';
import { confirmIssue, setParecer } from './support/relatorio-flow.ts';
import { emCampoDraft, newRelatorioDrafts, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNowAndReturn } from './support/sync.ts';

/*
 * 25.19-E2E-001 (Story 25.19, the "A SECO" half, seed v16; M11). On a v16 relatório from the standard template, at
 * 1024 px: the transformer, the TP and the TC each belong to an equipment whose last visit was a v15 relatório that
 * stored TIPO DE ISOLAÇÃO "Á SECO" (and no oil data). On each sheet TIPO DE ISOLAÇÃO offers "A SECO" and no "Á SECO";
 * "Copiar da última visita" writes "A SECO", and the dry rules apply as they did on the older seed: every oil item of
 * the type's oil rule reads NA with no tap, and VOL. ÓLEO says why it is not asked. The DOCX prints "A SECO" on the
 * three plates. The oil option is not touched (B-4). Every list and word is the kernel's. It issues a revision
 * through the api's one queue and LibreOffice, so it runs in the queue lane.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const TYPES = ['transformador_forca', 'tp', 'tc'] as const;
const VISIT_DRY = 'Á SECO';
const DRY = 'A SECO';

const checklistRow = (page: Page, key: string): Locator => page.locator(`#ficha-step-verificacoes li.checklist-row[data-item-key="${key}"]`);
const checked = (page: Page, key: string): Locator => checklistRow(page, key).locator('[role="radio"][aria-checked="true"]');
const plateField = (page: Page, key: string): Locator => page.locator(`#ficha-nameplate [data-field-key="${key}"]`);

/** A v15 visit's plate value of a field of `type`, by kind; TIPO DE ISOLAÇÃO "Á SECO"; a select takes its first option. */
function visitValue(type: string, field: FieldDef): unknown {
  if (field.key === 'tipo_de_isolacao') return VISIT_DRY;
  if (field.kind === 'number') return { raw: '100', unit: field.unit ?? null, state: 'measured' };
  if (field.kind === 'date') return '2020-01-01';
  if (field.kind === 'select') return field.options![0];
  if (field.kind === 'voltage_class') return '15';
  if (field.kind === 'manufacturer') return 'Fabricante V15';
  return `V15-${type}-${field.key}`;
}

test('@p0 25.19-E2E-001 at 1024: a v16 transformer, TP and TC copied from a v15 visit that stored "Á SECO" take "A SECO" with the dry rules; the DOCX prints "A SECO"', async ({ page }) => {
  test.setTimeout(420_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1024, height: 900 });
  await signIn(page, account.email);
  // Pinned to v16 since seed v17 opened (batch e27b): a new relatório is born on v17.
  const built = newRelatorioDrafts(account, { seedVersion: 'v16' });
  const { relatorioId } = built;
  await pushDrafts(page, database, [...built.drafts, emCampoDraft(account, relatorioId)]);
  const sheets = TYPES.map((type) => built.sheets.find((sheet) => sheet.blockType === type)!);
  for (const [i, type] of TYPES.entries()) {
    const sheet = sheets[i]!;
    const v15 = getDefinition('v15', 'cabine_primaria', type);
    // A dry unit's plate of a v15 visit: no TAG (the block's), no oil field.
    const skipped = new Set(['tag', ...(v15.oil_rule?.fields ?? [])]);
    const fields = Object.fromEntries(v15.nameplate.filter((field) => !skipped.has(field.key)).map((field) => [field.key, visitValue(type, field)]));
    expect(fields.tipo_de_isolacao).toBe(VISIT_DRY);
    const equipmentId = (built.drafts.find((draft) => draft.path === `block/${sheet.blockId}`)!.value as { equipment_id: string }).equipment_id;
    await pushLastNameplate(
      account.companyId,
      built.projectId,
      equipmentId,
      { relatorio_id: newId(), revision_number: 1, issued_at: '2026-11-12T12:00:00.000Z', seed_version: 'v15', block_type: type, fields: fields as never },
      account.userId,
    );
  }
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await syncNowAndReturn(page);

  for (const [i, type] of TYPES.entries()) {
    const sheet = sheets[i]!;
    const definition = getDefinition('v16', 'cabine_primaria', type);
    await page.goto(`/relatorio/${relatorioId}/ficha/${sheet.blockId}`);
    await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
    const insulation = plateField(page, 'tipo_de_isolacao').locator('select');
    const options = await insulation.locator('option').allTextContents();
    expect(options, type).toContain(DRY);
    expect(options, type).not.toContain(VISIT_DRY);

    const lastVisit = page.getByRole('group', { name: 'Copiar dados de placa' }).getByRole('button', { name: `Copiar da última visita (${sheet.tag})` });
    await expect(lastVisit, type).toBeVisible({ timeout: 30_000 });
    await lastVisit.click();
    await expect(page.getByTestId('toast')).toContainText('copiados');
    await expect(insulation, type).toHaveValue(DRY);
    await expect
      .poll(async () => (await readStore<{ path: string; value: unknown }>(page, database, 'outbox')).filter((op) => op.path === `sheet/${sheet.blockId}/nameplate/tipo_de_isolacao`).at(-1)?.value)
      .toBe(DRY);

    // The dry rules, as on the older seed: every oil item NA with no tap, VOL. ÓLEO not asked and says why.
    for (const key of definition.oil_rule!.items) await expect(checked(page, key), `${type} ${key}`).toHaveAttribute('data-value', 'na');
    await expect(page.locator('#ficha-nameplate .field', { has: page.getByRole('textbox', { name: 'Vol. óleo', exact: true }) }).locator('.helper'), type).toHaveText(
      `Não se aplica: Tipo de isolação é ${DRY}.`,
    );
  }

  // --- the DOCX: the three plates print "A SECO" ---
  await setParecer(page, relatorioId, 'Apto');
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  const modal = page.getByRole('dialog', { name: 'Gerar relatório' });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await modal.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' }).click();
  await confirmIssue(modal);
  await expect(page.getByTestId('toast')).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: 150_000 });
  const revision = (await readStore<{ entity: string; row: { id: string; number: number } }>(page, database, 'entities')).find((record) => record.entity === 'revision' && record.row.number === 1)!;
  const structure = extractStructure(Buffer.from(await (await page.request.get(`/api/revisions/${revision.row.id}/docx`)).body()));
  for (const type of TYPES) {
    const plate = structure.tables.find((table) => table[0]?.[0] === 'DADOS DO EQUIPAMENTO' && JSON.stringify(table).includes(`V15-${type}-`));
    expect(plate, type).toBeDefined();
    const cells = plate!.flat();
    expect(cells[cells.indexOf('TIPO DE ISOLAÇÃO') + 1], type).toBe(DRY);
  }
  expect(JSON.stringify(structure.tables)).not.toContain(VISIT_DRY);
});
