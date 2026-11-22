import {
  EMPTY_DEFINITION_CONTEXT,
  getDefinition,
  getSeed,
  instantiateTemplate,
  SEED_VERSION,
  seedRule,
  STANDARD_SUBSOLO_NAME,
  standardTemplate,
  type BlockRow,
  type EquipmentRow,
  type LocationRow,
  type OpDraft,
  type TemplateRow,
} from '@app/domain';
import type { Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { outbox } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { pdfTextItems } from './support/pdf-text.ts';
import { expectCameraOpen, shoot } from './support/photos.ts';
import { confirmIssue, createProjectFromHome, createRelatorio, setParecer } from './support/relatorio-flow.ts';
import { emCampoDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * 27.8-E2E-001 (batch e27b, Story 27.8; F30 and F35 of the 2026-11-21 pass, decision 2). A new relatório, created as
 * a person creates it at 1280 px, is born on the current seed (v17, from the kernel). On its Para-raios ficha a photo
 * is taken with the sticky bar's camera and its caption given the activity "limpeza e reaperto" in the composer,
 * which reads "Detalhe da limpeza e reaperto realizados no para-raios …". Its revision's PDF carries the four words:
 * "ITEM", "PARA-RAIOS", "1º Subsolo" and that caption, under the group title "TPs e TCs dos Cubículos de MT". A v16
 * relatório beside it, pushed from the office from a standard template stored before Story 27.8 (its local still
 * "1° Subsolo"), keeps "ÍTEM", "PARA-RAIO" and "1° Subsolo", with the same group title. Both generate through the
 * api's one queue and LibreOffice, so the spec runs in the queue lane.
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

const JOB_TIMEOUT = 150_000;
/** The seed before the current one, the version this spec pins its older relatório to. */
const OLDER = 'v16';
const toast = (page: Page) => page.getByTestId('toast');
const exportDialog = (page: Page) => page.getByRole('dialog', { name: 'Gerar relatório' });
const camera = (page: Page) => page.getByRole('dialog', { name: 'Câmera' });

interface EntityRecord<T> {
  entity: string;
  id: string;
  row: T;
}
const entities = <T,>(page: Page) => readStore<EntityRecord<T>>(page, database, 'entities');

/** The relatório's live surge arrester sitting directly in Cubículo Enel, in the device's store, with its equipment's TAG. */
async function enelArrester(page: Page, relatorioId: string): Promise<{ block: BlockRow; tag: string }> {
  const records = await entities<unknown>(page);
  const rows = <T,>(entity: string) => records.filter((record) => record.entity === entity).map((record) => record.row as T);
  const enel = rows<LocationRow>('location').find((row) => row.relatorio_id === relatorioId && row.kind === 'cabine' && row.name === 'Cubículo Enel')!;
  const block = rows<BlockRow>('block').find((row) => row.relatorio_id === relatorioId && row.block_type === 'para_raio' && row.location_id === enel.id && row.removed_at === null)!;
  const tag = rows<EquipmentRow>('equipment').find((row) => row.id === block.equipment_id)?.tag ?? '';
  return { block, tag };
}

/** The printed title of a sheet: its type word, an optional role ("DE ENTRADA"), then its TAG (letters, digits and dashes). */
const titleOf = (word: string, tag: string): RegExp => new RegExp(`${word} (DE \\S+ )?${tag}`);

/** The relatório's cabine names, in the device's store. */
async function cabineNames(page: Page, relatorioId: string): Promise<string[]> {
  return (await entities<LocationRow>(page)).filter((record) => record.entity === 'location' && record.row.relatorio_id === relatorioId && record.row.kind === 'cabine' && record.row.removed_at === null).map((record) => record.row.name);
}

/** Generates revision 1 of the relatório from its Sumário, as a person does, and returns its PDF's text. */
async function issueAndReadPdf(page: Page, relatorioId: string): Promise<string> {
  await setParecer(page, relatorioId);
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  const dialog = exportDialog(page);
  await expect(dialog).toBeVisible();
  await dialog.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' }).click();
  await confirmIssue(dialog);
  await expect(toast(page)).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
  await page.keyboard.press('Escape');
  let revisionId = '';
  await expect
    .poll(async () => {
      revisionId = (await entities<{ id: string; relatorio_id: string; number: number }>(page)).find((record) => record.entity === 'revision' && record.row.relatorio_id === relatorioId && record.row.number === 1)?.row.id ?? '';
      return revisionId;
    })
    .not.toBe('');
  const pdf = await page.request.get(`/api/revisions/${revisionId}/pdf`);
  expect(pdf.status()).toBe(200);
  return (await pdfTextItems(new Uint8Array(await pdf.body()))).join(' ');
}

/** The standard template as a company stored it before Story 27.8: its second local still "1° Subsolo". */
function storedBefore(seedVersion: string): TemplateRow {
  const built = standardTemplate({ id: newId(), seedVersion });
  return { ...built, skeleton: built.skeleton.map((node) => (node.ref === 'subsolo-1' ? { ...node, name: '1° Subsolo' } : node)) };
}

/**
 * An older relatório from that stored template, cut to what the words need, as the office pushes it: the section
 * blocks, Cubículo Enel's first surge arrester and the first TP of the grouped 1° Subsolo (its coluna kept), Em campo.
 */
function olderRelatorio(): { relatorioId: string; drafts: OpDraft[] } {
  const projectId = newId();
  const project: OpDraft = {
    kind: 'create',
    scope: 'company',
    company_id: account.companyId,
    project_id: null,
    relatorio_id: null,
    path: `project/${projectId}`,
    value: { id: projectId, client_id: null, name: 'Obra v16', site: 'Obra v16', removed_at: null },
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: account.userId,
  };
  const { relatorioId, drafts } = instantiateTemplate(
    storedBefore(OLDER),
    { id: projectId },
    { service_start: '2026-11-21', service_end: '2026-11-21', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT, tagRule: 'legacy' },
    { newId, actorId: account.userId, companyId: account.companyId },
  );
  const created = <T,>(prefix: string) => drafts.filter((draft) => draft.kind === 'create' && draft.path.startsWith(prefix)).map((draft) => draft.value as unknown as T);
  const locations = created<LocationRow>('location/');
  const blocks = created<BlockRow>('block/');
  const enel = locations.find((location) => location.kind === 'cabine' && location.name === 'Cubículo Enel')!;
  const subsolo = locations.find((location) => location.kind === 'cabine' && location.name === '1° Subsolo')!;
  const underSubsolo = new Set(locations.filter((location) => location.parent_id === subsolo.id).map((location) => location.id));
  const arrester = blocks.find((block) => block.block_type === 'para_raio' && block.location_id === enel.id)!;
  const tp = blocks.find((block) => block.block_type === 'tp' && block.location_id !== null && underSubsolo.has(block.location_id))!;
  const keptLocations = new Set([enel.id, subsolo.id, tp.location_id!]);
  const keptBlocks = new Set([arrester.id, tp.id]);
  const keptEquipment = new Set([arrester.equipment_id!, tp.equipment_id!]);
  const kept = drafts.filter((draft) => {
    if (draft.kind !== 'create') return true;
    const id = (draft.value as { id?: string } | null)?.id ?? '';
    if (draft.path.startsWith('location/')) return keptLocations.has(id);
    if (draft.path.startsWith('block/')) return (draft.value as unknown as BlockRow).location_id === null || keptBlocks.has(id);
    if (draft.path.startsWith('equipment/')) return keptEquipment.has(id);
    return true;
  });
  return { relatorioId, drafts: [project, ...kept, emCampoDraft(account, relatorioId)] };
}

test('@p0 27.8-E2E-001 a new relatório is on v17: a Para-raios ficha with a retightening photo prints "ITEM", "PARA-RAIOS", "1º Subsolo" and "realizados"; a v16 relatório beside it keeps its words', async ({ page }) => {
  test.setTimeout(720_000);
  // The words come from the kernel: the current seed turns Story 27.8's caption rule on, the older one does not.
  expect(seedRule(SEED_VERSION, 'caption_para_raios')).toBe(true);
  expect(seedRule(OLDER, 'caption_para_raios')).toBe(false);
  const label = getDefinition(SEED_VERSION, 'cabine_primaria', 'para_raio').label;
  expect(label).toBe('Para-raios');
  expect(getSeed(SEED_VERSION, 'cabine_primaria').checklist_columns[0]).toBe('ITEM');
  expect(getSeed(OLDER, 'cabine_primaria').checklist_columns[0]).toBe('ÍTEM');
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);

  // --- the new relatório, created as a person creates it, is on the current seed ---
  await createProjectFromHome(page);
  const relatorioId = await createRelatorio(page);
  await expect
    .poll(async () => (await entities<{ seed_version: string }>(page)).find((record) => record.entity === 'relatorio' && record.id === relatorioId)?.row.seed_version)
    .toBe(SEED_VERSION);
  expect(await cabineNames(page, relatorioId)).toContain(STANDARD_SUBSOLO_NAME);
  expect(STANDARD_SUBSOLO_NAME).toBe('1º Subsolo');

  // --- its Para-raios ficha: one photo from the sticky bar's camera ---
  const arrester = await enelArrester(page, relatorioId);
  expect(arrester.block.seed_version).toBe(SEED_VERSION);
  await page.goto(`/relatorio/${relatorioId}/ficha/${arrester.block.id}`);
  await expect(page.locator('.sheet-header .sheet-title')).toContainText(label, { timeout: 30_000 });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Tirar foto', exact: true }).click();
  const view = await expectCameraOpen(page);
  await shoot(page, 1);
  await view.getByRole('button', { name: 'Concluir fotos' }).click();
  await expect(camera(page)).toHaveCount(0, { timeout: 15_000 });
  const photoOf = async () =>
    (await entities<{ id: string; kind: string; block_id: string | null; caption: string | null; removed_at: string | null }>(page)).find(
      (record) => record.entity === 'file' && record.row.kind === 'photo' && record.row.block_id === arrester.block.id && record.row.removed_at === null,
    )?.row;
  await expect.poll(async () => (await photoOf())?.id ?? null, { timeout: 15_000 }).not.toBeNull();
  const photo = (await photoOf())!;
  // The caption the shot is born with names the surge arrester as v17 does.
  expect(photo.caption).toMatch(/\bpara-raios\b/);
  expect(photo.caption).not.toMatch(/para-raio(?!s)/);

  // --- the caption: "limpeza e reaperto" from the composer, its participle "realizados" ---
  await page.goto(`/relatorio/${relatorioId}/fotos`);
  await page.getByRole('button', { name: /^Foto 1, (legenda sugerida, )?abrir$/ }).click();
  const viewer = page.getByRole('dialog', { name: 'Foto 1 de 1' });
  await viewer.getByRole('button', { name: 'Editar legenda' }).click();
  const composer = page.getByRole('dialog', { name: 'Legenda' });
  await composer.getByRole('combobox', { name: 'Atividade' }).fill('limpeza');
  await page.getByRole('option', { name: 'limpeza e reaperto' }).click();
  const caption = ['Detalhe da limpeza e reaperto realizados no para-raios', ...(arrester.tag === '' ? [] : [arrester.tag]), 'do Cubículo Enel'].join(' ');
  await expect(composer.locator('.caption-preview')).toHaveText(caption);
  await composer.getByRole('button', { name: 'Salvar legenda' }).click();
  await expect(page.locator('.caption-composer')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Foto 1 de 1' }).getByText(caption)).toBeVisible();
  await page.keyboard.press('Escape');
  // Committed: the photo row and its one caption put in the outbox.
  await expect.poll(async () => (await photoOf())?.caption).toBe(caption);
  expect((await outbox(database, page)).filter((op) => op.path === `file/${photo.id}/caption`).map((op) => op.value)).toEqual([caption]);

  // --- its PDF: the four words ---
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  const current = await issueAndReadPdf(page, relatorioId);
  expect(current).toContain('ITEM C NC NA OBSERVAÇÕES');
  expect(current).not.toContain('ÍTEM');
  expect(current).toMatch(titleOf('PARA-RAIOS', arrester.tag));
  expect(current).not.toMatch(/PARA-RAIO(?!S)/);
  expect(current).toContain(`TPs e TCs dos Cubículos de MT do ${STANDARD_SUBSOLO_NAME}`);
  expect(current).not.toContain('1° Subsolo');
  expect(current).not.toContain("TP's e TC's");
  // The caption may wrap over lines: compared without its spaces.
  expect(current.replace(/\s+/g, '')).toContain(caption.replace(/\s+/g, ''));

  // --- a v16 relatório beside it, from a template stored before Story 27.8, keeps its words ---
  const older = olderRelatorio();
  await pushDrafts(page, database, older.drafts);
  await page.goto(`/relatorio/${older.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(async () => (await entities<{ seed_version: string }>(page)).find((record) => record.entity === 'relatorio' && record.id === older.relatorioId)?.row.seed_version, { timeout: 30_000 })
    .toBe(OLDER);
  expect(new Set(await cabineNames(page, older.relatorioId))).toEqual(new Set(['Cubículo Enel', '1° Subsolo']));
  const olderArrester = await enelArrester(page, older.relatorioId);
  expect(olderArrester.block.seed_version).toBe(OLDER);
  const previous = await issueAndReadPdf(page, older.relatorioId);
  expect(previous).toContain('ÍTEM C NC NA OBSERVAÇÕES');
  expect(previous).toMatch(titleOf('PARA-RAIO', olderArrester.tag));
  expect(previous).not.toMatch(titleOf('PARA-RAIOS', olderArrester.tag));
  expect(previous).toContain('TPs e TCs dos Cubículos de MT do 1° Subsolo');
  expect(previous).not.toContain(STANDARD_SUBSOLO_NAME);
  expect(previous).not.toContain("TP's e TC's");
});
