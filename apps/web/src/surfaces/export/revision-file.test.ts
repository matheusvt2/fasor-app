import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncRequestError } from '../../sync/client.ts';
import { downloadRevisionFile, fetchRevisionFile, shareFile, shareRevisionFile } from './revision-file.ts';

/*
 * E11-Q1: the Export dialog's rows save or share the revision file itself. `fetch`,
 * `navigator.share`, `navigator.canShare` and `URL.createObjectURL` are stubbed; the anchor
 * click is recorded with the name and URL it would save.
 */

const REVISION = '019966c1-0000-7000-8000-0000000000a1';
const PDF = { revisionId: REVISION, number: 3, format: 'pdf' as const };
const DOCX = { revisionId: REVISION, number: 3, format: 'docx' as const };

let saved: { name: string; href: string }[];
let fetchMock: ReturnType<typeof vi.fn>;

function answer(status: number, body = '%PDF-1.7'): Response {
  return new Response(body, { status });
}

beforeEach(() => {
  saved = [];
  fetchMock = vi.fn(async () => answer(200));
  vi.stubGlobal('fetch', fetchMock);
  URL.createObjectURL = vi.fn(() => 'blob:revision-file');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    saved.push({ name: this.download, href: this.getAttribute('href') ?? '' });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (navigator as { share?: unknown }).share;
  delete (navigator as { canShare?: unknown }).canShare;
});

function installShare(canShare: ((data: ShareData) => boolean) | undefined, share = vi.fn<(data: ShareData) => Promise<void>>(async () => {})) {
  Object.defineProperty(navigator, 'share', { value: share, configurable: true, writable: true });
  if (canShare !== undefined) Object.defineProperty(navigator, 'canShare', { value: vi.fn(canShare), configurable: true, writable: true });
  return share;
}

describe('revision files (E11-Q1)', () => {
  it('fetches the route with the session cookie and names and types the file', async () => {
    const file = await fetchRevisionFile(PDF);
    expect(fetchMock).toHaveBeenCalledWith(`/api/revisions/${REVISION}/pdf`, expect.objectContaining({ method: 'GET', credentials: 'same-origin' }));
    expect(file.name).toBe('relatorio-rev-3.pdf');
    expect(file.type).toBe('application/pdf');
    expect(await file.text()).toBe('%PDF-1.7');
    const docx = await fetchRevisionFile(DOCX);
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/revisions/${REVISION}/docx`, expect.anything());
    expect(docx.name).toBe('relatorio-rev-3.docx');
    expect(docx.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });

  it('downloads the file through a temporary <a download> on an object URL, and leaves no anchor behind', async () => {
    await downloadRevisionFile(PDF);
    expect(saved).toEqual([{ name: 'relatorio-rev-3.pdf', href: 'blob:revision-file' }]);
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0]![0] as File;
    expect(blob.name).toBe('relatorio-rev-3.pdf');
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it.each([
    ['a 401', () => answer(401, '')],
    ['a 500', () => answer(500, '')],
  ])('rejects on %s and saves nothing', async (_label, response) => {
    fetchMock.mockImplementation(async () => response());
    await expect(downloadRevisionFile(PDF)).rejects.toBeInstanceOf(SyncRequestError);
    expect(saved).toEqual([]);
  });

  it('rejects offline (the request never completes) and saves nothing', async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(downloadRevisionFile(DOCX)).rejects.toMatchObject({ failure: { kind: 'network' } });
    expect(saved).toEqual([]);
  });

  it('shares the file, never a URL, when the sheet takes files', async () => {
    const share = installShare(() => true);
    await expect(shareRevisionFile(PDF, 'Revisão 3 pronta')).resolves.toBe('shared');
    expect(share).toHaveBeenCalledTimes(1);
    const data = share.mock.calls[0]![0];
    expect(Object.keys(data).sort()).toEqual(['files', 'title']);
    expect(data.title).toBe('Revisão 3 pronta');
    expect(data.files![0]!.name).toBe('relatorio-rev-3.pdf');
    expect(data.files![0]!.type).toBe('application/pdf');
    expect(saved).toEqual([]);
  });

  it('downloads instead when canShare is missing or refuses files', async () => {
    const share = installShare(undefined);
    await expect(shareRevisionFile(DOCX, 'Revisão 3 pronta')).resolves.toBe('downloaded');
    expect(saved).toEqual([{ name: 'relatorio-rev-3.docx', href: 'blob:revision-file' }]);
    installShare(() => false, share);
    await expect(shareRevisionFile(PDF, 'Revisão 3 pronta')).resolves.toBe('downloaded');
    expect(share).not.toHaveBeenCalled();
    expect(saved.map((s) => s.name)).toEqual(['relatorio-rev-3.docx', 'relatorio-rev-3.pdf']);
  });

  it('is silent when the person closes the share sheet, and saves the file when the sheet refuses it', async () => {
    const share = installShare(
      () => true,
      vi.fn(async () => {
        throw new DOMException('closed', 'AbortError');
      }),
    );
    await expect(shareRevisionFile(PDF, 'Revisão 3 pronta')).resolves.toBe('cancelled');
    expect(saved).toEqual([]);
    share.mockImplementation(async () => {
      throw new DOMException('no activation', 'NotAllowedError');
    });
    await expect(shareRevisionFile(PDF, 'Revisão 3 pronta')).resolves.toBe('downloaded');
    expect(saved.map((s) => s.name)).toEqual(['relatorio-rev-3.pdf']);
  });

  it('shares a file in hand synchronously, inside the press (iPadOS keeps the user activation), with no fetch', async () => {
    const share = installShare(() => true);
    const file = new File(['%PDF'], 'relatorio-rev-3.pdf', { type: 'application/pdf' });
    const outcome = shareFile(file, 'Revisão 3 pronta');
    // Called before anything was awaited.
    expect(share).toHaveBeenCalledTimes(1);
    expect(share.mock.calls[0]![0].files![0]).toBe(file);
    await expect(outcome).resolves.toBe('shared');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a share whose fetch fails, before any sheet opens', async () => {
    const share = installShare(() => true);
    fetchMock.mockImplementation(async () => answer(503, ''));
    await expect(shareRevisionFile(PDF, 'Revisão 3 pronta')).rejects.toBeInstanceOf(SyncRequestError);
    expect(share).not.toHaveBeenCalled();
    expect(saved).toEqual([]);
  });
});
