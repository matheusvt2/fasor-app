import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResetPasswordResult } from '../../api/auth-client.ts';
import type { SessionState } from '../../state/session.tsx';
import { axe } from '../../test-axe.ts';
import { PASSWORD_SAVED_NOTICE, SetPasswordSurface } from './set-password-surface.tsx';

/*
 * Story 26.6, the page of a password link (`13-definir-senha.html`, `14-definir-senha-expirado.html`):
 * the token from the fragment, the kernel's length rule, the mismatch, "Salvar senha" landing on
 * Login with the notice, and the expired page for no token or a refused link.
 */

const resetPassword = vi.fn<(token: string, password: string) => Promise<ResetPasswordResult>>();
vi.mock('../../api/auth-client.ts', () => ({ resetPassword: (token: string, password: string) => resetPassword(token, password) }));

let session: Partial<SessionState> = {};
vi.mock('../../state/session.tsx', () => ({ useSession: () => session }));

const EXPIRED = 'O link venceu ou já foi usado. Peça um link novo com o seu e-mail: ele serve também para um convite que venceu.';

function Where() {
  const location = useLocation();
  return (
    <p data-testid="where" data-state={JSON.stringify(location.state ?? null)}>
      {location.pathname}
    </p>
  );
}

function renderPage(hash = '#tok-123_abc') {
  return render(
    <MemoryRouter initialEntries={[`/definir-senha${hash}`]}>
      <Routes>
        <Route path="/definir-senha" element={<SetPasswordSurface />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function fill(password: string, repeat: string) {
  if (password !== '') await userEvent.type(screen.getByLabelText('Senha'), password);
  if (repeat !== '') await userEvent.type(screen.getByLabelText('Repita a senha'), repeat);
  await userEvent.click(screen.getByRole('button', { name: 'Salvar senha' }));
}

beforeEach(() => {
  resetPassword.mockReset();
  session = { status: 'signed-out', user: null, online: true, reAuthRequired: false };
});

describe('26.6-UNIT-004 the set-password page', () => {
  it('shows the frame words and the kernel rule; no greeting, no e-mail, no expiry line', async () => {
    const { container } = renderPage();
    expect(screen.getByRole('heading', { name: 'Crie a sua senha' })).toBeInTheDocument();
    expect(screen.getByText('Escolha a senha que você vai usar para entrar.')).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toHaveAccessibleDescription('Pelo menos 8 caracteres.');
    expect(screen.getByLabelText('Repita a senha')).toHaveAttribute('type', 'password');
    expect(screen.getAllByRole('button', { name: 'Mostrar' })).toHaveLength(2);
    expect(container).not.toHaveTextContent('Olá');
    expect(container).not.toHaveTextContent('vale até');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('"Mostrar" reveals each field on its own', async () => {
    renderPage();
    const [first] = screen.getAllByRole('button', { name: 'Mostrar' });
    await userEvent.click(first!);
    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Repita a senha')).toHaveAttribute('type', 'password');
  });

  it('a password under 8 characters sends nothing and the rule turns into the error', async () => {
    renderPage();
    await fill('curta', 'curta');
    expect(resetPassword).not.toHaveBeenCalled();
    const field = screen.getByLabelText('Senha');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription('Pelo menos 8 caracteres.');
    expect(field).toHaveFocus();
  });

  it('a password over 128 characters says the maximum', async () => {
    renderPage();
    const long = 'x'.repeat(129);
    await userEvent.click(screen.getByLabelText('Senha'));
    await userEvent.paste(long);
    await userEvent.click(screen.getByLabelText('Repita a senha'));
    await userEvent.paste(long);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar senha' }));
    expect(resetPassword).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Senha')).toHaveAccessibleDescription('No máximo 128 caracteres.');
  });

  it('two different passwords send nothing and say so under the second field', async () => {
    renderPage();
    await fill('segredo-novo', 'segredo-outro');
    expect(resetPassword).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Repita a senha')).toHaveAccessibleDescription('As duas senhas não são iguais.');
  });

  it('"Salvar senha" sends the token of the fragment and lands on Login with the notice', async () => {
    resetPassword.mockResolvedValue({ ok: true });
    renderPage();
    await fill('segredo-novo', 'segredo-novo');
    expect(resetPassword).toHaveBeenCalledWith('tok-123_abc', 'segredo-novo');
    const where = await screen.findByTestId('where');
    expect(where).toHaveTextContent('/login');
    expect(JSON.parse(where.dataset.state!)).toEqual({ notice: PASSWORD_SAVED_NOTICE });
  });

  it('a used, expired or unknown link (INVALID_TOKEN) shows the expired page with its two ways out', async () => {
    resetPassword.mockResolvedValue({ ok: false, reason: 'invalid-link' });
    const { container } = renderPage();
    await fill('segredo-novo', 'segredo-novo');
    expect(await screen.findByRole('heading', { name: 'Este link não vale mais' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(EXPIRED);
    expect(await axe(container)).toHaveNoViolations();
    await userEvent.click(screen.getByRole('button', { name: 'Pedir um link novo' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/login/esqueci');
  });

  it('no token in the address is the expired page at once', async () => {
    renderPage('');
    expect(screen.getByRole('heading', { name: 'Este link não vale mais' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Voltar ao login' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/login');
  });

  it('a password the server finds too short keeps the link usable', async () => {
    resetPassword.mockResolvedValueOnce({ ok: false, reason: 'too-short' }).mockResolvedValueOnce({ ok: true });
    renderPage();
    await fill('segredo-novo', 'segredo-novo');
    expect(await screen.findByRole('alert')).toHaveTextContent('Pelo menos 8 caracteres.');
    expect(screen.queryByRole('heading', { name: 'Este link não vale mais' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar senha' }));
    expect(resetPassword).toHaveBeenCalledTimes(2);
    expect(await screen.findByTestId('where')).toHaveTextContent('/login');
  });

  it('a server that does not answer says so, and the link stays', async () => {
    resetPassword.mockResolvedValue({ ok: false, reason: 'server' });
    renderPage();
    await fill('segredo-novo', 'segredo-novo');
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível falar com o servidor. Tente de novo em instantes.');
    expect(screen.getByRole('heading', { name: 'Crie a sua senha' })).toBeInTheDocument();
  });

  it('offline, "Salvar senha" is disabled with its reason and sends nothing', async () => {
    session = { ...session, online: false };
    renderPage();
    const save = screen.getByRole('button', { name: 'Salvar senha' });
    expect(save).toHaveAttribute('aria-disabled', 'true');
    expect(save).toHaveAccessibleDescription('Salvar senha precisa de conexão');
    await fill('segredo-novo', 'segredo-novo');
    expect(resetPassword).not.toHaveBeenCalled();
  });
});
