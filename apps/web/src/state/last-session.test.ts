import { beforeEach, describe, expect, it } from 'vitest';
import { clearLastSession, readReAuthCause, readReAuthRequired, writeReAuthRequired } from './last-session.ts';

/*
 * Story 26.11: the cause of a 401 is remembered beside the re-auth flag, so an offline reopen
 * after a pause shows the paused banner, not the expired one. The `'1'` an earlier build wrote
 * stays a valid flag (an ended session).
 */

const KEY = 'releng.re-auth-required';

beforeEach(() => {
  window.localStorage.clear();
});

describe('26.11-UNIT-003 the re-auth cause storage', () => {
  it('nothing stored is no flag and no cause', () => {
    expect(readReAuthRequired()).toBe(false);
    expect(readReAuthCause()).toBeNull();
  });

  it("the value of earlier builds ('1') still reads as the flag, an ended session", () => {
    window.localStorage.setItem(KEY, '1');
    expect(readReAuthRequired()).toBe(true);
    expect(readReAuthCause()).toBe('expired');
  });

  it('a flag written with no cause is the ended session, stored as before', () => {
    writeReAuthRequired(true);
    expect(window.localStorage.getItem(KEY)).toBe('1');
    expect(readReAuthCause()).toBe('expired');
  });

  it('a paused cause is remembered and read back with the flag', () => {
    writeReAuthRequired(true, 'paused');
    expect(readReAuthRequired()).toBe(true);
    expect(readReAuthCause()).toBe('paused');
  });

  it('clearing the flag clears the cause; a sign-out clears both', () => {
    writeReAuthRequired(true, 'paused');
    writeReAuthRequired(false);
    expect(readReAuthCause()).toBeNull();
    writeReAuthRequired(true, 'paused');
    clearLastSession();
    expect(readReAuthRequired()).toBe(false);
    expect(readReAuthCause()).toBeNull();
  });

  it('an unknown stored value is no flag', () => {
    window.localStorage.setItem(KEY, 'something');
    expect(readReAuthRequired()).toBe(false);
    expect(readReAuthCause()).toBeNull();
  });
});
