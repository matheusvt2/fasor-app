import { blockDefinitionIn, composeParecer, conclusionFloorReasonText, getDefinition, SEED_VERSION, snapshotDefinitionContext, visitContextOf, type BlockRow, type FieldDef, type JsonValue } from '@app/domain';
import type { BrowserContext, Page } from '@playwright/test';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { escapeDialog } from './support/dialogs.ts';
import { cellOf, deviceSnapshot, openStep, outbox, testSection, typeCell } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { pdfTextItems } from './support/pdf-text.ts';
import { confirmIssue } from './support/relatorio-flow.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNowAndReturn } from './support/sync.ts';

/*
 * Story 24.3 (batch e24a, seed v14; Bruno's answers 25 and 26, Matheus's decisions 1, 3 and 5), driven
 * as a person does at 1280 px on a new relatório's cabos de saída (plate and checklist from the office,
 * the readings typed): a reading out of its criterion makes the ficha Reprovado and nothing else, with
 * no Restrições group, its observation required, and section 9 printing both restriction boxes empty;
 * observations give no restriction; "Com restrições" is the technician's choice; a concluded ficha whose
 * reading is then corrected out shows "Conclusão ajustada pela ficha" and its Confirmar clears the stored
 * restriction; and a v13 relatório beside it concludes as before. Every test reads the stored pair in the
 * device's store (E12-A6) and the issued DOCX, so the file runs in the `queue` lane.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const JOB_TIMEOUT = 150_000;
// A cabos de saída: every cabos de entrada of the standard template is its cabine's first sheet, whose Placa step also asks the cabine's own fields.
const TYPE = 'cabos_saida';
const OUT = '300M';
const WITHIN = '1000M';
const sumario = (page: Page) => page.getByRole('list', { name: 'Sumário do relatório' });
const toast = (page: Page) => page.getByTestId('toast');
const resultGroup = (page: Page) => page.getByRole('radiogroup', { name: 'Resultado' });
const restrictionGroup = (page: Page) => page.getByRole('radiogroup', { name: 'Restrições' });
const observationField = (page: Page) => page.getByLabel('Observações da ficha', { exact: true });
const conclusionHint = (page: Page) => page.locator('.conclusion-control .conclusion-hint').first();
const compact = (text: string) => text.replace(/\s+/g, '');

/** A plate value by kind, as a technician might type it; a select takes its first option. */
function plateValue(field: FieldDef, n: number): JsonValue {
  switch (field.kind) {
    case 'text':
      return `E24A-${n + 1}`;
    case 'manufacturer':
      return 'Fabricante E2E';
    case 'number':
      return { raw: String(100 + n * 10), unit: field.unit ?? null, state: 'measured' };
    case 'date':
      return '2020-03-15';
    case 'voltage_class':
      return '15';
    case 'select':
      return field.options![0]!;
  }
}

interface Cable {
  relatorioId: string;
  blockId: string;
  tag: string;
}

/** A new relatório (on `seedVersion`, else the current seed), Em campo, its first cabos de saída with the plate and every row Conforme from the office. */
async function setUp(page: Page, seedVersion?: string): Promise<Cable> {
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account, seedVersion === undefined ? {} : { seedVersion });
  const cable = built.sheets.find((sheet) => sheet.blockType === TYPE)!;
  const definition = getDefinition(seedVersion ?? SEED_VERSION, 'cabine_primaria', TYPE);
  const scope = { relatorioId: built.relatorioId };
  await pushDrafts(page, database, [
    ...built.drafts,
    emCampoDraft(account, built.relatorioId),
    ...definition.nameplate.map((field, n) => officeDraft(account, scope, `sheet/${cable.blockId}/nameplate/${field.key}`, plateValue(field, n))),
    ...definition.checklist!.map((item) => officeDraft(account, scope, `sheet/${cable.blockId}/checklist/${item.key}/result`, 'C')),
  ]);
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(sumario(page).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  return { relatorioId: built.relatorioId, blockId: cable.blockId, tag: cable.tag };
}

/** Types the four phases' 1 MINUTO through the Ensaios step. */
async function typeInsulation(page: Page, cable: Cable, values: readonly string[]): Promise<void> {
  await openStep(page, cable.relatorioId, cable.blockId, 'Ensaios');
  for (const [row, value] of values.entries()) await typeCell(page, database, cable.blockId, 'isolacao', row, 1, value);
}

/** "Concluir ficha" from the sheet's Overflow menu. */
async function concluir(page: Page, tag: string): Promise<void> {
  await page.getByRole('button', { name: `Mais opções da ficha ${tag}` }).click();
  await page.getByRole('menuitem', { name: 'Concluir ficha' }).click();
}

/** Types OBSERVAÇÕES and waits for its put. */
async function typeObservation(page: Page, cable: Cable, text: string): Promise<void> {
  await observationField(page).fill(text);
  await observationField(page).press('Tab');
  await expect.poll(async () => (await outbox(database, page)).filter((op) => op.path === `sheet/${cable.blockId}/observations`).at(-1)?.value).toBe(text);
}

/** The sheet's stored pair, as the device's store holds the block row (E12-A6). */
async function storedPair(page: Page, blockId: string): Promise<{ result: unknown; restriction: unknown; concluded: boolean }> {
  const records = await readStore<{ entity: string; id: string; row: BlockRow }>(page, database, 'entities');
  const block = records.find((record) => record.entity === 'block' && record.id === blockId)!.row;
  return { result: block.sheet.conclusion.result?.value ?? null, restriction: block.sheet.conclusion.restriction?.value ?? null, concluded: block.concluded_by !== null };
}

/** The conclusion ops of the sheet in the outbox, oldest first: [field, value, batch]. */
async function conclusionOps(page: Page, blockId: string): Promise<{ field: string; value: unknown; batch: string | null }[]> {
  return (await outbox(database, page))
    .filter((op) => op.path.startsWith(`sheet/${blockId}/conclusion/`) || op.path === `block/${blockId}/concluded_by`)
    .map((op) => ({ field: op.path.split('/').at(-1)!, value: op.value, batch: (op as unknown as { batch_id: string | null }).batch_id }));
}

/** Issues revision 1 through the Export dialog and returns its DOCX's structure. */
async function issue(page: Page, relatorioId: string): Promise<ReturnType<typeof extractStructure>> {
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(sumario(page)).toBeVisible({ timeout: 30_000 });
  await syncNowAndReturn(page);
  const dialog = page.getByRole('dialog', { name: 'Gerar relatório' });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await expect(dialog).toBeVisible();
  const generate = dialog.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' });
  await expect(generate).toBeEnabled({ timeout: 30_000 });
  await generate.click();
  await confirmIssue(dialog);
  await expect(toast(page)).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
  await escapeDialog(page, dialog);
  const revision = (await readStore<{ entity: string; row: { id: string; number: number } }>(page, database, 'entities')).find((record) => record.entity === 'revision' && record.row.number === 1)!;
  const response = await page.request.get(`/api/revisions/${revision.row.id}/docx`);
  expect(response.status()).toBe(200);
  return extractStructure(Buffer.from(await response.body()));
}

/** The cable's CONCLUSÃO table in the DOCX: its band, its boxes row, its paragraph. */
function conclusionTable(structure: ReturnType<typeof extractStructure>, tag: string): string[][] {
  const table = structure.tables.find((rows) => rows[0]?.[0] === 'CONCLUSÃO' && (rows[2]?.[0] ?? '').startsWith(`Os cabos de saída ${tag}`));
  expect(table, `the CONCLUSÃO of ${tag}`).toBeDefined();
  return table!;
}

const BOXES = (aprovado: boolean, reprovado: boolean, sem: boolean, com: boolean): string[] => [
  'APROVADO',
  aprovado ? 'X' : '',
  'REPROVADO',
  reprovado ? 'X' : '',
  'SEM RESTRIÇÕES',
  sem ? 'X' : '',
  'COM RESTRIÇÕES (VER OBSERVAÇÕES)',
  com ? 'X' : '',
];

/** The Parecer box of section 10: the verdict word and the summary, one cell. */
function parecerBox(structure: ReturnType<typeof extractStructure>, verdict: string): string {
  const box = structure.tables.find((table) => table.length === 1 && table[0]!.length === 1 && table[0]![0]!.startsWith(`${verdict}\n`));
  expect(box, `the Parecer box "${verdict}"`).toBeDefined();
  return box![0]![0]!;
}

/** The kernel's words over the device's rows: the floor's reason line and the relatório's composed summary. */
async function kernelWords(page: Page, cable: Cable): Promise<{ reason: string | null; parecer: string }> {
  const snapshot = await deviceSnapshot(page, database, cable.relatorioId);
  const block = snapshot.blocks.find((row) => row.id === cable.blockId)!;
  const definition = blockDefinitionIn(snapshotDefinitionContext(snapshot), block)!;
  return { reason: conclusionFloorReasonText(block, definition, visitContextOf(snapshot, block)), parecer: composeParecer(snapshot).text };
}

test('@p0 24.3-E2E-001 v14: a reading out of its criterion is Reprovado and nothing else: no Restrições group, no "Marcar Com restrições", the observation required; the conclude stores Reprovado alone and section 9 prints both restriction boxes empty', async ({
  page,
}) => {
  test.setTimeout(420_000);
  const cable = await setUp(page);
  expect((await storedSeed(page, cable.blockId))).toBe('v14');
  await typeInsulation(page, cable, [OUT, OUT, OUT, OUT]);
  const first = cellOf(page, 'isolacao', 0, 1);
  await expect(first.locator('.measurement-field')).toHaveAttribute('data-state', 'out-of-limit');
  await expect(first.locator('.mf-helper[role="status"]')).toContainText('Abaixo do aceitável');
  await expect(testSection(page, 'isolacao').getByRole('button', { name: 'Marcar Com restrições' })).toHaveCount(0);

  await openStep(page, cable.relatorioId, cable.blockId, 'Conclusão');
  await expect(resultGroup(page).getByRole('radio', { name: 'Reprovado', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(resultGroup(page).getByRole('radio', { name: 'Aprovado', exact: true })).toBeDisabled();
  await expect(restrictionGroup(page)).toHaveCount(0);
  const words = await kernelWords(page, cable);
  expect(words.reason).toBe('A ficha exige no mínimo Reprovado: leitura fora do critério.');
  await expect(conclusionHint(page)).toHaveText(words.reason!);
  await expect(page.getByRole('group', { name: 'Sugestão' })).toContainText('Reprovado?');
  await expect(observationField(page)).toHaveAttribute('data-required', '');
  await expect(page.getByText('Obrigatória em ficha reprovada')).toBeVisible();

  // Without the observation, "Concluir ficha" goes to it and writes nothing.
  await concluir(page, cable.tag);
  await expect(page.getByTestId('ficha-announcer')).toHaveText('Faltam obrigatórios — indo para o primeiro campo faltando');
  await expect(observationField(page)).toBeFocused();
  expect((await conclusionOps(page, cable.blockId)).filter((op) => op.field === 'concluded_by')).toEqual([]);

  // Typed, the conclude writes Reprovado, the text and concluded_by in one batch, and no restriction.
  await typeObservation(page, cable, 'Isolação abaixo do aceitável nas quatro fases.');
  await concluir(page, cable.tag);
  await expect(toast(page)).toContainText('Ficha concluída');
  await expect.poll(async () => (await storedPair(page, cable.blockId)).concluded).toBe(true);
  const ops = await conclusionOps(page, cable.blockId);
  const concluded = ops.find((op) => op.field === 'concluded_by')!;
  const batch = ops.filter((op) => op.batch === concluded.batch);
  expect(batch.map((op) => op.field).sort()).toEqual(['concluded_by', 'result', 'text', 'text_basis', 'text_status']);
  expect(batch.find((op) => op.field === 'result')!.value).toBe('reprovado');
  expect(batch.find((op) => op.field === 'text_status')!.value).toBe('confirmed');
  expect(ops.some((op) => op.field === 'restriction')).toBe(false);
  expect(await storedPair(page, cable.blockId)).toEqual({ result: 'reprovado', restriction: null, concluded: true });

  // The DOCX: X on REPROVADO, both restriction boxes empty; the Parecer box Não apto names the cable's finding.
  const docx = await issue(page, cable.relatorioId);
  expect(conclusionTable(docx, cable.tag)[1]).toEqual(BOXES(false, true, false, false));
  const box = parecerBox(docx, 'Não apto');
  expect(box).toContain(`${cable.tag}, por resistência de isolação mínima de 300 MΩ`);
});

test('@p0 24.3-E2E-002 v14: observations give no restriction: text in OBSERVAÇÕES and in a Conforme row, readings within: Aprovado · Sem restrições offered and stored; the DOCX marks APROVADO and SEM RESTRIÇÕES', async ({ page }) => {
  test.setTimeout(360_000);
  const cable = await setUp(page);
  const definition = getDefinition('v14', 'cabine_primaria', TYPE);
  // A comment on a Conforme row, written from the office device.
  await pushDrafts(page, database, [officeDraft(account, { relatorioId: cable.relatorioId }, `sheet/${cable.blockId}/checklist/${definition.checklist![0]!.key}/observation`, 'Terminação limpa, sem marcas.')]);
  await syncNowAndReturn(page);
  await typeInsulation(page, cable, [WITHIN, WITHIN, WITHIN, WITHIN]);
  await openStep(page, cable.relatorioId, cable.blockId, 'Conclusão');
  await typeObservation(page, cable, 'Cabo novo, instalado nesta parada.');
  await expect(observationField(page)).not.toHaveAttribute('data-required', '');
  await expect(page.getByRole('group', { name: 'Sugestão' })).toContainText('Aprovado · Sem restrições?');
  await expect(restrictionGroup(page).getByRole('radio', { name: 'Sem restrições', exact: true })).toBeEnabled();
  await expect(page.locator('.conclusion-control .conclusion-hint')).toHaveCount(0);
  expect((await kernelWords(page, cable)).reason).toBeNull();

  await concluir(page, cable.tag);
  await expect(toast(page)).toContainText('Ficha concluída');
  await expect.poll(async () => storedPair(page, cable.blockId)).toEqual({ result: 'aprovado', restriction: 'sem_restricoes', concluded: true });

  const docx = await issue(page, cable.relatorioId);
  expect(conclusionTable(docx, cable.tag)[1]).toEqual(BOXES(true, false, true, false));
  parecerBox(docx, 'Apto');
});

test('@p1 24.3-E2E-003 v14: the technician\'s Aprovado · Com restrições over a clean floor requires OBSERVAÇÕES, is stored, prints APROVADO and COM RESTRIÇÕES, and the parecer is Apto com restrições', async ({ page }) => {
  test.setTimeout(360_000);
  const cable = await setUp(page);
  await typeInsulation(page, cable, [WITHIN, WITHIN, WITHIN, WITHIN]);
  await openStep(page, cable.relatorioId, cable.blockId, 'Conclusão');
  await restrictionGroup(page).getByRole('radio', { name: 'Com restrições', exact: true }).click();
  await expect(observationField(page)).toHaveAttribute('data-required', '');
  await expect(page.getByText('Obrigatória com restrições')).toBeVisible();
  await concluir(page, cable.tag);
  await expect(observationField(page)).toBeFocused();
  await typeObservation(page, cable, 'Acompanhar o aquecimento da terminação na próxima visita.');
  await concluir(page, cable.tag);
  await expect(toast(page)).toContainText('Ficha concluída');
  await expect.poll(async () => storedPair(page, cable.blockId)).toEqual({ result: 'aprovado', restriction: 'com_restricoes', concluded: true });

  const docx = await issue(page, cable.relatorioId);
  expect(conclusionTable(docx, cable.tag)[1]).toEqual(BOXES(true, false, false, true));
  parecerBox(docx, 'Apto com restrições');
});

test('@p1 24.3-E2E-004 v14: concluded Aprovado · Com restrições, a reading then corrected out: the ficha, the Sumário and the draft read Reprovado with no restriction, "Conclusão ajustada pela ficha" and its Confirmar clear the stored restriction; the DOCX prints REPROVADO alone', async ({
  page,
  context,
}) => {
  test.setTimeout(480_000);
  const cable = await setUp(page);
  await typeInsulation(page, cable, [WITHIN, WITHIN, WITHIN, WITHIN]);
  await openStep(page, cable.relatorioId, cable.blockId, 'Conclusão');
  await restrictionGroup(page).getByRole('radio', { name: 'Com restrições', exact: true }).click();
  await typeObservation(page, cable, 'Acompanhar a terminação da fase C.');
  await concluir(page, cable.tag);
  await expect(toast(page)).toContainText('Ficha concluída');
  await expect.poll(async () => storedPair(page, cable.blockId)).toEqual({ result: 'aprovado', restriction: 'com_restricoes', concluded: true });

  // The reading corrected out of its criterion after the conclude.
  await typeInsulation(page, cable, [OUT]);
  await openStep(page, cable.relatorioId, cable.blockId, 'Conclusão');
  await expect(resultGroup(page).getByRole('radio', { name: 'Reprovado', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(restrictionGroup(page)).toHaveCount(0);
  await expect(page.getByText('Obrigatória em ficha reprovada')).toHaveCount(0);
  const adjusted = page.locator('.conclusion-control .conclusion-hint[role="status"]');
  await expect(adjusted).toContainText('Conclusão ajustada pela ficha');

  // The Sumário's section 10 row and the draft PDF read Reprovado (Não apto) with no restriction, before the Confirmar.
  await page.goto(`/relatorio/${cable.relatorioId}`);
  await expect(sumario(page).locator('li[data-row="section_10"] .sum-status')).toHaveText('Não apto', { timeout: 30_000 });
  const draft = await previewText(page, context, cable.relatorioId);
  expect(draft).toContain(compact(`APROVADO REPROVADO X SEM RESTRIÇÕES COM RESTRIÇÕES (VER OBSERVAÇÕES) Os cabos de saída ${cable.tag}`));

  // Its Confirmar: Reprovado and the stored restriction cleared, one batch.
  await page.goto(`/relatorio/${cable.relatorioId}/ficha/${cable.blockId}`);
  await openStep(page, cable.relatorioId, cable.blockId, 'Conclusão');
  await adjusted.getByRole('button', { name: 'Confirmar' }).click();
  await expect(adjusted).toHaveCount(0);
  await expect.poll(async () => storedPair(page, cable.blockId)).toEqual({ result: 'reprovado', restriction: null, concluded: true });
  const ops = await conclusionOps(page, cable.blockId);
  const last = ops.filter((op) => op.field === 'result' && op.value === 'reprovado').at(-1)!;
  const confirmBatch = ops.filter((op) => op.batch === last.batch && (op.field === 'result' || op.field === 'restriction'));
  expect(confirmBatch.map((op) => [op.field, op.value]).sort()).toEqual([
    ['restriction', null],
    ['result', 'reprovado'],
  ]);

  const docx = await issue(page, cable.relatorioId);
  expect(conclusionTable(docx, cable.tag)[1]).toEqual(BOXES(false, true, false, false));
  parecerBox(docx, 'Não apto');
});

test('@p1 24.3-E2E-005 v13 beside it: the same reading out concludes as before: Reprovado · Com restrições, "Marcar Com restrições" offered, "Obrigatória com restrições"; the DOCX prints REPROVADO and COM RESTRIÇÕES and the parecer by reason', async ({ page }) => {
  test.setTimeout(360_000);
  const cable = await setUp(page, 'v13');
  expect(await storedSeed(page, cable.blockId)).toBe('v13');
  await typeInsulation(page, cable, [OUT, OUT, OUT, OUT]);
  await expect(cellOf(page, 'isolacao', 0, 1).getByRole('button', { name: 'Marcar Com restrições' })).toBeVisible();
  await openStep(page, cable.relatorioId, cable.blockId, 'Conclusão');
  await expect(resultGroup(page).getByRole('radio', { name: 'Reprovado', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(restrictionGroup(page).getByRole('radio', { name: 'Com restrições', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(conclusionHint(page)).toHaveText('A ficha exige no mínimo Reprovado · Com restrições: leitura fora do critério.');
  await expect(page.getByText('Obrigatória com restrições')).toBeVisible();
  await typeObservation(page, cable, 'Isolação abaixo do aceitável nas quatro fases.');
  await concluir(page, cable.tag);
  await expect(toast(page)).toContainText('Ficha concluída');
  await expect.poll(async () => storedPair(page, cable.blockId)).toEqual({ result: 'reprovado', restriction: 'com_restricoes', concluded: true });

  const docx = await issue(page, cable.relatorioId);
  expect(conclusionTable(docx, cable.tag)[1]).toEqual(BOXES(false, true, false, true));
  expect(parecerBox(docx, 'Não apto')).toContain(`1 ficha foi reprovada por leituras fora do critério de aceitação (${cable.tag}).`);
});

/** The block's seed in the device's store. */
async function storedSeed(page: Page, blockId: string): Promise<string | undefined> {
  await expect.poll(async () => (await readStore<{ entity: string; id: string }>(page, database, 'entities')).some((record) => record.entity === 'block' && record.id === blockId), { timeout: 30_000 }).toBe(true);
  const records = await readStore<{ entity: string; id: string; row: BlockRow }>(page, database, 'entities');
  return records.find((record) => record.entity === 'block' && record.id === blockId)?.row.seed_version;
}

/** "Pré-visualizar" in the Export dialog; the draft PDF's text, compacted. */
async function previewText(page: Page, context: BrowserContext, relatorioId: string): Promise<string> {
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(sumario(page)).toBeVisible({ timeout: 30_000 });
  await syncNowAndReturn(page);
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  const dialog = page.getByRole('dialog', { name: 'Gerar relatório' });
  const preview = dialog.locator('.generate-row').getByRole('button', { name: 'Pré-visualizar' });
  await expect(preview).toBeEnabled({ timeout: 30_000 });
  const tabPromise = context.waitForEvent('page');
  await preview.click();
  const tab = await tabPromise;
  const requested = await tab.waitForRequest(/\/api\/relatorios\/[0-9a-f-]{36}\/preview\.pdf\?v=[0-9a-f-]{36}$/, { timeout: JOB_TIMEOUT });
  const pdf = await page.request.get(requested.url());
  expect(pdf.status()).toBe(200);
  await tab.close();
  await escapeDialog(page, dialog);
  return compact((await pdfTextItems(new Uint8Array(await pdf.body()))).join(' '));
}
