import { Job } from 'bullmq';
import { db } from '../config/database';
import { claims, patientStatusChanges } from '../models/schema';
import { eq, and, inArray, or } from 'drizzle-orm';
import { logger } from '../utils/logger';

export interface TreatmentInitiatedJobData {
  patientId: string;
  organizationId: string;
  statusChangeId: string;
  statusType: 'treatment';
  occurredAt: Date;
  details: Record<string, any>;
}

export async function processTreatmentInitiated(job: Job<TreatmentInitiatedJobData>): Promise<void> {
  const { patientId, organizationId, statusChangeId, details } = job.data;
  
  logger.info('Processing treatment initiated job', {
    jobId: job.id,
    patientId,
    organizationId,
    statusChangeId,
    treatmentType: details?.treatmentType,
  });

  try {
    // Business logic: Find claims related to this treatment
    // This could be based on diagnosis code, provider, treatment type, etc.
    // For now, we'll find all claims for this patient that are not completed
    
    const relatedClaims = await db
      .select()
      .from(claims)
      .where(
        and(
          eq(claims.patientId, patientId),
          eq(claims.organizationId, organizationId),
          inArray(claims.status, ['submitted', 'under_review'])
        )
      );

    logger.info(`Found ${relatedClaims.length} related claims for treatment`, {
      patientId,
      claimCount: relatedClaims.length,
      treatmentType: details?.treatmentType,
    });

    // Update claim statuses based on business rules
    // Example: Move submitted claims to under_review, under_review claims stay as is
    const claimsToReview = relatedClaims.filter(claim => claim.status === 'submitted');

    if (claimsToReview.length > 0) {
      const claimIdsToReview = claimsToReview.map(claim => claim.id);
      
      await db
        .update(claims)
        .set({
          status: 'under_review',
          reviewDate: new Date(),
          updatedAt: new Date(),
          // You could add treatment-specific metadata
          metadata: {
            ...claims.metadata,
            lastTreatmentReview: {
              treatmentType: details?.treatmentType,
              reviewedAt: new Date().toISOString(),
              triggeredByJob: job.id,
            },
          },
        })
        .where(
          and(
            inArray(claims.id, claimIdsToReview),
            eq(claims.organizationId, organizationId)
          )
        );

      for (const claim of claimsToReview) {
        logger.info('Claim marked for review due to treatment initiation', {
          claimId: claim.id,
          claimNumber: claim.claimNumber,
          patientId,
          oldStatus: 'submitted',
          newStatus: 'under_review',
          treatmentType: details?.treatmentType,
          triggeredBy: 'treatment_initiated',
          jobId: job.id,
        });
      }
    }

    // Additional business logic could go here:
    // - Validate treatment against diagnosis codes
    // - Check if treatment requires pre-authorization
    // - Update claim amounts based on treatment
    // - Notify claims processors

    // Update job status
    await db
      .update(patientStatusChanges)
      .set({
        jobStatus: 'completed',
      })
      .where(eq(patientStatusChanges.id, statusChangeId));

    logger.info('Treatment initiated job completed successfully', {
      jobId: job.id,
      patientId,
      claimsReviewed: claimsToReview.length,
      treatmentType: details?.treatmentType,
    });

  } catch (error) {
    // Update job status to failed
    await db
      .update(patientStatusChanges)
      .set({
        jobStatus: 'failed',
      })
      .where(eq(patientStatusChanges.id, statusChangeId));

    logger.error('Treatment initiated job failed', {
      jobId: job.id,
      patientId,
      treatmentType: details?.treatmentType,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    throw error;
  }
}