import 'fake-indexeddb/auto';
import { emptyTemplate, moveSection, standardTemplate, type TemplateRow } from '@app/domain';
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from '../../test-axe.ts';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toRecord } from '../../db/commit.ts';
import { templateRow } from '../../db/home-store.ts';
import { openDatabase, type AppDatabase } from '../../db/schema.ts';
import type { SessionState } from '../../state/session.tsx';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import { TemplateComposerSurface } from './template-composer.tsx';

/*
 * Story 3.4: the Template composer over a real device database. Every edit is one batch
 * of `template/{id}/*` puts computed by the kernel, moves are announced, removals confirm
 * and undo, and an orphan block (left by two devices' writes) is invisible.
 */

const COMPANY = '0b000000-0000-7000-8000-00000000000b';
const USER = '0b000000-0000-7000-8000-0000000000b1';
const ID = '019966b0-0037-7000-8000-000000000001';

let database: AppDatabase | null = null;
let counter = 0;

const session = (): SessionState => ({
  status: 'signed-in',
  user: {
    id: USER,
    name: 'Bento Braga',
    email: 'b@teste.local',
    companyId: COMPANY,
    companyName: 'Empresa B de Teste',
    council: null,
    registrationNumber: null,
    title: null,
  },
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
// The real reader, wrapped so one test can hand an edit a row another device already changed.
vi.mock('../../db/home-store.ts', async (original) => {
  const actual = await original<typeof import('../../db/home-store.ts')>();
  return { ...actual, templateRow: vi.fn(actual.templateRow) };
});

// Each edit is an IndexedDB write plus a live-query round trip; under a full parallel run
// that can outlast the one-second default.
configure({ asyncUtilTimeout: 5000 });

async function freshDb(row: TemplateRow | null): Promise<AppDatabase> {
  const user = `019966b0-0038-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  const fresh = openDatabase(user);
  if (row !== null) await fresh.entities.put(toRecord(`template:${row.id}`, row));
  return fresh;
}

function renderComposer(id = ID) {
  return render(
    <MemoryRouter initialEntries={[`/templates/${id}`]}>
      <ToastProvider>
        {/* Stands in for the App bar's back button, which the shell draws. */}
        <Link to="/templates">Sair do composer</Link>
        <Routes>
          <Route path="/templates/:id" element={<TemplateComposerSurface />} />
          <Route path="/templates" element={<p>Lista</p>} />
        </Routes>
        <ToastOutlet />
      </ToastProvider>
    </MemoryRouter>,
  );
}

const palette = () => screen.getByRole('complementary', { name: 'Paleta de blocos' });

async function outboxPaths(): Promise<string[]> {
  return (await database!.outbox.toArray()).map((op) => op.path);
}

afterEach(() => {
  cleanup();
  database?.close();
  database = null;
});

// E3-A4: one of four parts of the composer suite, split so they run in parallel (sub-block defaults and section text).

describe('3.5 composer: sub-block defaults per type', () => {
  it('offers "Editar padrões" only for a type the template holds', async () => {
    database = await freshDb(emptyTemplate(ID, 'v1'));
    renderComposer();
    await screen.findByRole('complementary', { name: 'Paleta de blocos' });
    expect(within(palette()).queryByRole('button', { name: /^Editar padrões/ })).toBeNull();
    cleanup();
    database.close();

    database = await freshDb(standardTemplate({ id: ID }));
    renderComposer();
    await screen.findByRole('complementary', { name: 'Paleta de blocos' });
    expect(within(palette()).getAllByRole('button', { name: /^Editar padrões de / })).toHaveLength(8);
  });

  it('shows Toggle rows with the state word, "Sempre" for checklist and conclusion, and the subtype NA count', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    renderComposer();
    await screen.findByRole('complementary', { name: 'Paleta de blocos' });
    await userEvent.click(within(palette()).getByRole('button', { name: 'Editar padrões de Chave seccionadora' }));
    const dialog = await screen.findByRole('dialog', { name: 'Padrões de Chave seccionadora' });

    const plate = within(dialog).getByRole('switch', { name: 'Dados de placa' });
    expect(plate).toHaveAttribute('aria-checked', 'true');
    expect(plate).toHaveTextContent('Ativado');
    for (const locked of ['Verificações gerais', 'Conclusão']) {
      // The mock's locked row: aria-disabled, ", sempre ativado", and "Sempre na ficha" under it.
      const toggle = within(dialog).getByRole('switch', { name: `${locked}, sempre ativado` });
      expect(toggle).toHaveAttribute('aria-disabled', 'true');
      expect(toggle).toHaveAttribute('aria-checked', 'true');
      expect(toggle).toHaveTextContent('Sempre');
      expect([...toggle.closest('.toggle-row')!.querySelectorAll('.toggle-sub')].at(-1)).toHaveTextContent('Sempre na ficha');
      await userEvent.click(within(dialog).getByText(locked, { selector: 'label' }));
      expect(toggle).toHaveAttribute('aria-checked', 'true');
    }
    // E3-A9: the kernel's line under each sub-block that holds something, then the two "Sempre na ficha".
    expect([...dialog.querySelectorAll('.toggle-sub')].map((el) => el.textContent)).toEqual([
      '10 campos',
      '14 itens C · NC · NA',
      'Sempre na ficha',
      'T1 · T3 · T5 · Fase A · Fase B · Fase C × Valor · >400 MΩ (aceitável na ficha)',
      'T1-T2 · T3-T4 · T5-T6 × Valor · <250 µΩ (aceitável na ficha)',
      'Sempre na ficha',
    ]);
    const subtype = within(dialog).getByRole('combobox', { name: 'Subtipo padrão' });
    expect(subtype).toHaveValue('Manual');
    expect(within(dialog).getByText('2 itens marcados NA por padrão')).toBeVisible();
    expect(await axe(dialog)).toHaveNoViolations();

    // Off, on every placement, as one blocks put -- from a tap on the row's label.
    await userEvent.click(within(dialog).getByText('Resistência de contato', { selector: 'label' }));
    await waitFor(async () => {
      const blocks = (await templateRow(database!, ID))!.blocks.filter((b) => b.block_type === 'chave_seccionadora');
      expect(blocks.every((b) => b.sub_blocks.resistencia_contato?.enabled === false)).toBe(true);
    });
    await waitFor(() => expect(within(dialog).getByRole('switch', { name: 'Resistência de contato' })).toHaveTextContent('Desativado'));

    // No subtype: no NA pre-mark, every item still on the list.
    await userEvent.click(within(dialog).getByRole('button', { name: /Abrir lista/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'Sem subtipo' }));
    await waitFor(() => expect(within(dialog).getByText('Nenhum item marcado NA por padrão')).toBeVisible());
    expect(subtype).toHaveValue('Sem subtipo');
    const blocks = (await templateRow(database!, ID))!.blocks.filter((b) => b.block_type === 'chave_seccionadora');
    expect(blocks.every((b) => b.subtype === undefined && b.na_defaults.length === 0)).toBe(true);
    expect(await outboxPaths()).toEqual([`template/${ID}/blocks`, `template/${ID}/blocks`]);
  });

  it('"Á SECO" on the TP pre-marks the seed\'s 8 items, and a new TP placement follows the type', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    renderComposer();
    await screen.findByRole('complementary', { name: 'Paleta de blocos' });
    await userEvent.click(within(palette()).getByRole('button', { name: 'Editar padrões de TP — proteção' }));
    const dialog = await screen.findByRole('dialog', { name: 'Padrões de TP — proteção' });
    expect(within(dialog).getByRole('combobox', { name: 'Subtipo padrão' })).toHaveValue('Sem subtipo');
    await userEvent.click(within(dialog).getByRole('button', { name: /Abrir lista/ }));
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual(['Sem subtipo', 'Epóxi', 'Á seco']);
    await userEvent.click(screen.getByRole('option', { name: 'Á seco' }));
    await waitFor(() => expect(within(dialog).getByText('8 itens marcados NA por padrão')).toBeVisible());
    // "IA e IP lidos do visor" ships off and can be switched on.
    expect(within(dialog).getByRole('switch', { name: 'IA e IP lidos do visor' })).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // A TP placed on a coluna that had none starts with the type's config.
    await userEvent.click(screen.getByRole('button', { name: /^Coluna 9/ }));
    await userEvent.click(within(within(palette()).getByRole('group', { name: 'TP, 0' })).getByRole('button', { name: 'Mais um' }));
    await waitFor(async () => {
      const tps = (await templateRow(database!, ID))!.blocks.filter((b) => b.block_type === 'tp');
      expect(tps.reduce((sum, b) => sum + b.quantity, 0)).toBe(12);
      expect(tps.find((b) => b.skeleton_location_ref === 'subsolo-1/coluna-9')).toBeDefined();
      expect(tps.every((b) => b.subtype === 'a_seco' && b.na_defaults.length === 8)).toBe(true);
    });
  });

  it('two toggles pressed back to back both land: each change applies to the freshest row, in order', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    renderComposer();
    await screen.findByRole('complementary', { name: 'Paleta de blocos' });
    await userEvent.click(within(palette()).getByRole('button', { name: 'Editar padrões de Chave seccionadora' }));
    const dialog = await screen.findByRole('dialog', { name: 'Padrões de Chave seccionadora' });
    // No await between them: the second change is queued while the first is still writing.
    fireEvent.click(within(dialog).getByRole('switch', { name: 'Dados de placa' }));
    fireEvent.click(within(dialog).getByRole('switch', { name: 'Observações' }));
    await waitFor(async () => {
      const blocks = (await templateRow(database!, ID))!.blocks.filter((b) => b.block_type === 'chave_seccionadora');
      expect(blocks.every((b) => b.sub_blocks.nameplate?.enabled === false && b.sub_blocks.observations?.enabled === false)).toBe(true);
    });
    expect(await outboxPaths()).toEqual([`template/${ID}/blocks`, `template/${ID}/blocks`]);
  });
});

describe('3.6 composer: section text', () => {
  const area = (dialog: HTMLElement) => within(dialog).getByRole('textbox', { name: 'Texto da seção 1' });

  it('writes nothing onto another section when the one it was opened on moved elsewhere, and says so', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    renderComposer();
    await userEvent.click(await screen.findByRole('button', { name: 'Mais opções de 1 Objetivo' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Editar texto' }));
    const dialog = await screen.findByRole('dialog', { name: '1 Objetivo — texto fixo' });
    // The row this device reads at the moment of the write has section 2 at index 0.
    const stale = standardTemplate({ id: ID });
    vi.mocked(templateRow).mockImplementationOnce(async () => ({ ...stale, blocks: moveSection(stale.blocks, 0, 1) }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'cliente' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }));
    expect(await screen.findByText('A seção mudou em outro aparelho; o texto não foi salvo.')).toBeVisible();
    // The dialog closes, so later autosaves cannot repeat the toast.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await outboxPaths()).toEqual([]);
    expect((await templateRow(database!, ID))!.blocks.every((b) => b.section_text === null)).toBe(true);
  });

  it('"Restaurar texto padrão" right after typing writes the typed text first, so "Desfazer" brings it back', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    renderComposer();
    const open = async () => {
      await userEvent.click(await screen.findByRole('button', { name: 'Mais opções de 1 Objetivo' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Editar texto' }));
      return screen.findByRole('dialog', { name: '1 Objetivo — texto fixo' });
    };
    // An older committed text: the seed text with a chip in front.
    let dialog = await open();
    await userEvent.click(within(dialog).getByRole('button', { name: 'cliente' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }));
    await waitFor(async () => expect((await templateRow(database!, ID))!.blocks[0]!.section_text).toMatch(/^\{cliente\}O presente/));

    // Typed, and restored at once, well inside the 500 ms autosave idle.
    dialog = await open();
    const textbox = area(dialog);
    textbox.append(document.createTextNode(' Recém digitado.'));
    fireEvent.input(textbox);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Restaurar texto padrão' }));
    await waitFor(async () => expect((await templateRow(database!, ID))!.blocks[0]!.section_text).toBeNull());
    await userEvent.click(await screen.findByRole('button', { name: 'Desfazer' }));
    await waitFor(async () => expect((await templateRow(database!, ID))!.blocks[0]!.section_text).toMatch(/ Recém digitado\.$/));
  });

  it('an emptied text, or one typed back to the seed text, is stored as null: the seed text stays in force', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    renderComposer();
    const open = async () => {
      await userEvent.click(await screen.findByRole('button', { name: 'Mais opções de 1 Objetivo' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Editar texto' }));
      return screen.findByRole('dialog', { name: '1 Objetivo — texto fixo' });
    };
    let dialog = await open();
    await userEvent.click(within(dialog).getByRole('button', { name: 'cliente' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }));
    await waitFor(async () => expect((await templateRow(database!, ID))!.blocks[0]!.section_text).toMatch(/^\{cliente\}O presente/));

    // Back to the seed text: the chip removed with Backspace right after it.
    dialog = await open();
    const textbox = area(dialog);
    const chip = textbox.querySelector('.var-chip')!;
    const range = document.createRange();
    range.setStartAfter(chip);
    range.collapse(true);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    fireEvent.keyDown(textbox, { key: 'Backspace' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }));
    await waitFor(async () => expect((await templateRow(database!, ID))!.blocks[0]!.section_text).toBeNull());

    // Emptied: the whole text removed.
    dialog = await open();
    area(dialog).replaceChildren();
    fireEvent.input(area(dialog));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await templateRow(database!, ID))!.blocks[0]!.section_text).toBeNull();
    // Two writes only: the chip, then null; the emptied text found null already stored.
    expect(await outboxPaths()).toEqual([`template/${ID}/blocks`, `template/${ID}/blocks`]);

    // Restoring what is already the seed text writes nothing, and still says it is restored.
    dialog = await open();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Restaurar texto padrão' }));
    expect(await screen.findByText('Texto padrão restaurado')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull();
    expect(await outboxPaths()).toHaveLength(2);
  });

  it('offers "Editar texto" only on a section with text, opening the seed\'s text with its variables as chips', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    renderComposer();
    await userEvent.click(await screen.findByRole('button', { name: 'Mais opções de 8 Pontos de atenção' }));
    expect(within(await screen.findByRole('menu')).queryByRole('menuitem', { name: 'Editar texto' })).toBeNull();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());

    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de 1 Objetivo' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Editar texto' }));
    const dialog = await screen.findByRole('dialog', { name: '1 Objetivo — texto fixo' });
    const textbox = area(dialog);
    expect(textbox).toHaveAttribute('contenteditable', 'true');
    expect(textbox).toHaveAttribute('aria-multiline', 'true');
    expect([...textbox.querySelectorAll('.var-chip')].map((c) => c.textContent)).toEqual(['{empresa_executora}', '{obra}', '{cliente}']);
    expect(dialog.querySelector('.rt-toolbar')).toBeNull();
    const row = within(dialog).getByRole('group', { name: 'Inserir dado do relatório' });
    expect(within(row).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'cliente',
      'obra',
      'datas',
      'empresa executora',
      'responsável',
    ]);
    expect(await axe(dialog)).toHaveNoViolations();
  });

  it('inserts a chip, autosaves the text on close, and "Restaurar texto padrão" puts the seed back with "Desfazer"', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    renderComposer();
    await userEvent.click(await screen.findByRole('button', { name: 'Mais opções de 1 Objetivo' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Editar texto' }));
    let dialog = await screen.findByRole('dialog', { name: '1 Objetivo — texto fixo' });
    // The dialog opens with the focus, and so the caret, at the start of the text: the chip goes there.
    await userEvent.click(within(dialog).getByRole('button', { name: 'responsável' }));
    expect(area(dialog).querySelectorAll('.var-chip')).toHaveLength(4);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }));
    await waitFor(async () => expect((await templateRow(database!, ID))!.blocks[0]!.section_text).toMatch(/^\{responsavel\}O presente/));
    expect(await outboxPaths()).toEqual([`template/${ID}/blocks`]);

    // Reopened, it shows the template's own text.
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de 1 Objetivo' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Editar texto' }));
    dialog = await screen.findByRole('dialog', { name: '1 Objetivo — texto fixo' });
    expect(area(dialog).querySelectorAll('.var-chip')).toHaveLength(4);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Restaurar texto padrão' }));
    await waitFor(async () => expect((await templateRow(database!, ID))!.blocks[0]!.section_text).toBeNull());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText('Texto padrão restaurado')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    await waitFor(async () => expect((await templateRow(database!, ID))!.blocks[0]!.section_text).toMatch(/^\{responsavel\}O presente/));
  });
});
