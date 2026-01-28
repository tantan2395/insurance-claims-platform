import { Response } from 'express';
import {
    createClaimSchema,
    updateClaimStatusSchema,
    bulkUpdateStatusSchema,
    updateClaimSchema,
    claimFiltersSchema,
    assignClaimSchema,
    validate
} from '../utils/validation';
import { asyncHandler } from '../middleware/error.middleware';
import { AuthenticatedRequest, ClaimFilters } from '../types';
import { tenantMiddleware, requireRole } from '../middleware/tenant.middleware';
import { injectServices } from '../services/service.middleware';

export class ClaimController {
    constructor() { }

    createClaim = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const input = req.body;
        const tenant = req.tenant;

        if (!tenant) {
            throw new Error('Tenant context not found');
        }

        if (!req.services) {
            throw new Error('Services not injected');
        }

        const claim = await req.services.claimService.createClaim(input);

        res.status(201).json({
            success: true,
            data: claim,
        });
    });

    getClaims = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const filters: ClaimFilters = req.query;
        const tenant = req.tenant;

        if (!tenant) {
            throw new Error('Tenant context not found');
        }

        if (!req.services) {
            throw new Error('Services not injected');
        }

        const result = await req.services.claimService.listClaims(filters);

        res.json({
            success: true,
            data: result.data,
            pagination: result.pagination,
        });
    });

    getClaim = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const { id } = req.params;
        const tenant = req.tenant;

        if (!tenant) {
            throw new Error('Tenant context not found');
        }

        if (!id) {
            throw new Error('id is required');
        }

        if (!req.services) {
            throw new Error('Services not injected');
        }

        const claim = await req.services.claimService.getClaim(id);

        res.json({
            success: true,
            data: claim,
        });
    });

    updateClaimStatus = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const { id } = req.params;
        const { status, changeReason } = req.body;
        const tenant = req.tenant;

        if (!tenant) {
            throw new Error('Tenant context not found');
        }

        if (!id) {
            throw new Error('id is required');
        }

        if (!req.services) {
            throw new Error('Services not injected');
        }

        const claim = await req.services.claimService.updateClaimStatus(id, status, changeReason);

        res.json({
            success: true,
            data: claim,
        });
    });

    bulkUpdateStatus = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const { claimIds, status, changeReason } = req.body;
        const tenant = req.tenant;

        if (!tenant) {
            throw new Error('Tenant context not found');
        }

        if (!req.services) {
            throw new Error('Services not injected');
        }

        const claims = await req.services.claimService.bulkUpdateStatus(claimIds, status, changeReason);

        res.json({
            success: true,
            data: claims,
            message: `${claims.length} claims updated successfully`,
        });
    });

    updateClaim = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const { id } = req.params;
        const updates = req.body;
        const tenant = req.tenant;

        if (!tenant) {
            throw new Error('Tenant context not found');
        }

        if (!id) {
            throw new Error('id is required');
        }

        if (!req.services) {
            throw new Error('Services not injected');
        }

        const claim = await req.services.claimService.updateClaim(id, updates);

        res.json({
            success: true,
            data: claim,
        });
    });

    assignClaim = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const { id } = req.params;
        const { processorId } = req.body;
        const tenant = req.tenant;

        if (!tenant) {
            throw new Error('Tenant context not found');
        }

        if (!id) {
            throw new Error('id is required');
        }

        if (!req.services) {
            throw new Error('Services not injected');
        }

        const claim = await req.services.claimService.assignClaim(id, processorId);

        res.json({
            success: true,
            data: claim,
        });
    });

    getClaimStatusHistory = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const { id } = req.params;
        const tenant = req.tenant;

        if (!tenant) {
            throw new Error('Tenant context not found');
        }

        if (!id) {
            throw new Error('id is required');
        }

        if (!req.services) {
            throw new Error('Services not injected');
        }

        const history = await req.services.claimService.getClaimStatusHistory(id);

        res.json({
            success: true,
            data: history,
        });
    });

    getClaimStats = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const tenant = req.tenant;

        if (!tenant) {
            throw new Error('Tenant context not found');
        }

        if (!req.services) {
            throw new Error('Services not injected');
        }

        const stats = await req.services.claimService.getClaimStats();

        res.json({
            success: true,
            data: stats,
        });
    });
}

export const claimController = new ClaimController();

export const claimRoutes = {
    createClaim: [
        tenantMiddleware,
        injectServices(),
        requireRole(['admin', 'claims_processor', 'provider']),
        validate(createClaimSchema),
        claimController.createClaim
    ],

    getClaims: [
        tenantMiddleware,
        injectServices(),
        validate(claimFiltersSchema),
        claimController.getClaims
    ],

    getClaim: [
        tenantMiddleware,
        injectServices(),
        claimController.getClaim
    ],

    updateClaimStatus: [
        tenantMiddleware,
        injectServices(),
        requireRole(['admin', 'claims_processor']),
        validate(updateClaimStatusSchema),
        claimController.updateClaimStatus
    ],

    bulkUpdateStatus: [
        tenantMiddleware,
        injectServices(),
        requireRole(['admin', 'claims_processor']),
        validate(bulkUpdateStatusSchema),
        claimController.bulkUpdateStatus
    ],

    updateClaim: [
        tenantMiddleware,
        injectServices(),
        requireRole(['admin', 'claims_processor']),
        validate(updateClaimSchema),
        claimController.updateClaim
    ],

    assignClaim: [
        tenantMiddleware,
        injectServices(),
        requireRole(['admin']),
        validate(assignClaimSchema),
        claimController.assignClaim
    ],

    getClaimStatusHistory: [
        tenantMiddleware,
        injectServices(),
        claimController.getClaimStatusHistory
    ],

    getClaimStats: [
        tenantMiddleware,
        injectServices(),
        requireRole(['admin', 'claims_processor']),
        claimController.getClaimStats
    ],
};