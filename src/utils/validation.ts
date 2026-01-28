import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';
import { ValidationError } from './errors';

export const idSchema = z.string().uuid('Invalid ID format');
export const phoneSchema = z.string().regex(/^[\+]?[1-9][\d]{0,15}$/, 'Invalid phone number');
export const emailSchema = z.string().email('Invalid email address');
export const dateSchema = z.string().date('Invalid date format');
export const dateTimeSchema = z.string().datetime('Invalid datetime format');
export const positiveNumberSchema = z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid number format').or(z.number().positive());

export const paginationSchema = z.object({
  limit: z.string().transform(Number).pipe(z.number().min(1).max(100)).optional().default('20'),
  offset: z.string().transform(Number).pipe(z.number().min(0)).optional().default('0'),
  cursor: z.string().optional(),
});

export const sortingSchema = z.object({
  sortBy: z.enum(['submissionDate', 'amount', 'status', 'patientName', 'providerName']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

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

export const createClaimSchema = z.object({
  patientId: idSchema,
  providerId: idSchema,
  diagnosisCode: z.string().min(3).max(50),
  diagnosisDescription: z.string().optional(),
  amount: positiveNumberSchema,
  notes: z.string().optional(),
});

export const updateClaimStatusSchema = z.object({
  status: z.enum(['submitted', 'under_review', 'approved', 'rejected', 'paid']),
  changeReason: z.string().optional(),
});

export const bulkUpdateStatusSchema = z.object({
  claimIds: z.array(idSchema).min(1, 'At least one claim ID is required'),
  status: z.enum(['submitted', 'under_review', 'approved', 'rejected', 'paid']),
  changeReason: z.string().optional(),
});

export const updateClaimSchema = z.object({
  status: z.enum(['submitted', 'under_review', 'approved', 'rejected', 'paid']).optional(),
  assignedProcessorId: idSchema.optional(),
  notes: z.string().optional(),
  diagnosisCode: z.string().min(3).max(50).optional(),
  amount: positiveNumberSchema.optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
});

export const claimFiltersSchema = paginationSchema.merge(sortingSchema).extend({
  dateRange: z.object({
    fromDate: dateSchema,
    toDate: dateSchema,
  }).optional(),
  status: z.enum(['submitted', 'under_review', 'approved', 'rejected', 'paid']).optional(),
  patientId: idSchema.optional(),
  providerId: idSchema.optional(),
  amountRange: z.object({
    minAmount: positiveNumberSchema,
    maxAmount: positiveNumberSchema,
  }).optional(),
  search: z.string().optional(),
}).refine(data => {
  if (data.dateRange) {
    const fromDate = new Date(data.dateRange.fromDate);
    const toDate = new Date(data.dateRange.toDate);
    return fromDate <= toDate;
  }
  return true;
}, {
  message: 'fromDate must be before or equal to toDate',
  path: ['dateRange'],
}).refine(data => {
  if (data.amountRange) {
    const minAmount = typeof data.amountRange.minAmount === 'string' 
      ? parseFloat(data.amountRange.minAmount) 
      : data.amountRange.minAmount;
    const maxAmount = typeof data.amountRange.maxAmount === 'string' 
      ? parseFloat(data.amountRange.maxAmount) 
      : data.amountRange.maxAmount;
    return minAmount <= maxAmount;
  }
  return true;
}, {
  message: 'minAmount must be less than or equal to maxAmount',
  path: ['amountRange'],
});

export const assignClaimSchema = z.object({
  processorId: idSchema,
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreatePatientInput = z.infer<typeof createPatientSchema>;
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;
export type PatientStatusChangeInput = z.infer<typeof patientStatusChangeSchema>;
export type CreateClaimInput = z.infer<typeof createClaimSchema>;
export type UpdateClaimStatusInput = z.infer<typeof updateClaimStatusSchema>;
export type BulkUpdateStatusInput = z.infer<typeof bulkUpdateStatusSchema>;
export type UpdateClaimInput = z.infer<typeof updateClaimSchema>;
export type ClaimFilters = z.infer<typeof claimFiltersSchema>;

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