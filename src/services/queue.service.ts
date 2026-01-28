import { Queue, Worker, Job } from 'bullmq';
import { redis } from '../config/redis';
import env from '../config';
import { logger } from '../utils/logger';

export class QueueService {
    private static instance: QueueService;
    private queues: Map<string, Queue> = new Map();
    private workers: Map<string, Worker> = new Map();
    private schedulers: Map<string, Queue> = new Map();

    private constructor() { }

    static getInstance(): QueueService {
        if (!QueueService.instance) {
            QueueService.instance = new QueueService();
        }
        return QueueService.instance;
    }

    getQueue(queueName: string): Queue {
        if (!this.queues.has(queueName)) {
            const queue = new Queue(queueName, {
                connection: redis,
                defaultJobOptions: {
                    attempts: parseInt(env.MAX_RETRY_ATTEMPTS.toString()),
                    backoff: {
                        type: 'exponential',
                        delay: parseInt(env.RETRY_DELAY.toString()),
                    },
                    removeOnComplete: 100, // Keep last 100 completed jobs
                    removeOnFail: 1000, // Keep last 1000 failed jobs
                },
            });
            this.queues.set(queueName, queue);

            // Setup scheduler for delayed jobs
            const scheduler = new Queue(queueName, {
                connection: redis,
            });
            this.schedulers.set(queueName, scheduler);
        }
        return this.queues.get(queueName)!;
    }

    async addJob<T = any>(
        queueName: string,
        jobName: string,
        data: T,
        options?: {
            delay?: number;
            jobId?: string;
            priority?: number;
        }
    ): Promise<Job> {
        const queue = this.getQueue(queueName);
        return queue.add(jobName, data, options);
    }

    registerWorker<T = any>(
        queueName: string,
        processor: (job: Job<T>) => Promise<any>,
        options?: {
            concurrency?: number;
        }
    ): Worker {
        if (this.workers.has(queueName)) {
            return this.workers.get(queueName)!;
        }

        const worker = new Worker(
            queueName,
            async (job) => {
                const startTime = Date.now();
                try {
                    logger.info(`Starting job ${job.name} - ${job.id}`, {
                        queue: queueName,
                        jobId: job.id,
                        data: job.data,
                    });

                    const result = await processor(job);

                    const duration = Date.now() - startTime;
                    logger.info(`Completed job ${job.name} - ${job.id}`, {
                        queue: queueName,
                        jobId: job.id,
                        duration: `${duration}ms`,
                        result,
                    });

                    return result;
                } catch (error) {
                    const duration = Date.now() - startTime;
                    logger.error(`Failed job ${job.name} - ${job.id}`, {
                        queue: queueName,
                        jobId: job.id,
                        duration: `${duration}ms`,
                        error: error instanceof Error ? error.message : 'Unknown error',
                        stack: error instanceof Error ? error.stack : undefined,
                        attempts: job.attemptsMade,
                    });

                    throw error;
                }
            },
            {
                connection: redis,
                concurrency: options?.concurrency || 5,
                removeOnComplete: { count: 100 },
                removeOnFail: { count: 1000 },
            }
        );

        worker.on('failed', (job, err) => {
            logger.error(`Job ${job?.id} failed`, {
                queue: queueName,
                jobId: job?.id,
                error: err.message,
                attempts: job?.attemptsMade,
            });
        });

        worker.on('stalled', (jobId) => {
            logger.warn(`Job ${jobId} stalled`, {
                queue: queueName,
                jobId,
            });
        });

        this.workers.set(queueName, worker);
        return worker;
    }

    async shutdown(): Promise<void> {
        // Close all workers
        for (const [name, worker] of this.workers) {
            await worker.close();
            logger.info(`Worker ${name} closed`);
        }

        // Close all queues
        for (const [name, queue] of this.queues) {
            await queue.close();
            logger.info(`Queue ${name} closed`);
        }

        // Close all schedulers
        for (const [name, scheduler] of this.schedulers) {
            await scheduler.close();
            logger.info(`Scheduler ${name} closed`);
        }

        this.workers.clear();
        this.queues.clear();
        this.schedulers.clear();
    }



    async retryFailedJobs(queueName: string): Promise<void> {
        const queue = this.getQueue(queueName);
        const failedJobs = await queue.getFailed();

        for (const job of failedJobs) {
            await job.retry();
            logger.info(`Retried failed job ${job.id}`);
        }
    }
}

export const queueService = QueueService.getInstance();