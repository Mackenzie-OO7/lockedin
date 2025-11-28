import { prisma } from '../config/database.js';

export interface AnalyticsData {
  totalLocked: string;
  totalPaid: string;
  totalSurplus: string;
  billsPaidCount: number;
  activeCycles: number;
  completedCycles: number;
  categoryBreakdown: Record<string, string>;
  monthlyTrend: Array<{
    month: string;
    locked: string;
    paid: string;
    surplus: string;
  }>;
}

export class AnalyticsService {
  /**
   * Get analytics for a user
   */
  static async getAnalytics(userId: string) {
    const analytics = await prisma.analytics.findUnique({
      where: { userId },
    });

    if (!analytics) {
      // Return empty analytics if not found
      return {
        totalLocked: '0',
        totalPaid: '0',
        totalSurplus: '0',
        billsPaidCount: 0,
        activeCycles: 0,
        completedCycles: 0,
        categoryBreakdown: {},
        monthlyTrend: [],
        updatedAt: new Date(),
      };
    }

    return analytics;
  }

  /**
   * Refresh analytics by fetching data from blockchain
   * This would interact with the Stellar smart contract
   */
  static async refreshAnalytics(
    userId: string,
    _walletAddress: string,
    _contractId: string
  ): Promise<AnalyticsData> {
    try {
      // TODO: Implement actual blockchain data fetching
      // This is a placeholder that would:
      // 1. Connect to Stellar network
      // 2. Call smart contract methods to get user's cycles
      // 3. Aggregate bill data
      // 4. Calculate analytics

      // For now, return placeholder data structure
      const analyticsData: AnalyticsData = {
        totalLocked: '0',
        totalPaid: '0',
        totalSurplus: '0',
        billsPaidCount: 0,
        activeCycles: 0,
        completedCycles: 0,
        categoryBreakdown: {},
        monthlyTrend: [],
      };

      // Update or create analytics in database
      await prisma.analytics.upsert({
        where: { userId },
        update: {
          totalLocked: analyticsData.totalLocked,
          totalPaid: analyticsData.totalPaid,
          totalSurplus: analyticsData.totalSurplus,
          billsPaidCount: analyticsData.billsPaidCount,
          activeCycles: analyticsData.activeCycles,
          completedCycles: analyticsData.completedCycles,
          categoryBreakdown: analyticsData.categoryBreakdown,
          monthlyTrend: analyticsData.monthlyTrend,
        },
        create: {
          userId,
          totalLocked: analyticsData.totalLocked,
          totalPaid: analyticsData.totalPaid,
          totalSurplus: analyticsData.totalSurplus,
          billsPaidCount: analyticsData.billsPaidCount,
          activeCycles: analyticsData.activeCycles,
          completedCycles: analyticsData.completedCycles,
          categoryBreakdown: analyticsData.categoryBreakdown,
          monthlyTrend: analyticsData.monthlyTrend,
        },
      });

      return analyticsData;
    } catch (error) {
      console.error('Error refreshing analytics:', error);
      throw new Error('Failed to refresh analytics');
    }
  }

}
