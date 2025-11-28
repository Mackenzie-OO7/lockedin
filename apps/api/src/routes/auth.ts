import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AuthService } from '../services/auth.js';

const router = Router();

// Validation schema
const verifySchema = z.object({
  walletAddress: z.string().min(1),
  message: z.string().min(1),
  signature: z.string().min(1),
});

/**
 * POST /api/auth/verify
 * Verify wallet signature and return JWT token
 */
router.post('/verify', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const result = verifySchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request body',
        details: result.error.issues,
      });
      return;
    }

    // Verify signature and authenticate
    const authResult = await AuthService.verifyAndAuthenticate(result.data);

    if (!authResult.success) {
      res.status(401).json(authResult);
      return;
    }

    res.json(authResult);
  } catch (error) {
    console.error('Auth verify error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

export { router as authRouter };
