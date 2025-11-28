import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { ProfileService } from '../services/profile.js';
import type { AuthRequest } from '../types/auth.js';

const router = Router();

// Validation schema for profile updates
const updateProfileSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  avatar: z.string().url().optional(),
  emailOnPayment: z.boolean().optional(),
  emailOnDueSoon: z.boolean().optional(),
  emailMonthlySummary: z.boolean().optional(),
});

/**
 * GET /api/profile
 * Get authenticated user's profile
 */
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
      return;
    }

    const profile = await ProfileService.getProfile(req.user.userId);

    res.json({
      success: true,
      profile,
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch profile',
    });
  }
});

/**
 * PUT /api/profile
 * Update authenticated user's profile
 */
router.put('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
      return;
    }

    // Validate request body
    const result = updateProfileSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request body',
        details: result.error.issues,
      });
      return;
    }

    const profile = await ProfileService.updateProfile(
      req.user.userId,
      result.data
    );

    res.json({
      success: true,
      profile,
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update profile',
    });
  }
});

export { router as profileRouter };
