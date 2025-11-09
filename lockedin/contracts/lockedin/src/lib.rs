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

        // Add to global cycles list (for admin/keeper access)
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

    // Admin-only: Get all cycle IDs across all users (for keeper service)
    pub fn get_all_cycles(env: Env) -> Result<Vec<u64>, Error> {
        let admin = Self::admin(env.clone())?;
        admin.require_auth();

        let all_cycles_key = DataKey::AllCycles;

        // Check if key exists before extending TTL
        if env.storage().persistent().has(&all_cycles_key) {
            Self::extend_ttl(&env, &all_cycles_key);
        }

        Ok(env
            .storage()
            .persistent()
            .get(&all_cycles_key)
            .unwrap_or(Vec::new(&env)))
    }

    // User ends their own cycle - only after end_date has passed
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

        // Calculate total PAID bills only
        let mut total_paid_bills: i128 = 0;
        for bill_id in bill_ids.iter() {
            let bill_key = DataKey::Bill(bill_id);
            if let Some(types::Bill {
                amount, is_paid, ..
            }) = env.storage().persistent().get(&bill_key)
            {
                if is_paid {
                    total_paid_bills += amount;
                }
            }
        }

        // Surplus = deposit - fee - paid bills
        let surplus = cycle.total_deposited - cycle.operating_fee - total_paid_bills;

        if surplus > 0 {
            let usdc_token = Self::usdc_token(&env);
            let token_client = token::TokenClient::new(&env, &usdc_token);
            token_client.transfer(&env.current_contract_address(), &cycle.user, &surplus);
        }

        cycle.is_active = false;
        env.storage().persistent().set(&cycle_key, &cycle);
        Self::extend_ttl(&env, &cycle_key);

        events::CycleEnded { cycle_id, surplus }.publish(&env);

        Ok(())
    }

    // Admin force-ends any cycle - can be called anytime, ignores end_date
    pub fn admin_end_cycle(env: Env, cycle_id: u64) -> Result<(), Error> {
        let admin = Self::admin(env.clone())?;
        admin.require_auth();

        let cycle_key = DataKey::Cycle(cycle_id);
        let mut cycle: BillCycle = env
            .storage()
            .persistent()
            .get(&cycle_key)
            .ok_or(Error::CycleNotFound)?;

        if !cycle.is_active {
            return Err(Error::CycleAlreadyEnded);
        }

        let cycle_bills_key = DataKey::CycleBills(cycle_id);
        let bill_ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&cycle_bills_key)
            .unwrap_or(Vec::new(&env));

        // Calculate total PAID bills only
        let mut total_paid_bills: i128 = 0;
        for bill_id in bill_ids.iter() {
            let bill_key = DataKey::Bill(bill_id);
            if let Some(types::Bill {
                amount, is_paid, ..
            }) = env.storage().persistent().get(&bill_key)
            {
                if is_paid {
                    total_paid_bills += amount;
                }
            }
        }

        // Surplus = deposit - fee - paid bills
        let surplus = cycle.total_deposited - cycle.operating_fee - total_paid_bills;

        if surplus > 0 {
            let usdc_token = Self::usdc_token(&env);
            let token_client = token::TokenClient::new(&env, &usdc_token);
            token_client.transfer(&env.current_contract_address(), &cycle.user, &surplus);
        }

        cycle.is_active = false;
        env.storage().persistent().set(&cycle_key, &cycle);
        Self::extend_ttl(&env, &cycle_key);

        events::CycleEnded { cycle_id, surplus }.publish(&env);

        Ok(())
    }

    // Bill Management

    // Add a single bill to a cycle
    // No monthly limit - users can add bills freely
    pub fn add_bill(
        env: Env,
        cycle_id: u64,
        name: String,
        amount: i128,
        due_date: u64,
        is_recurring: bool,
        recurrence_calendar: Vec<u32>,
    ) -> Result<u64, Error> {
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

        if amount <= 0 {
            return Err(Error::InvalidBillAmount);
        }

        if due_date < cycle.start_date || due_date > cycle.end_date {
            return Err(Error::InvalidDueDate);
        }

        // Validate lead time (7 days minimum before due date)
        Self::validate_lead_time(&env, due_date)?;

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
            last_paid_date: None,
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

        events::BillAdded { bill_id, cycle_id }.publish(&env);

        Ok(bill_id)
    }

    // Add multiple bills in a single transaction
    // No monthly limit - users can add bills freely
    pub fn add_bills(
        env: Env,
        cycle_id: u64,
        bills: Vec<(String, i128, u64, bool, Vec<u32>)>, // (name, amount, due_date, is_recurring, recurrence_calendar)
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

        for (name, amount, due_date, is_recurring, recurrence_calendar) in bills.iter() {
            if amount <= 0 {
                return Err(Error::InvalidBillAmount);
            }

            if due_date < cycle.start_date || due_date > cycle.end_date {
                return Err(Error::InvalidDueDate);
            }

            Self::validate_lead_time(&env, due_date)?;

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
                last_paid_date: None,
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
    // User can call ONLY on exact due date (same calendar day)
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

        // Only cycle owner can trigger payment
        // Payment can only happen on exact due date (same calendar day)
        cycle.user.require_auth();

        // Verify cycle is active
        if !cycle.is_active {
            return Err(Error::CycleNotActive);
        }

        let current_time = env.ledger().timestamp();
        let bill_due_day_start = (bill.due_date / 86400) * 86400;
        let current_day_start = (current_time / 86400) * 86400;

        // Can only pay on exact due date
        if current_day_start != bill_due_day_start {
            return Err(Error::BillNotDueYet);
        }

        // Transfer USDC from contract to user's wallet
        let usdc_token = Self::usdc_token(&env);
        let token_client = token::TokenClient::new(&env, &usdc_token);
        token_client.transfer(&env.current_contract_address(), &cycle.user, &bill.amount);

        // Handle recurring bills - reschedule if not end of cycle
        if bill.is_recurring {
            // Calculate next due date (same day next month)
            const SECONDS_IN_DAY: u64 = 86400;
            const AVERAGE_DAYS_IN_MONTH: u64 = 30;

            let next_due_date = bill.due_date + (AVERAGE_DAYS_IN_MONTH * SECONDS_IN_DAY);

            // Only reschedule if next occurrence is before cycle ends
            if next_due_date < cycle.end_date {
                bill.due_date = next_due_date;
                bill.is_paid = false; // Reset for next occurrence
            } else {
                // Last occurrence - mark as paid
                bill.is_paid = true;
            }
        } else {
            // One-time bill - mark as paid
            bill.is_paid = true;
        }

        env.storage().persistent().set(&bill_key, &bill);
        Self::extend_ttl(&env, &bill_key);

        events::BillPaid {
            bill_id,
            amount: bill.amount,
        }
        .publish(&env);

        Ok(())
    }

    // Admin pays any bill for any user - used by keeper service for automation
    // Admin can pay anytime (no due date restriction)
    pub fn admin_pay_bill(env: Env, bill_id: u64) -> Result<(), Error> {
        let admin = Self::admin(env.clone())?;
        admin.require_auth();

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

        // Verify cycle is active
        if !cycle.is_active {
            return Err(Error::CycleNotActive);
        }

        // Transfer USDC from contract to user's wallet
        let usdc_token = Self::usdc_token(&env);
        let token_client = token::TokenClient::new(&env, &usdc_token);
        token_client.transfer(&env.current_contract_address(), &cycle.user, &bill.amount);

        // Handle recurring bills - reschedule if not end of cycle
        if bill.is_recurring {
            // Calculate next due date (same day next month)
            const SECONDS_IN_DAY: u64 = 86400;
            const AVERAGE_DAYS_IN_MONTH: u64 = 30;

            let next_due_date = bill.due_date + (AVERAGE_DAYS_IN_MONTH * SECONDS_IN_DAY);

            // Only reschedule if next occurrence is before cycle ends
            if next_due_date < cycle.end_date {
                bill.due_date = next_due_date;
                bill.is_paid = false; // Reset for next occurrence
            } else {
                // Last occurrence - mark as paid
                bill.is_paid = true;
            }
        } else {
            // One-time bill - mark as paid
            bill.is_paid = true;
        }

        env.storage().persistent().set(&bill_key, &bill);
        Self::extend_ttl(&env, &bill_key);

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

    // Validate bill due date is on day 1-28 of month
    // This ensures recurring bills can always fall on the same day each month (even February)
    fn validate_day_of_month(due_date: u64) -> Result<(), Error> {
        const SECONDS_IN_DAY: u64 = 86400;

        // Get day of month from timestamp
        // We need to calculate which day of the month this timestamp represents
        let days_since_epoch = due_date / SECONDS_IN_DAY;

        // Calculate year and month to determine day of month
        let mut remaining_days = days_since_epoch;
        let mut year = 1970u32;

        // Subtract complete years
        loop {
            let days_in_year = if Self::is_leap_year(year) { 366 } else { 365 };
            if remaining_days >= days_in_year {
                remaining_days -= days_in_year;
                year += 1;
            } else {
                break;
            }
        }

        // Subtract complete months to find day of month
        let days_in_months = if Self::is_leap_year(year) {
            [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        } else {
            [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        };

        for &days_in_month in days_in_months.iter() {
            if remaining_days >= days_in_month as u64 {
                remaining_days -= days_in_month as u64;
            } else {
                break;
            }
        }

        // remaining_days is now the day of month (0-indexed)
        let day_of_month = remaining_days + 1;  // Convert to 1-indexed

        // Validate day is between 1 and 28
        if day_of_month < 1 || day_of_month > 28 {
            return Err(Error::InvalidDueDate);
        }

        Ok(())
    }

    // Check if a year is a leap year
    fn is_leap_year(year: u32) -> bool {
        (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
    }

    // Cancel multiple bills in a single transaction
    // Subject to monthly adjustment limit - can only do this once per month
    pub fn cancel_bills(env: Env, bill_ids: Vec<u64>) -> Result<(), Error> {
        if bill_ids.is_empty() {
            return Err(Error::InvalidBillAmount); // Reusing error, could add EmptyBillList error
        }

        // Get first bill to determine cycle and verify ownership
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

        // Check monthly adjustment limit
        let current_month = Self::get_current_month(&env);
        if cycle.last_adjustment_month == current_month {
            return Err(Error::MonthlyAdjustmentLimitReached);
        }

        // Verify all bills belong to the same cycle
        for bill_id in bill_ids.iter() {
            let bill_key = DataKey::Bill(bill_id);
            let bill: Bill = env
                .storage()
                .persistent()
                .get(&bill_key)
                .ok_or(Error::BillNotFound)?;

            if bill.cycle_id != first_bill.cycle_id {
                return Err(Error::InvalidDueDate); // Reusing error, could add BillFromDifferentCycle
            }

            if bill.is_paid {
                return Err(Error::BillAlreadyPaid);
            }
        }

        // Remove all bills
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
                // Remove bill from storage
                let bill_key = DataKey::Bill(id);
                env.storage().persistent().remove(&bill_key);
                events::BillCancelled { bill_id: id }.publish(&env);
            }
        }

        env.storage().persistent().set(&cycle_bills_key, &new_bills);
        Self::extend_ttl(&env, &cycle_bills_key);

        // Update last adjustment month
        cycle.last_adjustment_month = current_month;
        env.storage().persistent().set(&cycle_key, &cycle);
        Self::extend_ttl(&env, &cycle_key);

        Ok(())
    }
}
