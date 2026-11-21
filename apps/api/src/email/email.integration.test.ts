import { EMAIL_SENDER_NAME, passwordResetEmail, PRODUTO } from '@app/domain';
import type { SendEmailCommand } from '@aws-sdk/client-sesv2';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../config.ts';
import { createDb } from '../db/client.ts';
import { newId } from '../ids.ts';
import { runEmailTask, settleEmailTasks } from './background.ts';
import { clearFakeEmails, fakeEmailLink, fakeEmailToken, readFakeEmails, waitForFakeEmail } from './fake-store.ts';
import { createFakeEmailProvider, emailProviderOf } from './index.ts';
import { createSesEmailProvider, senderAddress, type SesClientLike } from './ses.ts';

/*
 * 26.6-API-001a: the e-mail seam. `fake` stores the message where the tests read it and logs one
 * line with no address; `ses` (its SDK client faked) sends the configured sender and both bodies;
 * the background tracker swallows and logs a failure without the address.
 */

const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const to = `seam-${newId()}@teste.local`;
const link = 'https://app.example.com/definir-senha#Tok_en-123';
const message = { to, ...passwordResetEmail({ name: 'Rita', link }), purpose: 'reset' as const };

afterAll(async () => {
  await clearFakeEmails(db, { to });
  await sql.end();
});

describe('26.6-API-001a the e-mail seam', () => {
  it('fake: stores the message (address lower-cased) and logs email_sent with the provider and the purpose, never the address', async () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((line: string) => void lines.push(line));
    try {
      await createFakeEmailProvider(db).send({ ...message, to: to.toUpperCase() });
    } finally {
      spy.mockRestore();
    }
    const stored = await readFakeEmails(db, { to });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ to, purpose: 'reset', subject: message.subject, text: message.text, html: message.html });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ msg: 'email_sent', provider: 'fake', purpose: 'reset' });
    expect(lines[0]).not.toContain(to);
    expect(lines[0]!.toLowerCase()).not.toContain(to.split('@')[0]!.toLowerCase());
  });

  it('fake store: the link and the token of a message, the wait, the filters and the clear', async () => {
    const found = await waitForFakeEmail(db, { to, purpose: 'reset' });
    expect(fakeEmailLink(found)).toBe(link);
    expect(fakeEmailToken(found)).toBe('Tok_en-123');
    expect(await readFakeEmails(db, { to, purpose: 'invitation' })).toEqual([]);
    expect(await readFakeEmails(db, { to, since: new Date(Date.now() + 60_000) })).toEqual([]);
    await expect(waitForFakeEmail(db, { to, purpose: 'invitation', timeoutMs: 300 })).rejects.toThrow(/no e-mail/);
    await clearFakeEmails(db, { to });
    expect(await readFakeEmails(db, { to })).toEqual([]);
  });

  it('ses: one SendEmail with the configured sender, the address, the subject and both bodies in UTF-8', async () => {
    const sent: SendEmailCommand[] = [];
    const client: SesClientLike = { send: async (command) => void sent.push(command) };
    await createSesEmailProvider({ client, from: 'nao-responda@mail.example.com', senderName: EMAIL_SENDER_NAME }).send(message);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.input).toEqual({
      FromEmailAddress: `${PRODUTO} <nao-responda@mail.example.com>`,
      Destination: { ToAddresses: [to] },
      Content: {
        Simple: {
          Subject: { Data: message.subject, Charset: 'UTF-8' },
          Body: { Text: { Data: message.text, Charset: 'UTF-8' }, Html: { Data: message.html, Charset: 'UTF-8' } },
        },
      },
    });
    expect(JSON.stringify(sent[0]!.input)).not.toMatch(/fasor/i);
    expect(senderAddress('A, B', 'x@y.z')).toBe('"A, B" <x@y.z>');
    // A refusal of SES reaches the caller, which decides (the Admin's route answers `failed`).
    const refusing: SesClientLike = { send: async () => Promise.reject(new Error('MessageRejected')) };
    await expect(createSesEmailProvider({ client: refusing, from: 'a@b.co', senderName: PRODUTO }).send(message)).rejects.toThrow('MessageRejected');
  });

  it('the provider of EMAIL_PROVIDER: fake by default, ses builds its client', async () => {
    const fake = emailProviderOf({ EMAIL_PROVIDER: 'fake', EMAIL_FROM: 'a@b.co', SES_REGION: 'us-east-1' }, db);
    await fake.send({ ...message, purpose: 'invitation' });
    expect(await readFakeEmails(db, { to, purpose: 'invitation' })).toHaveLength(1);
    const ses = emailProviderOf({ EMAIL_PROVIDER: 'ses', EMAIL_FROM: 'a@b.co', SES_REGION: 'us-east-1' }, db);
    expect(typeof ses.send).toBe('function');
  });

  it('background tasks: settled for the tests, a rejection logged without the address and swallowed', async () => {
    const errors: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((line: string) => void errors.push(line));
    let done = false;
    try {
      runEmailTask(new Promise((resolve) => setTimeout(() => resolve((done = true)), 50)));
      runEmailTask(Promise.reject(new Error(`could not send to ${to}`)));
      await settleEmailTasks();
    } finally {
      spy.mockRestore();
    }
    expect(done).toBe(true);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('background task failed');
    expect(errors[0]).not.toContain(to);
  });
});
