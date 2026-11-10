import { choiceValue } from '@app/domain';
import type { Page } from '@playwright/test';
import { cellOf, deviceSnapshot, issueAndReadTables, kernelOf, kernelTablesTitled, openStep, outboxValues, setUpRelatorio, tablesTitled, testSection, typeCell } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { devicePhotos, expectCameraOpen } from './support/photos.ts';

/*
 * Story 23.20 (seed v13, decision I; Base rev08 GE-01, NETA MTS-2023 Table 100.18): the thermography on
 * the eight types, as a person records it at 1280 px. On a para-raio the test starts not applicable,
 * asking for the load, with "Equipamento em carga" kept under the band; Sim (one value put) applies it,
 * Conexões ΔT entre similares 20 °C is out and the floor Reprovado; "Foto térmica" opens the sheet camera
 * and the shot is a sheet photo whose context caption names the thermography. On a TC, ΔT sobre o ambiente
 * 25 °C restricts the sheet (Aprovado · Com restrições). On a disjuntor, Não makes it not applicable with
 * its reason, the control still there, nothing missing. The issued DOCX prints the two tables in load and
 * the thermal photo's line; the disjuntor's is absent. Every expected word is the kernel's over the
 * device's own rows. It issues a revision through the api's one queue and LibreOffice, so it runs in the
 * serial group.
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

const KEY = 'termografia';
const VALUE = 'em_carga';

/** Answers "Equipamento em carga" on the thermography (NA band or test body alike) and waits for its value put. */
async function answerLoad(page: Page, blockId: string, answer: 'Sim' | 'Não'): Promise<void> {
  const path = `sheet/${blockId}/test/${KEY}/value/${VALUE}`;
  const before = (await outboxValues(database, page, path)).length;
  await testSection(page, KEY).getByRole('radiogroup', { name: 'Equipamento em carga' }).getByRole('radio', { name: answer }).click();
  await expect.poll(async () => (await outboxValues(database, page, path)).length).toBe(before + 1);
  expect((await outboxValues(database, page, path)).at(-1)).toEqual(choiceValue(answer === 'Sim' ? 'sim' : 'nao'));
}

test('@p0 23.20-E2E-001 thermography on a para-raio and a TC in load (out, restricted, a thermal photo) and on a disjuntor out of load (NA with its reason); the DOCX prints the two tables and the photo line', async ({ page }) => {
  test.setTimeout(420_000);
  const { relatorioId, sheets } = await setUpRelatorio(page, account, database);
  const pr = sheets.find((sheet) => sheet.blockType === 'para_raio')!;
  const tc = sheets.find((sheet) => sheet.blockType === 'tc')!;
  const dj = sheets.find((sheet) => sheet.blockType === 'disjuntor_mt')!;

  // --- the para-raio: NA asking for the load, the control kept under the band ---
  await openStep(page, relatorioId, pr.blockId, 'Ensaios');
  const section = testSection(page, KEY);
  const unknown = (await kernelOf(page, database, relatorioId, pr.blockId)).measurement(KEY).applicability;
  expect(unknown).toMatchObject({ state: 'na', reason: 'Não se aplica: Informe se o equipamento está em carga.' });
  await expect(section).toHaveAttribute('data-applicability', 'na');
  await expect(section.locator('.v13-na-band .band-text')).toContainText(unknown.phrase!);
  await answerLoad(page, pr.blockId, 'Sim');
  await expect(section).not.toHaveAttribute('data-applicability', 'na');

  // Conexões ΔT entre similares 20 °C: out (above 15 °C), the floor Reprovado.
  await typeCell(page, database, pr.blockId, KEY, 0, 0, '20');
  expect(await outboxValues(database, page, `sheet/${pr.blockId}/test/${KEY}/cell/0/0`)).toEqual([{ raw: '20', unit: '°C', state: 'measured' }]);
  const judged = await kernelOf(page, database, relatorioId, pr.blockId);
  const out = judged.measurement(KEY).rows[0]!.cells[0]!;
  expect(out.verdict).toBe('out');
  await expect(cellOf(page, KEY, 0, 0).locator('.measurement-field')).toHaveAttribute('data-state', 'out-of-limit');
  await expect(cellOf(page, KEY, 0, 0).locator('.mf-helper[role="status"]')).toContainText(out.helperText!);
  expect(judged.floorReason).toBe('A ficha exige no mínimo Reprovado · Com restrições: medição fora do critério.');

  // "Foto térmica": the sheet camera, one shot, a sheet photo whose context caption names the thermography.
  await section.getByRole('button', { name: 'Foto térmica' }).click();
  const view = await expectCameraOpen(page);
  await view.getByRole('button', { name: 'Disparar' }).click();
  await view.getByRole('button', { name: 'Concluir fotos', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Câmera' })).toHaveCount(0, { timeout: 15_000 });
  await expect.poll(async () => (await devicePhotos(page, database)).filter((photo) => photo.block_id === pr.blockId).length, { timeout: 15_000 }).toBe(1);
  const thermal = (await devicePhotos(page, database)).find((photo) => photo.block_id === pr.blockId)!;
  expect(thermal).toMatchObject({ kind: 'photo', block_id: pr.blockId, item_key: null, reading_kind: null, removed_at: null });
  expect(thermal.caption).toContain('ensaios de termografia');

  // --- the TC: ΔT sobre o ambiente 25 °C, restricted (the ambient's class "monitorar"), Aprovado · Com restrições ---
  await openStep(page, relatorioId, tc.blockId, 'Ensaios');
  await answerLoad(page, tc.blockId, 'Sim');
  await typeCell(page, database, tc.blockId, KEY, 0, 1, '25');
  const restricted = (await kernelOf(page, database, relatorioId, tc.blockId)).measurement(KEY).rows[0]!.cells[1]!;
  expect([restricted.verdict, restricted.restriction?.reason]).toEqual(['restricted', 'ΔT sobre o ambiente de 25 °C (deficiência)']);
  expect((await kernelOf(page, database, relatorioId, tc.blockId)).floorReason).toMatch(/^A ficha exige no mínimo Aprovado · Com restrições/);

  // --- the disjuntor: Não, NA with its reason, the control still shown, nothing missing ---
  await openStep(page, relatorioId, dj.blockId, 'Ensaios');
  await answerLoad(page, dj.blockId, 'Não');
  const na = (await kernelOf(page, database, relatorioId, dj.blockId)).measurement(KEY);
  expect(na.applicability).toMatchObject({ state: 'na', reason: 'Não se aplica: Equipamento fora de carga.' });
  expect(na.values.every((value) => !value.missing) && na.rows.every((row) => row.cells.every((cell) => !cell.missing))).toBe(true);
  await expect(testSection(page, KEY)).toHaveAttribute('data-applicability', 'na');
  await expect(testSection(page, KEY).getByRole('radiogroup', { name: 'Equipamento em carga' }).getByRole('radio', { name: 'Não' })).toHaveAttribute('aria-checked', 'true');

  // --- the DOCX: the two tables in load (the template's other sheets NA, no load answered), the photo's line ---
  const snapshot = await deviceSnapshot(page, database, relatorioId);
  expect(kernelTablesTitled(snapshot, 'TERMOGRAFIA', dj.blockId)).toBe(0);
  expect(kernelTablesTitled(snapshot, 'TERMOGRAFIA')).toBe(2);
  const tables = await issueAndReadTables(page, database, relatorioId);
  const printed = tablesTitled(tables, 'TERMOGRAFIA');
  expect(printed).toHaveLength(2);
  expect(printed.some((table) => table.some((cells) => cells[0] === 'CONEXÕES' && cells.includes('20')))).toBe(true);
  const { extractStructure } = await import('../apps/api/src/jobs/generate/docx-structure.test-support.ts');
  const { readStore } = await import('./support/outbox.ts');
  const revision = (await readStore<{ entity: string; row: { id: string; number: number } }>(page, database, 'entities')).find((record) => record.entity === 'revision' && record.row.number === 1)!;
  const paragraphs = extractStructure(Buffer.from(await (await page.request.get(`/api/revisions/${revision.row.id}/docx`)).body())).paragraphs;
  expect(paragraphs.some((paragraph) => /^Imagem \d+: /.test(paragraph) && paragraph.includes('ensaios de termografia'))).toBe(true);
});

/*
 * Fix batch e23z (W3-6): a test applied by hand under a condition over its own value names no plate. On a
 * disjuntor, "Equipamento em carga" Não: the NA band's sub-line drops "Pela placa."; "Aplicar este ensaio"
 * shows the applied band with "Desfazer a aplicação" (never "Seguir a placa"); tapping it toasts "Aplicação
 * desfeita — não se aplica" and writes the override back to null. A plate condition (the seccionadora's HH
 * fuses with TIPO DE SECCIONADORA SEM CARGA) keeps "Seguir a placa".
 */
test('@p0 e23z-E2E-001 W3-6 thermography applied by hand under its own value: the band and its button name no plate; a plate condition keeps "Seguir a placa"', async ({ page }) => {
  test.setTimeout(180_000);
  const { relatorioId, sheets } = await setUpRelatorio(page, account, database, (all) => [{ blockType: 'chave_seccionadora', key: 'tipo_seccionadora', value: 'SEM CARGA' }].filter((write) => all.some((sheet) => sheet.blockType === write.blockType)));
  const dj = sheets.find((sheet) => sheet.blockType === 'disjuntor_mt')!;
  const sc = sheets.find((sheet) => sheet.blockType === 'chave_seccionadora')!;
  const path = `sheet/${dj.blockId}/test/${KEY}/applicability`;

  await openStep(page, relatorioId, dj.blockId, 'Ensaios');
  await answerLoad(page, dj.blockId, 'Não');
  const section = testSection(page, KEY);
  await expect(section).toHaveAttribute('data-applicability', 'na');
  await expect(section.locator('.v13-na-band .band-sub')).toHaveText('Não conta como faltando e não sai no relatório.');
  await section.getByRole('button', { name: 'Aplicar este ensaio' }).click();
  await expect.poll(async () => (await outboxValues(database, page, path)).at(-1)).toBe('applied');
  const applied = (await kernelOf(page, database, relatorioId, dj.blockId)).measurement(KEY).applicability;
  expect(applied).toMatchObject({ state: 'applied', value: VALUE });
  const band = page.locator(`section[data-test-key="${KEY}"] .v13-applied-band`);
  await expect(band).toContainText(applied.appliedText!);
  await expect(band.getByRole('button', { name: 'Seguir a placa' })).toHaveCount(0);
  await band.getByRole('button', { name: 'Desfazer a aplicação' }).click();
  await expect(page.locator('.toast').filter({ hasText: 'Aplicação desfeita — não se aplica' })).toBeVisible();
  await expect.poll(async () => (await outboxValues(database, page, path)).at(-1)).toBeNull();
  await expect(testSection(page, KEY)).toHaveAttribute('data-applicability', 'na');

  // The plate condition: the HH fuses NA by TIPO DE SECCIONADORA, applied by hand, still "Seguir a placa".
  await openStep(page, relatorioId, sc.blockId, 'Ensaios');
  const fuses = testSection(page, 'resistencia_fusiveis');
  await expect(fuses).toHaveAttribute('data-applicability', 'na');
  await expect(fuses.locator('.v13-na-band .band-sub')).toHaveText('Pela placa. Não conta como faltando e não sai no relatório.');
  await fuses.getByRole('button', { name: 'Aplicar este ensaio' }).click();
  await expect(page.locator('section[data-test-key="resistencia_fusiveis"] .v13-applied-band').getByRole('button', { name: 'Seguir a placa' })).toBeVisible();
});
