import { formatServiceDates, MARK_SENT_LABEL, NC_CAPTION_LEAD, noSearchMatchText, photoToken, SEED_VERSION, siteItems, STANDARD_TEMPLATE_NAME, type PointRow } from '@app/domain';
import type { Page } from '@playwright/test';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { devicePhotos, expectCameraOpen, shoot } from './support/photos.ts';
import { CLIENT, createProjectFromHome, createRelatorio } from './support/relatorio-flow.ts';
import { emCampoDraft, newRelatorioDrafts, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Story 27.9 (F29 to F40, the manual pass of 2026-11-21): the wording pass on the screens where each sentence shows,
 * as a person meets them on a new relatório (seed v17, read from the kernel). Spec 27.9-E2E-001.
 *
 *   - Home › "Novo relatório": the place is "Obra"; the Project's meta says "Obra"; the type note "Único tipo
 *     disponível nesta versão" is gone; the dates read "Início/Fim da execução" (F38, F39).
 *   - Dados do relatório › Etapa 5: "Altitude do local" (F39).
 *   - Sumário: "0 NC abertas", then "1 NC aberta" (F32); the Controle row "preenchido automaticamente" (F39).
 *   - Templates: the line has no "Semente vN" (F39).
 *   - Home search: the template name and the card's dates match; with a tile pressed and the match in another status,
 *     the message names the tile and the count (F29).
 *   - Verificações do local: two quick phrases join "…, sem iluminação…" (F36); the NC item's photo is born "Não
 *     conformidade em …" (F40); the point started from it ends ", conforme Imagem 1" on screen and in the store (F36).
 *   - Registro fotográfico: the first filter chip reads "Todas" (F33).
 */

test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['camera'],
});

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  // This worker's Empresa B (E6-Q7): its company, its user and its device database.
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const sumario = (page: Page) => page.getByRole('list', { name: 'Sumário do relatório' });
const row = (page: Page, itemKey: string) => page.locator(`li.checklist-row[data-item-key="${itemKey}"]`);
const EMERGENCIA = siteItems(SEED_VERSION).find((item) => item.label.startsWith('Iluminação de emergência'))!;
const ENEL = 'Cubículo Enel';

interface RelatorioRecord {
  entity: string;
  row: { id: string; seed_version: string; setup: { service_start: string | null; service_end: string | null } };
}

test('@p1 27.9-E2E-001 the words of a new relatório: Obra, execução, Altitude do local, NC abertas, preenchido automaticamente, no seed version, and the Home search by template, date and another status', async ({ page }) => {
  test.setTimeout(240_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);

  // Home › "Novo relatório": "Obra" (the helper picks the combobox by that name), then the Project's meta.
  await createProjectFromHome(page);
  await expect(page.locator('.project-meta dt')).toContainText(['Cliente', 'Obra']);
  await expect(page.locator('.project-meta')).not.toContainText('Obra / local');

  // The Project's "Novo relatório" dialog: no type note; the dates read "execução" (asserted by `createRelatorio`).
  const dialog = page.getByRole('dialog', { name: 'Novo relatório — tipo e datas', exact: true });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByText(/Único tipo disponível/)).toHaveCount(0);
  await expect(dialog.getByText('Início da parada')).toHaveCount(0);
  const relatorioId = await createRelatorio(page, {
    whileOnSetup: async () => {
      // Etapa 1: the place reads "Obra", the dates "execução".
      await expect(page.locator('.field-label', { hasText: /^Obra$/ })).toBeVisible();
      await expect(page.locator('.field-label', { hasText: 'Local (obra)' })).toHaveCount(0);
      await expect(page.getByRole('group', { name: 'Início da execução' })).toBeVisible();
    },
  });

  // The committed relatório: born on the kernel's current seed, the service window typed in the dialog.
  await expect
    .poll(async () => (await readStore<RelatorioRecord>(page, database, 'entities')).find((record) => record.entity === 'relatorio' && record.row.id === relatorioId)?.row)
    .toMatchObject({ seed_version: SEED_VERSION, setup: { service_start: '2026-09-06', service_end: '2026-09-08' } });

  // The Sumário: the NC count agrees with não conformidade, and the Controle row says it fills itself.
  await expect(page.getByRole('button', { name: '0 NC abertas', exact: true })).toBeVisible();
  const rows = sumario(page).locator(':scope > li');
  await expect(rows.nth(1).locator('.sum-ro')).toHaveText('preenchido automaticamente');

  // Dados do relatório › Etapa 5: "Altitude do local".
  await page.goto(`/relatorio/${relatorioId}/setup?etapa=5`);
  await expect(page.getByRole('heading', { name: 'Etapa 5 — Local' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('spinbutton', { name: 'Altitude do local', exact: true })).toBeVisible();
  await expect(page.getByText('Altitude do site')).toHaveCount(0);

  // Templates: the line names the counts, not the seed version.
  await page.goto('/templates');
  const template = page.getByRole('list').getByRole('listitem').filter({ hasText: STANDARD_TEMPLATE_NAME }).first();
  await expect(template.locator('.rr-secondary')).toHaveText(/^9 seções · /, { timeout: 30_000 });
  await expect(template.locator('.rr-secondary')).not.toContainText('Semente');

  // Home: the search matches the template's name and the dates as the card shows them.
  await page.goto('/');
  const field = page.getByRole('searchbox', { name: 'Buscar relatório' });
  const card = page.locator(`.relatorio-card[data-relatorio="${relatorioId}"]`);
  await expect(field).toBeVisible({ timeout: 30_000 });
  await field.fill(STANDARD_TEMPLATE_NAME);
  await expect(card).toBeVisible();
  await field.fill(formatServiceDates('2026-09-06', '2026-09-08'));
  await expect(card).toBeVisible();
  // The Em revisão tile pressed, the client's relatório a Rascunho: the message names the tile and the count elsewhere.
  await field.fill(CLIENT);
  await expect(card).toBeVisible();
  await page.getByRole('group', { name: 'Relatórios por status' }).locator('.status-tile').filter({ has: page.locator('.status-pill', { hasText: 'Em revisão' }) }).click();
  await expect(page.locator('.relatorio-card')).toHaveCount(0);
  await expect(page.locator('.home-empty .section-note')).toHaveText(noSearchMatchText(CLIENT, 'em_revisao', 1));
  await expect(page.locator('.home-empty .section-note')).toHaveText(`Nenhum relatório com status Em revisão encontrado para ${CLIENT}. 1 relatório em outro status.`);
  // The action the "enviado" note answers keeps its word (F34; the note itself is the Export dialog's, in export.spec.ts).
  expect(MARK_SENT_LABEL).toBe('Marcar como enviado ao cliente');
});

test('@p1 27.9-E2E-001 a local\'s NC item: two quick phrases join in lower case, its photo names the non-conformity, the point ends ", conforme Imagem 1", the gallery filter reads "Todas"', async ({ page }) => {
  test.setTimeout(240_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const relatorioId = built.relatorioId;
  const enelId = (built.drafts.find((draft) => draft.kind === 'create' && draft.path.startsWith('location/') && (draft.value as { name?: string }).name === ENEL)!.value as { id: string }).id;
  await pushDrafts(page, database, [...built.drafts, emCampoDraft(account, relatorioId)]);
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('button', { name: '0 NC abertas', exact: true })).toBeVisible({ timeout: 30_000 });

  // The local's "Verificações do local": the item answered NC, two of its chips tapped one after the other.
  await page.goto(`/relatorio/${relatorioId}/local/${enelId}/verificacoes`);
  const nc = row(page, EMERGENCIA.key);
  await nc.scrollIntoViewIfNeeded({ timeout: 30_000 });
  await nc.getByRole('radio', { name: 'Não conforme', exact: true }).click();
  await expect(nc.getByRole('radio', { name: 'Não conforme', exact: true })).toHaveAttribute('aria-checked', 'true');
  const chips = nc.getByRole('group', { name: /^Observações sugeridas do item \d+$/ });
  const [first, second] = EMERGENCIA.nc_phrases as [string, string, ...string[]];
  await chips.getByRole('button', { name: first, exact: true }).click();
  await chips.getByRole('button', { name: second, exact: true }).click();
  const joined = `${first}, ${second.charAt(0).toLocaleLowerCase('pt-BR')}${second.slice(1)}`;
  const observation = nc.getByRole('textbox', { name: /^Observação do item \d+$/ });
  await expect(observation).toHaveValue(joined);
  await page.keyboard.press('Tab');
  await expect
    .poll(async () => (await readStore<{ path: string; value: unknown }>(page, database, 'outbox')).filter((op) => op.path === `location/${enelId}/checklist/${EMERGENCIA.key}/observation`).map((op) => op.value).at(-1))
    .toBe(joined);

  // Its photo is born "Não conformidade em ⟨item⟩ do ⟨local⟩", on screen and in the store.
  await nc.getByRole('button', { name: 'Adicionar foto' }).click();
  const camera = await expectCameraOpen(page);
  await expect(camera.locator('.cam-context')).toHaveText(new RegExp(`^Contexto: ${NC_CAPTION_LEAD} `));
  await shoot(page, 1);
  await camera.getByRole('button', { name: 'Concluir fotos' }).click();
  await expect(page.getByRole('dialog', { name: 'Câmera' })).toHaveCount(0);
  const caption = `${NC_CAPTION_LEAD} ${EMERGENCIA.label.charAt(0).toLocaleLowerCase('pt-BR')}${EMERGENCIA.label.slice(1)} do ${ENEL}`;
  await expect(nc.locator('.photo-list .photo-row .photo-meta')).toHaveText(caption);
  const [photo] = await devicePhotos(page, database);
  expect(photo).toMatchObject({ location_id: enelId, item_key: EMERGENCIA.key, caption });

  // "Criar ponto de atenção": the text ends ", conforme Imagem 1" in the editor, in the store and on the card.
  await nc.getByRole('button', { name: 'Criar ponto de atenção' }).click();
  const editor = page.getByRole('dialog', { name: 'Criar ponto de atenção' });
  await expect(editor).toBeVisible();
  const text = editor.getByRole('textbox', { name: 'Texto' });
  await expect(text).toContainText(/, conforme Imagem 1$/);
  await editor.getByRole('button', { name: 'Concluir' }).click();
  await expect(editor).toHaveCount(0);
  const stored = async () => (await readStore<{ entity: string; row: PointRow }>(page, database, 'entities')).filter((record) => record.entity === 'point').map((record) => record.row);
  await expect.poll(async () => (await stored()).length).toBe(1);
  const [point] = await stored();
  expect(point!.text.startsWith(`Item ${EMERGENCIA.number} (`)).toBe(true);
  expect(point!.text.endsWith(`${joined}, conforme ${photoToken(photo!.id)}`)).toBe(true);
  await page.goto(`/relatorio/${relatorioId}/pontos`);
  await expect(page.locator('.poa-list > .point-of-attention-card .poa-text')).toHaveText(/, conforme Imagem 1$/, { timeout: 30_000 });

  // The Sumário counts it as one "NC aberta".
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('button', { name: '1 NC aberta', exact: true })).toBeVisible({ timeout: 30_000 });

  // Registro fotográfico: the first filter chip reads "Todas".
  await page.goto(`/relatorio/${relatorioId}/fotos`);
  await expect(page.getByRole('heading', { level: 2, name: /^Registro fotográfico \(\d+\)$/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('radio', { name: 'Todas', exact: true })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Todos', exact: true })).toHaveCount(0);
});
