import { ADMIN_ROLE_ID, SYSTEM_ROLE_ROW_IDS, systemRoleRow, systemRoleRows, type RoleRow, type UserListEntry } from '@app/domain';
import { cleanup, configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionsFixture } from '../../state/permissions.tsx';
import { axe } from '../../test-axe.ts';
import { UserDialog, type UserDialogMode, type UserDialogProps } from './user-dialog.tsx';

/*
 * Story 26.9 (`92-usuarios.html` `#usr-dlg-novo`, `#usr-dlg-novo-dup`, `#usr-dlg-editar`,
 * `#usr-dlg-editar-eu`): the user dialog alone, its fields, the role options and each refusal the
 * route answers.
 */

const client = vi.hoisted(() => ({
  listAdminUsers: vi.fn(),
  createAdminUser: vi.fn(),
  editAdminUser: vi.fn(),
  adminUserAction: vi.fn(),
}));
vi.mock('../../api/admin-users-client.ts', () => client);

configure({ asyncUtilTimeout: 5000 });

const BRUNO = '019966b0-0272-7000-8000-0000000000b1';
const EDUARDO = '019966b0-0272-7000-8000-0000000000b2';
const ESTAGIARIO: RoleRow = { id: '019966b0-0272-7000-8000-0000000000e1', name: 'Estagiário', permissions: ['relatorio.view', 'relatorio.fill'], removed_at: null };
const ROLES = [...systemRoleRows(), ESTAGIARIO];

const entry = (id: string, name: string, email: string, role_id: string): UserListEntry => ({
  id,
  name,
  email,
  status: 'active',
  role_id,
  role_name: ROLES.find((role) => role.id === role_id)?.name ?? null,
  last_sign_in: null,
});

const bruno = entry(BRUNO, 'Bruno Matsui', 'bruno@exemplo.com.br', ADMIN_ROLE_ID);
const eduardo = entry(EDUARDO, 'Eduardo Prado', 'eduardo@exemplo.com.br', SYSTEM_ROLE_ROW_IDS.engenheiro_de_campo);

let props: UserDialogProps;

function renderDialog(mode: UserDialogMode, entries: readonly UserListEntry[] = [bruno, eduardo]) {
  props = { mode, roles: ROLES, entries, selfId: BRUNO, onClose: vi.fn(), onSaved: vi.fn(), onRefused: vi.fn() };
  return render(
    <MemoryRouter>
      <PermissionsFixture role={systemRoleRow('admin')}>
        <UserDialog {...props} />
      </PermissionsFixture>
    </MemoryRouter>,
  );
}

const submit = (name: string) => screen.getByRole('button', { name });

beforeEach(() => {
  client.createAdminUser.mockReset();
  client.editAdminUser.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('26.9-UNIT-030 the new user dialog', () => {
  it('Nome, E-mail with the 72-hour helper, six Option rows naming their modules; "Enviar convite" waits with its reason', async () => {
    renderDialog({ kind: 'new' });
    const dialog = screen.getByRole('dialog', { name: 'Novo usuário' });
    expect(dialog).toHaveTextContent('A pessoa recebe um e-mail com um link para criar a própria senha. Você nunca vê a senha.');
    expect(within(dialog).getByText('O convite chega neste endereço. O link vale por 72 horas.')).toBeVisible();
    await waitFor(() => expect(within(dialog).getByLabelText('Nome')).toHaveFocus());
    const options = within(within(dialog).getByRole('radiogroup', { name: 'Papel' })).getAllByRole('radio');
    expect(options.map((option) => option.textContent)).toEqual([
      'AdminTodas as permissões',
      'Engenheiro de CampoRelatórios (em parte) · Preenchimento em campo',
      'Gestor do ProjetoRelatórios · Preenchimento em campo · Emissão (em parte) · Templates · Tipos de equipamento · Cadastros',
      'Responsável TécnicoRelatórios (em parte) · Preenchimento em campo · Emissão · Cadastros',
      'ConsultaRelatórios (em parte) · Emissão (em parte)',
      'EstagiárioRelatórios (em parte) · Preenchimento em campo',
    ]);
    expect(options.every((option) => option.getAttribute('aria-checked') === 'false')).toBe(true);
    expect(within(dialog).getByRole('link', { name: 'Ver o que cada papel pode' })).toHaveAttribute('href', '/usuarios/papeis');
    expect(within(dialog).getAllByRole('button').slice(-2).map((button) => button.textContent)).toEqual(['Cancelar', 'Enviar convite']);

    expect(submit('Enviar convite')).toHaveAttribute('aria-disabled', 'true');
    expect(submit('Enviar convite')).toHaveAccessibleDescription('Escreva o nome da pessoa.');
    await userEvent.type(within(dialog).getByLabelText('Nome'), 'Fernanda Rocha');
    expect(submit('Enviar convite')).toHaveAccessibleDescription('Escreva um e-mail válido.');
    await userEvent.type(within(dialog).getByLabelText('E-mail'), 'fernanda@exemplo');
    expect(submit('Enviar convite')).toHaveAccessibleDescription('Escreva um e-mail válido.');
    await userEvent.type(within(dialog).getByLabelText('E-mail'), '.com.br');
    expect(submit('Enviar convite')).toHaveAccessibleDescription('Escolha um papel.');
    await userEvent.click(options[4]!);
    expect(options[4]).toHaveAttribute('aria-checked', 'true');
    expect(submit('Enviar convite')).not.toHaveAttribute('aria-disabled');
    expect(await axe(document.body)).toHaveNoViolations();

    client.createAdminUser.mockResolvedValue({ ok: true, value: { user: { ...eduardo, id: EDUARDO, role: null, status: 'invited' }, invitation: 'sent' } });
    await userEvent.click(submit('Enviar convite'));
    await waitFor(() => expect(client.createAdminUser).toHaveBeenCalledWith({ name: 'Fernanda Rocha', email: 'fernanda@exemplo.com.br', role_id: SYSTEM_ROLE_ROW_IDS.consulta }));
    expect(props.onSaved).toHaveBeenCalledWith(expect.objectContaining({ invitation: 'sent' }), { action: 'create', roleChanged: false });
  });

  it('the arrow keys move over the Option rows, Space picks one', async () => {
    renderDialog({ kind: 'new' });
    const options = within(screen.getByRole('radiogroup', { name: 'Papel' })).getAllByRole('radio');
    expect(options.map((option) => option.tabIndex)).toEqual([0, -1, -1, -1, -1, -1]);
    options[0]!.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(options[1]).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(options[5]).toHaveFocus();
    await userEvent.keyboard(' ');
    expect(options[5]).toHaveAttribute('aria-checked', 'true');
  });

  it('the duplicate e-mail: the red field and the frame\'s helper, "Enviar convite" waits until the address changes', async () => {
    renderDialog({ kind: 'new' });
    const dialog = screen.getByRole('dialog', { name: 'Novo usuário' });
    await userEvent.type(within(dialog).getByLabelText('Nome'), 'Paulo Nunes');
    await userEvent.type(within(dialog).getByLabelText('E-mail'), 'paulo@exemplo.com.br');
    await userEvent.click(within(dialog).getByRole('radio', { name: /Engenheiro de Campo/ }));
    client.createAdminUser.mockResolvedValue({ ok: false, failure: { kind: 'refused', status: 409, code: 'user_email_taken' } });
    await userEvent.click(submit('Enviar convite'));

    const email = within(dialog).getByLabelText('E-mail');
    await waitFor(() => expect(email).toHaveAttribute('aria-invalid', 'true'));
    expect(email).toHaveClass('input', 'is-invalid');
    const helper = within(dialog).getByRole('alert');
    expect(helper).toHaveTextContent('Este e-mail já está cadastrado. Se a pessoa foi removida, use Reativar na lista, filtro Removido.');
    expect(helper).toHaveAttribute('data-tone', 'red');
    expect(submit('Enviar convite')).toHaveAttribute('aria-disabled', 'true');
    expect(submit('Enviar convite').getAttribute('aria-describedby')).toContain(helper.id);
    await userEvent.click(submit('Enviar convite'));
    expect(client.createAdminUser).toHaveBeenCalledTimes(1);

    await userEvent.clear(email);
    await userEvent.type(email, 'paulo.nunes@exemplo.com.br');
    expect(email).not.toHaveAttribute('aria-invalid');
    expect(submit('Enviar convite')).not.toHaveAttribute('aria-disabled');
    expect(props.onRefused).not.toHaveBeenCalled();
  });

  it.each([
    [{ kind: 'offline' }, 'Sem conexão com o servidor. Nada foi alterado; tente de novo.'],
    [{ kind: 'server', status: 500 }, 'O servidor não respondeu. Nada foi alterado; tente de novo.'],
    [{ kind: 'refused', status: 429, code: 'rate_limited' }, 'Muitos envios em pouco tempo. Espere alguns minutos e tente de novo.'],
    [{ kind: 'refused', status: 404, code: 'role_not_found' }, 'Esse papel não existe mais. Escolha outro.'],
  ])('a refusal %o is said in the dialog, which stays open', async (failure, sentence) => {
    renderDialog({ kind: 'new' });
    const dialog = screen.getByRole('dialog', { name: 'Novo usuário' });
    await userEvent.type(within(dialog).getByLabelText('Nome'), 'Fernanda Rocha');
    await userEvent.type(within(dialog).getByLabelText('E-mail'), 'fernanda@exemplo.com.br');
    await userEvent.click(within(dialog).getByRole('radio', { name: /Estagiário/ }));
    client.createAdminUser.mockResolvedValue({ ok: false, failure });
    await userEvent.click(submit('Enviar convite'));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(sentence);
    expect(props.onRefused).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('a refusal that is not the dialog\'s goes back to the screen', async () => {
    renderDialog({ kind: 'new' });
    const dialog = screen.getByRole('dialog', { name: 'Novo usuário' });
    await userEvent.type(within(dialog).getByLabelText('Nome'), 'Fernanda Rocha');
    await userEvent.type(within(dialog).getByLabelText('E-mail'), 'fernanda@exemplo.com.br');
    await userEvent.click(within(dialog).getByRole('radio', { name: /Consulta/ }));
    client.createAdminUser.mockResolvedValue({ ok: false, failure: { kind: 'refused', status: 403, code: 'forbidden' } });
    await userEvent.click(submit('Enviar convite'));
    await waitFor(() => expect(props.onRefused).toHaveBeenCalledWith({ kind: 'refused', status: 403, code: 'forbidden' }));
  });
});

describe('26.9-UNIT-031 the edit dialog', () => {
  it('the e-mail read-only with its helper; Salvar sends only what changed', async () => {
    renderDialog({ kind: 'edit', entry: eduardo });
    const dialog = screen.getByRole('dialog', { name: 'Editar usuário' });
    const email = within(dialog).getByLabelText('E-mail');
    expect(email).toHaveAttribute('readonly');
    expect(email).toHaveValue('eduardo@exemplo.com.br');
    expect(email).toHaveClass('input', 'is-readonly');
    expect(email).toHaveAccessibleDescription('O e-mail não muda depois do convite.');
    expect(within(dialog).queryByRole('link', { name: 'Ver o que cada papel pode' })).toBeNull();
    expect(within(dialog).getByRole('radio', { name: /Engenheiro de Campo/ })).toHaveAttribute('aria-checked', 'true');
    expect(submit('Salvar')).toHaveAccessibleDescription('Mude o nome ou o papel para salvar.');

    const name = within(dialog).getByLabelText('Nome');
    await userEvent.clear(name);
    await userEvent.type(name, 'Eduardo Prado Filho');
    client.editAdminUser.mockResolvedValue({ ok: true, value: { user: { id: EDUARDO, name: 'Eduardo Prado Filho', email: 'eduardo@exemplo.com.br', role: null, status: 'active', last_sign_in: null } } });
    await userEvent.click(submit('Salvar'));
    await waitFor(() => expect(client.editAdminUser).toHaveBeenCalledWith(EDUARDO, { name: 'Eduardo Prado Filho' }));
    expect(props.onSaved).toHaveBeenCalledWith(expect.anything(), { action: 'edit', roleChanged: false });
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it('the only active Admin editing himself: the Banner above the roles, the other five disabled, the name still saves', async () => {
    renderDialog({ kind: 'edit', entry: bruno });
    const dialog = screen.getByRole('dialog', { name: 'Editar usuário' });
    const group = within(dialog).getByRole('radiogroup', { name: 'Papel' });
    expect(within(dialog).getByRole('status')).toHaveTextContent('Você é o único Admin ativo. Dê o papel Admin a outra pessoa antes de pausar, remover ou mudar o seu papel.');
    expect(group).toHaveAccessibleDescription('Você é o único Admin ativo. Dê o papel Admin a outra pessoa antes de pausar, remover ou mudar o seu papel.');
    const options = within(group).getAllByRole('radio');
    expect(options.map((option) => option.getAttribute('aria-disabled'))).toEqual([null, 'true', 'true', 'true', 'true', 'true']);
    expect(options.map((option) => option.tabIndex)).toEqual([0, -1, -1, -1, -1, -1]);
    await userEvent.click(options[1]!);
    expect(options[1]).toHaveAttribute('aria-checked', 'false');
    expect(options[0]).toHaveAttribute('aria-checked', 'true');
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it('with a second active Admin, no Banner and every role open', () => {
    const rafael = entry('019966b0-0272-7000-8000-0000000000b3', 'Rafael Lamonde', 'rafael@exemplo.com.br', ADMIN_ROLE_ID);
    renderDialog({ kind: 'edit', entry: bruno }, [bruno, eduardo, rafael]);
    const group = screen.getByRole('radiogroup', { name: 'Papel' });
    expect(screen.queryByRole('status')).toBeNull();
    expect(within(group).getAllByRole('radio').every((option) => option.getAttribute('aria-disabled') === null)).toBe(true);
  });

  it('a 409 last_admin from the route goes back to the screen', async () => {
    renderDialog({ kind: 'edit', entry: eduardo });
    await userEvent.click(screen.getByRole('radio', { name: /Consulta/ }));
    client.editAdminUser.mockResolvedValue({ ok: false, failure: { kind: 'refused', status: 409, code: 'last_admin' } });
    await userEvent.click(submit('Salvar'));
    await waitFor(() => expect(props.onRefused).toHaveBeenCalledWith({ kind: 'refused', status: 409, code: 'last_admin' }));
    expect(client.editAdminUser).toHaveBeenCalledWith(EDUARDO, { role_id: SYSTEM_ROLE_ROW_IDS.consulta });
  });
});
