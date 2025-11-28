import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { AnalyticsService } from '../services/analytics.js';
import type { AuthRequest } from '../types/auth.js';

const router = Router();

// Validation schema for refresh request
const refreshAnalyticsSchema = z.object({
  contractId: z.string().min(1),
});

/**
 * GET /api/analytics
 * Get analytics for authenticated user
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

    const analytics = await AnalyticsService.getAnalytics(req.user.userId);

    res.json({
      success: true,
      analytics,
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch analytics',
    });
  }
});

/**
 * POST /api/analytics/refresh
 * Refresh analytics by fetching latest data from blockchain
 */
router.post('/refresh', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
      return;
    }

    // Validate request body
    const result = refreshAnalyticsSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request body',
        details: result.error.issues,
      });
      return;
    }

    const analytics = await AnalyticsService.refreshAnalytics(
      req.user.userId,
      req.user.walletAddress,
      result.data.contractId
    );

    res.json({
      success: true,
      analytics,
    });
  } catch (error) {
    console.error('Refresh analytics error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to refresh analytics',
    });
  }
});

export { router as analyticsRouter };
