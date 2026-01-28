import { Response } from 'express';
import {
    createPatientSchema,
    updatePatientSchema,
    patientStatusChangeSchema,
    validate
} from '../utils/validation';
import { asyncHandler } from '../middleware/error.middleware';
import { AuthenticatedRequest } from '../types';
import { tenantMiddleware, requireRole } from '../middleware/tenant.middleware';
import { injectServices } from '../services/service.middleware';

export class PatientController {
    constructor() { }

    createPatient = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const input = req.body;
        const tenant = req.tenant;

        if (!tenant) {
            throw new Error('Tenant context not found');
        }

        if (!req.services) {
            throw new Error('Services not injected');
        }

        const patient = await req.services.patientService.createPatient(input);

        res.status(201).json({
            success: true,
            data: patient,
        });
    });

    getPatient = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
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



        const patient = await req.services.patientService.getPatient(id);

        res.json({
            success: true,
            data: patient,
        });
    });

    updatePatient = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
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

        const patient = await req.services.patientService.updatePatient(id, updates);

        res.json({
            success: true,
            data: patient,
        });
    });

    createPatientStatusChange = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const input = req.body;
        const tenant = req.tenant;

        if (!tenant) {
            throw new Error('Tenant context not found');
        }

        if (!req.services) {
            throw new Error('Services not injected');
        }


        const statusChange = await req.services.patientService.createPatientStatusChange(input);

        res.status(201).json({
            success: true,
            data: statusChange,
        });
    });

    getPatientStatusHistory = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const { patientId } = req.params;
        const tenant = req.tenant;

        if (!tenant) {
            throw new Error('Tenant context not found');
        }

        if (!patientId) {
            throw new Error('patientId is required');
        }

        if (!req.services) {
            throw new Error('Services not injected');
        }


        const history = await req.services.patientService.getPatientStatusHistory(patientId);

        res.json({
            success: true,
            data: history,
        });
    });

    searchPatients = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const { search, limit, offset } = req.query;
        const tenant = req.tenant;

        if (!tenant) {
            throw new Error('Tenant context not found');
        }

        if (!req.services) {
            throw new Error('Services not injected');
        }


        const patients = await req.services.patientService.searchPatients(
            search as string,
            {
                limit: limit ? parseInt(limit as string) : undefined,
                offset: offset ? parseInt(offset as string) : undefined,
            }
        );

        res.json({
            success: true,
            data: patients,
        });
    });

    getPatientStats = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const tenant = req.tenant;

        if (!tenant) {
            throw new Error('Tenant context not found');
        }

        if (!req.services) {
            throw new Error('Services not injected');
        }


        const stats = await req.services.patientService.getPatientStats();

        res.json({
            success: true,
            data: stats,
        });
    });

    linkPatientToUser = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
        const { id } = req.params;
        const { userId } = req.body;
        const tenant = req.tenant;

        if (!tenant) {
            throw new Error('Tenant context not found');
        }

        if (!id) {
            throw new Error('patientId is required');
        }

        if (!req.services) {
            throw new Error('Services not injected');
        }


        const patient = await req.services.patientService.linkPatientToUser(id, userId);

        res.json({
            success: true,
            data: patient,
            message: 'Patient linked to user successfully',
        });
    });
}

export const patientController = new PatientController();

export const patientRoutes = {
    createPatient: [
        tenantMiddleware,
        injectServices(),
        requireRole(['admin', 'claims_processor']),
        validate(createPatientSchema),
        patientController.createPatient
    ],

    getPatient: [
        tenantMiddleware,
        injectServices(),
        patientController.getPatient
    ],

    updatePatient: [
        tenantMiddleware,
        injectServices(),
        requireRole(['admin']),
        validate(updatePatientSchema),
        patientController.updatePatient
    ],

    createPatientStatusChange: [
        tenantMiddleware,
        injectServices(),
        requireRole(['admin', 'provider', 'claims_processor']),
        validate(patientStatusChangeSchema),
        patientController.createPatientStatusChange
    ],

    getPatientStatusHistory: [
        tenantMiddleware,
        injectServices(),
        patientController.getPatientStatusHistory
    ],

    searchPatients: [
        tenantMiddleware,
        injectServices(),
        requireRole(['admin', 'provider', 'claims_processor']),
        patientController.searchPatients
    ],

    getPatientStats: [
        tenantMiddleware,
        injectServices(),
        requireRole(['admin', 'claims_processor']),
        patientController.getPatientStats
    ],

    linkPatientToUser: [
        tenantMiddleware,
        injectServices(),
        requireRole(['admin']),
        patientController.linkPatientToUser
    ]
};