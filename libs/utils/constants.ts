// Shared constants for LockedIn

// Time constants
export const SECONDS_IN_DAY = 86400;
export const SECONDS_IN_MONTH = 30 * SECONDS_IN_DAY; // Approximate
export const SECONDS_IN_YEAR = 365 * SECONDS_IN_DAY;

// Bill constants
export const MIN_LEAD_TIME_DAYS = 7;
export const MIN_LEAD_TIME_SECONDS = MIN_LEAD_TIME_DAYS * SECONDS_IN_DAY;
export const MIN_DAY_OF_MONTH = 1;
export const MAX_DAY_OF_MONTH = 28; // Ensures recurring bills work in February

// Cycle constants
export const MIN_CYCLE_DURATION_MONTHS = 1;
export const MAX_CYCLE_DURATION_MONTHS = 12;

// Fee constants
export const MIN_FEE_PERCENTAGE = 100; // 1%
export const MAX_FEE_PERCENTAGE = 500; // 5%
export const DEFAULT_FEE_PERCENTAGE = 200; // 2%

// USDC constants
export const USDC_DECIMALS = 7;
export const USDC_STROOP = 10 ** USDC_DECIMALS;

// Network constants (will be updated dynamically)
export const TESTNET_NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
export const MAINNET_NETWORK_PASSPHRASE = 'Public Global Stellar Network ; September 2015';

// API constants
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
