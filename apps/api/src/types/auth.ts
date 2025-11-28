import type { Request } from 'express';

export interface JWTPayload {
  userId: string;
  walletAddress: string;
  iat?: number;
  exp?: number;
}

export interface AuthRequest extends Request {
  user?: JWTPayload;
}
