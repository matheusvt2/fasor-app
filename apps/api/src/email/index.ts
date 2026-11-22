import { EMAIL_SENDER_NAME } from '@app/domain';
import { SESv2Client } from '@aws-sdk/client-sesv2';
import type { Config } from '../config.ts';
import type { Db } from '../db/client.ts';
import { createFakeEmailProvider } from './fake.ts';
import { createSesEmailProvider } from './ses.ts';
import type { EmailProvider } from './types.ts';

export type { EmailMessage, EmailProvider, EmailPurpose } from './types.ts';
export { createFakeEmailProvider } from './fake.ts';

/**
 * Story 26.6: the provider `EMAIL_PROVIDER` names. The SES client is built only for `ses`, with the
 * SDK's default credential chain (no key in the configuration).
 */
export function emailProviderOf(config: Pick<Config, 'EMAIL_PROVIDER' | 'EMAIL_FROM' | 'SES_REGION'>, db: Db): EmailProvider {
  if (config.EMAIL_PROVIDER === 'ses') {
    return createSesEmailProvider({ client: new SESv2Client({ region: config.SES_REGION }), from: config.EMAIL_FROM, senderName: EMAIL_SENDER_NAME });
  }
  return createFakeEmailProvider(db);
}
