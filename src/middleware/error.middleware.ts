import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import env from '../config';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log the error
  logger.error('Error occurred:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userId: (req as any).tenant?.userId,
    organizationId: (req as any).tenant?.organizationId,
  });

  // Handle AppError instances
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        message: err.message,
        code: err.statusCode,
        timestamp: new Date().toISOString(),
        path: req.path,
      },
    });
    return;
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({
      error: {
        message: 'Invalid token',
        code: 401,
      },
    });
    return;
  }

  if (err.name === 'TokenExpiredError') {
    res.status(401).json({
      error: {
        message: 'Token expired',
        code: 401,
      },
    });
    return;
  }

  // Handle validation errors
  if (err.name === 'ValidationError' || err.name === 'ZodError') {
    res.status(400).json({
      error: {
        message: 'Validation failed',
        details: err.message,
        code: 400,
      },
    });
    return;
  }

  // Handle database errors
  if (err.name === 'DatabaseError' || err.name === 'PostgresError') {
    // Don't expose database errors in production
    const message = env.NODE_ENV === 'production' 
      ? 'Database error occurred' 
      : err.message;
    
    res.status(500).json({
      error: {
        message,
        code: 500,
      },
    });
    return;
  }

  // Default error
  res.status(500).json({
    error: {
      message: env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
      code: 500,
      ...(env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
}

// Async error handler wrapper
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// 404 handler
export function notFoundHandler(req: Request, res: Response, _next: NextFunction) {
  res.status(404).json({
    error: {
      message: `Cannot ${req.method} ${req.originalUrl}`,
      code: 404,
    },
  });
}