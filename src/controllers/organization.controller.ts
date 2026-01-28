import { NextFunction, Request, Response } from 'express';
import { OrganizationService } from '../services/organization.service';
import { asyncHandler } from '../middleware/error.middleware';
import { AuthenticatedRequest } from '../types';
import { z } from 'zod';
import { validate } from '../utils/validation';

// Validation schemas for organization
export const createOrganizationSchema = z.object({
    name: z.string().min(2).max(255),
    slug: z.string().min(3).max(100).regex(/^[a-z0-9-]+$/, {
        message: 'Slug can only contain lowercase letters, numbers, and hyphens',
    }),
    adminEmail: z.string().email(),
    adminPassword: z.string()
        .min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number')
        .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
    adminFirstName: z.string().min(1).max(100),
    adminLastName: z.string().min(1).max(100),
    metadata: z.record(z.any()).optional(),
});

export const updateOrganizationSchema = z.object({
    name: z.string().min(2).max(255).optional(),
    slug: z.string().min(3).max(100).regex(/^[a-z0-9-]+$/).optional(),
    isActive: z.boolean().optional(),
    metadata: z.record(z.any()).optional(),
}).refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
});

export const listOrganizationsSchema = z.object({
    isActive: z.enum(['true', 'false']).transform(val => val === 'true').optional(),
    limit: z.string().transform(Number).pipe(z.number().min(1).max(100)).optional().default('20'),
    offset: z.string().transform(Number).pipe(z.number().min(0)).optional().default('0'),
});

export class OrganizationController {
    constructor(private organizationService: OrganizationService) { }

    createOrganization = asyncHandler(async (req: Request, res: Response) => {
        const input = req.body;

        const result = await this.organizationService.createOrganization(input);

        res.status(201).json({
            success: true,
            data: result,
            message: 'Organization created successfully',
        });
    });

    updateOrganization = asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const updates = req.body;

        if (id) {
            const organization = await this.organizationService.updateOrganization(id, updates);
            res.json({
                success: true,
                data: organization,
                message: 'Organization updated successfully',
            });
        }
    });

    deactivateOrganization = asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;

        if (id) {
            const organization = await this.organizationService.deactivateOrganization(id);
            res.json({
                success: true,
                data: organization,
                message: 'Organization deactivated successfully',
            });
        }

    });

    activateOrganization = asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;

        if (id) {
            const organization = await this.organizationService.activateOrganization(id);
            res.json({
                success: true,
                data: organization,
                message: 'Organization activated successfully',
            });
        }
    });

    getOrganization = asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;

        if (id) {
            const organization = await this.organizationService.findById(id);

            if (!organization) {
                res.status(404).json({
                    success: false,
                    error: 'Organization not found',
                });
            }

            res.json({
                success: true,
                data: organization,
            });
        }
    });

    listOrganizations = asyncHandler(async (req: Request, res: Response) => {
        const { isActive, limit, offset } = req.query;

        let isActiveBool: boolean | undefined;
        if (isActive === 'true') {
            isActiveBool = true;
        } else if (isActive === 'false') {
            isActiveBool = false;
        }


        const result = await this.organizationService.listOrganizations({
            isActive: isActiveBool,
            limit: limit ? parseInt(limit as string) : undefined,
            offset: offset ? parseInt(offset as string) : undefined,
        });

        res.json({
            success: true,
            data: result.organizations,
            pagination: {
                total: result.total,
                limit: limit ? parseInt(limit as string) : 20,
                offset: offset ? parseInt(offset as string) : 0,
            },
        });
    });

    getOrganizationStats = asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;

        if (id) {
            const stats = await this.organizationService.getOrganizationStats(id);

            res.json({
                success: true,
                data: stats,
            });
        }
    });

    // This endpoint is for super admins to check organization access
    validateAccess = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const { organizationId } = req.params;
        const userId = req.user?.id;

        if (!userId) {
            res.status(401).json({
                success: false,
                error: 'User not authenticated',
            });
        } else {
            if (organizationId) {
                const hasAccess = await this.organizationService.validateOrganizationAccess(
                    organizationId,
                    userId
                );

                res.json({
                    success: true,
                    data: { hasAccess },
                });
            }
        }
    });
}

// Special middleware for super admin (outside tenant context)
function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
    // a quick simple check or environment variable for super admin role
    const superAdminToken = req.headers['x-super-admin-token'];

    if (superAdminToken !== process.env.SUPER_ADMIN_TOKEN || !process.env.SUPER_ADMIN_TOKEN) {
        res.status(403).json({
            success: false,
            error: 'Super admin access required',
        });
    }

    next();
}

export const organizationController = new OrganizationController(new OrganizationService());

export const organizationRoutes = {
    createOrganization: [
        requireSuperAdmin,
        validate(createOrganizationSchema),
        organizationController.createOrganization
    ],

    updateOrganization: [
        requireSuperAdmin,
        validate(updateOrganizationSchema),
        organizationController.updateOrganization
    ],

    deactivateOrganization: [
        requireSuperAdmin,
        organizationController.deactivateOrganization
    ],

    activateOrganization: [
        requireSuperAdmin,
        organizationController.activateOrganization
    ],

    getOrganization: [
        requireSuperAdmin,
        organizationController.getOrganization
    ],

    listOrganizations: [
        requireSuperAdmin,
        validate(listOrganizationsSchema),
        organizationController.listOrganizations
    ],

    getOrganizationStats: [
        requireSuperAdmin,
        organizationController.getOrganizationStats
    ],

    validateAccess: [
        organizationController.validateAccess
    ],
};