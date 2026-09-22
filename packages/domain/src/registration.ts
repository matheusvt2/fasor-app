import { z } from 'zod';

/**
 * Professional registration of the signed-in user (Account > "Registro profissional").
 * Every label and every composed string lives here, so the web app and the document
 * renderer read the same text (AD-1, AD-2).
 */

export const councilSchema = z.enum(['crea', 'crt']);
export type Council = z.infer<typeof councilSchema>;

const COUNCIL_LABEL: Record<Council, string> = { crea: 'CREA', crt: 'CRT' };

/**
 * Printed title suggested by the council. EXPERIENCE.md, Segmented control row:
 * "Eng. Eletricista" for CREA, "Tecnico(a) em Eletrotecnica" for CRT.
 */
const COUNCIL_DEFAULT_TITLE: Record<Council, string> = {
  crea: 'Eng. Eletricista',
  crt: 'Técnico(a) em Eletrotécnica',
};

/** "CREA" / "CRT". */
export function councilLabel(council: Council): string {
  return COUNCIL_LABEL[council];
}

/** The label of the number field beside the council choice: "Número CREA" / "Número CRT". */
export function registrationNumberLabel(council: Council): string {
  return `Número ${COUNCIL_LABEL[council]}`;
}

/** The title the council defaults to; the user may type another one. */
export function defaultTitleForCouncil(council: Council): string {
  return COUNCIL_DEFAULT_TITLE[council];
}

export const registrationSchema = z.object({
  council: councilSchema,
  registrationNumber: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1).max(120),
});
export type Registration = z.infer<typeof registrationSchema>;

export const userProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().min(3),
  companyId: z.string().min(1),
  companyName: z.string().min(1),
  council: councilSchema.nullable(),
  registrationNumber: z.string().nullable(),
  title: z.string().nullable(),
});
export type UserProfile = z.infer<typeof userProfileSchema>;

export type RegistrationRowSource = Pick<UserProfile, 'council' | 'registrationNumber' | 'title'>;

/** Text of the Account "Registro profissional" settings row: "CREA SP 5069912345 · Eng. Eletricista". */
export function registrationRowText(user: RegistrationRowSource): string {
  if (user.council === null) return 'Não informado';
  const number = user.registrationNumber?.trim() ?? '';
  const head = number === '' ? councilLabel(user.council) : `${councilLabel(user.council)} ${number}`;
  const title = user.title?.trim() ?? '';
  return `${head} · ${title === '' ? defaultTitleForCouncil(user.council) : title}`;
}

/** First letter of the name, for the app-bar avatar. */
export function avatarInitial(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase();
}
