import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import { IssuedCertificate } from '../issuance/issuance.entity';
import { AuditService } from '../audit/audit.service';

const execFileP = promisify(execFile);

@Injectable()
export class RevocationService {
  private readonly logger = new Logger(RevocationService.name);

  constructor(
    @InjectRepository(IssuedCertificate)
    private readonly repo: Repository<IssuedCertificate>,
    private readonly audit: AuditService,
  ) {}

  /** Ghi 1 giao dich OP_RETURN REVOKE:<certUid> len Bitcoin regtest, tra ve txid. */
  private async broadcastRevocationOnChain(certUid: string): Promise<string> {
    const data = Buffer.from(`REVOKE:${certUid}`, 'utf-8').toString('hex');
    const utxos = JSON.parse(await this.cli(['listunspent']));
    if (!utxos.length) throw new Error('Khong co UTXO de ghi thu hoi');
    const u = utxos[0];
    const changeAddr = u.address;
    const outs = {
      [changeAddr]: Math.max(0, +(u.amount - 0.0002).toFixed(8)),
      data,
    };
    const raw = (
      await this.cli([
        'createrawtransaction',
        JSON.stringify([{ txid: u.txid, vout: u.vout }]),
        JSON.stringify(outs),
      ])
    ).trim();
    const wif = fs
      .readFileSync(
        `${process.env.DATN_ROOT || '/home/khai/DATN_work/datn-blockcerts'}/storage/credentials/pk_issuer.txt`,
        'utf-8',
      )
      .trim();
    const signed = JSON.parse(
      await this.cli(['signrawtransactionwithkey', raw, JSON.stringify([wif])]),
    );
    if (!signed.complete) throw new Error('Ky giao dich thu hoi that bai');
    const txid = (await this.cli(['sendrawtransaction', signed.hex])).trim();
    await this.cli(['generatetoaddress', '1', changeAddr]);
    return txid;
  }

  private async cli(args: string[]): Promise<string> {
    const rpcUser = process.env.BITCOIN_RPC_USER || 'datn_rpc';
    const rpcPassword = process.env.BITCOIN_RPC_PASSWORD || '';
    try {
      const { stdout } = await execFileP(
        'docker',
        [
          'exec',
          'datn-bitcoin-core',
          'bitcoin-cli',
          '-regtest',
          `-rpcuser=${rpcUser}`,
          `-rpcpassword=${rpcPassword}`,
          ...args,
        ],
        { maxBuffer: 10 * 1024 * 1024, encoding: 'utf8' },
      );
      return String(stdout);
    } catch (error: any) {
      throw new Error(
        String(error?.stderr || error?.stdout || error?.message || error),
      );
    }
  }

  async revoke(id: string, reason: string, revokedBy: string) {
    try {
      const row = await this.repo.findOne({ where: { id } });
      if (!row) throw new NotFoundException('Khong tim thay chung thu');
      if (row.status !== 'issued')
        throw new ForbiddenException('Chi thu hoi duoc chung thu da phat hanh');
      if (row.revocationTxid)
        throw new ForbiddenException('Chung thu nay da bi thu hoi');

      this.logger.log(
        `Broadcasting revocation for ${row.certUid || row.id}...`,
      );
      const txid = await this.broadcastRevocationOnChain(row.certUid || row.id);
      row.status = 'revoked';
      row.revocationTxid = txid;
      row.revokedBy = revokedBy;
      row.revokeReason = reason || null;
      row.revokedAt = new Date();
      await this.repo.save(row);
      await this.audit.log({
        action: 'revoke',
        actor: revokedBy,
        actorRole: 'checker',
        targetId: row.id,
        detail: row.certUid,
        txid,
      });
      this.logger.log(`Revoked ${row.certUid} by ${revokedBy} -> tx ${txid}`);
      return {
        id,
        certUid: row.certUid,
        status: 'revoked',
        revocationTxid: txid,
      };
    } catch (e: any) {
      this.logger.error(`Revoke failed: ${e?.message || e}`);
      throw e;
    }
  }

  async isRevoked(
    certUid: string,
  ): Promise<{ revoked: boolean; txid?: string }> {
    const row = await this.repo.findOne({ where: { certUid } });
    if (row && row.revocationTxid)
      return { revoked: true, txid: row.revocationTxid };
    return { revoked: false };
  }
}
