import {
  buildSnapshot,
  cellAddressesOf,
  composeConclusion,
  entityKey,
  getDefinition,
  SEED_VERSION,
  visitContextOf,
  type BlockRow,
  type Entity,
  type EntityRow,
  type OpDraft,
  type RelatorioSnapshot,
} from '@app/domain';
import type { Page } from '@playwright/test';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Fix batch e23w (W2-4, seed v13): the conclusion's two confirms judge a sheet under its visit
 * context, as a person taps them at 1280 px. The cabine's ambient is 5 °C, so the disjuntor's and
 * the seccionadora's insulation is judged at 20 °C by the solid factor (0,5): a 600 MΩ reading,
 * within the > 400 MΩ raw, is 300 MΩ at 20 °C and out. The disjuntor was concluded Aprovado · Sem
 * restrições with its text confirmed as composed before the ambient was typed: "Confirmar" under
 * "Conclusão ajustada pela ficha" commits Reprovado · Com restrições and the text composed under the
 * context, one batch. The seccionadora holds Reprovado · Com restrições and no text: "Confirmar" of
 * the composed text commits that text and its basis under the context (judged at 20 °C). Every
 * expected value is the kernel's over the device's own rows.
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
  batch_id: string | null;
}

const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');

async function deviceSnapshot(page: Page, relatorioId: string): Promise<RelatorioSnapshot> {
  const records = await readStore<{ entity: string; id: string; row: unknown }>(page, database, 'entities');
  return buildSnapshot(new Map(records.map((record) => [entityKey(record.entity as Entity, record.id), record.row as EntityRow])), relatorioId);
}

/** The first capture cell of the type's insulation test. */
function firstCapture(type: 'disjuntor_mt' | 'chave_seccionadora'): { row: number; col: number } {
  const definition = getDefinition(SEED_VERSION, 'cabine_primaria', type);
  const test = definition.tests.find((one) => one.key === 'isolacao')!;
  return cellAddressesOf(definition, 'isolacao').find((address) => test.tables[0]!.value_columns[address.col]?.role === 'capture')!;
}

test('@p0 e23w-W2-4-E2E-001 under a cabine at 5 °C: "Confirmar" of "Conclusão ajustada" commits the floor the corrected reading gives and the text composed under the context; "Confirmar" of the text commits the basis judged at 20 °C', async ({ page }) => {
  test.setTimeout(180_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  // Batch e24a (Story 24.3): pinned to seed v13, whose adjusted pair this spec asserts (Reprovado · Com restrições).
  const built = newRelatorioDrafts(account, { seedVersion: 'v13' });
  const dj = built.sheets.find((sheet) => sheet.blockType === 'disjuntor_mt')!;
  const sc = built.sheets.find((sheet) => sheet.blockType === 'chave_seccionadora')!;
  const created = (prefix: string) => built.drafts.filter((draft) => draft.kind === 'create' && draft.path.startsWith(prefix)).map((draft) => draft.value as Record<string, unknown>);
  const locations = new Map(created('location/').map((row) => [row.id as string, row]));
  const cabineOf = (blockId: string) => {
    let at = locations.get(created('block/').find((row) => row.id === blockId)!.location_id as string)!;
    while (at.parent_id !== null) at = locations.get(at.parent_id as string)!;
    return at.id as string;
  };
  const scope = { relatorioId: built.relatorioId };
  const reading = (blockId: string, type: 'disjuntor_mt' | 'chave_seccionadora'): OpDraft => {
    const at = firstCapture(type);
    return officeDraft(account, scope, `sheet/${blockId}/test/isolacao/cell/${at.row}/${at.col}`, { raw: '600', unit: 'MΩ', state: 'measured' });
  };
  // The disjuntor's text as composed before the ambient was typed (raw, within), over the drafts' own rows.
  const djBlock = { ...(created('block/').find((row) => row.id === dj.blockId) as unknown as BlockRow) };
  const at = firstCapture('disjuntor_mt');
  const djTag = (created('equipment/').find((row) => row.id === djBlock.equipment_id)!.tag as string).trim();
  const raw: BlockRow = {
    ...djBlock,
    sheet: { ...djBlock.sheet, test: { ...djBlock.sheet.test, isolacao: { ...djBlock.sheet.test.isolacao, cells: { [String(at.row)]: { [String(at.col)]: { value: { raw: '600', unit: 'MΩ', state: 'measured' }, source_suggestion_id: null, op_id: 'x' } } } } } },
  };
  const before = composeConclusion(raw, getDefinition(SEED_VERSION, 'cabine_primaria', 'disjuntor_mt'), djTag);
  const conclusion = (blockId: string, key: string, value: unknown) => officeDraft(account, scope, `sheet/${blockId}/conclusion/${key}`, value);
  const cabines = [...new Set([cabineOf(dj.blockId), cabineOf(sc.blockId)])];
  await pushDrafts(page, database, [
    ...built.drafts,
    emCampoDraft(account, built.relatorioId),
    ...cabines.map((id) => officeDraft(account, scope, `location/${id}/env/temperature_c`, { raw: '5', unit: '°C', state: 'measured' })),
    reading(dj.blockId, 'disjuntor_mt'),
    conclusion(dj.blockId, 'result', 'aprovado'),
    conclusion(dj.blockId, 'restriction', 'sem_restricoes'),
    conclusion(dj.blockId, 'text', before.text),
    conclusion(dj.blockId, 'text_status', 'confirmed'),
    conclusion(dj.blockId, 'text_basis', before.basis),
    reading(sc.blockId, 'chave_seccionadora'),
    conclusion(sc.blockId, 'result', 'reprovado'),
    conclusion(sc.blockId, 'restriction', 'com_restricoes'),
  ]);
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });

  // The disjuntor: "Conclusão ajustada pela ficha", and its "Confirmar".
  await page.goto(`/relatorio/${built.relatorioId}/ficha/${dj.blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await stepper(page).getByRole('button', { name: /^Conclusão,/ }).click();
  const adjusted = page.locator('.conclusion-hint[role="status"]');
  await expect(adjusted).toContainText('Conclusão ajustada pela ficha');
  await adjusted.getByRole('button', { name: 'Confirmar' }).click();
  const djPath = (key: string) => `sheet/${dj.blockId}/conclusion/${key}`;
  await expect.poll(async () => (await outbox(page)).filter((row) => row.path === djPath('text_basis')).length).toBe(1);
  const snapshot = await deviceSnapshot(page, built.relatorioId);
  const djStored = snapshot.blocks.find((row) => row.id === dj.blockId)!;
  const djVisit = visitContextOf(snapshot, djStored);
  expect(djVisit.ambientC).toBe(5);
  // The text the build composed: the stored block before its own write (the pair it writes is in the paragraph's recommendation).
  const djOps = (await outbox(page)).filter((row) => row.path.startsWith(`sheet/${dj.blockId}/conclusion/`));
  expect(djOps.map((row) => [row.path, row.value]).filter(([path]) => path === djPath('result') || path === djPath('restriction'))).toEqual([
    [djPath('result'), 'reprovado'],
    [djPath('restriction'), 'com_restricoes'],
  ]);
  const committedText = String(djOps.find((row) => row.path === djPath('text'))!.value);
  expect(committedText).toContain('a 20 °C');
  expect(committedText).not.toBe(before.text);
  // The committed text and basis are the kernel's under the context over the committed rows; one batch.
  const now = composeConclusion(djStored, getDefinition(SEED_VERSION, 'cabine_primaria', 'disjuntor_mt'), djTag, djVisit);
  expect(committedText).toBe(now.text);
  expect(djOps.find((row) => row.path === djPath('text_basis'))!.value).toBe(now.basis);
  expect(djOps.find((row) => row.path === djPath('text_status'))!.value).toBe('confirmed');
  expect(new Set(djOps.map((row) => row.batch_id)).size).toBe(1);
  await expect(adjusted).toHaveCount(0);

  // The seccionadora: "Confirmar" of the composed text, judged at 20 °C.
  await page.goto(`/relatorio/${built.relatorioId}/ficha/${sc.blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await stepper(page).getByRole('button', { name: /^Conclusão,/ }).click();
  await page.locator('.suggestion-field.is-generated').getByRole('button', { name: 'Confirmar' }).click();
  const scPath = (key: string) => `sheet/${sc.blockId}/conclusion/${key}`;
  await expect.poll(async () => (await outbox(page)).find((row) => row.path === scPath('text_status'))?.value).toBe('confirmed');
  const scSnapshot = await deviceSnapshot(page, built.relatorioId);
  const scStored = scSnapshot.blocks.find((row) => row.id === sc.blockId)!;
  const scTag = scSnapshot.equipment.find((row) => row.id === scStored.equipment_id)!.tag.trim();
  const scDefinition = getDefinition(SEED_VERSION, 'cabine_primaria', 'chave_seccionadora');
  const composed = composeConclusion(scStored, scDefinition, scTag, visitContextOf(scSnapshot, scStored));
  expect(composed.text).toContain('a 20 °C');
  expect(composed.basis).not.toBe(composeConclusion(scStored, scDefinition, scTag).basis);
  const scOps = await outbox(page);
  expect(scOps.find((row) => row.path === scPath('text'))?.value).toBe(composed.text);
  expect(scOps.find((row) => row.path === scPath('text_basis'))?.value).toBe(composed.basis);
});
