import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, QueryRunner, Repository } from 'typeorm';
import * as fs from 'fs';
import { AuditService } from '../audit/audit.service';
import { IssuedCertificate } from '../issuance/issuance.entity';

type RpcEnvelope<T> = { result?: T; error?: { code: number; message: string } };
type Utxo = { txid: string; vout: number; address: string; amount: number };
type DecodedTransaction = {
  txid: string;
  confirmations?: number;
  vout?: Array<{ scriptPubKey?: { hex?: string } }>;
};

class BitcoinRpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

@Injectable()
export class RevocationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RevocationService.name);
  private reconcileTimer?: NodeJS.Timeout;
  private reconcileRunning = false;

  constructor(
    @InjectRepository(IssuedCertificate)
    private readonly repo: Repository<IssuedCertificate>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    const intervalMs = Number(process.env.REVOCATION_RECONCILE_INTERVAL_MS || 10_000);
    if (!Number.isFinite(intervalMs) || intervalMs < 1_000) return;
    this.reconcileTimer = setInterval(() => void this.reconcilePending(), intervalMs);
    this.reconcileTimer.unref();
  }

  onModuleDestroy() {
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
  }

  private rpcUrl(wallet = true): string {
    const base = (process.env.BITCOIN_RPC_URL || 'http://127.0.0.1:18443').replace(/\/$/, '');
    if (!wallet) return base;
    const name = process.env.BITCOIN_WALLET || 'cert_issuer_watch';
    return `${base}/wallet/${encodeURIComponent(name)}`;
  }

  private async rpc<T>(method: string, params: unknown[] = [], wallet = true): Promise<T> {
    const user = process.env.BITCOIN_RPC_USER || 'datn_rpc';
    const password = process.env.BITCOIN_RPC_PASSWORD || '';
    const response = await fetch(this.rpcUrl(wallet), {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'datn-revocation', method, params }),
      signal: AbortSignal.timeout(30_000),
    });
    const payload = (await response.json()) as RpcEnvelope<T>;
    if (!response.ok || payload.error) {
      throw new BitcoinRpcError(
        payload.error?.code ?? response.status,
        payload.error?.message || `Bitcoin RPC HTTP ${response.status}`,
      );
    }
    return payload.result as T;
  }

  private wif(): string {
    const root = process.env.DATN_ROOT || '/home/khai/DATN_work/datn-blockcerts';
    const value = fs.readFileSync(`${root}/storage/credentials/pk_issuer.txt`, 'utf8').trim();
    if (!value) throw new Error('Tep WIF cua issuer dang rong');
    return value;
  }

  private revocationPayload(certUid: string): { text: string; hex: string; scriptHex: string } {
    const text = `REVOKE:${certUid}`;
    const data = Buffer.from(text, 'utf8');
    if (data.length > 75) throw new Error('Du lieu thu hoi vuot gioi han OP_RETURN dang dung');
    const hex = data.toString('hex');
    const scriptHex = `6a${data.length.toString(16).padStart(2, '0')}${hex}`;
    return { text, hex, scriptHex };
  }

  /** Tạo và ký đúng một giao dịch; chưa broadcast ở bước này. */
  private async prepareTransaction(certUid: string) {
    const { hex } = this.revocationPayload(certUid);
    const utxos = await this.rpc<Utxo[]>('listunspent');
    const utxo = utxos.find((item) => item.amount > 0.0002 && item.address);
    if (!utxo) throw new Error('Khong co UTXO phu hop de ghi thu hoi');
    const change = Math.round((utxo.amount - 0.0002) * 100_000_000) / 100_000_000;
    const raw = await this.rpc<string>('createrawtransaction', [
      [{ txid: utxo.txid, vout: utxo.vout }],
      { [utxo.address]: change, data: hex },
    ]);
    const signed = await this.rpc<{ hex: string; complete: boolean }>(
      'signrawtransactionwithkey',
      [raw, [this.wif()]],
    );
    if (!signed.complete) throw new Error('Ky giao dich thu hoi that bai');
    const decoded = await this.rpc<DecodedTransaction>('decoderawtransaction', [signed.hex], false);
    if (!decoded.txid) throw new Error('Khong tinh duoc txid giao dich thu hoi');
    return { rawTransaction: signed.hex, txid: decoded.txid, changeAddress: utxo.address };
  }

  private async findTransaction(txid: string): Promise<DecodedTransaction | null> {
    try {
      return await this.rpc<DecodedTransaction>('getrawtransaction', [txid, true], false);
    } catch (error) {
      if (error instanceof BitcoinRpcError && error.code === -5) return null;
      throw error;
    }
  }

  private assertTransaction(transaction: DecodedTransaction, txid: string, certUid: string) {
    if (transaction.txid !== txid) throw new Error('Txid tren node khong trung checkpoint');
    const expectedScript = this.revocationPayload(certUid).scriptHex;
    const valid = transaction.vout?.some(
      (output) => output.scriptPubKey?.hex?.toLowerCase() === expectedScript,
    );
    if (!valid) throw new Error('Giao dich thu hoi khong chua OP_RETURN mong doi');
  }

  /** Chỉ phát lại raw transaction đã checkpoint; tuyệt đối không tạo giao dịch thay thế. */
  private async ensureBroadcast(rawTransaction: string, txid: string, certUid: string, miningAddress: string) {
    let transaction = await this.findTransaction(txid);
    if (!transaction) {
      try {
        const returnedTxid = await this.rpc<string>('sendrawtransaction', [rawTransaction], false);
        if (returnedTxid !== txid) throw new Error('Bitcoin Core tra txid khac checkpoint');
      } catch (error) {
        // Timeout có thể xảy ra sau khi node đã nhận giao dịch: luôn tra lại txid cố định.
        transaction = await this.findTransaction(txid);
        if (!transaction) throw error;
      }
      transaction = transaction || (await this.findTransaction(txid));
    }
    if (!transaction) throw new Error('Khong tim thay giao dich sau broadcast');
    this.assertTransaction(transaction, txid, certUid);
    if ((transaction.confirmations || 0) < 1) {
      await this.rpc('generatetoaddress', [1, miningAddress], false);
      transaction = await this.findTransaction(txid);
      if (!transaction || (transaction.confirmations || 0) < 1) {
        throw new Error('Giao dich thu hoi chua duoc xac nhan');
      }
      this.assertTransaction(transaction, txid, certUid);
    }
  }

  private response(row: IssuedCertificate) {
    return {
      id: row.id,
      certUid: row.certUid,
      status: row.status,
      revocationTxid: row.revocationTxid,
    };
  }

  /**
   * Khóa advisory toàn cục tuần tự hóa việc tiêu UTXO. Checkpoint raw/txid được lưu
   * trước broadcast, nên retry/crash recovery chỉ có thể dùng lại giao dịch cũ.
   */
  async revoke(id: string, reason: string, revokedBy: string) {
    const queryRunner = this.dataSource.createQueryRunner();
    let row: IssuedCertificate | null = null;
    await queryRunner.connect();
    try {
      await queryRunner.query(`SELECT pg_advisory_lock(hashtext('datn-revocation'))`);
      row = await queryRunner.manager.findOne(IssuedCertificate, { where: { id } });
      if (!row) throw new NotFoundException('Khong tim thay chung thu');
      if (row.status === 'revoked' && row.revocationTxid) return this.response(row);
      if (!['issued', 'revocation_pending', 'revocation_reconciliation_required'].includes(row.status)) {
        throw new ForbiddenException('Chi thu hoi duoc chung thu da phat hanh');
      }

      if (row.status === 'issued') {
        row.status = 'revocation_pending';
        row.revokedBy = revokedBy;
        row.revokeReason = reason || null;
        row.revocationError = null;
        await queryRunner.manager.save(row);
      }
      const certUid = row.certUid || row.id;
      row.revocationAttemptCount = (row.revocationAttemptCount || 0) + 1;

      if (!row.revocationRawTransaction || !row.revocationIntentTxid) {
        const prepared = await this.prepareTransaction(certUid);
        row.revocationRawTransaction = prepared.rawTransaction;
        row.revocationIntentTxid = prepared.txid;
        row.revocationPreparedAt = new Date();
        row.revocationError = null;
        // Checkpoint bền vững bắt buộc hoàn tất trước sendrawtransaction.
        await queryRunner.manager.save(row);
      }

      let miningAddress = process.env.ISSUING_ADDRESS;
      if (!miningAddress) {
        const decoded = await this.rpc<DecodedTransaction>(
          'decoderawtransaction',
          [row.revocationRawTransaction],
          false,
        );
        const miningOutput = decoded.vout?.find(
          (output: any) => output.scriptPubKey?.address,
        ) as any;
        miningAddress = miningOutput?.scriptPubKey?.address;
      }
      if (!miningAddress) throw new Error('Khong xac dinh duoc dia chi dao regtest');

      await this.ensureBroadcast(
        row.revocationRawTransaction,
        row.revocationIntentTxid,
        certUid,
        miningAddress,
      );
      row.status = 'revoked';
      row.revocationTxid = row.revocationIntentTxid;
      row.revokedAt = new Date();
      row.revocationError = null;
      await queryRunner.manager.save(row);
      await this.audit.log({
        action: 'revoke',
        actor: row.revokedBy,
        actorRole: 'checker',
        targetId: row.id,
        detail: row.certUid,
        txid: row.revocationTxid,
      });
      this.logger.log(`Revoked ${row.certUid} -> tx ${row.revocationTxid}`);
      return this.response(row);
    } catch (error: any) {
      if (row && row.status !== 'revoked') {
        row.status = row.revocationIntentTxid
          ? 'revocation_reconciliation_required'
          : 'revocation_pending';
        row.revocationError = String(error?.message || error).slice(0, 4000);
        try {
          await queryRunner.manager.save(row);
        } catch (saveError: any) {
          this.logger.error(`Khong luu duoc trang thai reconciliation: ${saveError?.message || saveError}`);
        }
      }
      this.logger.error(`Revoke failed for ${id}: ${error?.message || error}`);
      throw error;
    } finally {
      try {
        await queryRunner.query(`SELECT pg_advisory_unlock(hashtext('datn-revocation'))`);
      } catch {
        // Kết nối đóng cũng tự giải phóng session lock.
      }
      await queryRunner.release();
    }
  }

  async reconcilePending() {
    if (this.reconcileRunning) return;
    this.reconcileRunning = true;
    try {
      const rows = await this.repo.find({
        where: {
          status: In(['revocation_pending', 'revocation_reconciliation_required']),
        },
        order: { revocationPreparedAt: 'ASC', createdAt: 'ASC' },
        take: 20,
      });
      for (const row of rows) {
        try {
          await this.revoke(row.id, row.revokeReason || '', row.revokedBy || 'reconciler');
        } catch (error: any) {
          this.logger.warn(`Reconciliation ${row.id} chua thanh cong: ${error?.message || error}`);
        }
      }
    } finally {
      this.reconcileRunning = false;
    }
  }

  async isRevoked(certUid: string): Promise<{ revoked: boolean; pending?: boolean; txid?: string }> {
    const row = await this.repo.findOne({ where: { certUid } });
    if (row?.revocationTxid) return { revoked: true, txid: row.revocationTxid };
    if (row && ['revocation_pending', 'revocation_reconciliation_required'].includes(row.status)) {
      return { revoked: false, pending: true };
    }
    return { revoked: false };
  }
}
