import { CONTRACT_VERSION, CONTRACT_VERSION_HEADER, GENERATE_ROUTES } from '@app/domain';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { appOrigin } from './support/origin.ts';
import { newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * e20f (2026-11-04, QA N4): a deep link to Dados do relatório or to a section text of an Em
 * revisão relatório, on a device that does not hold it (a fresh sign-in, which a sign-out now
 * always leaves), said "Relatório não encontrado." forever: those two surfaces did not stand
 * behind `RelatorioGate`, so they never pulled the relatório on open (AD-8), as the Sumário,
 * the ficha, the local, the photos and the points do. Em revisão and Emitido are not pulled at
 * launch, so only the open pulls them.
 */

let account: SeedAccount;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
});

test('@p0 e20f-E2E-003 QA N4: a fresh device opens the setup and a section text of an Em revisão relatório by deep link, and sees each surface', async ({ page, browser }) => {
  test.setTimeout(180_000);
  await resetEmpresaB(account, { standard: true });
  // The office: a relatório moved to Em revisão by a queued issue (its parecer set first, the one blocking pre-issue row).
  await signIn(page, account.email);
  const database = deviceDatabaseName(account.userId);
  const built = newRelatorioDrafts(account);
  const parecer = officeDraft(account, { relatorioId: built.relatorioId }, 'relatorio/setup/parecer', { verdict: 'apto', text: 'Apto para operação.', text_status: 'edited', text_basis: null });
  await pushDrafts(page, database, [...built.drafts, parecer]);
  const queued = await page.request.post(GENERATE_ROUTES.generate(built.relatorioId).path, {
    headers: { ...appOrigin(page), [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION) },
    data: { last_op_id: null, file_ids_expected: [] },
  });
  expect(queued.status(), await queued.text()).toBe(202);
  await pushDrafts(page, database, [officeDraft(account, { relatorioId: built.relatorioId }, 'relatorio/status', 'em_revisao')]);
  const section = built.drafts.find((draft) => draft.kind === 'create' && draft.path.startsWith('block/') && (draft.value as { block_type?: string }).block_type === 'section_2');
  expect(section, 'the standard template has a section 2 text').toBeDefined();
  const sectionId = (section!.value as { id: string }).id;

  // A fresh device: its own browser context, signed in, holding nothing of the relatório.
  const context = await browser.newContext();
  try {
    const fresh = await context.newPage();
    await signIn(fresh, account.email);

    await fresh.goto(`/relatorio/${built.relatorioId}/setup?etapa=1`);
    await expect(fresh.getByRole('heading', { level: 2, name: 'Etapa 1 — Capa' })).toBeVisible({ timeout: 30_000 });
    await expect(fresh.getByText('Relatório não encontrado.')).toHaveCount(0);

    // A second fresh device for the section text, so this deep link is the first open too.
    const other = await browser.newContext();
    try {
      const second = await other.newPage();
      await signIn(second, account.email);
      await second.goto(`/relatorio/${built.relatorioId}/secao/${sectionId}`);
      await expect(second.getByRole('button', { name: 'Restaurar texto do template' })).toBeVisible({ timeout: 30_000 });
      await expect(second.getByText('Seção não encontrada.')).toHaveCount(0);
    } finally {
      await other.close();
    }
  } finally {
    await context.close();
  }
});
