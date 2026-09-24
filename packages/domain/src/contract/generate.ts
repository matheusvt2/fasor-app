import { z } from 'zod';
import { uuidV7Schema } from '../ids.ts';

/*
 * AD-15: the generate route and the revision download. `POST /api/relatorios/{id}/generate`
 * is the flush barrier: the device names the newest op it holds and the files it expects
 * the server to have stored, and the server answers `409 not_caught_up` until both are
 * true, else enqueues one generate job. `GET /api/revisions/{id}/docx` serves the stored
 * DOCX of a revision; the PDF download waits for Epic 11.
 */

export interface GenerateRoute {
  method: 'GET' | 'POST';
  path: string;
}

export const GENERATE_ROUTES = {
  generate: (relatorioId: string): GenerateRoute => ({ method: 'POST', path: `/api/relatorios/${relatorioId}/generate` }),
  revisionDocx: (revisionId: string): GenerateRoute => ({ method: 'GET', path: `/api/revisions/${revisionId}/docx` }),
} as const;

/** The most files one generate request may name (a relatório's photos, certificates and brand images stay far below). */
export const GENERATE_MAX_EXPECTED_FILES = 10_000;

/** Body of the generate request: the device's newest op (null on a device that wrote nothing) and the files it expects stored. */
export const generateRequestSchema = z.object({
  last_op_id: uuidV7Schema.nullable(),
  // Bounded so a runaway body answers 400, not one query past Postgres's parameter limit.
  file_ids_expected: z.array(uuidV7Schema).max(GENERATE_MAX_EXPECTED_FILES),
});
export type GenerateRequest = z.infer<typeof generateRequestSchema>;

const revisionNumberSchema = z.number().int().positive();

/**
 * `queued`: a job was created and the number it will allocate; `running`: a job of this
 * relatório is already queued or running; `unchanged`: nothing counted as an edit since
 * the latest revision's snapshot, which is answered instead of a new one (FR-74).
 */
export const generateResponseSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('queued'), job_id: uuidV7Schema, revision_number: revisionNumberSchema }),
  z.object({ outcome: z.literal('running'), job_id: uuidV7Schema, revision_number: revisionNumberSchema }),
  z.object({ outcome: z.literal('unchanged'), revision_id: uuidV7Schema, revision_number: revisionNumberSchema }),
]);
export type GenerateResponse = z.infer<typeof generateResponseSchema>;

/** `details` of a `409 not_caught_up`: what the server is still missing. */
export const notCaughtUpDetailsSchema = z.object({
  missing_op: z.boolean(),
  missing_files: z.array(z.string()),
});
export type NotCaughtUpDetails = z.infer<typeof notCaughtUpDetailsSchema>;

/** The mime type of the stored DOCX, as the `file` row and the download carry it. */
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const PDF_MIME = 'application/pdf';
