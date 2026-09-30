import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { IssuedCertificate } from './issuance.entity';
import { IssuanceBatch } from './issuance-batch.entity';
import { AuditService } from '../audit/audit.service';

// Thư viện Blockcerts dùng CommonJS và chưa cung cấp type declaration.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const merkleProofModule = require('jsonld-signatures-merkleproof2019') as {
  LDMerkleProof2019: {
    decodeMerkleProof2019: (proof: { proofValue: string }) => unknown;
  };
};
const { LDMerkleProof2019 } = merkleProofModule;
const execFileP = promisify(execFile);

type BatchJobData = { ids: string[]; batchId: string };
type AnchorCheckpoint = {
  version: number;
  anchorTxid: string;
  merkleRoot: string;
  rawTransaction: string;
  preparedAt?: string;
  broadcastReturnedAt?: string;
};

@Processor('issuance')
export class IssuanceProcessor extends WorkerHost {
  private readonly logger = new Logger(IssuanceProcessor.name);

  constructor(
    @InjectRepository(IssuedCertificate)
    private readonly repo: Repository<IssuedCertificate>,
    @InjectRepository(IssuanceBatch)
    private readonly batches: Repository<IssuanceBatch>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {
    super();
  }

  async process(job: Job<BatchJobData>): Promise<unknown> {
    const ids = [...new Set(job.data.ids || [])];
    const batchId = String(job.data.batchId || '');
    if (!ids.length) throw new Error('Job phát hành không có id');
    if (ids.length > 500)
      throw new Error('Một batch chỉ hỗ trợ tối đa 500 hồ sơ');
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(batchId)) {
      throw new Error('batchId không hợp lệ');
    }

    const lock = this.dataSource.createQueryRunner();
    await lock.connect();
    let acquired = false;
    try {
      const result = (await lock.query(
        'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked',
        [batchId],
      )) as Array<{ locked: boolean }>;
      acquired = Boolean(result[0]?.locked);
      if (!acquired) {
        this.logger.warn(`Bỏ qua duplicate job đang được xử lý: ${batchId}`);
        return { batchId, status: 'locked_by_another_worker' };
      }
      return await this.processBatch(ids, batchId);
    } finally {
      if (acquired) {
        await lock.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [
          batchId,
        ]);
      }
      await lock.release();
    }
  }

  private projectRoot() {
    return process.env.DATN_ROOT || path.resolve(process.cwd(), '..');
  }

  private csvCell(value: string | null | undefined) {
    const text = value ?? '';
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  private stableNonce(batchId: string, rowId: string) {
    return crypto
      .createHash('sha256')
      .update(`datn-blockcerts:${batchId}:${rowId}`, 'utf8')
      .digest('hex')
      .slice(0, 32);
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

  private readCheckpoint(checkpointPath: string): AnchorCheckpoint | null {
    if (!fs.existsSync(checkpointPath)) return null;
    const value = JSON.parse(
      fs.readFileSync(checkpointPath, 'utf8'),
    ) as AnchorCheckpoint;
    if (
      value.version !== 1 ||
      !/^[0-9a-f]{64}$/i.test(value.anchorTxid) ||
      !/^[0-9a-f]{64}$/i.test(value.merkleRoot) ||
      !/^[0-9a-f]+$/i.test(value.rawTransaction) ||
      value.rawTransaction.length % 2 !== 0
    ) {
      throw new Error('Checkpoint Bitcoin không hợp lệ');
    }
    return {
      ...value,
      anchorTxid: value.anchorTxid.toLowerCase(),
      merkleRoot: value.merkleRoot.toLowerCase(),
      rawTransaction: value.rawTransaction.toLowerCase(),
    };
  }

  private decodeAnchor(certificate: Record<string, unknown>) {
    const proof = certificate.proof as { proofValue?: string } | undefined;
    if (!proof?.proofValue) throw new Error('Chứng thư không có proofValue');
    const decoded: unknown = LDMerkleProof2019.decodeMerkleProof2019({
      proofValue: proof.proofValue,
    });
    if (!decoded || typeof decoded !== 'object') {
      throw new Error('Không giải mã được Merkle proof');
    }
    const receipt = decoded as { anchors?: unknown; merkleRoot?: unknown };
    const anchors = Array.isArray(receipt.anchors) ? receipt.anchors : [];
    const anchor = anchors.find(
      (value): value is string =>
        typeof value === 'string' && value.startsWith('blink:btc:'),
    );
    if (!anchor)
      throw new Error('Không tìm thấy Bitcoin anchor trong proofValue');
    const txid = anchor.split(':').at(-1) || '';
    if (typeof receipt.merkleRoot !== 'string') {
      throw new Error('Merkle root trong proof không hợp lệ');
    }
    const merkleRoot = receipt.merkleRoot.toLowerCase();
    if (!/^[0-9a-f]{64}$/i.test(txid) || !/^[0-9a-f]{64}$/i.test(merkleRoot)) {
      throw new Error('Bitcoin anchor giải mã không hợp lệ');
    }
    return { txid: txid.toLowerCase(), merkleRoot };
  }

  private async bitcoinRpc<T>(
    method: string,
    params: unknown[] = [],
  ): Promise<T> {
    const host = process.env.BITCOIN_RPC_HOST || '127.0.0.1';
    const port = Number(process.env.BITCOIN_RPC_PORT || 18443);
    const user = process.env.BITCOIN_RPC_USER;
    const password = process.env.BITCOIN_RPC_PASSWORD;
    if (!user || !password) throw new Error('Thiếu Bitcoin RPC credential');
    const response = await fetch(`http://${host}:${port}`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '1.0', id: 'issuance', method, params }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await response.json()) as {
      result?: T;
      error?: { code?: number; message?: string } | null;
    };
    if (body.error) {
      const error = new Error(
        body.error.message || `Bitcoin RPC ${method} lỗi`,
      );
      Object.assign(error, { rpcCode: body.error.code });
      throw error;
    }
    return body.result as T;
  }

  private async transactionInfo(txid: string) {
    try {
      return await this.bitcoinRpc<{
        txid?: string;
        confirmations?: number;
        vout?: Array<{ scriptPubKey?: { hex?: string } }>;
      }>('getrawtransaction', [txid, true]);
    } catch (error: unknown) {
      if ((error as { rpcCode?: number }).rpcCode === -5) return null;
      throw error;
    }
  }

  private assertTransactionMatchesCheckpoint(
    transaction: {
      txid?: string;
      vout?: Array<{ scriptPubKey?: { hex?: string } }>;
    },
    checkpoint: AnchorCheckpoint,
  ) {
    if (transaction.txid?.toLowerCase() !== checkpoint.anchorTxid) {
      throw new Error('Transaction RPC không khớp txid checkpoint');
    }
    const expectedScript = `6a20${checkpoint.merkleRoot}`;
    const matches = (transaction.vout || []).filter(
      (output) => output.scriptPubKey?.hex?.toLowerCase() === expectedScript,
    );
    if (matches.length !== 1) {
      throw new Error('OP_RETURN không khớp Merkle root checkpoint');
    }
  }

  private async ensureExactTransaction(checkpoint: AnchorCheckpoint) {
    let transaction = await this.transactionInfo(checkpoint.anchorTxid);
    if (!transaction) {
      try {
        const txid = await this.bitcoinRpc<string>('sendrawtransaction', [
          checkpoint.rawTransaction,
        ]);
        if (txid.toLowerCase() !== checkpoint.anchorTxid) {
          throw new Error('RPC trả txid khác checkpoint');
        }
      } catch (error: unknown) {
        // Timeout hoặc phản hồi mơ hồ: chỉ truy vấn lại đúng txid, không tạo giao dịch mới.
        transaction = await this.transactionInfo(checkpoint.anchorTxid);
        if (!transaction) throw error;
      }
      transaction = await this.transactionInfo(checkpoint.anchorTxid);
      if (!transaction)
        throw new Error('Không tìm thấy transaction sau rebroadcast');
    }
    this.assertTransactionMatchesCheckpoint(transaction, checkpoint);
    return transaction;
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

  private async persistCheckpoint(
    batchId: string,
    checkpoint: AnchorCheckpoint,
    status: 'anchor_prepared' | 'reconciliation_required',
  ) {
    const existing = await this.batches.findOneByOrFail({ batchId });
    if (existing.anchorTxid && existing.anchorTxid !== checkpoint.anchorTxid) {
      throw new Error('Checkpoint txid xung đột với batch đã lưu');
    }
    await this.batches.update(batchId, {
      anchorTxid: checkpoint.anchorTxid,
      merkleRoot: checkpoint.merkleRoot,
      rawTransaction: checkpoint.rawTransaction,
      anchorPreparedAt: existing.anchorPreparedAt || new Date(),
      status,
      lastError: null,
    });
  }

  private async processBatch(ids: string[], batchId: string) {
    let batch = await this.batches.findOneByOrFail({ batchId });
    const expectedIds = [...batch.certificateIds].sort();
    if (expectedIds.join(',') !== [...ids].sort().join(',')) {
      throw new Error('Payload job không khớp certificateIds đã checkpoint');
    }
    if (batch.status === 'completed') {
      return { batchId, status: 'completed', txid: batch.anchorTxid };
    }

    const rows = await this.repo.find({ where: { id: In(ids) } });
    if (rows.length !== ids.length)
      throw new Error('Có hồ sơ trong batch không tồn tại');
    if (rows.some((row) => row.issuanceBatchId !== batchId)) {
      throw new Error('Có hồ sơ không thuộc batch');
    }
    const invalid = rows.filter(
      (row) => !['queued', 'processing', 'failed'].includes(row.status),
    );
    if (invalid.length) {
      throw new Error(
        `Có ${invalid.length} hồ sơ ở trạng thái không thể retry`,
      );
    }
    if (rows.some((row) => !row.pubkey)) {
      throw new Error('Có hồ sơ thiếu địa chỉ nhận (pubkey)');
    }

    await this.batches.update(batchId, {
      status: 'processing',
      processingStartedAt: new Date(),
      attemptCount: () => '"attemptCount" + 1',
      lastError: null,
    });
    for (const row of rows) {
      row.status = 'processing';
      row.errorMessage = null;
    }
    await this.repo.save(rows, { chunk: 100 });

    const root = this.projectRoot();
    const batchRoot = path.join(root, 'backend', '.batch-work', batchId);
    const unsignedDir = path.join(batchRoot, 'unsigned');
    const signedDir = path.join(batchRoot, 'signed');
    const blockchainDir = path.join(batchRoot, 'blockchain');
    const issuerWorkDir = path.join(batchRoot, 'issuer-work');
    const checkpointDir = path.join(batchRoot, 'checkpoint');
    const checkpointPath = path.join(checkpointDir, 'anchor-intent.json');
    const rosterPath = path.join(batchRoot, 'roster.csv');
    const issuerConfigPath = path.join(batchRoot, 'issuer-conf.ini');
    const globalBlockchainDir = path.join(
      root,
      'blockcerts',
      'cert-issuer',
      'blockchain_certificates',
    );
    for (const dir of [
      batchRoot,
      unsignedDir,
      signedDir,
      blockchainDir,
      issuerWorkDir,
      checkpointDir,
      globalBlockchainDir,
    ]) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      fs.chmodSync(dir, 0o700);
    }

    const nonceToRow = new Map<string, IssuedCertificate>();
    const rosterLines = [
      'name,pubkey,identity,recipient_name,student_code,date_of_birth,email,cohort,degree_name,major,education_level,graduation_rank,graduation_year,issue_date,diploma_number,training_mode,nonce',
    ];
    for (const row of rows) {
      const nonce = this.stableNonce(batchId, row.id);
      nonceToRow.set(nonce, row);
      rosterLines.push(
        [
          row.recipientName,
          row.pubkey?.startsWith('ecdsa-koblitz-pubkey:')
            ? row.pubkey
            : `ecdsa-koblitz-pubkey:${row.pubkey}`,
          row.identity || '',
          row.recipientName,
          row.studentCode || '',
          row.studentDateOfBirth || '',
          row.studentEmail || '',
          row.cohort || '',
          row.degreeName || '',
          row.major || '',
          row.educationLevel || '',
          row.graduationRank || '',
          String(row.graduationYear || ''),
          row.issueDate || '',
          row.diplomaNumber || '',
          row.trainingMode || '',
          nonce,
        ]
          .map((value) => this.csvCell(value))
          .join(','),
      );
    }
    fs.writeFileSync(rosterPath, `${rosterLines.join('\n')}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
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
    fs.writeFileSync(issuerConfigPath, issuerConfig, {
      encoding: 'utf8',
      mode: 0o600,
    });

    try {
      let checkpoint = this.readCheckpoint(checkpointPath);
      if (batch.anchorTxid) {
        if (!batch.rawTransaction || !batch.merkleRoot) {
          throw new Error(
            'Batch có anchorTxid nhưng thiếu raw transaction/merkle root',
          );
        }
        const dbCheckpoint: AnchorCheckpoint = {
          version: 1,
          anchorTxid: batch.anchorTxid,
          merkleRoot: batch.merkleRoot,
          rawTransaction: batch.rawTransaction,
        };
        if (checkpoint && checkpoint.anchorTxid !== dbCheckpoint.anchorTxid) {
          throw new Error('Checkpoint file xung đột với DB');
        }
        checkpoint = checkpoint || dbCheckpoint;
      }

      const unsignedFiles = fs
        .readdirSync(unsignedDir)
        .filter((name) => name.endsWith('.json'));
      if (unsignedFiles.length !== rows.length) {
        if (checkpoint) {
          throw new Error('Thiếu artifact unsigned sau khi đã chuẩn bị anchor');
        }
        fs.rmSync(unsignedDir, { recursive: true, force: true });
        fs.mkdirSync(unsignedDir, { recursive: true });
        const dataLines = rosterLines.slice(1);
        const chunks: string[][] = [];
        for (let i = 0; i < dataLines.length; i += 10) {
          chunks.push(dataLines.slice(i, i + 10));
        }
        const chunkRoot = path.join(batchRoot, 'cert-tools-chunks');
        fs.rmSync(chunkRoot, { recursive: true, force: true });
        fs.mkdirSync(chunkRoot, { recursive: true });
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
      }

      const actualUnsigned = fs
        .readdirSync(unsignedDir)
        .filter((name) => name.endsWith('.json'));
      if (actualUnsigned.length !== rows.length) {
        throw new Error(
          `Artifact unsigned có ${actualUnsigned.length}/${rows.length} chứng thư`,
        );
      }
      const artifactNonces = new Set<string>();
      for (const filename of actualUnsigned) {
        const certificate = JSON.parse(
          fs.readFileSync(path.join(unsignedDir, filename), 'utf8'),
        ) as { nonce?: unknown };
        const nonce =
          typeof certificate.nonce === 'string' ? certificate.nonce : '';
        if (!nonceToRow.has(nonce) || artifactNonces.has(nonce)) {
          throw new Error(
            `Artifact unsigned có nonce sai hoặc trùng: ${filename}`,
          );
        }
        artifactNonces.add(nonce);
      }

      // Output/work là dữ liệu dẫn xuất; unsigned và checkpoint bất biến được giữ lại.
      for (const dir of [signedDir, blockchainDir, issuerWorkDir]) {
        fs.rmSync(dir, { recursive: true, force: true });
        fs.mkdirSync(dir, { recursive: true });
      }
      const wrapper = path.join(
        root,
        'backend',
        'scripts',
        'cert-issuer-checkpoint.py',
      );
      const dockerArgs = [
        'compose',
        '--profile',
        'tools',
        'run',
        '--rm',
        '--no-deps',
        '-e',
        'DATN_ANCHOR_CHECKPOINT=/workspace/checkpoint/anchor-intent.json',
        '-v',
        `${wrapper}:/workspace/cert-issuer-checkpoint.py:ro`,
        '-v',
        `${checkpointDir}:/workspace/checkpoint`,
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
      ];

      if (!checkpoint) {
        const faultInjection: string[] = [];
        if (process.env.DATN_FAIL_BEFORE_BROADCAST === '1') {
          faultInjection.push('-e', 'DATN_FAIL_BEFORE_BROADCAST=1');
        }
        if (process.env.DATN_FAIL_AFTER_BROADCAST === '1') {
          faultInjection.push('-e', 'DATN_FAIL_AFTER_BROADCAST=1');
        }
        await this.runDocker([
          ...dockerArgs,
          ...faultInjection,
          'cert-issuer',
          'python',
          '/workspace/cert-issuer-checkpoint.py',
          '-c',
          '/workspace/config/conf.ini',
        ]);
        checkpoint = this.readCheckpoint(checkpointPath);
        if (!checkpoint)
          throw new Error('Cert-issuer không tạo anchor checkpoint');
        await this.persistCheckpoint(batchId, checkpoint, 'anchor_prepared');
      } else {
        await this.persistCheckpoint(
          batchId,
          checkpoint,
          'reconciliation_required',
        );
        await this.ensureExactTransaction(checkpoint);
        await this.runDocker([
          ...dockerArgs,
          '-e',
          'DATN_ISSUER_MODE=recover',
          '-e',
          `DATN_EXPECTED_TXID=${checkpoint.anchorTxid}`,
          '-e',
          `DATN_EXPECTED_MERKLE_ROOT=${checkpoint.merkleRoot}`,
          'cert-issuer',
          'python',
          '/workspace/cert-issuer-checkpoint.py',
          '-c',
          '/workspace/config/conf.ini',
        ]);
      }

      batch = await this.batches.findOneByOrFail({ batchId });
      if (batch.anchorTxid && batch.anchorTxid !== checkpoint.anchorTxid) {
        throw new Error('Worker cố thay đổi anchorTxid đã lưu');
      }
      await this.persistCheckpoint(batchId, checkpoint, 'anchor_prepared');
      let transaction = await this.ensureExactTransaction(checkpoint);
      if ((transaction.confirmations || 0) < 1) {
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
        transaction = await this.ensureExactTransaction(checkpoint);
        if ((transaction.confirmations || 0) < 1) {
          throw new Error('Transaction chưa có xác nhận sau khi đào block');
        }
      }

      const certificateFiles = fs
        .readdirSync(blockchainDir)
        .filter((name) => name.endsWith('.json'));
      if (certificateFiles.length !== rows.length) {
        throw new Error(
          `Cert-issuer tạo ${certificateFiles.length}/${rows.length} chứng thư`,
        );
      }
      const matched = new Set<string>();
      for (const filename of certificateFiles) {
        const sourcePath = path.join(blockchainDir, filename);
        const certificate = JSON.parse(
          fs.readFileSync(sourcePath, 'utf8'),
        ) as Record<string, unknown>;
        const nonce =
          typeof certificate.nonce === 'string' ? certificate.nonce : '';
        const row = nonceToRow.get(nonce);
        if (!row || matched.has(row.id))
          throw new Error(`Không ánh xạ được nonce của ${filename}`);
        const anchor = this.decodeAnchor(certificate);
        if (
          anchor.txid !== checkpoint.anchorTxid ||
          anchor.merkleRoot !== checkpoint.merkleRoot
        ) {
          throw new Error('Proof không khớp anchor checkpoint');
        }
        const destination = path.join(globalBlockchainDir, filename);
        fs.copyFileSync(sourcePath, destination);
        fs.chmodSync(destination, 0o600);
        row.certUid = filename.replace(/\.json$/i, '');
        row.txid = anchor.txid;
        row.merkleRoot = anchor.merkleRoot;
        row.status = 'issued';
        row.errorMessage = null;
        matched.add(row.id);
      }
      if (matched.size !== rows.length)
        throw new Error(`Chỉ ánh xạ được ${matched.size}/${rows.length} hồ sơ`);

      const certificateChecksums = rows.map((row) => {
        const filename = `${row.certUid}.json`;
        const data = fs.readFileSync(path.join(globalBlockchainDir, filename));
        return {
          certUid: row.certUid,
          filename,
          bytes: data.length,
          sha256: crypto.createHash('sha256').update(data).digest('hex'),
        };
      });
      const manifest = {
        schema: 'datn-batch-manifest-v1',
        batchId,
        count: rows.length,
        txid: checkpoint.anchorTxid,
        merkleRoot: checkpoint.merkleRoot,
        certificateFiles: certificateChecksums,
        completedAt: new Date().toISOString(),
      };
      fs.writeFileSync(
        path.join(batchRoot, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
        { encoding: 'utf8', mode: 0o600 },
      );
      await this.dataSource.transaction(async (manager) => {
        await manager.save(IssuedCertificate, rows, { chunk: 100 });
        await manager.update(
          IssuanceBatch,
          { batchId, anchorTxid: checkpoint.anchorTxid },
          { status: 'completed', completedAt: new Date(), lastError: null },
        );
      });
      try {
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
      } catch (auditError: unknown) {
        this.logger.error(
          `Không ghi được audit issue cho batch ${batchId}: ${String(auditError)}`,
        );
      }
      return manifest;
    } catch (error: unknown) {
      const checkpoint = this.readCheckpoint(checkpointPath);
      const message = String(
        (error as { stderr?: string }).stderr ||
          (error instanceof Error ? error.message : error),
      ).slice(0, 5000);
      this.logger.error(`Batch ${batchId} thất bại: ${message}`);
      if (checkpoint) {
        await this.persistCheckpoint(
          batchId,
          checkpoint,
          'reconciliation_required',
        );
        await this.batches.update(batchId, { lastError: message });
      } else {
        await this.batches.update(batchId, {
          status: 'failed',
          lastError: message,
        });
        for (const row of rows) {
          if (row.status === 'processing') {
            row.status = 'failed';
            row.errorMessage = message;
          }
        }
        await this.repo.save(rows, { chunk: 100 });
      }
      throw error;
    }
  }
}
