import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';
import { ValidationError } from './errors';

export const emailSchema = z.string().email('Invalid email address');

export const loginSchema = z.object({
    email: emailSchema,
    password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const registerSchema = z.object({
    organizationSlug: z.string().min(3).max(100),
    email: emailSchema,
    password: z.string()
        .min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number')
        .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    role: z.enum(['admin', 'claims_processor', 'provider', 'patient']),
    metadata: z.record(z.any()).optional(),
});

export const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string()
        .min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number'),
});

export const resetPasswordSchema = z.object({
    email: emailSchema,
});

export const resetPasswordConfirmSchema = z.object({
    token: z.string().min(1, 'Token is required'),
    newPassword: z.string()
        .min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;

export function validate(schema: z.ZodSchema) {
    return (req: Request, _res: Response, next: NextFunction) => {
      try {
        const result = schema.safeParse({
          ...req.body,
          ...req.query,
          ...req.params,
        });
  
        if (!result.success) {
          throw new ValidationError();
        }
  
        // Replace with validated data
        if (req.body) {
          req.body = result.data;
        }
  
        next();
      } catch (error) {
        next(error);
      }
    };
  }