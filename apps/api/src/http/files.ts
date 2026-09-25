import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  checkFileCandidate,
  fileRowSchema,
  FILE_SHA256_HEADER,
  fileVariantSchema,
  isUploadFileKind,
  MAX_FILE_BYTES,
  objectKey,
  SERVER_DEVICE_ID,
  uuidV7Schema,
  toIso,
  type Clock,
  type ErrorCode,
  type ErrorResponse,
  type FilePutResponse,
  type FileRow,
  type FileVariantName,
  type FileVariants,
} from '@app/domain';
import type { S3Client } from '@aws-sdk/client-s3';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Db } from '../db/client.ts';
import type { CompanyId } from '../db/repositories/company-id.ts';
import { entities } from '../db/schema.ts';
import { newId } from '../ids.ts';
import { logError } from '../log.ts';
import { getObject, headObject, putObject } from '../storage/s3.ts';
import { hasVariants, renderVariants } from '../storage/variants.ts';
import { applyOps } from '../sync/apply.ts';
import { type AppEnv, requireSession } from './session.ts';

/*
 * AD-7, AD-10: the two file routes. Both resolve the company from the session and scope
 * every read and write by it, so a file id of another company answers exactly as an id
 * that does not exist. `PUT` is idempotent on `(id, sha256)`; `GET` is served on demand
 * and is the only read — the sync engine never prefetches an original.
 *
 * `uploaded_at` and `variants` are `system:files` server ops (`file/server`,
 * `serverOnly`), emitted through `applyOps(..., {origin: 'server'})`: the device learns
 * an upload landed by pulling them, never from this response alone.
 */

const FILES_ACTOR = 'system:files';

function fail(code: ErrorCode, message: string): ErrorResponse {
  return { code, message };
}

const notFound = fail('not_found', 'No such file.');

interface FileRowLookup {
  row: FileRow;
  relatorioId: string | null;
}

/**
 * The company's own `file` row, or null — for any other company's id, for an unknown one,
 * and for an id that is not a uuid at all. The shape is checked before the query because
 * `entities.id` is a uuid column and a malformed value would raise a cast error the route
 * would answer 500 to, which is also a way to tell a bad id from an unknown one
 * (`sync/routes.ts` guards its own `:id` the same way).
 *
 * The stored `row` is the create op's client-supplied JSON, so its `id` is *claimed*, not
 * proven. A row whose claimed id is not the id it is filed under is refused here: every
 * caller builds object keys from it, and a forged `id` would otherwise let one file's
 * bytes be written over another file's key.
 */
async function readFileRow(db: Db, companyId: CompanyId, id: string): Promise<FileRowLookup | null> {
  if (!uuidV7Schema.safeParse(id).success) return null;
  const [record] = await db
    .select({ row: entities.row, relatorio_id: entities.relatorio_id })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'file'), eq(entities.id, id)))
    .limit(1);
  if (record === undefined) return null;
  const parsed = fileRowSchema.safeParse(record.row);
  if (!parsed.success || parsed.data.id !== id) return null;
  return { row: parsed.data, relatorioId: record.relatorio_id };
}

/** Thrown while draining the body once more than `MAX_FILE_BYTES` has arrived. */
class BodyTooLargeError extends Error {}

/**
 * Reads the request body with a hard cap: the stream is abandoned as soon as the limit is
 * passed, so a 26 MB body is never buffered whole (I/O matrix "Body over the limit").
 */
async function readCappedBody(stream: ReadableStream<Uint8Array> | null): Promise<Uint8Array> {
  if (stream === null) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_FILE_BYTES) throw new BodyTooLargeError();
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function sha256Of(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export interface FileRoutesDeps {
  now: Clock;
}

export function createFileRoutes(db: Db, s3: S3Client, bucket: string, deps: FileRoutesDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  /** One `file/{id}/{field}` server op, applied as the server (AD-24 `serverOnly` family). */
  async function emitServerOp(
    companyId: CompanyId,
    lookup: FileRowLookup,
    field: 'uploaded_at' | 'variants',
    value: unknown,
  ): Promise<void> {
    const relatorioId = lookup.relatorioId;
    const result = await applyOps(
      db,
      companyId,
      [
        {
          op_id: newId(),
          company_id: companyId,
          scope: relatorioId === null ? 'company' : 'relatorio',
          project_id: null,
          relatorio_id: relatorioId,
          kind: 'put',
          path: `file/${lookup.row.id}/${field}`,
          value,
          prev_op_id: null,
          batch_id: null,
          meta: null,
          actor_id: FILES_ACTOR,
          device_id: SERVER_DEVICE_ID,
          client_ts: toIso(deps.now()),
        },
      ],
      { now: deps.now, origin: 'server' },
    );
    const rejected = result.rejected[0];
    if (rejected !== undefined) throw new Error(`file op rejected: ${rejected.code}`);
  }

  routes.put('/api/files/:id', async (c) => {
    const session = requireSession(c);
    const id = c.req.param('id');

    // The limit is checked on the declared length first, so an oversized upload is
    // refused before a single byte is read.
    const declared = Number(c.req.header('content-length') ?? '');
    if (Number.isFinite(declared) && declared > MAX_FILE_BYTES) {
      return c.json(fail('file_too_large', 'File is over the 25 MB limit.'), 413);
    }

    const lookup = await readFileRow(db, session.companyId, id);
    // AD-7: a file row this company does not hold is the device's own file whose create
    // op has not reached the server yet, and the answer is the *retryable* 409. Another
    // company's id lands here too and gets that same answer, byte for byte: AD-10 scopes
    // the lookup by the session's company, so no query can tell the two apart — which is
    // exactly the indistinguishability the cross-tenant case asks for (nothing is ever
    // stored and no byte is ever served on this path). `GET` has no retryable state and
    // answers 404 for both.
    if (lookup === null) {
      return c.json(fail('file_row_missing', 'The file row has not been applied yet.'), 409);
    }
    const { row } = lookup;
    if (!isUploadFileKind(row.kind)) {
      return c.json(fail('file_kind_invalid', 'This file kind is not stored by this route.'), 400);
    }
    const candidate = checkFileCandidate({ kind: row.kind, mime: row.mime, size: row.size });
    if (!candidate.ok) {
      // The row's own size is over the limit: the same verdict a body over the limit gets,
      // so the uploader treats it as permanent rather than as a kind it could fix.
      return candidate.reason === 'too_large'
        ? c.json(fail('file_too_large', 'File is over the 25 MB limit.'), 413)
        : c.json(fail('file_kind_invalid', 'This mime type is not stored for this file kind.'), 400);
    }

    let body: Uint8Array;
    try {
      body = await readCappedBody(c.req.raw.body);
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        return c.json(fail('file_too_large', 'File is over the 25 MB limit.'), 413);
      }
      throw error;
    }
    if (body.byteLength > MAX_FILE_BYTES) {
      return c.json(fail('file_too_large', 'File is over the 25 MB limit.'), 413);
    }

    const digest = sha256Of(body);
    const claimed = c.req.header(FILE_SHA256_HEADER);
    // The row's `size` is what every storage and quota reader believes, so the bytes have
    // to be that many. Same permanent verdict as the hash: neither can be retried into
    // agreement, and the device fixes both by writing a row that matches its file.
    if (body.byteLength !== row.size) {
      return c.json(fail('file_sha_mismatch', 'The body length is not the size the row declares.'), 409);
    }
    if (digest !== row.sha256 || (claimed !== undefined && claimed !== row.sha256)) {
      return c.json(fail('file_sha_mismatch', 'The body does not hash to the row sha256.'), 409);
    }

    // Keyed by the id the row is filed under, never by the id its JSON claims. A photo's
    // relatório is the column the row is filed under too (`entities.relatorio_id`).
    const relatorioKey = lookup.relatorioId;
    const key = objectKey(session.companyId, row.kind, id, 'original', relatorioKey);
    // Idempotent on `(id, sha256)`: the object is written once and the `uploaded_at` op
    // emitted once; a retry of the identical upload answers with the same timestamp.
    if (row.uploaded_at === null || !(await headObject(s3, bucket, key))) {
      await putObject(s3, bucket, key, body, row.mime);
    }
    // Re-read after the store: two PUTs of the same file can both have seen
    // `uploaded_at: null` above, and only one of them may emit the op.
    const stored = await readFileRow(db, session.companyId, id);
    const alreadyUploadedAt = stored?.row.uploaded_at ?? null;
    const uploadedAt = alreadyUploadedAt ?? toIso(deps.now());
    if (alreadyUploadedAt === null) await emitServerOp(session.companyId, lookup, 'uploaded_at', uploadedAt);

    // The keys are derived, never read back from the row, and whether they hold anything
    // is answered by the store: a `variants` map on the row is only ever a record of what
    // this route already wrote.
    const derived = {
      thumb: objectKey(session.companyId, row.kind, id, 'thumb', relatorioKey),
      print: objectKey(session.companyId, row.kind, id, 'print', relatorioKey),
    };
    let variants: FileVariants | null = null;
    if (hasVariants(row.mime)) {
      try {
        if (await headObject(s3, bucket, derived.thumb)) {
          // Already rendered by an earlier PUT of this same file: the retry is a no-op.
          variants = derived;
        } else {
          const rendered = await renderVariants(body, row.mime);
          if (rendered !== null) {
            await putObject(s3, bucket, derived.thumb, rendered.thumb.bytes, rendered.thumb.contentType);
            await putObject(s3, bucket, derived.print, rendered.print.bytes, rendered.print.contentType);
            variants = derived;
          }
        }
        if (variants !== null && stored?.row.variants == null) {
          await emitServerOp(session.companyId, lookup, 'variants', variants);
        }
      } catch (error) {
        // A sharp failure leaves the file uploaded and without variants: logged, never fatal.
        logError('file variants failed', { company_id: session.companyId, file_id: id, error: String(error) });
        variants = null;
      }
    }

    const answer: FilePutResponse = { id, uploaded_at: uploadedAt, variants };
    return c.json(answer, 200, { 'x-content-type-options': 'nosniff' });
  });

  routes.get('/api/files/:id/:variant', async (c) => {
    const session = requireSession(c);
    const id = c.req.param('id');
    const parsedVariant = fileVariantSchema.safeParse(c.req.param('variant'));
    if (!parsedVariant.success) return c.json(notFound, 404);
    const variant: FileVariantName = parsedVariant.data;

    const lookup = await readFileRow(db, session.companyId, id);
    if (lookup === null) return c.json(notFound, 404);
    const { row, relatorioId } = lookup;
    if (row.uploaded_at === null) return c.json(notFound, 404);

    // Every key is derived exactly as the PUT writes it, from the session's company, the
    // row's kind and the id the row is filed under. `row.variants` is client-supplied
    // JSON on a client create family, so a key read out of it would let a company name
    // another company's object (a cross-tenant read) or a path S3 refuses outright.
    // Whether a variant exists is answered by the store, not by the row.
    const key = objectKey(session.companyId, row.kind, id, variant, relatorioId);

    const stored = await getObject(s3, bucket, key);
    if (stored === null) return c.json(notFound, 404);
    return c.body(Readable.toWeb(stored.body) as ReadableStream, 200, {
      'content-type': variant === 'original' ? row.mime : stored.contentType,
      // The original is bytes a user uploaded: an `image/svg+xml` logo served inline from
      // this origin would run as script with the session cookie. It is never rendered by
      // the app (every caller reads it through `fetch()` into a Blob), so it is served as
      // a download, and neither route lets the browser sniff a type of its own.
      'x-content-type-options': 'nosniff',
      ...(variant === 'original' ? { 'content-disposition': 'attachment' } : {}),
      ...(stored.contentLength === null ? {} : { 'content-length': String(stored.contentLength) }),
    });
  });

  return routes;
}
