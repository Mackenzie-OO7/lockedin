#![no_std]

mod error;
mod events;
mod test;
mod types;

use soroban_sdk::{contract, contractimpl, token, Address, Env, String, Vec};
use time::OffsetDateTime;

use error::Error;
use types::{Bill, BillCategory, BillCycle, DataKey};

const DAY_IN_LEDGERS: u32 = 17280; // ~24 hours
const LEDGER_TTL_THRESHOLD: u32 = DAY_IN_LEDGERS * 30; // 30 days
const LEDGER_TTL_EXTEND: u32 = DAY_IN_LEDGERS * 365; // 1 year

// RAII reentrancy guard - automatically releases lock when dropped
struct ReentrancyGuard<'a> {
    env: &'a Env,
}

impl<'a> ReentrancyGuard<'a> {
    fn new(env: &'a Env) -> Result<Self, Error> {
        if env.storage().persistent().has(&DataKey::ReentrancyLock) {
            return Err(Error::Reentrancy);
        }
        env.storage().persistent().set(&DataKey::ReentrancyLock, &true);
        Ok(ReentrancyGuard { env })
    }
}

impl<'a> Drop for ReentrancyGuard<'a> {
    fn drop(&mut self) {
        self.env.storage().persistent().remove(&DataKey::ReentrancyLock);
    }
}

#[contract]
pub struct LockedIn;

#[contractimpl]
impl LockedIn {
    pub fn __constructor(env: Env, admin: Address, usdc_token: Address) {
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::UsdcToken, &usdc_token);
        env.storage().instance().set(&DataKey::FeeRecipient, &admin);
        env.storage()
            .instance()
            .set(&DataKey::FeePercentage, &200u32); // Default 2% fee
        env.storage().instance().set(&DataKey::CycleCounter, &0u64);
        env.storage().instance().set(&DataKey::BillCounter, &0u64);
    }

    // Admin functions

    pub fn admin(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::AdminNotSet)
    }

    // Initiate admin transfer (step 1 of 2-step transfer)
    pub fn transfer_admin(
        env: Env,
        new_admin: Address,
        live_until_ledger: u32,
    ) -> Result<(), Error> {
        Self::require_admin(&env)?;

        // Check if there's already a pending transfer that hasn't expired
        if let Some(expiry) = env
            .storage()
            .instance()
            .get::<DataKey, u32>(&DataKey::TransferExpiry)
        {
            // If there's a non-expired pending transfer, prevent overwriting it
            if env.ledger().sequence() <= expiry {
                return Err(Error::PendingAdminTransferExists);
            }
        }

        env.storage()
            .instance()
            .set(&DataKey::PendingAdmin, &new_admin);
        env.storage()
            .instance()
            .set(&DataKey::TransferExpiry, &live_until_ledger);

        events::AdminTransferInitiated {
            new_admin: new_admin.clone(),
        }
        .publish(&env);

        Ok(())
    }

    // Accept admin transfer (step 2 of 2-step transfer)
    pub fn accept_admin(env: Env) -> Result<(), Error> {
        let new_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::PendingAdmin)
            .ok_or(Error::NoPendingAdminTransfer)?;

        new_admin.require_auth();

        let expiry: u32 = env
            .storage()
            .instance()
            .get(&DataKey::TransferExpiry)
            .ok_or(Error::NoPendingAdminTransfer)?;

        if env.ledger().sequence() > expiry {
            return Err(Error::AdminTransferExpired);
        }

        env.storage().instance().set(&DataKey::Admin, &new_admin);
        env.storage().instance().remove(&DataKey::PendingAdmin);
        env.storage().instance().remove(&DataKey::TransferExpiry);

        events::AdminTransferred {
            new_admin: new_admin.clone(),
        }
        .publish(&env);

        Ok(())
    }

    // Cancel a pending admin transfer
    pub fn cancel_admin_transfer(env: Env) -> Result<(), Error> {
        Self::require_admin(&env)?;

        if !env
            .storage()
            .instance()
            .has(&DataKey::PendingAdmin)
        {
            return Err(Error::NoPendingAdminTransfer);
        }

        env.storage().instance().remove(&DataKey::PendingAdmin);
        env.storage().instance().remove(&DataKey::TransferExpiry);

        Ok(())
    }

    pub fn set_fee_recipient(env: Env, recipient: Address) -> Result<(), Error> {
        Self::require_admin(&env)?;

        env.storage()
            .instance()
            .set(&DataKey::FeeRecipient, &recipient);

        events::FeeRecipientUpdated {
            recipient: recipient.clone(),
        }
        .publish(&env);

        Ok(())
    }

    pub fn fee_recipient(env: &Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::FeeRecipient)
            .ok_or(Error::FeeRecipientNotSet)
    }

    pub fn set_usdc_token(env: Env, usdc_token: Address) -> Result<(), Error> {
        Self::require_admin(&env)?;

        env.storage()
            .instance()
            .set(&DataKey::UsdcToken, &usdc_token);

        Ok(())
    }

    // Get USDC token address (consolidated getter)
    pub fn usdc_token(env: &Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::UsdcToken)
            .ok_or(Error::UsdcTokenNotSet)
    }

    pub fn set_fee_percentage(env: Env, fee_percentage: u32) -> Result<(), Error> {
        Self::require_admin(&env)?;

        Self::validate_fee_percentage(fee_percentage)?;

        env.storage()
            .instance()
            .set(&DataKey::FeePercentage, &fee_percentage);

        Ok(())
    }

    // Fee percentage in basis points (e.g., 200 = 2.00%)
    pub fn fee_percentage(env: &Env) -> Result<u32, Error> {
        env.storage()
            .instance()
            .get(&DataKey::FeePercentage)
            .ok_or(Error::FeePercentageNotSet)
    }

    // Cycle Management

    pub fn create_cycle(
        env: Env,
        user: Address,
        duration_months: u32,
        amount: i128,
    ) -> Result<u64, Error> {
        user.require_auth();

        if duration_months < 1 || duration_months > 12 {
            return Err(Error::InvalidCycleDuration);
        }
        if amount <= 0 {
            return Err(Error::InsufficientFunds);
        }

        let fee_percentage = Self::fee_percentage(&env)?;

        let operating_fee = Self::calculate_fee(amount, fee_percentage);
        let current_time = env.ledger().timestamp();
        let duration_seconds = duration_months as u64 * 30 * 24 * 60 * 60; // ~30 days per month
        let end_date = current_time + duration_seconds;

        let cycle_id = Self::next_cycle_id(&env);

        // Clone user for keys and events
        let user_for_keys = user.clone();
        let user_for_event = user.clone();
        let cycle = BillCycle {
            user, // Move original user into struct
            start_date: current_time,
            end_date,
            total_deposited: amount,
            operating_fee,
            fee_percentage,
            is_active: true,
            // last_adjustment_month: Self::get_current_month(&env),
            last_adjustment_month: 0,
        };

        let cycle_key = DataKey::Cycle(cycle_id);
        env.storage().persistent().set(&cycle_key, &cycle);
        Self::extend_ttl(&env, &cycle_key);

        let user_cycles_key = DataKey::UserCycles(user_for_keys.clone());
        let mut user_cycles: Vec<u64> = env
            .storage()
            .persistent()
            .get(&user_cycles_key)
            .unwrap_or(Vec::new(&env));
        user_cycles.push_back(cycle_id);
        env.storage()
            .persistent()
            .set(&user_cycles_key, &user_cycles);
        Self::extend_ttl(&env, &user_cycles_key);

        let all_cycles_key = DataKey::AllCycles;
        let mut all_cycles: Vec<u64> = env
            .storage()
            .persistent()
            .get(&all_cycles_key)
            .unwrap_or(Vec::new(&env));
        all_cycles.push_back(cycle_id);
        env.storage().persistent().set(&all_cycles_key, &all_cycles);
        Self::extend_ttl(&env, &all_cycles_key);

        let cycle_bills_key = DataKey::CycleBills(cycle_id);
        let empty_bills: Vec<u64> = Vec::new(&env);
        env.storage()
            .persistent()
            .set(&cycle_bills_key, &empty_bills);
        Self::extend_ttl(&env, &cycle_bills_key);

        let usdc_token = Self::usdc_token(&env)?;
        let token_client = token::TokenClient::new(&env, &usdc_token);
        token_client.transfer(&user_for_keys, &env.current_contract_address(), &amount);

        let fee_recipient = Self::fee_recipient(&env)?;
        token_client.transfer(
            &env.current_contract_address(),
            &fee_recipient,
            &operating_fee,
        );

        events::CycleCreated {
            cycle_id,
            user: user_for_event,
        }
        .publish(&env);

        Ok(cycle_id)
    }

    pub fn get_cycle(env: Env, cycle_id: u64) -> Result<BillCycle, Error> {
        let cycle_key = DataKey::Cycle(cycle_id);
        let cycle: BillCycle = env
            .storage()
            .persistent()
            .get(&cycle_key)
            .ok_or(Error::CycleNotFound)?;

        cycle.user.require_auth();

        Self::extend_ttl(&env, &cycle_key);
        Ok(cycle)
    }

    pub fn get_user_cycles(env: Env, user: Address) -> Vec<u64> {
        user.require_auth();

        let user_cycles_key = DataKey::UserCycles(user);
        Self::extend_ttl(&env, &user_cycles_key);
        env.storage()
            .persistent()
            .get(&user_cycles_key)
            .unwrap_or(Vec::new(&env))
    }

    // Admin-only
    pub fn get_all_cycles(env: Env) -> Result<Vec<u64>, Error> {
        Self::require_admin(&env)?;

        let all_cycles_key = DataKey::AllCycles;

        if env.storage().persistent().has(&all_cycles_key) {
            Self::extend_ttl(&env, &all_cycles_key);
        }

        Ok(env
            .storage()
            .persistent()
            .get(&all_cycles_key)
            .unwrap_or(Vec::new(&env)))
    }

    /// Anyone can end a cycle after the end_date has passed
    pub fn end_cycle(env: Env, cycle_id: u64) -> Result<(), Error> {
        let _guard = ReentrancyGuard::new(&env)?;

        let cycle_key = DataKey::Cycle(cycle_id);
        let cycle: BillCycle = env
            .storage()
            .persistent()
            .get(&cycle_key)
            .ok_or(Error::CycleNotFound)?;

        // Check that cycle has ended
        let current_time = env.ledger().timestamp();
        if current_time < cycle.end_date {
            return Err(Error::CycleNotEnded);
        }

        Self::end_cycle_internal(&env, cycle_id, cycle, cycle_key)
    }

    /// Admin can end a cycle at any time
    pub fn admin_end_cycle(env: Env, cycle_id: u64) -> Result<(), Error> {
        Self::require_admin(&env)?;
        let _guard = ReentrancyGuard::new(&env)?;

        let cycle_key = DataKey::Cycle(cycle_id);
        let cycle: BillCycle = env
            .storage()
            .persistent()
            .get(&cycle_key)
            .ok_or(Error::CycleNotFound)?;

        Self::end_cycle_internal(&env, cycle_id, cycle, cycle_key)
    }

    // Bill Management
    // Add one or more bills in a single transaction
    pub fn add_bills(
        env: Env,
        cycle_id: u64,
        bills: Vec<(String, i128, u64, bool, Vec<u32>, BillCategory)>,
    ) -> Result<Vec<u64>, Error> {
        let cycle_key = DataKey::Cycle(cycle_id);
        let cycle: BillCycle = env
            .storage()
            .persistent()
            .get(&cycle_key)
            .ok_or(Error::CycleNotFound)?;

        cycle.user.require_auth();

        if !cycle.is_active {
            return Err(Error::CycleNotActive);
        }

        let mut bill_ids = Vec::new(&env);
        let cycle_bills_key = DataKey::CycleBills(cycle_id);
        let mut cycle_bills: Vec<u64> = env
            .storage()
            .persistent()
            .get(&cycle_bills_key)
            .unwrap_or(Vec::new(&env));

        for (name, amount, due_date, is_recurring, recurrence_calendar, category) in bills.iter() {
            if amount <= 0 {
                return Err(Error::InvalidBillAmount);
            }

            if due_date < cycle.start_date || due_date > cycle.end_date {
                return Err(Error::InvalidDueDate);
            }

            Self::validate_day_of_month(due_date)?;

            Self::validate_lead_time(&env, due_date)?;

            if is_recurring {
                for month in recurrence_calendar.iter() {
                    if month < 1 || month > 12 {
                        return Err(Error::InvalidRecurrence);
                    }
                }
            }

            Self::validate_allocation(&env, cycle_id, &cycle, amount, is_recurring)?;

            let bill_id = Self::next_bill_id(&env);
            let bill = Bill {
                id: bill_id,
                cycle_id,
                name,
                amount,
                due_date,
                is_paid: false,
                is_recurring,
                recurrence_calendar,
                last_paid_date: None,
                category,
            };

            let bill_key = DataKey::Bill(bill_id);
            env.storage().persistent().set(&bill_key, &bill);
            Self::extend_ttl(&env, &bill_key);

            cycle_bills.push_back(bill_id);
            bill_ids.push_back(bill_id);

            events::BillAdded { bill_id, cycle_id }.publish(&env);
        }

        env.storage()
            .persistent()
            .set(&cycle_bills_key, &cycle_bills);
        Self::extend_ttl(&env, &cycle_bills_key);

        Ok(bill_ids)
    }

    pub fn get_bill(env: Env, bill_id: u64) -> Result<Bill, Error> {
        let bill_key = DataKey::Bill(bill_id);
        let bill: Bill = env
            .storage()
            .persistent()
            .get(&bill_key)
            .ok_or(Error::BillNotFound)?;

        let cycle_key = DataKey::Cycle(bill.cycle_id);
        let cycle: BillCycle = env
            .storage()
            .persistent()
            .get(&cycle_key)
            .ok_or(Error::CycleNotFound)?;

        cycle.user.require_auth();

        Self::extend_ttl(&env, &bill_key);
        Ok(bill)
    }

    pub fn get_cycle_bills(env: Env, cycle_id: u64) -> Vec<u64> {
        let cycle_key = DataKey::Cycle(cycle_id);
        if let Some(cycle) = env.storage().persistent().get::<DataKey, BillCycle>(&cycle_key) {
            cycle.user.require_auth();
            Self::extend_ttl(&env, &cycle_key);
        }

        let cycle_bills_key = DataKey::CycleBills(cycle_id);
        Self::extend_ttl(&env, &cycle_bills_key);
        env.storage()
            .persistent()
            .get(&cycle_bills_key)
            .unwrap_or(Vec::new(&env))
    }

    // Sends funds back to user's wallet
    // User can call ONLY on exact due date (same calendar day)
    pub fn pay_bill(env: Env, bill_id: u64) -> Result<(), Error> {
        let _guard = ReentrancyGuard::new(&env)?;

        let bill_key = DataKey::Bill(bill_id);
        let mut bill: Bill = env
            .storage()
            .persistent()
            .get(&bill_key)
            .ok_or(Error::BillNotFound)?;

        let cycle_key = DataKey::Cycle(bill.cycle_id);
        let cycle: BillCycle = env
            .storage()
            .persistent()
            .get(&cycle_key)
            .ok_or(Error::CycleNotFound)?;

        cycle.user.require_auth();

        if bill.is_paid {
            return Err(Error::BillAlreadyPaid);
        }

        if !cycle.is_active {
            return Err(Error::CycleNotActive);
        }

        let current_time = env.ledger().timestamp();
        let bill_due_day_start = (bill.due_date / 86400) * 86400;
        let current_day_start = (current_time / 86400) * 86400;

        if current_day_start != bill_due_day_start {
            return Err(Error::BillNotDueYet);
        }

        if bill.is_recurring {
            if let Some(last_paid) = bill.last_paid_date {
                const SECONDS_IN_MONTH: u64 = 30 * 86400;
                if current_time - last_paid < SECONDS_IN_MONTH {
                    return Err(Error::BillAlreadyPaid);
                }
            }
        }

        bill.last_paid_date = Some(current_time);

        if bill.is_recurring {
            const SECONDS_IN_DAY: u64 = 86400;
            const AVERAGE_DAYS_IN_MONTH: u64 = 30;

            let next_due_date = bill.due_date + (AVERAGE_DAYS_IN_MONTH * SECONDS_IN_DAY);

            if next_due_date < cycle.end_date {
                bill.due_date = next_due_date;
                bill.is_paid = false;
            } else {
                bill.is_paid = true;
            }
        } else {
            bill.is_paid = true;
        }

        env.storage().persistent().set(&bill_key, &bill);
        Self::extend_ttl(&env, &bill_key);

        let usdc_token = Self::usdc_token(&env)?;
        let token_client = token::TokenClient::new(&env, &usdc_token);
        token_client.transfer(&env.current_contract_address(), &cycle.user, &bill.amount);

        events::BillPaid {
            bill_id,
            amount: bill.amount,
        }
        .publish(&env);

        Ok(())
    }


    pub fn admin_pay_bill(env: Env, bill_id: u64) -> Result<(), Error> {
        Self::require_admin(&env)?;
        let _guard = ReentrancyGuard::new(&env)?;

        let bill_key = DataKey::Bill(bill_id);
        let mut bill: Bill = env
            .storage()
            .persistent()
            .get(&bill_key)
            .ok_or(Error::BillNotFound)?;

        if bill.is_paid {
            return Err(Error::BillAlreadyPaid);
        }

        let cycle_key = DataKey::Cycle(bill.cycle_id);
        let cycle: BillCycle = env
            .storage()
            .persistent()
            .get(&cycle_key)
            .ok_or(Error::CycleNotFound)?;

        if !cycle.is_active {
            return Err(Error::CycleNotActive);
        }

        if bill.is_recurring {
            if let Some(last_paid) = bill.last_paid_date {
                let current_time = env.ledger().timestamp();
                const SECONDS_IN_MONTH: u64 = 30 * 86400;
                if current_time - last_paid < SECONDS_IN_MONTH {
                    return Err(Error::BillAlreadyPaid);
                }
            }
        }

        let current_time = env.ledger().timestamp();
        bill.last_paid_date = Some(current_time);

        if bill.is_recurring {
            const SECONDS_IN_DAY: u64 = 86400;
            const AVERAGE_DAYS_IN_MONTH: u64 = 30;

            let next_due_date = bill.due_date + (AVERAGE_DAYS_IN_MONTH * SECONDS_IN_DAY);

            if next_due_date < cycle.end_date {
                bill.due_date = next_due_date;
                bill.is_paid = false;
            } else {
                bill.is_paid = true;
            }
        } else {
            bill.is_paid = true;
        }

        env.storage().persistent().set(&bill_key, &bill);
        Self::extend_ttl(&env, &bill_key);

        let usdc_token = Self::usdc_token(&env)?;
        let token_client = token::TokenClient::new(&env, &usdc_token);
        token_client.transfer(&env.current_contract_address(), &cycle.user, &bill.amount);

        events::BillPaid {
            bill_id,
            amount: bill.amount,
        }
        .publish(&env);

        Ok(())
    }

    // Cancel a single occurrence of a bill
    // For recurring bills it skips next occurrence by advancing last_paid_date by 30 days
    // For non-recurring bills it deletes the bill entirely
    /// Skip the current month's payment for a recurring bill
    pub fn skip_bill(env: Env, bill_id: u64) -> Result<(), Error> {
        let bill_key = DataKey::Bill(bill_id);
        let mut bill: Bill = env
            .storage()
            .persistent()
            .get(&bill_key)
            .ok_or(Error::BillNotFound)?;

        let cycle_key = DataKey::Cycle(bill.cycle_id);
        let mut cycle: BillCycle = env
            .storage()
            .persistent()
            .get(&cycle_key)
            .ok_or(Error::CycleNotFound)?;

        cycle.user.require_auth();

        if !cycle.is_active {
            return Err(Error::CycleNotActive);
        }

        let current_month = Self::get_current_month(&env);
        if cycle.last_adjustment_month == current_month {
            return Err(Error::MonthlyAdjustmentLimitReached);
        }

        if bill.is_recurring {
            let current_time = env.ledger().timestamp();

            // Skip to next month using proper calendar calculation
            let next_month_timestamp = Self::add_one_month(current_time)?;
            bill.last_paid_date = Some(next_month_timestamp);
            env.storage().persistent().set(&bill_key, &bill);
            Self::extend_ttl(&env, &bill_key);
        } else {
            env.storage().persistent().remove(&bill_key);

            let cycle_bills_key = DataKey::CycleBills(bill.cycle_id);
            let cycle_bills: Vec<u64> = env
                .storage()
                .persistent()
                .get(&cycle_bills_key)
                .unwrap_or(Vec::new(&env));

            let mut new_bills = Vec::new(&env);
            for id in cycle_bills.iter() {
                if id != bill_id {
                    new_bills.push_back(id);
                }
            }
            env.storage().persistent().set(&cycle_bills_key, &new_bills);
            Self::extend_ttl(&env, &cycle_bills_key);
        }

        cycle.last_adjustment_month = current_month;
        env.storage().persistent().set(&cycle_key, &cycle);
        Self::extend_ttl(&env, &cycle_key);

        events::BillCancelled { bill_id }.publish(&env);

        Ok(())
    }

    /// Delete a bill completely (all future occurrences)
    pub fn delete_bill(env: Env, bill_id: u64) -> Result<(), Error> {
        let bill_key = DataKey::Bill(bill_id);
        let bill: Bill = env
            .storage()
            .persistent()
            .get(&bill_key)
            .ok_or(Error::BillNotFound)?;

        let cycle_key = DataKey::Cycle(bill.cycle_id);
        let mut cycle: BillCycle = env
            .storage()
            .persistent()
            .get(&cycle_key)
            .ok_or(Error::CycleNotFound)?;

        cycle.user.require_auth();

        if !cycle.is_active {
            return Err(Error::CycleNotActive);
        }

        let current_month = Self::get_current_month(&env);
        if cycle.last_adjustment_month == current_month {
            return Err(Error::MonthlyAdjustmentLimitReached);
        }

        env.storage().persistent().remove(&bill_key);

        let cycle_bills_key = DataKey::CycleBills(bill.cycle_id);
        let cycle_bills: Vec<u64> = env
            .storage()
            .persistent()
            .get(&cycle_bills_key)
            .unwrap_or(Vec::new(&env));

        let mut new_bills = Vec::new(&env);
        for id in cycle_bills.iter() {
            if id != bill_id {
                new_bills.push_back(id);
            }
        }
        env.storage().persistent().set(&cycle_bills_key, &new_bills);
        Self::extend_ttl(&env, &cycle_bills_key);

        cycle.last_adjustment_month = current_month;
        env.storage().persistent().set(&cycle_key, &cycle);
        Self::extend_ttl(&env, &cycle_key);

        events::BillCancelled { bill_id }.publish(&env);

        Ok(())
    }

    // Helper Functions

    // Extend TTL for storage entries
    fn extend_ttl(env: &Env, key: &DataKey) {
        env.storage()
            .persistent()
            .extend_ttl(key, LEDGER_TTL_THRESHOLD, LEDGER_TTL_EXTEND);
    }

    // Calculate total amount allocated to existing bills in a cycle
    fn calculate_total_allocation(env: &Env, cycle_id: u64, cycle: &BillCycle) -> Result<i128, Error> {
        let cycle_bills_key = DataKey::CycleBills(cycle_id);
        let bill_ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&cycle_bills_key)
            .unwrap_or(Vec::new(&env));

        let mut total: i128 = 0;

        for bill_id in bill_ids.iter() {
            let bill_key = DataKey::Bill(bill_id);
            if let Some(bill) = env.storage().persistent().get::<DataKey, Bill>(&bill_key) {
                Self::extend_ttl(env, &bill_key);
                if bill.is_recurring {
                    let cycle_duration_days = (cycle.end_date - cycle.start_date) / 86400;
                    let occurrences = (cycle_duration_days / 30).max(1) as i128;
                    total += bill.amount * occurrences;
                } else {
                    total += bill.amount;
                }
            }
        }

        Ok(total)
    }

    // Validate that adding a new bill won't exceed available funds
    fn validate_allocation(
        env: &Env,
        cycle_id: u64,
        cycle: &BillCycle,
        new_bill_amount: i128,
        is_recurring: bool,
    ) -> Result<(), Error> {
        let existing_allocation = Self::calculate_total_allocation(env, cycle_id, cycle)?;

        let new_bill_cost = if is_recurring {
            let cycle_duration_days = (cycle.end_date - cycle.start_date) / 86400;
            let occurrences = (cycle_duration_days / 30).max(1) as i128;
            new_bill_amount * occurrences
        } else {
            new_bill_amount
        };

        let total_allocation = existing_allocation + new_bill_cost;
        let available = cycle.total_deposited - cycle.operating_fee;

        if total_allocation > available {
            return Err(Error::InsufficientFunds);
        }

        Ok(())
    }

    // Require admin authentication - replaces the pattern: Self::admin() + require_auth()
    fn require_admin(env: &Env) -> Result<(), Error> {
        let admin = Self::admin(env.clone())?;
        admin.require_auth();
        Ok(())
    }

    // Get and increment cycle counter
    // IDs start from 1 instead of 0
    fn next_cycle_id(env: &Env) -> u64 {
        let counter: u64 = env
            .storage()
            .instance()
            .get(&DataKey::CycleCounter)
            .unwrap_or(0);
        let next_id = counter + 1;
        env.storage()
            .instance()
            .set(&DataKey::CycleCounter, &next_id);
        next_id
    }

    // Get and increment bill counter
    // IDs start from 1 instead of 0
    fn next_bill_id(env: &Env) -> u64 {
        let counter: u64 = env
            .storage()
            .instance()
            .get(&DataKey::BillCounter)
            .unwrap_or(0);
        let next_id = counter + 1;
        env.storage()
            .instance()
            .set(&DataKey::BillCounter, &next_id);
        next_id
    }

    fn validate_fee_percentage(fee_percentage: u32) -> Result<(), Error> {
        if fee_percentage < 100 || fee_percentage > 500 {
            return Err(Error::InvalidFeePercentage);
        }
        Ok(())
    }

    // Calculate operating fee
    fn calculate_fee(amount: i128, fee_percentage: u32) -> i128 {
        (amount * fee_percentage as i128) / 10000
    }

    /// Internal helper for ending cycles - shared logic for end_cycle and admin_end_cycle
    fn end_cycle_internal(env: &Env, cycle_id: u64, mut cycle: BillCycle, cycle_key: DataKey) -> Result<(), Error> {
        if !cycle.is_active {
            return Err(Error::CycleAlreadyEnded);
        }

        let cycle_bills_key = DataKey::CycleBills(cycle_id);
        let bill_ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&cycle_bills_key)
            .unwrap_or(Vec::new(env));

        let mut total_paid_bills: i128 = 0;
        for bill_id in bill_ids.iter() {
            let bill_key = DataKey::Bill(bill_id);
            if let Some(types::Bill {
                amount, is_paid, ..
            }) = env.storage().persistent().get(&bill_key)
            {
                Self::extend_ttl(env, &bill_key);
                if is_paid {
                    total_paid_bills += amount;
                }
            }
        }

        let surplus = cycle.total_deposited - cycle.operating_fee - total_paid_bills;

        cycle.is_active = false;
        env.storage().persistent().set(&cycle_key, &cycle);
        Self::extend_ttl(env, &cycle_key);

        if surplus > 0 {
            let usdc_token = Self::usdc_token(env)?;
            let token_client = token::TokenClient::new(env, &usdc_token);
            token_client.transfer(&env.current_contract_address(), &cycle.user, &surplus);
        }

        events::CycleEnded { cycle_id, surplus }.publish(env);

        Ok(())
    }

    // Get current month in YYYYMM format using time crate
    fn get_current_month(env: &Env) -> u32 {
        let timestamp = env.ledger().timestamp() as i64;
        let datetime = OffsetDateTime::from_unix_timestamp(timestamp).unwrap();

        let year = datetime.year() as u32;
        let month = datetime.month() as u32;

        year * 100 + month
    }

    // Add one month to a timestamp, preserving the day of month where possible
    fn add_one_month(timestamp: u64) -> Result<u64, Error> {
        use time::Month;

        let datetime = OffsetDateTime::from_unix_timestamp(timestamp as i64)
            .ok().ok_or(Error::InvalidTimestamp)?;

        let current_month = datetime.month();
        let current_year = datetime.year();
        let current_day = datetime.day();

        // Calculate next month
        let (next_month, next_year) = if current_month == Month::December {
            (Month::January, current_year + 1)
        } else {
            (current_month.next(), current_year)
        };

        // Get the number of days in the next month
        let days_in_next_month = next_month.length(next_year);

        // Use the same day, or the last day of next month if current day doesn't exist
        let next_day = if current_day > days_in_next_month {
            days_in_next_month
        } else {
            current_day
        };

        // Create new datetime with same time but next month
        let next_datetime = datetime
            .replace_year(next_year).ok().ok_or(Error::InvalidTimestamp)?
            .replace_month(next_month).ok().ok_or(Error::InvalidTimestamp)?
            .replace_day(next_day).ok().ok_or(Error::InvalidTimestamp)?;

        Ok(next_datetime.unix_timestamp() as u64)
    }

    // Validate that due date is at least 7 days in future
    fn validate_lead_time(env: &Env, due_date: u64) -> Result<(), Error> {
        let current_time = env.ledger().timestamp();
        let min_lead_time = 7 * 24 * 60 * 60; // 7 days in seconds

        if due_date < current_time + min_lead_time {
            return Err(Error::BillLeadTimeTooShort);
        }
        Ok(())
    }

    // Validate bill due date is on day 1-28 of month using time crate
    // This ensures recurring bills can always fall on the same day each month (even February)
    fn validate_day_of_month(due_date: u64) -> Result<(), Error> {
        let datetime = OffsetDateTime::from_unix_timestamp(due_date as i64).unwrap();
        let day = datetime.day();

        if day > 28 {
            return Err(Error::InvalidDueDate);
        }

        Ok(())
    }

    /// Skip the current month's payment for multiple bills
    pub fn skip_bills(env: Env, bill_ids: Vec<u64>) -> Result<(), Error> {
        if bill_ids.is_empty() {
            return Err(Error::InvalidBillAmount);
        }

        let first_bill_key = DataKey::Bill(bill_ids.get(0).unwrap());
        let first_bill: Bill = env
            .storage()
            .persistent()
            .get(&first_bill_key)
            .ok_or(Error::BillNotFound)?;

        let cycle_key = DataKey::Cycle(first_bill.cycle_id);
        let mut cycle: BillCycle = env
            .storage()
            .persistent()
            .get(&cycle_key)
            .ok_or(Error::CycleNotFound)?;

        cycle.user.require_auth();

        if !cycle.is_active {
            return Err(Error::CycleNotActive);
        }

        let current_month = Self::get_current_month(&env);
        if cycle.last_adjustment_month == current_month {
            return Err(Error::MonthlyAdjustmentLimitReached);
        }

        for bill_id in bill_ids.iter() {
            let bill_key = DataKey::Bill(bill_id);
            let bill: Bill = env
                .storage()
                .persistent()
                .get(&bill_key)
                .ok_or(Error::BillNotFound)?;

            if bill.cycle_id != first_bill.cycle_id {
                return Err(Error::InvalidDueDate);
            }
        }

        let current_time = env.ledger().timestamp();
        const SECONDS_IN_MONTH: u64 = 30 * 86400;

        let mut bills_to_remove = Vec::new(&env);

        for bill_id in bill_ids.iter() {
            let bill_key = DataKey::Bill(bill_id);
            let mut bill: Bill = env
                .storage()
                .persistent()
                .get(&bill_key)
                .ok_or(Error::BillNotFound)?;

            if bill.is_recurring {
                bill.last_paid_date = Some(current_time + SECONDS_IN_MONTH);
                env.storage().persistent().set(&bill_key, &bill);
                Self::extend_ttl(&env, &bill_key);
            } else {
                bills_to_remove.push_back(bill_id);
            }

            events::BillCancelled { bill_id }.publish(&env);
        }

        if !bills_to_remove.is_empty() {
            let cycle_bills_key = DataKey::CycleBills(first_bill.cycle_id);
            let cycle_bills: Vec<u64> = env
                .storage()
                .persistent()
                .get(&cycle_bills_key)
                .unwrap_or(Vec::new(&env));

            let mut new_bills = Vec::new(&env);
            for id in cycle_bills.iter() {
                let mut should_remove = false;
                for remove_id in bills_to_remove.iter() {
                    if id == remove_id {
                        should_remove = true;
                        break;
                    }
                }

                if !should_remove {
                    new_bills.push_back(id);
                } else {
                    let bill_key = DataKey::Bill(id);
                    env.storage().persistent().remove(&bill_key);
                }
            }

            env.storage().persistent().set(&cycle_bills_key, &new_bills);
            Self::extend_ttl(&env, &cycle_bills_key);
        }

        cycle.last_adjustment_month = current_month;
        env.storage().persistent().set(&cycle_key, &cycle);
        Self::extend_ttl(&env, &cycle_key);

        Ok(())
    }

    /// Delete multiple bills completely (all future occurrences)
    pub fn delete_bills(env: Env, bill_ids: Vec<u64>) -> Result<(), Error> {
        if bill_ids.is_empty() {
            return Err(Error::InvalidBillAmount);
        }

        let first_bill_key = DataKey::Bill(bill_ids.get(0).unwrap());
        let first_bill: Bill = env
            .storage()
            .persistent()
            .get(&first_bill_key)
            .ok_or(Error::BillNotFound)?;

        let cycle_key = DataKey::Cycle(first_bill.cycle_id);
        let mut cycle: BillCycle = env
            .storage()
            .persistent()
            .get(&cycle_key)
            .ok_or(Error::CycleNotFound)?;

        cycle.user.require_auth();

        if !cycle.is_active {
            return Err(Error::CycleNotActive);
        }

        let current_month = Self::get_current_month(&env);
        if cycle.last_adjustment_month == current_month {
            return Err(Error::MonthlyAdjustmentLimitReached);
        }

        for bill_id in bill_ids.iter() {
            let bill_key = DataKey::Bill(bill_id);
            let bill: Bill = env
                .storage()
                .persistent()
                .get(&bill_key)
                .ok_or(Error::BillNotFound)?;

            if bill.cycle_id != first_bill.cycle_id {
                return Err(Error::InvalidDueDate);
            }
        }

        let cycle_bills_key = DataKey::CycleBills(first_bill.cycle_id);
        let cycle_bills: Vec<u64> = env
            .storage()
            .persistent()
            .get(&cycle_bills_key)
            .unwrap_or(Vec::new(&env));

        let mut new_bills = Vec::new(&env);
        for id in cycle_bills.iter() {
            let mut should_remove = false;
            for bill_id in bill_ids.iter() {
                if id == bill_id {
                    should_remove = true;
                    break;
                }
            }

            if !should_remove {
                new_bills.push_back(id);
            } else {
                let bill_key = DataKey::Bill(id);
                env.storage().persistent().remove(&bill_key);
                events::BillCancelled { bill_id: id }.publish(&env);
            }
        }

        env.storage().persistent().set(&cycle_bills_key, &new_bills);
        Self::extend_ttl(&env, &cycle_bills_key);

        cycle.last_adjustment_month = current_month;
        env.storage().persistent().set(&cycle_key, &cycle);
        Self::extend_ttl(&env, &cycle_key);

        Ok(())
    }
}