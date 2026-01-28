import { Job } from 'bullmq';
import { db } from '../config/database';
import { claims, patientStatusChanges } from '../models/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { logger } from '../utils/logger';

export interface PatientDischargeJobData {
  patientId: string;
  organizationId: string;
  statusChangeId: string;
  statusType: 'discharge';
  occurredAt: Date;
  details: Record<string, any>;
}

export async function processPatientDischarge(job: Job<PatientDischargeJobData>): Promise<void> {
  const { patientId, organizationId, statusChangeId } = job.data;
  
  logger.info('Processing patient discharge job', {
    jobId: job.id,
    patientId,
    organizationId,
    statusChangeId,
  });

  try {
    // Find all pending claims for this patient
    // "Pending" could mean different statuses - use under_review and approved
    const pendingClaims = await db
      .select()
      .from(claims)
      .where(
        and(
          eq(claims.patientId, patientId),
          eq(claims.organizationId, organizationId),
          inArray(claims.status, ['under_review', 'approved'])
        )
      );

    logger.info(`Found ${pendingClaims.length} pending claims for patient`, {
      patientId,
      claimCount: pendingClaims.length,
    });

    // Move to "paid" (auto-finalize) or keep as approved based on business rules
    // For simplicity,  move under_review to approved, and approved to paid
    const claimsToApprove = pendingClaims.filter(claim => claim.status === 'under_review');
    const claimsToPay = pendingClaims.filter(claim => claim.status === 'approved');

    if (claimsToApprove.length > 0) {
      const claimIdsToApprove = claimsToApprove.map(claim => claim.id);
      
      await db
        .update(claims)
        .set({
          status: 'approved',
          approvalDate: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            inArray(claims.id, claimIdsToApprove),
            eq(claims.organizationId, organizationId)
          )
        );

      for (const claim of claimsToApprove) {
        logger.info('Claim auto-approved due to patient discharge', {
          claimId: claim.id,
          claimNumber: claim.claimNumber,
          patientId,
          oldStatus: 'under_review',
          newStatus: 'approved',
          triggeredBy: 'patient_discharge',
          jobId: job.id,
        });
      }
    }

    if (claimsToPay.length > 0) {
      const claimIdsToPay = claimsToPay.map(claim => claim.id);
      
      await db
        .update(claims)
        .set({
          status: 'paid',
          paymentDate: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            inArray(claims.id, claimIdsToPay),
            eq(claims.organizationId, organizationId)
          )
        );

      for (const claim of claimsToPay) {
        logger.info('Claim auto-paid due to patient discharge', {
          claimId: claim.id,
          claimNumber: claim.claimNumber,
          patientId,
          oldStatus: 'approved',
          newStatus: 'paid',
          triggeredBy: 'patient_discharge',
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

    logger.info('Patient discharge job completed successfully', {
      jobId: job.id,
      patientId,
      claimsApproved: claimsToApprove.length,
      claimsPaid: claimsToPay.length,
    });

  } catch (error) {
    // Update job status to failed
    await db
      .update(patientStatusChanges)
      .set({
        jobStatus: 'failed',
      })
      .where(eq(patientStatusChanges.id, statusChangeId));

    logger.error('Patient discharge job failed', {
      jobId: job.id,
      patientId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    throw error;
  }
}