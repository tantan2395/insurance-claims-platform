import { RequestHandler, Router } from 'express';
import { tenantRateLimiter } from '../middleware/tenant.middleware';
import { requireAuth } from '../middleware/auth.middleware';

import { authRoutes } from '../controller/auth.controller';
import { organizationRoutes } from '../controller/organization.controller';

const router = Router();

router.use(tenantRateLimiter());

// Public organization routes (super admin only)
router.post('/organizations', organizationRoutes.createOrganization);
router.get('/organizations', organizationRoutes.listOrganizations);
router.get('/organizations/:id', organizationRoutes.getOrganization);
router.patch('/organizations/:id', organizationRoutes.updateOrganization);
router.post('/organizations/:id/deactivate', organizationRoutes.deactivateOrganization);
router.post('/organizations/:id/activate', organizationRoutes.activateOrganization);
router.get('/organizations/:id/stats', organizationRoutes.getOrganizationStats);

// Auth routes (no tenant middleware needed for login/register)
router.post('/auth/login', authRoutes.login);
router.post('/auth/register', authRoutes.register);
router.post('/auth/reset-password', authRoutes.resetPasswordRequest);
router.post('/auth/reset-password/confirm', authRoutes.resetPasswordConfirm);

router.use(requireAuth as RequestHandler);

// Auth protected routes
router.get('/organizations/:organizationId/validate-access', organizationRoutes.validateAccess);

router.post('/auth/change-password', authRoutes.changePassword);
router.get('/auth/profile', authRoutes.getProfile);
router.post('/auth/logout', authRoutes.logout);

export default router;