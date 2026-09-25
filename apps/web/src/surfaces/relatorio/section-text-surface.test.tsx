import 'fake-indexeddb/auto';
import { instantiateTemplate, standardTemplate, type BlockRow } from '@app/domain';
import { portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from '../../test-axe.ts';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toRecord } from '../../db/commit.ts';
import { openDatabase, type AppDatabase } from '../../db/schema.ts';
import { applyPulled } from '../../db/sync-store.ts';
import type { SessionState } from '../../state/session.tsx';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import { SectionTextSurface } from './section-text-surface.tsx';

/*
 * Story 4.7: the editable section text surface over a section_2 block born from the
 * standard template, retargeted at the small Porto Seguro fixture's relatório.
 */

const COMPANY = portoSeguroSmall.companyId;
const USER = portoSeguroSmall.userId;
const RELATORIO = portoSeguroSmall.relatorioId;

let database: AppDatabase | null = null;
let counter = 0;

const session = (): SessionState => ({
  status: 'signed-in',
  user: { id: USER, name: 'Bento Braga', email: 'b@teste.local', companyId: COMPANY, companyName: 'Empresa B de Teste', council: null, registrationNumber: null, title: null },
  online: true,
  reAuthRequired: false,
  database,
  signIn: vi.fn(),
  signOut: vi.fn(async () => {}),
  saveRegistration: vi.fn(async () => {}),
  dismissReAuth: vi.fn(),
  recoveryNeeded: false,
  dismissRecovery: vi.fn(),
});

vi.mock('../../state/session.tsx', () => ({ useSession: () => session() }));

/** Epic 4 retro item 21: a write the device refuses, for the next `commitBatch` calls while set. */
const refuse = vi.hoisted(() => ({ writes: false }));
vi.mock('../../db/commit.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../db/commit.ts')>();
  return {
    ...actual,
    commitBatch: (...args: Parameters<typeof actual.commitBatch>) =>
      refuse.writes ? Promise.reject(Object.assign(new Error('refused'), { name: 'UnknownError' })) : actual.commitBatch(...args),
  };
});

async function freshDb(): Promise<AppDatabase> {
  const user = `019966c1-0010-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  return openDatabase(user);
}

/** The eleven section blocks of a relatório born from the standard template, retargeted at the fixture's relatório. */
function sectionBlocksFor(relatorioId: string): BlockRow[] {
  let n = 0;
  const newId = () => `019966c1-0011-7000-8000-${(++n).toString(16).padStart(12, '0')}`;
  const { drafts } = instantiateTemplate(
    standardTemplate({ id: '019966c1-0012-7000-8000-000000000001' }),
    { id: portoSeguroSmall.projectId },
    { service_start: null, service_end: null, existingEquipment: [], responsible_user_id: null },
    { newId, actorId: USER, companyId: COMPANY },
  );
  return drafts
    .filter((d) => d.path.startsWith('block/'))
    .map((d) => d.value as unknown as BlockRow)
    .filter((b) => b.location_id === null)
    .map((b) => ({ ...b, relatorio_id: relatorioId, created_by: USER }));
}

async function seeded(): Promise<{ db: AppDatabase; section2: BlockRow }> {
  const db = await freshDb();
  await applyPulled(db, portoSeguroSmall.log);
  const sections = sectionBlocksFor(RELATORIO);
  await db.entities.bulkPut(sections.map((b) => toRecord(`block:${b.id}`, b)));
  return { db, section2: sections.find((b) => b.block_type === 'section_2')! };
}

/** Where a press navigated. */
function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function tree(id: string, blockId: string) {
  return (
    <MemoryRouter initialEntries={[`/relatorio/${id}/secao/${blockId}`]}>
      <ToastProvider>
        <Where />
        <Routes>
          <Route path="/relatorio/:id/secao/:blockId" element={<SectionTextSurface />} />
        </Routes>
        <ToastOutlet />
      </ToastProvider>
    </MemoryRouter>
  );
}

afterEach(() => {
  database?.close();
  database = null;
  refuse.writes = false;
});

describe('4.7 SectionTextSurface', () => {
  it('renders the seed default text with no violations, "Restaurar" disabled (nothing to restore)', async () => {
    const seed = await seeded();
    database = seed.db;
    const { container } = render(tree(RELATORIO, seed.section2.id));
    const area = await screen.findByRole('textbox', { name: 'Texto da seção' });
    await waitFor(() => expect(area.textContent).not.toBe(''));
    expect(screen.getByRole('button', { name: 'Restaurar texto do template' })).toHaveAttribute('aria-disabled');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Q14: moves the focus to the section heading on open', async () => {
    const seed = await seeded();
    database = seed.db;
    render(tree(RELATORIO, seed.section2.id));
    const heading = await screen.findByRole('heading', { level: 2, name: 'Seção 2 — Definições' });
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it('autosaves an edit to block/{id}/config.section_text and keeps the template untouched', async () => {
    const seed = await seeded();
    database = seed.db;
    render(tree(RELATORIO, seed.section2.id));
    const area = await screen.findByRole('textbox', { name: 'Texto da seção' });
    area.focus();
    await userEvent.type(area, ' Nota do relatório.');
    await userEvent.tab();
    await waitFor(async () => {
      const row = await database!.entities.get(['block', seed.section2.id]);
      const config = (row!.row as BlockRow).config as { section_text?: unknown };
      expect(typeof config.section_text).toBe('string');
      expect(config.section_text as string).toContain('Nota do relatório.');
    });
  });

  it('"Restaurar texto do template" restores the seed default once the section has an override, with "Desfazer"', async () => {
    const seed = await seeded();
    database = seed.db;
    // Give the section its own override text first.
    await database.entities.put(
      toRecord(`block:${seed.section2.id}`, { ...seed.section2, config: { ...(seed.section2.config as object), section_text: 'Texto próprio deste relatório.' } } as never),
    );
    render(tree(RELATORIO, seed.section2.id));
    const restore = await screen.findByRole('button', { name: 'Restaurar texto do template' });
    expect(restore).not.toHaveAttribute('aria-disabled');
    await userEvent.click(restore);
    await waitFor(async () => {
      const row = await database!.entities.get(['block', seed.section2.id]);
      expect(((row!.row as BlockRow).config as { section_text: unknown }).section_text).toBeNull();
    });
    expect(await screen.findByText('Texto do template restaurado nesta seção')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    await waitFor(async () => {
      const row = await database!.entities.get(['block', seed.section2.id]);
      expect(((row!.row as BlockRow).config as { section_text: unknown }).section_text).toBe('Texto próprio deste relatório.');
    });
    // E3-A8: the toast that carried "Desfazer" closes; focus does not fall to <body>.
    expect(screen.getByRole('textbox', { name: 'Texto da seção' })).toHaveFocus();
  });

  it('E4 retro item 22: an edit writes the edited marker beside the text; "Restaurar" clears it', async () => {
    const seed = await seeded();
    database = seed.db;
    render(tree(RELATORIO, seed.section2.id));
    const area = await screen.findByRole('textbox', { name: 'Texto da seção' });
    area.focus();
    await userEvent.type(area, ' Nota.');
    await userEvent.tab();
    const configOf = async () => ((await database!.entities.get(['block', seed.section2.id]))!.row as BlockRow).config as { section_text?: unknown; section_text_edited?: unknown };
    await waitFor(async () => expect((await configOf()).section_text_edited).toBe(true));
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar texto do template' }));
    await waitFor(async () => expect(await configOf()).toMatchObject({ section_text: null, section_text_edited: false }));
  });

  it('E4 retro item 21: a refused autosave is toasted, not swallowed', async () => {
    const seed = await seeded();
    database = seed.db;
    render(tree(RELATORIO, seed.section2.id));
    const area = await screen.findByRole('textbox', { name: 'Texto da seção' });
    refuse.writes = true;
    area.focus();
    await userEvent.type(area, ' Nota.');
    await userEvent.tab();
    expect(await screen.findByText('Não foi possível salvar. Tente de novo.')).toBeVisible();
    const row = await database.entities.get(['block', seed.section2.id]);
    expect(((row!.row as BlockRow).config as { section_text?: unknown }).section_text ?? null).toBeNull();
  });

  it('E4 retro item 21: typing after "Restaurar" retires its "Desfazer", so no undo can overwrite the newer text', async () => {
    const seed = await seeded();
    database = seed.db;
    await database.entities.put(
      toRecord(`block:${seed.section2.id}`, { ...seed.section2, config: { ...(seed.section2.config as object), section_text: 'Texto próprio deste relatório.' } } as never),
    );
    render(tree(RELATORIO, seed.section2.id));
    await userEvent.click(await screen.findByRole('button', { name: 'Restaurar texto do template' }));
    expect(await screen.findByText('Texto do template restaurado nesta seção')).toBeVisible();
    const area = screen.getByRole('textbox', { name: 'Texto da seção' });
    area.focus();
    await userEvent.type(area, ' Mais.');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull());
    await userEvent.tab();
    await waitFor(async () => {
      const row = await database!.entities.get(['block', seed.section2.id]);
      expect(((row!.row as BlockRow).config as { section_text: string }).section_text).toContain('Mais.');
    });
  });

  it('shows the not-found copy for a stale link naming a non-editable block type', async () => {
    const seed = await seeded();
    database = seed.db;
    const other = sectionBlocksFor(RELATORIO).find((b) => b.block_type === 'section_9')!;
    await database.entities.bulkPut([toRecord(`block:${other.id}`, other)]);
    render(tree(RELATORIO, other.id));
    expect(await screen.findByText('Seção não encontrada.')).toBeVisible();
  });

  it('12.2: "Próxima seção" opens the next section text (2 to 4); on section 6 only "Voltar ao sumário" remains', async () => {
    const seed = await seeded();
    database = seed.db;
    const sections = sectionBlocksFor(RELATORIO);
    const section4 = sections.find((b) => b.block_type === 'section_4')!;
    const section6 = sections.find((b) => b.block_type === 'section_6')!;
    render(tree(RELATORIO, seed.section2.id));
    await userEvent.click(await screen.findByRole('button', { name: 'Próxima seção' }));
    expect(screen.getByTestId('where')).toHaveTextContent(`/relatorio/${RELATORIO}/secao/${section4.id}`);
    expect(await screen.findByRole('heading', { level: 2, name: /^Seção 4 — / })).toBeVisible();
    cleanup();

    render(tree(RELATORIO, section6.id));
    expect(await screen.findByRole('button', { name: 'Voltar ao sumário' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Próxima seção' })).toBeNull();
  });
});
