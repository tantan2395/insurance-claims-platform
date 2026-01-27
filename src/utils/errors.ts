export class AppError extends Error {
    public readonly statusCode: number;
    public readonly isOperational: boolean;
    
    constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
      super(message);
      this.statusCode = statusCode;
      this.isOperational = isOperational;
      
      Object.setPrototypeOf(this, AppError.prototype);
      Error.captureStackTrace(this, this.constructor);
    }
  }
  
  export class NotFoundError extends AppError {
    constructor(message: string = 'Resource not found') {
      super(message, 404);
    }
  }
  
  export class ValidationError extends AppError {
    constructor(message: string = 'Validation failed') {
      super(message, 400);
    }
  }
  
  export class UnauthorizedError extends AppError {
    constructor(message: string = 'Unauthorized') {
      super(message, 401);
    }
  }
  
  export class ForbiddenError extends AppError {
    constructor(message: string = 'Forbidden') {
      super(message, 403);
    }
  }
  
  export class ConflictError extends AppError {
    constructor(message: string = 'Resource conflict') {
      super(message, 409);
    }
  }
  
  export class TooManyRequestsError extends AppError {
    constructor(message: string = 'Too many requests') {
      super(message, 429);
    }
  }
  
  // Tenant-related errors
  export class TenantNotFoundError extends AppError {
    constructor(message: string = 'Tenant not found') {
      super(message, 404);
    }
  }
  
  export class CrossTenantAccessError extends ForbiddenError {
    constructor(message: string = 'Cross-tenant access denied') {
      super(message);
    }
  }
  
  // Claim-specific errors
  export class ClaimLockedError extends ConflictError {
    constructor(message: string = 'Claim is locked by another user') {
      super(message);
    }
  }
  
  export class InvalidClaimStatusError extends ValidationError {
    constructor(message: string = 'Invalid claim status transition') {
      super(message);
    }
  }
  
  // Job-related errors
  export class JobFailedError extends AppError {
    public readonly jobId: string;
    
    constructor(jobId: string, message: string = 'Job failed') {
      super(message, 500);
      this.jobId = jobId;
    }
  }