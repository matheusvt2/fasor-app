import { getDefinition, SEED_VERSION, type BlockRow, type FieldDef, type JsonValue, type RelatorioRow, type RevisionRow } from '@app/domain';
import type { Page } from '@playwright/test';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { escapeDialog } from './support/dialogs.ts';
import { openStep, outbox, typeCell } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { confirmIssue, setParecer } from './support/relatorio-flow.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNowAndReturn } from './support/sync.ts';

/*
 * Story 25.4 (batch e25b, every seed; Bruno M17 and the stored half of M01), driven as a person does at
 * 1280 px on a new relatório's cabos de saída (plate and checklist from the office, the readings
 * typed): Etapa 6's Apto is tapped, the ficha is concluded Aprovado · Sem restrições inside its
 * criterion, then one reading is typed out of it. "Gerar relatório" issues revision 1: the DOCX prints
 * Não apto and REPROVADO, the revision row in the device's store holds what it printed (`nao_apto`, the
 * cable `{reprovado, null}`), and the technician's choices stay stored as they were (the parecer Apto,
 * the pair Aprovado · Sem restrições). The reading corrected, the ficha and Etapa 6 show Aprovado and
 * Apto, and revision 2 holds `apto` and `{aprovado, sem_restricoes}`, revision 1 unchanged. It issues
 * two revisions through the api's one queue and LibreOffice, so the file runs in the queue lane.
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
// The "Conclusão ajustada pela ficha" line (a complete stored pair the floor made stricter), as 24.3-E2E-004 reads it.
const adjustedNote = (page: Page) => page.locator('.conclusion-control .conclusion-hint[role="status"]', { hasText: 'Conclusão ajustada pela ficha' });

/** Story 25.7: the sheet's stale conclusion text replaced with "Substituir", as the blocked Export dialog asks. */
async function replaceStaleText(page: Page): Promise<void> {
  const alt = page.locator('.ficha-conc-text .suggestion-alt');
  await expect(alt).toHaveText('Sugerido: texto atualizado — Substituir');
  await alt.getByRole('button', { name: 'Substituir' }).click();
  await expect(alt).toHaveCount(0);
}

/** A plate value by kind, as a technician might type it; a select takes its first option. */
function plateValue(field: FieldDef, n: number): JsonValue {
  switch (field.kind) {
    case 'text':
      return `E25B-${n + 1}`;
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

/** A new relatório on the current seed, Em campo, its first cabos de saída with the plate and every row Conforme from the office. */
async function setUp(page: Page): Promise<Cable> {
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const cable = built.sheets.find((sheet) => sheet.blockType === TYPE)!;
  const definition = getDefinition(SEED_VERSION, 'cabine_primaria', TYPE);
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

/** Types the given phases' 1 MINUTO (from the first) through the Ensaios step. */
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

/** The relatório's stored parecer verdict (`setup.parecer`), as the device's store holds its row. */
async function storedParecer(page: Page, relatorioId: string): Promise<string | null> {
  const records = await readStore<{ entity: string; id: string; row: RelatorioRow }>(page, database, 'entities');
  return records.find((record) => record.entity === 'relatorio' && record.id === relatorioId)?.row.setup.parecer?.verdict ?? null;
}

/** The revision `number` of the relatório as the device's store holds it. */
async function storedRevision(page: Page, relatorioId: string, number: number): Promise<RevisionRow | undefined> {
  const records = await readStore<{ entity: string; row: RevisionRow }>(page, database, 'entities');
  return records.find((record) => record.entity === 'revision' && record.row.relatorio_id === relatorioId && record.row.number === number)?.row;
}

/** Issues revision `number` through the Export dialog; returns its row in the device's store and its DOCX's structure. */
async function issue(page: Page, relatorioId: string, number: number): Promise<{ revision: RevisionRow; docx: ReturnType<typeof extractStructure> }> {
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(sumario(page)).toBeVisible({ timeout: 30_000 });
  await syncNowAndReturn(page);
  const dialog = page.getByRole('dialog', { name: 'Gerar relatório' });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await expect(dialog).toBeVisible();
  const generate = dialog.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' });
  // The dialog may open on its last state (a ready revision): "Gerar de novo" leads back to the idle one.
  const again = dialog.getByRole('button', { name: 'Gerar de novo' });
  await expect(again.or(generate).first()).toBeVisible({ timeout: 30_000 });
  if (await again.isVisible()) await again.click();
  await expect(generate).toBeEnabled({ timeout: 30_000 });
  await generate.click();
  await confirmIssue(dialog);
  await expect(toast(page)).toHaveText(`Revisão ${number} pronta — DOCX e PDF`, { timeout: JOB_TIMEOUT });
  await escapeDialog(page, dialog);
  await expect.poll(async () => (await storedRevision(page, relatorioId, number)) !== undefined, { timeout: 30_000 }).toBe(true);
  const revision = (await storedRevision(page, relatorioId, number))!;
  const response = await page.request.get(`/api/revisions/${revision.id}/docx`);
  expect(response.status()).toBe(200);
  return { revision, docx: extractStructure(Buffer.from(await response.body())) };
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

/** Section 10's Parecer box prints `verdict` as its title: the first line of the one-cell table that holds it. */
function parecerTitle(structure: ReturnType<typeof extractStructure>, verdict: string): void {
  const box = structure.tables.find((table) => table.length === 1 && table[0]!.length === 1 && table[0]![0]!.startsWith(`${verdict}\n`));
  expect(box, `the Parecer box "${verdict}"`).toBeDefined();
}

test('@p1 25.4-E2E-001 the revision keeps the verdicts it printed: stored Apto and Aprovado, a reading then out: revision 1 prints and holds Não apto and Reprovado, the stored choices unchanged; corrected, revision 2 holds Apto and Aprovado, revision 1 unchanged', async ({
  page,
}) => {
  test.setTimeout(600_000);
  const cable = await setUp(page);

  // Etapa 6: Apto tapped while nothing is judged yet, so the tap stores the technician's choice.
  await setParecer(page, cable.relatorioId, 'Apto');
  await expect.poll(async () => storedParecer(page, cable.relatorioId)).toBe('apto');

  // The ficha concluded Aprovado · Sem restrições with every reading inside its criterion.
  await typeInsulation(page, cable, [WITHIN, WITHIN, WITHIN, WITHIN]);
  await openStep(page, cable.relatorioId, cable.blockId, 'Conclusão');
  await typeObservation(page, cable, 'Cabo novo, instalado nesta parada.');
  await concluir(page, cable.tag);
  await expect(toast(page)).toContainText('Ficha concluída');
  await expect.poll(async () => storedPair(page, cable.blockId)).toEqual({ result: 'aprovado', restriction: 'sem_restricoes', concluded: true });

  // One reading typed out of its criterion after the conclude: the ficha reads Reprovado; nothing is written over the choice.
  await typeInsulation(page, cable, [OUT]);
  await openStep(page, cable.relatorioId, cable.blockId, 'Conclusão');
  await expect(resultGroup(page).getByRole('radio', { name: 'Reprovado', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(adjustedNote(page)).toBeVisible();
  expect(await storedPair(page, cable.blockId)).toEqual({ result: 'aprovado', restriction: 'sem_restricoes', concluded: true });
  // Story 25.7: the text confirmed at the conclude is stale now and blocks "Gerar relatório"; "Substituir" writes the text alone.
  await replaceStaleText(page);
  expect(await storedPair(page, cable.blockId)).toEqual({ result: 'aprovado', restriction: 'sem_restricoes', concluded: true });

  // Revision 1: the DOCX prints Não apto and REPROVADO alone; the revision holds them; the stored choices stand.
  const first = await issue(page, cable.relatorioId, 1);
  expect(conclusionTable(first.docx, cable.tag)[1]).toEqual(BOXES(false, true, false, false));
  parecerTitle(first.docx, 'Não apto');
  expect(first.revision.printed_parecer).toBe('nao_apto');
  expect(first.revision.printed_conclusions?.[cable.blockId]).toEqual({ result: 'reprovado', restriction: null });
  expect(await storedParecer(page, cable.relatorioId)).toBe('apto');
  expect(await storedPair(page, cable.blockId)).toEqual({ result: 'aprovado', restriction: 'sem_restricoes', concluded: true });

  // The reading corrected: the ficha shows Aprovado · Sem restrições again, Etapa 6 shows Apto.
  await typeInsulation(page, cable, [WITHIN]);
  await openStep(page, cable.relatorioId, cable.blockId, 'Conclusão');
  await expect(resultGroup(page).getByRole('radio', { name: 'Aprovado', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(restrictionGroup(page).getByRole('radio', { name: 'Sem restrições', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(adjustedNote(page)).toHaveCount(0);
  // Story 25.7: the text replaced under Reprovado is stale again once the reading is corrected.
  await replaceStaleText(page);
  await page.goto(`/relatorio/${cable.relatorioId}/setup?etapa=6`);
  await expect(page.getByRole('heading', { level: 2, name: 'Etapa 6 — Conclusão e parecer' })).toBeFocused({ timeout: 30_000 });
  await expect(page.getByRole('radiogroup', { name: 'Parecer' }).getByRole('radio', { name: 'Apto', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.parecer-box .pb-verdict')).toHaveText('Apto');

  // Revision 2 holds what it printed; revision 1 is as it was.
  const second = await issue(page, cable.relatorioId, 2);
  expect(conclusionTable(second.docx, cable.tag)[1]).toEqual(BOXES(true, false, true, false));
  parecerTitle(second.docx, 'Apto');
  expect(second.revision.printed_parecer).toBe('apto');
  expect(second.revision.printed_conclusions?.[cable.blockId]).toEqual({ result: 'aprovado', restriction: 'sem_restricoes' });
  expect(await storedRevision(page, cable.relatorioId, 1)).toEqual(first.revision);
  expect(await storedParecer(page, cable.relatorioId)).toBe('apto');
  expect(await storedPair(page, cable.blockId)).toEqual({ result: 'aprovado', restriction: 'sem_restricoes', concluded: true });
});
