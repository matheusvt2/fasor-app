import {
  cellAddressesOf,
  choiceValue,
  composeConclusion,
  EMPTY_DEFINITION_CONTEXT,
  getDefinition,
  instantiateTemplate,
  section9Layout,
  SEED_VERSION,
  standardTemplate,
  visitContextOf,
  type EquipmentRow,
  type LocationRow,
  type OpDraft,
} from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { extractStructure, type DocxStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { escapeDialog } from './support/dialogs.ts';
import { cellOf, deviceSnapshot, kernelOf, openStep, outboxValues, plateField, setUpRelatorio, testSection, typeCell } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { expectCameraOpen, shoot } from './support/photos.ts';
import { pushCellSuggestion } from './support/reading-ops.ts';
import { confirmIssue, setParecer } from './support/relatorio-flow.ts';
import { newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNowAndReturn } from './support/sync.ts';

/*
 * Story 24.9 (every seed, screen only): small fixes from the hands-on pass, driven as a person would on
 * new relatórios (seed v13). Every expected word is the kernel's over the device's own rows.
 * - 24.9-E2E-001: the transformer's empty TAPS names its separator; "Foto térmica" counts the two shots
 *   taken through it, also after a reload; the TP's thermography applied over "fora de carga" reads one
 *   lead and the reason once; the TP's insulation shows its fallback sentence without opening "Fonte do
 *   critério".
 * - 24.9-E2E-002: the winding resistance names each criterion by its medium while TIPO DE ISOLAÇÃO is
 *   empty, and its out helper reads as the restricted one; over two visits a contact pole out by its rise
 *   is named by the rise in "Critérios usados".
 * - 24.9-E2E-003: "Agrupar por tipo" is a switch in the local's dialog, from "Adicionar local" at 1280 px
 *   and from "Função e nome" at 390 px; the DOCX groups that local's sheets by type.
 * - 24.9-E2E-004: in a table where two readings were confirmed from the display (crop glyph after the unit)
 *   and one row holds none, every unit ends on one column.
 * It issues revisions through the api's one queue and LibreOffice: the `queue` lane (`e2e/support/groups.ts`).
 */

test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['camera'],
});

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const THERMO = 'termografia';
const WINDING = 'resistencia_enrolamento';
const CONTACT = 'resistencia_contato';
const toast = (page: Page) => page.getByTestId('toast');
const entities = (page: Page) => readStore<{ entity: string; id: string; row: Record<string, unknown> }>(page, database, 'entities');
const outbox = (page: Page) => readStore<{ kind: string; path: string; value: unknown }>(page, database, 'outbox');

/** Answers "Equipamento em carga" on the thermography and waits for its value put. */
async function answerLoad(page: Page, blockId: string, answer: 'Sim' | 'Não'): Promise<void> {
  const path = `sheet/${blockId}/test/${THERMO}/value/em_carga`;
  const before = (await outboxValues(database, page, path)).length;
  await testSection(page, THERMO).getByRole('radiogroup', { name: 'Equipamento em carga' }).getByRole('radio', { name: answer }).click();
  await expect.poll(async () => (await outboxValues(database, page, path)).length).toBe(before + 1);
  expect((await outboxValues(database, page, path)).at(-1)).toEqual(choiceValue(answer === 'Sim' ? 'sim' : 'nao'));
}

/** Issues the next revision of `relatorioId` from its Sumário and returns the DOCX's structure. */
async function issue(page: Page, relatorioId: string, number: number): Promise<DocxStructure> {
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  const dialog = page.getByRole('dialog', { name: 'Gerar relatório' });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await dialog.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' }).click();
  await confirmIssue(dialog);
  await expect(toast(page)).toHaveText(`Revisão ${number} pronta — DOCX e PDF`, { timeout: 150_000 });
  await escapeDialog(page, dialog);
  const revision = (await entities(page)).find((record) => record.entity === 'revision' && record.row.relatorio_id === relatorioId && record.row.number === number)!;
  const response = await page.request.get(`/api/revisions/${revision.id}/docx`);
  expect(response.status()).toBe(200);
  return extractStructure(Buffer.from(await response.body()));
}

test('@p0 24.9-E2E-001 TAPS names its separator, "Foto térmica" counts its shots, the applied band reads one lead, and the TP shows its fallback sentence', async ({ page }) => {
  test.setTimeout(300_000);
  const { relatorioId, sheets } = await setUpRelatorio(page, account, database);
  const tr = sheets.find((sheet) => sheet.blockType === 'transformador_forca')!;
  const tp = sheets.find((sheet) => sheet.blockType === 'tp')!;

  // TAPS, empty: the helper names the separator before any error.
  await openStep(page, relatorioId, tr.blockId, 'Placa');
  await expect(plateField(page, 'taps').locator('.helper')).toHaveText('Na ordem da placa, separados por ;');

  // "Foto térmica" with its count: two shots, then after a reload.
  await openStep(page, relatorioId, tr.blockId, 'Ensaios');
  await answerLoad(page, tr.blockId, 'Sim');
  const thermal = testSection(page, THERMO).locator('[data-thermal-photo]');
  await expect(thermal).toHaveText('Foto térmica');
  await thermal.click();
  await expectCameraOpen(page);
  await shoot(page, 2);
  await page.getByRole('dialog', { name: 'Câmera' }).getByRole('button', { name: 'Concluir fotos', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Câmera' })).toHaveCount(0, { timeout: 15_000 });
  await expect(thermal).toHaveText('Foto térmica · 2', { timeout: 15_000 });
  await page.reload();
  await openStep(page, relatorioId, tr.blockId, 'Ensaios');
  await expect(testSection(page, THERMO).locator('[data-thermal-photo]')).toHaveText('Foto térmica · 2', { timeout: 30_000 });

  // The TP's thermography, out of load, applied by hand: one lead and the reason once.
  await openStep(page, relatorioId, tp.blockId, 'Ensaios');
  await answerLoad(page, tp.blockId, 'Não');
  await testSection(page, THERMO).getByRole('button', { name: 'Aplicar este ensaio' }).click();
  await expect.poll(async () => (await outboxValues(database, page, `sheet/${tp.blockId}/test/${THERMO}/applicability`)).at(-1)).toBe('applied');
  const applied = (await kernelOf(page, database, relatorioId, tp.blockId)).measurement(THERMO).applicability;
  expect(applied.appliedText).toBe('Equipamento fora de carga.');
  await expect(testSection(page, THERMO).locator('.v13-applied-band .band-text')).toHaveText('Aplicado por você. Equipamento fora de carga.');

  // The TP's insulation with TIPO DE ISOLAÇÃO empty: the fallback sentence under the criterion, "Fonte do critério" closed.
  const fallback = (await kernelOf(page, database, relatorioId, tp.blockId)).test('isolacao').fallbackLines ?? [];
  expect(fallback[0]).toMatch(/^Sem o tipo de isolação na placa, vale /);
  const insulation = testSection(page, 'isolacao');
  await expect(insulation.locator('[data-criterion-fallback]').first()).toHaveText(fallback[0]!);
  await expect(insulation.locator('[data-criterion-fallback]').first()).toBeVisible();
  await expect(insulation.locator('details.mt-source').first()).not.toHaveAttribute('open', '');
});

test('24.9-E2E-002 the winding resistance names each criterion by its medium and reads its out helper as the restricted one; a pole out by its rise is named by it in "Critérios usados"', async ({ page }) => {
  test.setTimeout(480_000);
  const { relatorioId, sheets } = await setUpRelatorio(page, account, database);
  const tr = sheets.find((sheet) => sheet.blockType === 'transformador_forca')!;

  // TIPO DE ISOLAÇÃO empty: the screen names each criterion by its medium; the kernel's print line is the joined one.
  await openStep(page, relatorioId, tr.blockId, 'Ensaios');
  const winding = (await kernelOf(page, database, relatorioId, tr.blockId)).measurement(WINDING);
  expect(winding.screenCriterionText).toMatch(/^Óleo: .+ · Seco: .+$/);
  expect(winding.criterionText).not.toContain('Óleo:');
  await expect(testSection(page, WINDING).locator('.mt-criterion').first()).toHaveText(winding.screenCriterionText!);

  // Oil, copper: phase C 5,01 % over the lowest is out; its helper is built as the restricted one.
  await pushDrafts(page, database, [
    officeDraft(account, { relatorioId }, `sheet/${tr.blockId}/nameplate/tipo_de_isolacao`, 'ÓLEO ISOLANTE'),
    officeDraft(account, { relatorioId }, `sheet/${tr.blockId}/nameplate/material_enrolamento`, 'Cu'),
  ]);
  await syncNowAndReturn(page);
  await openStep(page, relatorioId, tr.blockId, 'Ensaios');
  for (const [col, raw] of ['1', '1', '1.0501'].entries()) await typeCell(page, database, tr.blockId, WINDING, 0, col, raw);
  const out = (await kernelOf(page, database, relatorioId, tr.blockId)).measurement(WINDING).rows[0]!.cells[2]!;
  expect(out.verdict).toBe('out');
  expect(out.helperText).toMatch(/^Desvio de 5,01 % sobre a menor fase \(Fase A: 1 Ω\), acima de 5 %: /);
  await expect(cellOf(page, WINDING, 0, 2).locator('.mf-helper[role="status"]')).toContainText(out.helperText!);

  // Two visits: relatório A's disjuntor issued at 40, 44, 44 µΩ; relatório B of the obra at 61 µΩ on pole A.
  const DJ = getDefinition(SEED_VERSION, 'cabine_primaria', 'disjuntor_mt');
  const poles = cellAddressesOf(DJ, CONTACT);
  const a = newRelatorioDrafts(account);
  const djA = a.sheets.find((sheet) => sheet.blockType === 'disjuntor_mt')!;
  const equipmentId = (a.drafts.find((draft) => draft.kind === 'create' && draft.path === `block/${djA.blockId}`)!.value as { equipment_id: string }).equipment_id;
  await pushDrafts(page, database, [
    ...a.drafts,
    ...['40', '44', '44'].map((raw, i) => officeDraft(account, { relatorioId: a.relatorioId }, `sheet/${djA.blockId}/test/${CONTACT}/cell/${poles[i]!.row}/${poles[i]!.col}`, { raw, unit: 'µΩ', state: 'measured' })),
  ]);
  await setParecer(page, a.relatorioId);
  await issue(page, a.relatorioId, 1);
  const equipment = a.drafts.filter((draft) => draft.kind === 'create' && draft.path.startsWith('equipment/')).map((draft) => draft.value as unknown as EquipmentRow);
  const b = instantiateTemplate(
    standardTemplate({ id: newId() }),
    { id: a.projectId },
    { service_start: '2026-11-09', service_end: '2026-11-10', existingEquipment: equipment, responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT, tagRule: 'legacy' },
    { newId, actorId: account.userId, companyId: account.companyId },
  );
  const djB = b.drafts.filter((draft) => draft.kind === 'create' && draft.path.startsWith('block/')).map((draft) => draft.value as { id: string; equipment_id: string | null }).find((row) => row.equipment_id === equipmentId)!;
  await pushDrafts(page, database, [
    ...b.drafts,
    ...['61', '45', '44'].map((raw, i) => officeDraft(account, { relatorioId: b.relatorioId }, `sheet/${djB.id}/test/${CONTACT}/cell/${poles[i]!.row}/${poles[i]!.col}`, { raw, unit: 'µΩ', state: 'measured' })),
  ]);
  await page.goto(`/relatorio/${b.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => ((await entities(page)).find((record) => record.entity === 'equipment' && record.id === equipmentId)?.row.last_results as { relatorio_id?: string } | null | undefined)?.relatorio_id ?? null, { timeout: 30_000 }).toBe(a.relatorioId);

  // B's Conclusão: the preview confirmed, then "Critérios usados" names the rise with the previous value.
  await openStep(page, b.relatorioId, djB.id, 'Conclusão');
  await page.getByRole('group', { name: 'Prévia da conclusão' }).getByRole('button', { name: 'Confirmar' }).click();
  const snapshot = await deviceSnapshot(page, database, b.relatorioId);
  const block = snapshot.blocks.find((row) => row.id === djB.id)!;
  const items = composeConclusion(block, DJ, (await entities(page)).find((record) => record.entity === 'equipment' && record.id === equipmentId)!.row.tag as string, visitContextOf(snapshot, block)).criteriaItems;
  const riseItem = items.find((item) => item.startsWith('R_cont'))!;
  expect(riseItem).toMatch(/^R_cont .+ 61 µΩ · alta de 52,5 % sobre 40 µΩ da manutenção anterior, rev\. 1 de /);
  const line = page.locator('.criteria-line');
  await expect(line).toContainText(riseItem, { timeout: 30_000 });
  await expect(line).not.toContainText('critério <250 µΩ');
});

test('24.9-E2E-003 "Agrupar por tipo" is a switch in the local\'s dialog, from "Adicionar local" at 1280 px and from "Função e nome" at 390 px; the DOCX groups the local by type', async ({ page }) => {
  test.setTimeout(360_000);
  const { relatorioId } = await setUpRelatorio(page, account, database);
  const enel = (await entities(page)).find((record) => record.entity === 'location' && (record.row as unknown as LocationRow).relatorio_id === relatorioId && record.row.name === 'Cubículo Enel')!;

  // 1280 px, "Adicionar local": the switch, off; turned on, the create carries it.
  const chevron = page.getByRole('button', { name: /^Expandir ou recolher a seção \d+$/ });
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await page.locator('.s9-foot').getByRole('button', { name: 'Adicionar local', exact: true }).click();
  const add = page.getByRole('dialog', { name: 'Adicionar local' });
  const addSwitch = add.getByRole('switch', { name: 'Agrupar por tipo' });
  await expect(addSwitch).toHaveAttribute('aria-checked', 'false');
  await add.getByRole('radio', { name: 'Primária' }).click();
  await addSwitch.click();
  await add.getByRole('button', { name: 'Adicionar local' }).click();
  await expect.poll(async () => (await outbox(page)).filter((op) => op.kind === 'create' && op.path.startsWith('location/')).map((op) => (op.value as { agrupar_por_tipo?: boolean }).agrupar_por_tipo)).toEqual([true]);

  // 390 px, "Função e nome" on Cubículo Enel: off, turned on, one put; the tree's menu item stays and reads it.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Mais opções de Cubículo Enel', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Função e nome' }).click();
  const edit = page.getByRole('dialog', { name: 'Função e nome' });
  const editSwitch = edit.getByRole('switch', { name: 'Agrupar por tipo' });
  await expect(editSwitch).toHaveAttribute('aria-checked', 'false');
  await editSwitch.click();
  await edit.getByRole('button', { name: 'Salvar' }).click();
  await expect.poll(async () => (await outboxValues(database, page, `location/${enel.id}/agrupar_por_tipo`)).at(-1)).toBe(true);
  await page.getByRole('button', { name: 'Mais opções de Cubículo Enel', exact: true }).click();
  await expect(page.getByRole('menuitemcheckbox', { name: /^Agrupar por tipo na seção \d+$/ })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');

  // The DOCX: Cubículo Enel's sheets under the kernel's type groups.
  await page.setViewportSize({ width: 1280, height: 900 });
  const snapshot = await deviceSnapshot(page, database, relatorioId);
  // The kernel's headings of the local's type groups ("9.1 Outros equipamentos do Cubículo Enel"), without their number.
  const groups = (section9Layout(snapshot, 9, 'RESULTADOS')?.subsections ?? []).map((subsection) => subsection.heading.replace(/^\S+ /, '')).filter((title) => title.includes('Cubículo Enel'));
  expect(groups.length).toBeGreaterThan(0);
  expect(groups.every((title) => title !== 'Cubículo Enel'), JSON.stringify(groups)).toBe(true);
  await setParecer(page, relatorioId);
  const docx = await issue(page, relatorioId, 1);
  for (const title of groups) expect(docx.headings.some((heading) => heading.text.endsWith(title)), title).toBe(true);
});

test('24.9-E2E-004 a table with two readings confirmed from the display and one row with none keeps every unit on one column', async ({ page }) => {
  test.setTimeout(240_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const sheet = built.sheets.find((one) => one.blockType === 'chave_seccionadora')!;
  const SECC = getDefinition(SEED_VERSION, 'cabine_primaria', 'chave_seccionadora');
  const [first, second, third] = cellAddressesOf(SECC, 'isolacao').slice(0, 3) as unknown as [{ row: number; col: number }, { row: number; col: number }, { row: number; col: number }];
  await pushDrafts(page, database, built.drafts as OpDraft[]);
  for (const address of [first, second]) {
    await pushCellSuggestion(account.companyId, built.relatorioId, {
      targetPath: `sheet/${sheet.blockId}/test/isolacao/cell/${address.row}/${address.col}`,
      value: { raw: '1.45', unit: 'GΩ', state: 'measured' },
      photoId: newId(),
    });
  }
  await openStep(page, built.relatorioId, sheet.blockId, 'Ensaios');
  // The two display readings confirmed with the table's one action, as a person takes them.
  await testSection(page, 'isolacao').getByRole('button', { name: 'Confirmar todos (2)' }).click({ timeout: 30_000 });
  await expect(testSection(page, 'isolacao').getByRole('button', { name: /^Confirmar todos/ })).toHaveCount(0);
  for (const address of [first, second]) {
    await expect.poll(async () => (await outboxValues(database, page, `sheet/${sheet.blockId}/test/isolacao/cell/${address.row}/${address.col}`)).at(-1)).toEqual({ raw: '1.45', unit: 'GΩ', state: 'measured' });
    await expect(cellOf(page, 'isolacao', address.row, address.col)).toHaveAttribute('data-state', 'confirmed');
    await expect(cellOf(page, 'isolacao', address.row, address.col).locator('.crop-thumb')).toBeVisible();
  }
  await expect(cellOf(page, 'isolacao', third.row, third.col).locator('.crop-thumb')).toHaveCount(0);
  const table = testSection(page, 'isolacao').locator('table.measurement-table').first();
  const rightOf = async (locator: Locator) => {
    const box = (await locator.boundingBox())!;
    return box.x + box.width;
  };
  const units = [first, second, third].map((address) => table.locator(`.ficha-cell[data-cell="isolacao:${address.row}:${address.col}"] .mf-unit`));
  const edges = await Promise.all(units.map(rightOf));
  expect(Math.max(...edges) - Math.min(...edges), JSON.stringify(edges)).toBeLessThanOrEqual(0.5);
  const values = [first, second, third].map((address) => table.locator(`.ficha-cell[data-cell="isolacao:${address.row}:${address.col}"] .mf-value`));
  const valueEdges = await Promise.all(values.map(rightOf));
  expect(Math.max(...valueEdges) - Math.min(...valueEdges), JSON.stringify(valueEdges)).toBeLessThanOrEqual(0.5);
});
