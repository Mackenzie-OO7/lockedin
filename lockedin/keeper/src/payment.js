import * as Client from 'lockedin';
import { Keypair } from '@stellar/stellar-sdk';

/**
 * Initialize the LockedIn contract client with admin credentials
 */
export function initializeContract(adminSecretKey, contractId, rpcUrl, networkPassphrase) {
  const adminKeypair = Keypair.fromSecret(adminSecretKey);

  return new Client.Client({
    networkPassphrase,
    contractId,
    rpcUrl,
    publicKey: adminKeypair.publicKey(),
  });
}

/**
 * Get all cycles from the contract
 */
export async function getAllCycles(contract, adminKeypair) {
  try {
    const tx = await contract.get_all_cycles();
    const signed = await tx.signAuthEntries({
      publicKey: adminKeypair.publicKey(),
      signAuthEntry: (entry) => {
        return adminKeypair.sign(entry.toXDR()).toString('base64');
      }
    });
    const result = await signed.send();

    // Unwrap Result type
    const cycleIds = result?.value || result;
    return cycleIds || [];
  } catch (error) {
    console.error('Error getting all cycles:', error);
    return [];
  }
}

/**
 * Get bills for a specific cycle
 */
export async function getCycleBills(contract, cycleId) {
  try {
    const tx = await contract.get_cycle_bills({ cycle_id: cycleId });
    const simulated = await tx.simulate();
    const billIds = (simulated.result as any)?.value || simulated.result;

    if (!billIds || billIds.length === 0) {
      return [];
    }

    // Fetch full bill data for each bill ID
    const bills = [];
    for (const billId of billIds) {
      try {
        const billTx = await contract.get_bill({ bill_id: billId });
        const billSimulated = await billTx.simulate();
        const billData = (billSimulated.result as any)?.value || billSimulated.result;
        bills.push(billData);
      } catch (err) {
        console.error(`Error fetching bill ${billId}:`, err);
      }
    }

    return bills;
  } catch (error) {
    console.error(`Error getting bills for cycle ${cycleId}:`, error);
    return [];
  }
}

/**
 * Check if a bill is due today
 */
export function isBillDueToday(bill) {
  const now = Date.now();
  const currentDayStart = Math.floor(now / 86400000) * 86400;
  const dueDayStart = Math.floor(Number(bill.due_date) / 86400) * 86400;

  return currentDayStart === dueDayStart && !bill.is_paid;
}

/**
 * Check if a bill is due within the notification window (default 24 hours)
 */
export function isBillDueSoon(bill, hoursAhead = 24) {
  const now = Date.now() / 1000; // Convert to seconds
  const dueDate = Number(bill.due_date);
  const timeUntilDue = dueDate - now;
  const hoursUntilDue = timeUntilDue / 3600;

  return hoursUntilDue > 0 && hoursUntilDue <= hoursAhead && !bill.is_paid;
}

/**
 * Pay a bill using admin privileges
 */
export async function payBill(contract, adminKeypair, billId) {
  try {
    console.log(`Paying bill ${billId}...`);

    const tx = await contract.admin_pay_bill({ bill_id: billId });

    const signed = await tx.signAuthEntries({
      publicKey: adminKeypair.publicKey(),
      signAuthEntry: (entry) => {
        return adminKeypair.sign(entry.toXDR()).toString('base64');
      }
    });

    const result = await signed.send();

    console.log(`✅ Bill ${billId} paid successfully`);
    return { success: true, billId, result };
  } catch (error) {
    console.error(`❌ Error paying bill ${billId}:`, error);
    return { success: false, billId, error: error.message };
  }
}

/**
 * Process all bills due today across all cycles
 */
export async function processDueBills(contract, adminKeypair) {
  console.log('\n=== Processing Due Bills ===');
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  const cycleIds = await getAllCycles(contract, adminKeypair);

  if (!cycleIds || cycleIds.length === 0) {
    console.log('No cycles found.');
    return { processed: 0, paid: 0, failed: 0 };
  }

  console.log(`Found ${cycleIds.length} cycle(s)\n`);

  let processed = 0;
  let paid = 0;
  let failed = 0;

  for (const cycleId of cycleIds) {
    const bills = await getCycleBills(contract, cycleId);

    for (const bill of bills) {
      if (isBillDueToday(bill)) {
        processed++;
        console.log(`\nBill due today: ${bill.name} (ID: ${bill.id})`);
        console.log(`Amount: ${Number(bill.amount) / 10_000_000} USDC`);

        const result = await payBill(contract, adminKeypair, bill.id);

        if (result.success) {
          paid++;
        } else {
          failed++;
        }
      }
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Processed: ${processed}`);
  console.log(`Paid: ${paid}`);
  console.log(`Failed: ${failed}\n`);

  return { processed, paid, failed };
}

/**
 * Get all bills due soon (for notifications)
 */
export async function getBillsDueSoon(contract, adminKeypair, hoursAhead = 24) {
  const cycleIds = await getAllCycles(contract, adminKeypair);

  if (!cycleIds || cycleIds.length === 0) {
    return [];
  }

  const dueSoonBills = [];

  for (const cycleId of cycleIds) {
    const bills = await getCycleBills(contract, cycleId);

    for (const bill of bills) {
      if (isBillDueSoon(bill, hoursAhead)) {
        dueSoonBills.push(bill);
      }
    }
  }

  return dueSoonBills;
}
