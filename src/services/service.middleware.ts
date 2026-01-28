import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { PatientService } from './patient.service';
import { ClaimService } from './claim.service';

export function injectServices() {
    return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
        if (!req.tenant) {
            return next(new Error('Tenant context not found'));
        }

        // Inject tenant-specific services into request object
        req.services = {
            patientService: new PatientService(req.tenant),
            claimService: new ClaimService(req.tenant)
        };

        next();
    };
}

declare global {
    namespace Express {
        interface Request {
            services?: {
                patientService: PatientService;
                claimService: ClaimService
            };
        }
    }
}