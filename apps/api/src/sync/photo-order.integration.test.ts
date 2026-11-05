import { CONTRACT_VERSION_HEADER, fileFieldPath, photoFileRowSchema, syncPullResponseSchema, TEXT_CAPS, type Op } from '@app/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '../ids.ts';
import { companyA, routeHarness, type Company } from './rules.test-support.ts';

/*
 * Story 21.3 (contract 30): a "Geral" photo's place in section 7 travels through the sync route
 * as one `file/{id}/order_key` put. The server materializes it on the photo row and pulls it back
 * identical; two devices' puts converge (the later applied wins on every pull); a key over the
 * order-key cap, of another type or outside `0-9a-z` is refused per op while the rest of the push
 * applies; a put on a photo of another relatório is refused `op_target_missing`; and a version-29
 * bundle's pull is answered `426 contract_outdated`.
 */

const h = routeHarness('tablet-photo-order');

beforeAll(() => h.setup(), 60_000);
afterAll(() => h.cleanup());

/** A "Geral" photo create (no sheet, no item, no local, no reading) in `relatorioId`. */
function photoCreate(company: Company, relatorioId: string, id: string, localSeq: number, deviceId?: string): Op {
  const row = {
    id,
    company_id: company.companyId,
    relatorio_id: relatorioId,
    kind: 'photo',
    sha256: 'ab'.repeat(32),
    mime: 'image/jpeg',
    size: 10,
    uploaded_at: null,
    variants: null,
    removed_at: null,
    captured_at: new Date().toISOString(),
    tz_offset: -180,
    coords: null,
    local_seq: localSeq,
    block_id: null,
    item_key: null,
    caption: null,
    reading_kind: null,
    reading_target: null,
    reading_status: 'none',
    people_in_photo: false,
  };
  return h.clientOp(company, { kind: 'create', path: `file/${id}`, relatorio_id: relatorioId, value: row, ...(deviceId === undefined ? {} : { device_id: deviceId }) });
}

const orderKeyPut = (relatorioId: string, id: string, value: unknown, deviceId?: string): Op =>
  h.clientOp(companyA, { kind: 'put', path: fileFieldPath(id, 'order_key'), relatorio_id: relatorioId, value, ...(deviceId === undefined ? {} : { device_id: deviceId }) });

async function pullOps(relatorioId: string, version?: string): Promise<{ status: number; ops: Op[] }> {
  const res = await h.authed(companyA, `/api/sync/relatorios/${relatorioId}?since=0`, version === undefined ? {} : { headers: { [CONTRACT_VERSION_HEADER]: version } });
  if (res.status !== 200) return { status: res.status, ops: [] };
  return { status: 200, ops: syncPullResponseSchema.parse(await res.json()).ops as Op[] };
}

const storedKey = async (id: string) => photoFileRowSchema.parse(await h.rowOf(companyA, 'file', id)).order_key;

describe('21.3-API-001 a photo order key through the sync route', () => {
  it('a photo create then an order_key put: the server row holds the key and the pull carries it back identical', async () => {
    const { relatorioId } = await h.seedRelatorio(companyA);
    const photo = newId();
    expect((await h.push(companyA, [photoCreate(companyA, relatorioId, photo, 1)])).rejected).toEqual([]);
    expect(await storedKey(photo)).toBeUndefined();
    const put = orderKeyPut(relatorioId, photo, 't0mh2k5');
    const result = await h.push(companyA, [put]);
    expect(result.rejected).toEqual([]);
    expect(await storedKey(photo)).toBe('t0mh2k5');
    const pulled = await pullOps(relatorioId);
    const echoed = pulled.ops.find((op) => op.op_id === put.op_id)!;
    expect([echoed.path, echoed.value]).toEqual([`file/${photo}/order_key`, 't0mh2k5']);
    // A null key sends the photo back to its capture-order place.
    expect((await h.push(companyA, [orderKeyPut(relatorioId, photo, null)])).rejected).toEqual([]);
    expect(await storedKey(photo)).toBeNull();
  });

  it('two devices moving the same photo converge: the later applied put wins on the row and on every pull', async () => {
    const { relatorioId } = await h.seedRelatorio(companyA);
    const photo = newId();
    expect((await h.push(companyA, [photoCreate(companyA, relatorioId, photo, 1)])).rejected).toEqual([]);
    const tablet = orderKeyPut(relatorioId, photo, 'e', 'tablet-photo-order-a');
    const phone = orderKeyPut(relatorioId, photo, 'u', 'phone-photo-order-b');
    expect((await h.push(companyA, [tablet])).rejected).toEqual([]);
    expect((await h.push(companyA, [phone])).rejected).toEqual([]);
    expect(await storedKey(photo)).toBe('u');
    for (let device = 0; device < 2; device += 1) {
      const { ops } = await pullOps(relatorioId);
      const puts = ops.filter((op) => op.path === `file/${photo}/order_key`).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
      expect(puts.map((op) => op.value)).toEqual(['e', 'u']);
    }
  });

  it('a key over the cap, of another type or outside 0-9a-z is refused per op; the rest of the push applies', async () => {
    const { relatorioId } = await h.seedRelatorio(companyA);
    const photo = newId();
    expect((await h.push(companyA, [photoCreate(companyA, relatorioId, photo, 1)])).rejected).toEqual([]);
    const over = orderKeyPut(relatorioId, photo, 'a'.repeat(TEXT_CAPS.medium + 1));
    const number = orderKeyPut(relatorioId, photo, 42);
    const alphabet = orderKeyPut(relatorioId, photo, 'Ab-1');
    const good = orderKeyPut(relatorioId, photo, 'e');
    const result = await h.push(companyA, [over, number, alphabet, good]);
    expect(result.rejected).toEqual([
      { op_id: over.op_id, code: 'op_value_invalid' },
      { op_id: number.op_id, code: 'op_invalid' },
      { op_id: alphabet.op_id, code: 'op_invalid' },
    ]);
    expect(result.applied.map((a) => a.op_id)).toEqual([good.op_id]);
    expect(await storedKey(photo)).toBe('e');
    // At the cap it applies.
    expect((await h.push(companyA, [orderKeyPut(relatorioId, photo, 'a'.repeat(TEXT_CAPS.medium))])).rejected).toEqual([]);
  });

  it('a put on a photo of another relatório is refused op_target_missing', async () => {
    const r1 = await h.seedRelatorio(companyA);
    const r2 = await h.seedRelatorio(companyA);
    const photo = newId();
    expect((await h.push(companyA, [photoCreate(companyA, r1.relatorioId, photo, 1)])).rejected).toEqual([]);
    const misfiled = orderKeyPut(r2.relatorioId, photo, 'e');
    expect((await h.push(companyA, [misfiled])).rejected).toEqual([{ op_id: misfiled.op_id, code: 'op_target_missing' }]);
    expect(await storedKey(photo)).toBeUndefined();
  });

  it('a version-29 pull is answered 426 contract_outdated', async () => {
    const { relatorioId } = await h.seedRelatorio(companyA);
    const old = await h.authed(companyA, `/api/sync/relatorios/${relatorioId}?since=0`, { headers: { [CONTRACT_VERSION_HEADER]: '29' } });
    expect(old.status).toBe(426);
    expect(((await old.json()) as { code: string }).code).toBe('contract_outdated');
  });
});
