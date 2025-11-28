import { Keypair, StrKey } from '@stellar/stellar-sdk';

/**
 * Verify a Stellar wallet signature
 * @param walletAddress - The public key (G...)
 * @param message - The message that was signed
 * @param signature - The signature (hex string)
 * @returns true if signature is valid
 */
export function verifySignature(
  walletAddress: string,
  message: string,
  signature: string
): boolean {
  try {
    // Validate that walletAddress is a valid Stellar public key
    if (!StrKey.isValidEd25519PublicKey(walletAddress)) {
      return false;
    }

    // Convert message to buffer
    const messageBuffer = Buffer.from(message, 'utf8');

    // Convert signature from hex to buffer
    const signatureBuffer = Buffer.from(signature, 'hex');

    // Get the keypair from public key
    const keypair = Keypair.fromPublicKey(walletAddress);

    // Verify the signature
    return keypair.verify(messageBuffer, signatureBuffer);
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

/**
 * Generate a challenge message for wallet signing
 * @param walletAddress - The wallet address
 * @returns Challenge message
 */
export function generateChallengeMessage(walletAddress: string): string {
  const timestamp = Date.now();
  return `Sign in to LockedIn\nWallet: ${walletAddress}\nTimestamp: ${timestamp}`;
}
