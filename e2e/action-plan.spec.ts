import { deadlineFromPriority, formatCalendarDate, newPointRow, pointCreatedDate, type OpDraft, type PointRow } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { paragraphText, readZipEntries } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { downloadBytes, downloadFrom } from './support/download.ts';
import { readStore } from './support/outbox.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { confirmIssue, setParecer, typeDate } from './support/relatorio-flow.ts';
import { newRelatorioDrafts, officeDraft, pushDrafts, type SeededSheet } from './support/relatorio-seed.ts';

/*
 * 11.9/11.10-E2E: the Priority picker, Prazo and Responsável of a point of attention, and the
 * action-plan table section 8 prints, driven as a person would (taps, arrow keys, typing,
 * reload) at 1280 px, each asserting the device's rows and outbox, not only the screen. The
 * last @p0 generates a DOCX through the api's one queue and LibreOffice, so this spec runs
 * in the serial group (`e2e/support/groups.ts`).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

type Scope = { relatorioId: string };

interface OutboxRow {
  kind: string;
  path: string;
  value: unknown;
  batch_id: string | null;
}

const NEXT_INTERVENTION = '2027-09-08';
const JOB_TIMEOUT = 150_000;

const pointOps = async (page: Page) => (await readStore<OutboxRow>(page, database, 'outbox')).filter((row) => row.path.startsWith('point/'));
const storedPoint = async (page: Page, id: string) =>
  (await readStore<{ entity: string; row: PointRow }>(page, database, 'entities')).find((record) => record.entity === 'point' && record.row.id === id)?.row ?? null;
const cards = (page: Page) => page.locator('.poa-list > .point-of-attention-card:not(.is-auto):not(.is-editing)');
const toast = (page: Page) => page.getByTestId('toast');
const picker = (scope: Locator) => scope.getByRole('radiogroup', { name: 'Prioridade' });
const radio = (scope: Locator, name: string) => picker(scope).getByRole('radio', { name, exact: true });
const prazo = (scope: Locator) => scope.locator('.poa-prazo-sf');
const row8 = (page: Page) => page.locator('li.sum-row[data-row="section_8"]');

/** Office-written points, placed in order after one another. */
function pointDrafts(scope: Scope, texts: readonly string[]): { drafts: OpDraft[]; rows: PointRow[] } {
  const rows: PointRow[] = [];
  for (const text of texts) rows.push(newPointRow({ id: newId(), relatorioId: scope.relatorioId, text, equipmentId: null, origin: 'manual', action: null }, rows));
  return { drafts: rows.map((row) => officeDraft(account, scope, `point/${row.id}`, row, 'create')), rows };
}

/** A relatório of the standard template with `texts` as office-written points, open on its Points surface. */
async function setUp(
  page: Page,
  options: { texts?: readonly string[]; nextIntervention?: string | null; extra?: (scope: Scope, sheets: SeededSheet[]) => OpDraft[] } = {},
): Promise<{ relatorioId: string; points: PointRow[] }> {
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const scope = { relatorioId: built.relatorioId };
  const { drafts, rows } = pointDrafts(scope, options.texts ?? ['Plaquetas de identificação ausentes.']);
  const next = options.nextIntervention === undefined ? NEXT_INTERVENTION : options.nextIntervention;
  const setup = next === null ? [] : [officeDraft(account, scope, 'relatorio/setup/next_intervention_date', next)];
  await pushDrafts(page, database, [...built.drafts, ...setup, ...drafts, ...(options.extra?.(scope, built.sheets) ?? [])]);
  await page.goto(`/relatorio/${built.relatorioId}/pontos`);
  await expect(page.locator('.poa-list')).toBeAttached({ timeout: 30_000 });
  await expect(cards(page)).toHaveCount(rows.length, { timeout: 30_000 });
  return { relatorioId: built.relatorioId, points: rows };
}

/** "Editar" on point `position`: its editor, in place. */
async function openEditor(page: Page, position: number): Promise<Locator> {
  await page.getByRole('button', { name: `Editar o ponto ${position}, Geral` }).click();
  const editor = page.getByRole('article', { name: `Ponto de atenção ${position} em edição` });
  await expect(editor).toBeVisible();
  return editor;
}

const suggestionOf = (point: PointRow, priority: 'P0' | 'P1' | 'P2' | 'P3' | 'P4', next: string | null = NEXT_INTERVENTION) =>
  deadlineFromPriority(priority, pointCreatedDate(point.id), next);

test('@p0 11.9-E2E-001 a tap on "P1 · Curto prazo" writes the priority and the +30 date in one batch; Prazo says "Sugerido"; the card shows both after a reload', async ({ page }) => {
  test.setTimeout(150_000);
  const { points } = await setUp(page);
  const point = points[0]!;
  const expected = suggestionOf(point, 'P1')!;
  expect(expected).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  const editor = await openEditor(page, 1);
  // No default: nothing checked.
  await expect(picker(editor).getByRole('radio', { checked: true })).toHaveCount(0);
  await radio(editor, 'P1, Curto prazo, 30 dias').click();
  await expect(radio(editor, 'P1, Curto prazo, 30 dias')).toHaveAttribute('aria-checked', 'true');

  await expect.poll(async () => (await pointOps(page)).map((op) => [op.kind, op.path, op.value])).toEqual([
    ['put', `point/${point.id}/priority`, 'P1'],
    ['put', `point/${point.id}/deadline`, expected],
  ]);
  const ops = await pointOps(page);
  expect(ops[0]!.batch_id).not.toBeNull();
  expect(ops[1]!.batch_id).toBe(ops[0]!.batch_id);
  expect(await storedPoint(page, point.id)).toMatchObject({ priority: 'P1', deadline: expected });

  await expect(prazo(editor)).toHaveAttribute('data-state', 'suggested');
  await expect(prazo(editor).locator('.suggested-pill')).toHaveText('Sugerido');
  const [year, month, day] = expected.split('-');
  await expect(prazo(editor).getByRole('spinbutton')).toHaveText([day!, month!, year!]);

  await editor.getByRole('button', { name: 'Concluir' }).click();
  await expect(editor).toHaveCount(0);
  await page.reload();
  const card = cards(page).first();
  await expect(card.locator('.priority-pill')).toHaveText('P1 · Curto prazo', { timeout: 30_000 });
  await expect(card.locator('.priority-pill')).toHaveAttribute('data-p', '1');
  await expect(card.locator('.poa-fields')).toContainText(formatCalendarDate(expected));
});

test('@p0 11.9-E2E-002 P4 takes the relatório\'s next intervention date verbatim', async ({ page }) => {
  test.setTimeout(150_000);
  const { points } = await setUp(page);
  const editor = await openEditor(page, 1);
  await radio(editor, 'P4, Próxima manutenção, próxima intervenção').click();
  await expect.poll(async () => (await storedPoint(page, points[0]!.id))?.deadline).toBe(NEXT_INTERVENTION);
  await expect(prazo(editor).getByRole('spinbutton')).toHaveText(['08', '09', '2027']);
  await expect(prazo(editor).locator('.suggested-pill')).toHaveText('Sugerido');
});

test('@p0 11.9-E2E-002b on a relatório with no next intervention date, P4 clears a suggested date and the helper says why', async ({ page }) => {
  test.setTimeout(150_000);
  const again = await setUp(page, { nextIntervention: null });
  const second = await openEditor(page, 1);
  await radio(second, 'P1, Curto prazo, 30 dias').click();
  await expect.poll(async () => (await storedPoint(page, again.points[0]!.id))?.deadline).toBe(suggestionOf(again.points[0]!, 'P1'));
  await radio(second, 'P4, Próxima manutenção, próxima intervenção').click();
  await expect.poll(async () => await storedPoint(page, again.points[0]!.id)).toMatchObject({ priority: 'P4', deadline: null });
  const last = (await pointOps(page)).slice(-2);
  expect(last.map((op) => [op.path, op.value])).toEqual([
    [`point/${again.points[0]!.id}/priority`, 'P4'],
    [`point/${again.points[0]!.id}/deadline`, null],
  ]);
  await expect(prazo(second).locator('.suggested-pill')).toHaveCount(0);
  await expect(prazo(second)).toContainText('O relatório não tem data da próxima intervenção');
});

test('@p0 11.9-E2E-003 a typed Prazo survives a later pick, the differing suggestion offers "Substituir", and pressing it writes the suggestion', async ({ page }) => {
  test.setTimeout(150_000);
  const { points } = await setUp(page);
  const point = points[0]!;
  const editor = await openEditor(page, 1);
  await radio(editor, 'P1, Curto prazo, 30 dias').click();
  await expect.poll(async () => (await storedPoint(page, point.id))?.priority).toBe('P1');

  // Typed over the suggestion: 30/11/2030, committed on blur.
  await typeDate(editor, 'Prazo', '30112030');
  await editor.getByRole('textbox', { name: 'Responsável' }).click();
  await expect.poll(async () => (await storedPoint(page, point.id))?.deadline).toBe('2030-11-30');
  await expect(prazo(editor)).toHaveAttribute('data-state', 'confirmed');
  await expect(prazo(editor).locator('.suggested-pill')).toHaveCount(0);

  const before = (await pointOps(page)).length;
  await radio(editor, 'P3, Longo prazo, 180 dias').click();
  await expect.poll(async () => (await pointOps(page)).length).toBe(before + 1);
  expect((await pointOps(page)).at(-1)).toMatchObject({ kind: 'put', path: `point/${point.id}/priority`, value: 'P3' });
  expect(await storedPoint(page, point.id)).toMatchObject({ priority: 'P3', deadline: '2030-11-30' });

  const p3 = suggestionOf(point, 'P3')!;
  const alt = prazo(editor).locator('.suggestion-alt');
  await expect(alt).toContainText(`Sugerido: ${formatCalendarDate(p3)}`);
  await alt.getByRole('button', { name: 'Substituir' }).click();
  await expect.poll(async () => (await storedPoint(page, point.id))?.deadline).toBe(p3);
  expect((await pointOps(page)).at(-1)).toMatchObject({ kind: 'put', path: `point/${point.id}/deadline`, value: p3 });
  await expect(prazo(editor).locator('.suggested-pill')).toHaveText('Sugerido');
  await expect(alt).toHaveCount(0);
});

// Review fixes 2026-10-06 (F-25, D12): a pick shows no toast, so "Desfazer" is offered by "Substituir" only.
test('@p0 11.9-E2E-004 a pick shows no toast; "Desfazer" after "Substituir" restores the typed date', async ({ page }) => {
  test.setTimeout(150_000);
  const { points } = await setUp(page);
  const point = points[0]!;
  const editor = await openEditor(page, 1);
  await radio(editor, 'P1, Curto prazo, 30 dias').click();
  await expect.poll(async () => (await storedPoint(page, point.id))?.priority).toBe('P1');
  await radio(editor, 'P2, Médio prazo, 90 dias').click();
  await expect.poll(async () => await storedPoint(page, point.id)).toMatchObject({ priority: 'P2', deadline: suggestionOf(point, 'P2') });
  await expect(toast(page)).toHaveCount(0);

  // A typed date, then a pick that differs, then "Substituir": the one undo toast.
  await typeDate(editor, 'Prazo', '30112030');
  await editor.getByRole('textbox', { name: 'Responsável' }).click();
  await expect.poll(async () => (await storedPoint(page, point.id))?.deadline).toBe('2030-11-30');
  await radio(editor, 'P3, Longo prazo, 180 dias').click();
  await expect.poll(async () => (await storedPoint(page, point.id))?.priority).toBe('P3');
  await expect(toast(page)).toHaveCount(0);
  await prazo(editor).locator('.suggestion-alt').getByRole('button', { name: 'Substituir' }).click();
  await expect.poll(async () => (await storedPoint(page, point.id))?.deadline).toBe(suggestionOf(point, 'P3'));
  await expect(toast(page)).toContainText('Prazo substituído');
  await toast(page).getByRole('button', { name: 'Desfazer' }).click();
  await expect.poll(async () => await storedPoint(page, point.id)).toMatchObject({ priority: 'P3', deadline: '2030-11-30' });
  // The inverse op is in the outbox, to be pushed.
  expect((await pointOps(page)).at(-1)).toMatchObject({ path: `point/${point.id}/deadline`, value: '2030-11-30' });
});

test('@p0 11.9-E2E-005 the picker by keyboard: arrows move, Space selects and writes, Delete clears; the rows read "P1, Curto prazo, 30 dias"', async ({ page }) => {
  test.setTimeout(150_000);
  const { points } = await setUp(page);
  const point = points[0]!;
  const editor = await openEditor(page, 1);
  await expect(picker(editor).getByRole('radio')).toHaveCount(5);
  const names = await picker(editor).getByRole('radio').evaluateAll((rows) => rows.map((row) => row.getAttribute('aria-label')));
  expect(names).toEqual([
    'P0, Imediata, hoje',
    'P1, Curto prazo, 30 dias',
    'P2, Médio prazo, 90 dias',
    'P3, Longo prazo, 180 dias',
    'P4, Próxima manutenção, próxima intervenção',
  ]);

  // Tab from Ação lands on the picker's one tab stop (the first row, none checked).
  await editor.getByRole('textbox', { name: 'Ação recomendada' }).click();
  await page.keyboard.press('Tab');
  await expect(radio(editor, 'P0, Imediata, hoje')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(radio(editor, 'P2, Médio prazo, 90 dias')).toBeFocused();
  // Moving the focus writes nothing.
  expect(await pointOps(page)).toEqual([]);
  await page.keyboard.press('Space');
  await expect(radio(editor, 'P2, Médio prazo, 90 dias')).toHaveAttribute('aria-checked', 'true');
  await expect.poll(async () => await storedPoint(page, point.id)).toMatchObject({ priority: 'P2', deadline: suggestionOf(point, 'P2') });
  // Review fixes 2026-10-06 (F-25, D12): no toast after the pick; the Prazo it filled is in view, "Sugerido".
  await expect(toast(page)).toHaveCount(0);
  await expect(prazo(editor)).toBeInViewport();
  await expect(prazo(editor).locator('.suggested-pill')).toHaveText('Sugerido');

  await page.keyboard.press('ArrowUp');
  await expect(radio(editor, 'P1, Curto prazo, 30 dias')).toBeFocused();
  await page.keyboard.press('Delete');
  await expect.poll(async () => await storedPoint(page, point.id)).toMatchObject({ priority: null, deadline: null });
  await expect(picker(editor).getByRole('radio', { checked: true })).toHaveCount(0);
  // Review fixes 2026-10-06 (F-25, D12): a clear, like a pick, shows no toast over the Prazo.
  await expect(toast(page)).toHaveCount(0);
  await expect(prazo(editor)).toBeInViewport();
});

test('@p0 11.9-E2E-006 Responsável typed is in the outbox when the field blurs, and the card shows it after a reload', async ({ page }) => {
  test.setTimeout(150_000);
  const { points } = await setUp(page);
  const point = points[0]!;
  const editor = await openEditor(page, 1);
  await editor.getByRole('textbox', { name: 'Responsável' }).fill('  Manutenção predial  ');
  await editor.getByRole('textbox', { name: 'Ação recomendada' }).click();
  await expect.poll(async () => (await pointOps(page)).map((op) => [op.kind, op.path, op.value])).toEqual([['put', `point/${point.id}/owner`, 'Manutenção predial']]);
  await editor.getByRole('button', { name: 'Concluir' }).click();
  await page.reload();
  await expect(cards(page).first().locator('.poa-fields')).toContainText('Manutenção predial', { timeout: 30_000 });
});

test('@p0 11.9-E2E-007 a pick on a blank new point writes nothing; the first text creates the point with that priority and deadline in one batch', async ({ page }) => {
  test.setTimeout(150_000);
  await setUp(page, { texts: [] as string[] });
  await page.getByRole('button', { name: 'Criar', exact: true }).click();
  const editor = page.getByRole('article', { name: 'Novo ponto de atenção em edição' });
  await radio(editor, 'P0, Imediata, hoje').click();
  await expect(radio(editor, 'P0, Imediata, hoje')).toHaveAttribute('aria-checked', 'true');
  await expect(prazo(editor).locator('.suggested-pill')).toHaveText('Sugerido');
  // Nothing to print yet: nothing is stored.
  expect(await pointOps(page)).toEqual([]);

  await editor.getByRole('textbox', { name: 'Texto' }).click();
  await page.keyboard.type('Fusível com aquecimento.');
  await editor.getByRole('textbox', { name: 'Ação recomendada' }).click();
  await expect.poll(async () => (await pointOps(page)).length).toBeGreaterThan(0);
  const ops = await pointOps(page);
  expect(ops.map((op) => op.kind)).toEqual(['create']);
  const row = ops[0]!.value as PointRow;
  expect(row).toMatchObject({ text: 'Fusível com aquecimento.', priority: 'P0', deadline: pointCreatedDate(row.id) });
  expect(await storedPoint(page, row.id)).toMatchObject({ priority: 'P0', deadline: pointCreatedDate(row.id) });
});

test('@p0 11.9-E2E-010 Concluir on a new point with only a pick writes nothing', async ({ page }) => {
  test.setTimeout(150_000);
  await setUp(page, { texts: [] as string[] });
  await page.getByRole('button', { name: 'Criar', exact: true }).click();
  const editor = page.getByRole('article', { name: 'Novo ponto de atenção em edição' });
  await radio(editor, 'P2, Médio prazo, 90 dias').click();
  await expect(radio(editor, 'P2, Médio prazo, 90 dias')).toHaveAttribute('aria-checked', 'true');
  await editor.getByRole('button', { name: 'Concluir' }).click();
  await expect(editor).toHaveCount(0);
  expect(await pointOps(page)).toEqual([]);
  await expect(cards(page)).toHaveCount(0);
});

test('@p0 11.9-E2E-011 P4 on a month-only next intervention stores it verbatim, shows mm/aaaa, and a typed date replaces it', async ({ page }) => {
  test.setTimeout(150_000);
  const { points } = await setUp(page, { nextIntervention: '2027-09' });
  const point = points[0]!;
  const editor = await openEditor(page, 1);
  await radio(editor, 'P4, Próxima manutenção, próxima intervenção').click();
  await expect.poll(async () => await storedPoint(page, point.id)).toMatchObject({ priority: 'P4', deadline: '2027-09' });
  await expect(prazo(editor)).toContainText('09/2027');
  await expect(prazo(editor).locator('.suggested-pill')).toHaveText('Sugerido');

  await typeDate(editor, 'Prazo', '20092027');
  await editor.getByRole('textbox', { name: 'Responsável' }).click();
  await expect.poll(async () => (await storedPoint(page, point.id))?.deadline).toBe('2027-09-20');
  expect((await pointOps(page)).at(-1)).toMatchObject({ kind: 'put', path: `point/${point.id}/deadline`, value: '2027-09-20' });
  await editor.getByRole('button', { name: 'Concluir' }).click();
  await expect(cards(page).first().locator('.poa-fields')).toContainText('20/09/2027');
});

test('@p0 11.9-E2E-012 the card after P4 on a month-only next intervention shows mm/aaaa', async ({ page }) => {
  test.setTimeout(150_000);
  const { points } = await setUp(page, { nextIntervention: '2027-09' });
  const editor = await openEditor(page, 1);
  await radio(editor, 'P4, Próxima manutenção, próxima intervenção').click();
  await expect.poll(async () => (await storedPoint(page, points[0]!.id))?.deadline).toBe('2027-09');
  await editor.getByRole('button', { name: 'Concluir' }).click();
  await expect(editor).toHaveCount(0);
  const card = cards(page).first();
  await expect(card.locator('.priority-pill')).toHaveText('P4 · Próxima manutenção');
  await expect(card.locator('.poa-fields')).toContainText('09/2027');
});


test('@p0 11.10-E2E-001 the DOCX section 8 carries the action-plan table: the point prioritized in the UI with its suggested Prazo, a point without one as "—", derived rows after; the Sumário counts "1 ponto sem prazo"', async ({ page }) => {
  test.setTimeout(420_000);
  const { relatorioId, points } = await setUp(page, {
    texts: ['Plaquetas de identificação ausentes.', 'Diagrama unifilar desatualizado.'],
    // One sheet marked Não ensaiado: a derived row after the manual ones.
    extra: (scope, sheets) => [officeDraft(account, scope, `block/${sheets[0]!.blockId}/not_tested`, { reason: 'solicitacao_cliente', text: null, at: '2026-09-07T12:00:00.000Z', by: account.userId })],
  });
  const first = points[0]!;
  const editor = await openEditor(page, 1);
  await radio(editor, 'P1, Curto prazo, 30 dias').click();
  await editor.getByRole('textbox', { name: 'Responsável' }).fill('Manutenção predial');
  await editor.getByRole('button', { name: 'Concluir' }).click();
  await expect(editor).toHaveCount(0);
  const deadline = suggestionOf(first, 'P1')!;
  await expect.poll(async () => await storedPoint(page, first.id)).toMatchObject({ priority: 'P1', deadline, owner: 'Manutenção predial' });

  await setParecer(page, relatorioId);
  await expect(row8(page).locator('.sum-status')).toContainText('1 ponto sem prazo');

  const dialog = page.getByRole('dialog', { name: 'Gerar relatório' });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await expect(dialog).toBeVisible();
  const generate = dialog.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' });
  await expect(generate).toBeEnabled({ timeout: 30_000 });
  await generate.click();
  // F-03 (D1): the relatório's sheets are empty (one not tested), so the issue is confirmed first.
  await confirmIssue(dialog, /^Emitir com 93 fichas vazias/);
  await expect(toast(page)).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
  const download = await downloadFrom(page, () => dialog.getByRole('button', { name: 'DOCX — abrir no Word' }).click());
  expect(download.suggestedFilename()).toBe('relatorio-rev-1.docx');
  const document = readZipEntries(await downloadBytes(download)).get('word/document.xml')!.toString('utf8');

  // From section 8's heading to the next one (E7-A6: never by position).
  const headings = [...document.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].filter((m) => m[0].includes('w:val="Heading1"'));
  const at = headings.findIndex((m) => paragraphText(m[0]).startsWith('8 '));
  expect(at).toBeGreaterThanOrEqual(0);
  const section = document.slice(headings[at]!.index!, headings[at + 1]?.index ?? document.length);
  const table = section.slice(section.indexOf('<w:tbl>'));
  const rows = [...table.matchAll(/<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/g)].map((row) =>
    [...row[1]!.matchAll(/<w:tc(?:\s[^>]*)?>([\s\S]*?)<\/w:tc>/g)].map((cell) => paragraphText(cell[1]!)),
  );
  expect(rows[0]).toEqual(['Nº', 'Ponto de atenção', 'Local/TAG', 'Prioridade', 'Prazo', 'Ação recomendada', 'Responsável', 'Imagens']);
  expect(rows[1]).toEqual(['1', 'Plaquetas de identificação ausentes.', '—', 'P1 · Curto prazo', formatCalendarDate(deadline), '—', 'Manutenção predial', '—']);
  expect(rows[2]).toEqual(['2', 'Diagrama unifilar desatualizado.', '—', '—', '—', '—', '—', '—']);
  expect(rows).toHaveLength(4);
  expect(rows[3]![0]).toBe('3');
  expect(rows[3]![1]).toMatch(/^Equipamento não ensaiado: /);
  expect(rows[3]!.slice(3)).toEqual(['—', '—', '—', '—', '—']);

  // 11.10-PDF (E11-Q3): "PDF — enviar ao cliente" saves the issued PDF of the same revision.
  // Its text (the action-plan headers unbroken, the rows) is read in the api's
  // `rich-text.integration.test.ts`, where pdfjs lives.
  const pdf = await downloadFrom(page, () => dialog.getByRole('button', { name: 'PDF — enviar ao cliente' }).click());
  expect(pdf.suggestedFilename()).toBe('relatorio-rev-1.pdf');
  expect((await downloadBytes(pdf)).subarray(0, 4).toString('latin1')).toBe('%PDF');
});

test('@p1 11.9-E2E-008 at 390 px the picker, Prazo and the card fields fit: the editor never scrolls sideways', async ({ page }) => {
  test.setTimeout(150_000);
  const { points } = await setUp(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const editor = await openEditor(page, 1);
  await radio(editor, 'P4, Próxima manutenção, próxima intervenção').click();
  await expect.poll(async () => (await storedPoint(page, points[0]!.id))?.priority).toBe('P4');
  await editor.getByRole('textbox', { name: 'Responsável' }).fill('Porto Seguro — Manutenção predial');
  const fits = (locator: Locator) => locator.evaluate((element) => element.scrollWidth <= element.clientWidth);
  expect(await fits(editor)).toBe(true);
  expect(await fits(picker(editor))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await editor.getByRole('button', { name: 'Concluir' }).click();
  await expect(editor).toHaveCount(0);
  const card = cards(page).first();
  await expect(card.locator('.priority-pill')).toHaveText('P4 · Próxima manutenção');
  expect(await fits(card)).toBe(true);
});
