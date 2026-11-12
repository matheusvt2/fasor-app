import {
  buildSnapshot,
  entityKey,
  instrumentHeaderOf,
  instrumentSheetCounts,
  section11Instruments,
  sectionRefText,
  setupGapText,
  sharedCertificateText,
  tickedUnusedText,
  usedInSheetsText,
  type EntityState,
  type InstrumentRow,
  type OpDraft,
} from '@app/domain';
import type { Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { escapeDialog } from './support/dialogs.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { confirmIssue, setParecer } from './support/relatorio-flow.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNowAndReturn } from './support/sync.ts';

/*
 * Story 25.13 (M25; Story 25.1 Part B's frames): the instruments of a relatório follow its sheets, and
 * registry rows that share a certificate are warned. On one relatório: 3M is used on the transformer's
 * sheet and not ticked (Etapa 4 marks it from the sheets, "Usado em 1 ficha", and refuses to untick it,
 * writing nothing); 1T is ticked and used on no sheet (Etapa 4 and the Export dialog say so; unticking it
 * clears both); 6M shares 3M's certificate number typed with spaces and another case (Cadastros names each
 * from the other; the Export dialog raises one pending row for 3M naming 6M); 2E and 7E share a model
 * with different certificates (the lighter line in Cadastros, no row before generating). Section 11 of the
 * issued DOCX prints what it prints today: the kernel's `section11Instruments`, read under its heading.
 * Every expected text is the kernel's. It issues a revision through the api's one queue and LibreOffice,
 * so it runs in the serial group's queue lane (`e2e/support/groups.ts`).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  // This worker's Empresa B (E6-Q7): its company, its user and its device database.
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

function instrumentRow(code: string, model: string, certNumber: string): InstrumentRow {
  return {
    id: newId(),
    kind: 'instrument',
    code,
    name: `Instrumento ${code}`,
    manufacturer: 'Hi-Tech',
    model,
    serial: `PR-2513-${code}`,
    cert_number: certNumber,
    laboratory: null,
    calibrated_at: '2026-01-10',
    calibration_interval_months: 24,
    rbc_accredited: null,
    test_isolacao: null,
    test_resistencia_contato: null,
    test_relacao_transformacao: null,
    certificate_file_id: null,
    removed_at: null,
  } as InstrumentRow;
}

function createDraft(row: InstrumentRow): OpDraft {
  return {
    kind: 'create',
    scope: 'company',
    company_id: account.companyId,
    project_id: null,
    relatorio_id: null,
    path: `registry/instrument/${row.id}`,
    value: row as never,
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: account.userId,
  } as OpDraft;
}

type Entity = { entity: string; id: string; row: unknown };
/** The device's entity store as the kernel's state map. */
async function deviceState(page: Page): Promise<EntityState> {
  const records = await readStore<Entity>(page, database, 'entities');
  return new Map(records.map((record) => [entityKey(record.entity as Parameters<typeof entityKey>[0], record.id), record.row])) as EntityState;
}
const instrumentIdOps = async (page: Page) => (await readStore<{ path: string; value: unknown }>(page, database, 'outbox')).filter((op) => op.path === 'relatorio/setup/instrument_ids');
const toast = (page: Page) => page.getByTestId('toast');
const sumarioStatus = (page: Page, row: string) => page.getByRole('list', { name: 'Sumário do relatório' }).locator(`li.sum-row[data-row="${row}"] .sum-status`);

test('@p0 25.13-E2E-001 Etapa 4 marks the sheets\' instruments and warns on one ticked and unused; Cadastros names a shared certificate and a shared model; the Export dialog raises the two rows; section 11 of the DOCX is unchanged', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const { relatorioId } = built;
  const transformer = built.sheets.find((sheet) => sheet.blockType === 'transformador_forca')!;
  const other = built.sheets.find((sheet) => sheet.blockType !== 'transformador_forca' && sheet.blockType === 'disjuntor_mt') ?? built.sheets.find((sheet) => sheet.blockId !== transformer.blockId)!;

  const m3 = instrumentRow('3M', 'HTMO-10', 'RBC-1234');
  const m6 = instrumentRow('6M', 'HTMO-10', '  rbc-1234 ');
  const t1 = instrumentRow('1T', 'HTRT-8K', 'RBC-1T');
  const e2 = instrumentRow('2E', 'DMG10Ki', 'RBC-2E');
  const e7 = instrumentRow('7E', 'DMG10Ki', 'RBC-7E');
  await pushDrafts(page, database, [
    ...[m3, m6, t1, e2, e7].map(createDraft),
    ...built.drafts,
    emCampoDraft(account, relatorioId),
    officeDraft(account, { relatorioId }, 'relatorio/setup/instrument_ids', [t1.id]),
    officeDraft(account, { relatorioId }, `sheet/${transformer.blockId}/test/isolacao/instrument`, instrumentHeaderOf(m3, 'isolacao')),
    officeDraft(account, { relatorioId }, `sheet/${other.blockId}/test/isolacao/instrument`, instrumentHeaderOf(e2, 'isolacao')),
  ]);
  await syncNowAndReturn(page);

  // Committed state: the sheets use 3M and 2E, one sheet each; only 1T is ticked.
  const state = await deviceState(page);
  const snapshot = buildSnapshot(state, relatorioId);
  const counts = instrumentSheetCounts(snapshot);
  expect(counts.get(m3.id)).toBe(1);
  expect(counts.get(e2.id)).toBe(1);
  expect(snapshot.relatorio.setup.instrument_ids).toEqual([t1.id]);
  expect(section11Instruments(snapshot).map((entry) => entry.code).sort()).toEqual(['1T', '2E', '3M']);

  // Etapa 4: 3M marked from the sheets with its count, and a press refuses, writing nothing.
  await page.goto(`/relatorio/${relatorioId}/setup?etapa=4`);
  const box3m = page.getByRole('checkbox', { name: /^3M/ });
  await expect(box3m).toHaveAttribute('aria-checked', 'true', { timeout: 30_000 });
  await expect(box3m).toHaveAttribute('aria-disabled', 'true');
  await expect(box3m.locator('xpath=..').locator('.e25-used')).toHaveText(usedInSheetsText(1));
  expect(usedInSheetsText(1)).toBe('Usado em 1 ficha');
  const opsBefore = (await instrumentIdOps(page)).length;
  // aria-disabled: Playwright waits for an enabled control; a tap still lands on it (the row stays focusable).
  await box3m.click({ force: true });
  await expect(page.getByText(`Continua na ${sectionRefText(snapshot, 11)} porque uma ficha usa este instrumento`)).toBeVisible();
  await expect(box3m).toHaveAttribute('aria-checked', 'true');
  expect((await instrumentIdOps(page)).length).toBe(opsBefore);

  // 1T: ticked, used on no sheet, its warning line.
  const box1t = page.getByRole('checkbox', { name: /^1T/ });
  await expect(box1t).toHaveAttribute('aria-checked', 'true');
  await expect(box1t).not.toHaveAttribute('aria-disabled');
  const unusedLine = box1t.locator('xpath=..').locator('.e25-unused');
  await expect(unusedLine).toHaveText(/^Marcado, sem uso nas fichas\./);
  // Two of one model and one not in the relatório: no line in Etapa 4 for 6M or 7E.
  await expect(page.getByRole('checkbox', { name: /^6M/ })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('checkbox', { name: /^7E/ })).toHaveAttribute('aria-checked', 'false');

  // The Export dialog: the shared certificate (pending, naming the twin) and the unused tick, each with its section; no model row.
  await setParecer(page, relatorioId);
  const sharedText = sharedCertificateText('3M', [m6]);
  const unusedText = tickedUnusedText('1T');
  expect(sharedText).toBe('3M: mesmo certificado de 6M');
  await expect(sumarioStatus(page, 'section_11')).toContainText(sharedText, { timeout: 30_000 });
  await expect(sumarioStatus(page, 'section_11')).toContainText(unusedText);
  const dialog = page.getByRole('dialog', { name: 'Gerar relatório' });
  const openExport = async () => {
    await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
    await expect(dialog).toBeVisible();
  };
  await openExport();
  const precheck = dialog.locator('.precheck');
  const section11 = `— ${sectionRefText(snapshot, 11)}`;
  for (const text of [sharedText, unusedText]) {
    const row = precheck.locator('li', { hasText: text });
    await expect(row).toHaveCount(1);
    await expect(row.locator('.pc-meta')).toHaveText(section11);
    await expect(row).not.toHaveClass(/is-blocking/);
  }
  await expect(precheck).not.toContainText('2E: mesmo certificado');
  await expect(precheck).not.toContainText(/mesmo modelo/i);
  await escapeDialog(page, dialog);

  // Unticking 1T clears both, committed as one instrument_ids op of [].
  await page.goto(`/relatorio/${relatorioId}/setup?etapa=4`);
  await expect(box1t).toHaveAttribute('aria-checked', 'true', { timeout: 30_000 });
  await box1t.click();
  await expect(box1t).toHaveAttribute('aria-checked', 'false');
  await expect(unusedLine).toHaveCount(0);
  await expect.poll(async () => (await instrumentIdOps(page)).at(-1)?.value).toEqual([]);
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(sumarioStatus(page, 'section_11')).toContainText(sharedText, { timeout: 30_000 });
  await expect(sumarioStatus(page, 'section_11')).not.toContainText(unusedText);
  // Review of PR #332: nothing is ticked now, but the sheets use 3M and 2E, so no "no instrument" row.
  const noInstrumentText = setupGapText('instruments', snapshot);
  expect(noInstrumentText).toBe('Nenhum instrumento em Dados do relatório');
  await expect(sumarioStatus(page, 'section_11')).not.toContainText(noInstrumentText);
  await openExport();
  await expect(precheck.locator('li', { hasText: sharedText })).toHaveCount(1);
  await expect(precheck.locator('li', { hasText: unusedText })).toHaveCount(0);
  await expect(precheck.locator('li', { hasText: noInstrumentText })).toHaveCount(0);

  // The issue: section 11 of the DOCX prints the kernel's section 11 instruments, as today.
  const generate = dialog.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' });
  await expect(generate).toBeEnabled();
  await generate.click();
  await confirmIssue(dialog);
  await expect(toast(page)).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: 150_000 });
  await escapeDialog(page, dialog);
  const finalState = await deviceState(page);
  const finalSnapshot = buildSnapshot(finalState, relatorioId);
  const printed = section11Instruments(finalSnapshot);
  expect(printed.map((entry) => entry.code).sort()).toEqual(['2E', '3M']);
  const revision = (await readStore<{ entity: string; row: { id: string; number: number; relatorio_id: string } }>(page, database, 'entities')).find(
    (record) => record.entity === 'revision' && record.row.relatorio_id === relatorioId && record.row.number === 1,
  )!;
  const response = await page.request.get(`/api/revisions/${revision.row.id}/docx`);
  expect(response.status()).toBe(200);
  const structure = extractStructure(Buffer.from(await response.body()));
  // Section 11 by its heading, to the end of the body: its placeholder lines, the kernel's, and no other instrument.
  const heading = structure.headings.find((h) => /CERTIFICADOS/i.test(h.text));
  expect(heading).toBeDefined();
  const start = structure.paragraphs.findLastIndex((paragraph) => paragraph === heading!.text);
  expect(start).toBeGreaterThanOrEqual(0);
  const body = structure.paragraphs.slice(start + 1).join('\n');
  for (const entry of printed) expect(body).toContain(entry.placeholder);
  // 1T, unticked and unused, and the registry rows outside the relatório print nothing.
  for (const cert of ['RBC-1T', 'RBC-7E', 'rbc-1234 ']) expect(body).not.toContain(`(nº ${cert})`);

  // Cadastros › Instrumentos: 3M and 6M name each other; 2E and 7E carry the lighter line.
  await page.goto('/cadastros');
  await page.getByRole('tab', { name: 'Instrumentos' }).click();
  const row = (code: string) => page.locator('.registry-list .registry-row', { has: page.locator('strong', { hasText: new RegExp(`^${code}$`) }) });
  // Each row first says what it lacks (Story 25.12: no certificate file here), then its twin.
  await expect(row('3M').locator('.e25-rr-warn')).toHaveText(['Sem certificado', 'Mesmo certificado de 6M']);
  await expect(row('6M').locator('.e25-rr-warn')).toHaveText(['Sem certificado', 'Mesmo certificado de 3M']);
  await expect(row('3M').locator('.e25-rr-light')).toHaveCount(0);
  await expect(row('2E').locator('.e25-rr-light')).toHaveText('Mesmo modelo de 7E: confira');
  await expect(row('7E').locator('.e25-rr-light')).toHaveText('Mesmo modelo de 2E: confira');
  await expect(row('1T').locator('.e25-rr-warn')).toHaveText(['Sem certificado']);
  await expect(row('1T').locator('.e25-rr-light')).toHaveCount(0);
});
