import { describe, expect, it } from 'vitest';
import { plainHttpCookie } from '../e2e/support/plain-http-cookie.ts';

/*
 * Batch e26t (2026-11-22): the cookie the harness adds by hand on the plain http e2e origin, where
 * WebKit refuses the `Secure` one the server sets (`e2e/support/plain-http-cookie.ts`). The header
 * below is the one the sign-in route answered in the run that proved the cause, its value shortened.
 */

const ORIGIN = 'http://localhost:5200';
const SIGN_IN = 'releng.session_token=c19u1W58A1pw.Zm9v%2Bbar%3D; Max-Age=2592000; Path=/; HttpOnly; Secure; SameSite=Lax';

describe('plainHttpCookie (e26t)', () => {
  it('keeps the name, the value as sent, HttpOnly and SameSite, and drops Secure', () => {
    expect(plainHttpCookie(SIGN_IN, ORIGIN)).toEqual({
      name: 'releng.session_token',
      value: 'c19u1W58A1pw.Zm9v%2Bbar%3D',
      url: ORIGIN,
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    });
  });

  it('splits the pair at the first "=" only, so a value holding "=" stays whole', () => {
    expect(plainHttpCookie('token=a=b==; Path=/', ORIGIN)).toMatchObject({ name: 'token', value: 'a=b==', httpOnly: false, sameSite: 'Lax' });
  });

  it('reads the attributes whatever their case, and SameSite as the server named it', () => {
    expect(plainHttpCookie('a=1; httponly; samesite=strict; SECURE', ORIGIN)).toMatchObject({ httpOnly: true, sameSite: 'Strict', secure: false });
    expect(plainHttpCookie('a=1; SameSite=None; Secure', ORIGIN)).toMatchObject({ httpOnly: false, sameSite: 'None', secure: false });
  });

  it('is null for a header that deletes the cookie or names none: nothing to send', () => {
    // better-auth's sign-out answer: an empty value with Max-Age=0.
    expect(plainHttpCookie('releng.session_token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax', ORIGIN)).toBeNull();
    expect(plainHttpCookie('releng.session_token=abc; Max-Age=0; Path=/', ORIGIN)).toBeNull();
    expect(plainHttpCookie('', ORIGIN)).toBeNull();
    expect(plainHttpCookie('=abc; Path=/', ORIGIN)).toBeNull();
    expect(plainHttpCookie('no-pair-here', ORIGIN)).toBeNull();
  });
});
