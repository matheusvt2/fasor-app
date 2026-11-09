import {
  addDraftField,
  addDraftTest,
  blockTypeLabel,
  companyTypeSecondaryText,
  companyTypesHeading,
  EMPTY_DEFINITION_CONTEXT,
  newEquipmentTypeRow,
  duplicateSeededType,
  plateCriterionOf,
  libraryTypeListRows,
  libraryTypesHeading,
  publishBlockedText,
  publishedText,
  removeDraftEntry,
  retireTypeTitle,
  SEED_VERSION,
  setDraftNoun,
  setDraftText,
  typeDuplicatedText,
  typeEditorTabs,
  updateDraftCriterion,
  updateDraftField,
  updateDraftItem,
  updateDraftMeasurementRow,
  validateTypeDraft,
  type CompanyTypeDraft,
  type EquipmentTypeRow,
  type EquipmentTypeVersionRow,
} from '@app/domain';
import type { Page } from '@playwright/test';
import { companyRow, duplicateLibraryType, editorTab, editorTabLabels, libraryRow, openTypeList, publishButton, scrollsSideways, typeInto, typeRows } from './support/company-type.ts';
import { deviceDatabaseName, expect, horizontalOverflow, signIn, test } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNow } from './support/sync.ts';

/*
 * Story 14.7: Templates › "Tipos de equipamento" and the type editor (`41-templates.html`,
 * `43-tipo-equipamento.html`), driven as a person does. Every expected word, count and draft is
 * the kernel's: each edit the spec makes through the screen is made again with the kernel's own
 * edit (`types/draft-edit.ts`) on the copy "Duplicar" gives, and the device's outbox and store
 * must hold exactly that. Empresa B is this worker's own (E6-Q7) and is reset first.
 *
 * 14.7-E2E-001 (1280): the list (library read-only with "Duplicar" only), "Duplicar" of the CTA,
 * an edit in every tab (name, TAG, noun; a checklist item; a measurement table; the criteria and
 * their sources), the kernel's issue inline with "Publicar" disabled and its reason, publish v1,
 * an edit that opens v2's draft, publish v2, "Aposentar" behind its Confirm, "Reativar" from the
 * list, and the sync; fix batch e22h runs it at 1280, 768 and 390 (the DoD's widths and the
 * phone's tab menu). 14.7-E2E-002 (768): a copy discarded from the list and brought back by
 * "Desfazer", and nothing scrolls sideways on the list or the editor. e22h: 14.7-E2E-003 (S4,
 * N12) the list with a published row and the preview of a measurement table at 390; 14.7-E2E-004
 * (B2) a text typed and a tab tapped, or the editor left, before any blur is in the draft; 14.7-E2E-005 (S1) the
 * Critérios tab of a Quadro elétrico copy shows the plate-picked bands read-only.
 */

interface OutboxRow {
  path: string;
  kind: string;
  value: unknown;
  status: string;
}

const CTA = 'chave_transferencia_automatica' as const;
const toast = (page: Page) => page.getByTestId('toast');
const pill = (page: Page) => page.locator('.tipo-head .status-pill');
const meta = (page: Page) => page.locator('.tipo-head .tipo-meta');
const reason = (page: Page) => page.locator('.sticky-action-bar .btn-reason');
const CTA_LABEL = blockTypeLabel(SEED_VERSION, CTA);

/** The tab labels, auto-retrying on the strip; read once from the phone's menu. */
async function expectTabs(page: Page, labels: string[]): Promise<void> {
  if (await page.locator('.tabs-phone .tab-select-trigger').isVisible()) expect(await editorTabLabels(page)).toEqual(labels);
  else await expect(page.getByRole('tab')).toHaveText(labels);
}

// e22h (S3 of the wave C review): the DoD's flow at 1280 and 768 (both in the gate) and at 390.
const WIDTHS = [
  { width: 1280, height: 900, tag: '@p0' },
  { width: 768, height: 1024, tag: '@p0' },
  { width: 390, height: 844, tag: '@p1' },
] as const;

for (const { width, height, tag } of WIDTHS) {
  test(`${tag} 14.7-E2E-001 at ${width}: a library CTA is duplicated, edited in every tab with the kernel's issue inline and "Publicar" held by it, published as v1, edited and published as v2, retired behind its Confirm and reactivated from the list; outbox and store hold the kernel's draft and versions`, async ({ page, seed }) => {
    test.setTimeout(240_000);
    const account = seed.companies[1];
    const database = deviceDatabaseName(account.userId);
    const outbox = () => readStore<OutboxRow>(page, database, 'outbox');
    const drafts = async (typeId: string) => (await outbox()).filter((op) => op.path === `equipment_type/${typeId}/draft`).map((op) => op.value as CompanyTypeDraft);
    await resetEmpresaB(account);
    await page.setViewportSize({ width, height });
    await signIn(page, account.email);
    await openTypeList(page);

    // --- the list: no company type; the library read-only, "Duplicar" only ---
    const library = libraryTypeListRows(SEED_VERSION);
    await expect(page.getByText(companyTypesHeading(0), { exact: true })).toBeVisible();
    await expect(page.getByText(libraryTypesHeading(library.length), { exact: true })).toBeVisible();
    const libraryList = page.locator('ul[data-group="library-types"] > li');
    await expect(libraryList).toHaveCount(library.length);
    await expect(libraryList.locator('.rr-primary')).toHaveText(library.map((row) => row.name));
    await expect(libraryList.locator('.rr-secondary')).toHaveText(library.map((row) => row.secondary));
    for (const row of library) await expect(libraryRow(page, row.type).getByRole('button')).toHaveText(['Duplicar']);

    // --- "Duplicar" of the CTA: one create, the editor of its draft ---
    const copy = duplicateSeededType(SEED_VERSION, CTA);
    const typeId = await duplicateLibraryType(page, CTA);
    await expect(toast(page)).toHaveText(typeDuplicatedText(copy.draft.label));
    await expect.poll(async () => (await outbox()).filter((op) => op.path === `equipment_type/${typeId}`).map((op) => [op.kind, (op.value as EquipmentTypeRow).derived_from, (op.value as EquipmentTypeRow).draft])).toEqual([
      ['create', { seed_version: SEED_VERSION, block_type: CTA }, copy.draft],
    ]);
    await expect(page.locator('.tipo-head h2')).toHaveText(copy.draft.label);
    await expect(pill(page)).toHaveText('Rascunho');
    await expect(meta(page)).toHaveText(`Editando o rascunho da versão 1 · duplicado de ${CTA_LABEL} (biblioteca)`);
    await expectTabs(page, [...typeEditorTabs(copy.draft, []).map((tab) => tab.label), 'Pré-visualização']);
    await expect(publishButton(page)).toHaveText('Publicar versão 1');

    // --- Identificação: the name, the TAG prefix, the noun and its gender ---
    let expected: CompanyTypeDraft = copy.draft;
    await typeInto(page.getByRole('textbox', { name: 'Nome do tipo' }), 'No-break de comando');
    expected = setDraftText(expected, 'label', 'No-break de comando');
    await typeInto(page.getByRole('textbox', { name: 'Prefixo da TAG' }), 'nb');
    expected = setDraftText(expected, 'tag_prefix', 'nb');
    await expect(page.getByText('TAG sugerida: NB-01, NB-02… · letras maiúsculas e números, até 6')).toBeVisible();
    await typeInto(page.getByRole('textbox', { name: 'Nome no singular' }), 'no-break');
    expected = setDraftNoun(expected, { singular: 'no-break' });
    await typeInto(page.getByRole('textbox', { name: 'Nome no plural' }), 'no-breaks');
    expected = setDraftNoun(expected, { plural: 'no-breaks' });
    await page.getByRole('radio', { name: 'Masculino (o)' }).click();
    expected = setDraftNoun(expected, { gender: 'm' });
    await expect.poll(async () => (await drafts(typeId)).at(-1)).toEqual(expected);

    // --- Placa: a new field, made a list, with its options ---
    await editorTab(page, 'Placa');
    await page.getByRole('button', { name: 'Adicionar campo' }).click();
    const added = addDraftField(expected);
    expected = added.draft;
    const fieldEdit = page.locator('li.def-edit');
    await expect(fieldEdit).toHaveCount(1);
    await typeInto(fieldEdit.getByRole('textbox', { name: 'Rótulo' }), 'Tipo de bateria');
    expected = updateDraftField(expected, added.index, { label: 'Tipo de bateria' });
    await fieldEdit.getByRole('combobox', { name: 'Tipo do campo' }).selectOption({ label: 'Lista' });
    expected = updateDraftField(expected, added.index, { kind: 'select' });
    // A list with no option yet is the kernel's issue, said where the field is edited.
    const listIssue = validateTypeDraft(expected).find((issue) => issue.path[0] === 'nameplate' && issue.path[1] === added.index)!;
    await expect(fieldEdit.locator('[data-type-issue]')).toHaveText([listIssue.message]);
    for (const option of ['Chumbo-ácido', 'Níquel-cádmio']) {
      await fieldEdit.getByRole('textbox', { name: 'Nova opção' }).fill(option);
      await fieldEdit.getByRole('textbox', { name: 'Nova opção' }).press('Enter');
    }
    expected = updateDraftField(expected, added.index, { options: ['Chumbo-ácido', 'Níquel-cádmio'] });
    await expect(fieldEdit.locator('[data-type-issue]')).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Campos da placa' }).locator('li.registry-row.is-open .rr-secondary')).toHaveText('Lista · 2 opções');
    await expect.poll(async () => (await drafts(typeId)).at(-1)).toEqual(expected);

    // --- Verificações: the first item's text ---
    await editorTab(page, 'Verificações');
    const items = page.getByRole('list', { name: 'Itens de verificação' });
    await items.locator('li.registry-row').first().locator('button.rr-text').click();
    const itemText = 'Placa do no-break confere com o projeto';
    await typeInto(page.getByRole('textbox', { name: 'Texto do item' }), itemText);
    expected = updateDraftItem(expected, 0, { label: itemText });
    await expect(items.locator('li.registry-row').first().locator('.rr-primary')).toHaveText(`1. ${itemText}`);

    // --- Ensaios: a measurement table from the format picker, its row named, with a unit ---
    await editorTab(page, 'Ensaios');
    await page.getByRole('button', { name: 'Adicionar ensaio' }).click();
    const picker = page.getByRole('dialog', { name: 'Adicionar ensaio' });
    await expect(picker.getByRole('radio', { name: /^Tabela de medições/ })).toHaveAttribute('aria-checked', 'true');
    await picker.getByRole('button', { name: 'Adicionar' }).click();
    await expect(picker).toHaveCount(0);
    expected = addDraftTest(expected, 'medicoes', SEED_VERSION)!.draft;
    const measurementIndex = (expected.measurement_tests ?? []).length - 1;
    await typeInto(page.getByRole('textbox', { name: 'Linha 1', exact: true }), 'Tensão de saída');
    expected = updateDraftMeasurementRow(expected, measurementIndex, 0, { label: 'Tensão de saída' });
    await typeInto(page.getByRole('textbox', { name: 'Unidade Tensão de saída' }), 'Vcc');
    expected = updateDraftMeasurementRow(expected, measurementIndex, 0, { unit: 'Vcc' });
    await expect.poll(async () => (await drafts(typeId)).at(-1)).toEqual(expected);

    // --- the kernel's issue: the new criterion has no source; "Publicar" is held with the first issue ---
    const issues = validateTypeDraft(expected);
    expect(issues.length).toBeGreaterThan(0);
    await expect(reason(page)).toHaveText(publishBlockedText(issues)!);
    await expect(publishButton(page)).toHaveAttribute('aria-disabled', 'true');
    await expectTabs(page, [...typeEditorTabs(expected, issues).map((tab) => tab.label), 'Pré-visualização']);

    // --- Critérios: the seeded criterion's value raised, the new one ruled "entre" with its source ---
    await editorTab(page, 'Critérios');
    const seeded = copy.draft.criteria[0]!;
    await expect(page.locator(`tr[data-criterion-key="${seeded.key}"] [data-type-issue]`)).toHaveCount(0);
    const rowCriterion = expected.criteria!.at(-1)!;
    const rowName = rowCriterion.label!;
    await expect(page.locator(`tr[data-criterion-key="${rowCriterion.key}"] [data-type-issue]`)).toHaveText(['Informe a fonte do critério.']);
    await typeInto(page.getByRole('textbox', { name: `Valor de ${seeded.label}`, exact: true }), '500');
    expected = updateDraftCriterion(expected, 0, { value: 500 });
    const rowIndex = expected.criteria!.length - 1;
    await page.getByRole('combobox', { name: `Regra de ${rowName}` }).selectOption({ label: 'entre' });
    expected = updateDraftCriterion(expected, rowIndex, { operator: 'between' });
    await typeInto(page.getByRole('textbox', { name: `Valor de ${rowName}`, exact: true }), '120');
    expected = updateDraftCriterion(expected, rowIndex, { value: 120 });
    await typeInto(page.getByRole('textbox', { name: `Valor máximo de ${rowName}` }), '130');
    expected = updateDraftCriterion(expected, rowIndex, { value_max: 130 });
    await typeInto(page.getByRole('textbox', { name: `Fonte de ${rowName}`, exact: true }), 'Manual do fabricante');
    expected = updateDraftCriterion(expected, rowIndex, { source_name: 'Manual do fabricante' });
    await expect.poll(async () => (await drafts(typeId)).at(-1)).toEqual(expected);
    expect(validateTypeDraft(expected)).toEqual([]);
    await expect(page.locator('[data-type-issue]')).toHaveCount(0);
    await expect(reason(page)).toHaveCount(0);

    // --- Pré-visualização: the sheet as the field sees it, never saved ---
    const before = (await outbox()).length;
    await editorTab(page, 'Pré-visualização');
    const preview = page.locator('.preview-frame');
    await expect(preview.locator('h2')).toHaveText('NB-01 · No-break de comando');
    await expect(preview.locator('li.checklist-row').first()).toContainText(itemText);
    await preview.locator('li.checklist-row').first().getByRole('radio', { name: 'Conforme', exact: true }).click();
    await expect(preview.getByRole('table', { name: 'Tabela de medições' }).locator('td.cell-point')).toHaveText(['Tensão de saída']);
    expect(await scrollsSideways(page), 'the preview').toBe(false);
    expect((await outbox()).length).toBe(before);

    // --- Publicar versão 1: one version create holding the draft; the draft is cleared ---
    await publishButton(page).click();
    await expect(toast(page)).toHaveText(publishedText(1));
    await expect(pill(page)).toHaveText('Publicado · versão 1');
    await expect.poll(async () => (await typeRows<EquipmentTypeRow, EquipmentTypeVersionRow>(page, database, typeId)).versions.map((row) => [row.version, row.definition])).toEqual([[1, expected]]);
    await expect.poll(async () => (await typeRows<EquipmentTypeRow, EquipmentTypeVersionRow>(page, database, typeId)).type).toMatchObject({ latest_version: 1, draft: null });
    await expect(meta(page)).toHaveText(`Versão 1 publicada, sem rascunho aberto · duplicado de ${CTA_LABEL} (biblioteca)`);
    await expect(reason(page)).toHaveText('Nada a publicar: edite o tipo para abrir o rascunho da próxima versão.');
    await expect(publishButton(page)).toHaveText('Publicar versão 2');

    // --- an edit after the publish opens version 2's draft; publishing it makes v2 ---
    await editorTab(page, 'Identificação');
    await typeInto(page.getByRole('textbox', { name: 'Nome do tipo' }), 'No-break de comando 125 V');
    const v2 = setDraftText(expected, 'label', 'No-break de comando 125 V');
    await expect(meta(page)).toHaveText(`Editando o rascunho da versão 2 · duplicado de ${CTA_LABEL} (biblioteca)`);
    await expect(pill(page)).toHaveText('Publicado · versão 1');
    await expect.poll(async () => (await drafts(typeId)).at(-1)).toEqual(v2);
    await publishButton(page).click();
    await expect(toast(page)).toHaveText(publishedText(2));
    await expect(pill(page)).toHaveText('Publicado · versão 2');
    await expect.poll(async () => (await typeRows<EquipmentTypeRow, EquipmentTypeVersionRow>(page, database, typeId)).versions.map((row) => [row.version, row.definition.label])).toEqual([
      [1, 'No-break de comando'],
      [2, 'No-break de comando 125 V'],
    ]);

    // --- "Aposentar" behind its Confirm; the type keeps its versions ---
    await page.locator('.sticky-action-bar').getByRole('button', { name: 'Aposentar' }).click();
    const confirm = page.getByRole('alertdialog', { name: retireTypeTitle('No-break de comando 125 V') }).or(page.getByRole('dialog', { name: retireTypeTitle('No-break de comando 125 V') }));
    await confirm.getByRole('button', { name: 'Aposentar' }).click();
    await expect(pill(page)).toHaveText('Aposentado · versão 2');
    await expect(toast(page)).toContainText('Tipo aposentado · fora das paletas');
    await expect.poll(async () => (await outbox()).filter((op) => op.path === `equipment_type/${typeId}/retired_at`).map((op) => typeof op.value)).toEqual(['string']);

    // --- the list: the retired type with "Reativar"; reactivated, it is published again ---
    await page.locator('.sticky-action-bar').getByRole('button', { name: 'Voltar aos tipos' }).click();
    await expect(page).toHaveURL(/\/templates$/);
    const row = companyRow(page, typeId);
    await expect(page.getByText(companyTypesHeading(1), { exact: true })).toBeVisible();
    await expect(row.locator('.status-pill')).toHaveText('Aposentado · versão 2');
    await expect(row.locator('.rr-actions').getByRole('button')).toHaveText(['Reativar', 'Duplicar']);
    await row.getByRole('button', { name: 'Reativar' }).click();
    await expect(toast(page)).toHaveText('Tipo reativado · volta para as paletas');
    await expect(row.locator('.status-pill')).toHaveText('Publicado · versão 2');
    await expect(row.locator('.rr-actions').getByRole('button')).toHaveText(['Editar', 'Duplicar', 'Aposentar']);
    await expect(row.locator('.rr-secondary')).toHaveText(`TAG NB · duplicado de ${CTA_LABEL}`);
    expect(await scrollsSideways(page), 'the list with a published row').toBe(false);

    // --- the sync lands every op; the device keeps the type ---
    await syncNow(page);
    // Every op of the type was accepted: none is still waiting and none was refused.
    await expect.poll(async () => [...new Set((await outbox()).filter((op) => op.path.startsWith('equipment_type')).map((op) => op.status))]).toEqual(['acked']);
    // "Sincronizar agora" leaves the tab on Sync status: back to the list, reloaded from the device store.
    await openTypeList(page);
    await page.reload();
    await expect(companyRow(page, typeId).locator('.status-pill')).toHaveText('Publicado · versão 2', { timeout: 30_000 });
  });
}

test('@p0 14.7-E2E-002 at 768: a never-published copy is discarded from the list and comes back with "Desfazer"; neither the list nor the editor scrolls sideways', async ({ page, seed }) => {
  test.setTimeout(150_000);
  const account = seed.companies[1];
  await resetEmpresaB(account);
  await page.setViewportSize({ width: 768, height: 1024 });
  await signIn(page, account.email);
  await openTypeList(page);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  const copy = duplicateSeededType(SEED_VERSION, 'disjuntor_mt');
  const typeId = await duplicateLibraryType(page, 'disjuntor_mt');
  await expect(page.locator('.tipo-head h2')).toHaveText(copy.draft.label);
  for (const word of ['Identificação', 'Placa', 'Verificações', 'Ensaios', 'Critérios', 'Pré-visualização']) {
    await editorTab(page, word);
    expect(await horizontalOverflow(page), word).toBeLessThanOrEqual(0);
  }
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Voltar aos tipos' }).click();
  const row = companyRow(page, typeId);
  await expect(row.locator('.status-pill')).toHaveText('Rascunho');
  await expect(row.locator('.rr-secondary')).toHaveText(companyTypeSecondaryText(newEquipmentTypeRow(typeId, copy), EMPTY_DEFINITION_CONTEXT));
  await expect(row.locator('.rr-actions').getByRole('button')).toHaveText(['Editar', 'Descartar rascunho']);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await row.getByRole('button', { name: 'Descartar rascunho' }).click();
  await expect(toast(page)).toContainText('Rascunho descartado');
  await expect(row).toHaveCount(0);
  await expect(page.getByText(companyTypesHeading(0), { exact: true })).toBeVisible();
  await toast(page).getByRole('button', { name: 'Desfazer' }).click();
  await expect(row.locator('.status-pill')).toHaveText('Rascunho');
  await expect(page.getByText(companyTypesHeading(1), { exact: true })).toBeVisible();
});

test('@p0 14.7-E2E-003 at 390 (e22h S4, N12): neither the type list with a published row nor the preview of a measurement table scrolls sideways', async ({ page, seed }) => {
  test.setTimeout(150_000);
  const account = seed.companies[1];
  const database = deviceDatabaseName(account.userId);
  await resetEmpresaB(account);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, account.email);
  await openTypeList(page);
  expect(await scrollsSideways(page), 'the library list').toBe(false);

  // The CTA's copy publishes as it is (the kernel names no issue) and has a measurement table.
  const copy = duplicateSeededType(SEED_VERSION, CTA);
  expect(validateTypeDraft(copy.draft)).toEqual([]);
  const typeId = await duplicateLibraryType(page, CTA);
  await editorTab(page, 'Pré-visualização');
  await expect(page.locator('.preview-frame table.measurement-table').first()).toBeVisible();
  expect(await scrollsSideways(page), 'the preview').toBe(false);
  await publishButton(page).click();
  await expect(pill(page)).toHaveText('Publicado · versão 1');
  await expect.poll(async () => (await typeRows<EquipmentTypeRow, EquipmentTypeVersionRow>(page, database, typeId)).versions.map((row) => row.version)).toEqual([1]);

  // The published row holds Editar · Duplicar · Aposentar: they wrap under its text.
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Voltar aos tipos' }).click();
  const row = companyRow(page, typeId);
  await expect(row.locator('.rr-actions').getByRole('button')).toHaveText(['Editar', 'Duplicar', 'Aposentar']);
  expect(await scrollsSideways(page), 'the list with a published row').toBe(false);
  const box = await row.boundingBox();
  for (const button of await row.locator('.rr-actions').getByRole('button').all()) {
    const at = (await button.boundingBox())!;
    expect(at.x + at.width, 'an action inside its row').toBeLessThanOrEqual(box!.x + box!.width + 0.5);
  }
});

test('@p0 14.7-E2E-004 (e22h B2): a text typed and a tab tapped before any blur is kept on screen and in the draft, for a text and a number field', async ({ page, seed }) => {
  test.setTimeout(150_000);
  const account = seed.companies[1];
  const database = deviceDatabaseName(account.userId);
  const outbox = () => readStore<OutboxRow>(page, database, 'outbox');
  const drafts = async (typeId: string) => (await outbox()).filter((op) => op.path === `equipment_type/${typeId}/draft`).map((op) => op.value as CompanyTypeDraft);
  await resetEmpresaB(account);
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  await openTypeList(page);
  const copy = duplicateSeededType(SEED_VERSION, CTA);
  const typeId = await duplicateLibraryType(page, CTA);

  // Identificação: typed with real keystrokes, no Tab and no Enter, then another tab is tapped.
  const name = page.getByRole('textbox', { name: 'Nome do tipo' });
  await name.click();
  await name.press('ControlOrMeta+a');
  await name.pressSequentially('QGBT da empresa');
  await page.getByRole('tab', { name: /^Critérios/ }).click();
  let expected = setDraftText(copy.draft, 'label', 'QGBT da empresa');
  await expect.poll(async () => (await drafts(typeId)).at(-1)).toEqual(expected);
  await editorTab(page, 'Identificação');
  await expect(page.getByRole('textbox', { name: 'Nome do tipo' })).toHaveValue('QGBT da empresa');
  await expect(page.locator('.tipo-head h2')).toHaveText('QGBT da empresa');

  // Critérios: a value typed, then the Pré-visualização tab tapped.
  await editorTab(page, 'Critérios');
  const criterion = copy.draft.criteria[0]!;
  const value = page.getByRole('textbox', { name: `Valor de ${criterion.label}`, exact: true });
  await value.click();
  await value.fill('750');
  await page.getByRole('tab', { name: 'Pré-visualização' }).click();
  expected = updateDraftCriterion(expected, 0, { value: 750 });
  await expect.poll(async () => (await drafts(typeId)).at(-1)).toEqual(expected);
  await editorTab(page, 'Critérios');
  await expect(page.getByRole('textbox', { name: `Valor de ${criterion.label}`, exact: true })).toHaveValue('750');

  // An unchanged field left by a tab tap writes nothing.
  const count = (await drafts(typeId)).length;
  await editorTab(page, 'Identificação');
  await page.getByRole('textbox', { name: 'Nome do tipo' }).click();
  await page.getByRole('tab', { name: /^Placa/ }).click();
  await editorTab(page, 'Identificação');
  expect((await drafts(typeId)).length).toBe(count);

  // The unmount half (review e22h gap 8): typed with real keystrokes, then the editor is left (back to the list) before any blur.
  const renamed = page.getByRole('textbox', { name: 'Nome do tipo' });
  await renamed.click();
  await renamed.press('ControlOrMeta+a');
  await renamed.pressSequentially('QGBT deixado');
  await page.goBack();
  await expect(page.getByRole('heading', { level: 2, name: 'Tipos de equipamento' })).toBeVisible();
  expected = setDraftText(expected, 'label', 'QGBT deixado');
  await expect.poll(async () => (await drafts(typeId)).at(-1)).toEqual(expected);
  // The stored type row holds the draft too (the outbox's last write landed).
  await expect.poll(async () => (await typeRows<EquipmentTypeRow, EquipmentTypeVersionRow>(page, database, typeId)).type?.draft).toEqual(expected);
});

test('@p0 14.7-E2E-005 (e22h S1): the Critérios tab of a Quadro elétrico copy shows the bands the plate picks, read-only, and offers no edit that would judge nothing', async ({ page, seed }) => {
  test.setTimeout(120_000);
  const account = seed.companies[1];
  await resetEmpresaB(account);
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  await openTypeList(page);
  const copy = duplicateSeededType(SEED_VERSION, 'quadro_eletrico');
  // The copy carries the source's bands and publishes as it is.
  expect(copy.draft.tests.some((entry) => entry.criterion_bands !== undefined)).toBe(true);
  expect(validateTypeDraft(copy.draft)).toEqual([]);
  await duplicateLibraryType(page, 'quadro_eletrico');
  await editorTab(page, 'Critérios');
  const key = copy.draft.tests.find((entry) => entry.criterion_bands !== undefined)!.criterion_key;
  const index = copy.draft.criteria.findIndex((criterion) => criterion.key === key);
  const view = plateCriterionOf(copy.draft, index)!;
  expect(view.rowJudges).toBe(false);
  const row = page.locator(`tr[data-criterion-key="${key}"]`);
  await expect(row).toHaveAttribute('data-plate-picked', '');
  const plate = row.locator('[data-plate-criterion]');
  await expect(plate.locator(':scope > .helper').first()).toHaveText(view.lead);
  await expect(plate.locator('.plate-lines > li')).toHaveText(view.lines);
  await expect(plate.locator(':scope > .helper').last()).toHaveText(view.rowNote);
  // Read-only: no rule picker, no value, no source input on the row the plate overrides.
  await expect(row.getByRole('combobox')).toHaveCount(0);
  await expect(row.getByRole('textbox')).toHaveCount(0);
  await expect(publishButton(page)).toHaveText('Publicar versão 1');
  await expect(reason(page)).toHaveCount(0);
});

test('@p0 23g-E2E-002 (fix batch e23g, R2-2): a copy of the v13 transformer loses TAPS, TEMPERATURA DO ENROLAMENTO and CLASSE TÉRMICA through "Remover" and still publishes: no reason, no rows_from, no pick_from, no dry_fields', async ({ page, seed }) => {
  test.setTimeout(150_000);
  const account = seed.companies[1];
  const database = deviceDatabaseName(account.userId);
  await resetEmpresaB(account);
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  await openTypeList(page);
  const copy = duplicateSeededType(SEED_VERSION, 'transformador_forca');
  const typeId = await duplicateLibraryType(page, 'transformador_forca');
  await expect(page.locator('.tipo-head h2')).toHaveText(copy.draft.label);
  await editorTab(page, 'Placa');
  const storedDraft = async () => (await typeRows<EquipmentTypeRow, EquipmentTypeVersionRow>(page, database, typeId)).type?.draft ?? null;

  // Each removal through the row menu, as a person does; the stored draft is the kernel's removal of the same field.
  let expected: CompanyTypeDraft = copy.draft;
  for (const label of ['TAPS', 'TEMPERATURA DO ENROLAMENTO', 'CLASSE TÉRMICA']) {
    const index = (expected.nameplate ?? []).findIndex((entry) => entry.label === label);
    expect(index, label).toBeGreaterThanOrEqual(0);
    expected = removeDraftEntry(expected, 'nameplate', index);
    await page.getByRole('button', { name: `Mais opções de ${label}`, exact: true }).click();
    await page.getByRole('menuitem', { name: 'Remover' }).click();
    await expect(page.locator('.registry-row .rr-primary').filter({ hasText: new RegExp(`^${label}$`) })).toHaveCount(0);
    await expect.poll(storedDraft, { message: label }).toEqual(expected);
  }

  // The stored draft names none of the removed fields and validates.
  const draft = (await storedDraft())!;
  const json = JSON.stringify(draft);
  expect(json).not.toContain('"rows_from"');
  expect(json).not.toContain('"pick_from"');
  expect(json).not.toContain('"dry_fields"');
  expect(validateTypeDraft(draft)).toEqual([]);
  await expect(reason(page)).toHaveCount(0);
  await expect(publishButton(page)).toHaveText('Publicar versão 1');
  await expect(publishButton(page)).not.toHaveAttribute('aria-disabled', 'true');
});
