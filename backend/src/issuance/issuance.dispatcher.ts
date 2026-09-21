import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
import { IssuanceBatch } from './issuance-batch.entity';
import { IssuanceOutbox } from './issuance-outbox.entity';

export const issuanceJobOptions = (jobId: string) => ({
  jobId,
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: false,
  removeOnFail: false,
});

@Injectable()
export class IssuanceDispatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IssuanceDispatcher.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @InjectQueue('issuance') private readonly queue: Queue,
    @InjectRepository(IssuanceOutbox)
    private readonly outbox: Repository<IssuanceOutbox>,
    @InjectRepository(IssuanceBatch)
    private readonly batches: Repository<IssuanceBatch>,
    private readonly dataSource: DataSource,
  ) {}

  onModuleInit() {
    void this.dispatchPending();
    this.timer = setInterval(() => void this.dispatchPending(), 5000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async dispatchBatch(batchId: string): Promise<void> {
    const row = await this.outbox.findOne({ where: { batchId } });
    if (!row || row.status === 'dispatched') return;
    const batch = await this.batches.findOneByOrFail({ batchId });
    try {
      await this.queue.add(
        'issue-batch',
        row.payload,
        issuanceJobOptions(batch.jobId),
      );
      await this.dataSource.transaction(async (manager) => {
        await manager.update(
          IssuanceOutbox,
          { id: row.id, status: 'pending' },
          {
            status: 'dispatched',
            dispatchedAt: new Date(),
            lastError: null,
            attemptCount: () => '"attemptCount" + 1',
          },
        );
        await manager.update(
          IssuanceBatch,
          { batchId, status: 'pending_enqueue' },
          { status: 'queued', enqueuedAt: new Date() },
        );
      });
    } catch (error: unknown) {
      const message = String(
        error instanceof Error ? error.message : error,
      ).slice(0, 5000);
      await this.outbox.update(row.id, {
        lastError: message,
        attemptCount: () => '"attemptCount" + 1',
      });
      throw error;
    }
  }

  async dispatchPending(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const rows = await this.outbox.find({
        where: { status: 'pending' },
        order: { createdAt: 'ASC' },
        take: 20,
      });
      for (const row of rows) {
        try {
          await this.dispatchBatch(row.batchId);
        } catch (error: unknown) {
          this.logger.warn(
            `Chưa enqueue được batch ${row.batchId}: ${String(error)}`,
          );
        }
      }
      await this.reconcileJobs();
    } finally {
      this.running = false;
    }
  }

  private async reconcileJobs() {
    const batches = await this.batches
      .createQueryBuilder('batch')
      .where('batch.status IN (:...statuses)', {
        statuses: [
          'queued',
          'processing',
          'anchor_prepared',
          'reconciliation_required',
        ],
      })
      .orderBy('batch.updatedAt', 'ASC')
      .take(20)
      .getMany();
    for (const batch of batches) {
      const job = await this.queue.getJob(batch.jobId);
      if (!job) {
        await this.queue.add(
          'issue-batch',
          { ids: batch.certificateIds, batchId: batch.batchId },
          issuanceJobOptions(batch.jobId),
        );
      } else if (await job.isFailed()) {
        // Số lần retry Worker đã hết; chỉ endpoint Checker mới được retry lại.
      }
    }
  }
  async retryBatch(batchId: string) {
    const batch = await this.batches.findOneByOrFail({ batchId });
    const job = await this.queue.getJob(batch.jobId);
    if (job) {
      if (!(await job.isFailed()) && !(await job.isCompleted())) return;
      // Tạo lại cùng jobId để một lần retry thủ công có lại ngân sách 5 attempts.
      await job.remove();
    }
    await this.queue.add(
      'issue-batch',
      {
        ids: batch.certificateIds,
        batchId: batch.batchId,
      },
      issuanceJobOptions(batch.jobId),
    );
  }
}
