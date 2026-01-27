import { Organization } from '../models/schema';
import { db } from '../config/database';
import { organizations, users } from '../models/schema';
import { count, eq, sql } from 'drizzle-orm';
import {
  ConflictError,
  ValidationError,
  NotFoundError
} from '../utils/errors';
import { logger } from '../utils/logger';
import bcrypt from 'bcrypt';

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  adminEmail: string;
  adminPassword: string;
  adminFirstName: string;
  adminLastName: string;
  metadata?: Record<string, any>;
}

export interface UpdateOrganizationInput {
  name?: string;
  isActive?: boolean;
  metadata?: Record<string, any>;
  slug?: string;
}

export class OrganizationService {
  async createOrganization(input: CreateOrganizationInput): Promise<{
    organization: Organization;
    adminUser: any;
  }> {
    const { name, slug, adminEmail, adminPassword, adminFirstName, adminLastName, metadata } = input;

    if (!/^[a-z0-9-]+$/.test(slug)) {
      throw new ValidationError(
        'Organization slug can only contain lowercase letters, numbers, and hyphens'
      );
    }

    // Check if organization slug already exists
    const existingOrg = await this.findBySlug(slug);
    if (existingOrg) {
      throw new ConflictError('Organization slug already exists');
    }

    // Check if admin email already exists
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, adminEmail))
      .limit(1);

    if (existingUser.length > 0) {
      throw new ConflictError('Admin email already exists');
    }

    // Start transaction
    const result = await db.transaction(async (tx) => {
      // Create organization
      const [organization] = await tx
        .insert(organizations)
        .values({
          name,
          slug,
          isActive: true,
        }).returning()

      if (!organization) {
        throw new Error('Failed to create organization');
      }

      // Hash password
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(adminPassword, saltRounds);

      // Create admin user
      const [adminUser] = await tx
        .insert(users)
        .values({
          organizationId: organization.id,
          email: adminEmail,
          passwordHash,
          firstName: adminFirstName,
          lastName: adminLastName,
          role: 'admin',
          isActive: true,
          metadata: {
            ...metadata,
            isInitialAdmin: true,
          },
        })
        .returning();

      if (!adminUser) {
        throw new Error('Failed to create admin user');
      }

      // Remove password hash from response
      const { passwordHash: _, ...adminUserWithoutPassword } = adminUser;

      return {
        organization,
        adminUser: adminUserWithoutPassword,
      };
    });

    logger.info('Organization created successfully', {
      organizationId: result.organization.id,
      organizationName: result.organization.name,
      adminEmail,
    });

    return result;
  }

  async updateOrganization(
    organizationId: string,
    updates: UpdateOrganizationInput
  ): Promise<Organization> {
    const organization = await this.findById(organizationId);
    if (!organization) {
      throw new NotFoundError('Organization not found');
    }

    // If updating slug, check for uniqueness
    if (updates.slug && updates.slug !== organization.slug) {
      const existingOrg = await this.findBySlug(updates.slug);
      if (existingOrg) {
        throw new ConflictError('Organization slug already exists');
      }
    }

    const [updated] = await db
      .update(organizations)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, organizationId))
      .returning();

    if (!updated) {
      throw new Error('Failed to update organization');
    }

    logger.info('Organization updated', {
      organizationId,
      updates,
    });

    return updated;
  }

  async deactivateOrganization(organizationId: string): Promise<Organization> {
    const organization = await this.findById(organizationId);
    if (!organization) {
      throw new NotFoundError('Organization not found');
    }

    // Deactivate organization and all its users
    const [updated] = await db
      .update(organizations)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, organizationId))
      .returning();

    // Also deactivate all users in this organization
    await db
      .update(users)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(users.organizationId, organizationId));

    logger.info('Organization deactivated', {
      organizationId,
      organizationName: organization.name,
    });

    return updated;
  }

  async activateOrganization(organizationId: string): Promise<Organization> {
    const organization = await this.findById(organizationId);
    if (!organization) {
      throw new NotFoundError('Organization not found');
    }

    const [updated] = await db
      .update(organizations)
      .set({
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, organizationId))
      .returning();

    await db
      .update(users)
      .set({
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(users.organizationId, organizationId));

    logger.info('Organization activated', {
      organizationId,
      organizationName: organization.name,
    });

    return updated;
  }

  async findById(organizationId: string): Promise<Organization | null> {
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    return organization || null;
  }

  async findBySlug(slug: string): Promise<Organization | null> {
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);

    return organization || null;
  }

  async listOrganizations(options: {
    isActive?: boolean;
    limit?: number;
    offset?: number;
  } = {}): Promise<{
    organizations: Organization[];
    total: number;
  }> {
    const { isActive, limit = 20, offset = 0 } = options;

    let whereClause = undefined;
    if (isActive !== undefined) {
      whereClause = eq(organizations.isActive, isActive);
    }

    const organizationsList = await db
      .select()
      .from(organizations)
      .where(whereClause)
      .limit(limit)
      .offset(offset)
      .orderBy(organizations.createdAt);

    const total = await db
      .select({ count: count() })
      .from(organizations)
      .where(whereClause);


    return {
      organizations: organizationsList,
      total: Number(total[0]?.count ?? 0),
    };
  }

  async getOrganizationStats(organizationId: string): Promise<{
    userCount: number;
    patientCount: number;
    claimCount: number;
    activeClaims: number;
  }> {
    const organization = await this.findById(organizationId);
    if (!organization) {
      throw new NotFoundError('Organization not found');
    }

    // Get user count
    const userStats = await db
      .select({ count: count() })
      .from(users)
      .where(eq(users.organizationId, organizationId));

    // Note: For patient and claim counts, you'd need to query those tables
    // For now, return placeholder stats

    return {
      userCount: Number(userStats[0]?.count ?? 0),
      patientCount: 0, // Would query patients table
      claimCount: 0,   // Would query claims table
      activeClaims: 0, // Would query claims with specific status
    };
  }

  async validateOrganizationAccess(
    organizationId: string,
    userId: string
  ): Promise<boolean> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return false;
    }

    return user.organizationId === organizationId;
  }
}