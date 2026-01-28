import { BaseRepository } from './base.repository';
import {
    claims,
    Claim,
    patients,
    providers,
    users,
    claimStatusHistory,
} from '../models/schema';
import { db } from '../config/database';
import {
    eq,
    and,
    SQL,
    desc,
    asc,
    between,
    sql,
    inArray,
    gte,
    lte,
    count
} from 'drizzle-orm';
import { TenantContext, ClaimFilters, PaginatedResult } from '../types';
import {
    NotFoundError,
    ConflictError,
} from '../utils/errors';

export class ClaimRepository extends BaseRepository<typeof claims> {
    protected table = claims;

    protected get tenantIdField(): keyof typeof claims['_']['columns'] {
        return 'organizationId';
    }

    constructor(tenantContext: TenantContext) {
        super(tenantContext);
    }

    async findWithDetails(claimId: string): Promise<any> {
        const [result] = await db
            .select({
                claim: claims,
                patient: patients,
                provider: providers,
                assignedProcessor: users,
            })
            .from(claims)
            .leftJoin(patients, eq(claims.patientId, patients.id))
            .leftJoin(providers, eq(claims.providerId, providers.id))
            .leftJoin(users, eq(claims.assignedProcessorId, users.id))
            .where(this.ensureTenantAccess(claimId))
            .limit(1);

        if (!result?.claim) {
            throw new NotFoundError('Claim not found');
        }

        return result;
    }

    async findAssignedClaims(
        processorId: string,
        filters?: ClaimFilters
    ): Promise<Claim[]> {
        let whereClause = and(
            this.withTenant(),
            eq(this.table.assignedProcessorId, processorId)
        );

        if (filters?.status) {
            whereClause = and(whereClause, eq(this.table.status, filters.status));
        }

        return db
            .select()
            .from(this.table)
            .where(whereClause)
            .orderBy(this.getOrderBy(filters));
    }

    async findClaimsByProvider(
        providerId: string,
        filters?: ClaimFilters
    ): Promise<Claim[]> {
        let whereClause = and(
            this.withTenant(),
            eq(this.table.providerId, providerId)
        );

        whereClause = this.applyFilters(whereClause, filters);

        return db
            .select()
            .from(this.table)
            .where(whereClause)
            .orderBy(this.getOrderBy(filters));
    }

    async findClaimsByPatient(
        patientId: string,
        filters?: ClaimFilters
    ): Promise<Claim[]> {
        let whereClause = and(
            this.withTenant(),
            eq(this.table.patientId, patientId)
        );

        whereClause = this.applyFilters(whereClause, filters);

        return db
            .select()
            .from(this.table)
            .where(whereClause)
            .orderBy(this.getOrderBy(filters));
    }

    async searchClaims(filters: ClaimFilters): Promise<PaginatedResult<Claim>> {
        const limit = filters.limit || 20;
        const offset = filters.offset || 0;

        let whereClause = this.withTenant();
        whereClause = this.applyFilters(whereClause, filters);

        // Build order by
        const orderBy = this.getOrderBy(filters);

        // Get total count
        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(this.table)
            .where(whereClause);

        const total = Number(countResult[0]?.count || 0);

        // Get paginated data
        const data = await db
            .select()
            .from(this.table)
            .where(whereClause)
            .orderBy(orderBy)
            .limit(limit)
            .offset(offset);

        const totalPages = Math.ceil(total / limit);
        const currentPage = Math.floor(offset / limit) + 1;

        return {
            data,
            pagination: {
                total,
                page: currentPage,
                limit,
                totalPages,
                hasNext: currentPage < totalPages,
                hasPrevious: currentPage > 1,
            },
        };
    }

    async lockClaim(
        claimId: string,
        userId: string
    ): Promise<Claim> {
        const claim = await this.findByIdOrThrow(claimId, 'Claim not found');

        if (claim.isLocked && claim.lockedBy !== userId) {
            throw new ConflictError(
                `Claim is locked by another user. Locked by: ${claim.lockedBy}`
            );
        }

        return this.update(claimId, {
            isLocked: true,
            lockedBy: userId,
            lockedAt: new Date(),
        });
    }

    async unlockClaim(claimId: string): Promise<Claim> {
        return this.update(claimId, {
            isLocked: false,
            lockedBy: null,
            lockedAt: null,
        });
    }

    async updateClaimStatus(
        claimId: string,
        newStatus: Claim['status'],
        changedBy: string,
        changeReason?: string
    ): Promise<Claim> {
        const claim = await this.findByIdOrThrow(claimId, 'Claim not found');

        // Validate status transition
        this.validateStatusTransition(claim.status, newStatus);

        // Start transaction for atomic update
        const updatedClaim = await db.transaction(async (tx) => {
            // Update claim
            const [updated] = await tx
                .update(this.table)
                .set({
                    status: newStatus,
                    updatedAt: new Date(),
                    // Set specific dates based on status
                    ...(newStatus === 'under_review' && { reviewDate: new Date() }),
                    ...(newStatus === 'approved' && { approvalDate: new Date() }),
                    ...(newStatus === 'paid' && { paymentDate: new Date() }),
                })
                .where(eq(this.table.id, claimId))
                .returning();

            if (!updated) {
                throw new NotFoundError('Claim not found');
            }

            // Add to status history
            await tx.insert(claimStatusHistory).values({
                claimId,
                oldStatus: claim.status,
                newStatus,
                changedBy,
                changeReason,
            });

            return updated;
        });

        return updatedClaim;
    }

    async bulkUpdateStatus(
        claimIds: string[],
        newStatus: Claim['status'],
        changedBy: string,
        changeReason?: string
    ): Promise<Claim[]> {
        // Get all claims first to validate
        const existingClaims = await db
            .select()
            .from(this.table)
            .where(
                and(
                    inArray(this.table.id, claimIds),
                    this.withTenant()
                )
            );

        if (existingClaims.length !== claimIds.length) {
            throw new NotFoundError('Some claims not found or access denied');
        }

        // Validate status transitions for all claims
        for (const claim of existingClaims) {
            this.validateStatusTransition(claim.status, newStatus);
        }

        // Update in transaction
        const updatedClaims = await db.transaction(async (tx) => {
            // Update claims
            const updated = await tx
                .update(this.table)
                .set({
                    status: newStatus,
                    updatedAt: new Date(),
                    ...(newStatus === 'approved' && { approvalDate: new Date() }),
                    ...(newStatus === 'paid' && { paymentDate: new Date() }),
                })
                .where(
                    and(
                        inArray(this.table.id, claimIds),
                        this.withTenant()
                    )
                )
                .returning();

            // Add to status history for each claim
            const historyRecords = existingClaims.map((claim) => ({
                claimId: claim.id,
                oldStatus: claim.status,
                newStatus,
                changedBy,
                changeReason,
            }));

            if (historyRecords.length > 0) {
                await tx.insert(claimStatusHistory).values(historyRecords);
            }

            return updated;
        });

        return updatedClaims;
    }

    async getClaimStats(): Promise<{
        total: number;
        byStatus: Record<Claim['status'], number>;
        totalAmount: number;
        averageAmount: number;
    }> {

        const [total, submitted, under_review, approved, rejected, paid, totalAmount] = await Promise.all([
            await db.select({ count: count() }).from(this.table).where(this.withTenant()),
            await db.select({ count: count() }).from(this.table).where(and(
                this.withTenant(),
                eq(this.table.status, 'submitted')
            )),
            await db.select({ count: count() }).from(this.table).where(and(
                this.withTenant(),
                eq(this.table.status, 'under_review')
            )),
            await db.select({ count: count() }).from(this.table).where(and(
                this.withTenant(),
                eq(this.table.status, 'approved')
            )),
            await db.select({ count: count() }).from(this.table).where(and(
                this.withTenant(),
                eq(this.table.status, 'rejected')
            )),
            await db.select({ count: count() }).from(this.table).where(and(
                this.withTenant(),
                eq(this.table.status, 'paid')
            )),
            await db.select({ total: sql<number>`sum(${this.table.amount})` }).from(this.table).where(this.withTenant()),
        ])

        const _total = Number(total[0]?.count || 0);
        const _totalAmount =  Number(totalAmount[0]?.total || 0);

        return {
            total: _total,
            byStatus: {
                submitted: Number(submitted[0]?.count || 0),
                under_review: Number(under_review[0]?.count || 0),
                approved: Number(approved[0]?.count || 0),
                rejected: Number(rejected[0]?.count || 0),
                paid: Number(paid[0]?.count || 0),
            },
            totalAmount: _totalAmount,
            averageAmount: _total > 0 ? _totalAmount / _total : 0,
        };
    }

    private applyFilters(whereClause: SQL, filters?: ClaimFilters): SQL {
        if (!filters) return whereClause;

        let conditions: SQL[] = [];

        if (filters.status) {
            conditions.push(eq(this.table.status, filters.status));
        }

        if (filters.patientId) {
            conditions.push(eq(this.table.patientId, filters.patientId));
        }

        if (filters.providerId) {
            conditions.push(eq(this.table.providerId, filters.providerId));
        }

        if (filters.dateRange) {
            conditions.push(
                between(
                    this.table.submissionDate,
                    filters.dateRange.fromDate,
                    filters.dateRange.toDate
                )
            );
        }

        if (filters.amountRange) {
            conditions.push(
                and(
                    gte(this.table.amount, filters.amountRange.minAmount),
                    lte(this.table.amount, filters.amountRange.maxAmount)
                )
            );
        }

        if (conditions.length > 0) {
            return and(whereClause, ...conditions) as SQL;
        }

        return whereClause;
    }

    private getOrderBy(filters?: ClaimFilters): any {
        if (!filters?.sortBy) {
            return desc(this.table.submissionDate);
        }

        const order = filters.sortOrder === 'asc' ? asc : desc;

        switch (filters.sortBy) {
            case 'submissionDate':
                return order(this.table.submissionDate);
            case 'amount':
                return order(this.table.amount);
            case 'status':
                return order(this.table.status);
            default:
                return desc(this.table.submissionDate);
        }
    }

    private validateStatusTransition(
        oldStatus: Claim['status'],
        newStatus: Claim['status']
    ): void {
        const validTransitions: Record<Claim['status'], Claim['status'][]> = {
            submitted: ['under_review', 'rejected'],
            under_review: ['approved', 'rejected', 'submitted'],
            approved: ['paid', 'under_review'],
            rejected: ['under_review'],
            paid: [], // No transitions from paid
        };

        if (!validTransitions[oldStatus]?.includes(newStatus)) {
            throw new ConflictError(
                `Invalid status transition from ${oldStatus} to ${newStatus}`
            );
        }
    }
}