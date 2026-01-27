import { Response, NextFunction } from 'express';
import { UnauthorizedError, TenantNotFoundError } from '../utils/errors';
import { db } from '../config/database';
import { organizations } from '../models/schema';
import { eq } from 'drizzle-orm';
import { AuthenticatedRequest, TenantContext } from '../types';
import rateLimit from 'express-rate-limit';

export async function tenantMiddleware(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const user = req.user;
        if (!user) {
            throw new UnauthorizedError('User not authenticated');
        }

        const [organization] = await db
            .select()
            .from(organizations)
            .where(eq(organizations.id, user.organizationId))
            .limit(1);

        if (!organization) {
            throw new TenantNotFoundError('Organization not found');
        }

        if (!organization.isActive) {
            throw new UnauthorizedError('Organization is inactive');
        }

        const tenantContext: TenantContext = {
            organizationId: organization.id,
            organization,
            userId: user.id,
            user,
            role: user.role,
        };

        req.tenant = tenantContext;

        res.setHeader('X-Organization-ID', organization.id);
        res.setHeader('X-Organization-Name', organization.name);

        next();
    } catch (error) {
        next(error);
    }
}

export function requireRole(allowedRoles: string[]) {
    return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
        if (!req.tenant) {
            throw new UnauthorizedError('Tenant context not found');
        }

        if (!allowedRoles.includes(req.tenant.role)) {
            throw new UnauthorizedError(
                `Required role: ${allowedRoles.join(' or ')}, but user has role: ${req.tenant.role}`
            );
        }

        next();
    };
}

export function requireResourceAccess(
    _resourceOwnerField: string = 'organizationId',
    _resourceType: string = 'resource'
) {
    return async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
        if (!req.tenant) {
            throw new UnauthorizedError('Tenant context not found');
        }

        // This is a generic middleware that can be used with specific checks
        // For example, in route handlers, we can check if the user has access to specific claims

        // For now, specific access checks will be implemented in services
        next();
    };
}

// Rate limiting per tenant
export const tenantRateLimiter = (options: {
    windowMs?: number;
    max?: number;
    message?: string;
} = {}) => {
    return rateLimit({
        windowMs: options.windowMs || 15 * 60 * 1000, // 15 minutes
        max: options.max || 100, // limit each tenant to 100 requests per windowMs
        message: options.message || 'Too many requests from this tenant, please try again later.',
        keyGenerator: (req: AuthenticatedRequest, _res) => {
            return req.tenant?.organizationId || req.ip;
        },
        standardHeaders: true,
        legacyHeaders: false,
        skipFailedRequests: false,
        skipSuccessfulRequests: false,
    });
};