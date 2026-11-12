import {
  addCalendarDays,
  buildSnapshot,
  calendarDateOfInstant,
  calibrationLackText,
  deadlineOverdueText,
  entityKey,
  instrumentLacksText,
  sectionRefText,
  sheetsUnderRemovedLocals,
  sheetsUnderRemovedLocalsText,
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
 * Story 25.12 (M26, M18, M32; Story 25.1 Part B's frames): three warnings before generating, every seed,
 * none blocking. On one relatório: a point whose deadline was yesterday (and one whose deadline is the
 * current month, given as a month, which raises nothing), a megôhmetro ticked at setup with no calibration
 * date, and the sheets of a local another device removed while this relatório's sheets stood in it (the
 * removal pushed alone, as when the sheets were created after the other device's plan). The Export dialog
 * names the three rows with their sections, "Gerar relatório" stays enabled, the Sumário rows 8, 9 and 11
 * carry them, Cadastros › Instrumentos says what the instrument lacks, and the issued DOCX prints without
 * the sheets of the removed local. Every expected text is the kernel's. It issues a revision through the
 * api's one queue and LibreOffice, so it runs in the serial group's queue lane (`e2e/support/groups.ts`).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  // This worker's Empresa B (E6-Q7): its company, its user and its device database.
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

function instrumentDraft(id: string): OpDraft {
  return {
    kind: 'create',
    scope: 'company',
    company_id: account.companyId,
    project_id: null,
    relatorio_id: null,
    path: `registry/instrument/${id}`,
    value: {
      id,
      kind: 'instrument',
      code: '7E',
      name: 'Megôhmetro digital',
      manufacturer: 'Instrum',
      model: 'DMG10Ki',
      serial: 'PR-2512-A',
      cert_number: null,
      laboratory: null,
      calibrated_at: null,
      calibration_interval_months: null,
      rbc_accredited: null,
      test_isolacao: null,
      test_resistencia_contato: null,
      test_relacao_transformacao: null,
      certificate_file_id: null,
      removed_at: null,
    },
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: account.userId,
  } as OpDraft;
}

function pointDraft(relatorioId: string, id: string, orderKey: string, deadline: string): OpDraft {
  return {
    kind: 'create',
    scope: 'relatorio',
    company_id: account.companyId,
    project_id: null,
    relatorio_id: relatorioId,
    path: `point/${id}`,
    value: { id, relatorio_id: relatorioId, text: `Ponto de prazo ${deadline}.`, equipment_id: null, origin: 'manual', order_key: orderKey, removed_at: null, action: 'Corrigir.', priority: null, deadline, owner: null },
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
const toast = (page: Page) => page.getByTestId('toast');
const sumarioStatus = (page: Page, row: string) => page.getByRole('list', { name: 'Sumário do relatório' }).locator(`li.sum-row[data-row="${row}"] .sum-status`);

test('@p0 25.12-E2E-001 an overdue deadline, an instrument with no calibration date and the sheets of a removed local: three named pending rows, "Gerar relatório" enabled, the Sumário and Cadastros say the same, and the issued DOCX prints without those sheets', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const { relatorioId } = built;

  // The location holding the fewest equipment sheets: the other device removes it alone.
  const creates = (prefix: string) => built.drafts.filter((draft) => draft.kind === 'create' && draft.path.startsWith(prefix)).map((draft) => draft.value as Record<string, unknown>);
  const sheetsBy = new Map<string, number>();
  for (const block of creates('block/')) {
    if (block.equipment_id === null || block.location_id === null) continue;
    sheetsBy.set(block.location_id as string, (sheetsBy.get(block.location_id as string) ?? 0) + 1);
  }
  const [removedLocationId] = [...sheetsBy.entries()].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1))[0]!;

  const today = calendarDateOfInstant(new Date());
  const yesterday = addCalendarDays(today, -1)!;
  const meggerId = newId();
  await pushDrafts(page, database, [
    ...built.drafts,
    emCampoDraft(account, relatorioId),
    instrumentDraft(meggerId),
    officeDraft(account, { relatorioId }, 'relatorio/setup/instrument_ids', [meggerId]),
    pointDraft(relatorioId, newId(), 'a1', yesterday),
    pointDraft(relatorioId, newId(), 'a2', today.slice(0, 7)),
  ]);
  // The second device: its removal of the local reaches the server alone, the sheets standing in it.
  await pushDrafts(page, database, [officeDraft(account, { relatorioId }, `location/${removedLocationId}/removed_at`, new Date().toISOString())]);
  await syncNowAndReturn(page);

  // Committed state: the device holds the removed local and its live sheets; the kernel names them.
  const state = await deviceState(page);
  expect((state.get(entityKey('location', removedLocationId)) as { removed_at: string | null }).removed_at).not.toBeNull();
  const orphans = sheetsUnderRemovedLocals(state, relatorioId);
  expect(orphans.length).toBeGreaterThan(0);
  const megger = state.get(entityKey('registry', meggerId)) as InstrumentRow;
  const overdueText = deadlineOverdueText([1]);
  const calibrationText = calibrationLackText('7E', 'date');
  const removedText = sheetsUnderRemovedLocalsText(orphans);

  await setParecer(page, relatorioId);
  // The Sumário rows 8, 9 and 11 carry the rows.
  await expect(sumarioStatus(page, 'section_8')).toContainText(overdueText, { timeout: 30_000 });
  await expect(sumarioStatus(page, 'section_9')).toContainText(removedText);
  await expect(sumarioStatus(page, 'section_11')).toContainText(calibrationText);

  // The Export dialog: the three named rows with their sections, none blocking; the month deadline raises nothing.
  const dialog = page.getByRole('dialog', { name: 'Gerar relatório' });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  const precheck = dialog.locator('.precheck');
  await expect(precheck.locator('li.is-blocking')).toHaveCount(0);
  // The section as the Sumário numbers it (Story 20.3: the tests come before the points), the kernel's reference.
  const snapshot = buildSnapshot(state, relatorioId);
  for (const [text, section] of [
    [overdueText, sectionRefText(snapshot, 8)],
    [removedText, sectionRefText(snapshot, 9)],
    [calibrationText, sectionRefText(snapshot, 11)],
  ] as const) {
    const row = precheck.locator('li', { hasText: text });
    await expect(row).toHaveCount(1);
    await expect(row.locator('.pc-meta')).toHaveText(`— ${section}`);
  }
  await expect(precheck.locator('li', { hasText: 'Prazo já vencido' })).toHaveCount(1);
  await expect(precheck).not.toContainText('pontos 1 e 2');
  const generate = dialog.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' });
  await expect(generate).toBeEnabled();

  // The issue: the revision is made, and the DOCX prints none of the sheets of the removed local.
  await generate.click();
  await confirmIssue(dialog);
  await expect(toast(page)).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: 150_000 });
  await escapeDialog(page, dialog);
  const revision = (await readStore<{ entity: string; row: { id: string; number: number; relatorio_id: string } }>(page, database, 'entities')).find(
    (record) => record.entity === 'revision' && record.row.relatorio_id === relatorioId && record.row.number === 1,
  )!;
  expect(revision).toBeDefined();
  const response = await page.request.get(`/api/revisions/${revision.row.id}/docx`);
  expect(response.status()).toBe(200);
  const structure = extractStructure(Buffer.from(await response.body()));
  const cells = new Set(structure.tables.flat(2).map((cell) => cell.trim()));
  const headings = structure.headings.map((heading) => heading.text);
  for (const tag of orphans) {
    expect(cells.has(tag)).toBe(false);
    expect(headings.some((heading) => heading.includes(tag))).toBe(false);
  }

  // Cadastros › Instrumentos: the row says what it lacks, with the same words; the fields stay optional.
  await page.goto('/cadastros');
  await page.getByRole('tab', { name: 'Instrumentos' }).click();
  const row = page.locator('.registry-list .registry-row', { has: page.locator('strong', { hasText: /^7E$/ }) });
  await expect(row.locator('.e25-rr-warn')).toHaveText(instrumentLacksText(megger)!);
  expect(instrumentLacksText(megger)).toBe('Sem data de calibração · sem certificado');
});
