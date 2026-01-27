import { Request } from 'express';
import { User, Organization, Claim } from '../models/schema';

export interface AuthenticatedUser extends User {
    // Additional properties if needed
}

export interface TenantContext {
    organizationId: string;
    organization: Organization;
    userId: string;
    user: AuthenticatedUser;
    role: User['role'];
}

export interface AuthenticatedRequest extends Request {
    tenant?: TenantContext;
    user?: AuthenticatedUser;
}

export type Role = 'admin' | 'claims_processor' | 'provider' | 'patient';

export interface ClaimFilters {
    dateRange?: {
        fromDate: Date;
        toDate: Date;
    };
    status?: Claim['status'];
    patientId?: string;
    providerId?: string;
    amountRange?: {
        minAmount: string;
        maxAmount: string;
    };
    search?: string;
    sortBy?: 'submissionDate' | 'amount' | 'status' | 'patientName' | 'providerName';
    sortOrder?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
    cursor?: string;
}

export interface PaginatedResult<T> {
    data: T[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
        hasNext: boolean;
        hasPrevious: boolean;
        nextCursor?: string;
    };
}

export interface PatientStatusChangeInput {
    patientId: string;
    statusType: 'admission' | 'discharge' | 'treatment';
    occurredAt: Date;
    details?: Record<string, any>;
}

export interface ClaimUpdateInput {
    status?: Claim['status'];
    assignedProcessorId?: string;
    notes?: string;
    diagnosisCode?: string;
    amount?: string;
}