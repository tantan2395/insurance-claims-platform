import { queueService } from '../services/queue.service';
import {
    processPatientAdmission,
    PatientAdmissionJobData
} from '../jobs/patient-admission.job';
import { logger } from '../utils/logger';
import env from '../config';
import { processPatientDischarge } from '../jobs/patient-discharge.job';
import { processTreatmentInitiated } from '../jobs/treatment-initiated.job';

// Prevent the process from exiting
let isShuttingDown = false;

async function startWorker() {
    try {
        // Register worker for claims processing queue
        const worker = queueService.registerWorker<PatientAdmissionJobData>(
            env.BULL_QUEUE_NAME,
            async (job: any) => {
                switch (job.name) {
                    case 'process-patient-admission':
                        return await processPatientAdmission(job);
                    case 'process-patient-discharge':
                        return await processPatientDischarge(job);
                    case 'process-treatment-initiated':
                        return await processTreatmentInitiated(job);
                    default:
                        throw new Error(`Unknown job name: ${job.name}`);
                }
            },
            {
                concurrency: 5, // Process 5 jobs concurrently
            }
        );

        logger.info('Claims processing worker started', {
            queueName: env.BULL_QUEUE_NAME,
            concurrency: 5,
        });

        // Keep the process alive by listening to worker events
        worker.on('ready', () => {
            logger.info('Worker is ready to process jobs');
        });

        worker.on('active', (job) => {
            logger.debug(`Job ${job.id} is now active`);
        });

        worker.on('completed', (job) => {
            logger.debug(`Job ${job.id} completed`);
        });

        worker.on('error', (error) => {
            logger.error('Worker error occurred', {
                error: error.message,
                stack: error.stack,
            });
        });

    } catch (error) {
        logger.error('Failed to start worker', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
        });
        process.exit(1);
    }
}

// Handle graceful shutdown
async function shutdown(signal: string) {
    if (isShuttingDown) {
        logger.warn('Shutdown already in progress');
        return;
    }

    isShuttingDown = true;
    logger.info(`${signal} received, shutting down worker gracefully`);

    try {
        await queueService.shutdown();
        logger.info('Worker shut down successfully');
        process.exit(0);
    } catch (error) {
        logger.error('Error during shutdown', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        process.exit(1);
    }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception in worker', {
        error: error.message,
        stack: error.stack,
    });
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled promise rejection in worker', {
        reason,
        promise,
    });
    process.exit(1);
});

// Start the worker
startWorker().catch((error) => {
    logger.error('Failed to start worker', {
        error: error instanceof Error ? error.message : 'Unknown error',
    });
    process.exit(1);
});