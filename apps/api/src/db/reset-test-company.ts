import { DeleteObjectsCommand, ListObjectVersionsCommand, type ObjectIdentifier, type S3Client } from '@aws-sdk/client-s3';
import type { Sql } from 'postgres';
import type { Db } from './client.ts';
import { resetCompanyJobs } from './reset-company-jobs.ts';
import { resetTestCompanyData } from './seed.ts';
import { TEST_SEED } from './test-seed.ts';

/*
 * `scripts/test-reset.ts <company-id>` (review 2026-09-30, E-3): empties ONE seeded test
 * company, its object versions first, then its ops, entities, push register and reading
 * runs, then its pg-boss jobs. The other test company is never touched. The objects go
 * first so a failing delete leaves the database as it was and a re-run resets everything.
 */

/** `ListObjectVersions` answers at most 1000 entries per page, and `DeleteObjects` takes at most 1000 keys. */
const S3_PAGE = 1000;

/** How many times the prefix is listed and emptied before the reset gives up. */
const MAX_PURGE_ROUNDS = 10;

/** Every object version and delete marker under `prefix`, listed page by page (`KeyMarker`/`VersionIdMarker`). */
async function listVersions(s3: S3Client, bucket: string, prefix: string, pageSize: number): Promise<ObjectIdentifier[]> {
  const versions: ObjectIdentifier[] = [];
  let keyMarker: string | undefined;
  let versionIdMarker: string | undefined;
  for (;;) {
    const page = await s3.send(
      new ListObjectVersionsCommand({ Bucket: bucket, Prefix: prefix, MaxKeys: pageSize, KeyMarker: keyMarker, VersionIdMarker: versionIdMarker }),
    );
    for (const entry of [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])]) {
      if (entry.Key !== undefined) versions.push({ Key: entry.Key, VersionId: entry.VersionId });
    }
    if (page.IsTruncated !== true) return versions;
    keyMarker = page.NextKeyMarker;
    versionIdMarker = page.NextVersionIdMarker;
    if (keyMarker === undefined) throw new Error('ListObjectVersions answered a truncated page without a next marker');
  }
}

/**
 * Every object version and delete marker under the company's prefix: listed across every
 * page, deleted in chunks, and listed again until a listing comes back empty (MinIO lists a
 * file's `{id}/thumb` and `{id}/print` only once the `{id}` original over them is gone).
 * Returns how many were deleted. `pageSize` shrinks both pages (the test crosses a page
 * boundary with a handful of objects).
 */
export async function resetCompanyObjects(s3: S3Client, bucket: string, companyId: string, pageSize: number = S3_PAGE): Promise<number> {
  const prefix = `company/${companyId}/`;
  let total = 0;
  for (let round = 0; round < MAX_PURGE_ROUNDS; round += 1) {
    const versions = await listVersions(s3, bucket, prefix, pageSize);
    if (versions.length === 0) return total;
    for (let start = 0; start < versions.length; start += pageSize) {
      const chunk = versions.slice(start, start + pageSize);
      const deleted = await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: chunk, Quiet: true } }));
      if (deleted.Errors?.length) {
        throw new Error(`failed to delete ${deleted.Errors.length} object(s): ${deleted.Errors.map((e) => `${e.Key}: ${e.Code}`).join(', ')}`);
      }
    }
    total += versions.length;
  }
  throw new Error(`objects under ${prefix} were still listed after ${MAX_PURGE_ROUNDS} rounds of deletes`);
}

export interface ResetTestCompanyDeps {
  db: Db;
  sql: Sql;
  s3: S3Client;
  bucket: string;
  /** Test override of the S3 page size. */
  pageSize?: number;
}

/** Resets one `TEST_SEED` company; any other id throws before anything is deleted. */
export async function resetTestCompany(deps: ResetTestCompanyDeps, companyId: string): Promise<void> {
  if (!TEST_SEED.companies.some((c) => c.companyId === companyId)) {
    throw new Error(`test-reset only resets the seeded test companies; ${companyId} is not one of ${TEST_SEED.companies.map((c) => c.companyId).join(', ')}.`);
  }
  await resetCompanyObjects(deps.s3, deps.bucket, companyId, deps.pageSize);
  await resetTestCompanyData(deps.db, [companyId]);
  await resetCompanyJobs(deps.sql, companyId);
}
