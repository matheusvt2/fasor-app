import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SignInResult } from '../../api/auth-client.ts';
import type { SessionState } from '../../state/session.tsx';
import { LoginSurface, validateLogin } from './login-surface.tsx';

/*
 * Retro U4: Login says what failed. Field checks run on the device before any request;
 * "Senha incorreta" is only the server rejecting the pair; a server that does not answer
 * has its own sentence and marks no field; only a device without a network says "Sem
 * conexão". The session is mocked at the module, as the Account test does.
 */

const signIn = vi.fn<(email: string, password: string) => Promise<SignInResult>>();

let session: Partial<SessionState> = {};

vi.mock('../../state/session.tsx', () => ({ useSession: () => session }));

beforeEach(() => {
  signIn.mockReset();
  session = { status: 'signed-out', user: null, online: true, reAuthRequired: false, signIn };
});

async function fillAndSubmit(email: string, password: string) {
  if (email !== '') await userEvent.type(screen.getByLabelText('E-mail'), email);
  if (password !== '') await userEvent.type(screen.getByLabelText('Senha'), password);
  await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
}

describe('validateLogin', () => {
  it('asks for both fields and an e-mail with a shape', () => {
    expect(validateLogin('', '')).toEqual({ email: 'Informe o e-mail', password: 'Informe a senha' });
    expect(validateLogin('nao-e-email', 'x')).toEqual({ email: 'E-mail inválido', password: null });
    expect(validateLogin('a@teste', 'x')).toEqual({ email: 'E-mail inválido', password: null });
    expect(validateLogin(' a@teste.local ', 'x')).toEqual({ email: null, password: null });
  });
});

describe('Login surface', () => {
  it('an empty form sends nothing and names both fields, focusing the first', async () => {
    render(<LoginSurface />);
    await fillAndSubmit('', '');
    expect(signIn).not.toHaveBeenCalled();
    const email = screen.getByLabelText('E-mail');
    const password = screen.getByLabelText('Senha');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription('Informe o e-mail');
    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(password).toHaveAccessibleDescription('Informe a senha');
    expect(screen.getAllByRole('alert').map((node) => node.textContent)).toEqual(['Informe o e-mail', 'Informe a senha']);
    expect(email).toHaveFocus();
  });

  it('a malformed e-mail sends nothing and is named on the e-mail field only', async () => {
    render(<LoginSurface />);
    await fillAndSubmit('nao-e-email', 'segredo');
    expect(signIn).not.toHaveBeenCalled();
    expect(screen.getByLabelText('E-mail')).toHaveAccessibleDescription('E-mail inválido');
    expect(screen.getByLabelText('Senha')).not.toHaveAttribute('aria-invalid');
  });

  it('a wrong pair is "Senha incorreta" under the password, as before', async () => {
    signIn.mockResolvedValue({ ok: false, reason: 'credentials', message: 'Senha incorreta' });
    render(<LoginSurface />);
    await fillAndSubmit('a@teste.local', 'errada');
    expect(signIn).toHaveBeenCalledWith('a@teste.local', 'errada');
    const password = screen.getByLabelText('Senha');
    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(password).toHaveAccessibleDescription('Senha incorreta');
  });

  it('a server that does not answer has its own sentence and marks no field', async () => {
    signIn.mockResolvedValue({
      ok: false,
      reason: 'server',
      message: 'Não foi possível falar com o servidor. Tente de novo em instantes.',
    });
    const { container } = render(<LoginSurface />);
    await fillAndSubmit('a@teste.local', 'certa');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível falar com o servidor. Tente de novo em instantes.',
    );
    expect(screen.getByLabelText('Senha')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByLabelText('E-mail')).not.toHaveAttribute('aria-invalid');
    expect(container).not.toHaveTextContent('Senha incorreta');
    expect(container).not.toHaveTextContent('Sem conexão');
    // A retry is allowed at once.
    signIn.mockResolvedValue({ ok: false, reason: 'credentials', message: 'Senha incorreta' });
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(signIn).toHaveBeenCalledTimes(2);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('offline keeps the offline sentence and a disabled Entrar that sends nothing', async () => {
    session = { ...session, online: false };
    render(<LoginSurface />);
    expect(screen.getByRole('status')).toHaveTextContent(/^Sem conexão/);
    const button = screen.getByRole('button', { name: 'Entrar' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription('Entrar precisa de conexão');
    await fillAndSubmit('a@teste.local', 'certa');
    expect(signIn).not.toHaveBeenCalled();
  });

  it('going offline after "Senha incorreta" shows the offline sentence alone', async () => {
    signIn.mockResolvedValue({ ok: false, reason: 'credentials', message: 'Senha incorreta' });
    const { container, rerender } = render(<LoginSurface />);
    await fillAndSubmit('a@teste.local', 'errada');
    expect(screen.getByLabelText('Senha')).toHaveAccessibleDescription('Senha incorreta');

    session = { ...session, online: false };
    rerender(<LoginSurface />);
    expect(screen.getByRole('status')).toHaveTextContent(/^Sem conexão/);
    expect(container).not.toHaveTextContent('Senha incorreta');
    expect(screen.getByLabelText('Senha')).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('the page title is the product name', () => {
    render(<LoginSurface />);
    expect(document.title).toBe('PRODUTO');
  });
});
