import { Job } from 'bullmq';
import { db } from '../config/database';
import { claims, patientStatusChanges } from '../models/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { logger } from '../utils/logger';

export interface PatientAdmissionJobData {
  patientId: string;
  organizationId: string;
  statusChangeId: string;
  statusType: 'admission';
  occurredAt: Date;
  details: Record<string, any>;
}

export async function processPatientAdmission(job: Job<PatientAdmissionJobData>): Promise<void> {
  const { patientId, organizationId, statusChangeId } = job.data;
  
  logger.info('Processing patient admission job', {
    jobId: job.id,
    patientId,
    organizationId,
    statusChangeId,
  });

  try {
    // Find all submitted claims for this patient
    const submittedClaims = await db
      .select()
      .from(claims)
      .where(
        and(
          eq(claims.patientId, patientId),
          eq(claims.organizationId, organizationId),
          eq(claims.status, 'submitted')
        )
      );

    logger.info(`Found ${submittedClaims.length} submitted claims for patient`, {
      patientId,
      claimCount: submittedClaims.length,
    });

    // Mark them as "under_review"
    if (submittedClaims.length > 0) {
      const claimIds = submittedClaims.map(claim => claim.id);
      
      await db
        .update(claims)
        .set({
          status: 'under_review',
          reviewDate: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            inArray(claims.id, claimIds),
            eq(claims.organizationId, organizationId)
          )
        );

      // Log what happened for each claim
      for (const claim of submittedClaims) {
        logger.info('Claim marked for review due to patient admission', {
          claimId: claim.id,
          claimNumber: claim.claimNumber,
          patientId,
          oldStatus: 'submitted',
          newStatus: 'under_review',
          triggeredBy: 'patient_admission',
          jobId: job.id,
        });
      }
    }

    // Update job status
    await db
      .update(patientStatusChanges)
      .set({
        jobStatus: 'completed',
      })
      .where(eq(patientStatusChanges.id, statusChangeId));

    logger.info('Patient admission job completed successfully', {
      jobId: job.id,
      patientId,
      claimsUpdated: submittedClaims.length,
    });

  } catch (error) {
    // Update job status to failed
    await db
      .update(patientStatusChanges)
      .set({
        jobStatus: 'failed',
      })
      .where(eq(patientStatusChanges.id, statusChangeId));

    logger.error('Patient admission job failed', {
      jobId: job.id,
      patientId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    throw error;
  }
}