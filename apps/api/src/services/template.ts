import { prisma } from '../config/database.js';

export interface CreateTemplateInput {
  name: string;
  description?: string;
  bills: {
    name: string;
    category: string;
    amount: string;
    isRecurring: boolean;
    dayOfMonth: number;
  }[];
}

export interface UpdateTemplateInput {
  name?: string;
  description?: string;
  bills?: {
    name: string;
    category: string;
    amount: string;
    isRecurring: boolean;
    dayOfMonth: number;
  }[];
}

export class TemplateService {
  /**
   * Get all templates for a user
   */
  static async getTemplates(userId: string) {
    const templates = await prisma.billTemplate.findMany({
      where: { userId },
      include: {
        bills: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return templates;
  }

  /**
   * Get a single template by ID
   */
  static async getTemplate(templateId: string, userId: string) {
    const template = await prisma.billTemplate.findFirst({
      where: {
        id: templateId,
        userId,
      },
      include: {
        bills: true,
      },
    });

    if (!template) {
      throw new Error('Template not found');
    }

    return template;
  }

  /**
   * Create a new template
   */
  static async createTemplate(userId: string, data: CreateTemplateInput) {
    const { name, description, bills } = data;

    const template = await prisma.billTemplate.create({
      data: {
        userId,
        name,
        description,
        bills: {
          create: bills,
        },
      },
      include: {
        bills: true,
      },
    });

    return template;
  }

  /**
   * Update a template
   */
  static async updateTemplate(
    templateId: string,
    userId: string,
    data: UpdateTemplateInput
  ) {
    // Verify ownership
    const existing = await prisma.billTemplate.findFirst({
      where: { id: templateId, userId },
    });

    if (!existing) {
      throw new Error('Template not found');
    }

    // If bills are being updated, replace all bills
    if (data.bills) {
      // Delete existing bills
      await prisma.templateBill.deleteMany({
        where: { templateId },
      });

      // Create new bills
      const template = await prisma.billTemplate.update({
        where: { id: templateId },
        data: {
          name: data.name,
          description: data.description,
          bills: {
            create: data.bills,
          },
        },
        include: {
          bills: true,
        },
      });

      return template;
    }

    // Update only metadata
    const template = await prisma.billTemplate.update({
      where: { id: templateId },
      data: {
        name: data.name,
        description: data.description,
      },
      include: {
        bills: true,
      },
    });

    return template;
  }

  /**
   * Delete a template
   */
  static async deleteTemplate(templateId: string, userId: string) {
    // Verify ownership
    const existing = await prisma.billTemplate.findFirst({
      where: { id: templateId, userId },
    });

    if (!existing) {
      throw new Error('Template not found');
    }

    await prisma.billTemplate.delete({
      where: { id: templateId },
    });

    return { success: true };
  }
}
