import { SendEmailCommand } from '@aws-sdk/client-sesv2';
import { log } from '../log.ts';
import type { EmailMessage, EmailProvider } from './types.ts';

/** The part of the SES v2 client the provider calls (a test passes a fake). */
export interface SesClientLike {
  send(command: SendEmailCommand): Promise<unknown>;
}

export interface SesEmailOptions {
  client: SesClientLike;
  /** The sender address (`EMAIL_FROM`). */
  from: string;
  /** The sender's display name: the product's (`EMAIL_SENDER_NAME`). */
  senderName: string;
}

/** `Name <address>`, the name quoted when it holds a character an address header reserves. */
export function senderAddress(name: string, address: string): string {
  const oneLine = name.replace(/[\r\n]+/g, ' ').trim();
  const display = /[",.:;<>@()[\]\\]/.test(oneLine) ? `"${oneLine.replace(/["\\]/g, '\\$&')}"` : oneLine;
  return `${display} <${address}>`;
}

/**
 * Story 26.6: sends through Amazon SES v2 (`SendEmail`, simple content, UTF-8 subject and both
 * bodies). The client is built by `email/index.ts` with the SDK's default credential chain (the ECS
 * task role); no key is read here. The sender identity, DKIM and the sandbox are Story 26.7's.
 */
export function createSesEmailProvider(options: SesEmailOptions): EmailProvider {
  const from = senderAddress(options.senderName, options.from);
  return {
    async send(message: EmailMessage): Promise<void> {
      await options.client.send(
        new SendEmailCommand({
          FromEmailAddress: from,
          Destination: { ToAddresses: [message.to] },
          Content: {
            Simple: {
              Subject: { Data: message.subject, Charset: 'UTF-8' },
              Body: {
                Text: { Data: message.text, Charset: 'UTF-8' },
                Html: { Data: message.html, Charset: 'UTF-8' },
              },
            },
          },
        }),
      );
      log('email_sent', { provider: 'ses', purpose: message.purpose });
    },
  };
}
