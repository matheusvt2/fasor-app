import 'fake-indexeddb/auto';
import {
  buildSnapshot,
  evaluateSheetMeasurements,
  getDefinition,
  newEquipmentBlock,
  NO_VISIT_CONTEXT,
  replay,
  EMPTY_DEFINITION_CONTEXT,
  type BlockDefinition,
  type BlockRow,
  type EquipmentBlockType,
  type Cell,
  type EntityState,
  type JsonValue,
  type PointRow,
  type RelatorioSnapshot,
  type SheetPointFinding,
} from '@app/domain';
import { portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { cleanup, configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type AppDatabase } from '../../db/schema.ts';
import { useLiveQuery } from '../../db/live.ts';
import { applyPulled } from '../../db/sync-store.ts';
import type { SessionState } from '../../state/session.tsx';
import { SyncContext } from '../../state/sync.tsx';
import { ToastProvider } from '../../state/toast.tsx';
import { makeSyncState } from '../../test/sync-state.ts';
import { ConclusaoSection } from './conclusao-section.tsx';
import { EnsaiosSection } from './ensaios-section.tsx';
import type { FichaApi } from './ficha-api.ts';
import { MeasurementTests } from './measurement-test-section.tsx';
import { NotTestedBand } from './not-tested-band.tsx';
import { PointPlace } from './point-place.tsx';
import { SheetReadOnlyProvider } from './sheet-read-only.tsx';
import type { CaptureTarget } from './use-photo-capture.ts';

/*
 * Batch e24p (Story 24.17, `60-ficha.html` `.e24-point-place`): "Criar ponto de atenção" on a test and
 * on the Conclusão step. The place offers the action while no point of the finding is live, opens the
 * point editor with the kernel's text and action (and the helper under the action), and stores one
 * point of the finding's origin, test and equipment only on "Concluir"; once the point exists it names
 * it and offers no second one; a read-only sheet offers nothing. The sheet draws the place in three
 * spots: under a test's tables (an NA test's band too), under a measurement test, and under the
 * Conclusão pair. The finding itself is the kernel's (`sheetPointFindings`, its own suite).
 */

configure({ asyncUtilTimeout: 5000 });
afterEach(cleanup);

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
  aiFeatures: true,
  database,
  signIn: vi.fn(),
  signOut: vi.fn(async () => {}),
  saveRegistration: vi.fn(async () => {}),
  savePhotoLocation: vi.fn(async () => {}),
  recoveryNeeded: false,
  settled: true,
  dismissRecovery: vi.fn(),
});

vi.mock('../../state/session.tsx', () => ({ useSession: () => session() }));
vi.mock('../../state/drafts.tsx', () => ({ useDraftSource: () => () => Promise.resolve(), useDrafts: () => ({ register: () => () => undefined }) }));

const SNAPSHOT: RelatorioSnapshot = buildSnapshot(replay(portoSeguroSmall.log), RELATORIO);
const EQUIPMENT = SNAPSHOT.blocks.find((block) => block.equipment_id !== null)!.equipment_id!;
const FINDING = 'Ensaio de isolação: 300 MΩ em Fase A–Massa (critério: >400 MΩ)';
const ACTION = 'Limpar e secar o circuito antes de uma nova medição.';

const finding = (fields: Partial<SheetPointFinding> = {}): SheetPointFinding => ({
  origin: 'reading',
  testKey: 'isolacao',
  place: 'test',
  text: FINDING,
  action: ACTION,
  actionHelper: 'Da recomendação do ensaio · editável',
  positions: [],
  ...fields,
});

async function freshDatabase(): Promise<AppDatabase> {
  const name = `019966c1-2417-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  await openDatabase(name).delete();
  const db = openDatabase(name);
  await applyPulled(db, portoSeguroSmall.log);
  await db.outbox.clear();
  return db;
}

function renderPlace(shown: SheetPointFinding, readOnly = false) {
  return render(
    <MemoryRouter>
      <SyncContext value={makeSyncState()}>
        <ToastProvider>
          <SheetReadOnlyProvider value={readOnly}>
            <PointPlace relatorioId={RELATORIO} snapshot={SNAPSHOT} equipmentId={EQUIPMENT} finding={shown} />
          </SheetReadOnlyProvider>
        </ToastProvider>
      </SyncContext>
    </MemoryRouter>,
  );
}

describe('24.17-UNIT web: the place of "Criar ponto de atenção"', () => {
  it('offers the action; the editor opens with the finding as its text, the recommendation as its action and the helper; "Concluir" stores one point of the finding', async () => {
    database = await freshDatabase();
    const { container } = renderPlace(finding());
    const place = container.querySelector<HTMLElement>('.e24-point-place')!;
    expect(place).not.toHaveClass('has-point');
    expect(place.querySelector('.nc-point-ref')).toBeNull();
    await userEvent.click(within(place).getByRole('button', { name: 'Criar ponto de atenção' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.querySelector('.poa-text-area')).toHaveTextContent(FINDING);
    const action = within(dialog).getByRole('textbox', { name: 'Ação recomendada' });
    expect(action).toHaveValue(ACTION);
    expect(action).toHaveAccessibleDescription('Da recomendação do ensaio · editável');
    // Nothing is stored before "Concluir".
    expect(await database.outbox.count()).toBe(0);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Concluir' }));
    await waitFor(async () => expect((await database!.outbox.toArray()).some((op) => op.kind === 'create' && op.path.startsWith('point/'))).toBe(true));
    const creates = (await database.outbox.toArray()).filter((op) => op.kind === 'create' && op.path.startsWith('point/'));
    expect(creates).toHaveLength(1);
    expect(creates[0]!.value as unknown as PointRow).toMatchObject({ relatorio_id: RELATORIO, equipment_id: EQUIPMENT, origin: 'reading', test_key: 'isolacao', text: FINDING, action: ACTION });
  });

  it('with no recommendation the action starts empty and no helper shows (v1 to v13, a restricted test)', async () => {
    database = await freshDatabase();
    const { container } = renderPlace(finding({ origin: 'restricao', text: 'Ensaio de isolação: valor dentro do critério, com restrição (x)', action: '', actionHelper: null }));
    await userEvent.click(within(container.querySelector<HTMLElement>('.e24-point-place')!).getByRole('button', { name: 'Criar ponto de atenção' }));
    const dialog = await screen.findByRole('dialog');
    const action = within(dialog).getByRole('textbox', { name: 'Ação recomendada' });
    expect(action).toHaveValue('');
    expect(action).not.toHaveAttribute('aria-describedby');
    expect(within(dialog).queryByText('Da recomendação do ensaio · editável')).toBeNull();
  });

  it('once a point of the finding is live the place names it and offers no second one', () => {
    database = null;
    const { container } = renderPlace(finding({ positions: [3] }));
    const place = container.querySelector<HTMLElement>('.e24-point-place')!;
    expect(place).toHaveClass('has-point');
    expect(place.querySelector('.nc-point-ref')).toHaveTextContent('Ponto de atenção 3');
    expect(within(place).queryByRole('button')).toBeNull();
  });

  it('a read-only sheet offers nothing', () => {
    database = null;
    const { container } = renderPlace(finding(), true);
    expect(container.querySelector('.e24-point-place')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Criar ponto de atenção' })).toBeNull();
  });
});

// --- the three spots of the sheet -----------------------------------------------------------------

const id = (n: number) => `019966b0-2417-7400-8000-${n.toString(16).padStart(12, '0')}`;
const BLOCK = id(1);
const stored = (value: JsonValue): Cell => ({ value, source_suggestion_id: null, op_id: id(9) });
const api: FichaApi = {
  relatorioId: id(4),
  projectId: id(5),
  blockId: BLOCK,
  author: { id: 'u1', companyId: 'c1' },
  commit: vi.fn(async () => undefined),
  edit: vi.fn(async () => null),
  undoable: vi.fn(),
  announce: vi.fn(),
};
const marker = (where: string) => <p data-testid="place">{where}</p>;

function sheet(type: EquipmentBlockType, version = 'v13'): BlockRow {
  return newEquipmentBlock({ definitions: EMPTY_DEFINITION_CONTEXT, blockId: BLOCK, equipmentId: id(2), relatorioId: id(4), projectId: id(5), locationId: id(3), type, tag: 'T-1', seedVersion: version, orderKey: 'a0' }).block;
}

function snapshotOf(block: BlockRow): RelatorioSnapshot {
  return {
    relatorio: { id: id(4), seed_version: block.seed_version, setup: { service_end: null, instrument_ids: [] }, export: { scheme: 'ordem_de_campo' } },
    blocks: [block],
    equipment: [],
    locations: [],
    files: [],
    points: [],
    suggestions: [],
  } as unknown as RelatorioSnapshot;
}

function renderEnsaios(block: BlockRow, definition: BlockDefinition) {
  const targetFor = (testKey: string): CaptureTarget => ({ blockId: BLOCK, itemKey: testKey, caption: null }) as unknown as CaptureTarget;
  return render(
    <MemoryRouter>
      <SyncContext value={makeSyncState()}>
        <ToastProvider>
          <EnsaiosSection
            api={api}
            state={new Map() as EntityState}
            snapshot={snapshotOf(block)}
            block={block}
            definition={definition}
            instruments={[]}
            className="ficha-step"
            onFocus={() => undefined}
            primaryId="ficha-primary"
            targetFor={targetFor}
            visit={NO_VISIT_CONTEXT}
            pointPlace={(testKey) => (testKey === 'isolacao' || testKey === 'cta_isolamento_principal' ? marker(testKey) : null)}
          />
        </ToastProvider>
      </SyncContext>
    </MemoryRouter>,
  );
}

const sectionOf = (container: HTMLElement, testKey: string) => container.querySelector<HTMLElement>(`section[data-test-key="${testKey}"]`)!;

describe('24.17-UNIT web: where the sheet draws the place', () => {
  it('under a seeded test\'s tables, inside its section, and nowhere else', () => {
    database = null;
    const block = sheet('cabos_entrada');
    const { container } = renderEnsaios(block, getDefinition('v13', 'cabine_primaria', 'cabos_entrada'));
    const places = screen.getAllByTestId('place');
    expect(places).toHaveLength(1);
    const section = sectionOf(container, 'isolacao');
    expect(section).toContainElement(places[0]!);
    // After the test's table.
    const table = section.querySelector('table')!;
    expect(table.compareDocumentPosition(places[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('under the band of a test the nameplate makes not applicable (a failed prerequisite\'s place)', () => {
    database = null;
    const seccionadora = getDefinition('v13', 'cabine_primaria', 'chave_seccionadora');
    const ABOVE = { op: 'above' as const, field: 'corrente_nominal', value: 1000, unmet: 'de até 1.000 A' };
    const definition = { ...seccionadora, tests: seccionadora.tests.map((test) => ({ ...test, applies_when: ABOVE })) } as BlockDefinition;
    const base = sheet('chave_seccionadora');
    const block = { ...base, sheet: { ...base.sheet, nameplate: { ...base.sheet.nameplate, corrente_nominal: stored({ raw: '630', unit: 'A', state: 'measured' }) } } };
    const { container } = renderEnsaios(block, definition);
    const section = sectionOf(container, 'isolacao');
    expect(section).toHaveAttribute('data-applicability', 'na');
    expect(section).toContainElement(screen.getByTestId('place'));
    expect(section.querySelector('.v13-na-band')!.compareDocumentPosition(screen.getByTestId('place')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('at the end of a measurement test\'s body', () => {
    database = null;
    const block = sheet('chave_transferencia_automatica');
    const definition = getDefinition('v13', 'cabine_primaria', 'chave_transferencia_automatica');
    const { container } = render(
      <MemoryRouter>
        <ToastProvider>
          <MeasurementTests
            api={api}
            snapshot={snapshotOf(block)}
            block={block}
            definition={definition}
            evaluations={evaluateSheetMeasurements(block, definition)}
            instruments={[]}
            onRun={() => false}
            pointPlace={(testKey) => (testKey === 'cta_isolamento_principal' ? marker(testKey) : null)}
          />
        </ToastProvider>
      </MemoryRouter>,
    );
    const body = sectionOf(container, 'cta_isolamento_principal').querySelector('.lib-test-body')!;
    expect(body.lastElementChild).toBe(screen.getByTestId('place'));
    expect(screen.getAllByTestId('place')).toHaveLength(1);
  });

  it('under the Conclusão pair', () => {
    database = null;
    const block = sheet('cabos_entrada', 'v14');
    const { container } = render(
      <ToastProvider>
        <ConclusaoSection
          api={api}
          block={block}
          definition={getDefinition('v14', 'cabine_primaria', 'cabos_entrada')}
          tag="CE-01"
          className="ficha-step"
          onFocus={() => undefined}
          section9={{ ref: 'seção 9', prints: true, absent: 'não sai no documento' }}
          visit={NO_VISIT_CONTEXT}
          pointPlace={marker('conclusao')}
        />
      </ToastProvider>,
    );
    const control = container.querySelector('#ficha-conc .conclusion-control')!;
    expect(control.nextElementSibling).toBe(screen.getByTestId('place'));
  });
});

// --- fix batch e24x (D1): the editor stays open while its autosave creates the point --------------

/** The relatório's live points as the device stores them (the store's echo of the editor's own writes). */
function useLivePoints(db: AppDatabase): PointRow[] {
  return (
    useLiveQuery(async () => (await db.entities.toArray()).filter((record) => record.entity === 'point' && record.removed_at === null).map((record) => record.row as unknown as PointRow), [db]) ?? []
  );
}

/** The place over a live snapshot: the finding's positions follow the stored points, as the ficha's `sheetPointFindings` does. */
function LivePlace({ db }: { db: AppDatabase }) {
  const points = useLivePoints(db);
  const positions = points.flatMap((point, i) => (point.origin === 'reading' && point.test_key === 'isolacao' && point.equipment_id === EQUIPMENT ? [i + 1] : []));
  return <PointPlace relatorioId={RELATORIO} snapshot={{ ...SNAPSHOT, points }} equipmentId={EQUIPMENT} finding={finding({ positions })} />;
}

const BAND_BLOCK = { ...SNAPSHOT.blocks.find((block) => block.equipment_id === EQUIPMENT)!, not_tested: { reason: 'impossibilidade_desligamento', text: null, at: '2026-11-11T12:00:00.000Z', by: USER } } as BlockRow;

function LiveBand({ db }: { db: AppDatabase }) {
  const points = useLivePoints(db);
  return <NotTestedBand api={api} block={BAND_BLOCK} snapshot={{ ...SNAPSHOT, points }} />;
}

function renderLive(ui: ReactNode) {
  return render(
    <MemoryRouter>
      <SyncContext value={makeSyncState()}>
        <ToastProvider>
          <SheetReadOnlyProvider value={false}>{ui}</SheetReadOnlyProvider>
        </ToastProvider>
      </SyncContext>
    </MemoryRouter>,
  );
}

const storedCreates = async () => (await database!.outbox.toArray()).filter((op) => op.kind === 'create' && op.path.startsWith('point/'));

describe('e24x-UNIT D1 the point editor stays open while its autosave creates the point', () => {
  it('a test\'s place: a word typed in Ação, the autosave stores the point, the dialog stays open; "Concluir" closes it with the focus on "Ponto de atenção N", nothing typed lost', async () => {
    database = await freshDatabase();
    const { container } = renderLive(<LivePlace db={database} />);
    const place = container.querySelector<HTMLElement>('.e24-point-place')!;
    await userEvent.click(within(place).getByRole('button', { name: 'Criar ponto de atenção' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Ação recomendada' }), ' Hoje');
    // The autosave (500 ms) creates the point while the editor is open, and the place now names it.
    await waitFor(async () => expect(await storedCreates()).toHaveLength(1));
    await waitFor(() => expect(container.querySelector('.e24-point-place .nc-point-ref')).not.toBeNull());
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(within(dialog).getByRole('textbox', { name: 'Ação recomendada' })).toHaveValue(`${ACTION} Hoje`);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Concluir' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const mark = container.querySelector<HTMLElement>('.e24-point-place .nc-point-ref')!;
    await waitFor(() => expect(mark).toHaveFocus());
    expect(within(container.querySelector<HTMLElement>('.e24-point-place')!).queryByRole('button', { name: 'Criar ponto de atenção' })).toBeNull();
    const creates = await storedCreates();
    expect(creates).toHaveLength(1);
    const stored = await database.entities.get(['point', (creates[0]!.value as unknown as PointRow).id]);
    expect(stored?.row).toMatchObject({ origin: 'reading', test_key: 'isolacao', action: `${ACTION} Hoje` });
  });

  it('the Não ensaiado band: the same, the focus on "Desfazer" once the point stands', async () => {
    database = await freshDatabase();
    renderLive(<LiveBand db={database} />);
    await userEvent.click(screen.getByRole('button', { name: 'Criar ponto de atenção' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Ação recomendada' }), 'Agendar');
    await waitFor(async () => expect(await storedCreates()).toHaveLength(1));
    // Once the point stands the band offers no action, but the open editor stays.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Criar ponto de atenção', hidden: true })).toBeNull());
    expect(screen.getByRole('dialog')).toBe(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Concluir' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Desfazer' })).toHaveFocus());
    const creates = await storedCreates();
    expect(creates).toHaveLength(1);
    expect(creates[0]!.value as unknown as PointRow).toMatchObject({ origin: 'not_tested', equipment_id: EQUIPMENT });
  });
});
