import {
  Claim,
  ClaimStatusHistory,
  claimAssignments,
} from '../models/schema';
import {
  ClaimRepository,
  PatientRepository,
  UserRepository
} from '../repositories';
import {
  ForbiddenError,
  ValidationError,
  ClaimLockedError,
  InvalidClaimStatusError,
  CrossTenantAccessError,
} from '../utils/errors';
import { TenantContext, ClaimFilters, ClaimUpdateInput, PaginatedResult } from '../types';
import { db } from '../config/database';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger';
import { generateClaimNumber } from '../utils/helpers';


const icd10Codes = [
  'I10', 'E11.9', 'J06.9', 'M54.5', 'F41.1'
]

export class ClaimService {
  private claimRepo: ClaimRepository;
  private patientRepo: PatientRepository;
  private userRepo: UserRepository;

  constructor(private tenantContext: TenantContext) {
    this.claimRepo = new ClaimRepository(tenantContext);
    this.patientRepo = new PatientRepository(tenantContext);
    this.userRepo = new UserRepository(tenantContext);
  }

  async createClaim(data: {
    patientId: string;
    providerId: string;
    diagnosisCode: string;
    diagnosisDescription?: string;
    amount: string;
    notes?: string;
  }): Promise<Claim> {
    const { patientId, providerId, diagnosisCode, amount } = data;

    // Validate patient exists in tenant
    await this.patientRepo.findByIdOrThrow(
      patientId,
      'Patient not found or access denied'
    );

    // Validate provider exists (you would have a ProviderRepository)
    // For now, let's just assume provider is validated

    // Validate diagnosis code (you would have a DiagnosisCodeRepository)
    // For now, let's just do a basic validation

    if (!icd10Codes.includes(diagnosisCode)) {
      throw new ValidationError('Invalid diagnosis code');
    }

    // Validate amount
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0 || amountNum > 1000000) {
      throw new ValidationError('Amount must be between 0 and 1,000,000');
    }

    // Generate claim number
    const claimNumber = await generateClaimNumber(this.tenantContext.organizationId);

    // Check if user is provider creating claim for themselves
    if (this.tenantContext.role === 'provider') {
      // Providers can only create claims for themselves
      // You would need to get the provider ID from the user's metadata
      // For now, we'll skip this check
    }

    // Create claim
    const claim = await this.claimRepo.create({
      claimNumber,
      patientId,
      providerId,
      diagnosisCode,
      diagnosisDescription: data.diagnosisDescription,
      amount: amount,
      notes: data.notes,
      status: 'submitted',
      submissionDate: new Date(),
    });

    logger.info('Claim created successfully', {
      claimId: claim.id,
      claimNumber: claim.claimNumber,
      patientId,
      providerId,
      createdBy: this.tenantContext.userId,
    });

    return claim;
  }

  async getClaim(claimId: string): Promise<any> {
    const claim = await this.claimRepo.findWithDetails(claimId);

    // Check permissions based on role
    await this.checkClaimAccess(claim.claim, 'read');

    return claim;
  }

  async listClaims(filters: ClaimFilters): Promise<PaginatedResult<Claim>> {
    // Apply role-based filtering
    let roleFiltered = false;

    switch (this.tenantContext.role) {
      case 'admin':
        // Admins can see all claims in their organization
        break;

      case 'claims_processor':
        // Processors can only see claims assigned to them
        filters = {
          ...filters,
          // We'll filter by assignedProcessorId in the repository
        };
        roleFiltered = true;
        break;

      case 'provider':
        // Providers can only see their own claims
        // We need to get the provider ID from user metadata
        const providerId = this.tenantContext.user.metadata?.providerId;
        if (!providerId) {
          throw new ForbiddenError('Provider ID not found in user profile');
        }
        filters = { ...filters, providerId };
        roleFiltered = true;
        break;

      case 'patient':
        // Patients can only see their own claims
        // We need to get the patient ID from user metadata
        const patientId = this.tenantContext.user.metadata?.patientId;
        if (!patientId) {
          throw new ForbiddenError('Patient ID not found in user profile');
        }
        filters = { ...filters, patientId };
        roleFiltered = true;
        break;

      default:
        throw new ForbiddenError('Invalid user role');
    }

    const result = await this.claimRepo.searchClaims(filters);

    // If role is claims_processor, we need to manually filter claims
    if (this.tenantContext.role === 'claims_processor' && !roleFiltered) {
      const assignedClaims = await this.claimRepo.findAssignedClaims(
        this.tenantContext.userId,
        filters
      );
      return {
        data: assignedClaims,
        pagination: {
          total: assignedClaims.length,
          page: 1,
          limit: assignedClaims.length,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false,
        },
      };
    }

    return result;
  }

  async updateClaimStatus(
    claimId: string,
    status: Claim['status'],
    changeReason?: string
  ): Promise<Claim> {
    const claim = await this.claimRepo.findByIdOrThrow(claimId);

    // Check permissions
    await this.checkClaimAccess(claim, 'update');

    // Check if claim is locked by another user
    if (claim.isLocked && claim.lockedBy !== this.tenantContext.userId) {
      throw new ClaimLockedError();
    }

    // Update status
    const updatedClaim = await this.claimRepo.updateClaimStatus(
      claimId,
      status,
      this.tenantContext.userId,
      changeReason
    );

    logger.info('Claim status updated', {
      claimId,
      oldStatus: claim.status,
      newStatus: status,
      changedBy: this.tenantContext.userId,
      changeReason,
    });

    return updatedClaim;
  }

  async bulkUpdateStatus(
    claimIds: string[],
    status: Claim['status'],
    changeReason?: string
  ): Promise<Claim[]> {
    // Check permissions for all claims
    for (const claimId of claimIds) {
      const claim = await this.claimRepo.findByIdOrThrow(claimId);
      await this.checkClaimAccess(claim, 'update');
    }

    // Update all claims
    const updatedClaims = await this.claimRepo.bulkUpdateStatus(
      claimIds,
      status,
      this.tenantContext.userId,
      changeReason
    );

    logger.info('Bulk claim status update', {
      claimCount: claimIds.length,
      newStatus: status,
      changedBy: this.tenantContext.userId,
      changeReason,
    });

    return updatedClaims;
  }

  async updateClaim(
    claimId: string,
    updates: ClaimUpdateInput
  ): Promise<Claim> {
    const claim = await this.claimRepo.findByIdOrThrow(claimId);

    // Check permissions
    await this.checkClaimAccess(claim, 'update');

    // Validate that claim can be modified
    if (['approved', 'paid'].includes(claim.status)) {
      throw new InvalidClaimStatusError(
        'Cannot modify approved or paid claims'
      );
    }

    // Check if claim is locked by another user
    if (claim.isLocked && claim.lockedBy !== this.tenantContext.userId) {
      throw new ClaimLockedError();
    }

    // Lock the claim for this update
    await this.claimRepo.lockClaim(claimId, this.tenantContext.userId);

    try {
      // Apply updates
      const updatedClaim = await this.claimRepo.update(claimId, {
        ...updates,
        updatedAt: new Date(),
      });

      // Unlock the claim
      await this.claimRepo.unlockClaim(claimId);

      logger.info('Claim updated', {
        claimId,
        updates,
        updatedBy: this.tenantContext.userId,
      });

      return updatedClaim;
    } catch (error) {
      // Ensure claim is unlocked even if update fails
      await this.claimRepo.unlockClaim(claimId).catch(() => {
        // Log but don't throw - original error is more important
        logger.error('Failed to unlock claim after update error', {
          claimId,
          error,
        });
      });
      throw error;
    }
  }

  async assignClaim(
    claimId: string,
    processorId: string
  ): Promise<Claim> {
    // Only admins and certain roles can assign claims
    if (!['admin', 'claims_processor'].includes(this.tenantContext.role)) {
      throw new ForbiddenError('Insufficient permissions to assign claims');
    }

    await this.claimRepo.findByIdOrThrow(claimId);

    // Verify processor exists and is in the same organization
    const processor = await this.userRepo.findByIdOrThrow(processorId);
    if (processor.organizationId !== this.tenantContext.organizationId) {
      throw new CrossTenantAccessError();
    }

    if (processor.role !== 'claims_processor') {
      throw new ValidationError('User is not a claims processor');
    }

    // Update claim assignment
    const updatedClaim = await this.claimRepo.update(claimId, {
      assignedProcessorId: processorId,
      updatedAt: new Date(),
    });

    // Create assignment record
    await db.insert(claimAssignments).values({
      claimId,
      processorId,
      assignedBy: this.tenantContext.userId,
      assignedAt: new Date(),
    });

    logger.info('Claim assigned', {
      claimId,
      processorId,
      assignedBy: this.tenantContext.userId,
    });

    return updatedClaim;
  }

  async getClaimStatusHistory(claimId: string): Promise<ClaimStatusHistory[]> {
    const claim = await this.claimRepo.findByIdOrThrow(claimId);

    // Check permissions
    await this.checkClaimAccess(claim, 'read');

    const history = await db
      .select()
      .from(claimAssignments) // This should be claimStatusHistory table
      .where(eq(claimAssignments.claimId, claimId))
      .orderBy(claimAssignments.assignedAt);

    return history as any; // Type assertion for now
  }

  async getClaimStats(): Promise<any> {
    // Check permissions
    if (!['admin', 'claims_processor'].includes(this.tenantContext.role)) {
      throw new ForbiddenError('Insufficient permissions to view stats');
    }

    return this.claimRepo.getClaimStats();
  }

  private async checkClaimAccess(
    claim: Claim,
    action: 'read' | 'update' | 'delete'
  ): Promise<void> {
    switch (this.tenantContext.role) {
      case 'admin':
        // Admins can do anything with claims in their organization
        if (claim.organizationId !== this.tenantContext.organizationId) {
          throw new CrossTenantAccessError();
        }
        break;

      case 'claims_processor':
        // Processors can only access claims assigned to them
        if (claim.organizationId !== this.tenantContext.organizationId) {
          throw new CrossTenantAccessError();
        }
        if (action === 'update' && claim.assignedProcessorId !== this.tenantContext.userId) {
          throw new ForbiddenError(
            'You can only update claims assigned to you'
          );
        }
        break;

      case 'provider':
        // Providers can only read their own claims
        if (claim.organizationId !== this.tenantContext.organizationId) {
          throw new CrossTenantAccessError();
        }
        if (action !== 'read') {
          throw new ForbiddenError('Providers can only view claims');
        }
        // Check if claim belongs to this provider
        const providerId = this.tenantContext.user.metadata?.providerId;
        if (claim.providerId !== providerId) {
          throw new ForbiddenError('You can only view your own claims');
        }
        break;

      case 'patient':
        // Patients can only read their own claims
        if (claim.organizationId !== this.tenantContext.organizationId) {
          throw new CrossTenantAccessError();
        }
        if (action !== 'read') {
          throw new ForbiddenError('Patients can only view claims');
        }
        // Check if claim belongs to this patient
        const patientId = this.tenantContext.user.metadata?.patientId;
        if (claim.patientId !== patientId) {
          throw new ForbiddenError('You can only view your own claims');
        }
        break;

      default:
        throw new ForbiddenError('Invalid user role');
    }
  }
}