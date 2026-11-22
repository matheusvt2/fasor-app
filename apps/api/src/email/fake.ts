import type { Db } from '../db/client.ts';
import { fakeEmail } from '../db/schema.ts';
import { newId } from '../ids.ts';
import { log } from '../log.ts';
import type { EmailMessage, EmailProvider } from './types.ts';

/**
 * Story 26.6: the default provider. It stores each message in `fake_email`, where the api tests and
 * the e2e helpers read it (`email/fake-store.ts`), and logs one `email_sent` line naming the
 * provider and the purpose, never the address.
 */
export function createFakeEmailProvider(db: Db): EmailProvider {
  return {
    async send(message: EmailMessage): Promise<void> {
      await db.insert(fakeEmail).values({
        id: newId(),
        to_email: message.to.trim().toLowerCase(),
        purpose: message.purpose,
        subject: message.subject,
        text_body: message.text,
        html_body: message.html,
      });
      log('email_sent', { provider: 'fake', purpose: message.purpose });
    },
  };
}
