use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    // Authorization errors
    Unauthorized = 1,
    AdminNotSet = 2,

    // Cycle errors
    CycleNotFound = 10,
    CycleAlreadyExists = 11,
    CycleNotActive = 12,
    CycleAlreadyEnded = 13,
    InvalidCycleDuration = 14,
    InsufficientFunds = 15,

    // Bill errors
    BillNotFound = 20,
    BillAlreadyPaid = 21,
    InvalidBillAmount = 22,
    InvalidDueDate = 23,
    BillLeadTimeTooShort = 24,
    EmergencyBillLimitExceeded = 25,
    MonthlyAdjustmentLimitReached = 26,
    InvalidRecurrence = 27,

    // Time-lock errors
    CycleNotEnded = 30,
    EarlyWithdrawalNotAllowed = 31,
    BillNotDueYet = 32,

    // Admin transfer errors
    NoPendingAdminTransfer = 40,
    AdminTransferExpired = 41,

    // Input validation errors
    InvalidFeePercentage = 50,
    InvalidAddress = 51,
    InvalidTimestamp = 52,

    // Security errors
    Reentrancy = 60,
}