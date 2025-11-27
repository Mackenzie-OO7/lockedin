// Validation utilities

/**
 * Validate Stellar public key format
 * @param address - Stellar address to validate
 * @returns true if valid, false otherwise
 */
export function isValidStellarAddress(address: string): boolean {
  return /^G[A-Z0-9]{55}$/.test(address);
}

/**
 * Validate email format
 * @param email - Email address to validate
 * @returns true if valid, false otherwise
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validate amount is positive
 * @param amount - Amount to validate (string or number)
 * @returns true if valid, false otherwise
 */
export function isValidAmount(amount: string | number): boolean {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return !isNaN(num) && num > 0;
}

/**
 * Validate day of month for recurring bills (1-28)
 * @param day - Day of month
 * @returns true if valid, false otherwise
 */
export function isValidDayOfMonth(day: number): boolean {
  return Number.isInteger(day) && day >= 1 && day <= 28;
}

/**
 * Validate duration in months (1-12)
 * @param months - Duration in months
 * @returns true if valid, false otherwise
 */
export function isValidDuration(months: number): boolean {
  return Number.isInteger(months) && months >= 1 && months <= 12;
}
