import { pgTable, text, timestamp, uuid, varchar, integer, boolean, jsonb, decimal, index, uniqueIndex, date } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const organizations = pgTable('organizations', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const users = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    role: varchar('role', { length: 50 })
        .notNull()
        .$type<'admin' | 'claims_processor' | 'provider' | 'patient'>(),
    isActive: boolean('is_active').default(true).notNull(),
    metadata: jsonb('metadata').default({}),
    lastLoginAt: timestamp('last_login_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
    return {
        orgEmailIdx: uniqueIndex('org_email_idx').on(table.organizationId, table.email),
        orgRoleIdx: index('org_role_idx').on(table.organizationId, table.role),
    };
});

export const patients = pgTable('patients', {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    dateOfBirth: varchar('date_of_birth').notNull(),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 20 }),
    address: text('address'),
    insuranceMemberId: varchar('insurance_member_id', { length: 100 }),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
    return {
        orgPatientIdx: index('org_patient_idx').on(table.organizationId),
        memberIdIdx: index('member_id_idx').on(table.insuranceMemberId),
    };
});

export const providers = pgTable('providers', {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    name: varchar('name', { length: 255 }).notNull(),
    type: varchar('type', { length: 50 }).notNull().$type<'hospital' | 'clinic' | 'individual'>(),
    licenseNumber: varchar('license_number', { length: 100 }),
    taxId: varchar('tax_id', { length: 100 }),
    address: text('address'),
    phone: varchar('phone', { length: 20 }),
    email: varchar('email', { length: 255 }),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
    return {
        orgProviderIdx: index('org_provider_idx').on(table.organizationId),
    };
});

export const claims = pgTable('claims', {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
    claimNumber: varchar('claim_number', { length: 100 }).notNull().unique(),
    patientId: uuid('patient_id').references(() => patients.id, { onDelete: 'restrict' }).notNull(),
    providerId: uuid('provider_id').references(() => providers.id, { onDelete: 'restrict' }).notNull(),
    assignedProcessorId: uuid('assigned_processor_id').references(() => users.id, { onDelete: 'set null' }),
    diagnosisCode: varchar('diagnosis_code', { length: 50 }).notNull(),
    diagnosisDescription: text('diagnosis_description'),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    status: varchar('status', { length: 50 })
        .notNull()
        .$type<'submitted' | 'under_review' | 'approved' | 'rejected' | 'paid'>()
        .default('submitted'),
    submissionDate: timestamp('submission_date').defaultNow().notNull(),
    reviewDate: timestamp('review_date'),
    approvalDate: timestamp('approval_date'),
    paymentDate: timestamp('payment_date'),
    notes: text('notes'),
    metadata: jsonb('metadata').default({}),
    isLocked: boolean('is_locked').default(false).notNull(),
    lockedBy: uuid('locked_by').references(() => users.id),
    lockedAt: timestamp('locked_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
    return {
        orgClaimIdx: index('org_claim_idx').on(table.organizationId),
        patientIdx: index('claim_patient_idx').on(table.patientId),
        providerIdx: index('claim_provider_idx').on(table.providerId),
        statusIdx: index('claim_status_idx').on(table.status),
        claimNumberIdx: uniqueIndex('claim_number_idx').on(table.claimNumber),
        dateRangeIdx: index('date_range_idx').on(table.submissionDate),
        processorIdx: index('processor_idx').on(table.assignedProcessorId),
        compositeIdx: index('org_status_date_idx').on(table.organizationId, table.status, table.submissionDate),
    };
});

export const claimAssignments = pgTable('claim_assignments', {
    id: uuid('id').primaryKey().defaultRandom(),
    claimId: uuid('claim_id').references(() => claims.id, { onDelete: 'cascade' }).notNull(),
    processorId: uuid('processor_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    assignedAt: timestamp('assigned_at').defaultNow().notNull(),
    assignedBy: uuid('assigned_by').references(() => users.id),
    isActive: boolean('is_active').default(true).notNull(),
}, (table) => {
    return {
        claimProcessorIdx: uniqueIndex('claim_processor_idx').on(table.claimId, table.processorId),
        processorIdx: index('assignment_processor_idx').on(table.processorId),
    };
});

export const patientStatusChanges = pgTable('patient_status_changes', {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
    patientId: uuid('patient_id').references(() => patients.id, { onDelete: 'cascade' }).notNull(),
    statusType: varchar('status_type', { length: 50 })
        .notNull()
        .$type<'admission' | 'discharge' | 'treatment'>(),
    occurredAt: timestamp('occurred_at').notNull(),
    details: jsonb('details').default({}),
    triggeredJobId: varchar('triggered_job_id', { length: 255 }),
    jobStatus: varchar('job_status', { length: 50 })
        .$type<'pending' | 'processing' | 'completed' | 'failed'>()
        .default('pending'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
    return {
        orgPatientIdx: index('status_org_patient_idx').on(table.organizationId, table.patientId),
        occurredAtIdx: index('status_occurred_at_idx').on(table.occurredAt),
        jobStatusIdx: index('status_job_status_idx').on(table.jobStatus),
    };
});

export const claimStatusHistory = pgTable('claim_status_history', {
    id: uuid('id').primaryKey().defaultRandom(),
    claimId: uuid('claim_id').references(() => claims.id, { onDelete: 'cascade' }).notNull(),
    oldStatus: varchar('old_status', { length: 50 }),
    newStatus: varchar('new_status', { length: 50 }).notNull(),
    changedBy: uuid('changed_by').references(() => users.id).notNull(),
    changeReason: text('change_reason'),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
    return {
        claimIdx: index('history_claim_idx').on(table.claimId),
        changedAtIdx: index('history_changed_at_idx').on(table.createdAt),
    };
});

export const diagnosisCodes = pgTable('diagnosis_codes', {
    id: uuid('id').primaryKey().defaultRandom(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    description: text('description').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => {
    return {
        codeIdx: index('diagnosis_code_idx').on(table.code),
    };
});

export const jobQueues = pgTable('job_queues', {
    id: uuid('id').primaryKey().defaultRandom(),
    queueName: varchar('queue_name', { length: 100 }).notNull(),
    jobId: varchar('job_id', { length: 255 }).notNull(),
    organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
    status: varchar('status', { length: 50 })
        .notNull()
        .$type<'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'>(),
    payload: jsonb('payload').default({}),
    result: jsonb('result'),
    error: text('error'),
    attempts: integer('attempts').default(0),
    maxAttempts: integer('max_attempts').default(3),
    runAfter: timestamp('run_after').defaultNow(),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    failedAt: timestamp('failed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
    return {
        queueJobIdx: index('queue_job_idx').on(table.queueName, table.jobId),
        orgStatusIdx: index('queue_org_status_idx').on(table.organizationId, table.status),
        runAfterIdx: index('queue_run_after_idx').on(table.runAfter),
    };
});

export const organizationsRelations = relations(organizations, ({ many }) => ({
    users: many(users),
    patients: many(patients),
    providers: many(providers),
    claims: many(claims),
    patientStatusChanges: many(patientStatusChanges),
    jobQueues: many(jobQueues),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
    organization: one(organizations, {
        fields: [users.organizationId],
        references: [organizations.id],
    }),
    assignedClaims: many(claims, { relationName: 'assignedProcessor' }),
    claimAssignments: many(claimAssignments),
    statusChanges: many(claimStatusHistory),
}));

export const patientsRelations = relations(patients, ({ one, many }) => ({
    organization: one(organizations, {
        fields: [patients.organizationId],
        references: [organizations.id],
    }),
    user: one(users, {
        fields: [patients.userId],
        references: [users.id],
    }),
    claims: many(claims),
    statusChanges: many(patientStatusChanges),
}));

export const claimsRelations = relations(claims, ({ one, many }) => {
    return {
        organization: one(organizations, {
            fields: [claims.organizationId],
            references: [organizations.id],
        }),
        patient: one(patients, {
            fields: [claims.patientId],
            references: [patients.id],
        }),
        provider: one(providers, {
            fields: [claims.providerId],
            references: [providers.id],
        }),
        assignedProcessor: one(users, {
            fields: [claims.assignedProcessorId],
            references: [users.id],
            relationName: 'assignedProcessor',
        }),
        assignments: many(claimAssignments),
        statusHistory: many(claimStatusHistory),
    };
});

export const claimAssignmentsRelations = relations(claimAssignments, ({ one }) => ({
    claim: one(claims, {
        fields: [claimAssignments.claimId],
        references: [claims.id],
    }),
    processor: one(users, {
        fields: [claimAssignments.processorId],
        references: [users.id],
    }),
    assignedByUser: one(users, {
        fields: [claimAssignments.assignedBy],
        references: [users.id],
        relationName: 'assignedBy',
    }),
}));

export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Patient = typeof patients.$inferSelect;
export type Provider = typeof providers.$inferSelect;
export type Claim = typeof claims.$inferSelect;
export type ClaimAssignment = typeof claimAssignments.$inferSelect;
export type PatientStatusChange = typeof patientStatusChanges.$inferSelect;
export type ClaimStatusHistory = typeof claimStatusHistory.$inferSelect;
export type DiagnosisCode = typeof diagnosisCodes.$inferSelect;
export type JobQueue = typeof jobQueues.$inferSelect;