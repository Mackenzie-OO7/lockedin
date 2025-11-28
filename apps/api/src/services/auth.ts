import { prisma } from '../config/database.js';
import { verifySignature } from '../utils/stellar.js';
import { generateToken } from '../utils/jwt.js';

export interface VerifySignatureInput {
  walletAddress: string;
  message: string;
  signature: string;
}

export interface VerifySignatureResult {
  success: boolean;
  token?: string;
  user?: {
    id: string;
    walletAddress: string;
  };
  error?: string;
}

export class AuthService {
  /**
   * Verify wallet signature and return JWT token
   */
  static async verifyAndAuthenticate(
    input: VerifySignatureInput
  ): Promise<VerifySignatureResult> {
    const { walletAddress, message, signature } = input;

    // Verify the signature
    const isValid = verifySignature(walletAddress, message, signature);

    if (!isValid) {
      return {
        success: false,
        error: 'Invalid signature',
      };
    }

    // Check if message is recent (within 5 minutes)
    const timestampMatch = message.match(/Timestamp: (\d+)/);
    if (timestampMatch) {
      const timestamp = parseInt(timestampMatch[1], 10);
      const now = Date.now();
      const fiveMinutes = 5 * 60 * 1000;

      if (now - timestamp > fiveMinutes) {
        return {
          success: false,
          error: 'Message expired. Please try again.',
        };
      }
    }

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { walletAddress },
    });

    if (!user) {
      // Create new user
      user = await prisma.user.create({
        data: { walletAddress },
      });

      // Create default profile
      await prisma.profile.create({
        data: {
          userId: user.id,
        },
      });
    }

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      walletAddress: user.walletAddress,
    });

    return {
      success: true,
      token,
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
      },
    };
  }
}
