import { PRODUTO } from '../product.ts';
import { INVITATION_LINK_HOURS, RESET_LINK_HOURS } from './links.ts';

/*
 * Story 26.6 (AD-9): the two e-mails the app sends, pt-BR, as plain text plus simple HTML, worded
 * after the frames of Story 26.1 (`prototype/screens/96-email-convite.html` and
 * `97-email-redefinicao.html`). The api builds each message here and only sends it. The HTML is
 * inline (no stylesheet, no image), every interpolated value is escaped, and the subject and the
 * names are kept to one line, so a name cannot add a header or a line to the message.
 */

/** The sender's display name: the product's name, never the codename or the company's brand. */
export const EMAIL_SENDER_NAME = PRODUTO;

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

export interface InvitationEmailInput {
  /** The invited user's name. */
  name: string;
  /** The Admin who invited him. */
  inviter_name: string;
  company_name: string;
  role_name: string;
  /** The invited address, the one he signs in with. */
  email: string;
  link: string;
}

export interface PasswordResetEmailInput {
  name: string;
  link: string;
}

/** One line: every line break (and the Unicode line and paragraph separators) becomes a space. */
export function oneLine(value: string): string {
  return value.replace(/[\r\n\u2028\u2029\u0085]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

/** The text of a value inside HTML, an attribute's included. */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** "72 horas", "1 hora". */
function hoursText(hours: number): string {
  return hours === 1 ? '1 hora' : `${hours} horas`;
}

// The colours of DESIGN.md's light tokens, written out: a mail program reads no CSS variable.
const INK = '#15181D';
const INK_SECONDARY = '#454B54';
const SURFACE_BASE = '#F7F8FA';
const SURFACE_RAISED = '#FFFFFF';
const BORDER = '#5C6470';
const HAIRLINE = '#C9CED6';
const PRIMARY = '#1F4E79';
const PRIMARY_FOREGROUND = '#FFFFFF';

interface MessageParts {
  subject: string;
  greetingName: string;
  /** The paragraph between the greeting and the button. */
  lead: string;
  button: string;
  /** The paragraph after the button (the link's life). */
  life: string;
  link: string;
  footer: string;
}

function textBody(parts: MessageParts): string {
  return [
    EMAIL_SENDER_NAME,
    '',
    // authored (Story 26.6), frames 96 and 97
    `Olá, ${parts.greetingName}.`,
    '',
    parts.lead,
    '',
    `${parts.button}: ${parts.link}`,
    '',
    parts.life,
    '',
    parts.footer,
    '',
  ].join('\n');
}

function htmlBody(parts: MessageParts): string {
  const link = escapeHtml(parts.link);
  const paragraph = (content: string, style = '') => `<p style="margin:0 0 16px;${style}">${content}</p>`;
  return [
    '<!doctype html>',
    '<html lang="pt-BR">',
    `<head><meta charset="utf-8"><title>${escapeHtml(parts.subject)}</title></head>`,
    `<body style="margin:0;padding:24px 16px;background:${SURFACE_BASE};color:${INK};font-family:Arial,Helvetica,sans-serif;">`,
    `<div style="max-width:600px;margin:0 auto;background:${SURFACE_RAISED};border:1px solid ${BORDER};border-radius:8px;">`,
    '<div style="padding:24px 16px;font-size:16px;line-height:1.5;">',
    paragraph(escapeHtml(EMAIL_SENDER_NAME), 'font-size:20px;font-weight:700;'),
    // authored (Story 26.6), frames 96 and 97
    paragraph(`Olá, ${escapeHtml(parts.greetingName)}.`),
    paragraph(escapeHtml(parts.lead)),
    paragraph(
      `<a href="${link}" style="display:inline-block;padding:12px 20px;background:${PRIMARY};color:${PRIMARY_FOREGROUND};text-decoration:none;border-radius:6px;font-weight:700;">${escapeHtml(parts.button)}</a>`,
    ),
    paragraph(escapeHtml(parts.life)),
    // authored (Story 26.6), frames 96 and 97
    paragraph(`Se o botão não abrir, copie este endereço no navegador: <a href="${link}" style="color:${INK_SECONDARY};">${link}</a>`, `font-size:14px;color:${INK_SECONDARY};word-break:break-all;`),
    '</div>',
    `<div style="padding:12px 16px;border-top:1px solid ${HAIRLINE};font-size:14px;color:${INK_SECONDARY};">${escapeHtml(parts.footer)}</div>`,
    '</div>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

function message(parts: MessageParts): EmailContent {
  const subject = oneLine(parts.subject);
  return { subject, text: textBody({ ...parts, subject }), html: htmlBody({ ...parts, subject }) };
}

/** The invitation: the Admin added the user; the link sets his first password (72 hours). */
export function invitationEmail(input: InvitationEmailInput): EmailContent {
  const name = oneLine(input.name);
  const inviter = oneLine(input.inviter_name);
  const company = oneLine(input.company_name);
  const role = oneLine(input.role_name);
  const email = oneLine(input.email);
  return message({
    // authored (Story 26.6), frame 96
    subject: `Convite para o ${PRODUTO}`,
    greetingName: name,
    // authored (Story 26.6), frame 96
    lead: `${inviter} convidou você para usar o ${PRODUTO} na empresa ${company}, com o papel ${role}.`,
    // authored (Story 26.6), frame 96
    button: 'Criar minha senha',
    // authored (Story 26.6), frame 96
    life: `O link vale por ${hoursText(INVITATION_LINK_HOURS)} e só pode ser usado uma vez. Depois de criar a senha, entre com este e-mail, ${email}.`,
    link: input.link,
    // authored (Story 26.6), frame 96
    footer: `Você recebeu este e-mail porque alguém da ${company} cadastrou este endereço. Se não esperava o convite, ignore esta mensagem.`,
  });
}

/** The reset: "Esqueci minha senha" or the Admin's "Enviar redefinição de senha" (1 hour). */
export function passwordResetEmail(input: PasswordResetEmailInput): EmailContent {
  return message({
    // authored (Story 26.6), frame 97
    subject: `Crie uma senha nova no ${PRODUTO}`,
    greetingName: oneLine(input.name),
    // authored (Story 26.6), frame 97
    lead: `Recebemos um pedido para criar uma senha nova para a sua conta do ${PRODUTO}.`,
    // authored (Story 26.6), frame 97
    button: 'Criar senha nova',
    // authored (Story 26.6), frame 97
    life: `O link vale por ${hoursText(RESET_LINK_HOURS)} e só pode ser usado uma vez.`,
    link: input.link,
    // authored (Story 26.6), frame 97
    footer: 'Se você não pediu uma senha nova, ignore esta mensagem: a sua senha atual continua valendo.',
  });
}
