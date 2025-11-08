#![no_std]

mod error;
mod events;
mod test;
mod types;

use soroban_sdk::{contract, contractimpl, token, Address, Env, String, Vec};

use error::Error;
use types::{Bill, BillCycle, DataKey};

const DAY_IN_LEDGERS: u32 = 17280; // ~24 hours
const LEDGER_TTL_THRESHOLD: u32 = DAY_IN_LEDGERS * 30; // 30 days
const LEDGER_TTL_EXTEND: u32 = DAY_IN_LEDGERS * 365; // 1 year

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
        env.storage().instance().set(&DataKey::FeeRecipient, &admin); // Default to admin
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

    /// Initiate admin transfer (step 1 of 2-step transfer)
    pub fn transfer_admin(
        env: Env,
        new_admin: Address,
        live_until_ledger: u32,
    ) -> Result<(), Error> {
        let current_admin = Self::admin(env.clone())?;
        current_admin.require_auth();

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

    /// Accept admin transfer (step 2 of 2-step transfer)
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

    pub fn set_fee_recipient(env: Env, recipient: Address) -> Result<(), Error> {
        let admin = Self::admin(env.clone())?;
        admin.require_auth();

        env.storage()
            .instance()
            .set(&DataKey::FeeRecipient, &recipient);

        events::FeeRecipientUpdated {
            recipient: recipient.clone(),
        }
        .publish(&env);

        Ok(())
    }

    pub fn fee_recipient(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::FeeRecipient)
            .unwrap()
    }

    pub fn set_usdc_token(env: Env, usdc_token: Address) -> Result<(), Error> {
        let admin = Self::admin(env.clone())?;
        admin.require_auth();

        env.storage()
            .instance()
            .set(&DataKey::UsdcToken, &usdc_token);

        Ok(())
    }

    pub fn get_usdc_token(env: Env) -> Address {
        env.storage().instance().get(&DataKey::UsdcToken).unwrap()
    }

    // Set the global fee percentage
    pub fn set_fee_percentage(env: Env, fee_percentage: u32) -> Result<(), Error> {
        let admin = Self::admin(env.clone())?;
        admin.require_auth();

        Self::validate_fee_percentage(fee_percentage)?;

        env.storage()
            .instance()
            .set(&DataKey::FeePercentage, &fee_percentage);

        Ok(())
    }

    // Get the global fee percentage
    pub fn get_fee_percentage(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::FeePercentage)
            .unwrap()
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

        let fee_percentage = Self::get_fee_percentage(env.clone());

        let operating_fee = Self::calculate_fee(amount, fee_percentage);
        let current_time = env.ledger().timestamp();
        let duration_seconds = duration_months as u64 * 30 * 24 * 60 * 60; // ~30 days per month
        let end_date = current_time + duration_seconds;

        let cycle_id = Self::next_cycle_id(&env);
        let cycle = BillCycle {
            user: user.clone(),
            start_date: current_time,
            end_date,
            total_deposited: amount,
            operating_fee,
            fee_percentage,
            is_active: true,
            last_adjustment_month: Self::get_current_month(&env),
        };

        let cycle_key = DataKey::Cycle(cycle_id);
        env.storage().persistent().set(&cycle_key, &cycle);
        Self::extend_ttl(&env, &cycle_key);

        let user_cycles_key = DataKey::UserCycles(user.clone());
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

        let cycle_bills_key = DataKey::CycleBills(cycle_id);
        let empty_bills: Vec<u64> = Vec::new(&env);
        env.storage()
            .persistent()
            .set(&cycle_bills_key, &empty_bills);
        Self::extend_ttl(&env, &cycle_bills_key);

        let usdc_token = Self::usdc_token(&env);
        let token_client = token::TokenClient::new(&env, &usdc_token);
        token_client.transfer(&user, &env.current_contract_address(), &amount);

        let fee_recipient = Self::fee_recipient(env.clone());
        token_client.transfer(
            &env.current_contract_address(),
            &fee_recipient,
            &operating_fee,
        );

        events::CycleCreated {
            cycle_id,
            user: user.clone(),
        }
        .publish(&env);

        Ok(cycle_id)
    }

    pub fn get_cycle(env: Env, cycle_id: u64) -> Result<BillCycle, Error> {
        let cycle_key = DataKey::Cycle(cycle_id);
        Self::extend_ttl(&env, &cycle_key);
        env.storage()
            .persistent()
            .get(&cycle_key)
            .ok_or(Error::CycleNotFound)
    }

    pub fn get_user_cycles(env: Env, user: Address) -> Vec<u64> {
        let user_cycles_key = DataKey::UserCycles(user);
        Self::extend_ttl(&env, &user_cycles_key);
        env.storage()
            .persistent()
            .get(&user_cycles_key)
            .unwrap_or(Vec::new(&env))
    }

    pub fn end_cycle(env: Env, cycle_id: u64) -> Result<(), Error> {
        let cycle_key = DataKey::Cycle(cycle_id);
        let mut cycle: BillCycle = env
            .storage()
            .persistent()
            .get(&cycle_key)
            .ok_or(Error::CycleNotFound)?;

        cycle.user.require_auth();

        let current_time = env.ledger().timestamp();
        if current_time < cycle.end_date {
            return Err(Error::CycleNotEnded);
        }

        if !cycle.is_active {
            return Err(Error::CycleAlreadyEnded);
        }

        let cycle_bills_key = DataKey::CycleBills(cycle_id);
        let bill_ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&cycle_bills_key)
            .unwrap_or(Vec::new(&env));

        let mut total_bills: i128 = 0;
        for bill_id in bill_ids.iter() {
            let bill_key = DataKey::Bill(bill_id);
            if let Some(types::Bill { amount, .. }) = env.storage().persistent().get(&bill_key) {
                total_bills += amount;
            }
        }

        let surplus = cycle.total_deposited - cycle.operating_fee - total_bills;

        if surplus > 0 {
            let usdc_token = Self::usdc_token(&env);
            let token_client = token::TokenClient::new(&env, &usdc_token);
            token_client.transfer(&env.current_contract_address(), &cycle.user, &surplus);
        }

        cycle.is_active = false;
        env.storage().persistent().set(&cycle_key, &cycle);

        events::CycleEnded { cycle_id, surplus }.publish(&env);

        Ok(())
    }

    // Bill Management

    pub fn add_bill(
        env: Env,
        cycle_id: u64,
        name: String,
        amount: i128,
        due_date: u64,
        is_recurring: bool,
        recurrence_calendar: Vec<u32>,
        is_emergency: bool,
    ) -> Result<u64, Error> {
        let cycle_key = DataKey::Cycle(cycle_id);
        let mut cycle: BillCycle = env
            .storage()
            .persistent()
            .get(&cycle_key)
            .ok_or(Error::CycleNotFound)?;

        cycle.user.require_auth();

        if !cycle.is_active {
            return Err(Error::CycleNotActive);
        }

        if amount <= 0 {
            return Err(Error::InvalidBillAmount);
        }

        if due_date < cycle.start_date || due_date > cycle.end_date {
            return Err(Error::InvalidDueDate);
        }

        if is_emergency {
            // Emergency bills: Check monthly adjustment limit + special validation
            let current_month = Self::get_current_month(&env);
            if cycle.last_adjustment_month == current_month {
                return Err(Error::MonthlyAdjustmentLimitReached);
            }
            Self::validate_emergency_bill(&env, cycle_id, amount, cycle.total_deposited)?;
        } else {
            // Regular bills: Only validate lead time (no monthly limit)
            Self::validate_lead_time(&env, due_date)?;
        }

        // Validate recurrence calendar
        if is_recurring {
            for month in recurrence_calendar.iter() {
                if month < 1 || month > 12 {
                    return Err(Error::InvalidRecurrence);
                }
            }
        }

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
            is_emergency,
        };

        let bill_key = DataKey::Bill(bill_id);
        env.storage().persistent().set(&bill_key, &bill);
        Self::extend_ttl(&env, &bill_key);

        let cycle_bills_key = DataKey::CycleBills(cycle_id);
        let mut cycle_bills: Vec<u64> = env
            .storage()
            .persistent()
            .get(&cycle_bills_key)
            .unwrap_or(Vec::new(&env));
        cycle_bills.push_back(bill_id);
        env.storage()
            .persistent()
            .set(&cycle_bills_key, &cycle_bills);
        Self::extend_ttl(&env, &cycle_bills_key);

        // Update cycle's last adjustment month (only for emergency bills)
        if is_emergency {
            let current_month = Self::get_current_month(&env);
            cycle.last_adjustment_month = current_month;
            env.storage().persistent().set(&cycle_key, &cycle);
        }

        events::BillAdded { bill_id, cycle_id }.publish(&env);

        Ok(bill_id)
    }

    pub fn get_bill(env: Env, bill_id: u64) -> Result<Bill, Error> {
        let bill_key = DataKey::Bill(bill_id);
        Self::extend_ttl(&env, &bill_key);
        env.storage()
            .persistent()
            .get(&bill_key)
            .ok_or(Error::BillNotFound)
    }

    pub fn get_cycle_bills(env: Env, cycle_id: u64) -> Vec<u64> {
        let cycle_bills_key = DataKey::CycleBills(cycle_id);
        Self::extend_ttl(&env, &cycle_bills_key);
        env.storage()
            .persistent()
            .get(&cycle_bills_key)
            .unwrap_or(Vec::new(&env))
    }

    // Sends funds back to user's wallet
    pub fn pay_bill(env: Env, bill_id: u64) -> Result<(), Error> {
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

        cycle.user.require_auth();

        let current_time = env.ledger().timestamp();
        if current_time < bill.due_date {
            return Err(Error::BillNotDueYet);
        }

        // Transfer USDC from contract to user's wallet
        let usdc_token = Self::usdc_token(&env);
        let token_client = token::TokenClient::new(&env, &usdc_token);
        token_client.transfer(&env.current_contract_address(), &cycle.user, &bill.amount);

        bill.is_paid = true;
        env.storage().persistent().set(&bill_key, &bill);

        events::BillPaid {
            bill_id,
            amount: bill.amount,
        }
        .publish(&env);

        Ok(())
    }

    // Can only be done within monthly adjustment limit
    pub fn cancel_bill(env: Env, bill_id: u64) -> Result<(), Error> {
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

        cycle.last_adjustment_month = current_month;
        env.storage().persistent().set(&cycle_key, &cycle);

        events::BillCancelled { bill_id }.publish(&env);

        Ok(())
    }

    // Helper Functiond

    // Extend TTL for storage entries
    fn extend_ttl(env: &Env, key: &DataKey) {
        env.storage()
            .persistent()
            .extend_ttl(key, LEDGER_TTL_THRESHOLD, LEDGER_TTL_EXTEND);
    }

    // Get USDC token address
    fn usdc_token(env: &Env) -> Address {
        env.storage().instance().get(&DataKey::UsdcToken).unwrap()
    }

    // Get and increment cycle counter
    fn next_cycle_id(env: &Env) -> u64 {
        let counter: u64 = env
            .storage()
            .instance()
            .get(&DataKey::CycleCounter)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::CycleCounter, &(counter + 1));
        counter
    }

    // Get and increment bill counter
    fn next_bill_id(env: &Env) -> u64 {
        let counter: u64 = env
            .storage()
            .instance()
            .get(&DataKey::BillCounter)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::BillCounter, &(counter + 1));
        counter
    }

    // Validate fee percentage (100-500 basis points = 1-5%)
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

    // Get current month in YYYYMM format
    fn get_current_month(env: &Env) -> u32 {
        let timestamp = env.ledger().timestamp();
        // Simplified conversion - in production you'd use proper date library
        let year = 2024 + ((timestamp / 31536000) as u32);
        let month = ((timestamp % 31536000) / 2628000) as u32 + 1;
        year * 100 + month
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

    // Validate emergency bill (max 10% of total deposited, 2x fee)
    fn validate_emergency_bill(
        env: &Env,
        cycle_id: u64,
        amount: i128,
        total_deposited: i128,
    ) -> Result<(), Error> {
        let cycle_bills_key = DataKey::CycleBills(cycle_id);
        let bill_ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&cycle_bills_key)
            .unwrap_or(Vec::new(env));

        let mut total_emergency: i128 = 0;
        for bill_id in bill_ids.iter() {
            let bill_key = DataKey::Bill(bill_id);
            if let Some(types::Bill {
                amount: bill_amt,
                is_emergency: true,
                ..
            }) = env.storage().persistent().get(&bill_key)
            {
                total_emergency += bill_amt;
            }
        }

        let max_emergency = total_deposited / 10; // 10%
        if total_emergency + amount > max_emergency {
            return Err(Error::EmergencyBillLimitExceeded);
        }

        Ok(())
    }
}
