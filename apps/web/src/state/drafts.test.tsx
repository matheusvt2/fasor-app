import 'fake-indexeddb/auto';
import { draftKey } from '@app/domain';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listDrafts, saveDraft } from '../db/drafts.ts';
import { openDatabase, type AppDatabase } from '../db/schema.ts';
import { DraftProvider, useDraftSource, useDrafts } from './drafts.tsx';
import type { SessionState } from './session.tsx';
import { ToastOutlet, ToastProvider, useToast } from './toast.tsx';

/*
 * Test 1.8-E2E-001's unit half (FR-61, AD-2): one row per source on hide, an offer on
 * reopen that is never applied by itself, and a dismissal that keeps the row.
 */

let database: AppDatabase | null = null;

const session = (): SessionState => ({
  status: 'signed-in',
  user: { id: 'u1', name: 'Bruno', email: 'b@teste.local', companyId: 'c1', companyName: 'E', council: null, registrationNumber: null, title: null },
  online: true,
  reAuthRequired: false,
  aiFeatures: true,
  recoveryNeeded: false,
  settled: true,
  database,
  signIn: vi.fn(),
  signOut: vi.fn(async () => {}),
  saveRegistration: vi.fn(async () => {}),
  savePhotoLocation: vi.fn(async () => {}),
  dismissRecovery: vi.fn(),
});

vi.mock('./session.tsx', () => ({ useSession: () => session() }));

const ENTITY = '019966b0-0040-7000-8000-000000000001';
const TARGET = { surface: 'ficha', entity_id: ENTITY, field: 'observacoes' };

let counter = 0;

beforeEach(async () => {
  const user = `019966b0-0041-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  const stale = openDatabase(user);
  await stale.delete();
  database = openDatabase(user);
  await database.open();
});

afterEach(() => {
  database?.close();
  database = null;
});

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <DraftProvider>
        {children}
        <ToastOutlet />
      </DraftProvider>
    </ToastProvider>
  );
}

/** A surface with one uncommitted value, exactly as Epic 5's sheets will register one. */
function Field({ committed = '', withOtherToast = false }: { committed?: string; withOtherToast?: boolean }) {
  const [text, setText] = useState('');
  const { draftFound } = useDrafts();
  const { showToast, dismissToast } = useToast();
  useDraftSource({
    surface: TARGET.surface,
    entityId: TARGET.entity_id,
    field: TARGET.field,
    read: () => (text === committed ? null : text),
    apply: (value) => setText(String(value)),
  });
  return (
    <>
      <input aria-label="texto" value={text} onChange={(e) => setText(e.target.value)} />
      <span data-testid="draft-found">{String(draftFound)}</span>
      {withOtherToast ? (
        <>
          <button type="button" onClick={() => showToast('Outra mensagem')}>
            outro aviso
          </button>
          <button type="button" onClick={() => dismissToast()}>
            dispensar
          </button>
        </>
      ) : null}
    </>
  );
}

/** One registered source, so a test can mount several of them side by side. */
function OneField({ label, field }: { label: string; field: string }) {
  const [text, setText] = useState('');
  useDraftSource({
    surface: TARGET.surface,
    entityId: TARGET.entity_id,
    field,
    read: () => (text === '' ? null : text),
    apply: (value) => setText(String(value)),
  });
  return <input aria-label={label} value={text} onChange={(e) => setText(e.target.value)} />;
}

function ThreeFields() {
  return (
    <>
      <OneField label="um" field="a" />
      <OneField label="dois" field="b" />
      <OneField label="tres" field="c" />
    </>
  );
}

async function hide(): Promise<void> {
  await act(async () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
  });
}

describe('persisting on tab hide', () => {
  it('writes one row per source under its draft key', async () => {
    render(<Field />, { wrapper: Wrapper });
    await userEvent.type(screen.getByLabelText('texto'), 'meia frase');
    await hide();
    await waitFor(async () => {
      expect(await listDrafts(database!)).toHaveLength(1);
    });
    const [row] = await listDrafts(database!);
    expect(row).toMatchObject({ key: draftKey(TARGET), surface: 'ficha', entity_id: ENTITY, value: 'meia frase' });
    expect(row!.saved_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('writes nothing when the source holds the committed value', async () => {
    render(<Field committed="igual" />, { wrapper: Wrapper });
    await userEvent.type(screen.getByLabelText('texto'), 'igual');
    await hide();
    await act(async () => {
      await Promise.resolve();
    });
    expect(await listDrafts(database!)).toHaveLength(0);
  });

  // The failure this table exists to prevent: an iOS tab discarded part-way through the
  // hide keeping the first draft and losing the rest.
  it('writes every registered source of one pagehide, not just the first', async () => {
    render(<ThreeFields />, { wrapper: Wrapper });
    for (const label of ['um', 'dois', 'tres']) {
      await userEvent.type(screen.getByLabelText(label), `texto ${label}`);
    }
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
      await Promise.resolve();
    });
    await waitFor(async () => {
      expect(await listDrafts(database!)).toHaveLength(3);
    });
    const rows = await listDrafts(database!);
    expect(rows.map((row) => row.value).sort()).toEqual(['texto dois', 'texto tres', 'texto um']);
  });

  it('also persists on pagehide, the event iOS Safari fires when it discards the tab', async () => {
    render(<Field />, { wrapper: Wrapper });
    await userEvent.type(screen.getByLabelText('texto'), 'x');
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'));
      await Promise.resolve();
    });
    await waitFor(async () => {
      expect(await listDrafts(database!)).toHaveLength(1);
    });
  });
});

describe('offering a draft on reopen', () => {
  it('shows the persistent toast and applies nothing until it is pressed', async () => {
    await saveDraft(database!, TARGET, 'do dia anterior', new Date('2026-09-21T10:00:00.000Z'));
    render(<Field />, { wrapper: Wrapper });

    const toast = await screen.findByTestId('toast');
    expect(toast).toHaveTextContent('Rascunho encontrado');
    // Nothing has been applied: the input is still empty and the row is still there.
    expect(screen.getByLabelText('texto')).toHaveValue('');
    expect(await listDrafts(database!)).toHaveLength(1);
    expect(screen.getByTestId('draft-found')).toHaveTextContent('true');

    await userEvent.click(screen.getByRole('button', { name: 'Recuperar' }));
    expect(screen.getByLabelText('texto')).toHaveValue('do dia anterior');
    await waitFor(async () => {
      expect(await listDrafts(database!)).toHaveLength(0);
    });
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('keeps the row when the toast is dismissed, so the next launch offers it again', async () => {
    await saveDraft(database!, TARGET, 'guardado', new Date('2026-09-21T10:00:00.000Z'));
    const first = render(<Field />, { wrapper: Wrapper });
    await screen.findByTestId('toast');
    // The toast carries an action, so it never expires by itself; dismissing is the
    // user closing the page or navigating away.
    first.unmount();
    expect(await listDrafts(database!)).toHaveLength(1);

    render(<Field />, { wrapper: Wrapper });
    expect(await screen.findByTestId('toast')).toHaveTextContent('Rascunho encontrado');
  });

  it('the toast has a dismiss control: dismissing keeps the row and is not re-offered this session (retro U7)', async () => {
    await saveDraft(database!, TARGET, 'guardado', new Date('2026-09-21T10:00:00.000Z'));
    render(<Field withOtherToast />, { wrapper: Wrapper });
    await screen.findByTestId('toast');

    const close = screen.getByRole('button', { name: 'Fechar' });
    expect(close).toHaveClass('toast-action');
    await userEvent.click(close);
    expect(screen.queryByTestId('toast')).toBeNull();
    expect(screen.getByTestId('draft-found')).toHaveTextContent('false');
    expect(await listDrafts(database!)).toHaveLength(1);
    expect(screen.getByLabelText('texto')).toHaveValue('');

    // The slot frees again after another toast: the declined offer stays away.
    await userEvent.click(screen.getByRole('button', { name: 'outro aviso' }));
    await userEvent.click(screen.getByRole('button', { name: 'dispensar' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('Esc on the focused toast dismisses it and keeps the row', async () => {
    await saveDraft(database!, TARGET, 'guardado', new Date('2026-09-21T10:00:00.000Z'));
    render(<Field />, { wrapper: Wrapper });
    await screen.findByTestId('toast');
    screen.getByRole('button', { name: 'Recuperar' }).focus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByTestId('toast')).toBeNull();
    expect(await listDrafts(database!)).toHaveLength(1);
    expect(screen.getByLabelText('texto')).toHaveValue('');
  });

  it('keeps the row and the offer when the owning surface is not mounted', async () => {
    await saveDraft(database!, { surface: 'outra', entity_id: ENTITY }, 'de outra tela', new Date());
    render(<Field />, { wrapper: Wrapper });
    await screen.findByTestId('toast');
    await userEvent.click(screen.getByRole('button', { name: 'Recuperar' }));
    // Nothing to apply it to: the row survives and the offer comes back.
    expect(await listDrafts(database!)).toHaveLength(1);
    expect(await screen.findByTestId('toast')).toHaveTextContent('Rascunho encontrado');
  });

  it('a second tab-hide keeps the row that is still on offer', async () => {
    await saveDraft(database!, TARGET, 'do dia anterior', new Date('2026-09-21T10:00:00.000Z'));
    render(<Field />, { wrapper: Wrapper });
    await screen.findByTestId('toast');

    // Backgrounding the app (the camera switch) while the offer stands: the surface holds
    // the committed value, so its `read()` is null — and that must not delete the draft.
    await hide();
    await hide();
    expect(await listDrafts(database!)).toHaveLength(1);
    expect(await screen.findByTestId('toast')).toHaveTextContent('Rascunho encontrado');

    await userEvent.click(screen.getByRole('button', { name: 'Recuperar' }));
    expect(screen.getByLabelText('texto')).toHaveValue('do dia anterior');
  });

  it('hands back the newest text when a tab-hide rewrote the offered row', async () => {
    await saveDraft(database!, TARGET, 'antigo', new Date('2026-09-21T10:00:00.000Z'));
    render(<Field />, { wrapper: Wrapper });
    await screen.findByTestId('toast');

    await userEvent.type(screen.getByLabelText('texto'), 'mais novo');
    await hide();
    await waitFor(async () => {
      expect((await listDrafts(database!))[0]?.value).toBe('mais novo');
    });

    await userEvent.click(screen.getByRole('button', { name: 'Recuperar' }));
    await waitFor(() => {
      expect(screen.getByLabelText('texto')).toHaveValue('mais novo');
    });
  });

  it('comes back after another toast takes the single slot', async () => {
    await saveDraft(database!, TARGET, 'guardado', new Date('2026-09-21T10:00:00.000Z'));
    render(<Field withOtherToast />, { wrapper: Wrapper });
    await screen.findByTestId('toast');

    // Any other toast replaces it — the offline line, a refused-write error.
    await userEvent.click(screen.getByRole('button', { name: 'outro aviso' }));
    expect(screen.getByTestId('toast')).toHaveTextContent('Outra mensagem');
    expect(screen.queryByRole('button', { name: 'Recuperar' })).toBeNull();

    // When the slot frees, the offer is raised again: no banner repeats it, so this is the
    // only way back to "Recuperar" short of a reload.
    await userEvent.click(screen.getByRole('button', { name: 'dispensar' }));
    expect(await screen.findByTestId('toast')).toHaveTextContent('Rascunho encontrado');
    expect(screen.getByRole('button', { name: 'Recuperar' })).toBeVisible();
  });

  it('offers nothing when the table is empty', async () => {
    render(<Field />, { wrapper: Wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId('toast')).toBeNull();
    expect(screen.getByTestId('draft-found')).toHaveTextContent('false');
  });
});

/*
 * Story 25.2 (M02): a reading that does not parse, left with the sheet, is written as a draft when its field leaves
 * the screen (`persist({ offerOnReturn: true })`), and going back to the sheet offers it, with no reload.
 */
describe('25.2-WEB a draft written as its field leaves is offered on return', () => {
  function Leaving({ field = TARGET.field }: { field?: string }) {
    const [text, setText] = useState('');
    const latest = useRef(text);
    latest.current = text;
    const persist = useDraftSource({
      surface: TARGET.surface,
      entityId: TARGET.entity_id,
      field,
      read: () => (latest.current === '' ? null : latest.current),
      apply: (value) => setText(String(value)),
    });
    const persistRef = useRef(persist);
    persistRef.current = persist;
    useLayoutEffect(
      () => () => {
        void persistRef.current({ offerOnReturn: true });
      },
      [],
    );
    return <input aria-label="leitura" value={text} onChange={(e) => setText(e.target.value)} />;
  }

  function Sheet() {
    const [open, setOpen] = useState(true);
    return (
      <>
        {open ? <Leaving /> : <span>outra ficha</span>}
        <button type="button" onClick={() => setOpen((value) => !value)}>
          alternar
        </button>
      </>
    );
  }

  it('no offer while the field is away; back on it, "Rascunho encontrado — Recuperar" hands the text back', async () => {
    render(<Sheet />, { wrapper: Wrapper });
    await userEvent.type(screen.getByLabelText('leitura'), 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'alternar' }));
    await waitFor(async () => expect((await listDrafts(database!)).map((row) => row.value)).toEqual(['abc']));
    expect(screen.queryByTestId('toast')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'alternar' }));
    expect(await screen.findByTestId('toast')).toHaveTextContent('Rascunho encontrado');
    expect(screen.getByLabelText('leitura')).toHaveValue('');
    await userEvent.click(screen.getByRole('button', { name: 'Recuperar' }));
    expect(screen.getByLabelText('leitura')).toHaveValue('abc');
  });

  it('after the person put the launch offer away, a draft that comes back is offered alone, not the rows dismissed', async () => {
    await saveDraft(database!, TARGET, 'guardado', new Date('2026-09-21T10:00:00.000Z'));
    function Both() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <Field />
          {open ? <Leaving field="leitura" /> : <span>outra ficha</span>}
          <button type="button" onClick={() => setOpen((value) => !value)}>
            alternar
          </button>
        </>
      );
    }
    render(<Both />, { wrapper: Wrapper });
    await screen.findByTestId('toast');
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByTestId('toast')).toBeNull();
    await userEvent.type(screen.getByLabelText('leitura'), 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'alternar' }));
    await waitFor(async () => expect((await listDrafts(database!)).map((row) => row.value).sort()).toEqual(['abc', 'guardado']));
    await userEvent.click(screen.getByRole('button', { name: 'alternar' }));
    expect(await screen.findByTestId('toast')).toHaveTextContent('Rascunho encontrado');
    await userEvent.click(screen.getByRole('button', { name: 'Recuperar' }));
    expect(screen.getByLabelText('leitura')).toHaveValue('abc');
    // The dismissed launch row is neither applied nor offered again.
    expect(screen.getByLabelText('texto')).toHaveValue('');
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId('toast')).toBeNull();
  });
});

/*
 * Fix batch e25x, "e25x A3" and "e25x A4": a source that has just committed its own value (`persist({ committed: true })`,
 * the write succeeded) drops the older draft row of its key; a row on offer goes only when the commit answers the offer
 * (`answersOffer`, the number input), and then the key leaves the offer and the toast goes once none is left. "Fechar"
 * drops a draft offered on return in this session whose field is on screen holding nothing typed; a row of an earlier
 * launch is kept (retro U7). The tab-hide rule (a source on offer reading nothing keeps its row) is unchanged.
 */
describe('e25x A3 and A4 the drafts a saved value answers', () => {
  /** A field whose commit the test makes succeed: "salvar" stores the text, then asks the draft store to drop. */
  function Committable({ label = 'campo', field = TARGET.field }: { label?: string; field?: string }) {
    const [text, setText] = useState('');
    const saved = useRef('');
    const latest = useRef(text);
    latest.current = text;
    const { draftFound } = useDrafts();
    const persist = useDraftSource({
      surface: TARGET.surface,
      entityId: TARGET.entity_id,
      field,
      read: () => (latest.current === saved.current ? null : latest.current),
      apply: (value) => setText(String(value)),
    });
    const save = (answersOffer: boolean) => {
      saved.current = latest.current;
      void persist({ committed: true, ...(answersOffer ? { answersOffer: true } : {}) });
    };
    return (
      <>
        <input aria-label={label} value={text} onChange={(e) => setText(e.target.value)} />
        <button type="button" onClick={() => save(false)}>
          {`salvar ${label}`}
        </button>
        <button type="button" onClick={() => save(true)}>
          {`responder ${label}`}
        </button>
        <button type="button" onClick={() => void persist({ committed: true })}>
          {`salvo antes ${label}`}
        </button>
        <span data-testid={`found-${label}`}>{String(draftFound)}</span>
      </>
    );
  }

  const values = async () => (await listDrafts(database!)).map((row) => row.value).sort();

  it('A4: a draft row written at a tab-hide is dropped once the field saves its value; a field dirty again keeps it', async () => {
    render(<Committable />, { wrapper: Wrapper });
    await userEvent.type(screen.getByLabelText('campo'), 'meia');
    await hide();
    await waitFor(async () => expect(await values()).toEqual(['meia']));
    // The commit landed while more was typed: the field is dirty again, its row stays.
    await userEvent.click(screen.getByRole('button', { name: 'salvo antes campo' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(await values()).toEqual(['meia']);
    // The field's own value is saved: the older row would only put older text back.
    await userEvent.click(screen.getByRole('button', { name: 'salvar campo' }));
    await waitFor(async () => expect(await values()).toEqual([]));
  });

  it('A4: a saved value does not drop a row on offer; A3: a saved value that answers the offer drops it, the toast goes, and no later load offers it', async () => {
    await saveDraft(database!, TARGET, 'do dia anterior', new Date('2026-09-21T10:00:00.000Z'));
    const first = render(<Committable />, { wrapper: Wrapper });
    await screen.findByTestId('toast');
    await userEvent.click(screen.getByRole('button', { name: 'salvar campo' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(await values()).toEqual(['do dia anterior']);
    expect(screen.getByTestId('toast')).toHaveTextContent('Rascunho encontrado');
    // A tab-hide still keeps the row on offer (the untouched source reads nothing).
    await hide();
    expect(await values()).toEqual(['do dia anterior']);
    // A valid value typed in that field and saved answers the offer.
    await userEvent.type(screen.getByLabelText('campo'), 'novo');
    await userEvent.click(screen.getByRole('button', { name: 'responder campo' }));
    await waitFor(async () => expect(await values()).toEqual([]));
    await waitFor(() => expect(screen.queryByTestId('toast')).toBeNull());
    expect(screen.getByTestId('found-campo')).toHaveTextContent('false');
    first.unmount();
    render(<Committable />, { wrapper: Wrapper });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('A3: with two keys on offer, answering one keeps the toast for the other', async () => {
    await saveDraft(database!, { ...TARGET, field: 'a' }, 'um', new Date('2026-09-21T10:00:00.000Z'));
    await saveDraft(database!, { ...TARGET, field: 'b' }, 'dois', new Date('2026-09-21T10:00:00.000Z'));
    render(
      <>
        <Committable label="um" field="a" />
        <Committable label="dois" field="b" />
      </>,
      { wrapper: Wrapper },
    );
    await screen.findByTestId('toast');
    await userEvent.click(screen.getByRole('button', { name: 'responder um' }));
    await waitFor(async () => expect(await values()).toEqual(['dois']));
    expect(screen.getByTestId('toast')).toHaveTextContent('Rascunho encontrado');
    await userEvent.click(screen.getByRole('button', { name: 'Recuperar' }));
    expect(screen.getByLabelText('dois')).toHaveValue('dois');
  });

  it('a saved value of a key that never held a row touches no store', async () => {
    render(<Committable />, { wrapper: Wrapper });
    // The launch list is read (empty).
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    const drop = vi.spyOn(database!.drafts, 'delete');
    await userEvent.click(screen.getByRole('button', { name: 'salvar campo' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(drop).not.toHaveBeenCalled();
    drop.mockRestore();
  });

  /** A reading that does not parse, written as its field leaves (Story 25.2). */
  function Reading() {
    const [text, setText] = useState('');
    const latest = useRef(text);
    latest.current = text;
    const persist = useDraftSource({
      surface: TARGET.surface,
      entityId: TARGET.entity_id,
      field: 'leitura',
      read: () => (latest.current === '' ? null : latest.current),
      apply: (value) => setText(String(value)),
    });
    const persistRef = useRef(persist);
    persistRef.current = persist;
    useLayoutEffect(
      () => () => {
        void persistRef.current({ offerOnReturn: true });
      },
      [],
    );
    return <input aria-label="leitura" value={text} onChange={(e) => setText(e.target.value)} />;
  }

  function SheetWithReading() {
    const [open, setOpen] = useState(true);
    return (
      <>
        <Field />
        {open ? <Reading /> : <span>outra ficha</span>}
        <button type="button" onClick={() => setOpen((value) => !value)}>
          alternar
        </button>
      </>
    );
  }

  async function leaveAndReturn(): Promise<void> {
    await userEvent.type(screen.getByLabelText('leitura'), 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'alternar' }));
    await waitFor(async () => expect(await values()).toContain('abc'));
    await userEvent.click(screen.getByRole('button', { name: 'alternar' }));
    expect(await screen.findByTestId('toast')).toHaveTextContent('Rascunho encontrado');
    expect(screen.getByLabelText('leitura')).toHaveValue('');
  }

  it('A3: "Fechar" on a draft offered on return, its field on screen holding nothing typed, drops it; the launch row is kept (retro U7)', async () => {
    await saveDraft(database!, TARGET, 'guardado', new Date('2026-09-21T10:00:00.000Z'));
    render(<SheetWithReading />, { wrapper: Wrapper });
    await screen.findByTestId('toast');
    await leaveAndReturn();
    // The tab-hide rule still holds for the offered reading: its untouched field reads nothing, the row stays.
    await hide();
    expect(await values()).toEqual(['abc', 'guardado']);
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByTestId('toast')).toBeNull();
    await waitFor(async () => expect(await values()).toEqual(['guardado']));
    expect(screen.getByLabelText('leitura')).toHaveValue('');
    expect(screen.getByLabelText('texto')).toHaveValue('');
  });

  it('A3: "Fechar" keeps a draft offered on return whose field holds typed text', async () => {
    render(<SheetWithReading />, { wrapper: Wrapper });
    await leaveAndReturn();
    await userEvent.type(screen.getByLabelText('leitura'), '1');
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(await values()).toEqual(['abc']);
  });
});
