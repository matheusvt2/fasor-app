import { copy } from '../../copy/pt-br.ts';

/** Something shaped like an address: text, one "@", a dot in the domain part. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The device's own check of an e-mail field before anything is sent (Login, and Story 26.6's
 * "Esqueci minha senha"): nothing empty, an address with a shape. Null when it passes.
 */
export function emailIssue(email: string): string | null {
  const trimmed = email.trim();
  return trimmed === '' ? copy.login.emailRequired : EMAIL_SHAPE.test(trimmed) ? null : copy.login.emailInvalid;
}
