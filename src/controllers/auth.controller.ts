import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import {
  loginSchema,
  registerSchema,
  changePasswordSchema,
  resetPasswordSchema,
  resetPasswordConfirmSchema,
  validate
} from '../utils/validation';
import { asyncHandler } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../types';

export class AuthController {
  constructor(private authService: AuthService) { }

  login = asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    const result = await this.authService.login({ email, password });

    logger.info('User logged in successfully', { email, userId: result.user.id });

    res.json({
      success: true,
      data: result,
    });
  });

  register = asyncHandler(async (req: Request, res: Response) => {
    const input = req.body;

    const result = await this.authService.register(input);

    logger.info('User registered successfully', {
      email: input.email,
      userId: result.user.id,
      role: input.role,
    });

    res.status(201).json({
      success: true,
      data: result,
    });
  });

  changePassword = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      throw new Error('User not authenticated');
    }

    await this.authService.changePassword(userId, currentPassword, newPassword);

    logger.info('Password changed successfully', { userId });

    res.json({
      success: true,
      message: 'Password changed successfully',
    });
  });

  resetPasswordRequest = asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body;

    const { resetToken } = await this.authService.resetPasswordRequest(email);

    // In production, this should be sending a reset token via email
    logger.info('Password reset requested', { email });

    res.json({
      success: true,
      message: 'If an account exists with this email, a reset link has been sent',
      // Only include token in development
      ...(process.env.NODE_ENV === 'development' && { resetToken }),
    });
  });

  resetPasswordConfirm = asyncHandler(async (req: Request, res: Response) => {
    const { token, newPassword } = req.body;

    await this.authService.resetPassword(token, newPassword);

    logger.info('Password reset confirmed');

    res.json({
      success: true,
      message: 'Password reset successfully',
    });
  });

  getProfile = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw new Error('User not authenticated');
    }

    const { passwordHash, ...userWithoutPassword } = req.user;

    res.json({
      success: true,
      data: {
        user: userWithoutPassword,
        tenant: req.tenant,
      },
    });
  });

  logout = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // JWT is stateless, so we can't "invalidate" it server-side
    // In production, we might want to implement a token blacklist
    logger.info('User logged out', { userId: req.user?.id });

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  });
}

// Export controller instance with routes
export const authController = new AuthController(new AuthService());

// Export route handlers with validation
export const authRoutes = {
  login: [validate(loginSchema), authController.login],
  register: [validate(registerSchema), authController.register],
  changePassword: [validate(changePasswordSchema), authController.changePassword],
  resetPasswordRequest: [validate(resetPasswordSchema), authController.resetPasswordRequest],
  resetPasswordConfirm: [validate(resetPasswordConfirmSchema), authController.resetPasswordConfirm],
  getProfile: [authController.getProfile],
  logout: [authController.logout],
};