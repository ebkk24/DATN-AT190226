import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { IssuedCertificate } from './issuance.entity';
import { AuditService } from '../audit/audit.service';

// Thư viện Blockcerts dùng CommonJS và chưa cung cấp type declaration.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { LDMerkleProof2019 } = require('jsonld-signatures-merkleproof2019');
const execFileP = promisify(execFile);

type SingleJobData = { id: string };
type BatchJobData = { ids: string[]; batchId?: string };

@Processor('issuance')
export class IssuanceProcessor extends WorkerHost {
  private readonly logger = new Logger(IssuanceProcessor.name);

  constructor(
    @InjectRepository(IssuedCertificate)
    private readonly repo: Repository<IssuedCertificate>,
    private readonly audit: AuditService,
  ) {
    super();
  }

  async process(job: Job<SingleJobData | BatchJobData>): Promise<any> {
    const batchData = job.data as BatchJobData;
    const ids =
      job.name === 'issue-batch'
        ? [...new Set((job.data as BatchJobData).ids || [])]
        : [(job.data as SingleJobData).id].filter(Boolean);

    if (!ids.length) throw new Error('Job phát hành không có id');
    if (ids.length > 500)
      throw new Error('Một batch chỉ hỗ trợ tối đa 500 hồ sơ');

    return this.processBatch(
      ids,
      job.name === 'issue-batch' && batchData.batchId
        ? batchData.batchId
        : String(job.id ?? crypto.randomUUID()),
    );
  }

  private projectRoot() {
    return process.env.DATN_ROOT || path.resolve(process.cwd(), '..');
  }

  private csvCell(value: unknown) {
    const text = String(value ?? '');
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  private async runDocker(args: string[], timeout = 30 * 60 * 1000) {
    const result = await execFileP('docker', args, {
      cwd: this.projectRoot(),
      env: process.env,
      timeout,
      maxBuffer: 50 * 1024 * 1024,
      encoding: 'utf8',
    });
    return result.stdout;
  }

  private decodeAnchor(certificate: Record<string, any>) {
    const proof = certificate?.proof;
    if (!proof?.proofValue) throw new Error('Chứng thư không có proofValue');
    const receipt = LDMerkleProof2019.decodeMerkleProof2019(proof);
    const anchor = (receipt.anchors || []).find(
      (value: unknown) =>
        typeof value === 'string' && value.startsWith('blink:btc:'),
    );
    if (!anchor)
      throw new Error('Không tìm thấy Bitcoin anchor trong proofValue');
    const txid = String(anchor).split(':').at(-1) || '';
    if (!/^[0-9a-f]{64}$/i.test(txid))
      throw new Error('Txid giải mã không hợp lệ');
    const merkleRoot = String(receipt.merkleRoot || '').toLowerCase();
    if (!/^[0-9a-f]{64}$/i.test(merkleRoot)) {
      throw new Error('Merkle root giải mã không hợp lệ');
    }
    return { txid: txid.toLowerCase(), merkleRoot };
  }

  private async mapWithConcurrency<T>(
    items: T[],
    limit: number,
    worker: (item: T, index: number) => Promise<void>,
  ) {
    let cursor = 0;
    const runners = Array.from(
      { length: Math.min(Math.max(1, limit), items.length) },
      async () => {
        while (true) {
          const index = cursor++;
          if (index >= items.length) return;
          await worker(items[index], index);
        }
      },
    );
    await Promise.all(runners);
  }

  private async processBatch(ids: string[], rawBatchId: string) {
    const rows = await this.repo.find({ where: { id: In(ids) } });
    if (rows.length !== ids.length)
      throw new Error('Có hồ sơ trong batch không tồn tại');
    const invalid = rows.filter((row) => row.status !== 'queued');
    if (invalid.length) {
      throw new Error(`Có ${invalid.length} hồ sơ không ở trạng thái queued`);
    }
    if (rows.some((row) => !row.pubkey)) {
      throw new Error('Có hồ sơ thiếu địa chỉ nhận (pubkey)');
    }

    const root = this.projectRoot();
    const batchId = rawBatchId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const batchRoot = path.join(root, 'backend', '.batch-work', batchId);
    const unsignedDir = path.join(batchRoot, 'unsigned');
    const signedDir = path.join(batchRoot, 'signed');
    const blockchainDir = path.join(batchRoot, 'blockchain');
    const issuerWorkDir = path.join(batchRoot, 'issuer-work');
    const rosterPath = path.join(batchRoot, 'roster.csv');
    const issuerConfigPath = path.join(batchRoot, 'issuer-conf.ini');
    const globalBlockchainDir = path.join(
      root,
      'blockcerts',
      'cert-issuer',
      'blockchain_certificates',
    );

    fs.rmSync(batchRoot, { recursive: true, force: true });
    for (const dir of [unsignedDir, signedDir, blockchainDir, issuerWorkDir]) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.mkdirSync(globalBlockchainDir, { recursive: true });

    const nonceToRow = new Map<string, IssuedCertificate>();
    const rosterLines = ['name,pubkey,identity,recipient_name,nonce'];
    for (const row of rows) {
      const nonce = crypto.randomBytes(16).toString('hex');
      nonceToRow.set(nonce, row);
      rosterLines.push(
        [
          row.recipientName,
          row.pubkey?.startsWith('ecdsa-koblitz-pubkey:')
            ? row.pubkey
            : `ecdsa-koblitz-pubkey:${row.pubkey}`,
          row.identity || '',
          row.recipientName,
          nonce,
        ]
          .map((value) => this.csvCell(value))
          .join(','),
      );
      row.status = 'processing';
      row.errorMessage = null as any;
    }
    fs.writeFileSync(rosterPath, `${rosterLines.join('\n')}\n`, 'utf8');

    const baseIssuerConfig = fs.readFileSync(
      path.join(root, 'blockcerts', 'cert-issuer', 'config', 'conf.ini'),
      'utf8',
    );
    const issuerConfig = /^batch_size\s*=.*$/m.test(baseIssuerConfig)
      ? baseIssuerConfig.replace(
          /^batch_size\s*=.*$/m,
          `batch_size=${rows.length}`,
        )
      : `${baseIssuerConfig.trim()}\nbatch_size=${rows.length}\n`;
    fs.writeFileSync(issuerConfigPath, issuerConfig, 'utf8');
    await this.repo.save(rows, { chunk: 100 });

    try {
      const dataLines = rosterLines.slice(1);
      const chunkSize = 10;
      const chunks: string[][] = [];
      for (let i = 0; i < dataLines.length; i += chunkSize) {
        chunks.push(dataLines.slice(i, i + chunkSize));
      }
      const chunkRoot = path.join(batchRoot, 'cert-tools-chunks');
      fs.mkdirSync(chunkRoot, { recursive: true });
      this.logger.log(
        `Batch ${batchId}: sinh ${rows.length} JSON bằng ${chunks.length} chunk song song`,
      );
      await this.mapWithConcurrency(chunks, 16, async (lines, index) => {
        const chunkDir = path.join(chunkRoot, String(index).padStart(3, '0'));
        const chunkUnsigned = path.join(chunkDir, 'unsigned');
        const chunkRoster = path.join(chunkDir, 'roster.csv');
        fs.mkdirSync(chunkUnsigned, { recursive: true });
        fs.writeFileSync(
          chunkRoster,
          `${[rosterLines[0], ...lines].join('\n')}\n`,
          'utf8',
        );
        await this.runDocker([
          'compose',
          '--profile',
          'tools',
          'run',
          '--rm',
          '--no-deps',
          '-v',
          `${chunkUnsigned}:/workspace/unsigned_certificates`,
          '-v',
          `${chunkRoster}:/workspace/rosters/batch.csv:ro`,
          'cert-tools',
          'instantiate-certificate-batch',
          '-c',
          'config/conf.ini',
          '--roster',
          'rosters/batch.csv',
          '--filename_format',
          'uuid',
          '--no_clobber',
        ]);
        const generated = fs
          .readdirSync(chunkUnsigned)
          .filter((name) => name.endsWith('.json'));
        if (generated.length !== lines.length) {
          throw new Error(
            `Chunk ${index} tạo ${generated.length}/${lines.length} chứng thư`,
          );
        }
        for (const filename of generated) {
          fs.copyFileSync(
            path.join(chunkUnsigned, filename),
            path.join(unsignedDir, filename),
            fs.constants.COPYFILE_EXCL,
          );
        }
      });

      const unsignedFiles = fs
        .readdirSync(unsignedDir)
        .filter((f) => f.endsWith('.json'));
      if (unsignedFiles.length !== rows.length) {
        throw new Error(
          `Cert-tools tạo ${unsignedFiles.length}/${rows.length} chứng thư`,
        );
      }

      this.logger.log(`Batch ${batchId}: ký và neo Merkle trong một giao dịch`);
      await this.runDocker([
        'compose',
        '--profile',
        'tools',
        'run',
        '--rm',
        '--no-deps',
        '-v',
        `${issuerConfigPath}:/workspace/config/conf.ini:ro`,
        '-v',
        `${unsignedDir}:/workspace/unsigned_certificates:ro`,
        '-v',
        `${signedDir}:/workspace/signed_certificates`,
        '-v',
        `${blockchainDir}:/workspace/blockchain_certificates`,
        '-v',
        `${issuerWorkDir}:/workspace/work`,
        'cert-issuer',
      ]);

      const certificateFiles = fs
        .readdirSync(blockchainDir)
        .filter((f) => f.endsWith('.json'));
      if (certificateFiles.length !== rows.length) {
        throw new Error(
          `Cert-issuer tạo ${certificateFiles.length}/${rows.length} chứng thư`,
        );
      }

      this.logger.log(`Batch ${batchId}: đào một block xác nhận`);
      await execFileP(
        'sh',
        [path.join(root, 'scripts', 'mine-regtest-block.sh')],
        {
          cwd: root,
          env: process.env,
          timeout: 5 * 60 * 1000,
          maxBuffer: 10 * 1024 * 1024,
          encoding: 'utf8',
        },
      );

      const matched = new Set<string>();
      const txids = new Set<string>();
      for (const filename of certificateFiles) {
        const sourcePath = path.join(blockchainDir, filename);
        const certificate = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
        const nonce = String(certificate.nonce || '');
        const row = nonceToRow.get(nonce);
        if (!row) throw new Error(`Không ánh xạ được nonce của ${filename}`);
        if (matched.has(row.id))
          throw new Error(`Nonce trùng cho hồ sơ ${row.id}`);

        const { txid, merkleRoot } = this.decodeAnchor(certificate);
        const certUid = filename.replace(/\.json$/i, '');
        fs.copyFileSync(sourcePath, path.join(globalBlockchainDir, filename));
        row.certUid = certUid;
        row.txid = txid;
        row.merkleRoot = merkleRoot;
        row.status = 'issued';
        row.errorMessage = null as any;
        matched.add(row.id);
        txids.add(txid);
      }
      if (matched.size !== rows.length) {
        throw new Error(`Chỉ ánh xạ được ${matched.size}/${rows.length} hồ sơ`);
      }

      await this.repo.save(rows, { chunk: 100 });
      await this.audit.logMany(
        rows.map((row) => ({
          action: 'issue' as const,
          actor: row.approvedBy || 'worker',
          actorRole: 'checker',
          targetId: row.id,
          detail: `batch:${batchId}`,
          txid: row.txid,
        })),
      );

      const manifest = {
        batchId,
        count: rows.length,
        txids: [...txids],
        certificateIds: rows.map((row) => row.certUid),
        completedAt: new Date().toISOString(),
      };
      fs.writeFileSync(
        path.join(batchRoot, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
        'utf8',
      );
      this.logger.log(
        `Batch ${batchId} hoàn tất: ${rows.length} chứng thư, ${txids.size} tx`,
      );
      return manifest;
    } catch (error: any) {
      const message = String(error?.stderr || error?.message || error).slice(
        0,
        5000,
      );
      this.logger.error(`Batch ${batchId} thất bại: ${message}`);
      for (const row of rows) {
        if (row.status === 'processing') {
          row.status = 'failed';
          row.errorMessage = message;
        }
      }
      await this.repo.save(rows, { chunk: 100 });
      throw error;
    }
  }
}
