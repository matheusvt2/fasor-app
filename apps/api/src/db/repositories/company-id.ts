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
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function asCompanyId(value: string): CompanyId {
  // `company.id` is a uuid column, like `ops.company_id` and `entities.company_id`.
  if (!UUID.test(value)) throw new Error(`company id must be a uuid, got "${value}"`);
  return value as CompanyId;
}
