import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';
import { ValidationError } from './errors';

export const idSchema = z.string().uuid('Invalid ID format');
export const phoneSchema = z.string().regex(/^[\+]?[1-9][\d]{0,15}$/, 'Invalid phone number');
export const emailSchema = z.string().email('Invalid email address');
export const dateSchema = z.string().date('Invalid date format');
export const dateTimeSchema = z.string().datetime('Invalid datetime format');
export const positiveNumberSchema = z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid number format').or(z.number().positive());

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

export const createPatientSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  dateOfBirth: dateSchema,
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  address: z.string().optional(),
  insuranceMemberId: z.string().max(100).optional(),
  userId: idSchema.optional(),
});

export const updatePatientSchema = createPatientSchema.partial();

export const patientStatusChangeSchema = z.object({
  patientId: idSchema,
  statusType: z.enum(['admission', 'discharge', 'treatment']),
  occurredAt: dateSchema,
  details: z.record(z.any()).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreatePatientInput = z.infer<typeof createPatientSchema>;
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;
export type PatientStatusChangeInput = z.infer<typeof patientStatusChangeSchema>;

export function validate(schema: z.ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse({
        ...req.body,
        ...req.query,
        ...req.params,
      });

      if (!result.success) {
        throw new ValidationError(result.error.message);
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