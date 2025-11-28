import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { TemplateService } from '../services/template.js';
import type { AuthRequest } from '../types/auth.js';

const router = Router();

// Validation schemas
const templateBillSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  amount: z.string().min(1),
  isRecurring: z.boolean(),
  dayOfMonth: z.number().int().min(1).max(31),
});

const createTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  bills: z.array(templateBillSchema).min(1),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  bills: z.array(templateBillSchema).optional(),
});

/**
 * GET /api/templates
 * Get all templates for authenticated user
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

    const templates = await TemplateService.getTemplates(req.user.userId);

    res.json({
      success: true,
      templates,
    });
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch templates',
    });
  }
});

/**
 * GET /api/templates/:id
 * Get a single template by ID
 */
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
      return;
    }

    const template = await TemplateService.getTemplate(
      req.params.id,
      req.user.userId
    );

    res.json({
      success: true,
      template,
    });
  } catch (error) {
    console.error('Get template error:', error);
    res.status(404).json({
      success: false,
      error: error instanceof Error ? error.message : 'Template not found',
    });
  }
});

/**
 * POST /api/templates
 * Create a new template
 */
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
      return;
    }

    // Validate request body
    const result = createTemplateSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request body',
        details: result.error.issues,
      });
      return;
    }

    const template = await TemplateService.createTemplate(
      req.user.userId,
      result.data
    );

    res.status(201).json({
      success: true,
      template,
    });
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create template',
    });
  }
});

/**
 * PUT /api/templates/:id
 * Update a template
 */
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
      return;
    }

    // Validate request body
    const result = updateTemplateSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request body',
        details: result.error.issues,
      });
      return;
    }

    const template = await TemplateService.updateTemplate(
      req.params.id,
      req.user.userId,
      result.data
    );

    res.json({
      success: true,
      template,
    });
  } catch (error) {
    console.error('Update template error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update template',
    });
  }
});

/**
 * DELETE /api/templates/:id
 * Delete a template
 */
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
      return;
    }

    await TemplateService.deleteTemplate(req.params.id, req.user.userId);

    res.json({
      success: true,
      message: 'Template deleted successfully',
    });
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete template',
    });
  }
});

export { router as templateRouter };
