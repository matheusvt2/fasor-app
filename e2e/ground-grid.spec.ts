import { derivedParecer, getDefinition, parecerCounts, parecerVerdictLabel, SEED_VERSION, type BlockRow } from '@app/domain';
import type { Page } from '@playwright/test';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { cellOf, deviceSnapshot, kernelOf, openStep, outbox, outboxValues, plateField, setUpRelatorio, testSection, typeCell } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { paletteTypes, typeRows } from './support/palette.ts';
import { confirmIssue, setParecer } from './support/relatorio-flow.ts';
import { expandLocation, section9Chevron } from './support/tree.ts';

/*
 * Story 23.21 (seed v13, decision I; Base rev08 AT-01, AT-02): the Malha de aterramento, a library type
 * offered at a local, driven as a person would from the field palette to the DOCX at 1024 px. The
 * local Geradores (grouped by type in the standard template) gets one from "Adicionar equipamento
 * no local Geradores"; its sheet has VALOR DE PROJETO, MÉTODO DE MEDIÇÃO and CONDIÇÃO DO SOLO and two tests.
 * With VALOR DE PROJETO empty the kernel's helper says the 5 Ω default applies and 3 Ω is within; the
 * design value typed at 2 Ω puts 3 Ω out (the floor Reprovado), the conclusion is confirmed and the
 * derived parecer names the sheet. The DOCX prints the sheet under "Outros equipamentos dos Geradores".
 * Fix batch e23p (P5): the design value is stated as its number ("≤ 2 Ω, valor de projeto") in the criterion
 * line, the suggested conclusion and the derived point; with none, the seed's wording.
 * Every expected word is the kernel's over the device's own rows. It issues a revision through the
 * api's one queue and LibreOffice, so it runs in the serial group.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const TYPE = 'malha_aterramento';
const DEFINITION = getDefinition(SEED_VERSION, 'cabine_primaria', TYPE);
/** Batch e24a (Story 24.3): the relatório's seed, v13 (its floor is the one this spec asserts); a block added to it carries it. */
const RELATORIO_SEED = 'v13';
const LOCAL = 'Geradores';
const GRID = 'resistencia_malha';
const measured = (raw: string, unit: string) => ({ raw, unit, state: 'measured' });

/** Types a nameplate number and leaves the field, as a person does. */
async function typePlate(page: Page, key: string, text: string): Promise<void> {
  const input = plateField(page, key).locator('input');
  await input.fill(text);
  await input.press('Tab');
}

test('@p0 23.21-E2E-001 at 1024: "Adicionar equipamento no local Geradores" adds a Malha de aterramento; the 5 Ω default applies with no design value, 3 Ω above a 2 Ω design value fails it (Reprovado), the parecer follows and the DOCX prints it under "Outros equipamentos"', async ({ page }) => {
  test.setTimeout(420_000);
  expect(paletteTypes('v12').library).not.toContain(TYPE);
  // Batch e24a (Story 24.3): pinned to seed v13, whose floor this test asserts (Reprovado · Com restrições).
  const { relatorioId } = await setUpRelatorio(page, account, database, () => [], RELATORIO_SEED);
  await page.setViewportSize({ width: 1024, height: 900 });

  // --- the field palette of the local: the Malha last under "Outros equipamentos" ---
  const chevron = section9Chevron(page);
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expandLocation(page, LOCAL);
  await page.getByRole('button', { name: `Adicionar equipamento no local ${LOCAL}`, exact: true }).click();
  const fieldPalette = page.getByRole('dialog', { name: 'Adicionar bloco' });
  await expect(fieldPalette.locator('.palette-where')).toHaveText(`Em: ${LOCAL}`);
  const types = paletteTypes(SEED_VERSION);
  expect(types.library.at(-1)).toBe(TYPE);
  const row = typeRows(fieldPalette, [TYPE]);
  await expect(row.locator('.pi-text > span').first()).toHaveText(DEFINITION.label);
  const tag = (await row.locator('.pi-meta').innerText()).trim().split(' · ').at(-1)!;
  expect(tag).toMatch(/^MA-/);
  await row.click();
  await expect(fieldPalette).toBeHidden();
  await expect.poll(async () => (await outbox(database, page)).filter((op) => op.kind === 'create' && op.path.startsWith('block/') && (op.value as { block_type?: string }).block_type === TYPE).length).toBe(1);
  const create = (await outbox(database, page)).find((op) => op.kind === 'create' && op.path.startsWith('block/') && (op.value as { block_type?: string }).block_type === TYPE)!;
  expect(create.value).toMatchObject({ block_type: TYPE, seed_version: RELATORIO_SEED, relatorio_id: relatorioId });
  const blockId = (create.value as BlockRow).id;

  // --- the sheet: its three plate fields, its two tests ---
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toContainText(DEFINITION.label, { timeout: 30_000 });
  const keys = await page.locator('#ficha-nameplate [data-field-key]').evaluateAll((nodes) => [...new Set(nodes.map((node) => node.getAttribute('data-field-key')))]);
  expect(keys).toEqual(DEFINITION.nameplate.map((one) => one.key));
  await plateField(page, 'metodo_medicao').locator('select').selectOption('QUEDA DE POTENCIAL (62 %)');
  await plateField(page, 'condicao_solo').locator('select').selectOption('ÚMIDO');
  await expect.poll(async () => (await outboxValues(database, page, `sheet/${blockId}/nameplate/condicao_solo`)).at(-1)).toBe('ÚMIDO');

  // No design value: the 5 Ω default applies, the helper says so, and 3 Ω is within.
  await openStep(page, relatorioId, blockId, 'Ensaios');
  await typeCell(page, database, blockId, GRID, 0, 0, '3');
  const byDefault = (await kernelOf(page, database, relatorioId, blockId)).measurement(GRID);
  expect(byDefault.notes).toEqual(['Sem VALOR DE PROJETO na placa, vale ≤ 5 Ω.']);
  expect(byDefault.rows[0]!.cells[0]!.verdict).toBe('within');
  await expect(testSection(page, GRID).locator('[data-measurement-note]')).toHaveText(byDefault.notes![0]!);
  // Fix batch e23p (P5): with no design value the criterion line reads the seed's wording, as before.
  expect(byDefault.criterionText).toBe('≤ valor de projeto (sem ele, ≤ 5 Ω)');
  await expect(testSection(page, GRID).locator('.mt-criterion')).toHaveText(byDefault.criterionText);
  await expect(testSection(page, 'continuidade_malha')).toBeVisible();

  // The design value at 2 Ω: 3 Ω is out, the floor Reprovado.
  await openStep(page, relatorioId, blockId, 'Placa');
  await typePlate(page, 'valor_projeto_ohm', '2');
  await expect.poll(async () => (await outboxValues(database, page, `sheet/${blockId}/nameplate/valor_projeto_ohm`)).at(-1)).toEqual(measured('2', 'Ω'));
  await openStep(page, relatorioId, blockId, 'Ensaios');
  const judged = await kernelOf(page, database, relatorioId, blockId);
  const out = judged.measurement(GRID).rows[0]!.cells[0]!;
  expect([out.verdict, out.helperText]).toEqual(['out', 'Acima do aceitável (≤ 2 Ω, valor de projeto)']);
  await expect(cellOf(page, GRID, 0, 0).locator('.mf-helper[role="status"]')).toContainText(out.helperText!);
  await expect(testSection(page, GRID).locator('[data-measurement-note]')).toHaveCount(0);
  // Fix batch e23p (P5): the design value is stated as the number it judges by, in the criterion line and the out cell.
  expect(judged.measurement(GRID).criterionText).toBe('≤ 2 Ω, valor de projeto');
  expect(out.criterionText).toBe('≤ 2 Ω, valor de projeto');
  await expect(testSection(page, GRID).locator('.mt-criterion')).toHaveText('≤ 2 Ω, valor de projeto');
  expect(judged.floorReason).toBe('A ficha exige no mínimo Reprovado · Com restrições: medição fora do critério.');

  // The conclusion confirmed at its floor; the derived parecer names the sheet as Reprovado.
  await openStep(page, relatorioId, blockId, 'Conclusão');
  const suggestion = page.getByRole('group', { name: 'Sugestão' });
  await expect(suggestion).toContainText('Reprovado · Com restrições?');
  await suggestion.getByRole('button', { name: 'Confirmar' }).click();
  await expect.poll(async () => (await outboxValues(database, page, `sheet/${blockId}/conclusion/result`)).at(-1)).toBe('reprovado');
  // Fix batch e23p (P5): the suggested conclusion text names the design value's number.
  await expect(page.locator('.ficha-conc-text')).toContainText('critério: ≤ 2 Ω, valor de projeto');
  const snapshot = await deviceSnapshot(page, database, relatorioId);
  expect(parecerCounts(snapshot).reprovado).toContain(tag);
  const verdict = derivedParecer(snapshot)!;
  expect(verdict).not.toBeNull();
  // ~~Fix batch e23p (P5): the derived point names it too, on the Pontos de atenção surface.~~ Fix batch e24h (2026-11-10):
  // no automatic point; Pontos lists nothing until the technician creates one.
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await page.locator('li.sum-row[data-row="section_8"]').getByRole('button', { name: /^Pontos de atenção/ }).click();
  await expect(page).toHaveURL(/\/pontos$/);
  await expect(page.locator('.poa-list')).toBeAttached({ timeout: 30_000 });
  await expect(page.locator('.poa-list > .point-of-attention-card')).toHaveCount(0);

  // --- the DOCX: under "Outros equipamentos dos Geradores" ---
  await setParecer(page, relatorioId, parecerVerdictLabel(verdict) as Parameters<typeof setParecer>[2]);
  const modal = page.getByRole('dialog', { name: 'Gerar relatório' });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await modal.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' }).click();
  await confirmIssue(modal);
  await expect(page.getByTestId('toast')).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: 150_000 });
  const revision = (await readStore<{ entity: string; row: { id: string; number: number } }>(page, database, 'entities')).find((record) => record.entity === 'revision' && record.row.number === 1)!;
  const structure = extractStructure(Buffer.from(await (await page.request.get(`/api/revisions/${revision.row.id}/docx`)).body()));
  const outros = structure.headings.filter((heading) => heading.level === 2 && heading.text.includes('Outros equipamentos') && heading.text.includes(LOCAL));
  expect(outros, JSON.stringify(structure.headings)).toHaveLength(1);
  const title = `${DEFINITION.label.toLocaleUpperCase('pt-BR')} ${tag}`;
  expect(structure.paragraphs).toContain(title);
  const grid = structure.tables.find((table) => table[0]?.[0] === 'E1 · RESISTÊNCIA DE ATERRAMENTO DA MALHA')!;
  expect(grid.some((cells) => cells[0] === 'MALHA' && cells.includes('3'))).toBe(true);
});
