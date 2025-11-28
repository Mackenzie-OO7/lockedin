import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt.js';
import type { AuthRequest } from '../types/auth.js';

/**
 * Middleware to verify JWT token and attach user to request
 */
export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'No authorization token provided',
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const payload = verifyToken(token);

    // Attach user to request
    (req as AuthRequest).user = payload;

    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      error: error instanceof Error ? error.message : 'Invalid token',
    });
  }
}
