import {
  blockDefinitionIn,
  composeParecer,
  EMPTY_DEFINITION_CONTEXT,
  findingClauses,
  getDefinition,
  instantiateTemplate,
  resultsItemsText,
  SEED_VERSION,
  snapshotDefinitionContext,
  standardTemplate,
  visitContextOf,
  type BlockRow,
  type FieldDef,
  type JsonValue,
  type OpDraft,
} from '@app/domain';
import type { Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { extractStructure, readZipEntries } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { escapeDialog } from './support/dialogs.ts';
import { deviceSnapshot, openStep, outbox, typeCell } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { confirmIssue } from './support/relatorio-flow.ts';
import { emCampoDraft, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNowAndReturn } from './support/sync.ts';

/*
 * Story 24.4 (batch e24a, seed v14; Bruno's answer 28, Matheus's decision 5), driven as a person does at
 * 1280 px on new v14 relatórios. 24.4-E2E-001: a breaker's contact reading typed out of its criterion
 * makes it Reprovado; Etapa 6's band and the issued DOCX's section 10 name it with its finding, in the
 * words of its conclusion in section 9, and section 8 holds nothing of it (no point was created).
 * 24.4-E2E-002: a cable's NC observation typed in two lines enters its conclusion on one line, and the
 * template's own Conclusão text with "8 e 9" in bold reads the results' positions (4 and 5: the
 * template carries no sections 3 to 6), with no "8 e 9" left. Every expected word is the kernel's over
 * the device's own rows (E12-A6). Both issue a revision, so the file runs in the `queue` lane.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const JOB_TIMEOUT = 150_000;
const sumario = (page: Page) => page.getByRole('list', { name: 'Sumário do relatório' });
const toast = (page: Page) => page.getByTestId('toast');
const observationField = (page: Page) => page.getByLabel('Observações da ficha', { exact: true });

/** The template's own Conclusão text (Story 11.4's markup): FO.SERV-03's three items, their "8 e 9" in bold. */
const OWN_CONCLUSAO = [
  '- Foram realizados os ensaios elétricos e mecânicos (acionamentos) nos equipamentos pertinentes às Subestações de Proteção (Primária), Distribuição e de Transformação;',
  '- Todos os resultados dos testes aplicados nos equipamentos das subestações e as observações e particularidades pertinentes a cada equipamento objeto desta manutenção preventiva encontram-se nos itens **8 e 9** deste relatório;',
  '- Apesar dos resultados dos testes serem positivos para a continuidade de operação das SE’s, sugerimos que as observações dos relatórios e dos pontos críticos constantes nos itens **8 e 9** deste sejam atendidas.',
].join('\n');

/** A plate value by kind; a select takes its first option. */
function plateValue(field: FieldDef, n: number): JsonValue {
  switch (field.kind) {
    case 'text':
      return `E24A-${n + 1}`;
    case 'manufacturer':
      return 'Fabricante E2E';
    case 'number':
      return { raw: String(100 + n * 10), unit: field.unit ?? null, state: 'measured' };
    case 'date':
      return '2020-03-15';
    case 'voltage_class':
      return '15';
    case 'select':
      return field.options![0]!;
  }
}

interface Sheet {
  relatorioId: string;
  blockId: string;
  tag: string;
}

/**
 * A new v14 relatório of the standard template (`ownConclusao`: its Conclusão text the template's own, and
 * no sections 3 to 6), Em campo, its first sheet of `type` with the plate (and, unless `checklist` says
 * otherwise, every row Conforme) from the office.
 */
async function setUp(page: Page, type: string, options: { ownConclusao?: boolean; checklist?: (key: string, n: number) => string | null } = {}): Promise<Sheet> {
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const base = standardTemplate({ id: newId() });
  const template =
    options.ownConclusao === true
      ? {
          ...base,
          blocks: base.blocks
            .filter((block) => !['section_3', 'section_4', 'section_5', 'section_6'].includes(block.block_type))
            .map((block) => (block.block_type === 'section_10' ? { ...block, section_text: OWN_CONCLUSAO } : block)),
        }
      : base;
  const projectId = newId();
  const project: OpDraft = {
    kind: 'create',
    scope: 'company',
    company_id: account.companyId,
    project_id: null,
    relatorio_id: null,
    path: `project/${projectId}`,
    value: { id: projectId, client_id: null, name: 'Obra e24a', site: 'Obra e24a', removed_at: null },
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: account.userId,
  };
  const { relatorioId, drafts } = instantiateTemplate(
    template,
    { id: projectId },
    { service_start: '2026-11-10', service_end: '2026-11-11', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
    { newId, actorId: account.userId, companyId: account.companyId },
  );
  const created = (prefix: string) => drafts.filter((draft) => draft.kind === 'create' && draft.path.startsWith(prefix)).map((draft) => draft.value as Record<string, unknown>);
  const block = created('block/').find((row) => row.block_type === type)!;
  const tag = created('equipment/').find((row) => row.id === block.equipment_id)!.tag as string;
  const definition = getDefinition(SEED_VERSION, 'cabine_primaria', type);
  const scope = { relatorioId };
  const checklistOf = options.checklist ?? (() => 'C');
  await pushDrafts(page, database, [
    project,
    ...drafts,
    emCampoDraft(account, relatorioId),
    ...definition.nameplate.map((field, n) => officeDraft(account, scope, `sheet/${block.id as string}/nameplate/${field.key}`, plateValue(field, n))),
    ...definition.checklist!.flatMap((item, n) => {
      const result = checklistOf(item.key, n);
      return result === null ? [] : [officeDraft(account, scope, `sheet/${block.id as string}/checklist/${item.key}/result`, result)];
    }),
  ]);
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(sumario(page).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  return { relatorioId, blockId: block.id as string, tag };
}

/** Issues revision 1 through the Export dialog; its DOCX's structure and document.xml. */
async function issue(page: Page, relatorioId: string): Promise<{ structure: ReturnType<typeof extractStructure>; xml: string }> {
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(sumario(page)).toBeVisible({ timeout: 30_000 });
  await syncNowAndReturn(page);
  const dialog = page.getByRole('dialog', { name: 'Gerar relatório' });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await expect(dialog).toBeVisible();
  const generate = dialog.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' });
  await expect(generate).toBeEnabled({ timeout: 30_000 });
  await generate.click();
  await confirmIssue(dialog);
  await expect(toast(page)).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
  await escapeDialog(page, dialog);
  const revision = (await readStore<{ entity: string; row: { id: string; number: number } }>(page, database, 'entities')).find((record) => record.entity === 'revision' && record.row.number === 1)!;
  const response = await page.request.get(`/api/revisions/${revision.row.id}/docx`);
  expect(response.status()).toBe(200);
  const docx = Buffer.from(await response.body());
  return { structure: extractStructure(docx), xml: readZipEntries(docx).get('word/document.xml')!.toString('utf8') };
}

/** The sheet's findings and the relatório's composed summary, the kernel's over the device's rows. */
async function kernelOf(page: Page, sheet: Sheet): Promise<{ findings: string[]; parecer: string; reference: string }> {
  const snapshot = await deviceSnapshot(page, database, sheet.relatorioId);
  const block = snapshot.blocks.find((row) => row.id === sheet.blockId)! as BlockRow;
  const definition = blockDefinitionIn(snapshotDefinitionContext(snapshot), block)!;
  return { findings: findingClauses(block, definition, visitContextOf(snapshot, block)), parecer: composeParecer(snapshot).text, reference: resultsItemsText(snapshot) };
}

test('@p0 24.4-E2E-001 a v14 breaker\'s contact reading out of its criterion: Etapa 6 and the DOCX\'s section 10 name it with its finding, the same finding stands in its section 9 conclusion, and section 8 holds nothing of it', async ({ page }) => {
  test.setTimeout(420_000);
  const breaker = await setUp(page, 'disjuntor_mt');
  await openStep(page, breaker.relatorioId, breaker.blockId, 'Ensaios');
  for (const [row, value] of ['310', '200', '205'].entries()) await typeCell(page, database, breaker.blockId, 'resistencia_contato', row, 0, value);

  // The conclusion set by the preview row's Confirmar (Reprovado alone, Story 24.5) and its composed text confirmed.
  await openStep(page, breaker.relatorioId, breaker.blockId, 'Conclusão');
  const suggestion = page.getByRole('group', { name: 'Prévia da conclusão' });
  await expect(suggestion).toContainText('Reprovado?');
  await suggestion.getByRole('button', { name: 'Confirmar' }).click();
  await expect.poll(async () => (await outbox(database, page)).filter((op) => op.path === `sheet/${breaker.blockId}/conclusion/result`).at(-1)?.value).toBe('reprovado');
  await observationField(page).fill('Contato do polo A acima do aceitável.');
  await observationField(page).press('Tab');
  await page.locator('.ficha-conc-text .suggestion-field.is-generated').getByRole('button', { name: 'Confirmar' }).click();
  await expect.poll(async () => (await outbox(database, page)).filter((op) => op.path === `sheet/${breaker.blockId}/conclusion/text_status`).at(-1)?.value).toBe('confirmed');

  const kernel = await kernelOf(page, breaker);
  expect(kernel.findings).toHaveLength(1);
  const finding = kernel.findings[0]!;
  expect(finding).toMatch(/^resistência de contato máxima de 310 µΩ em .+ \(critério: <250 µΩ, aceitável na ficha\)$/);
  const sentence = `1 ficha foi reprovada: ${breaker.tag}, por ${finding}.`;
  expect(kernel.parecer).toContain(sentence);
  const conclusionText = String((await outbox(database, page)).filter((op) => op.path === `sheet/${breaker.blockId}/conclusion/text`).at(-1)?.value);
  expect(conclusionText).toContain(finding);

  // Etapa 6: Não apto, and the composed summary names the breaker with its finding.
  await page.goto(`/relatorio/${breaker.relatorioId}/setup?etapa=6`);
  await expect(page.getByRole('heading', { level: 2, name: 'Etapa 6 — Conclusão e parecer' })).toBeFocused({ timeout: 30_000 });
  await expect(page.getByRole('radiogroup', { name: 'Parecer' }).getByRole('radio', { name: 'Não apto', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.suggestion-field.is-generated .generated-text')).toContainText(sentence);

  // The DOCX: the Parecer box Não apto with the sentence, the finding in section 9's conclusion, and nowhere else (section 8 is empty of it).
  const { structure } = await issue(page, breaker.relatorioId);
  const box = structure.tables.find((table) => table.length === 1 && table[0]!.length === 1 && table[0]![0]!.startsWith('Não apto\n'));
  expect(box, 'the Parecer box').toBeDefined();
  expect(box![0]![0]).toContain(sentence);
  const conclusion = structure.tables.find((rows) => rows[0]?.[0] === 'CONCLUSÃO' && (rows[2]?.[0] ?? '').includes(breaker.tag));
  expect(conclusion![1]).toEqual(['APROVADO', '', 'REPROVADO', 'X', 'SEM RESTRIÇÕES', '', 'COM RESTRIÇÕES (VER OBSERVAÇÕES)', '']);
  expect(conclusion![2]![0]).toContain(finding);
  expect(structure.paragraphs.filter((paragraph) => paragraph.includes(finding))).toHaveLength(2);
  expect(structure.paragraphs.some((paragraph) => paragraph.startsWith('Apesar dos resultados dos testes serem positivos'))).toBe(false);
});

test('@p1 24.4-E2E-002 a v14 NC observation typed in two lines prints its conclusion on one line, and the template\'s bold "8 e 9" reads the results\' positions 4 and 5', async ({ page }) => {
  test.setTimeout(420_000);
  // The cable's second item left for the technician; every other row Conforme from the office.
  const cable = await setUp(page, 'cabos_saida', { ownConclusao: true, checklist: (_key, n) => (n === 1 ? null : 'C') });
  await openStep(page, cable.relatorioId, cable.blockId, 'Ensaios');
  for (const row of [0, 1, 2, 3]) await typeCell(page, database, cable.blockId, 'isolacao', row, 1, '1000M');

  // The item NC, its observation typed in two lines.
  await page.goto(`/relatorio/${cable.relatorioId}/ficha/${cable.blockId}`);
  const item = page.locator('#ficha-step-verificacoes li.checklist-row').nth(1);
  await item.scrollIntoViewIfNeeded();
  await item.getByRole('radio', { name: 'Não conforme' }).click();
  const observation = page.getByLabel('Observação do item 2', { exact: true });
  await observation.fill('Mufla com sinais de aquecimento\nVerificar na próxima visita');
  await observation.blur();
  const definition = getDefinition(SEED_VERSION, 'cabine_primaria', 'cabos_saida');
  const itemKey = definition.checklist![1]!.key;
  await expect.poll(async () => (await outbox(database, page)).filter((op) => op.path === `sheet/${cable.blockId}/checklist/${itemKey}/observation`).at(-1)?.value).toBe('Mufla com sinais de aquecimento\nVerificar na próxima visita');

  // Concluded at its floor (the NC row: Aprovado · Com restrições), with OBSERVAÇÕES typed.
  await openStep(page, cable.relatorioId, cable.blockId, 'Conclusão');
  // Story 25.2: the suggested text reads as text, no longer a textbox.
  await expect(page.locator('.ficha-conc-text .generated-text')).toContainText('Mufla com sinais de aquecimento; Verificar na próxima visita (item 2, NC)');
  await observationField(page).fill('Mufla a acompanhar.');
  await observationField(page).press('Tab');
  await page.getByRole('button', { name: `Mais opções da ficha ${cable.tag}` }).click();
  await page.getByRole('menuitem', { name: 'Concluir ficha' }).click();
  await expect(toast(page)).toContainText('Ficha concluída');

  const kernel = await kernelOf(page, cable);
  expect(kernel.reference).toBe('nos itens 4 e 5');

  // The DOCX: the conclusion in one paragraph with the lines joined; the bullets read the positions, no "8 e 9", no bold run of it.
  const { structure, xml } = await issue(page, cable.relatorioId);
  const conclusion = structure.tables.find((rows) => rows[0]?.[0] === 'CONCLUSÃO' && (rows[2]?.[0] ?? '').startsWith(`Os cabos de saída ${cable.tag}`));
  expect(conclusion, 'the cable\'s CONCLUSÃO').toBeDefined();
  expect(conclusion![2]![0]).toContain('Mufla com sinais de aquecimento; Verificar na próxima visita (item 2, NC)');
  expect(conclusion![2]![0]).not.toContain('\n');
  expect(structure.paragraphs.some((paragraph) => paragraph.includes(`encontram-se ${kernel.reference} deste relatório;`))).toBe(true);
  expect(structure.paragraphs.some((paragraph) => paragraph.includes(`constantes ${kernel.reference} deste sejam atendidas.`))).toBe(true);
  expect(structure.paragraphs.some((paragraph) => paragraph.includes('8 e 9'))).toBe(false);
  expect(/<w:t(?:\s[^>]*)?>8 e 9<\/w:t>/.test(xml)).toBe(false);
});
