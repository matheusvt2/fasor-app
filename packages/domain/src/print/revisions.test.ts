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
  failedReason,
  GENERATE_JOB_EXPIRE_S,
  isJobActive,
  jobExpiresAt,
  latestRevision,
  nextEditNote,
  nextRevisionNumber,
  readyTitle,
  readyToast,
  revisionMetaSegments,
  revisionMetaText,
  revisionRowSegments,
  revisionRowText,
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

  it('writes "Rev. n" and the row "Rev. 2 — 10/09/2026 08:47 — Bruno" with the date as a <time> segment', () => {
    expect(revisionTitle(2)).toBe('Rev. 2');
    expect(revisionRowText(REV_2, 'Bruno')).toBe('Rev. 2 — 10/09/2026 08:47 — Bruno');
    expect(revisionRowSegments(REV_2, 'Bruno')).toEqual({
      before: 'Rev. 2 — ',
      datetime: '2026-09-10T11:47:00.000Z',
      dateText: '10/09/2026 08:47',
      after: ' — Bruno',
    });
    expect(revisionRowText(REV_1, null)).toBe('Rev. 1 — 09/09/2026 09:12');
    expect(revisionMetaText(REV_2, 'Bruno')).toBe('10/09/2026 08:47 · Bruno');
    expect(revisionMetaText(REV_2, ' ')).toBe('10/09/2026 08:47');
    expect(revisionMetaSegments(REV_2, 'Bruno')).toEqual({ datetime: '2026-09-10T11:47:00.000Z', dateText: '10/09/2026 08:47', after: ' · Bruno' });
    expect(revisionMetaSegments(REV_2, null).after).toBe('');
  });

  it('counts a job as active only while queued or running and younger than the queue expiry', () => {
    const job = (status: 'queued' | 'running' | 'done' | 'failed', created_at: string) => ({ status, created_at });
    const now = '2026-09-23T12:15:00.000Z';
    expect(isJobActive(job('queued', '2026-09-23T12:14:00.000Z'), now, 900)).toBe(true);
    expect(isJobActive(job('running', '2026-09-23T12:00:01.000Z'), now, 900)).toBe(true);
    // Exactly the expiry is no longer active.
    expect(isJobActive(job('running', '2026-09-23T12:00:00.000Z'), now, 900)).toBe(false);
    expect(isJobActive(job('queued', '2026-09-23T11:00:00.000Z'), now, 900)).toBe(false);
    expect(isJobActive(job('done', '2026-09-23T12:14:00.000Z'), now, 900)).toBe(false);
    expect(isJobActive(job('failed', '2026-09-23T12:14:00.000Z'), now, 900)).toBe(false);
    expect(isJobActive(job('running', 'garbage'), now, 900)).toBe(false);
    expect(isJobActive(job('running', '2026-09-23T12:14:00.000Z'), 'garbage', 900)).toBe(false);
    // The default is the queue's expiry, one value for the api and the dialog.
    expect(GENERATE_JOB_EXPIRE_S).toBe(900);
    expect(isJobActive(job('running', '2026-09-23T12:00:01.000Z'), now)).toBe(true);
    expect(isJobActive(job('running', '2026-09-23T12:00:00.000Z'), now)).toBe(false);
  });

  it('names the instant a job stops counting as running', () => {
    expect(jobExpiresAt({ created_at: '2026-09-23T12:00:00.000Z' })).toBe(Date.parse('2026-09-23T12:15:00.000Z'));
    expect(jobExpiresAt({ created_at: '2026-09-23T12:00:00.000Z' }, 60)).toBe(Date.parse('2026-09-23T12:01:00.000Z'));
    expect(jobExpiresAt({ created_at: 'garbage' })).toBeNull();
  });

  it('composes every sentence that carries the number', () => {
    expect(idleReason(3)).toBe('Gera o DOCX e o PDF juntos, a partir dos dados do app, como a revisão 3. Precisa de conexão.');
    expect(failedReason(3)).toBe('Gera o DOCX e o PDF juntos, como a revisão 3. Precisa de conexão.');
    expect(generatingText(3)).toBe('Gerando revisão 3…');
    expect(generatingReason(3)).toBe('Gerando a revisão 3 — DOCX e PDF juntos');
    expect(readyTitle(3)).toBe('Revisão 3 pronta');
    expect(readyToast(3)).toBe('Revisão 3 pronta — DOCX');
    expect(nextEditNote(3)).toBe('Qualquer alteração a partir de agora gera a revisão 4.');
  });
});

describe('4.8-UNIT-005 expectedFileIds', () => {
  it('is empty for the small fixture (no files, no logo, no cover photo)', () => {
    const snapshot = buildSnapshot(replay(portoSeguroSmall.log, { deadOpIds: portoSeguroSmall.deadOpIds }), portoSeguroSmall.relatorioId);
    expect(expectedFileIds(snapshot)).toEqual([]);
  });

  it('lists every snapshot file once, plus the logo and the cover photo when set', () => {
    const snapshot = buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);
    const ids = expectedFileIds(snapshot);
    expect(ids).toHaveLength(82);
    expect(new Set(ids).size).toBe(82);
    const logo = '019966c0-0000-7000-8000-0000000000f1';
    const cover = snapshot.files[0]!.id;
    const withBrand = {
      ...snapshot,
      empresa: { ...snapshot.empresa!, logo_file_id: logo },
      relatorio: { ...snapshot.relatorio, setup: { ...snapshot.relatorio.setup, cover_photo_file_id: cover } },
    };
    const brandIds = expectedFileIds(withBrand);
    expect(brandIds).toHaveLength(83);
    expect(brandIds).toContain(logo);
    expect(brandIds.filter((id) => id === cover)).toHaveLength(1);
  });
});
