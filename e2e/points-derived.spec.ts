import { cellAddressesOf, getDefinition, newPointRow, photoToken, SEED_VERSION, type OpDraft, type PointRow } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { extractStructure, readZipEntries } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { escapeDialog } from './support/dialogs.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { confirmIssue, typeDate } from './support/relatorio-flow.ts';
import { newRelatorioDrafts, officeDraft, pushDrafts, type SeededSheet } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * ~~Story 22.5 (Bruno, 2026-11-06): every NC row and every test out of criterion is a point of
 * attention by itself.~~ Fix batch e24h (Matheus, 2026-11-10, on Bruno's report): a point exists
 * only when the technician creates it. Driven as a person would at 1280 px: NC rows, an out
 * insulation and an old manual point list nothing automatic and flag nothing; "Criar ponto de
 * atenção" on an NC row writes the one point of origin `nc`; the DOCX's section 8 prints the stored
 * points only; the row set back to C leaves its point "Origem resolvida". It issues a revision
 * through the api's one queue and LibreOffice, so this spec runs in the serial group
 * (`e2e/support/groups.ts`).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  // This worker's Empresa B (E6-Q7): its company, its user and its device database.
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});
const SECC = getDefinition('v3', 'cabine_primaria', 'chave_seccionadora');
const FIRST_ITEM = SECC.checklist![0]!;

type Scope = { relatorioId: string };

const storedPoints = async (page: Page) =>
  (await readStore<{ entity: string; row: PointRow }>(page, database, 'entities')).filter((record) => record.entity === 'point').map((record) => record.row);
const row8 = (page: Page) => page.locator('li.sum-row[data-row="section_8"]');
const cards = (page: Page) => page.locator('.poa-list > .point-of-attention-card:not(.is-auto):not(.is-editing)');
const toast = (page: Page) => page.getByTestId('toast');
const textArea = (scope: Locator) => scope.getByRole('textbox', { name: 'Texto' });
const enelChaves = (sheets: readonly SeededSheet[]) => sheets.filter((sheet) => sheet.blockType === 'chave_seccionadora' && sheet.locationName === 'Cubículo Enel');

/** A point written on the office device, placed after the ones listed before it. */
function pointDrafts(scope: Scope, texts: readonly { text: string; action: string | null }[]): { drafts: OpDraft[]; rows: PointRow[] } {
  const rows: PointRow[] = [];
  for (const entry of texts) {
    rows.push(newPointRow({ id: newId(), relatorioId: scope.relatorioId, text: entry.text, equipmentId: null, origin: 'manual', action: entry.action }, rows));
  }
  return { drafts: rows.map((row) => officeDraft(account, scope, `point/${row.id}`, row, 'create')), rows };
}

async function setUp(page: Page, seed: (scope: Scope, sheets: SeededSheet[], equipmentOf: Map<string, string>) => OpDraft[]): Promise<{ relatorioId: string; sheets: SeededSheet[]; equipmentOf: Map<string, string> }> {
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const scope = { relatorioId: built.relatorioId };
  const equipmentOf = new Map(
    built.drafts
      .filter((draft) => draft.kind === 'create' && draft.path.startsWith('block/'))
      .map((draft) => draft.value as { id: string; equipment_id: string | null })
      .filter((row) => row.equipment_id !== null)
      .map((row) => [row.id, row.equipment_id!] as const),
  );
  await pushDrafts(page, database, [...built.drafts, ...seed(scope, built.sheets, equipmentOf)]);
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  return { relatorioId: built.relatorioId, sheets: built.sheets, equipmentOf };
}

async function openPoints(page: Page): Promise<void> {
  await row8(page).getByRole('button', { name: /^Pontos de atenção/ }).click();
  await expect(page).toHaveURL(/\/pontos$/);
  await expect(page.locator('.poa-list')).toBeAttached({ timeout: 30_000 });
}

test('@p0 22.5-E2E-001 e24h: NC rows of a sheet and an out insulation list nothing beside the manual point; "Criar ponto de atenção" on an NC row writes the one origin nc point, and the DOCX\'s section 8 prints the two stored points only', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const SECOND_ITEM = SECC.checklist![1]!;
  const { relatorioId, sheets, equipmentOf } = await setUp(page, (scope, all) => {
    const chave = enelChaves(all)[0]!;
    const dj = all.find((sheet) => sheet.blockType === 'disjuntor_mt')!;
    // The first capture of the disjuntor's insulation table, 300 MΩ against > 400 MΩ.
    const [first] = cellAddressesOf(getDefinition(SEED_VERSION, 'cabine_primaria', 'disjuntor_mt'), 'isolacao');
    return [
      ...pointDrafts(scope, [{ text: 'Ponto geral', action: 'Agir' }]).drafts,
      officeDraft(account, scope, `sheet/${chave.blockId}/checklist/${FIRST_ITEM.key}/result`, 'NC'),
      officeDraft(account, scope, `sheet/${chave.blockId}/checklist/${FIRST_ITEM.key}/observation`, 'oxidação nos terminais'),
      officeDraft(account, scope, `sheet/${chave.blockId}/checklist/${SECOND_ITEM.key}/result`, 'NC'),
      officeDraft(account, scope, `sheet/${dj.blockId}/test/isolacao/cell/${first!.row}/${first!.col}`, { raw: '300', unit: 'MΩ', state: 'measured' }),
    ];
  });
  const chave = enelChaves(sheets)[0]!;

  // ~~Row 8 and the heading count the three automatic entries after the manual point~~: the manual point alone.
  await expect(row8(page).locator('.sum-status')).toHaveText('1 ponto · 1 ponto sem prazo');
  await openPoints(page);
  await expect(page.getByRole('heading', { level: 2, name: 'Pontos de atenção (1)' })).toBeVisible();
  await expect(page.locator('.poa-list > .point-of-attention-card')).toHaveCount(1);
  await expect(page.locator('.poa-list')).not.toContainText('oxidação nos terminais');
  expect(await storedPoints(page)).toHaveLength(1);

  // "Criar ponto de atenção" on the NC row: the row's text, a new action and deadline, stored as origin nc with its item.
  await page.goto(`/relatorio/${relatorioId}/ficha/${chave.blockId}`);
  const row = page.locator(`#ficha-step-verificacoes li.checklist-row[data-item-key="${FIRST_ITEM.key}"]`);
  await row.scrollIntoViewIfNeeded({ timeout: 30_000 });
  await row.getByRole('button', { name: 'Criar ponto de atenção' }).click();
  const editor = page.getByRole('dialog', { name: 'Criar ponto de atenção' });
  await expect(textArea(editor)).toContainText(`Item 1 (${FIRST_ITEM.label.toLocaleLowerCase('pt-BR')}): oxidação nos terminais`);
  await editor.getByRole('textbox', { name: 'Ação recomendada' }).fill('Limpar e reapertar os terminais');
  await typeDate(editor, 'Prazo', '01122026');
  await editor.getByRole('button', { name: 'Concluir' }).click();
  await expect(editor).toHaveCount(0);
  await expect.poll(async () => (await storedPoints(page)).filter((point) => point.origin === 'nc').length).toBe(1);
  const written = (await storedPoints(page)).find((point) => point.origin === 'nc')!;
  expect(written).toMatchObject({ equipment_id: equipmentOf.get(chave.blockId), item_key: FIRST_ITEM.key, action: 'Limpar e reapertar os terminais', deadline: '2026-12-01' });
  expect(await storedPoints(page)).toHaveLength(2);
  await page.goto(`/relatorio/${relatorioId}/pontos`);
  await expect(page.getByRole('heading', { level: 2, name: 'Pontos de atenção (2)' })).toBeVisible({ timeout: 30_000 });
  await expect(cards(page)).toHaveCount(2);

  // The DOCX's section 8: the two stored points, no automatic bullet.
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  const footButton = page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' });
  const dialog = page.getByRole('dialog', { name: 'Gerar relatório' });
  await footButton.click();
  await dialog.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' }).click();
  await confirmIssue(dialog);
  await expect(toast(page)).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: 150_000 });
  await escapeDialog(page, dialog);
  const revision = (await readStore<{ entity: string; row: { id: string; number: number } }>(page, database, 'entities')).find((record) => record.entity === 'revision' && record.row.number === 1)!;
  const response = await page.request.get(`/api/revisions/${revision.row.id}/docx`);
  expect(response.status()).toBe(200);
  const paragraphs = extractStructure(Buffer.from(await response.body())).paragraphs;
  expect(paragraphs).toContain('Ponto geral. Agir');
  expect(paragraphs.some((p) => p.includes('oxidação nos terminais. Limpar e reapertar os terminais'))).toBe(true);
  expect(paragraphs.filter((p) => p.startsWith('Item não conforme: ') || p.startsWith('Ensaio fora do critério: '))).toEqual([]);
});

test('@p0 22.5-E2E-002 e24h: an old manual point of the NC row\'s equipment reads no "Possível duplicado" and the Export dialog names no pair; a point written from the NC row, the row set back to C, reads "Origem resolvida"', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const { relatorioId, sheets, equipmentOf } = await setUp(page, (scope, all, equipment) => {
    const chave = enelChaves(all)[0]!;
    const dj = all.find((sheet) => sheet.blockType === 'disjuntor_mt')!;
    const [first] = cellAddressesOf(getDefinition(SEED_VERSION, 'cabine_primaria', 'disjuntor_mt'), 'isolacao');
    // A point written from the NC row before Story 22.5: origin manual, the same equipment.
    // e22f N4: as a client older than contract 31 wrote it, with no `item_key` key at all.
    const old = newPointRow({ id: newId(), relatorioId: scope.relatorioId, text: 'Terminais oxidados', equipmentId: null, origin: 'manual', action: 'Limpar' }, []);
    delete (old as Partial<typeof old>).item_key;
    return [
      officeDraft(account, scope, `point/${old.id}`, { ...old, equipment_id: equipment.get(chave.blockId) ?? null }, 'create'),
      officeDraft(account, scope, `sheet/${chave.blockId}/checklist/${FIRST_ITEM.key}/result`, 'NC'),
      officeDraft(account, scope, `sheet/${chave.blockId}/checklist/${FIRST_ITEM.key}/observation`, 'oxidação nos terminais'),
      officeDraft(account, scope, `sheet/${dj.blockId}/test/isolacao/cell/${first!.row}/${first!.col}`, { raw: '300', unit: 'MΩ', state: 'measured' }),
    ];
  });
  const chave = enelChaves(sheets)[0]!;
  await openPoints(page);
  // (a) One card, the old point, with no flag (the duplicate pairs retired with the automatic entries).
  await expect(page.locator('.poa-list > .point-of-attention-card')).toHaveCount(1);
  const manual = cards(page).filter({ hasText: 'Terminais oxidados' });
  await expect(manual).toHaveCount(1);
  await expect(manual.locator('[data-flag]')).toHaveCount(0);
  await expect(page.getByText('Possível duplicado')).toHaveCount(0);

  // e22f S2 retired: the Export dialog names no pair and offers no "Ver pontos".
  await page.goto(`/relatorio/${relatorioId}?exportar=1`);
  const exportDialog = page.getByRole('dialog');
  await expect(exportDialog.locator('.generate-row')).toBeVisible({ timeout: 30_000 });
  await expect(exportDialog).not.toContainText('possivelmente duplicados');
  await expect(exportDialog.getByRole('button', { name: 'Ver pontos' })).toHaveCount(0);
  await escapeDialog(page, exportDialog);

  // (b) A point written from the NC row, then its row set back to C: the point stays, "Origem resolvida".
  await page.goto(`/relatorio/${relatorioId}/ficha/${chave.blockId}`);
  const row = page.locator(`#ficha-step-verificacoes li.checklist-row[data-item-key="${FIRST_ITEM.key}"]`);
  await row.scrollIntoViewIfNeeded({ timeout: 30_000 });
  await row.getByRole('button', { name: 'Criar ponto de atenção' }).click();
  const editor = page.getByRole('dialog', { name: 'Criar ponto de atenção' });
  await editor.getByRole('textbox', { name: 'Ação recomendada' }).fill('Limpar os terminais');
  await editor.getByRole('button', { name: 'Concluir' }).click();
  await expect(editor).toHaveCount(0);
  await expect.poll(async () => (await storedPoints(page)).filter((point) => point.origin === 'nc').length).toBe(1);
  expect((await storedPoints(page)).find((point) => point.origin === 'nc')).toMatchObject({ equipment_id: equipmentOf.get(chave.blockId), item_key: FIRST_ITEM.key });
  await row.getByRole('radio', { name: 'Conforme', exact: true }).click();
  await expect(row.getByRole('radio', { name: 'Conforme', exact: true })).toHaveAttribute('aria-checked', 'true');
  await page.goto(`/relatorio/${relatorioId}/pontos`);
  const resolved = cards(page).filter({ hasText: 'oxidação nos terminais' });
  await expect(resolved.locator('[data-flag]')).toHaveText('Origem resolvida', { timeout: 30_000 });
  await expect(cards(page).filter({ hasText: 'Terminais oxidados' }).locator('[data-flag]')).toHaveCount(0);
  await expect(page.locator('.poa-list > .point-of-attention-card')).toHaveCount(2);
});

/** A "Geral" photo row written on the office device (no bytes: the DOCX prints its placeholder and it keeps its number). */
function geralPhotoDraft(scope: Scope): { draft: OpDraft; id: string } {
  const id = newId();
  const value = {
    id,
    company_id: account.companyId,
    relatorio_id: scope.relatorioId,
    kind: 'photo',
    sha256: 'e'.repeat(64),
    mime: 'image/jpeg',
    size: 1000,
    uploaded_at: null,
    variants: null,
    removed_at: null,
    captured_at: '2026-11-07T12:00:00.000Z',
    tz_offset: -180,
    coords: null,
    local_seq: 1,
    block_id: null,
    item_key: null,
    caption: null,
    reading_kind: null,
    reading_target: null,
    reading_status: 'none',
    people_in_photo: false,
  };
  return { draft: officeDraft(account, scope, `file/${id}`, value, 'create'), id };
}

test('@p0 23f-E2E-001 the production check of 2026-11-07: a Reprovado sheet prints no automatic bullet (fix batch e24h) and no text run holds a line feed, an NC observation ending in a period is not doubled in the conclusion, and the action plan spaces "Imagem N" after a period', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const OBSERVATION = ['Item 1: acúmulo de poeira.', 'Item 3: isolador trincado', 'Equipamento sem condições de operação'];
  let photoId = '';
  const { relatorioId, sheets } = await setUp(page, (scope, all) => {
    const chave = enelChaves(all)[0]!;
    const photo = geralPhotoDraft(scope);
    photoId = photo.id;
    return [
      photo.draft,
      ...pointDrafts(scope, [{ text: `Porta danificada.${photoToken(photo.id)}`, action: 'Trocar a porta' }]).drafts,
      officeDraft(account, scope, `sheet/${chave.blockId}/checklist/${FIRST_ITEM.key}/result`, 'NC'),
      officeDraft(account, scope, `sheet/${chave.blockId}/checklist/${FIRST_ITEM.key}/observation`, 'acúmulo de poeira.'),
      officeDraft(account, scope, `sheet/${chave.blockId}/observations`, OBSERVATION.join('\n')),
      officeDraft(account, scope, `sheet/${chave.blockId}/conclusion/result`, 'reprovado'),
      officeDraft(account, scope, `sheet/${chave.blockId}/conclusion/restriction`, 'com_restricoes'),
    ];
  });
  expect(photoId).not.toBe('');
  const chave = enelChaves(sheets)[0]!;
  const lastValue = async (path: string) =>
    (await readStore<{ path: string; value: unknown; client_ts: string }>(page, database, 'outbox')).filter((row) => row.path === path).sort((a, b) => (a.client_ts < b.client_ts ? -1 : 1)).at(-1)?.value;

  // (b) The sheet's composed conclusion reads the NC observation without its period, and the engineer confirms it.
  await page.goto(`/relatorio/${relatorioId}/ficha/${chave.blockId}`);
  const generated = page.locator('.ficha-conc-text .suggestion-field.is-generated');
  await expect(generated.locator('.generated-text')).toContainText('acúmulo de poeira (item 1, NC)', { timeout: 30_000 });
  await expect(generated.locator('.generated-text')).not.toContainText('poeira. (item');
  await generated.getByRole('button', { name: 'Confirmar' }).click();
  await expect.poll(() => lastValue(`sheet/${chave.blockId}/conclusion/text_status`)).toBe('confirmed');
  expect(String(await lastValue(`sheet/${chave.blockId}/conclusion/text`))).toContain('acúmulo de poeira (item 1, NC)');

  // The revision, through the api's queue and LibreOffice.
  await page.goto(`/relatorio/${relatorioId}`);
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
  const docx = Buffer.from(await response.body());
  const xml = readZipEntries(docx).get('word/document.xml')!.toString('utf8');
  const { paragraphs, tables } = extractStructure(docx);

  // (a) No text run holds a line feed. Fix batch e24h: ~~the Reprovado bullet and its action-plan cell carry the lines as
  // breaks~~; the Reprovado sheet prints no automatic bullet (the line breaks of a stored point: `docx-line-breaks.test.ts`).
  expect([...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].filter((m) => m[1]!.includes('\n')).map((m) => m[1])).toEqual([]);
  expect(paragraphs.filter((p) => p.startsWith('Equipamento reprovado: '))).toEqual([]);

  // (c) The bullet's clause, and the action plan's cell spaced after the period.
  expect(paragraphs).toContain('Porta danificada, conforme Imagem 1. Trocar a porta');
  const cells = tables.flat(2);
  expect(cells).toContain('Porta danificada. Imagem 1');
  expect(cells.some((text) => text.includes('danificada.Imagem'))).toBe(false);

  // (b) In print: the sheet's confirmed conclusion, one period.
  expect(paragraphs.some((p) => p.includes('acúmulo de poeira (item 1, NC)'))).toBe(true);
  expect(paragraphs.some((p) => p.includes('poeira. (item'))).toBe(false);
});
