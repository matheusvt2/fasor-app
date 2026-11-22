import 'fake-indexeddb/auto';
import { ADMIN_ROLE_ID, SYSTEM_ROLE_ROW_IDS, systemRoleRow, systemRoleRows, type AdminUserView, type EntityRow, type RoleRow, type UserRow } from '@app/domain';
import { cleanup, configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toRecord } from '../../db/commit.ts';
import { openDatabase, type AppDatabase } from '../../db/schema.ts';
import { PermissionsFixture } from '../../state/permissions.tsx';
import type { SessionState } from '../../state/session.tsx';
import { SyncContext, type SyncState } from '../../state/sync.tsx';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import { axe } from '../../test-axe.ts';
import { makeSyncState } from '../../test/sync-state.ts';
import { UsersSurface } from './users-surface.tsx';

/*
 * Story 26.9 (`92-usuarios.html`): the Usuários screen over a device store holding the company's
 * user and role rows, with the Admin routes faked (`api/admin-users-client.ts`). The list, the
 * filters, the row menu by status, the confirmations, the last-Admin refusal, each route error and
 * the offline state.
 */

const client = vi.hoisted(() => ({
  listAdminUsers: vi.fn(),
  createAdminUser: vi.fn(),
  editAdminUser: vi.fn(),
  adminUserAction: vi.fn(),
}));
vi.mock('../../api/admin-users-client.ts', () => client);

const BRUNO = '019966b0-0270-7000-8000-0000000000b1';
const EDUARDO = '019966b0-0270-7000-8000-0000000000b2';
const FERNANDA = '019966b0-0270-7000-8000-0000000000b3';
const PAULO = '019966b0-0270-7000-8000-0000000000b4';
const COMPANY = '019966b0-0270-7000-8000-0000000000c0';
const CAMPO = SYSTEM_ROLE_ROW_IDS.engenheiro_de_campo;
const CONSULTA = SYSTEM_ROLE_ROW_IDS.consulta;
const ESTAGIARIO: RoleRow = { id: '019966b0-0270-7000-8000-0000000000e1', name: 'Estagiário', permissions: ['relatorio.view', 'relatorio.fill'], removed_at: null };

let database: AppDatabase | null = null;
let counter = 0;
let online = true;

const session = () =>
  ({
    status: 'signed-in',
    user: { id: BRUNO, name: 'Bruno Matsui', email: 'bruno@exemplo.com.br', companyId: COMPANY, companyName: 'Exemplo Engenharia', council: null, registrationNumber: null, title: null },
    online,
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
  }) as unknown as SessionState;

vi.mock('../../state/session.tsx', () => ({ useSession: () => session() }));

configure({ asyncUtilTimeout: 5000 });

const user = (id: string, name: string, email: string, role_id: string, status?: UserRow['status']): UserRow => ({
  id,
  name,
  email,
  council: null,
  registration_number: null,
  title: null,
  photo_location_enabled: true,
  role_id,
  ...(status === undefined ? {} : { status }),
});

const view = (id: string, name: string, email: string, role: RoleRow, status: AdminUserView['status'], last_sign_in: string | null = null): AdminUserView => ({
  id,
  name,
  email,
  role: { id: role.id, name: role.name },
  status,
  last_sign_in,
});

const ROWS = [
  user(BRUNO, 'Bruno Matsui', 'bruno@exemplo.com.br', ADMIN_ROLE_ID, 'active'),
  user(EDUARDO, 'Eduardo Prado', 'eduardo@exemplo.com.br', CAMPO, 'active'),
  user(FERNANDA, 'Fernanda Rocha', 'fernanda@exemplo.com.br', CONSULTA, 'invited'),
  user(PAULO, 'Paulo Nunes', 'paulo@exemplo.com.br', CAMPO, 'removed'),
];

async function seededDb(rows: readonly UserRow[] = ROWS): Promise<AppDatabase> {
  const name = `019966b0-0271-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  await openDatabase(name).delete();
  const db = openDatabase(name);
  await db.entities.bulkPut([
    ...rows.map((row) => toRecord(`user:${row.id}`, row as unknown as EntityRow)),
    ...[...systemRoleRows(), ESTAGIARIO].map((role) => toRecord(`role:${role.id}`, role as unknown as EntityRow)),
  ]);
  return db;
}

function renderSurface(sync: SyncState = makeSyncState()) {
  return render(
    <MemoryRouter initialEntries={['/usuarios']}>
      <SyncContext value={sync}>
        <ToastProvider>
          <PermissionsFixture role={systemRoleRow('admin')}>
            <Routes>
              <Route path="/usuarios" element={<UsersSurface />} />
            </Routes>
            <ToastOutlet />
          </PermissionsFixture>
        </ToastProvider>
      </SyncContext>
    </MemoryRouter>,
  );
}

/** The list row of a user, by the name it shows. */
function rowOf(name: string): HTMLElement {
  const row = screen.queryAllByRole('listitem').find((item) => item.querySelector('.rr-primary')?.firstChild?.textContent === name);
  if (row === undefined) throw new Error(`no row for ${name}`);
  return row;
}

/** The names the list shows, in order. */
const names = () => screen.queryAllByRole('listitem').map((item) => item.querySelector('.rr-primary')?.firstChild?.textContent ?? '');
const answer = (user: AdminUserView, extra: Record<string, unknown> = {}) => ({ ok: true, value: { user, ...extra } });

beforeEach(() => {
  online = true;
  client.listAdminUsers.mockReset();
  client.createAdminUser.mockReset();
  client.editAdminUser.mockReset();
  client.adminUserAction.mockReset();
  client.listAdminUsers.mockResolvedValue({
    ok: true,
    value: [
      view(BRUNO, 'Bruno Matsui', 'bruno@exemplo.com.br', systemRoleRow('admin'), 'active', '2026-11-21T11:12:00.000Z'),
      view(EDUARDO, 'Eduardo Prado', 'eduardo@exemplo.com.br', systemRoleRow('engenheiro_de_campo'), 'active'),
    ],
  });
});

afterEach(() => {
  cleanup();
  database?.close();
  database = null;
});

describe('26.9-UNIT-020 the list', () => {
  it('renders the device rows overlaid by the route: pills, "· você", the count line; "Todos" leaves the removed out', async () => {
    database = await seededDb();
    const { container } = renderSurface();
    await screen.findByText('Eduardo Prado');
    expect(client.listAdminUsers).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { level: 2, name: 'Usuários' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Usuários' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Papéis e permissões' })).toHaveAttribute('href', '/usuarios/papeis');

    const bruno = rowOf('Bruno Matsui');
    expect(within(bruno).getByText('· você')).toBeVisible();
    expect(within(bruno).getByText('bruno@exemplo.com.br')).toBeVisible();
    expect(bruno.querySelector('.status-pill')).toHaveAttribute('data-status', 'ativo');
    expect(bruno.querySelector('.status-pill')).toHaveTextContent('Ativo');
    expect(bruno).toHaveTextContent(/Admin · último acesso/);
    const fernanda = rowOf('Fernanda Rocha');
    expect(fernanda).toHaveAttribute('data-status', 'convite');
    expect(fernanda.querySelector('.status-pill')).toHaveTextContent('Convite pendente');
    expect(within(fernanda).getByText('Consulta')).toBeVisible();
    expect(names()).not.toContain('Paulo Nunes');
    expect(container.querySelector('.usr-count')).toHaveTextContent('3 usuários · 1 removido, no filtro Removido');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('the Removido chip shows the removed with the frame\'s sentence; Papel narrows by role; an empty result offers "Limpar filtros"', async () => {
    database = await seededDb();
    const { container } = renderSurface();
    await screen.findByText('Eduardo Prado');
    const chips = screen.getByRole('radiogroup', { name: 'Situação' });
    expect(within(chips).getAllByRole('radio').map((chip) => chip.textContent)).toEqual(['Todos', 'Ativo', 'Convite pendente', 'Pausado', 'Removido']);
    expect(within(chips).getByRole('radio', { name: 'Todos' })).toHaveAttribute('aria-checked', 'true');

    expect(names()).toEqual(['Bruno Matsui', 'Eduardo Prado', 'Fernanda Rocha']);
    await userEvent.click(within(chips).getByRole('radio', { name: 'Removido' }));
    expect(names()).toEqual(['Paulo Nunes']);
    expect(container.querySelector('.usr-count')).toHaveTextContent('1 usuário removido. O nome continua nos relatórios que ele preencheu ou assinou.');

    await userEvent.click(within(chips).getByRole('radio', { name: 'Todos' }));
    await userEvent.click(screen.getByRole('button', { name: /Abrir lista/ }));
    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['Todos os papéis', 'Admin', 'Engenheiro de Campo', 'Gestor do Projeto', 'Responsável Técnico', 'Consulta', 'Estagiáriocriado pela empresa']);
    await userEvent.click(screen.getByRole('option', { name: /Engenheiro de Campo/ }));
    expect(names()).toEqual(['Eduardo Prado']);

    await userEvent.click(within(chips).getByRole('radio', { name: 'Convite pendente' }));
    expect(screen.getByText('Nenhum usuário com estes filtros.')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(within(chips).getByRole('radio', { name: 'Todos' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('combobox', { name: 'Papel' })).toHaveValue('Todos os papéis');
    expect(names()).toEqual(['Bruno Matsui', 'Eduardo Prado', 'Fernanda Rocha']);
  });

  it('the row menu offers the frame\'s items by status, Remover last', async () => {
    database = await seededDb();
    renderSurface();
    await screen.findByText('Eduardo Prado');
    const items = async (name: string) => {
      await userEvent.click(screen.getByRole('button', { name: `Mais opções de ${name}` }));
      const labels = (await screen.findAllByRole('menuitem')).map((item) => item.textContent);
      await userEvent.keyboard('{Escape}');
      return labels;
    };
    expect(await items('Eduardo Prado')).toEqual(['Editar', 'Enviar redefinição de senha', 'Pausar', 'Remover']);
    expect(await items('Bruno Matsui')).toEqual(['Editar', 'Pausar', 'Remover']);
    expect(await items('Fernanda Rocha')).toEqual(['Editar', 'Reenviar convite', 'Remover']);
  });
});

describe('26.9-UNIT-021 offline', () => {
  it('the list shows from the device; "Novo usuário" and every row menu are disabled with the Banner line; nothing is asked', async () => {
    online = false;
    database = await seededDb();
    const { container } = renderSurface();
    await screen.findByText('Eduardo Prado');
    const line = container.querySelector('.usr-offline')!;
    expect(line).toHaveTextContent('Sem conexão. A lista é a da última sincronização. Criar ou alterar um usuário precisa de conexão.');
    const create = screen.getByRole('button', { name: 'Novo usuário' });
    expect(create).toHaveAttribute('aria-disabled', 'true');
    expect(create.getAttribute('aria-describedby')).toContain(line.id);
    const trigger = screen.getByRole('button', { name: 'Mais opções de Eduardo Prado' });
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(trigger);
    expect(screen.queryByRole('menu')).toBeNull();
    await userEvent.click(create);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(client.listAdminUsers).not.toHaveBeenCalled();
    expect(client.adminUserAction).not.toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('a route that does not answer at all makes the screen offline too', async () => {
    client.listAdminUsers.mockResolvedValue({ ok: false, failure: { kind: 'offline' } });
    database = await seededDb();
    renderSurface();
    await screen.findByText('Eduardo Prado');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Novo usuário' })).toHaveAttribute('aria-disabled', 'true'));
  });
});

describe('26.9-UNIT-022 the confirmations', () => {
  it('Pausar: the frame\'s dialog, Cancelar focused; the answer replaces the row, one sync, the Toast says when', async () => {
    database = await seededDb();
    const sync = makeSyncState();
    renderSurface(sync);
    await screen.findByText('Eduardo Prado');
    client.adminUserAction.mockResolvedValue(answer(view(EDUARDO, 'Eduardo Prado', 'eduardo@exemplo.com.br', systemRoleRow('engenheiro_de_campo'), 'paused')));

    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Eduardo Prado' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Pausar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Pausar Eduardo Prado?' });
    expect(dialog).toHaveTextContent(
      'Ele não entra mais até ser reativado. O aparelho dele para na próxima vez que falar com o servidor. O que ele ainda não enviou fica guardado no aparelho e é enviado depois da reativação.',
    );
    const buttons = within(dialog).getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual(['Cancelar', 'Pausar']);
    await waitFor(() => expect(buttons[0]).toHaveFocus());

    await userEvent.click(within(dialog).getByRole('button', { name: 'Pausar' }));
    await waitFor(() => expect(client.adminUserAction).toHaveBeenCalledWith('pause', EDUARDO));
    await waitFor(() => expect(rowOf('Eduardo Prado').querySelector('.status-pill')).toHaveTextContent('Pausado'));
    expect(rowOf('Eduardo Prado')).toHaveAttribute('data-status', 'pausado');
    expect(await screen.findByText('Eduardo Prado pausado. O aparelho dele para na próxima vez que falar com o servidor.')).toBeVisible();
    expect(sync.syncNow).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Eduardo Prado' }));
    expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual(['Editar', 'Reativar', 'Remover']);
  });

  it('Remover, Reativar, Reenviar convite and Enviar redefinição de senha say the frame\'s words', async () => {
    database = await seededDb();
    renderSurface();
    await screen.findByText('Eduardo Prado');
    const open = async (name: string, item: string) => {
      await userEvent.click(screen.getByRole('button', { name: `Mais opções de ${name}` }));
      await userEvent.click(await screen.findByRole('menuitem', { name: item }));
      return screen.findByRole('dialog');
    };
    let dialog = await open('Eduardo Prado', 'Remover');
    expect(dialog).toHaveAccessibleName('Remover Eduardo Prado?');
    expect(dialog).toHaveTextContent('Ele perde o acesso. O nome dele continua nos relatórios que preencheu ou assinou. Para trazê-lo de volta, use Reativar no filtro Removido.');
    expect(within(dialog).getByRole('button', { name: 'Remover' })).toHaveClass('btn-destructive');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    dialog = await open('Eduardo Prado', 'Enviar redefinição de senha');
    expect(dialog).toHaveAccessibleName('Enviar redefinição de senha?');
    expect(dialog).toHaveTextContent('Eduardo Prado recebe em eduardo@exemplo.com.br um link para criar uma senha nova. O link vale por 1 hora.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    dialog = await open('Fernanda Rocha', 'Reenviar convite');
    expect(dialog).toHaveTextContent('Fernanda Rocha recebe em fernanda@exemplo.com.br um link novo, que vale por 72 horas. O link anterior deixa de valer.');
    client.adminUserAction.mockResolvedValue(answer(view(FERNANDA, 'Fernanda Rocha', 'fernanda@exemplo.com.br', systemRoleRow('consulta'), 'invited'), { invitation: 'sent' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reenviar' }));
    expect(await screen.findByText('Convite reenviado para fernanda@exemplo.com.br. Vale por 72 horas.')).toBeVisible();
    expect(client.adminUserAction).toHaveBeenCalledWith('resend_invitation', FERNANDA);

    await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Situação' })).getByRole('radio', { name: 'Removido' }));
    dialog = await open('Paulo Nunes', 'Reativar');
    expect(dialog).toHaveAccessibleName('Reativar Paulo Nunes?');
    expect(dialog).toHaveTextContent('Ele volta a entrar com a mesma senha e o mesmo papel, Engenheiro de Campo. O que ficou guardado no aparelho dele é enviado quando ele entrar.');
  });

  it('a reset whose e-mail did not leave says so', async () => {
    database = await seededDb();
    renderSurface();
    await screen.findByText('Eduardo Prado');
    client.adminUserAction.mockResolvedValue(answer(view(EDUARDO, 'Eduardo Prado', 'eduardo@exemplo.com.br', systemRoleRow('engenheiro_de_campo'), 'active'), { reset: 'failed' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Eduardo Prado' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Enviar redefinição de senha' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText('O e-mail não saiu. Use Enviar redefinição de senha de novo.')).toBeVisible();
  });
});

describe('26.9-UNIT-023 the last Admin and the route\'s refusals', () => {
  it('the only Admin removing or pausing himself: the refusal dialog, nothing is asked', async () => {
    database = await seededDb();
    renderSurface();
    await screen.findByText('Eduardo Prado');
    for (const item of ['Remover', 'Pausar']) {
      await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Bruno Matsui' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: item }));
      const alert = await screen.findByRole('alertdialog', { name: 'Não é possível' });
      expect(alert).toHaveTextContent('Você é o único Admin ativo. Dê o papel Admin a outra pessoa antes de pausar, remover ou mudar o seu papel.');
      await userEvent.click(within(alert).getByRole('button', { name: 'Entendi' }));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    }
    expect(client.adminUserAction).not.toHaveBeenCalled();
    expect(rowOf('Bruno Matsui').querySelector('.status-pill')).toHaveTextContent('Ativo');
  });

  it('the route\'s 409 last_admin is the authority when the device could not tell', async () => {
    // A second active Admin on the device, whom the server knows paused: the device asks, the route refuses.
    database = await seededDb([...ROWS, user('019966b0-0270-7000-8000-0000000000b5', 'Rafael Lamonde', 'rafael@exemplo.com.br', ADMIN_ROLE_ID, 'active')]);
    client.listAdminUsers.mockResolvedValue({ ok: true, value: [] });
    renderSurface();
    await screen.findByText('Rafael Lamonde');
    client.adminUserAction.mockResolvedValue({ ok: false, failure: { kind: 'refused', status: 409, code: 'last_admin' } });
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Bruno Matsui' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remover' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Remover Bruno Matsui?' })).getByRole('button', { name: 'Remover' }));
    expect(await screen.findByRole('alertdialog', { name: 'Não é possível' })).toHaveTextContent('Você é o único Admin ativo.');
    expect(rowOf('Bruno Matsui').querySelector('.status-pill')).toHaveTextContent('Ativo');
  });

  it.each([
    [{ kind: 'refused', status: 409, code: 'user_state_invalid' }, 'A situação deste usuário mudou. A lista foi atualizada; confira e tente de novo.', true],
    [{ kind: 'refused', status: 404, code: 'user_not_found' }, 'Este usuário não está mais na lista da empresa. A lista foi atualizada.', true],
    [{ kind: 'refused', status: 403, code: 'forbidden' }, 'Seu papel não permite gerenciar usuários.', false],
    [{ kind: 'refused', status: 429, code: 'rate_limited' }, 'Muitos envios em pouco tempo. Espere alguns minutos e tente de novo.', false],
    [{ kind: 'refused', status: 401, code: 'user_inactive' }, 'A sua sessão terminou. Entre de novo para alterar usuários.', false],
    [{ kind: 'server', status: 503 }, 'O servidor não respondeu. Nada foi alterado; tente de novo.', false],
    [{ kind: 'offline' }, 'Sem conexão com o servidor. Nada foi alterado; tente de novo.', false],
  ])('a refusal %o says its sentence and changes nothing', async (failure, sentence, reloads) => {
    database = await seededDb();
    renderSurface();
    await screen.findByText('Eduardo Prado');
    client.adminUserAction.mockResolvedValue({ ok: false, failure });
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Eduardo Prado' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Pausar' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Pausar' }));
    expect(await screen.findByText(sentence)).toBeVisible();
    expect(rowOf('Eduardo Prado').querySelector('.status-pill')).toHaveTextContent('Ativo');
    await waitFor(() => expect(client.listAdminUsers).toHaveBeenCalledTimes(reloads ? 2 : 1));
  });
});

describe('26.9-UNIT-024 the new user and the edit, from the screen', () => {
  it('"Novo usuário" creates: the row appears as "Convite pendente" with its role, the Toast names the address', async () => {
    database = await seededDb();
    const sync = makeSyncState();
    renderSurface(sync);
    await screen.findByText('Eduardo Prado');
    const created = view('019966b0-0270-7000-8000-0000000000b9', 'Carla Mendes', 'carla@exemplo.com.br', systemRoleRow('gestor_do_projeto'), 'invited');
    client.createAdminUser.mockResolvedValue(answer(created, { invitation: 'sent' }));
    await userEvent.click(screen.getByRole('button', { name: 'Novo usuário' }));
    const dialog = await screen.findByRole('dialog', { name: 'Novo usuário' });
    await userEvent.type(within(dialog).getByLabelText('Nome'), 'Carla Mendes');
    await userEvent.type(within(dialog).getByLabelText('E-mail'), 'carla@exemplo.com.br');
    await userEvent.click(within(dialog).getByRole('radio', { name: /Gestor do Projeto/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar convite' }));
    await waitFor(() => expect(client.createAdminUser).toHaveBeenCalledWith({ name: 'Carla Mendes', email: 'carla@exemplo.com.br', role_id: SYSTEM_ROLE_ROW_IDS.gestor_do_projeto }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const row = rowOf('Carla Mendes');
    expect(row.querySelector('.status-pill')).toHaveTextContent('Convite pendente');
    expect(within(row).getByText('Gestor do Projeto')).toBeVisible();
    expect(await screen.findByText('Convite enviado para carla@exemplo.com.br. Vale por 72 horas.')).toBeVisible();
    expect(sync.syncNow).toHaveBeenCalledTimes(1);
  });

  it('an invitation that did not leave keeps the user and says to resend', async () => {
    database = await seededDb();
    renderSurface();
    await screen.findByText('Eduardo Prado');
    const created = view('019966b0-0270-7000-8000-0000000000ba', 'Diego Alves', 'diego@exemplo.com.br', systemRoleRow('engenheiro_de_campo'), 'invited');
    client.createAdminUser.mockResolvedValue(answer(created, { invitation: 'failed' }));
    await userEvent.click(screen.getByRole('button', { name: 'Novo usuário' }));
    const dialog = await screen.findByRole('dialog', { name: 'Novo usuário' });
    await userEvent.type(within(dialog).getByLabelText('Nome'), 'Diego Alves');
    await userEvent.type(within(dialog).getByLabelText('E-mail'), 'diego@exemplo.com.br');
    await userEvent.click(within(dialog).getByRole('radio', { name: /Engenheiro de Campo/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enviar convite' }));
    expect(await screen.findByText('Diego Alves foi salvo, mas o e-mail do convite não saiu. Use Reenviar convite.')).toBeVisible();
    expect(rowOf('Diego Alves').querySelector('.status-pill')).toHaveTextContent('Convite pendente');
  });

  it('Editar changes the role: the Toast says the device follows at its next sync', async () => {
    database = await seededDb();
    renderSurface();
    await screen.findByText('Eduardo Prado');
    client.editAdminUser.mockResolvedValue(answer(view(EDUARDO, 'Eduardo Prado', 'eduardo@exemplo.com.br', systemRoleRow('consulta'), 'active')));
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Eduardo Prado' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Editar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar usuário' });
    await userEvent.click(within(dialog).getByRole('radio', { name: /Consulta/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(client.editAdminUser).toHaveBeenCalledWith(EDUARDO, { role_id: CONSULTA }));
    expect(await screen.findByText('Eduardo Prado alterado. O aparelho dele segue o novo papel na próxima sincronização.')).toBeVisible();
    expect(within(rowOf('Eduardo Prado')).getByText(/^Consulta/)).toBeVisible();
  });
});
