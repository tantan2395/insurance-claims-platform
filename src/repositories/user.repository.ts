import { BaseRepository } from './base.repository';
import { users, User } from '../models/schema';
import { db } from '../config/database';
import { eq, and, or, SQL } from 'drizzle-orm';
import { TenantContext } from '../types';
import { NotFoundError } from '../utils/errors';

export class UserRepository extends BaseRepository<typeof users> {
  protected table = users;
  protected tenantIdField = 'organizationId';

  constructor(tenantContext: TenantContext) {
    super(tenantContext);
  }

  async findByEmail(email: string): Promise<User | null> {
    const [user] = await db
      .select()
      .from(this.table)
      .where(
        and(
          eq(this.table.email, email),
          this.withTenant()
        )
      )
      .limit(1);

    return user || null;
  }

  async findByEmailOrThrow(email: string): Promise<User> {
    const user = await this.findByEmail(email);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return user;
  }

  async findUsersByRole(role: User['role']): Promise<User[]> {
    return this.findAll(eq(this.table.role, role));
  }

  async findClaimsProcessors(): Promise<User[]> {
    return this.findUsersByRole('claims_processor');
  }

  async findProviders(): Promise<User[]> {
    return this.findUsersByRole('provider');
  }

  async findPatients(): Promise<User[]> {
    return this.findUsersByRole('patient');
  }

  async updateLastLogin(userId: string): Promise<User> {
    return this.update(userId, {
      lastLoginAt: new Date(),
    });
  }

  async deactivateUser(userId: string): Promise<User> {
    return this.update(userId, {
      isActive: false,
    });
  }

  async activateUser(userId: string): Promise<User> {
    return this.update(userId, {
      isActive: true,
    });
  }

  async updatePassword(userId: string, passwordHash: string): Promise<User> {
    return this.update(userId, {
      passwordHash,
      updatedAt: new Date(),
    });
  }
}