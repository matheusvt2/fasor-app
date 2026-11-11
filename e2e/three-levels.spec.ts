import {
  buildSnapshot,
  cellAddressesOf,
  conclusionFloorReasonText,
  conclusionSuggestionText,
  derivedParecer,
  entityKey,
  evaluateSheetReadings,
  evaluateTest,
  failedPrerequisites,
  getDefinition,
  parecerVerdictLabel,
  SEED_VERSION,
  visitContextOf,
  type BlockRow,
  type Entity,
  type EntityRow,
  type OpDraft,
  type RelatorioSnapshot,
  type TestEvaluation,
} from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { emCampoDraft, newRelatorioDrafts, pushDrafts, type SeededSheet } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Story 23.6 (seed v13, decision C; contract 36): the third level of a reading, as a person records
 * it on a new relatório at 1280 px. The cable's three phases typed at 5, 5 and 1,5 GΩ (all above
 * 400 MΩ): phase C is restricted (below 50 % of the largest other row, Base rev08 CB-02), its field
 * keeps its neutral fill with the amber rule and the "Com restrição:" helper; the conclusion's floor
 * is Aprovado · Com restrições with its reason line; Pontos lists one "Com restrição" entry naming the
 * test and the phase, and "Editar" on it writes one point create of origin `restricao` with its
 * `test_key`, which replaces the entry; the Sumário's parecer reads Apto com restrições; after a
 * reload all of it stands. The arrester whose DESLIGADOR ÍNTEGRO is NÃO (PR-02's prerequisite) floors
 * the sheet at Reprovado; SIM lifts it. Every expected word is the kernel's over the device's own rows.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  // This worker's Empresa B (E6-Q7): its company, its user and its device database.
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

interface EntityRecord {
  entity: string;
  id: string;
  row: Record<string, unknown>;
}
interface OutboxRow {
  path: string;
  kind: string;
  value: unknown;
}

const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const sheetTitle = (page: Page) => page.locator('.sheet-header .sheet-title');
const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const row8 = (page: Page) => page.locator('li.sum-row[data-row="section_8"]');
const row10 = (page: Page) => page.locator('li.sum-row[data-row="section_10"]');
const cellOf = (page: Page, testKey: string, address: { row: number; col: number }): Locator =>
  page.locator(`section[data-test-key="${testKey}"] .ficha-cell[data-cell="${testKey}:${address.row}:${address.col}"]`).filter({ visible: true });

/** The relatório as this device holds it (the kernel's snapshot of its own rows). */
async function deviceSnapshot(page: Page, relatorioId: string): Promise<RelatorioSnapshot> {
  const records = await readStore<EntityRecord>(page, database, 'entities');
  return buildSnapshot(new Map(records.map((record) => [entityKey(record.entity as Entity, record.id), record.row as unknown as EntityRow])), relatorioId);
}

/** The stored block, its definition and the kernel's evaluation of one test under the sheet's visit context. */
async function kernel(page: Page, relatorioId: string, blockId: string, testKey: string): Promise<{ block: BlockRow; evaluation: TestEvaluation; snapshot: RelatorioSnapshot }> {
  const snapshot = await deviceSnapshot(page, relatorioId);
  const block = snapshot.blocks.find((row) => row.id === blockId)!;
  const definition = getDefinition(block.seed_version, 'cabine_primaria', block.block_type);
  const test = definition.tests.find((candidate) => candidate.key === testKey)!;
  return { block, evaluation: evaluateTest(block, definition, test, visitContextOf(snapshot, block)), snapshot };
}

async function setUp(page: Page): Promise<{ relatorioId: string; sheets: SeededSheet[] }> {
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  await pushDrafts(page, database, [...built.drafts, emCampoDraft(account, built.relatorioId)]);
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  return { relatorioId: built.relatorioId, sheets: built.sheets };
}

async function openStep(page: Page, relatorioId: string, blockId: string, step: 'Ensaios' | 'Conclusão' | 'Placa'): Promise<void> {
  if (!page.url().endsWith(`/ficha/${blockId}`)) {
    await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
    await expect(sheetTitle(page)).toBeVisible({ timeout: 30_000 });
  }
  await stepper(page).getByRole('button', { name: new RegExp(`^${step},`) }).click();
}

/** Types `values` down one column from its first cell, Enter after each, as the Enter run walks it. */
async function typeDown(page: Page, testKey: string, first: { row: number; col: number }, values: readonly string[]): Promise<void> {
  await cellOf(page, testKey, first).locator('input.mf-value').click();
  for (const value of values) {
    await page.keyboard.type(value);
    await page.keyboard.press('Enter');
  }
}

test('@p0 23.6-E2E-001 a v13 cable at 5, 5 and 1,5 GΩ: phase C restricted on the sheet, the floor Aprovado · Com restrições with its reason, no automatic point on Pontos (fix batch e24h), the parecer Apto com restrições; a reload keeps all of it', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const { relatorioId, sheets } = await setUp(page);
  const cable = sheets.find((sheet) => sheet.blockType === 'cabos_entrada')!;
  const definition = getDefinition(SEED_VERSION, 'cabine_primaria', 'cabos_entrada');
  const [a, b, c] = cellAddressesOf(definition, 'isolacao');

  await openStep(page, relatorioId, cable.blockId, 'Ensaios');
  await typeDown(page, 'isolacao', a!, ['5G', '5G', '1,5G']);
  // Committed: one cell put per phase, in GΩ.
  const cellPath = (address: { row: number; col: number }) => `sheet/${cable.blockId}/test/isolacao/cell/${address.row}/${address.col}`;
  await expect
    .poll(async () => (await outbox(page)).filter((row) => row.path.startsWith(`sheet/${cable.blockId}/test/isolacao/cell/`)).map((row) => [row.path, row.value]))
    .toEqual([
      [cellPath(a!), { raw: '5', unit: 'GΩ', state: 'measured' }],
      [cellPath(b!), { raw: '5', unit: 'GΩ', state: 'measured' }],
      [cellPath(c!), { raw: '1.5', unit: 'GΩ', state: 'measured' }],
    ]);

  // The kernel's three levels over the device's rows: C restricted, A and B within.
  const judged = await kernel(page, relatorioId, cable.blockId, 'isolacao');
  const cells = judged.evaluation.tables[0]!.rows.map((row) => row.cells.find((one) => one.role === 'capture')!);
  expect(cells.slice(0, 3).map((one) => one.verdict)).toEqual(['within', 'within', 'restricted']);
  const restriction = cells[2]!.restriction!;
  await expect(cellOf(page, 'isolacao', c!).locator('.measurement-field')).toHaveAttribute('data-state', 'restricted');
  const helper = cellOf(page, 'isolacao', c!).locator('.mf-helper[data-tone="restricted"]');
  await expect(helper).toHaveText(`Com restrição: ${restriction.text}`);
  await expect(helper.locator('b')).toHaveText('Com restrição:');
  for (const within of [a!, b!]) await expect(cellOf(page, 'isolacao', within).locator('.measurement-field')).not.toHaveAttribute('data-state');
  // A restricted reading is not out of its limit: the field keeps its neutral fill, the amber rule under it.
  const fill = await cellOf(page, 'isolacao', c!).locator('.measurement-field').evaluate((el) => getComputedStyle(el).borderBottomWidth);
  expect(fill).toBe('3px');

  // The conclusion: the floor and its one reason line, the suggestion the kernel gives.
  const definitionOf = getDefinition(judged.block.seed_version, 'cabine_primaria', judged.block.block_type);
  const visit = visitContextOf(judged.snapshot, judged.block);
  const reason = conclusionFloorReasonText(judged.block, definitionOf, visit)!;
  expect(reason).toBe('A ficha exige no mínimo Aprovado · Com restrições: leitura com restrição.');
  await openStep(page, relatorioId, cable.blockId, 'Conclusão');
  await expect(page.locator('.conclusion-hint')).toHaveText(reason);
  await expect(page.locator('#ficha-step-conclusao')).toContainText(conclusionSuggestionText({ result: 'aprovado', restriction: 'com_restricoes' }));

  // Pontos: ~~one automatic "Com restrição" entry naming the test and the phase~~ (fix batch e24h: no automatic point).
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  // The parecer the fichas give, before any tap: Apto com restrições.
  expect(derivedParecer(judged.snapshot)).toBe('apto_com_restricoes');
  await expect(row10(page).locator('.sum-status')).toHaveText(parecerVerdictLabel('apto_com_restricoes'));
  await expect(row8(page).locator('.sum-status')).toHaveText('Nenhum ponto de atenção');
  await row8(page).getByRole('button', { name: /^Pontos de atenção/ }).click();
  await expect(page).toHaveURL(/\/pontos$/);
  await expect(page.locator('.poa-list')).toBeAttached({ timeout: 30_000 });
  await expect(page.locator('.poa-list > .point-of-attention-card')).toHaveCount(0);
  // ~~"Editar": a point seeded with the entry's text, written as origin restricao~~: no point is written by itself.
  expect((await outbox(page)).filter((row) => row.path.startsWith('point/'))).toEqual([]);

  // A reload before any sync keeps the restricted reading and the floor, and still no point.
  await page.reload();
  await expect(page.locator('.poa-list')).toBeAttached({ timeout: 30_000 });
  await expect(page.locator('.poa-list > .point-of-attention-card')).toHaveCount(0);
  await openStep(page, relatorioId, cable.blockId, 'Ensaios');
  await expect(cellOf(page, 'isolacao', c!).locator('.measurement-field')).toHaveAttribute('data-state', 'restricted');
  await expect(cellOf(page, 'isolacao', c!).locator('.mf-helper[data-tone="restricted"]')).toHaveText(`Com restrição: ${restriction.text}`);
  await openStep(page, relatorioId, cable.blockId, 'Conclusão');
  await expect(page.locator('.conclusion-hint')).toHaveText(reason);
});

test('@p0 23.6-E2E-002 a v13 arrester whose DESLIGADOR ÍNTEGRO is NÃO: the floor is Reprovado · Com restrições, named by the prerequisite, whatever its readings; SIM lifts it; a reload keeps the plate', async ({ page }) => {
  test.setTimeout(180_000);
  const { relatorioId, sheets } = await setUp(page);
  const arrester = sheets.find((sheet) => sheet.blockType === 'para_raio')!;
  const definition = getDefinition(SEED_VERSION, 'cabine_primaria', 'para_raio');
  const [first] = cellAddressesOf(definition, 'isolacao');
  const desligador = page.locator('#ficha-nameplate [data-field-key="desligador_integro"] select');
  const platePath = `sheet/${arrester.blockId}/nameplate/desligador_integro`;

  await openStep(page, relatorioId, arrester.blockId, 'Placa');
  await desligador.selectOption('NÃO');
  await expect.poll(async () => (await outbox(page)).filter((row) => row.path === platePath).map((row) => row.value)).toEqual(['NÃO']);
  await openStep(page, relatorioId, arrester.blockId, 'Ensaios');
  await typeDown(page, 'isolacao', first!, ['5G']);
  await expect.poll(async () => (await outbox(page)).filter((row) => row.path === `sheet/${arrester.blockId}/test/isolacao/cell/${first!.row}/${first!.col}`).length).toBe(1);

  const failing = await kernel(page, relatorioId, arrester.blockId, 'isolacao');
  expect(failing.evaluation.prerequisite).toEqual({ failed: true, text: 'pré-requisito não atendido (Desligador íntegro: NÃO)' });
  // The reading itself is within its criterion: the prerequisite alone fails the sheet.
  expect(failing.evaluation.tables[0]!.rows[0]!.cells.find((one) => one.role === 'capture')!.verdict).toBe('within');
  const reason = conclusionFloorReasonText(failing.block, definition, visitContextOf(failing.snapshot, failing.block))!;
  expect(reason).toBe('A ficha exige no mínimo Reprovado · Com restrições: pré-requisito do ensaio não atendido.');
  await openStep(page, relatorioId, arrester.blockId, 'Conclusão');
  await expect(page.locator('.conclusion-hint')).toHaveText(reason);
  await expect(page.locator('#ficha-step-conclusao')).toContainText(conclusionSuggestionText({ result: 'reprovado', restriction: 'com_restricoes' }));

  // A reload keeps the plate and the floor.
  await page.reload();
  await expect(sheetTitle(page)).toBeVisible({ timeout: 30_000 });
  await openStep(page, relatorioId, arrester.blockId, 'Conclusão');
  await expect(page.locator('.conclusion-hint')).toHaveText(reason);

  // SIM: no prerequisite failure, and with one reading within nothing restricts the sheet.
  await openStep(page, relatorioId, arrester.blockId, 'Placa');
  await desligador.selectOption('SIM');
  await expect.poll(async () => (await outbox(page)).filter((row) => row.path === platePath).map((row) => row.value).at(-1)).toBe('SIM');
  const lifted = await kernel(page, relatorioId, arrester.blockId, 'isolacao');
  expect(lifted.evaluation.prerequisite).toBeNull();
  expect(conclusionFloorReasonText(lifted.block, definition, visitContextOf(lifted.snapshot, lifted.block))).toBeNull();
  await openStep(page, relatorioId, arrester.blockId, 'Conclusão');
  await expect(page.locator('.conclusion-hint')).toHaveCount(0);
});

test('@p0 e23w-W2-2-E2E-001 a v13 arrester whose insulation test is switched off and whose DESLIGADOR ÍNTEGRO is NÃO: the floor is still Reprovado by the prerequisite, Pontos lists nothing by itself (fix batch e24h), and the parecer follows', async ({ page }) => {
  test.setTimeout(180_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const arrester = built.sheets.find((sheet) => sheet.blockType === 'para_raio')!;
  // The relatório is created with the arrester's insulation sub-block off (as a template switches it off).
  type BlockValue = { id: string; config: { sub_blocks: Record<string, { enabled?: boolean }> } };
  const drafts = built.drafts.map((draft): OpDraft => {
    if (draft.kind !== 'create' || draft.path !== `block/${arrester.blockId}`) return draft;
    const value = draft.value as unknown as BlockValue;
    return { ...draft, value: { ...value, config: { ...value.config, sub_blocks: { ...value.config.sub_blocks, isolacao: { ...value.config.sub_blocks.isolacao, enabled: false } } } } } as unknown as OpDraft;
  });
  await pushDrafts(page, database, [...drafts, emCampoDraft(account, built.relatorioId)]);
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  const definition = getDefinition(SEED_VERSION, 'cabine_primaria', 'para_raio');
  const platePath = `sheet/${arrester.blockId}/nameplate/desligador_integro`;

  await openStep(page, built.relatorioId, arrester.blockId, 'Placa');
  await page.locator('#ficha-nameplate [data-field-key="desligador_integro"] select').selectOption('NÃO');
  await expect.poll(async () => (await outbox(page)).filter((row) => row.path === platePath).map((row) => row.value)).toEqual(['NÃO']);

  // The kernel: no insulation evaluated (switched off), the prerequisite still failed, the floor Reprovado by it.
  const snapshot = await deviceSnapshot(page, built.relatorioId);
  const block = snapshot.blocks.find((row) => row.id === arrester.blockId)!;
  const visit = visitContextOf(snapshot, block);
  expect(evaluateSheetReadings(block, definition, visit).some((test) => test.testKey === 'isolacao')).toBe(false);
  expect(failedPrerequisites(block, definition).map((one) => one.text)).toEqual(['pré-requisito não atendido (Desligador íntegro: NÃO)']);
  const reason = conclusionFloorReasonText(block, definition, visit)!;
  expect(reason).toBe('A ficha exige no mínimo Reprovado · Com restrições: pré-requisito do ensaio não atendido.');
  await openStep(page, built.relatorioId, arrester.blockId, 'Conclusão');
  await expect(page.locator('.conclusion-hint')).toHaveText(reason);
  await expect(page.locator('#ficha-step-conclusao')).toContainText(conclusionSuggestionText({ result: 'reprovado', restriction: 'com_restricoes' }));

  // Pontos: ~~the test's reading entry, naming the disconnector~~ (fix batch e24h: nothing until the technician creates it).
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await expect(row10(page).locator('.sum-status')).toHaveText(parecerVerdictLabel(derivedParecer(snapshot)!));
  await expect(row8(page).locator('.sum-status')).toHaveText('Nenhum ponto de atenção');
  await row8(page).getByRole('button', { name: /^Pontos de atenção/ }).click();
  await expect(page).toHaveURL(/\/pontos$/);
  await expect(page.locator('.poa-list')).toBeAttached({ timeout: 30_000 });
  await expect(page.locator('.poa-list > .point-of-attention-card')).toHaveCount(0);
});
