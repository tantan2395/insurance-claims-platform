import { RequestHandler, Router } from 'express';
import { tenantRateLimiter } from '../middleware/tenant.middleware';
import { requireAuth } from '../middleware/auth.middleware';

import { authRoutes } from '../controllers/auth.controller';
import { organizationRoutes } from '../controllers/organization.controller';
import { patientRoutes } from '../controllers/patient.controller';
import { claimRoutes } from '../controllers/claim.controller';

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

router.post('/patients', patientRoutes.createPatient);
router.get('/patients/search', patientRoutes.searchPatients);
router.get('/patients/stats', patientRoutes.getPatientStats);
router.get('/patients/:id', patientRoutes.getPatient);
router.patch('/patients/:id', patientRoutes.updatePatient);
router.post('/patients/:id/link-user', patientRoutes.linkPatientToUser);

router.post('/patient-status', patientRoutes.createPatientStatusChange);
router.get('/patient-status/history/:patientId', patientRoutes.getPatientStatusHistory);

router.post('/claims', claimRoutes.createClaim);
router.get('/claims', claimRoutes.getClaims);
router.get('/claims/stats', claimRoutes.getClaimStats);
router.get('/claims/:id', claimRoutes.getClaim);
router.patch('/claims/:id/status', claimRoutes.updateClaimStatus);
router.post('/claims/bulk-status-update', claimRoutes.bulkUpdateStatus);
router.patch('/claims/:id', claimRoutes.updateClaim);
router.post('/claims/:id/assign', claimRoutes.assignClaim);
router.get('/claims/:id/history', claimRoutes.getClaimStatusHistory);

export default router;