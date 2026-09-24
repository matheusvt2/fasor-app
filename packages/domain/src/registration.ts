import { z } from 'zod';
import { uuidV7Schema } from './ids.ts';
import type { OpDraft } from './ops/op.ts';
import { formatPath } from './ops/path.ts';
import { councilSchema, type Council } from './schemas/council.ts';
import type { UserRow } from './schemas/entities.ts';

export { councilSchema, type Council };

/**
 * Professional registration of the signed-in user (Account > "Registro profissional").
 * Every label and every composed string lives here, so the web app and the document
 * renderer read the same text (AD-1, AD-2).
 */

const COUNCIL_LABEL: Record<Council, 'CREA' | 'CRT'> = { crea: 'CREA', crt: 'CRT' };

/**
 * Printed title suggested by the council. EXPERIENCE.md, Segmented control row:
 * "Eng. Eletricista" for CREA, "Tecnico(a) em Eletrotecnica" for CRT.
 */
const COUNCIL_DEFAULT_TITLE: Record<Council, string> = {
  crea: 'Eng. Eletricista',
  crt: 'Técnico(a) em Eletrotécnica',
};

/** "CREA" / "CRT". */
export function councilLabel(council: Council): 'CREA' | 'CRT' {
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

const ART_OR_TRT: Record<Council, 'ART' | 'TRT'> = { crea: 'ART', crt: 'TRT' };

/** The document number a council's holder signs with: "ART" for CREA, "TRT" for CRT. */
export function artOrTrtLabel(council: Council): 'ART' | 'TRT' {
  return ART_OR_TRT[council];
}

/**
 * Relatório setup (Story 4.2, Etapa 3): "Na seção 10: 'Este relatório tem validade apenas
 * acompanhada da ART 2620262602583'", null until both the council's label and a number
 * exist.
 */
export function artTrtEchoText(label: 'ART' | 'TRT' | null, number: string | null): string | null {
  if (label === null || number === null || number.trim() === '') return null;
  return `Na seção 10: "Este relatório tem validade apenas acompanhada da ${label} ${number}"`;
}

export const registrationSchema = z.object({
  council: councilSchema,
  registrationNumber: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1).max(120),
});
export type Registration = z.infer<typeof registrationSchema>;

/**
 * The signed-in user as `GET /api/account` composes it: identity (name, e-mail, company)
 * from the identity tables, the registration fields from the kernel `user` entity.
 */
export const userProfileSchema = z.object({
  id: uuidV7Schema,
  name: z.string().min(1),
  email: z.string().min(3),
  companyId: uuidV7Schema,
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

/** The kernel `user` row's registration fields, in the shape the row text reads. */
export function registrationOfUserRow(row: Pick<UserRow, 'council' | 'registration_number' | 'title'>): RegistrationRowSource {
  return { council: row.council, registrationNumber: row.registration_number, title: row.title };
}

/**
 * A saved "Registro profissional" as the three `user/{id}/{field}` puts the device
 * commits (AD-1, AD-3): one op per field, written by the user about their own row.
 * The device stamps `device_id` and fills `prev_op_id` when it commits them (`commitBatch`).
 */
export function registrationPuts(input: {
  userId: string;
  companyId: string;
  registration: Registration;
  /** What the device shows now; a field equal to it is not written, so a save with no change commits nothing. */
  current?: RegistrationRowSource | null;
}): OpDraft[] {
  const { userId, companyId, registration, current } = input;
  const fields: ReadonlyArray<readonly [string, string, string | null | undefined]> = [
    ['council', registration.council, current?.council],
    ['registration_number', registration.registrationNumber, current?.registrationNumber],
    ['title', registration.title, current?.title],
  ];
  return fields.filter(([, value, now]) => current == null || value !== now).map(([field, value]) => ({
    kind: 'put',
    scope: 'company',
    company_id: companyId,
    project_id: null,
    relatorio_id: null,
    path: formatPath({ family: 'user/field', id: userId, field }),
    value,
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: userId,
  }));
}

/**
 * The responsável técnico a new relatório is born with (Epic 4 QA Q2, EXPERIENCE.md
 * Account row: the registration is "the default responsável of every new relatório"): the
 * signed-in user when they carry a registration (a council and a number), else nobody.
 */
export function defaultResponsibleId(user: Pick<UserProfile, 'id' | 'council' | 'registrationNumber'>): string | null {
  return user.council !== null && (user.registrationNumber?.trim() ?? '') !== '' ? user.id : null;
}

/** First letter of the name, for the app-bar avatar. */
export function avatarInitial(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase();
}
