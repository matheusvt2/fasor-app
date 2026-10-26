import { describe, expect, it } from 'vitest';
import { portoSeguro } from '../../fixtures/porto-seguro/op-log.ts';
import { portoSeguroSmall } from '../../fixtures/porto-seguro/small/op-log.ts';
import { replay } from '../ops/replay.ts';
import type { RevisionRow } from '../schemas/entities.ts';
import { buildSnapshot } from '../schemas/snapshot.ts';
import {
  expectedFileIds,
  generatingReason,
  generatingText,
  idleReason,
  idleRevisionNumber,
  failedReason,
  GENERATE_JOB_EXPIRE_S,
  GENERATE_JOB_QUEUE_RETENTION_S,
  isJobActive,
  jobExpiresAt,
  latestRevision,
  markedSentSince,
  missingFilesText,
  nextEditNote,
  previewFileName,
  notCaughtUpRetryable,
  nextRevisionNumber,
  readyTitle,
  readyToast,
  REVISION_BEFORE_EDITS_TAG,
  revisionMetaSegments,
  revisionsBeforeEditsBanner,
  revisionRowSegments,
  revisionTitle,
  sortRevisions,
} from './revisions.ts';

const REL = '019966c1-0000-7000-8000-000000000007';
const USER = '019966c1-0000-7000-8000-000000000002';

function revision(id: string, number: number, created_at: string): RevisionRow {
  return {
    id,
    relatorio_id: REL,
    number,
    snapshot_seq: number * 100,
    created_by: USER,
    docx_file_id: '019966c1-0000-7000-8000-0000000000d1',
    pdf_file_id: '019966c1-0000-7000-8000-0000000000d2',
    created_at,
  };
}

const REV_1 = revision('019966c1-0000-7000-8000-0000000000a1', 1, '2026-09-09T12:12:00.000Z');
const REV_2 = revision('019966c1-0000-7000-8000-0000000000a2', 2, '2026-09-10T11:47:00.000Z');

describe('4.8-UNIT-004 revision numbering and rows', () => {
  it('numbers the next revision after the latest, 1 with none', () => {
    expect(nextRevisionNumber([])).toBe(1);
    expect(nextRevisionNumber([REV_1])).toBe(2);
    expect(nextRevisionNumber([REV_2, REV_1])).toBe(3);
    expect(latestRevision([])).toBeNull();
    expect(latestRevision([REV_1, REV_2])?.id).toBe(REV_2.id);
    expect(sortRevisions([REV_1, REV_2]).map((r) => r.number)).toEqual([2, 1]);
  });

  it('Q11: the idle line names the last revision while nothing was edited since it, the next one otherwise', () => {
    expect(idleRevisionNumber([], false)).toBe(1);
    expect(idleRevisionNumber([], true)).toBe(1);
    expect(idleRevisionNumber([REV_1], false)).toBe(1);
    expect(idleRevisionNumber([REV_1], true)).toBe(2);
    expect(idleRevisionNumber([REV_1, REV_2], false)).toBe(2);
    expect(idleRevisionNumber([REV_1, REV_2], true)).toBe(3);
  });

  it('writes "Rev. n" and the row "Rev. 2 — 10/09/2026 08:47 — Bruno" with the date as a <time> segment', () => {
    expect(revisionTitle(2)).toBe('Rev. 2');
    expect(revisionRowSegments(REV_2, 'Bruno')).toEqual({
      before: 'Rev. 2 — ',
      datetime: '2026-09-10T11:47:00.000Z',
      dateText: '10/09/2026 08:47',
      after: ' — Bruno',
      tag: '',
    });
    expect(revisionMetaSegments(REV_2, 'Bruno')).toEqual({ datetime: '2026-09-10T11:47:00.000Z', dateText: '10/09/2026 08:47', after: ' · Bruno' });
    expect(revisionMetaSegments(REV_2, null).after).toBe('');
  });

  it('R7: a running job is active until started_at + expiry, a queued one until created_at + the queue retention', () => {
    const now = '2026-09-23T12:15:00.000Z';
    const running = (started_at: string | null, created_at = '2026-09-23T11:00:00.000Z') => ({ status: 'running' as const, created_at, started_at });
    const queued = (created_at: string) => ({ status: 'queued' as const, created_at, started_at: null });
    // Running: counted from started_at, whatever its created_at.
    expect(isJobActive(running('2026-09-23T12:00:01.000Z'), now, 900)).toBe(true);
    // Exactly the expiry is no longer active.
    expect(isJobActive(running('2026-09-23T12:00:00.000Z'), now, 900)).toBe(false);
    // A running row written before started_at existed falls back to created_at.
    expect(isJobActive(running(null, '2026-09-23T12:00:01.000Z'), now, 900)).toBe(true);
    expect(isJobActive(running(null, '2026-09-23T12:00:00.000Z'), now, 900)).toBe(false);
    // Queued: counted from created_at with the queue retention (an hour by default).
    expect(isJobActive(queued('2026-09-23T11:15:01.000Z'), now)).toBe(true);
    expect(isJobActive(queued('2026-09-23T11:15:00.000Z'), now)).toBe(false);
    expect(isJobActive(queued('2026-09-23T12:14:00.000Z'), now, 900, 60)).toBe(false);
    expect(isJobActive({ status: 'done', created_at: '2026-09-23T12:14:00.000Z' }, now)).toBe(false);
    expect(isJobActive({ status: 'failed', created_at: '2026-09-23T12:14:00.000Z' }, now)).toBe(false);
    // Unparsable dates are inactive.
    expect(isJobActive(running('garbage'), now)).toBe(false);
    expect(isJobActive(queued('garbage'), now)).toBe(false);
    expect(isJobActive(running('2026-09-23T12:14:00.000Z'), 'garbage')).toBe(false);
    // The defaults are the queue's options, one value for the api and the dialog.
    expect(GENERATE_JOB_EXPIRE_S).toBe(900);
    expect(GENERATE_JOB_QUEUE_RETENTION_S).toBe(3600);
  });

  it('names the instant a job stops counting as running', () => {
    expect(jobExpiresAt({ status: 'running', created_at: '2026-09-23T11:00:00.000Z', started_at: '2026-09-23T12:00:00.000Z' })).toBe(Date.parse('2026-09-23T12:15:00.000Z'));
    expect(jobExpiresAt({ status: 'running', created_at: '2026-09-23T12:00:00.000Z' }, 60)).toBe(Date.parse('2026-09-23T12:01:00.000Z'));
    expect(jobExpiresAt({ status: 'queued', created_at: '2026-09-23T12:00:00.000Z' })).toBe(Date.parse('2026-09-23T13:00:00.000Z'));
    expect(jobExpiresAt({ status: 'running', created_at: 'garbage' })).toBeNull();
    expect(jobExpiresAt({ status: 'done', created_at: '2026-09-23T12:00:00.000Z' })).toBeNull();
  });

  it('composes every sentence that carries the number', () => {
    expect(idleReason(3)).toBe('Gera o DOCX e o PDF juntos, a partir dos dados do app, como a revisão 3. Precisa de conexão.');
    expect(failedReason(3)).toBe('Gera o DOCX e o PDF juntos, como a revisão 3. Precisa de conexão.');
    expect(generatingText(3)).toBe('Gerando revisão 3…');
    expect(generatingReason(3)).toBe('Gerando a revisão 3 — DOCX e PDF juntos');
    expect(readyTitle(3)).toBe('Revisão 3 pronta');
    expect(readyToast(3)).toBe('Revisão 3 pronta — DOCX e PDF');
    expect(nextEditNote(3)).toBe('Qualquer alteração a partir de agora gera a revisão 4.');
    // 2026-10-10: a ready revision is not yet with the client; marked as sent, it says so.
    expect(nextEditNote(3, { status: 'em_revisao', edited: false })).toBe('Ainda não enviada ao cliente. Qualquer alteração a partir de agora gera a revisão 4.');
    expect(nextEditNote(3, { status: 'emitido', edited: false })).toBe('Enviada ao cliente. Qualquer alteração a partir de agora gera a revisão 4.');
    expect(nextEditNote(3, { status: 'em_campo', edited: false })).toBe('Qualquer alteração a partir de agora gera a revisão 4.');
    // Sent, then reopened by an edit: Em revisão with edits claims nothing about the sending.
    expect(nextEditNote(3, { status: 'em_revisao', edited: true })).toBe('Qualquer alteração a partir de agora gera a revisão 4.');
  });
});

describe('4.8-UNIT-005 expectedFileIds', () => {
  it('is empty for the small fixture (no files, no logo, no cover photo)', () => {
    const snapshot = buildSnapshot(replay(portoSeguroSmall.log, { deadOpIds: portoSeguroSmall.deadOpIds }), portoSeguroSmall.relatorioId);
    expect(expectedFileIds(snapshot)).toEqual([]);
  });

  it('never lists a photo (photos never block Gerar), and lists the logo and the cover photo once when set', () => {
    const snapshot = buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);
    expect(snapshot.files.filter((file) => file.kind === 'photo')).toHaveLength(82);
    expect(expectedFileIds(snapshot)).toEqual([]);
    const logo = '019966c0-0000-7000-8000-0000000000f1';
    const cover = snapshot.files[0]!.id;
    const withBrand = {
      ...snapshot,
      empresa: { ...snapshot.empresa!, logo_file_id: logo },
      relatorio: { ...snapshot.relatorio, setup: { ...snapshot.relatorio.setup, cover_photo_file_id: cover } },
    };
    const brandIds = expectedFileIds(withBrand);
    expect(brandIds).toHaveLength(2);
    expect(brandIds).toContain(logo);
    expect(brandIds.filter((id) => id === cover)).toHaveLength(1);
  });

  it('lists a non-photo file of the snapshot once', () => {
    const snapshot = buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);
    const photo = snapshot.files[0]!;
    const certificate = {
      id: '019966c0-0000-7000-8000-0000000000f2',
      relatorio_id: photo.relatorio_id,
      kind: 'cover_photo' as const,
      sha256: 'ab',
      mime: 'image/jpeg',
      size: 2,
      uploaded_at: null,
      variants: null,
      removed_at: null,
    };
    expect(expectedFileIds({ ...snapshot, files: [...snapshot.files, certificate] })).toEqual([certificate.id]);
  });
});

describe('E9 sweep B14: a not_caught_up this device cannot answer', () => {
  const FILE_A = '019966b0-00b1-7000-8000-000000000001';
  const FILE_B = '019966b0-00b1-7000-8000-000000000002';

  it('retries while the server misses an op, or a file this device still uploads', () => {
    expect(notCaughtUpRetryable({ missing_op: true, missing_files: [FILE_A] }, new Set())).toBe(true);
    expect(notCaughtUpRetryable({ missing_op: false, missing_files: [FILE_A, FILE_B] }, new Set([FILE_B]))).toBe(true);
    expect(notCaughtUpRetryable({ missing_op: false, missing_files: [] }, new Set())).toBe(true);
  });

  it('fails at once when every missing file has no pending upload here', () => {
    expect(notCaughtUpRetryable({ missing_op: false, missing_files: [FILE_A] }, new Set())).toBe(false);
    expect(notCaughtUpRetryable({ missing_op: false, missing_files: [FILE_A, FILE_B] }, new Set(['other']))).toBe(false);
  });

  it('names how many files have not reached the server', () => {
    expect(missingFilesText(1)).toBe('1 arquivo ainda não chegou ao servidor');
    expect(missingFilesText(3)).toBe('3 arquivos ainda não chegaram ao servidor');
  });
});

describe('A-25 previewFileName', () => {
  it('names the preview PDF download relatorio-rascunho.pdf, as the preview route always served it', () => {
    expect(previewFileName()).toBe('relatorio-rascunho.pdf');
  });
});

describe('16.2-UNIT revisions listed before the edits', () => {
  // 2026-10-22T15:12 BRT, the revision Bruno downloaded.
  const REV = { number: 2, created_at: '2026-10-22T18:12:00.000Z' };

  it('A1: edited and never marked sent says "gerado", the date dd/mm and N, N+1', () => {
    expect(revisionsBeforeEditsBanner(REV, { edited: true, markedSent: false })).toBe(
      'Relatório gerado em 22/10 (revisão 2). Alterações desde então geram a revisão 3 — as anteriores continuam disponíveis abaixo.',
    );
  });

  it('A2: edited after being marked sent says "emitido", the mock sentence', () => {
    expect(revisionsBeforeEditsBanner({ number: 2, created_at: '2026-09-10T11:47:00.000Z' }, { edited: true, markedSent: true })).toBe(
      'Relatório emitido em 10/09 (revisão 2). Alterações desde então geram a revisão 3 — as anteriores continuam disponíveis abaixo.',
    );
  });

  it('A3/A4: null when nothing was edited, and with no revision', () => {
    expect(revisionsBeforeEditsBanner(REV, { edited: false, markedSent: false })).toBeNull();
    expect(revisionsBeforeEditsBanner(REV, { edited: false, markedSent: true })).toBeNull();
    expect(revisionsBeforeEditsBanner(null, { edited: true, markedSent: false })).toBeNull();
    expect(revisionsBeforeEditsBanner(null, { edited: true, markedSent: true })).toBeNull();
  });

  it('the row tag ends a row before the edits, and only then', () => {
    expect(REVISION_BEFORE_EDITS_TAG).toBe(' — anterior às alterações');
    expect(revisionRowSegments(REV_1, 'Bruno', true).tag).toBe(' — anterior às alterações');
    expect(revisionRowSegments(REV_1, null, true)).toMatchObject({ after: '', tag: ' — anterior às alterações' });
    expect(revisionRowSegments(REV_1, 'Bruno', false).tag).toBe('');
    expect(revisionRowSegments(REV_1, 'Bruno').tag).toBe('');
  });

  it('markedSentSince reads an emitido status put past the snapshot, pulled, acked or unsent', () => {
    const status = (value: string, seq?: number | null) => ({ kind: 'put', path: 'relatorio/status', value, ...(seq === undefined ? {} : { seq }) });
    // Pulled past the snapshot.
    expect(markedSentSince([status('emitido', 201)], 200)).toBe(true);
    // At or before the snapshot: an earlier revision's issue does not count for this one.
    expect(markedSentSince([status('emitido', 200)], 200)).toBe(false);
    expect(markedSentSince([status('emitido', 150)], 200)).toBe(false);
    // Unsent (no seq yet, or a null seq).
    expect(markedSentSince([status('emitido')], 200)).toBe(true);
    expect(markedSentSince([status('emitido', null)], 200)).toBe(true);
    // Another status, another path or another kind never counts.
    expect(markedSentSince([status('em_revisao', 300), status('em_campo')], 200)).toBe(false);
    expect(markedSentSince([{ kind: 'put', path: 'relatorio/setup', value: 'emitido', seq: 300 }], 200)).toBe(false);
    expect(markedSentSince([{ kind: 'create', path: 'relatorio/status', value: 'emitido', seq: 300 }], 200)).toBe(false);
    // An issue later moved back still reads emitido (spec open question, narrowing).
    expect(markedSentSince([status('emitido', 210), status('em_revisao', 220)], 200)).toBe(true);
    expect(markedSentSince([], 200)).toBe(false);
  });
});
