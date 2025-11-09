# LockedIn Smart Contract - Complete Function Documentation

## Table of Contents
1. [Data Structures](#data-structures)
2. [Admin Functions](#admin-functions)
3. [Cycle Management](#cycle-management)
4. [Bill Management](#bill-management)
5. [Payment Functions](#payment-functions)
6. [Query Functions](#query-functions)
7. [Helper Functions](#helper-functions)
8. [Security Considerations](#security-considerations)
9. [Function Interaction Flow](#function-interaction-flow)

---

## Data Structures

### BillCycle
```rust
pub struct BillCycle {
    pub user: Address,              // Owner of the cycle
    pub start_date: u64,            // Unix timestamp (seconds)
    pub end_date: u64,              // Unix timestamp (seconds)
    pub total_deposited: i128,      // Amount in stroops (1 USDC = 10,000,000 stroops)
    pub operating_fee: i128,        // Fee deducted at creation (in stroops)
    pub fee_percentage: u32,        // Fee percentage (e.g., 2 = 2%)
    pub is_active: bool,            // Whether cycle is active
    pub last_adjustment_month: u32, // Month number of last bill cancellation (for monthly limit)
}
```

**Purpose:** Represents a bill payment cycle where users lock funds for a specific duration.

**Key Invariants:**
- `end_date > start_date`
- `total_deposited > 0`
- `operating_fee = (total_deposited * fee_percentage) / 100`
- Once `is_active = false`, cycle cannot be reactivated

---

### Bill
```rust
pub struct Bill {
    pub id: u64,                        // Unique bill identifier
    pub cycle_id: u64,                  // Parent cycle ID
    pub name: String,                   // Bill name/description
    pub amount: i128,                   // Payment amount per occurrence (stroops)
    pub due_date: u64,                  // Unix timestamp of next payment
    pub is_paid: bool,                  // Payment status of CURRENT occurrence
    pub is_recurring: bool,             // Whether bill repeats
    pub recurrence_calendar: Vec<u32>,  // Months (1-12) when bill recurs
}
```

**Purpose:** Represents a bill payment obligation within a cycle.

**Key Invariants:**
- `amount > 0`
- `due_date` must be within cycle's `start_date` and `end_date`
- For recurring bills: `recurrence_calendar` contains month numbers 1-12
- `is_paid` represents CURRENT payment status, not all occurrences

**Important Behavior:**
- When a recurring bill is paid, `due_date` advances to next month
- If next occurrence is beyond cycle `end_date`, `is_paid` stays `true`
- If next occurrence is within cycle, `is_paid` resets to `false`

---

### DataKey (Storage Keys)
```rust
pub enum DataKey {
    Admin,                  // Address: Contract admin
    PendingAdmin,          // Address: Pending admin transfer
    TransferExpiry,        // u64: Admin transfer expiry timestamp
    UsdcToken,             // Address: USDC token contract
    FeeRecipient,          // Address: Fee recipient
    FeePercentage,         // u32: Global fee percentage
    CycleCounter,          // u64: Next cycle ID
    BillCounter,           // u64: Next bill ID
    Cycle(u64),            // cycle_id -> BillCycle
    Bill(u64),             // bill_id -> Bill
    UserCycles(Address),   // user -> Vec<cycle_id>
    CycleBills(u64),       // cycle_id -> Vec<bill_id>
    AllCycles,             // Vec<u64>: All cycle IDs (admin-only)
}
```

---

## Admin Functions

### 1. `initialize()`
```rust
pub fn initialize(
    env: Env,
    admin: Address,
    usdc_token: Address,
    fee_recipient: Address,
    fee_percentage: u32,
) -> Result<(), Error>
```

**Purpose:** Initialize contract with admin and configuration.

**Authorization:** None (can only be called once)

**Parameters:**
- `admin`: Initial admin address
- `usdc_token`: Address of USDC token contract on Stellar
- `fee_recipient`: Address to receive operating fees
- `fee_percentage`: Fee percentage (e.g., 2 for 2%)

**Effects:**
- Sets admin
- Sets USDC token address
- Sets fee recipient
- Sets fee percentage
- Initializes counters to 0

**Errors:**
- `AlreadyInitialized`: If already initialized

**Security:**
- Can only be called ONCE
- No authentication required for first call
- Subsequent calls will fail

**Interactions:** None (standalone initialization)

---

### 2. `propose_admin()`
```rust
pub fn propose_admin(env: Env, new_admin: Address) -> Result<(), Error>
```

**Purpose:** Propose a new admin (2-step transfer).

**Authorization:** Current admin only

**Parameters:**
- `new_admin`: Proposed new admin address

**Effects:**
- Sets `PendingAdmin` to `new_admin`
- Sets `TransferExpiry` to current time + 7 days (604800 seconds)

**Errors:**
- `Unauthorized`: If caller is not current admin

**Security:**
- Two-step process prevents accidental admin transfer
- 7-day time window for acceptance
- Old admin remains in control until `accept_admin()` is called

**Interactions:**
- Must be followed by `accept_admin()` from new admin
- Can be cancelled by calling `cancel_admin_transfer()`

---

### 3. `accept_admin()`
```rust
pub fn accept_admin(env: Env) -> Result<(), Error>
```

**Purpose:** Accept admin role (completes transfer).

**Authorization:** Pending admin only

**Parameters:** None (caller must be pending admin)

**Effects:**
- Sets `Admin` to caller address
- Removes `PendingAdmin`
- Removes `TransferExpiry`

**Errors:**
- `NoPendingAdmin`: If no admin transfer pending
- `TransferExpired`: If more than 7 days passed
- `Unauthorized`: If caller is not pending admin

**Security:**
- Time-bounded (7 days)
- Only proposed admin can accept
- Prevents admin hijacking

**Interactions:**
- Follows `propose_admin()`
- After this, new admin has full control

---

### 4. `cancel_admin_transfer()`
```rust
pub fn cancel_admin_transfer(env: Env) -> Result<(), Error>
```

**Purpose:** Cancel pending admin transfer.

**Authorization:** Current admin only

**Parameters:** None

**Effects:**
- Removes `PendingAdmin`
- Removes `TransferExpiry`

**Errors:**
- `Unauthorized`: If caller is not current admin

**Security:**
- Current admin can cancel at any time
- Prevents unwanted admin changes

**Interactions:**
- Cancels `propose_admin()`
- Returns to normal state

---

### 5. `admin()`
```rust
pub fn admin(env: Env) -> Result<Address, Error>
```

**Purpose:** Get current admin address.

**Authorization:** None (read-only)

**Returns:** Current admin address

**Errors:**
- `NotInitialized`: If contract not initialized

**Security:** Read-only, no side effects

---

### 6. `get_all_cycles()`
```rust
pub fn get_all_cycles(env: Env) -> Result<Vec<u64>, Error>
```

**Purpose:** Get all cycle IDs across all users (for keeper service).

**Authorization:** Admin only

**Returns:** Vector of all cycle IDs

**Errors:**
- `Unauthorized`: If caller is not admin

**Security:**
- Admin-only to prevent exposing all user cycles
- Used by keeper service to find bills due for payment

**Interactions:**
- Used by keeper service with `get_cycle_bills()` and `get_bill()`
- Critical for automated payment system

---

### 7. `admin_end_cycle()`
```rust
pub fn admin_end_cycle(env: Env, cycle_id: u64) -> Result<(), Error>
```

**Purpose:** Force-end any cycle regardless of end_date.

**Authorization:** Admin only

**Parameters:**
- `cycle_id`: Cycle to end

**Effects:**
1. Calculates surplus = `total_deposited - operating_fee - total_paid_bills`
2. If surplus > 0, transfers USDC from contract to cycle owner
3. Sets `is_active = false`
4. Publishes `CycleEnded` event

**Errors:**
- `Unauthorized`: If caller is not admin
- `CycleNotFound`: If cycle doesn't exist
- `CycleAlreadyEnded`: If cycle is already inactive

**Security:**
- **IMPORTANT:** Only counts PAID bills, not allocated bills
- If user allocated 1000 USDC but only 200 was paid, returns 800 - fee
- Admin can end cycle anytime (ignores `end_date`)

**Interactions:**
- Reads all bills via `get_cycle_bills()`
- Transfers USDC using token client
- Updates cycle storage

**Critical Calculation:**
```rust
surplus = total_deposited - operating_fee - total_paid_bills
```
- **NOT** `total_allocated_bills`
- User gets back money for unpaid bills

---

### 8. `admin_pay_bill()`
```rust
pub fn admin_pay_bill(env: Env, bill_id: u64) -> Result<(), Error>
```

**Purpose:** Pay any bill for any user (keeper automation).

**Authorization:** Admin only

**Parameters:**
- `bill_id`: Bill to pay

**Effects:**
1. Verifies bill is not already paid
2. Verifies cycle is active
3. Transfers `bill.amount` from contract to cycle owner
4. If recurring and next occurrence within cycle:
   - Updates `due_date` to +30 days
   - Sets `is_paid = false`
5. If one-time OR last occurrence:
   - Sets `is_paid = true`
6. Publishes `BillPaid` event

**Errors:**
- `Unauthorized`: If caller is not admin
- `BillNotFound`: If bill doesn't exist
- `BillAlreadyPaid`: If bill already paid
- `CycleNotFound`: If parent cycle doesn't exist
- `CycleNotActive`: If cycle is inactive

**Security:**
- **NO due date restriction** - admin can pay anytime
- Prevents double payment (`is_paid` check)
- Verifies cycle is active before payment

**Interactions:**
- Reads bill → cycle → user chain
- Transfers USDC using token client
- Updates bill storage

**Recurring Bill Logic:**
```rust
if is_recurring {
    next_due_date = due_date + (30 * 86400)  // +30 days
    if next_due_date < cycle.end_date {
        due_date = next_due_date
        is_paid = false  // Reset for next occurrence
    } else {
        is_paid = true   // Last occurrence
    }
}
```

**Critical Flow:**
1. Bill ID 5 due on Nov 15, recurring
2. Admin pays on Nov 15
3. Bill 5 now due on Dec 15, `is_paid = false`
4. Same bill ID, new due date
5. Keeper pays again on Dec 15
6. Continues until cycle ends

---

## Cycle Management

### 9. `create_cycle()`
```rust
pub fn create_cycle(
    env: Env,
    user: Address,
    duration_months: u32,
    amount: i128,
) -> Result<u64, Error>
```

**Purpose:** Create a new bill payment cycle.

**Authorization:** User (must sign transaction)

**Parameters:**
- `user`: Cycle owner address
- `duration_months`: Duration in months (1-12)
- `amount`: Deposit amount in stroops

**Effects:**
1. Calculates fee = `(amount * fee_percentage) / 100`
2. Calculates end_date = `start_date + (duration_months * 30 days)`
3. Transfers `amount` USDC from user to contract
4. Creates BillCycle with:
   - `total_deposited = amount`
   - `operating_fee = fee`
   - `is_active = true`
   - `last_adjustment_month = 0`
5. Stores cycle ID in `UserCycles(user)`
6. Stores cycle ID in `AllCycles`
7. Publishes `CycleCreated` event
8. Returns cycle ID

**Errors:**
- `InvalidDuration`: If duration_months < 1 or > 12
- `InvalidBillAmount`: If amount <= 0
- Token transfer errors (insufficient balance, etc.)

**Security:**
- User must approve USDC transfer before calling
- Fee is deducted immediately (non-refundable)
- Cycle starts immediately at current timestamp

**Interactions:**
- Transfers USDC from user to contract
- Increments `CycleCounter`
- Adds to `AllCycles` (for admin queries)
- Adds to `UserCycles` (for user queries)

**Critical Calculation:**
```rust
fee = (amount * fee_percentage) / 100
end_date = start_date + (duration_months * 30 * 86400)  // 30 days per month
```

**Example:**
- User deposits: 1000 USDC
- Fee (2%): 20 USDC
- Duration: 3 months
- Start: Nov 8, 2025
- End: Feb 6, 2026 (90 days later)
- Available for bills: 980 USDC

---

### 10. `get_cycle()`
```rust
pub fn get_cycle(env: Env, cycle_id: u64) -> Result<BillCycle, Error>
```

**Purpose:** Get cycle details.

**Authorization:** None (read-only)

**Returns:** BillCycle struct

**Errors:**
- `CycleNotFound`: If cycle doesn't exist

**Security:** Read-only, no side effects

**Interactions:** Used by frontend and keeper service

---

### 11. `get_user_cycles()`
```rust
pub fn get_user_cycles(env: Env, user: Address) -> Vec<u64>
```

**Purpose:** Get all cycle IDs for a user.

**Authorization:** None (read-only)

**Returns:** Vector of cycle IDs owned by user

**Security:** Read-only, no side effects

**Interactions:** Used by frontend to display user's cycles

---

### 12. `end_cycle()`
```rust
pub fn end_cycle(env: Env, cycle_id: u64) -> Result<(), Error>
```

**Purpose:** User ends their own cycle (only after end_date).

**Authorization:** Cycle owner only

**Parameters:**
- `cycle_id`: Cycle to end

**Effects:**
1. Verifies current time >= `end_date`
2. Calculates surplus = `total_deposited - operating_fee - total_paid_bills`
3. If surplus > 0, transfers USDC to user
4. Sets `is_active = false`
5. Publishes `CycleEnded` event

**Errors:**
- `Unauthorized`: If caller is not cycle owner
- `CycleNotFound`: If cycle doesn't exist
- `CycleNotEnded`: If current time < end_date
- `CycleAlreadyEnded`: If cycle already inactive

**Security:**
- User can ONLY call after `end_date` has passed
- Same surplus calculation as `admin_end_cycle()`
- Prevents premature cycle ending

**Interactions:**
- Reads all bills via `get_cycle_bills()`
- Transfers USDC using token client
- Updates cycle storage

**Difference from `admin_end_cycle()`:**
- User version: Requires `current_time >= end_date`
- Admin version: Can call anytime

---

## Bill Management

### 13. `add_bill()`
```rust
pub fn add_bill(
    env: Env,
    cycle_id: u64,
    name: String,
    amount: i128,
    due_date: u64,
    is_recurring: bool,
    recurrence_calendar: Vec<u32>,
) -> Result<u64, Error>
```

**Purpose:** Add a single bill to a cycle.

**Authorization:** Cycle owner only

**Parameters:**
- `cycle_id`: Target cycle
- `name`: Bill description
- `amount`: Payment amount per occurrence (stroops)
- `due_date`: First payment due date (Unix timestamp)
- `is_recurring`: Whether bill repeats
- `recurrence_calendar`: Months (1-12) when bill recurs

**Effects:**
1. Validates amount > 0
2. Validates due_date within cycle dates
3. Validates 7-day lead time before due_date
4. Validates recurrence_calendar (all values 1-12)
5. Creates Bill with `is_paid = false`
6. Stores bill
7. Adds bill ID to `CycleBills(cycle_id)`
8. Publishes `BillAdded` event
9. Returns bill ID

**Errors:**
- `Unauthorized`: If caller is not cycle owner
- `CycleNotFound`: If cycle doesn't exist
- `CycleNotActive`: If cycle is inactive
- `InvalidBillAmount`: If amount <= 0
- `InvalidDueDate`: If due_date outside cycle dates
- `InvalidLeadTime`: If due_date < current_time + 7 days
- `InvalidRecurrence`: If recurrence_calendar contains invalid months

**Security:**
- **NO monthly limit** - users can add bills freely
- 7-day lead time prevents last-minute additions
- Must be cycle owner

**Interactions:**
- Increments `BillCounter`
- Adds to `CycleBills`
- No balance validation (frontend handles this)

**Important Notes:**
- Does NOT check if total allocation exceeds deposit
- Frontend must validate before submission
- No emergency bill concept anymore

---

### 14. `add_bills()`
```rust
pub fn add_bills(
    env: Env,
    cycle_id: u64,
    bills: Vec<(String, i128, u64, bool, Vec<u32>)>,
) -> Result<Vec<u64>, Error>
```

**Purpose:** Add multiple bills in a single transaction.

**Authorization:** Cycle owner only

**Parameters:**
- `cycle_id`: Target cycle
- `bills`: Vector of (name, amount, due_date, is_recurring, recurrence_calendar)

**Effects:**
1. Validates all bills (same validations as `add_bill`)
2. Creates all bills atomically
3. Stores all bills
4. Adds all bill IDs to `CycleBills(cycle_id)`
5. Publishes `BillAdded` event for each
6. Returns vector of created bill IDs

**Errors:**
- Same as `add_bill()`
- If ANY bill fails validation, ENTIRE transaction reverts

**Security:**
- **NO monthly limit** - users can add bills freely
- Atomic operation - all or nothing
- Must be cycle owner

**Interactions:**
- Increments `BillCounter` for each bill
- Adds all to `CycleBills` in single update
- More efficient than calling `add_bill()` multiple times

**Advantage over `add_bill()`:**
- **Single transaction** = single signature
- Frontend can submit all bills at once
- Gas efficient

---

### 15. `get_bill()`
```rust
pub fn get_bill(env: Env, bill_id: u64) -> Result<Bill, Error>
```

**Purpose:** Get bill details.

**Authorization:** None (read-only)

**Returns:** Bill struct

**Errors:**
- `BillNotFound`: If bill doesn't exist

**Security:** Read-only, no side effects

**Interactions:** Used by frontend and keeper service

---

### 16. `get_cycle_bills()`
```rust
pub fn get_cycle_bills(env: Env, cycle_id: u64) -> Vec<u64>
```

**Purpose:** Get all bill IDs in a cycle.

**Authorization:** None (read-only)

**Returns:** Vector of bill IDs

**Security:** Read-only, no side effects

**Interactions:**
- Used by frontend to display bills
- Used by keeper service to find bills to pay
- Used by `end_cycle()` to calculate surplus

---

### 17. `cancel_bill()`
```rust
pub fn cancel_bill(env: Env, bill_id: u64) -> Result<(), Error>
```

**Purpose:** Cancel a single bill.

**Authorization:** Cycle owner only

**Parameters:**
- `bill_id`: Bill to cancel

**Effects:**
1. Verifies cycle is active
2. Checks monthly adjustment limit
3. Removes bill from storage
4. Removes bill ID from `CycleBills`
5. Updates `last_adjustment_month` to current month
6. Publishes `BillCancelled` event

**Errors:**
- `Unauthorized`: If caller is not cycle owner
- `BillNotFound`: If bill doesn't exist
- `CycleNotActive`: If cycle is inactive
- `MonthlyAdjustmentLimitReached`: If already cancelled a bill this month

**Security:**
- **Monthly limit applies** - one cancellation per calendar month
- Money stays in contract (increases available balance)
- Cannot cancel paid bills (implicitly, paid bills don't exist anymore for recurring)

**Interactions:**
- Reads bill → cycle
- Updates `CycleBills`
- Updates cycle's `last_adjustment_month`

**Monthly Limit Mechanism:**
```rust
current_month = (current_timestamp / (30 * 86400)) % 12 + 1  // Approximation
if cycle.last_adjustment_month == current_month {
    Error::MonthlyAdjustmentLimitReached
}
```

**Critical Behavior:**
- Cancelled bills are DELETED from storage
- Money is NOT sent to wallet
- Frontend recalculates available balance
- User can add new bills with freed amount

---

### 18. `cancel_bills()`
```rust
pub fn cancel_bills(env: Env, bill_ids: Vec<u64>) -> Result<(), Error>
```

**Purpose:** Cancel multiple bills in a single transaction.

**Authorization:** Cycle owner only

**Parameters:**
- `bill_ids`: Vector of bill IDs to cancel

**Effects:**
1. Verifies all bills exist
2. Verifies all bills belong to same cycle
3. Verifies cycle is active
4. Checks monthly adjustment limit ONCE
5. Verifies none of the bills are paid
6. Removes all bills from storage
7. Removes all bill IDs from `CycleBills`
8. Updates `last_adjustment_month` to current month
9. Publishes `BillCancelled` event for each

**Errors:**
- `Unauthorized`: If caller is not cycle owner
- `BillNotFound`: If any bill doesn't exist
- `CycleNotActive`: If cycle is inactive
- `MonthlyAdjustmentLimitReached`: If already adjusted this month
- `BillAlreadyPaid`: If any bill is paid
- `InvalidDueDate`: If bills belong to different cycles (error reused)
- `InvalidBillAmount`: If bill_ids is empty (error reused)

**Security:**
- **Monthly limit applies ONCE for entire batch**
- Cancelling 5 bills at once = ONE adjustment
- All bills must belong to same cycle
- Cannot mix cycles in single call

**Interactions:**
- Reads first bill to determine cycle
- Validates all bills belong to that cycle
- Updates `CycleBills` once
- Updates cycle's `last_adjustment_month`

**Advantage over `cancel_bill()`:**
- **Batch operation** - cancel multiple bills as ONE adjustment
- Single transaction signature
- More flexible for users

**Example:**
- User adds 10 bills on Nov 5
- User cancels bills [3, 5, 7] on Nov 20 using `cancel_bills()`
- ✅ Succeeds - counts as ONE adjustment
- User tries to cancel bill 9 on Nov 25 using `cancel_bill()`
- ❌ Fails - MonthlyAdjustmentLimitReached
- User can cancel bill 9 on Dec 1 (new month)

---

## Payment Functions

### 19. `pay_bill()`
```rust
pub fn pay_bill(env: Env, bill_id: u64) -> Result<(), Error>
```

**Purpose:** User pays their own bill (strict due date enforcement).

**Authorization:** Cycle owner only

**Parameters:**
- `bill_id`: Bill to pay

**Effects:**
1. Verifies bill is not already paid
2. Verifies cycle is active
3. **Verifies current date matches due date (same calendar day)**
4. Transfers `bill.amount` from contract to user
5. If recurring and next occurrence within cycle:
   - Updates `due_date` to +30 days
   - Sets `is_paid = false`
6. If one-time OR last occurrence:
   - Sets `is_paid = true`
7. Publishes `BillPaid` event

**Errors:**
- `Unauthorized`: If caller is not cycle owner
- `BillNotFound`: If bill doesn't exist
- `BillAlreadyPaid`: If bill already paid
- `CycleNotFound`: If parent cycle doesn't exist
- `CycleNotActive`: If cycle is inactive
- `BillNotDueYet`: If current day != due day

**Security:**
- **Strict due date check** - can ONLY pay on exact calendar day
- User cannot pay early or late
- Enforces financial discipline

**Due Date Validation:**
```rust
bill_due_day_start = (bill.due_date / 86400) * 86400  // Start of due day
current_day_start = (current_time / 86400) * 86400    // Start of current day

if current_day_start != bill_due_day_start {
    Error::BillNotDueYet
}
```

**Interactions:**
- Same recurring logic as `admin_pay_bill()`
- Transfers USDC using token client
- Updates bill storage

**Difference from `admin_pay_bill()`:**
- User version: Can ONLY pay on due date
- Admin version: Can pay anytime

**Use Case:**
- This function exists but is NOT used in normal flow
- Keeper service uses `admin_pay_bill()` for automation
- User could theoretically trigger it manually on due date
- **Frontend should NOT expose this** (per your requirements)

---

## Query Functions

### 20. `usdc_token()`
```rust
pub fn usdc_token(env: &Env) -> Address
```

**Purpose:** Get USDC token contract address.

**Authorization:** None (read-only)

**Returns:** USDC token address

**Security:** Read-only, no side effects

---

### 21. `fee_recipient()`
```rust
pub fn fee_recipient(env: &Env) -> Address
```

**Purpose:** Get fee recipient address.

**Authorization:** None (read-only)

**Returns:** Fee recipient address

**Security:** Read-only, no side effects

---

### 22. `fee_percentage()`
```rust
pub fn fee_percentage(env: &Env) -> u32
```

**Purpose:** Get fee percentage.

**Authorization:** None (read-only)

**Returns:** Fee percentage (e.g., 2 for 2%)

**Security:** Read-only, no side effects

---

## Helper Functions

### 23. `extend_ttl()`
```rust
fn extend_ttl(env: &Env, key: &DataKey)
```

**Purpose:** Extend storage TTL for persistent data.

**Parameters:**
- `key`: Storage key to extend

**Effects:**
- Extends TTL by `LEDGER_TTL_EXTEND` (518400 ledgers ≈ 30 days)

**Security:**
- Internal function only
- Prevents data expiration

**Called by:** Almost all functions that read/write storage

---

### 24. `get_current_month()`
```rust
fn get_current_month(env: &Env) -> u32
```

**Purpose:** Calculate current calendar month number.

**Returns:** Month number (1-12) based on current timestamp

**Calculation:**
```rust
timestamp = env.ledger().timestamp()
month = (timestamp / (30 * 86400)) % 12 + 1  // Approximate
```

**Security:**
- Used for monthly adjustment limit
- **APPROXIMATE** - uses 30 days per month

**Limitation:**
- Not accurate for exact calendar months
- Feb has 28/29 days, not 30
- Could cause edge case issues

**Used by:**
- `cancel_bill()`
- `cancel_bills()`

---

### 25. `validate_lead_time()`
```rust
fn validate_lead_time(env: &Env, due_date: u64) -> Result<(), Error>
```

**Purpose:** Ensure bill due date is at least 7 days in future.

**Parameters:**
- `due_date`: Bill's due date

**Effects:**
- Checks `due_date >= current_time + (7 * 86400)`

**Errors:**
- `InvalidLeadTime`: If due date is less than 7 days away

**Security:**
- Prevents last-minute bill additions
- Gives keeper service time to process

**Used by:**
- `add_bill()`
- `add_bills()`

---

### 26. `next_cycle_id()`
```rust
fn next_cycle_id(env: &Env) -> u64
```

**Purpose:** Get next available cycle ID and increment counter.

**Returns:** Next cycle ID

**Effects:**
- Reads `CycleCounter`
- Increments counter
- Stores new value

**Security:** Ensures unique cycle IDs

**Used by:** `create_cycle()`

---

### 27. `next_bill_id()`
```rust
fn next_bill_id(env: &Env) -> u64
```

**Purpose:** Get next available bill ID and increment counter.

**Returns:** Next bill ID

**Effects:**
- Reads `BillCounter`
- Increments counter
- Stores new value

**Security:** Ensures unique bill IDs

**Used by:**
- `add_bill()`
- `add_bills()`

---

## Security Considerations

### Critical Security Issues

#### 1. **Monthly Limit Calculation**
**Function:** `get_current_month()`

**Issue:** Uses approximate 30-day months instead of calendar months.

**Impact:**
```rust
month = (timestamp / (30 * 86400)) % 12 + 1
```

- Jan 30 and Feb 1 might be same "month"
- Feb 27 and March 2 might be same "month"
- Users could exploit to cancel multiple times

**Recommendation:** Use proper calendar month calculation or blockchain timestamp-based months.

---

#### 2. **No Over-Allocation Protection in Contract**
**Functions:** `add_bill()`, `add_bills()`

**Issue:** Contract does NOT verify total bill allocation <= available balance.

**Impact:**
- User can allocate 10,000 USDC in bills with only 1,000 USDC deposited
- Payments will fail when contract doesn't have funds
- **Relies entirely on frontend validation**

**Recommendation:** Add contract-level validation:
```rust
fn validate_allocation(env: &Env, cycle_id: u64, new_amount: i128) -> Result<(), Error> {
    let cycle = get_cycle(...);
    let bills = get_cycle_bills(...);
    let total_allocated = bills.iter().sum_amounts(...);

    if total_allocated + new_amount > cycle.total_deposited - cycle.operating_fee {
        return Err(Error::InsufficientBalance);
    }
    Ok(())
}
```

---

#### 3. **Recurring Bill Rescheduling Risk**
**Functions:** `admin_pay_bill()`, `pay_bill()`

**Issue:** Recurring bills use fixed 30-day increment.

**Impact:**
```rust
next_due_date = due_date + (30 * 86400)  // Always 30 days
```

- Doesn't account for actual month lengths
- Feb payment (28 days) + 30 days = March 30
- Could drift over time

**Recommendation:** Use proper date arithmetic or month-based calculation.

---

#### 4. **Admin Has Too Much Power**
**Functions:** `admin_pay_bill()`, `admin_end_cycle()`

**Issue:** Admin can:
- Pay bills anytime (could pay early and manipulate)
- End cycles anytime (could lock user funds)
- See all user cycles

**Impact:**
- Centralization risk
- Trust required in admin
- No timelock or multi-sig

**Recommendation:**
- Add timelock for admin actions
- Implement multi-sig admin
- Add admin action limits

---

#### 5. **No Reentrancy Protection**
**Functions:** All payment functions

**Issue:** No reentrancy guards on token transfers.

**Impact:**
- If USDC token is malicious, could drain contract
- Cross-contract calls could exploit state

**Recommendation:**
- Add reentrancy guard
- Use checks-effects-interactions pattern
- Already follows CEI, but no explicit guard

---

#### 6. **TTL Extension Could Fail**
**Function:** `extend_ttl()`

**Issue:** Called on every read/write, but doesn't check if key exists.

**Impact:**
- Trying to extend TTL on non-existent key might fail
- Could cause transaction revert

**Status:** Already handled in `get_all_cycles()` with:
```rust
if env.storage().persistent().has(&key) {
    extend_ttl(&env, &key);
}
```

**Recommendation:** Apply same pattern to all TTL extensions.

---

### Authorization Matrix

| Function | Admin | Cycle Owner | Anyone |
|----------|-------|-------------|--------|
| initialize | First call only | ❌ | ❌ |
| propose_admin | ✅ | ❌ | ❌ |
| accept_admin | Pending admin | ❌ | ❌ |
| cancel_admin_transfer | ✅ | ❌ | ❌ |
| admin | ❌ | ❌ | ✅ (read) |
| get_all_cycles | ✅ | ❌ | ❌ |
| admin_end_cycle | ✅ | ❌ | ❌ |
| admin_pay_bill | ✅ | ❌ | ❌ |
| create_cycle | ❌ | User creates | ❌ |
| get_cycle | ❌ | ❌ | ✅ (read) |
| get_user_cycles | ❌ | ❌ | ✅ (read) |
| end_cycle | ❌ | ✅ | ❌ |
| add_bill | ❌ | ✅ | ❌ |
| add_bills | ❌ | ✅ | ❌ |
| get_bill | ❌ | ❌ | ✅ (read) |
| get_cycle_bills | ❌ | ❌ | ✅ (read) |
| cancel_bill | ❌ | ✅ | ❌ |
| cancel_bills | ❌ | ✅ | ❌ |
| pay_bill | ❌ | ✅ | ❌ |

---

## Function Interaction Flow

### Flow 1: Creating a Cycle and Adding Bills
```
User
  ↓
1. create_cycle(user, 3 months, 1000 USDC)
   → Transfers 1000 USDC to contract
   → Deducts 20 USDC fee (2%)
   → Creates cycle with 980 USDC available
   → Returns cycle_id = 0
  ↓
2. add_bills(cycle_id: 0, bills: [...])
   → Validates each bill
   → Creates bills [1, 2, 3]
   → Stores in CycleBills(0) = [1, 2, 3]
   → Returns [1, 2, 3]
```

### Flow 2: Keeper Service Paying Bills
```
Keeper Service (Admin)
  ↓
1. get_all_cycles()
   → Returns [0, 1, 2, ...]
  ↓
2. For each cycle:
   get_cycle_bills(cycle_id)
   → Returns [bill_id_1, bill_id_2, ...]
  ↓
3. For each bill:
   get_bill(bill_id)
   → Returns Bill { due_date, is_paid, amount, ... }
  ↓
4. If due_date == today && !is_paid:
   admin_pay_bill(bill_id)
   → Transfers amount to user
   → If recurring: updates due_date, sets is_paid = false
   → If one-time: sets is_paid = true
```

### Flow 3: Cancelling Bills
```
User
  ↓
1. cancel_bills([bill_id_1, bill_id_2])
   → Checks monthly limit
   → Removes bills from storage
   → Updates CycleBills
   → Sets last_adjustment_month = current_month
  ↓
2. Try to cancel another bill:
   cancel_bill(bill_id_3)
   → Error: MonthlyAdjustmentLimitReached
  ↓
3. Wait for next month:
   cancel_bill(bill_id_3)
   → Success (new month)
```

### Flow 4: Ending a Cycle
```
User (after end_date passes)
  ↓
1. end_cycle(cycle_id)
   → Verifies current_time >= end_date
   → Gets all bills via get_cycle_bills()
   → Calculates: paid_bills = 200 USDC
   → Calculates: surplus = 1000 - 20 - 200 = 780 USDC
   → Transfers 780 USDC to user
   → Sets is_active = false
```

### Flow 5: Admin Emergency End
```
Admin
  ↓
1. admin_end_cycle(cycle_id)
   → Ignores end_date
   → Same calculation as user end_cycle
   → Transfers surplus to user
   → Sets is_active = false
```

---

## Edge Cases and Gotchas

### 1. Recurring Bill with Last Occurrence
**Scenario:** 3-month cycle, bill due Nov 15, Dec 15, Jan 15.

**Flow:**
- Nov 15: Paid → due_date = Dec 15, is_paid = false
- Dec 15: Paid → due_date = Jan 15, is_paid = false
- Jan 15: Paid → next would be Feb 15 but cycle ends Feb 6
  - Sets is_paid = true
  - Bill is now "completed"

**Gotcha:** Same bill ID represents all 3 payments. No separate records per occurrence.

---

### 2. Over-Allocated Cycle
**Scenario:** User deposits 100 USDC, allocates 150 USDC in bills.

**Contract Behavior:**
- ✅ Bills are created successfully
- ✅ First 100 USDC in bills get paid
- ❌ Remaining 50 USDC in bills fail (insufficient contract balance)

**Gotcha:** Contract doesn't prevent over-allocation. Keeper service will fail on payment.

---

### 3. Monthly Limit Edge Case
**Scenario:** User cancels bill on Jan 30, then tries on Feb 1.

**Current Behavior (BUGGY):**
```rust
month = (timestamp / (30 * 86400)) % 12 + 1
```
- Jan 30 timestamp / 30 days = month X
- Feb 1 timestamp / 30 days = possibly same month X
- ❌ Cancellation blocked even though it's a new month

**Recommendation:** Fix `get_current_month()` implementation.

---

### 4. Cycle End During Bill Payment
**Scenario:** Bill due Jan 15, cycle ends Jan 10.

**Contract Behavior:**
- ✅ Bill creation succeeds (due_date within cycle)
- ❌ Bill never gets paid (cycle ends first)
- ✅ User gets money back via `end_cycle()` (bill wasn't paid)

**Gotcha:** Bills created near cycle end might never execute.

---

### 5. Admin Transfer Race Condition
**Scenario:** Admin proposes transfer, waits 6 days, cancels, proposes again.

**Flow:**
1. propose_admin(Alice) → expires in 7 days
2. Wait 6 days
3. cancel_admin_transfer()
4. propose_admin(Bob) → new 7-day window
5. Alice tries to accept after 8 days from step 1
   → ❌ Fails (no longer pending)

**Gotcha:** Cancellation prevents old admin transfer even within window.

---

## Testing Recommendations

### Unit Tests Needed

#### Admin Functions
- ✅ initialize() can only be called once
- ✅ propose_admin() requires admin auth
- ✅ accept_admin() requires pending admin auth
- ✅ accept_admin() fails after 7 days
- ✅ cancel_admin_transfer() clears pending admin
- ✅ get_all_cycles() requires admin auth

#### Cycle Functions
- ✅ create_cycle() transfers correct USDC amount
- ✅ create_cycle() calculates fee correctly
- ✅ create_cycle() sets correct end_date
- ✅ create_cycle() fails with invalid duration
- ✅ end_cycle() requires owner auth
- ✅ end_cycle() fails before end_date
- ✅ end_cycle() calculates surplus correctly (only paid bills)
- ✅ admin_end_cycle() can be called anytime
- ✅ admin_end_cycle() returns correct surplus

#### Bill Functions
- ✅ add_bill() requires 7-day lead time
- ✅ add_bill() validates recurrence_calendar
- ✅ add_bill() fails if due_date outside cycle
- ✅ add_bills() creates all bills atomically
- ✅ add_bills() reverts if any bill fails
- ✅ cancel_bill() checks monthly limit
- ✅ cancel_bill() removes bill from storage
- ✅ cancel_bills() allows batch cancellation as ONE adjustment
- ✅ cancel_bills() fails if bills from different cycles
- ✅ cancel_bills() updates last_adjustment_month

#### Payment Functions
- ✅ admin_pay_bill() can pay anytime
- ✅ admin_pay_bill() reschedules recurring bills
- ✅ admin_pay_bill() marks last occurrence as paid
- ✅ pay_bill() requires exact due date
- ✅ pay_bill() fails if not due yet
- ✅ Both payment functions prevent double payment
- ✅ Both payment functions verify cycle is active

#### Edge Cases
- ✅ Recurring bill reaches cycle end
- ✅ Over-allocated cycle (bills > deposit)
- ✅ Cancel multiple bills in same month
- ✅ Cancel bill then add new bill in same month
- ✅ End cycle with unpaid bills returns correct surplus
- ✅ Monthly limit calculation across month boundaries

#### Security Tests
- ✅ Non-owner cannot add bills
- ✅ Non-owner cannot cancel bills
- ✅ Non-owner cannot end cycle
- ✅ Non-admin cannot pay bills
- ✅ Non-admin cannot end any cycle
- ✅ Cannot pay already-paid bill
- ✅ Cannot cancel paid bill
- ✅ Cannot operate on inactive cycle

---

## Constants

```rust
const LEDGER_TTL_THRESHOLD: u32 = 518400;  // ~30 days
const LEDGER_TTL_EXTEND: u32 = 518400;     // Extend by 30 days
const SECONDS_IN_DAY: u64 = 86400;         // 24 * 60 * 60
const AVERAGE_DAYS_IN_MONTH: u64 = 30;    // Used for recurring bills
const ADMIN_TRANSFER_DURATION: u64 = 604800; // 7 days
const MIN_LEAD_TIME: u64 = 604800;         // 7 days before due date
```

---

This documentation provides a complete reference for understanding, testing, and auditing the LockedIn smart contract.
