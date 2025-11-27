// Formatting utilities

/**
 * Format USDC amount from stroops to human-readable string
 * @param stroops - Amount in stroops (1 USDC = 10^7 stroops)
 * @returns Formatted string (e.g., "1,234.56")
 */
export function formatUSDC(stroops: string | number): string {
  const amount = typeof stroops === 'string' ? BigInt(stroops) : BigInt(stroops);
  const usdc = Number(amount) / 10_000_000;
  return usdc.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Parse USDC amount from human-readable string to stroops
 * @param usdc - Amount in USDC (e.g., "1234.56")
 * @returns Amount in stroops as string
 */
export function parseUSDC(usdc: string | number): string {
  const amount = typeof usdc === 'string' ? parseFloat(usdc) : usdc;
  const stroops = Math.round(amount * 10_000_000);
  return stroops.toString();
}

/**
 * Format timestamp to human-readable date
 * @param timestamp - Unix timestamp in seconds
 * @returns Formatted date string
 */
export function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format timestamp to relative time (e.g., "2 days ago")
 * @param timestamp - Unix timestamp in seconds
 * @returns Relative time string
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const date = new Date(timestamp * 1000);
  const diff = now - date.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'just now';
}

/**
 * Truncate Stellar address for display
 * @param address - Full Stellar address
 * @param chars - Number of characters to show on each side
 * @returns Truncated address (e.g., "GABC...XYZ")
 */
export function truncateAddress(address: string, chars: number = 4): string {
  if (address.length <= chars * 2) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}
