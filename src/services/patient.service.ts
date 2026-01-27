import { Patient, PatientStatusChange, patientStatusChanges } from '../models/schema';
import {
    NotFoundError,
    ValidationError,
    ForbiddenError,
    CrossTenantAccessError,
} from '../utils/errors';
import { PatientStatusChangeInput, TenantContext } from '../types';
import { db } from '../config/database';
import { eq, desc } from 'drizzle-orm';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { PatientRepository } from '../repositories';

export class PatientService {
    private patientRepository: PatientRepository;

    constructor(private tenantContext: TenantContext) {
        this.patientRepository = new PatientRepository(tenantContext);
    }

    async createPatient(data: {
        firstName: string;
        lastName: string;
        dateOfBirth: string;
        email?: string;
        phone?: string;
        address?: string;
        insuranceMemberId?: string;
        userId?: string;
    }): Promise<Patient> {
        const { firstName, lastName, dateOfBirth } = data;

        // Validate required fields
        if (!firstName || !lastName || !dateOfBirth) {
            throw new ValidationError('First name, last name, and date of birth are required');
        }

        // Validate date of birth is not in the future
        if (new Date(dateOfBirth) > new Date()) {
            throw new ValidationError('Date of birth cannot be in the future');
        }

        // Check if patient with same member ID already exists
        if (data.insuranceMemberId) {
            const existingPatient = await this.patientRepository.findByInsuranceMemberId(
                data.insuranceMemberId
            );
            if (existingPatient) {
                throw new ValidationError('Patient with this insurance member ID already exists');
            }
        }

       
        // Create patient
        const patient = await this.patientRepository.create({
            firstName,
            lastName,
            dateOfBirth,
            email: data.email,
            phone: data.phone,
            address: data.address,
            insuranceMemberId: data.insuranceMemberId,
            userId: data.userId,
        });

        logger.info('Patient created successfully', {
            patientId: patient.id,
            name: `${firstName} ${lastName}`,
            createdBy: this.tenantContext.userId,
        });

        return patient;
    }

    async getPatient(patientId: string): Promise<Patient> {
        // Check permissions
        await this.checkPatientAccess(patientId);

        const patient = await this.patientRepository.findByIdOrThrow(
            patientId,
            'Patient not found or access denied'
        );

        return patient;
    }

    async updatePatient(
        patientId: string,
        updates: Partial<Patient>
    ): Promise<Patient> {
        // Check permissions - only admins can update patients
        if (this.tenantContext.role !== 'admin') {
            throw new ForbiddenError('Only admins can update patient information');
        }

        await this.patientRepository.findByIdOrThrow(
            patientId,
            'Patient not found or access denied'
        );

        // Validate updates
        if (updates.dateOfBirth && new Date(updates.dateOfBirth) > new Date()) {
            throw new ValidationError('Date of birth cannot be in the future');
        }

        // Update patient
        const updatedPatient = await this.patientRepository.update(patientId, {
            ...updates,
            updatedAt: new Date(),
        });

        logger.info('Patient updated', {
            patientId,
            updates,
            updatedBy: this.tenantContext.userId,
        });

        return updatedPatient;
    }

    async createPatientStatusChange(
        input: PatientStatusChangeInput
    ): Promise<PatientStatusChange> {
        const { patientId, statusType, occurredAt, details } = input;

        // Check permissions - who can create status changes?
        // For now, allow admins, providers, and claims processors
        if (!['admin', 'provider', 'claims_processor'].includes(this.tenantContext.role)) {
            throw new ForbiddenError('Insufficient permissions to create patient status changes');
        }

        // Verify patient exists and belongs to tenant
        await this.patientRepository.findByIdOrThrow(
            patientId,
            'Patient not found or access denied'
        );

        // Validate occurredAt is not in the future
        if (new Date(occurredAt) > new Date()) {
            throw new ValidationError('Status change cannot occur in the future');
        }

        // Create status change record
        const result = await db
            .insert(patientStatusChanges)
            .values({
                id: uuidv4(),
                organizationId: this.tenantContext.organizationId,
                patientId,
                statusType,
                occurredAt: new Date(occurredAt),
                details: details || {},
                jobStatus: 'pending',
            })
            .returning();

        const statusChange = result[0];
        if (!statusChange) {
            throw new Error('Failed to create patient status change');
        }

        // TODO: Trigger appropriate background job based on status type
        // await this.triggerStatusChangeJob(statusChange);

        logger.info('Patient status change created', {
            patientId,
            statusType,
            occurredAt,
            createdBy: this.tenantContext.userId,
        });

        return statusChange;
    }

    async getPatientStatusHistory(patientId: string): Promise<PatientStatusChange[]> {
        // Check permissions
        await this.checkPatientAccess(patientId);

        const history = await db
            .select()
            .from(patientStatusChanges)
            .where(
                eq(patientStatusChanges.patientId, patientId)
            )
            .orderBy(desc(patientStatusChanges.occurredAt));

        return history;
    }

    async searchPatients(
        searchTerm: string,
        options: {
            limit?: number;
            offset?: number;
        } = {}
    ): Promise<Patient[]> {
        // Check permissions - who can search patients?
        if (!['admin', 'provider', 'claims_processor'].includes(this.tenantContext.role)) {
            throw new ForbiddenError('Insufficient permissions to search patients');
        }

        return this.patientRepository.searchPatients(searchTerm, options);
    }

    async getPatientStats(): Promise<any> {
        // Only admins and claims processors can view stats
        if (!['admin', 'claims_processor'].includes(this.tenantContext.role)) {
            throw new ForbiddenError('Insufficient permissions to view patient stats');
        }

        return this.patientRepository.getPatientStats();
    }

    async linkPatientToUser(
        patientId: string,
        userId: string
    ): Promise<Patient> {
        // Only admins can link patients to users
        if (this.tenantContext.role !== 'admin') {
            throw new ForbiddenError('Only admins can link patients to users');
        }

        await this.patientRepository.findByIdOrThrow(
            patientId,
            'Patient not found or access denied'
        );

        // Update patient
        const updatedPatient = await this.patientRepository.update(patientId, {
            userId,
            updatedAt: new Date(),
        });

        logger.info('Patient linked to user', {
            patientId,
            userId,
            linkedBy: this.tenantContext.userId,
        });

        return updatedPatient;
    }

    private async checkPatientAccess(patientId: string): Promise<void> {
        // Always verify patient belongs to tenant
        const patient = await this.patientRepository.findById(patientId);
        if (!patient) {
            throw new NotFoundError('Patient not found or access denied');
        }

        if (patient.organizationId !== this.tenantContext.organizationId) {
            throw new CrossTenantAccessError();
        }

        // Role-specific access checks
        switch (this.tenantContext.role) {
            case 'admin':
                // Admins can access all patients
                break;

            case 'claims_processor':
                // Processors can access all patients in their organization
                break;

            case 'provider':
                // Providers can only access patients they are treating
                // This would require a separate provider-patient relationship table
                // For now, allow access
                break;

            case 'patient':
                // Patients can only access their own record
                const userPatientId = this.tenantContext.user.metadata?.patientId;
                if (patientId !== userPatientId && patient.userId !== this.tenantContext.userId) {
                    throw new ForbiddenError('You can only access your own patient record');
                }
                break;

            default:
                throw new ForbiddenError('Invalid user role');
        }
    }

 
}