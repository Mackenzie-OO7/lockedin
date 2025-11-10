use soroban_sdk::{contractevent, Address};

// admin events
#[contractevent]
pub struct AdminTransferInitiated {
    pub new_admin: Address,
}

#[contractevent]
pub struct AdminTransferred {
    pub new_admin: Address,
}

#[contractevent]
pub struct FeeRecipientUpdated {
    pub recipient: Address,
}

// billing cycle events
#[contractevent]
pub struct CycleCreated {
    pub cycle_id: u64,
    pub user: Address,
}

#[contractevent]
pub struct CycleEnded {
    pub cycle_id: u64,
    pub surplus: i128,
}

// bill events
#[contractevent]
pub struct BillAdded {
    pub bill_id: u64,
    pub cycle_id: u64,
}

#[contractevent]
pub struct BillPaid {
    pub bill_id: u64,
    pub amount: i128,
}

#[contractevent]
pub struct BillCancelled {
    pub bill_id: u64,
}