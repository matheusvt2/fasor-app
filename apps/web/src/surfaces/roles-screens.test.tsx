import 'fake-indexeddb/auto';
import {
  EMPTY_DEFINITION_CONTEXT,
  instantiateTemplate,
  permissionRefusalText,
  READ_ONLY_BANNER_TEXT,
  standardTemplate,
  systemRoleRow,
  type BlockRow,
  type RoleRow,
  type SystemRoleId,
} from '@app/domain';
import { BLOCK_CHAVE_ID, portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copy } from '../copy/pt-br.ts';
import { toRecord } from '../db/commit.ts';
import { openDatabase, type AppDatabase } from '../db/schema.ts';
import { applyPulled } from '../db/sync-store.ts';
import { BackTargetProvider } from '../state/back-target.tsx';
import { ExtraBannerProvider } from '../state/extra-banner.tsx';
import { PermissionsFixture } from '../state/permissions.tsx';
import type { SessionState } from '../state/session.tsx';
import { SyncContext } from '../state/sync.tsx';
import { ToastOutlet, ToastProvider } from '../state/toast.tsx';
import { makeSyncState } from '../test/sync-state.ts';
import { FichaSurface } from './ficha/ficha-surface.tsx';
import { HomeSurface } from './home/home-surface.tsx';
import { GallerySurface } from './photos/gallery-surface.tsx';
import { PointsSurface } from './points/points-surface.tsx';
import { SectionTextSurface } from './relatorio/section-text-surface.tsx';
import { SumarioSurface } from './relatorio/sumario-surface.tsx';

/*
 * Story 26.5 (`21-home-campo.html`, `44-sumario-sem-emissao.html`, `62-ficha-consulta.html`): each
 * surface under a known seeded role (`PermissionsFixture`). Hidden: a module the role lacks. Disabled
 * with one line of reason: a control of a screen the role uses. Read-only: a relatório the role
 * cannot fill, with no op entering the outbox.
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

vi.mock('../state/session.tsx', () => ({ useSession: () => session() }));
vi.mock('../state/drafts.tsx', () => ({ useDraftSource: () => async () => undefined, useDrafts: () => ({ register: () => () => undefined, persistOne: async () => undefined }) }));

configure({ asyncUtilTimeout: 5000 });

function sectionBlocks(): BlockRow[] {
  let n = 0;
  const { drafts } = instantiateTemplate(
    standardTemplate({ id: '019966c1-0265-7000-8000-000000000001' }),
    { id: portoSeguroSmall.projectId },
    { service_start: null, service_end: null, existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
    { newId: () => `019966c1-0266-7000-8000-${(++n).toString(16).padStart(12, '0')}`, actorId: USER, companyId: COMPANY },
  );
  return drafts
    .filter((d) => d.path.startsWith('block/'))
    .map((d) => d.value as unknown as BlockRow)
    .filter((b) => b.location_id === null)
    .map((b) => ({ ...b, relatorio_id: RELATORIO, created_by: USER }));
}

async function emptyDb(): Promise<AppDatabase> {
  const user = `019966c1-0267-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  await openDatabase(user).delete();
  return openDatabase(user);
}

async function fixtureDb(): Promise<{ db: AppDatabase; sections: BlockRow[] }> {
  const db = await emptyDb();
  await applyPulled(db, portoSeguroSmall.log);
  const sections = sectionBlocks();
  await db.entities.bulkPut(sections.map((b) => toRecord(`block:${b.id}`, b)));
  return { db, sections };
}

const role = (system: SystemRoleId): RoleRow => systemRoleRow(system);

function renderAt(path: string, route: string, element: ReactElement, as: RoleRow) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SyncContext value={makeSyncState()}>
        <ToastProvider>
          <PermissionsFixture role={as}>
            <BackTargetProvider>
              <ExtraBannerProvider>
                <Routes>
                  <Route path={route} element={element} />
                </Routes>
                <ToastOutlet />
              </ExtraBannerProvider>
            </BackTargetProvider>
          </PermissionsFixture>
        </ToastProvider>
      </SyncContext>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  database?.close();
  database = null;
});

describe('26.5-UNIT-006 Home by role', () => {
  it('the Engenheiro de Campo: no Atalhos at all; "Novo relatório" disabled with the kernel\'s reason', async () => {
    database = await emptyDb();
    const { container } = renderAt('/', '/', <HomeSurface />, role('engenheiro_de_campo'));
    const button = await screen.findByRole('button', { name: 'Novo relatório' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(container.querySelector('.home-new .btn-reason')).toHaveTextContent(permissionRefusalText('relatorio.create'));
    expect(container.querySelector('.shortcut-row')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Atalhos' })).toBeNull();
  });

  it('the Gestor do Projeto: both shortcuts; the Responsável Técnico: Cadastros only', async () => {
    database = await emptyDb();
    renderAt('/', '/', <HomeSurface />, role('gestor_do_projeto'));
    expect(await screen.findByRole('link', { name: /Templates/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Cadastros/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Novo relatório' })).not.toHaveAttribute('aria-disabled');
    cleanup();
    renderAt('/', '/', <HomeSurface />, role('responsavel_tecnico'));
    expect(await screen.findByRole('link', { name: /Cadastros/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Templates/ })).toBeNull();
  });
});

describe('26.5-UNIT-007 the Sumário by role', () => {
  it('the Engenheiro de Campo: "Pré-visualizar" and "Gerar relatório" disabled sharing one reason line; the rows take edits', async () => {
    ({ db: database } = await fixtureDb());
    const { container } = renderAt(`/relatorio/${RELATORIO}`, '/relatorio/:id', <SumarioSurface />, role('engenheiro_de_campo'));
    const bar = await waitFor(() => {
      const found = container.querySelector<HTMLElement>('.sticky-action-bar');
      expect(found).not.toBeNull();
      return found!;
    });
    const generate = within(bar).getByRole('button', { name: 'Gerar relatório' });
    const preview = within(bar).getByRole('button', { name: 'Pré-visualizar' });
    expect(generate).toHaveAttribute('aria-disabled', 'true');
    expect(preview).toHaveAttribute('aria-disabled', 'true');
    const reasons = [...bar.querySelectorAll('.btn-reason')].filter((node) => node.textContent === permissionRefusalText('relatorio.issue'));
    expect(reasons).toHaveLength(1);
    expect(generate.getAttribute('aria-describedby')).toContain(reasons[0]!.id);
    expect(preview.getAttribute('aria-describedby')).toContain(reasons[0]!.id);
    // He fills: the rows keep their Overflow.
    expect(container.querySelectorAll('.sumario .sum-row .overflow-trigger').length).toBeGreaterThan(0);
  });

  it('the Consulta: no row takes an edit (no Overflow, the Position box read-only)', async () => {
    ({ db: database } = await fixtureDb());
    const { container } = renderAt(`/relatorio/${RELATORIO}`, '/relatorio/:id', <SumarioSurface />, role('consulta'));
    await waitFor(() => expect(container.querySelectorAll('.sumario .sum-row').length).toBeGreaterThan(0));
    expect(container.querySelectorAll('.sumario .sum-row .overflow-trigger')).toHaveLength(0);
    const boxes = [...container.querySelectorAll<HTMLInputElement>('.sumario .sum-row input.pos-box')];
    expect(boxes.length).toBeGreaterThan(0);
    for (const box of boxes) expect(box.readOnly).toBe(true);
  });
});

describe('26.5-UNIT-008 a relatório the role cannot fill', () => {
  it('the ficha opens read-only under one Banner, and a press on a cell enters no op in the outbox', async () => {
    ({ db: database } = await fixtureDb());
    const { container } = renderAt(`/relatorio/${RELATORIO}/ficha/${BLOCK_CHAVE_ID}`, '/relatorio/:id/ficha/:blockId', <FichaSurface />, role('consulta'));
    await waitFor(() => expect(container.querySelector('.fc-banner')).toHaveTextContent(READ_ONLY_BANNER_TEXT));
    expect(container.querySelectorAll('.fc-banner')).toHaveLength(1);
    expect(container.querySelector('.ficha-main .section.is-readonly')).not.toBeNull();
    expect(container.querySelector('.bar-buttons.has-camera')).toBeNull();
    expect(screen.queryByRole('button', { name: /Adicionar fotos/ })).toBeNull();
    expect(container.querySelector('.ficha-head-side .overflow-trigger')).toBeNull();
    expect(container.querySelector('.section-stepper')).not.toBeNull();
    // No section draws a reason of its own: the Banner says it once.
    expect(container.textContent).not.toContain(copy.ficha.checklist.readOnlyReason);
    for (const cell of container.querySelectorAll<HTMLElement>('.tri-state .seg, .measurement-field, [role="textbox"]')) fireEvent.click(cell);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await database!.outbox.count()).toBe(0);
  });

  it('the points open with no "Criar ponto de atenção"', async () => {
    ({ db: database } = await fixtureDb());
    const { container } = renderAt(`/relatorio/${RELATORIO}/pontos`, '/relatorio/:id/pontos', <PointsSurface />, role('consulta'));
    await waitFor(() => expect(container.querySelector('.fc-banner')).toHaveTextContent(READ_ONLY_BANNER_TEXT));
    expect(container.querySelector('.sticky-action-bar')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Criar/ })).toBeNull();
  });

  it('the photos open with no camera, no "Adicionar fotos" and no caption action', async () => {
    ({ db: database } = await fixtureDb());
    const { container } = renderAt(`/relatorio/${RELATORIO}/fotos`, '/relatorio/:id/fotos', <GallerySurface />, role('consulta'));
    await waitFor(() => expect(container.querySelector('.fc-banner')).toHaveTextContent(READ_ONLY_BANNER_TEXT));
    expect(container.querySelector('.gallery-bar')).toBeNull();
    expect(screen.queryByRole('button', { name: /Adicionar fotos/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Legendar/ })).toBeNull();
  });

  it('a section text reads as text: no toolbar, no variable chips, no "Restaurar"', async () => {
    const fixture = await fixtureDb();
    database = fixture.db;
    const section2 = fixture.sections.find((b) => b.block_type === 'section_2')!;
    const { container } = renderAt(`/relatorio/${RELATORIO}/secao/${section2.id}`, '/relatorio/:id/secao/:blockId', <SectionTextSurface />, role('consulta'));
    await waitFor(() => expect(container.querySelector('.fc-banner')).toHaveTextContent(READ_ONLY_BANNER_TEXT));
    const area = container.querySelector<HTMLElement>('.rt-area')!;
    expect(area.getAttribute('contenteditable')).toBe('false');
    expect(container.querySelector('.rt-toolbar')).toBeNull();
    expect(container.querySelector('.chip-row')).toBeNull();
    expect(screen.queryByRole('button', { name: /Restaurar/ })).toBeNull();
  });
});
