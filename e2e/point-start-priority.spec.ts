import { addCalendarDays, calendarDateOfInstant, cellAddressesOf, formatCalendarDate, getDefinition, getSeed, POINT_DEFAULT_ACTION, pointStartLine, priorityAccessibleName, SEED_VERSION, type PointRow } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { escapeDialog } from './support/dialogs.ts';
import { openStep, outbox, outboxValues, setUpRelatorio, testSection } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { confirmIssue, setParecer } from './support/relatorio-flow.ts';

/*
 * 28.5-E2E-001 (batch e28b, Story 28.5, B-8, Matheus's Q-6; `60-ficha.html` `#ficha-dlg-ponto-v18`). On a v18 relatório from the
 * standard template at 1280 px, "Criar ponto de atenção" opens the editor at the origin's priority with the line that says
 * why: a cable's reading out of its criterion P1, with Bruno's action (the seeded test has no recommendation) and the Prazo
 * as its term, "30 dias após a emissão"; another cable's restricted reading P4; an NC item P2, changed to P3 by a tap; a TP
 * not tested P4; a ficha reproved by hand P1. A TC not tested for "Equipamento da concessionária" offers no point. The
 * reading's and the item's points are stored; the issued DOCX's action plan prints their deadlines counted from the issue
 * date. Every expected word is the kernel's. It issues a revision through the api's one queue, so it runs in the queue lane.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const editorOf = (page: Page) => page.getByRole('dialog', { name: 'Criar ponto de atenção' });
const placeOf = (scope: Locator) => scope.locator('.e24-point-place');
const pointCreates = async (page: Page) => (await outbox(database, page)).filter((row) => row.path.startsWith('point/') && row.kind === 'create');
const storedPoints = async (page: Page) =>
  (await readStore<{ entity: string; row: PointRow }>(page, database, 'entities')).filter((record) => record.entity === 'point' && record.row.removed_at === null).map((record) => record.row);

/** The editor opened at `priority` with the kernel's line for `origin`; the other levels unchecked. */
async function expectStart(page: Page, origin: PointRow['origin'], priority: 'P0' | 'P1' | 'P2' | 'P3' | 'P4'): Promise<Locator> {
  const editor = editorOf(page);
  await expect(editor).toBeVisible();
  const picker = editor.getByRole('radiogroup', { name: 'Prioridade' });
  await expect(picker.getByRole('radio', { name: priorityAccessibleName(priority) })).toHaveAttribute('aria-checked', 'true');
  await expect(picker.getByRole('radio', { checked: true })).toHaveCount(1);
  await expect(editor.getByText(pointStartLine(SEED_VERSION, origin)!, { exact: true })).toBeVisible();
  return editor;
}

/** Closes the editor with Esc: an untouched seeded point is never stored. */
async function closeUntouched(page: Page): Promise<void> {
  const before = (await pointCreates(page)).length;
  await escapeDialog(page, editorOf(page));
  expect((await pointCreates(page)).length).toBe(before);
}

test('@p0 28.5-E2E-001 v18: a point starts at its origin\'s priority with Bruno\'s action and the term; none for the utility\'s equipment; the DOCX counts the deadline from the issue date', async ({ page }) => {
  test.setTimeout(540_000);
  expect(SEED_VERSION).toBe('v18');
  const { relatorioId, sheets } = await setUpRelatorio(page, account, database);
  const cables = sheets.filter((sheet) => sheet.blockType === 'cabos_entrada' || sheet.blockType === 'cabos_saida');
  const [out, restricted, reproved] = cables;
  expect(reproved).toBeDefined();
  const tp = sheets.find((sheet) => sheet.blockType === 'tp')!;
  const tc = sheets.find((sheet) => sheet.blockType === 'tc')!;
  const firstCell = (blockType: string) => cellAddressesOf(getDefinition(SEED_VERSION, 'cabine_primaria', blockType), 'isolacao')[0]!;
  const typeFrom = async (blockId: string, blockType: string, values: readonly string[]) => {
    const a = firstCell(blockType);
    await page.locator(`section[data-test-key="isolacao"] .ficha-cell[data-cell="isolacao:${a.row}:${a.col}"]`).filter({ visible: true }).locator('input.mf-value').click();
    for (const value of values) {
      await page.keyboard.type(value);
      await page.keyboard.press('Enter');
    }
    await expect.poll(async () => (await outbox(database, page)).filter((row) => row.path.startsWith(`sheet/${blockId}/test/isolacao/cell/`)).length).toBe(values.length);
  };

  // --- a reading out of its criterion: P1, Bruno's action, the term; stored by "Concluir" ---
  await openStep(page, relatorioId, out!.blockId, 'Ensaios');
  await typeFrom(out!.blockId, out!.blockType, ['1M']);
  await placeOf(testSection(page, 'isolacao')).getByRole('button', { name: 'Criar ponto de atenção' }).click();
  let editor = await expectStart(page, 'reading', 'P1');
  const action = editor.getByRole('textbox', { name: 'Ação recomendada' });
  await expect(action).toHaveValue(POINT_DEFAULT_ACTION);
  await expect(action).toHaveAccessibleDescription('Ação padrão: o ensaio não tem recomendação · editável');
  await expect(editor.locator('[data-prazo-term]')).toHaveText('30 dias após a emissão');
  await expect(editor.getByText('A data sai no relatório emitido, contada da emissão. Digite uma data para fixá-la.', { exact: true })).toBeVisible();
  await editor.getByRole('button', { name: 'Concluir' }).click();
  await expect(editor).toHaveCount(0);
  await expect.poll(async () => (await storedPoints(page)).map((point) => [point.origin, point.priority, point.action])).toEqual([['reading', 'P1', POINT_DEFAULT_ACTION]]);

  // --- the same cable's first checklist item NC: P2, changed to P3 by a tap (the pick stores the point) ---
  const checklist = getDefinition(SEED_VERSION, 'cabine_primaria', out!.blockType).checklist!;
  await page.goto(`/relatorio/${relatorioId}/ficha/${out!.blockId}`);
  const row = page.locator(`#ficha-step-verificacoes li.checklist-row[data-item-key="${checklist[0]!.key}"]`);
  await row.getByRole('radio', { name: 'Não conforme', exact: true }).click();
  await expect.poll(async () => (await outboxValues(database, page, `sheet/${out!.blockId}/checklist/${checklist[0]!.key}/result`)).at(-1)).toBe('NC');
  await row.getByRole('button', { name: 'Criar ponto de atenção' }).click();
  editor = await expectStart(page, 'nc', 'P2');
  await editor.getByRole('radiogroup', { name: 'Prioridade' }).getByRole('radio', { name: priorityAccessibleName('P3') }).click();
  await expect(editor.getByRole('radiogroup', { name: 'Prioridade' }).getByRole('radio', { name: priorityAccessibleName('P3') })).toHaveAttribute('aria-checked', 'true');
  await expect(editor.locator('[data-prazo-term]')).toHaveText('180 dias após a emissão');
  await editor.getByRole('button', { name: 'Concluir' }).click();
  await expect(editor).toHaveCount(0);
  await expect.poll(async () => (await storedPoints(page)).map((point) => [point.origin, point.priority]).sort()).toEqual([['nc', 'P3'], ['reading', 'P1']]);

  // --- a restricted reading (5, 5 and 1,5 GΩ): P4 ---
  await openStep(page, relatorioId, restricted!.blockId, 'Ensaios');
  await typeFrom(restricted!.blockId, restricted!.blockType, ['5G', '5G', '1,5G']);
  await placeOf(testSection(page, 'isolacao')).getByRole('button', { name: 'Criar ponto de atenção' }).click();
  editor = await expectStart(page, 'restricao', 'P4');
  await expect(editor.getByRole('textbox', { name: 'Ação recomendada' })).toHaveValue(POINT_DEFAULT_ACTION);
  await closeUntouched(page);

  // --- a ficha reproved by hand: P1, on the Conclusão step ---
  await openStep(page, relatorioId, reproved!.blockId, 'Conclusão');
  await page.getByRole('radiogroup', { name: 'Resultado' }).getByRole('radio', { name: 'Reprovado' }).click();
  await expect.poll(async () => await outboxValues(database, page, `sheet/${reproved!.blockId}/conclusion/result`)).toContainEqual('reprovado');
  await placeOf(page.locator('#ficha-conc')).getByRole('button', { name: 'Criar ponto de atenção' }).click();
  await expectStart(page, 'reprovado', 'P1');
  await closeUntouched(page);

  // --- the TP not tested ("Solicitação do cliente"): P4 from the band ---
  const markNotTested = async (blockId: string, tag: string, reason: string) => {
    await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
    await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: `Mais opções da ficha ${tag}` }).click();
    await page.getByRole('menuitem', { name: 'Marcar não ensaiado' }).click();
    const dialog = page.getByRole('dialog', { name: 'Marcar não ensaiado' });
    await dialog.getByRole('radio', { name: reason }).click();
    await dialog.getByRole('button', { name: 'Marcar não ensaiado' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.not-tested-band')).toBeVisible();
  };
  await markNotTested(tp.blockId, tp.tag, 'Solicitação do cliente');
  await page.locator('.not-tested-point').getByRole('button', { name: 'Criar ponto de atenção' }).click();
  await expectStart(page, 'not_tested', 'P4');
  await closeUntouched(page);

  // --- the TC not tested for the utility's equipment: no point offered ---
  const utility = getSeed(SEED_VERSION, 'cabine_primaria').not_tested_reasons.find((reason) => reason.utility === true)!;
  await markNotTested(tc.blockId, tc.tag, utility.label);
  await expect(page.getByRole('textbox', { name: 'Concessionária', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Criar ponto de atenção' })).toHaveCount(0);
  // Its name, so the relatório issues (the empty slot blocks it, Story 28.4).
  const name = page.getByRole('textbox', { name: 'Concessionária', exact: true });
  await name.fill('Concessionária Exemplo');
  await name.press('Tab');
  await expect.poll(async () => ((await outboxValues(database, page, `block/${tc.blockId}/not_tested`)).at(-1) as { utility_name?: string } | undefined)?.utility_name).toBe('Concessionária Exemplo');

  // --- the issued DOCX: the deadlines counted from the issue date ---
  await setParecer(page, relatorioId, 'Apto');
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  const modal = page.getByRole('dialog', { name: 'Gerar relatório' });
  await modal.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' }).click();
  await confirmIssue(modal);
  await expect(page.getByTestId('toast')).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: 150_000 });
  const issueDate = calendarDateOfInstant(new Date());
  const revision = (await readStore<{ entity: string; row: { id: string; number: number; relatorio_id: string } }>(page, database, 'entities')).find(
    (record) => record.entity === 'revision' && record.row.relatorio_id === relatorioId && record.row.number === 1,
  )!;
  const structure = extractStructure(Buffer.from(await (await page.request.get(`/api/revisions/${revision.row.id}/docx`)).body()));
  const plan = structure.tables.find((table) => table[0]?.[0] === 'Nº' && table[0]?.[4] === 'Prazo')!;
  expect(plan).toBeDefined();
  const byPriority = Object.fromEntries(plan.slice(1).map((cells) => [cells[3], cells[4]]));
  expect(byPriority).toEqual({
    'P1 · Curto prazo': formatCalendarDate(addCalendarDays(issueDate, 30)),
    'P3 · Longo prazo': formatCalendarDate(addCalendarDays(issueDate, 180)),
  });
});
