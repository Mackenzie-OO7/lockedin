use soroban_sdk::{contracttype, Address, String, Vec};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BillCycle {
    pub user: Address,
    pub start_date: u64,
    pub end_date: u64,
    pub total_deposited: i128,
    pub operating_fee: i128,
    pub fee_percentage: u32,
    pub is_active: bool,
    pub last_adjustment_month: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Bill {
    pub id: u64,
    pub cycle_id: u64,
    pub name: String,
    pub amount: i128,
    pub due_date: u64,
    pub is_paid: bool,
    pub is_recurring: bool,
    pub recurrence_calendar: Vec<u32>, // List of months (1-12) when bill recurs
    pub is_emergency: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    PendingAdmin,
    TransferExpiry,
    UsdcToken,
    FeeRecipient,
    FeePercentage,
    CycleCounter,
    BillCounter,
    Cycle(u64),           // cycle_id -> BillCycle
    Bill(u64),            // bill_id -> Bill
    UserCycles(Address),
    CycleBills(u64),
}
