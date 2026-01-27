import { BaseRepository } from './base.repository';
import { patients, Patient, users } from '../models/schema';
import { db } from '../config/database';
import { eq, and, or, ilike, count, isNotNull, sql } from 'drizzle-orm';
import { TenantContext } from '../types';

export class PatientRepository extends BaseRepository<typeof patients> {
    protected table = patients;

    protected get tenantIdField(): keyof typeof patients['_']['columns'] {
        return 'organizationId';
    }

    constructor(tenantContext: TenantContext) {
        super(tenantContext);
    }

    async findWithUserDetails(patientId: string): Promise<Patient & { user?: any } | null> {
        const [result] = await db
            .select({
                patient: patients,
                user: users,
            })
            .from(patients)
            .leftJoin(users, eq(patients.userId, users.id))
            .where(this.ensureTenantAccess(patientId))
            .limit(1);

        if (!result?.patient) {
            return null;
        }

        return {
            ...result.patient,
            user: result.user,
        };
    }

    async findByInsuranceMemberId(memberId: string): Promise<Patient | null> {
        const [patient] = await db
            .select()
            .from(this.table)
            .where(
                and(
                    eq(this.table.insuranceMemberId, memberId),
                    this.withTenant()
                )
            )
            .limit(1);

        return patient || null;
    }

    async searchPatients(
        searchTerm: string,
        options: {
            limit?: number;
            offset?: number;
        } = {}
    ): Promise<Patient[]> {
        const searchCondition = or(
            ilike(this.table.firstName, `%${searchTerm}%`),
            ilike(this.table.lastName, `%${searchTerm}%`),
            ilike(this.table.email, `%${searchTerm}%`),
            ilike(this.table.insuranceMemberId, `%${searchTerm}%`)
        );

        return db
            .select()
            .from(this.table)
            .where(
                and(
                    this.withTenant(),
                    searchCondition
                )
            )
            .limit(options.limit || 10)
            .offset(options.offset || 0);
    }

    async findPatientsByDateOfBirthRange(
        startDate: Date,
        endDate: Date,
        options: {
            limit?: number;
            offset?: number;
        } = {}
    ): Promise<Patient[]> {

        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];

        return db
            .select()
            .from(this.table)
            .where(
                and(
                    this.withTenant(),
                    sql`${this.table.dateOfBirth} >= ${startDateStr}`,
                    sql`${this.table.dateOfBirth} <= ${endDateStr}`
                )
            )
            .limit(options.limit || 10)
            .offset(options.offset || 0);
    }

    async getPatientStats(): Promise<{
        total: number;
        active: number;
        withUserAccount: number;
    }> {

        const [active] = await db
            .select({ count: count() })
            .from(this.table)
            .where(and(
                this.withTenant(),
                eq(this.table.isActive, true)
            ));


        const [withUserAccount] = await db
            .select({ count: count() })
            .from(this.table)
            .where(and(
                this.withTenant(),
                isNotNull(this.table.userId)
            ))

        const [total] = await db
            .select({
                count: count(),
            })
            .from(this.table)
            .where(this.withTenant());

        return {
            total: Number(total?.count ?? 0),
            active: Number(active?.count ?? 0),
            withUserAccount: Number(withUserAccount?.count ?? 0),
        };
    }
}