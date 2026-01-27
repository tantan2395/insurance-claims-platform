import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import env from '../config';
import { db } from '../config/database';
import { users, organizations } from '../models/schema';
import { eq } from 'drizzle-orm';
import {
  UnauthorizedError,
  ValidationError,
  NotFoundError,
  ConflictError
} from '../utils/errors';
import { logger } from '../utils/logger';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterInput {
  organizationSlug: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'claims_processor' | 'provider' | 'patient';
  metadata?: Record<string, any>;
}

export interface AuthResponse {
  user: any;
  token: string;
  expiresIn: number;
}

export class AuthService {
  constructor() { }

  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const { email, password } = credentials;

    // Find user by email (without tenant restriction for login)
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('Account is inactive');
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedError('Invalid credentials');
    }

    // Get organization
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, user.organizationId))
      .limit(1);

    if (!organization || !organization.isActive) {
      throw new UnauthorizedError('Organization is inactive');
    }

    // Update last login
    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    // Generate JWT token
    const token = this.generateToken(user);
    const expiresIn = this.getTokenExpiration();

    // Remove sensitive data
    const { passwordHash, ...userWithoutPassword } = user;

    return {
      user: {
        ...userWithoutPassword,
        organization,
      },
      token,
      expiresIn,
    };
  }

  async register(input: RegisterInput): Promise<AuthResponse> {
    const { organizationSlug, ...userData } = input;

    // Check if organization exists
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, organizationSlug))
      .limit(1);

    if (!organization) {
      throw new NotFoundError('Organization not found');
    }

    if (!organization.isActive) {
      throw new ValidationError('Organization is inactive');
    }

    // Check if user already exists in this organization
    const [existingUser] = await db
      .select()
      .from(users)
      .where(
        eq(users.email, userData.email)
      )
      .limit(1);

    if (existingUser) {
      throw new ConflictError('User already exists');
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(userData.password, saltRounds);

    // Create user
    const [user] = await db
      .insert(users)
      .values({
        organizationId: organization.id,
        email: userData.email,
        passwordHash,
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: userData.role,
        metadata: userData.metadata || {},
      })
      .returning();

    if (!user) {
      throw new Error('Failed to create user');
    }

    // Generate token
    const token = this.generateToken(user);
    const expiresIn = this.getTokenExpiration();

    // Remove sensitive data
    const { passwordHash: _, ...userWithoutPassword } = user;

    return {
      user: {
        ...userWithoutPassword,
        organization,
      },
      token,
      expiresIn,
    };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    // Hash new password
    const saltRounds = 10;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password directly
    await db
      .update(users)
      .set({
        passwordHash: newPasswordHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    logger.info('Password changed successfully', { userId });
  }

  async resetPasswordRequest(email: string): Promise<{ resetToken: string }> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      // Don't reveal that user doesn't exist
      return { resetToken: '' };
    }

    if (!user.isActive) {
      throw new UnauthorizedError('Account is inactive');
    }

    // Generate reset token (in production, you'd send this via email)
    const resetToken = randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

    // Store reset token (in production, use a separate table)
    await db
      .update(users)
      .set({
        metadata: {
          ...(user.metadata as any),
          resetToken,
          resetTokenExpiry: resetTokenExpiry.toISOString(),
        },
      })
      .where(eq(users.id, user.id));

    logger.info('Password reset requested', { userId: user.id, email });

    return { resetToken };
  }

  async resetPassword(resetToken: string, newPassword: string): Promise<void> {
    // Find user with valid reset token
    const allUsers = await db.select().from(users);
    const user = allUsers.find((u: any) =>
      u.metadata?.resetToken === resetToken &&
      u.metadata?.resetTokenExpiry &&
      new Date(u.metadata.resetTokenExpiry) > new Date()
    );

    if (!user) {
      throw new ValidationError('Invalid or expired reset token');
    }

    // Hash new password
    const saltRounds = 10;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password and clear reset token
    await db
      .update(users)
      .set({
        passwordHash: newPasswordHash,
        metadata: {
          ...(user.metadata as any),
          resetToken: null,
          resetTokenExpiry: null,
        },
      })
      .where(eq(users.id, user.id));

    logger.info('Password reset successfully', { userId: user.id });
  }

  async validateToken(token: string): Promise<any> {
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET, {
        issuer: 'insurance-claims-api',
        audience: 'insurance-claims-users',
      }) as any;

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('Token expired');
      }
      throw new UnauthorizedError('Invalid token');
    }
  }

  private generateToken(user: any): string {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      iss: 'insurance-claims-api',
      aud: 'insurance-claims-users',
    };

    return jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: this.getTokenExpiration(),
    });
  }

  private getTokenExpiration(): number {
    // Parse JWT_EXPIRES_IN string to seconds
    const expiresIn = env.JWT_EXPIRES_IN;
    if (expiresIn.endsWith('d')) {
      return parseInt(expiresIn) * 24 * 60 * 60;
    }
    if (expiresIn.endsWith('h')) {
      return parseInt(expiresIn) * 60 * 60;
    }
    if (expiresIn.endsWith('m')) {
      return parseInt(expiresIn) * 60;
    }
    if (expiresIn.endsWith('s')) {
      return parseInt(expiresIn);
    }
    return 7 * 24 * 60 * 60; // Default: 7 days in seconds
  }
}

export const authService = new AuthService();