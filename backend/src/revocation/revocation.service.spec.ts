import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { RevocationService } from './revocation.service';

const TXID = 'a'.repeat(64);
const CERT_UID = 'cert-1';
const revokePayload = Buffer.from(`REVOKE:${CERT_UID}`, 'utf8');
const revokeScript = `6a${revokePayload.length.toString(16).padStart(2, '0')}${revokePayload.toString('hex')}`;

function rpcResponse(result: unknown = null, error: unknown = null) {
  return Promise.resolve({
    ok: true,
    json: async () => ({ result, error }),
  } as Response);
}

function makeHarness(rowOverrides: Record<string, unknown> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'revocation-test-'));
  mkdirSync(join(root, 'storage/credentials'), { recursive: true });
  writeFileSync(join(root, 'storage/credentials/pk_issuer.txt'), 'fake-test-wif\n');
  process.env.DATN_ROOT = root;
  process.env.BITCOIN_RPC_USER = 'test';
  process.env.BITCOIN_RPC_PASSWORD = 'test';
  process.env.ISSUING_ADDRESS = 'mnTestAddress';
  process.env.BITCOIN_WALLET = 'cert_issuer_watch';

  const row: any = {
    id: '10000000-0000-4000-8000-000000000001',
    certUid: CERT_UID,
    status: 'issued',
    revocationAttemptCount: 0,
    ...rowOverrides,
  };
  const events: string[] = [];
  const manager = {
    findOne: jest.fn(async () => row),
    save: jest.fn(async (value: any) => {
      events.push(`save:${value.status}:${value.revocationIntentTxid || 'none'}`);
      return value;
    }),
  };
  const queryRunner = {
    manager,
    connect: jest.fn(),
    query: jest.fn(),
    release: jest.fn(),
  };
  const repo = { find: jest.fn(), findOne: jest.fn() };
  const dataSource = { createQueryRunner: jest.fn(() => queryRunner) };
  const audit = { log: jest.fn() };
  const service = new RevocationService(repo as any, dataSource as any, audit as any);
  return { root, row, events, manager, queryRunner, repo, audit, service };
}

describe('RevocationService checkpoint/idempotency', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete (global as any).fetch;
  });

  it('lưu raw transaction và txid dự kiến trước khi broadcast', async () => {
    const h = makeHarness();
    const methods: string[] = [];
    (global as any).fetch = jest.fn(async (_url: string, options: any) => {
      const { method } = JSON.parse(options.body);
      methods.push(method);
      if (method === 'listunspent') return rpcResponse([{ txid: 'b'.repeat(64), vout: 0, address: 'mnTestAddress', amount: 1 }]);
      if (method === 'createrawtransaction') return rpcResponse('unsigned');
      if (method === 'signrawtransactionwithkey') return rpcResponse({ hex: 'signed', complete: true });
      if (method === 'decoderawtransaction') return rpcResponse({ txid: TXID, vout: [{ scriptPubKey: { hex: '76a91400', address: 'mnTestAddress' } }] });
      if (method === 'getrawtransaction' && methods.filter((x) => x === method).length === 1) return rpcResponse(null, { code: -5, message: 'not found' });
      if (method === 'sendrawtransaction') {
        h.events.push('broadcast');
        return rpcResponse(TXID);
      }
      if (method === 'getrawtransaction') {
        const count = methods.filter((x) => x === method).length;
        return rpcResponse({ txid: TXID, confirmations: count >= 3 ? 1 : 0, vout: [{ scriptPubKey: { hex: revokeScript } }] });
      }
      if (method === 'generatetoaddress') return rpcResponse(['block']);
      throw new Error(`RPC không được mock: ${method}`);
    });

    const result = await h.service.revoke(h.row.id, 'Sai thông tin', 'checker1');
    expect(result.status).toBe('revoked');
    expect(h.row.revocationRawTransaction).toBe('signed');
    expect(h.row.revocationIntentTxid).toBe(TXID);
    const checkpointIndex = h.events.findIndex((x) => x.includes(`revocation_pending:${TXID}`));
    expect(checkpointIndex).toBeGreaterThanOrEqual(0);
    expect(checkpointIndex).toBeLessThan(h.events.indexOf('broadcast'));
    expect(h.audit.log).toHaveBeenCalledTimes(1);
    rmSync(h.root, { recursive: true, force: true });
  });

  it('sau crash dùng lại checkpoint và không ký/broadcast giao dịch mới nếu txid đã trên chain', async () => {
    const h = makeHarness({
      status: 'revocation_reconciliation_required',
      revocationRawTransaction: 'same-signed-raw',
      revocationIntentTxid: TXID,
      revokeReason: 'Lý do cũ',
      revokedBy: 'checker1',
    });
    const methods: string[] = [];
    (global as any).fetch = jest.fn(async (_url: string, options: any) => {
      const { method } = JSON.parse(options.body);
      methods.push(method);
      if (method === 'getrawtransaction') return rpcResponse({ txid: TXID, confirmations: 1, vout: [{ scriptPubKey: { hex: revokeScript } }] });
      throw new Error(`Không được tạo RPC mới khi reconcile: ${method}`);
    });

    const result = await h.service.revoke(h.row.id, 'Lý do retry', 'checker2');
    expect(result.status).toBe('revoked');
    expect(methods).toEqual(['getrawtransaction']);
    expect(h.row.revocationRawTransaction).toBe('same-signed-raw');
    expect(h.row.revokeReason).toBe('Lý do cũ');
    rmSync(h.root, { recursive: true, force: true });
  });

  it.each(['pending_approval', 'rejected', 'queued', 'failed'])(
    'không thay đổi trạng thái %s khi yêu cầu thu hồi bị từ chối',
    async (status) => {
      const h = makeHarness({ status });
      (global as any).fetch = jest.fn();

      await expect(
        h.service.revoke(h.row.id, 'Không hợp lệ', 'checker1'),
      ).rejects.toThrow('Chi thu hoi duoc chung thu da phat hanh');

      expect(h.row.status).toBe(status);
      expect(h.row.revocationError).toBeUndefined();
      expect(h.manager.save).not.toHaveBeenCalled();
      expect((global as any).fetch).not.toHaveBeenCalled();
      rmSync(h.root, { recursive: true, force: true });
    },
  );

  it('trả kết quả cũ khi chứng thư đã thu hồi, không gọi Bitcoin RPC', async () => {
    const h = makeHarness({ status: 'revoked', revocationTxid: TXID });
    (global as any).fetch = jest.fn();
    const result = await h.service.revoke(h.row.id, 'retry', 'checker2');
    expect(result.revocationTxid).toBe(TXID);
    expect((global as any).fetch).not.toHaveBeenCalled();
    rmSync(h.root, { recursive: true, force: true });
  });
});
