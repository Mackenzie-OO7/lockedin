// Bill-related types

export enum BillCategory {
  Electricity = 'Electricity',
  Water = 'Water',
  Gas = 'Gas',
  Internet = 'Internet',
  Phone = 'Phone',
  Rent = 'Rent',
  Mortgage = 'Mortgage',
  Insurance = 'Insurance',
  Netflix = 'Netflix',
  Spotify = 'Spotify',
  Gym = 'Gym',
  Subscription = 'Subscription',
  Education = 'Education',
  Healthcare = 'Healthcare',
  Transportation = 'Transportation',
  Other = 'Other',
}

export interface Bill {
  id: string;
  cycleId: string;
  name: string;
  category: BillCategory;
  amount: string;
  dueDate: number;
  isPaid: boolean;
  isRecurring: boolean;
  recurrenceCalendar: number[];
  lastPaidDate?: number;
  recipientAddress?: string;
}

export interface CreateBillParams {
  cycleId: string;
  name: string;
  category: BillCategory;
  amount: string;
  dueDate: number;
  isRecurring: boolean;
  recurrenceCalendar?: number[];
  recipientAddress?: string;
}

export interface BillTemplate {
  id: string;
  name: string;
  description?: string;
  bills: TemplateBill[];
}

export interface TemplateBill {
  name: string;
  category: BillCategory;
  amount: string;
  isRecurring: boolean;
  dayOfMonth: number;
}
