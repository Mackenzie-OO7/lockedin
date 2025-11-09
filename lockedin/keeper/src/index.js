import cron from 'node-cron';
import dotenv from 'dotenv';
import { Keypair } from '@stellar/stellar-sdk';
import { initializeContract, processDueBills } from './payment.js';

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
  'ADMIN_SECRET_KEY',
  'CONTRACT_ID',
  'RPC_URL',
  'NETWORK_PASSPHRASE',
];

for (const varName of requiredEnvVars) {
  if (!process.env[varName]) {
    console.error(`❌ Missing required environment variable: ${varName}`);
    console.error('Please create a .env file based on .env.example');
    process.exit(1);
  }
}

// Initialize admin keypair
let adminKeypair;
try {
  adminKeypair = Keypair.fromSecret(process.env.ADMIN_SECRET_KEY);
  console.log(`✅ Admin public key: ${adminKeypair.publicKey()}\n`);
} catch (error) {
  console.error('❌ Invalid admin secret key');
  process.exit(1);
}

// Initialize contract client
const contract = initializeContract(
  process.env.ADMIN_SECRET_KEY,
  process.env.CONTRACT_ID,
  process.env.RPC_URL,
  process.env.NETWORK_PASSPHRASE
);

console.log('🔒 LockedIn Keeper Service');
console.log('==========================\n');
console.log(`Contract ID: ${process.env.CONTRACT_ID}`);
console.log(`Network: ${process.env.STELLAR_NETWORK || 'TESTNET'}`);
console.log(`RPC URL: ${process.env.RPC_URL}`);

// Default cron schedule: every day at 12:00 PM UTC
const cronSchedule = process.env.CRON_SCHEDULE || '0 12 * * *';
console.log(`Cron Schedule: ${cronSchedule}`);
console.log(`(Next run: ${cron.validate(cronSchedule) ? 'valid schedule' : 'INVALID SCHEDULE'})\n`);

// Validate cron schedule
if (!cron.validate(cronSchedule)) {
  console.error('❌ Invalid cron schedule');
  process.exit(1);
}

// Manual run flag (for testing)
const runNow = process.argv.includes('--now');

if (runNow) {
  console.log('🚀 Running manual payment check...\n');
  processDueBills(contract, adminKeypair)
    .then((result) => {
      console.log('✅ Manual run completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Manual run failed:', error);
      process.exit(1);
    });
} else {
  // Schedule cron job
  console.log('⏰ Keeper service started. Waiting for scheduled runs...\n');
  console.log('Press Ctrl+C to stop\n');

  cron.schedule(cronSchedule, async () => {
    try {
      await processDueBills(contract, adminKeypair);
    } catch (error) {
      console.error('❌ Error in scheduled job:', error);
    }
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Keeper service stopped');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n👋 Keeper service stopped');
  process.exit(0);
});
