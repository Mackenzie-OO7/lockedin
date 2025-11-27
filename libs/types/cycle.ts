// Cycle-related types

export interface Cycle {
  id: string;
  user: string;
  startDate: number;
  endDate: number;
  totalDeposited: string;
  operatingFee: string;
  feePercentage: number;
  isActive: boolean;
  lastAdjustmentMonth: number;
}

export interface CreateCycleParams {
  durationMonths: number;
  amount: string;
}
