import { db } from '../config/database';
import { eq, and, SQL, sql } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { NotFoundError } from '../utils/errors';
import { TenantContext } from '../types';

export abstract class BaseRepository<T extends PgTable> {
    protected abstract table: T;
    protected abstract tenantIdField: keyof T['_']['columns'];

    constructor(protected readonly tenantContext: TenantContext) { }

    // Helper to ensure tenant context is always used
    protected withTenant<C extends SQL>(condition?: C): SQL {
        const tenantCondition = eq(
            this.table[this.tenantIdField as string],
            this.tenantContext.organizationId
        );

        if (condition) {
            return and(tenantCondition, condition) as SQL;
        }

        return tenantCondition;
    }

    // Ensure no cross-tenant access
    protected ensureTenantAccess(id: string): SQL {
        return and(
            eq((this.table as any).id, id),
            this.withTenant()
        ) as SQL;
    }

    // Create a new record
    async create(data: Omit<Partial<T['$inferInsert']>, 'id' | 'organizationId'>): Promise<T['$inferSelect']> {
        const recordWithTenant = {
            ...data,
            [this.tenantIdField]: this.tenantContext.organizationId,
        };

        const [record] = await db
            .insert(this.table)
            .values(recordWithTenant as any)
            .returning();

        if (!record) {
            throw new Error('Failed to create record');
        }

        return record;
    }

    // Find by ID with tenant check
    async findById(id: string): Promise<T['$inferSelect'] | null> {
        const [record] = await db
            .select()
            .from(this.table)
            .where(this.ensureTenantAccess(id))
            .limit(1);

        return record || null;
    }

    // Find by ID or throw
    async findByIdOrThrow(id: string, message: string = 'Record not found'): Promise<T['$inferSelect']> {
        const record = await this.findById(id);
        if (!record) {
            throw new NotFoundError(message);
        }
        return record;
    }

    // Find all with tenant filtering
    async findAll(condition?: SQL): Promise<T['$inferSelect'][]> {
        return db
            .select()
            .from(this.table)
            .where(this.withTenant(condition));
    }

    // Update with tenant check
    async update(
        id: string,
        data: Partial<T['$inferInsert']>
    ): Promise<T['$inferSelect']> {
        const [record] = await db
            .update(this.table)
            .set({
                ...data,
                updatedAt: new Date(),
            } as any)
            .where(this.ensureTenantAccess(id))
            .returning();

        if (!record) {
            throw new NotFoundError('Record not found or access denied');
        }

        return record;
    }

    // Soft delete (if table has isActive field)
    async softDelete(id: string): Promise<T['$inferSelect']> {
        if (!('isActive' in (this.table as any))) {
            throw new Error('Table does not support soft delete');
        }

        const [record] = await db
            .update(this.table)
            .set({
                isActive: false,
                updatedAt: new Date(),
            } as any)
            .where(this.ensureTenantAccess(id))
            .returning();

        if (!record) {
            throw new NotFoundError('Record not found or access denied');
        }

        return record;
    }

    // Hard delete with tenant check
    async delete(id: string): Promise<T['$inferSelect']> {
        const [record] = await db
            .delete(this.table)
            .where(this.ensureTenantAccess(id))
            .returning();

        if (!record) {
            throw new NotFoundError('Record not found or access denied');
        }

        return record;
    }

    // Count with tenant filtering
    async count(condition?: SQL): Promise<number> {
        const result = await db
            .select({ count: sql<number>`count(*)` })
            .from(this.table)
            .where(this.withTenant(condition));

        return Number(result[0]?.count || 0);
    }

    // Pagination helper
    async paginate(
        condition?: SQL,
        options: {
            limit?: number;
            offset?: number;
            orderBy?: any;
        } = {}
    ): Promise<{
        data: T['$inferSelect'][];
        total: number;
        limit: number;
        offset: number;
    }> {
        const limit = options.limit || 10;
        const offset = options.offset || 0;

        const data = await db
            .select()
            .from(this.table)
            .where(this.withTenant(condition))
            .orderBy(options.orderBy)
            .limit(limit)
            .offset(offset);

        const total = await this.count(condition);

        return {
            data,
            total,
            limit,
            offset,
        };
    }

    // Check if record exists with tenant check
    async exists(id: string): Promise<boolean> {
        const record = await this.findById(id);
        return !!record;
    }

    // Check if record exists with custom condition and tenant check
    async existsWhere(condition: SQL): Promise<boolean> {
        const [record] = await db
            .select()
            .from(this.table)
            .where(this.withTenant(condition))
            .limit(1);

        return !!record;
    }
}