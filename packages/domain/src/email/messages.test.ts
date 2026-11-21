import { describe, expect, it } from 'vitest';
import { TEXT_CAPS } from '../ops/value-limits.ts';
import {
  ADMIN_USER_ACTIONS,
  ADMIN_USER_NAME_MAX_LENGTH,
  ADMIN_USER_ROUTES,
  adminUserCreateRequestSchema,
  adminUserEditRequestSchema,
  adminUserRoutePath,
  adminUserViewSchema,
} from '../contract/admin-users.ts';
import { passwordLinkAllowed, USER_STATUSES } from '../permissions/user.ts';
import { PRODUTO } from '../product.ts';
import {
  INVITATION_LINK_HOURS,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordLengthIssue,
  RESET_LINK_HOURS,
  SET_PASSWORD_PATH,
  setPasswordLink,
  tokenFromFragment,
} from './links.ts';
import { EMAIL_SENDER_NAME, escapeHtml, invitationEmail, oneLine, passwordResetEmail } from './messages.ts';

const LINK = 'https://app.example.com/definir-senha#AbC_123-xyz';
const invitation = () =>
  invitationEmail({
    name: 'Fernanda Rocha',
    inviter_name: 'Bruno Matsui',
    company_name: 'Exemplo Engenharia',
    role_name: 'Consulta',
    email: 'fernanda@exemplo.com.br',
    link: LINK,
  });
const reset = () => passwordResetEmail({ name: 'Eduardo Prado', link: LINK });

describe('26.6-UNIT-001 the password link', () => {
  it('is the app origin, the set-password page and the token as the fragment', () => {
    expect(SET_PASSWORD_PATH).toBe('/definir-senha');
    expect(setPasswordLink('https://app.example.com', 'AbC_123-xyz')).toBe(LINK);
    expect(setPasswordLink('https://app.example.com/', 'AbC_123-xyz')).toBe(LINK);
    expect(tokenFromFragment('#AbC_123-xyz')).toBe('AbC_123-xyz');
    expect(tokenFromFragment('AbC_123-xyz')).toBe('AbC_123-xyz');
    expect(tokenFromFragment(new URL(LINK).hash)).toBe('AbC_123-xyz');
    expect(tokenFromFragment('')).toBeNull();
    expect(tokenFromFragment('#')).toBeNull();
    expect(tokenFromFragment('#a b')).toBeNull();
    expect(tokenFromFragment('#<script>')).toBeNull();
  });

  it('lives 72 hours for an invitation and 1 hour for a reset; the password is 8 to 128 characters', () => {
    expect(INVITATION_LINK_HOURS).toBe(72);
    expect(RESET_LINK_HOURS).toBe(1);
    expect([PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH]).toEqual([8, 128]);
    expect(passwordLengthIssue('x'.repeat(7))).toBe('too_short');
    expect(passwordLengthIssue('x'.repeat(8))).toBeNull();
    expect(passwordLengthIssue('x'.repeat(128))).toBeNull();
    expect(passwordLengthIssue('x'.repeat(129))).toBe('too_long');
  });

  it('is sent to an invited or active user, never to a paused or removed one (absent status is active)', () => {
    expect(USER_STATUSES.filter((status) => passwordLinkAllowed({ status }))).toEqual(['active', 'invited']);
    expect(passwordLinkAllowed({})).toBe(true);
    expect(passwordLinkAllowed({ status: null })).toBe(true);
  });
});

describe('26.6-UNIT-002 the two messages', () => {
  it('the invitation: the frame\'s subject, sentences, button and the written-out link in both bodies', () => {
    const mail = invitation();
    expect(mail.subject).toBe(`Convite para o ${PRODUTO}`);
    for (const body of [mail.text, mail.html]) {
      expect(body).toContain(PRODUTO);
      expect(body).toContain('Olá, Fernanda Rocha.');
      expect(body).toContain(`Bruno Matsui convidou você para usar o ${PRODUTO} na empresa Exemplo Engenharia, com o papel Consulta.`);
      expect(body).toContain('Criar minha senha');
      expect(body).toContain('O link vale por 72 horas e só pode ser usado uma vez. Depois de criar a senha, entre com este e-mail, fernanda@exemplo.com.br.');
      expect(body).toContain('Você recebeu este e-mail porque alguém da Exemplo Engenharia cadastrou este endereço. Se não esperava o convite, ignore esta mensagem.');
      expect(body).toContain(LINK);
    }
    expect(mail.html).toContain(`<a href="${LINK}"`);
    expect(mail.html).toContain('Se o botão não abrir, copie este endereço no navegador:');
  });

  it('the reset: the frame\'s subject, sentences, button and 1 hora', () => {
    const mail = reset();
    expect(mail.subject).toBe(`Crie uma senha nova no ${PRODUTO}`);
    for (const body of [mail.text, mail.html]) {
      expect(body).toContain('Olá, Eduardo Prado.');
      expect(body).toContain(`Recebemos um pedido para criar uma senha nova para a sua conta do ${PRODUTO}.`);
      expect(body).toContain('Criar senha nova');
      expect(body).toContain('O link vale por 1 hora e só pode ser usado uma vez.');
      expect(body).toContain('Se você não pediu uma senha nova, ignore esta mensagem: a sua senha atual continua valendo.');
      expect(body).toContain(LINK);
    }
  });

  it('escapes every interpolated value in the HTML and keeps the subject and the names on one line', () => {
    const mail = invitationEmail({
      name: 'Eve\r\nBcc: x@evil.example <script>alert(1)</script>',
      inviter_name: 'Ana "A" & Cia',
      company_name: "O'Brien <b>Ltda</b>",
      role_name: 'Papel\nnovo',
      email: 'eve@exemplo.com.br',
      link: 'https://app.example.com/definir-senha#abc"><script>x</script>',
    });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).not.toContain('<b>Ltda</b>');
    expect(mail.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(mail.html).toContain('Ana &quot;A&quot; &amp; Cia');
    expect(mail.html).toContain('O&#39;Brien &lt;b&gt;Ltda&lt;/b&gt;');
    expect(mail.html).toContain('href="https://app.example.com/definir-senha#abc&quot;&gt;&lt;script&gt;x&lt;/script&gt;"');
    expect(mail.text).toContain('Olá, Eve Bcc: x@evil.example <script>alert(1)</script>.');
    expect(mail.text).toContain('com o papel Papel novo.');
    for (const m of [mail, reset(), invitation()]) expect(m.subject).not.toMatch(/[\r\n]/);
    expect(oneLine('a\r\n\u2028b\u2029 c')).toBe('a b c');
    expect(escapeHtml(`<&>"'`)).toBe('&lt;&amp;&gt;&quot;&#39;');
  });

  it('never names the codename, and the sender is the product', () => {
    expect(EMAIL_SENDER_NAME).toBe(PRODUTO);
    for (const m of [invitation(), reset()]) {
      for (const part of [m.subject, m.text, m.html]) expect(part).not.toMatch(/fasor/i);
    }
  });
});

describe('26.8-UNIT-001 the Admin user routes contract', () => {
  it('names each route and each action', () => {
    expect(Object.values(ADMIN_USER_ROUTES).map((route) => `${route.method} ${route.path}`)).toEqual([
      'GET /api/admin/users',
      'POST /api/admin/users',
      'PATCH /api/admin/users/:id',
      'POST /api/admin/users/:id/pause',
      'POST /api/admin/users/:id/reactivate',
      'POST /api/admin/users/:id/remove',
      'POST /api/admin/users/:id/resend-invitation',
      'POST /api/admin/users/:id/password-reset',
    ]);
    expect(adminUserRoutePath('pause', 'u-1')).toBe('/api/admin/users/u-1/pause');
    expect(adminUserRoutePath('list')).toBe('/api/admin/users');
    expect(ADMIN_USER_ACTIONS).toEqual(['create', 'edit', 'pause', 'reactivate', 'remove', 'resend_invitation', 'send_reset']);
  });

  it('parses a create (the e-mail trimmed and lower-cased) and refuses an empty edit', () => {
    const roleId = '00000026-0000-7000-8000-000000000005';
    expect(adminUserCreateRequestSchema.parse({ name: ' Ana ', email: ' Ana@Exemplo.COM ', role_id: roleId })).toEqual({ name: 'Ana', email: 'ana@exemplo.com', role_id: roleId });
    expect(adminUserCreateRequestSchema.safeParse({ name: '', email: 'a@b.co', role_id: roleId }).success).toBe(false);
    expect(adminUserCreateRequestSchema.safeParse({ name: 'Ana', email: 'not-an-address', role_id: roleId }).success).toBe(false);
    expect(adminUserCreateRequestSchema.safeParse({ name: 'Ana', email: 'a@b.co', role_id: 'admin' }).success).toBe(false);
    expect(adminUserCreateRequestSchema.safeParse({ name: 'x'.repeat(ADMIN_USER_NAME_MAX_LENGTH + 1), email: 'a@b.co', role_id: roleId }).success).toBe(false);
    expect(ADMIN_USER_NAME_MAX_LENGTH).toBe(TEXT_CAPS.short);
    expect(adminUserEditRequestSchema.safeParse({}).success).toBe(false);
    expect(adminUserEditRequestSchema.parse({ role_id: roleId })).toEqual({ role_id: roleId });
    expect(adminUserViewSchema.safeParse({ id: 'u', name: 'Ana', email: 'a@b.co', role: null, status: 'invited', last_sign_in: null }).success).toBe(true);
  });
});
