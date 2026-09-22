import { uuidV7Schema } from '@app/domain';

declare const companyIdBrand: unique symbol;

/**
 * A company id that was resolved from the request's session (AD-10). The brand makes
 * every repository call carry it explicitly: a bare string, a user id or an omitted
 * argument does not typecheck.
 */
export type CompanyId = string & { readonly [companyIdBrand]: 'CompanyId' };

/**
 * The only way to mint a `CompanyId`. Call it where the tenant is established — the
 * session middleware and the provisioning seed — never inside a route handler that
 * received the value from a client.
 */
export function asCompanyId(value: string): CompanyId {
  // An op's `company_id` is a uuidv7 (AD-4), so a company whose id is any other shape
  // could never sync: the tenant is refused where it is established.
  if (!uuidV7Schema.safeParse(value).success) throw new Error(`company id must be a uuidv7, got "${value}"`);
  return value as CompanyId;
}
