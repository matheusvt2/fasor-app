import { ADMIN_ROLE_ID, isAdminRole, keysOf, SYSTEM_ROLE_ROW_IDS, systemRoleRows, type AdminRoleView, type PermissionKey, type RoleRow } from '@app/domain';
import { cleanup, configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminRolesResult } from '../../api/admin-roles-client.ts';
import * as client from '../../api/admin-roles-client.ts';
import { SyncContext } from '../../state/sync.tsx';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import { makeSyncState } from '../../test/sync-state.ts';
import { PapeisSurface } from './papeis-surface.tsx';

/*
 * Story 26.10 (`mockups/prototype/screens/93-papeis.html`): Papéis e permissões with the role
 * routes mocked (`api/admin-roles-client.ts`): the grid of roles by module, the locked Admin column,
 * the module switch's three states, a changed cell and the bar, the one save of the changed roles,
 * the restore, the new role's duplicate name, the rename, the refused removal and the eight roles.
 */

vi.mock('../../api/admin-roles-client.ts', () => ({
  listRoles: vi.fn(),
  saveRolePermissions: vi.fn(),
  createRole: vi.fn(),
  renameRole: vi.fn(),
  removeRole: vi.fn(),
}));

const sessionState = { online: true };
vi.mock('../../state/session.tsx', () => ({ useSession: () => sessionState }));

configure({ asyncUtilTimeout: 5000 });

const CAMPO = SYSTEM_ROLE_ROW_IDS.engenheiro_de_campo;
const CONSULTA = SYSTEM_ROLE_ROW_IDS.consulta;
const ESTAGIARIO = '019966c1-2610-7000-8000-00000000e001';
const COUNTS = [1, 2, 1, 1, 1];

const view = (row: RoleRow, user_count: number): AdminRoleView => ({ id: row.id, name: row.name, system: row.system ?? null, permissions: keysOf(row), locked: isAdminRole(row), user_count });
const custom = (id: string, name: string, permissions: PermissionKey[], user_count: number): AdminRoleView => ({ id, name, system: null, permissions, locked: false, user_count });
const SEEDED: AdminRoleView[] = systemRoleRows().map((row, index) => view(row, COUNTS[index] ?? 0));
const LIST: AdminRoleView[] = [...SEEDED, custom(ESTAGIARIO, 'Estagiário', ['relatorio.view', 'relatorio.fill'], 1)];
const ok = (roles: AdminRoleView[]): AdminRolesResult => ({ ok: true, roles });
const withRole = (roles: AdminRoleView[], id: string, permissions: PermissionKey[]) => roles.map((role) => (role.id === id ? { ...role, permissions } : role));

function renderSurface() {
  return render(
    <MemoryRouter initialEntries={['/usuarios/papeis']}>
      <ToastProvider>
        <Routes>
          <Route path="/usuarios/papeis" element={<PapeisSurface />} />
        </Routes>
        <ToastOutlet />
      </ToastProvider>
    </MemoryRouter>,
  );
}

async function ready() {
  const rendered = renderSurface();
  await screen.findByRole('table', { name: 'Permissões por papel' });
  return rendered;
}

const cellOf = (container: HTMLElement, roleId: string, label: string) => {
  const button = within(container).getByRole('switch', { name: label });
  expect(button.closest('td')).toHaveAttribute('data-role', roleId);
  return button;
};
const bar = (container: HTMLElement) => container.querySelector<HTMLElement>('.sticky-action-bar')!;
const saveButton = () => screen.getByRole('button', { name: 'Salvar alterações' });
const discardButton = () => screen.getByRole('button', { name: 'Descartar' });
const openModule = (name: string) => userEvent.click(screen.getByRole('button', { name: `Abrir ou fechar as permissões de ${name}` }));

beforeEach(() => {
  sessionState.online = true;
  vi.mocked(client.listRoles).mockResolvedValue(ok(LIST));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('26.10-WEB-001 the grid', () => {
  it('roles as columns in the list order, modules as rows, the frame\'s module names and lines', async () => {
    const { container } = await ready();
    const heads = within(container.querySelector('thead')!).getAllByRole('columnheader');
    expect(heads.map((head) => head.querySelector('.pp-role-name, .pp-role-btn')?.textContent ?? head.textContent)).toEqual([
      'Módulo',
      'Admin',
      'Engenheiro de Campo',
      'Gestor do Projeto',
      'Responsável Técnico',
      'Consulta',
      'Estagiário',
    ]);
    expect([...container.querySelectorAll('.pp-role-meta')].map((meta) => meta.textContent)).toEqual(['1 usuário', '2 usuários', '1 usuário', '1 usuário', '1 usuário', '1 usuário · criado']);
    expect([...container.querySelectorAll('tbody.pp-module .pp-mod-name')].map((name) => name.textContent)).toEqual([
      'Relatórios',
      'Preenchimento em campo',
      'Emissão',
      'Templates',
      'Tipos de equipamento',
      'Cadastros',
      'Usuários e papéis',
    ]);
    expect(container.querySelector('tbody[data-module="modelos"] .pp-mod-meta')).toHaveTextContent('A lista de templates e o compositor');
    // One-key modules carry the key's own switch; the others a module switch and a chevron.
    expect(container.querySelector('tbody[data-module="preenchimento"] .pp-label')).toHaveClass('pp-single');
    expect(container.querySelectorAll('tbody[data-module="relatorios"] .pp-key-row')).toHaveLength(3);
    expect(container.querySelector('tbody[data-module="relatorios"]')).not.toHaveClass('is-open');
    await openModule('Relatórios');
    expect(container.querySelector('tbody[data-module="relatorios"]')).toHaveClass('is-open');
    expect(screen.getByRole('button', { name: 'Abrir ou fechar as permissões de Relatórios' })).toHaveAttribute('aria-expanded', 'true');
    expect(container.querySelector('tbody[data-module="usuarios_e_papeis"] .pp-key-help')).toHaveTextContent('Quem tem esta permissão pode mudar usuários e papéis, inclusive os próprios.');
    // The tab strip as links; "Papéis e permissões" selected.
    expect(screen.getByRole('tab', { name: 'Papéis e permissões' })).toHaveAttribute('aria-selected', 'true');
  });

  it('the Admin column: every switch on and locked; a tap changes nothing; its head has no menu', async () => {
    const { container } = await ready();
    const cells = container.querySelectorAll<HTMLElement>(`.pp-cell[data-role="${ADMIN_ROLE_ID}"] .toggle`);
    // Seven module rows, and the nine key rows of the four modules of several keys.
    expect(cells.length).toBe(7 + 9);
    for (const toggle of cells) {
      expect(toggle).toHaveAttribute('aria-disabled', 'true');
      expect(toggle).toHaveAttribute('aria-checked', 'true');
      expect(toggle.getAttribute('aria-label')).toMatch(/ — Admin, sempre$/);
    }
    await userEvent.click(cells[0]!);
    expect(container.querySelectorAll('.pp-cell.is-changed')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Opções do papel Admin' })).toBeNull();
    expect(container.querySelector('.pp-admin-note')).toHaveTextContent('Admin tem todas as permissões, sempre.');
  });
});

describe('26.10-WEB-002 switches and the bar', () => {
  it('a module switch: mixed "1 de 3", a tap gives all, a tap takes all, off gives all', async () => {
    const { container } = await ready();
    const mixed = within(container).getByRole('checkbox', { name: 'Relatórios — Engenheiro de Campo, 1 de 3' });
    expect(mixed).toHaveAttribute('aria-checked', 'mixed');
    expect(mixed.closest('td')!.querySelector('.pp-count')).toHaveTextContent('1 de 3');
    await userEvent.click(mixed);
    const on = within(container).getByRole('checkbox', { name: 'Relatórios — Engenheiro de Campo' });
    expect(on).toHaveAttribute('aria-checked', 'true');
    expect(on.closest('td')).toHaveClass('is-changed');
    expect(bar(container).querySelector('.pp-dirty-line')).toHaveTextContent('2 alterações não salvas.');
    await userEvent.click(on);
    expect(on).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(on);
    expect(on).toHaveAttribute('aria-checked', 'true');
  });

  it('nothing changed: both buttons disabled with "Nenhuma alteração para salvar."; one key change marks the cell and the bar', async () => {
    const { container } = await ready();
    const line = bar(container).querySelector('.pp-dirty-line')!;
    expect(line).toHaveTextContent('Nenhuma alteração para salvar.');
    expect(saveButton()).toHaveAttribute('aria-disabled', 'true');
    expect(discardButton()).toHaveAttribute('aria-disabled', 'true');
    expect(saveButton().getAttribute('aria-describedby')).toContain(line.id);

    await openModule('Relatórios');
    const create = cellOf(container, CAMPO, 'Criar relatório — Engenheiro de Campo');
    expect(create).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(create);
    expect(create).toHaveAttribute('aria-checked', 'true');
    expect(create.closest('td')).toHaveClass('is-changed');
    expect(create.closest('td')).toHaveTextContent('alterado, não salvo');
    expect(line).toHaveTextContent('1 alteração não salva: Engenheiro de Campo · Criar relatório.');
    expect(saveButton()).not.toHaveAttribute('aria-disabled');

    await userEvent.click(discardButton());
    expect(create).toHaveAttribute('aria-checked', 'false');
    expect(line).toHaveTextContent('Nenhuma alteração para salvar.');
    expect(await screen.findByText('A grade volta ao que estava salvo')).toBeInTheDocument();
  });

  it('giving users.manage says so before saving', async () => {
    const { container } = await ready();
    await openModule('Usuários e papéis');
    await userEvent.click(cellOf(container, CONSULTA, 'Gerenciar usuários — Consulta'));
    expect(bar(container).querySelector('.pp-dirty-line')).toHaveTextContent(
      '1 alteração não salva: Consulta · Gerenciar usuários. Consulta passa a poder mudar usuários e papéis, inclusive os próprios.',
    );
  });

  it('"Salvar alterações" sends only the changed roles in one request and redraws from the answer', async () => {
    const answer = withRole(LIST, CAMPO, ['relatorio.view', 'relatorio.create', 'relatorio.fill']);
    vi.mocked(client.saveRolePermissions).mockResolvedValue(ok(answer));
    const { container } = await ready();
    await openModule('Relatórios');
    await userEvent.click(cellOf(container, CAMPO, 'Criar relatório — Engenheiro de Campo'));
    await userEvent.click(saveButton());
    await waitFor(() => expect(client.saveRolePermissions).toHaveBeenCalledTimes(1));
    expect(client.saveRolePermissions).toHaveBeenCalledWith([{ id: CAMPO, permissions: ['relatorio.view', 'relatorio.create', 'relatorio.fill'] }]);
    await waitFor(() => expect(container.querySelector('.pp-root')).toHaveClass('is-saved'));
    expect(bar(container).querySelector('.pp-saved-line')).toHaveTextContent('Permissões salvas. Cada aparelho passa a segui-las na próxima sincronização.');
    expect(bar(container).querySelector('.pp-saved-line')).toHaveAttribute('role', 'status');
    expect(container.querySelectorAll('.pp-cell.is-changed')).toHaveLength(0);
    expect(cellOf(container, CAMPO, 'Criar relatório — Engenheiro de Campo')).toHaveAttribute('aria-checked', 'true');
    expect(await screen.findByText('Permissões salvas')).toBeInTheDocument();
  });

  it('a failed save keeps the draft and says why', async () => {
    vi.mocked(client.saveRolePermissions).mockResolvedValue({ ok: false, code: 'network', status: 0 });
    const { container } = await ready();
    await openModule('Relatórios');
    await userEvent.click(cellOf(container, CAMPO, 'Criar relatório — Engenheiro de Campo'));
    await userEvent.click(saveButton());
    expect(await screen.findByText('Não foi possível salvar agora. Nada do que está na grade foi perdido.')).toBeInTheDocument();
    expect(cellOf(container, CAMPO, 'Criar relatório — Engenheiro de Campo')).toHaveAttribute('aria-checked', 'true');
    expect(container.querySelector('.pp-root')).not.toHaveClass('is-saved');
  });

  it('offline: "Novo papel" and "Salvar alterações" disabled with the app\'s offline reason', async () => {
    sessionState.online = false;
    const { container } = await ready();
    expect(screen.getByRole('button', { name: 'Novo papel' })).toHaveAttribute('aria-disabled', 'true');
    await openModule('Relatórios');
    await userEvent.click(cellOf(container, CAMPO, 'Criar relatório — Engenheiro de Campo'));
    expect(saveButton()).toHaveAttribute('aria-disabled', 'true');
    expect(within(bar(container)).getByText('Sem conexão')).toBeInTheDocument();
  });
});

describe('26.10-WEB-003 the role menus and dialogs', () => {
  it('restore: a seeded role whose keys were changed takes the seeded set back in the grid, unsaved', async () => {
    vi.mocked(client.listRoles).mockResolvedValue(ok(withRole(LIST, CAMPO, ['relatorio.view', 'relatorio.create', 'relatorio.fill', 'export.download'])));
    vi.mocked(client.saveRolePermissions).mockResolvedValue(ok(LIST));
    const { container } = await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Opções do papel Engenheiro de Campo' }));
    expect(screen.getByText('Papel do sistema: não pode ser renomeado nem removido.')).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Remover' })).toBeNull();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Restaurar permissões padrão' }));
    expect(await screen.findByText('Permissões padrão de volta na grade. Salve para aplicar.')).toBeInTheDocument();
    expect(bar(container).querySelector('.pp-dirty-line')).toHaveTextContent('2 alterações não salvas.');
    await userEvent.click(saveButton());
    await waitFor(() => expect(client.saveRolePermissions).toHaveBeenCalledWith([{ id: CAMPO, permissions: ['relatorio.view', 'relatorio.fill'] }]));
  });

  it('"Novo papel": the duplicate name inline, then the role is created and becomes a column', async () => {
    const created = custom('019966c1-2610-7000-8000-00000000e002', 'Supervisor de campo', ['relatorio.view'], 0);
    vi.mocked(client.createRole).mockResolvedValue(ok([...LIST, created]));
    const { container } = await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Novo papel' }));
    const dialog = await screen.findByRole('dialog', { name: 'Novo papel' });
    const input = within(dialog).getByRole('textbox', { name: 'Nome do papel' });
    expect(dialog).toHaveTextContent('O papel nasce só com "Ver relatórios". Marque as outras permissões na grade e salve.');
    await userEvent.type(input, 'estagiario');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Já existe um papel com este nome.');
    expect(within(dialog).getByRole('button', { name: 'Criar papel' })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.clear(input);
    await userEvent.type(input, 'Supervisor de campo');
    expect(within(dialog).queryByRole('alert')).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar papel' }));
    await waitFor(() => expect(client.createRole).toHaveBeenCalledWith('Supervisor de campo'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Novo papel' })).toBeNull());
    expect(await screen.findByText('Papel Supervisor de campo criado. Ele aparece como uma coluna nova.')).toBeInTheDocument();
    expect(container.querySelector(`th.pp-role[data-role="${created.id}"]`)).toHaveTextContent('Supervisor de campo');
    // The new column is the one the chips pick.
    expect(screen.getByRole('radio', { name: 'Supervisor de campo' })).toHaveAttribute('aria-checked', 'true');
  });

  it('the server\'s duplicate refusal reads as the same inline line', async () => {
    vi.mocked(client.createRole).mockResolvedValue({ ok: false, code: 'role_name_taken', status: 409 });
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Novo papel' }));
    const dialog = await screen.findByRole('dialog', { name: 'Novo papel' });
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Nome do papel' }), 'Outro nome');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar papel' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Já existe um papel com este nome.');
  });

  it('rename: a custom role\'s menu, the dialog with its name, the list redrawn', async () => {
    vi.mocked(client.renameRole).mockResolvedValue(ok(LIST.map((role) => (role.id === ESTAGIARIO ? { ...role, name: 'Estagiária' } : role))));
    const { container } = await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Opções do papel Estagiário' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Renomear' }));
    const dialog = await screen.findByRole('dialog', { name: 'Renomear papel' });
    const input = within(dialog).getByRole('textbox', { name: 'Nome do papel' });
    expect(input).toHaveValue('Estagiário');
    await userEvent.clear(input);
    await userEvent.type(input, 'Estagiária');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(client.renameRole).toHaveBeenCalledWith(ESTAGIARIO, 'Estagiária'));
    await waitFor(() => expect(container.querySelector(`th.pp-role[data-role="${ESTAGIARIO}"]`)).toHaveTextContent('Estagiária'));
    expect(await screen.findByText('Papel renomeado')).toBeInTheDocument();
  });

  it('remove: refused while a user holds the role, with the sentence that names the count', async () => {
    vi.mocked(client.removeRole).mockResolvedValue({ ok: false, code: 'role_in_use', status: 409, details: { user_count: 1, user_names: ['Marcos Teixeira'] } });
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Opções do papel Estagiário' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remover' }));
    const dialog = await screen.findByRole('dialog', { name: 'Não é possível remover Estagiário' });
    expect(dialog).toHaveTextContent('1 usuário tem este papel: Marcos Teixeira. Mude o papel dele em Usuários e tente de novo.');
    expect(within(dialog).getByRole('link', { name: 'Ir para Usuários' })).toHaveAttribute('href', '/usuarios');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Entendi' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('remove: a role nobody holds asks first, then leaves the grid', async () => {
    const lonely = custom('019966c1-2610-7000-8000-00000000e003', 'Sem ninguém', ['relatorio.view'], 0);
    vi.mocked(client.listRoles).mockResolvedValue(ok([...LIST, lonely]));
    vi.mocked(client.removeRole).mockResolvedValue(ok(LIST));
    const { container } = await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Opções do papel Sem ninguém' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remover' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remover o papel Sem ninguém?' });
    expect(dialog).toHaveTextContent('Nenhum usuário tem este papel. Ele sai da grade e da lista de papéis.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(client.removeRole).toHaveBeenCalledWith(lonely.id));
    await waitFor(() => expect(container.querySelector(`th.pp-role[data-role="${lonely.id}"]`)).toBeNull());
    expect(await screen.findByText('Papel removido')).toBeInTheDocument();
  });
});

describe('26.10-WEB-004 one role at a time', () => {
  it('up to seven roles the root has no pp-many; with eight it has; the chips pick the column, the first after Admin by default', async () => {
    const { container, unmount } = await ready();
    expect(container.querySelector('.pp-root')).not.toHaveClass('pp-many');
    expect(container.querySelector('.pp-root')).toHaveAttribute('data-picked', CAMPO);
    expect(screen.getByRole('radio', { name: 'Engenheiro de Campo' })).toHaveAttribute('aria-checked', 'true');
    expect(container.querySelector(`th.pp-role[data-role="${CAMPO}"]`)).not.toHaveClass('is-unpicked');
    expect(container.querySelector(`th.pp-role[data-role="${ADMIN_ROLE_ID}"]`)).toHaveClass('is-unpicked');
    await userEvent.click(screen.getByRole('radio', { name: 'Consulta' }));
    expect(container.querySelector('.pp-root')).toHaveAttribute('data-picked', CONSULTA);
    expect(container.querySelector(`td.pp-cell[data-role="${CAMPO}"]`)).toHaveClass('is-unpicked');
    unmount();

    const eight = [...LIST, custom('019966c1-2610-7000-8000-00000000e004', 'Sétimo', [], 0), custom('019966c1-2610-7000-8000-00000000e005', 'Oitavo', [], 0)];
    expect(eight).toHaveLength(8);
    vi.mocked(client.listRoles).mockResolvedValue(ok(eight));
    const again = await ready();
    expect(again.container.querySelector('.pp-root')).toHaveClass('pp-many');
  });
});

describe('e26s-UNIT a write the server accepts asks one company pull (F2-5)', () => {
  it('a created role pulls the company once, so "Novo usuário" lists it; a refused name pulls nothing', async () => {
    const sync = makeSyncState();
    render(
      <MemoryRouter initialEntries={['/usuarios/papeis']}>
        <SyncContext value={sync}>
          <ToastProvider>
            <Routes>
              <Route path="/usuarios/papeis" element={<PapeisSurface />} />
            </Routes>
            <ToastOutlet />
          </ToastProvider>
        </SyncContext>
      </MemoryRouter>,
    );
    await screen.findByRole('table', { name: 'Permissões por papel' });
    vi.mocked(client.createRole).mockResolvedValueOnce({ ok: false, code: 'role_name_taken', status: 409 });
    await userEvent.click(screen.getByRole('button', { name: 'Novo papel' }));
    let dialog = await screen.findByRole('dialog', { name: 'Novo papel' });
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Nome do papel' }), 'Outro nome');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar papel' }));
    await waitFor(() => expect(client.createRole).toHaveBeenCalledTimes(1));
    expect(sync.pullCompany).not.toHaveBeenCalled();

    const created = custom('019966c1-2610-7000-8000-00000000e003', 'Supervisor', ['relatorio.view'], 0);
    vi.mocked(client.createRole).mockResolvedValueOnce(ok([...LIST, created]));
    dialog = screen.getByRole('dialog', { name: 'Novo papel' });
    const input = within(dialog).getByRole('textbox', { name: 'Nome do papel' });
    await userEvent.clear(input);
    await userEvent.type(input, 'Supervisor');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar papel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Novo papel' })).toBeNull());
    expect(sync.pullCompany).toHaveBeenCalledTimes(1);
  });
});

