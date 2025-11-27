// User-related types

export interface User {
  id: string;
  walletAddress: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile {
  id: string;
  userId: string;
  name?: string;
  email?: string;
  avatar?: string;
  emailOnPayment: boolean;
  emailOnDueSoon: boolean;
  emailMonthlySummary: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateProfileParams {
  name?: string;
  email?: string;
  avatar?: string;
  emailOnPayment?: boolean;
  emailOnDueSoon?: boolean;
  emailMonthlySummary?: boolean;
}

export interface AuthResponse {
  success: boolean;
  token: string;
  user: User;
}

export interface VerifyWalletParams {
  walletAddress: string;
  signature: string;
  message: string;
}
