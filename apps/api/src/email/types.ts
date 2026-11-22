/*
 * Story 26.6 (AD-9): the e-mail seam. `EMAIL_PROVIDER` picks one provider at boot (`email/index.ts`);
 * the auth's forgot-password hook and the Admin's routes send through it and never know which.
 * The kernel writes every message (`invitationEmail`, `passwordResetEmail`); a provider only sends.
 */

/** Why a message is sent. */
export type EmailPurpose = 'invitation' | 'reset';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  purpose: EmailPurpose;
}

export interface EmailProvider {
  /** Sends one message; rejects when the provider refused it. Never logs the address. */
  send(message: EmailMessage): Promise<void>;
}
