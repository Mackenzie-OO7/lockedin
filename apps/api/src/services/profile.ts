import { prisma } from '../config/database.js';

export interface UpdateProfileInput {
  name?: string;
  email?: string;
  avatar?: string;
  emailOnPayment?: boolean;
  emailOnDueSoon?: boolean;
  emailMonthlySummary?: boolean;
}

export class ProfileService {
  /**
   * Get user profile by userId
   */
  static async getProfile(userId: string) {
    const profile = await prisma.profile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new Error('Profile not found');
    }

    return profile;
  }

  /**
   * Update user profile
   */
  static async updateProfile(userId: string, data: UpdateProfileInput) {
    // Check if profile exists
    const existingProfile = await prisma.profile.findUnique({
      where: { userId },
    });

    if (!existingProfile) {
      // Create profile if it doesn't exist
      return await prisma.profile.create({
        data: {
          userId,
          ...data,
        },
      });
    }

    // Update existing profile
    return await prisma.profile.update({
      where: { userId },
      data,
    });
  }
}
