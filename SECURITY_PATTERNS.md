# OpenZeppelin Security Patterns for LockedIn

## 📚 Source Materials

This document extracts security patterns from OpenZeppelin Stellar contracts to be applied in the LockedIn smart contract.

---

## 🔐 Core Security Patterns

### 1. Access Control Patterns

#### Pattern: Admin Management with 2-Step Transfer
**Source:** Access Control & Ownable modules

**Key Principles:**
- Single admin with top-level privileges
- Two-step transfer process prevents accidental takeovers
- Admin can renounce themselves for decentralization

**Implementation:**
```rust
// Step 1: Initiate transfer
pub fn transfer_admin(env: Env, new_admin: Address, live_until_ledger: u32) {
    let current_admin = get_admin(&env);
    current_admin.require_auth();

    // Store pending transfer
    env.storage().instance().set(&PENDING_ADMIN, &new_admin);
    env.storage().instance().set(&TRANSFER_EXPIRY, &live_until_ledger);
}

// Step 2: Accept transfer
pub fn accept_admin(env: Env) {
    let new_admin = env.storage().instance().get(&PENDING_ADMIN).unwrap();
    new_admin.require_auth();

    // Check expiration
    let expiry: u32 = env.storage().instance().get(&TRANSFER_EXPIRY).unwrap();
    if env.ledger().sequence() > expiry {
        panic!("Transfer expired");
    }

    // Complete transfer
    env.storage().instance().set(&ADMIN, &new_admin);
    env.storage().instance().remove(&PENDING_ADMIN);
}

// Renounce (one-way, permanent)
pub fn renounce_admin(env: Env) {
    let admin = get_admin(&env);
    admin.require_auth();

    env.storage().instance().remove(&ADMIN);
    // Admin functions now permanently inaccessible
}
```

**Apply to LockedIn:**
- Admin can set fee percentage (1-5%)
- Admin can set fee recipient address
- Admin can withdraw accumulated fees
- Support 2-step admin transfer
- Support admin renunciation

---

#### Pattern: Role-Based Access Control
**Source:** Access Control module

**Key Principles:**
- Hierarchical role system
- Each role can have an "admin role"
- Roles exist only through account relationships

**NOT NEEDED for LockedIn** (we only need single admin, not complex roles)

---

### 2. Authorization Patterns

#### Pattern: Require Auth Before Logic
**Source:** All OpenZeppelin contracts

**Key Principle:**
```rust
pub fn privileged_function(env: Env, caller: Address) {
    // ALWAYS call require_auth first
    caller.require_auth();

    // Then perform access control checks
    require_admin(&env, &caller);

    // Finally execute logic
    do_privileged_action(&env);
}
```

**Apply to LockedIn:**
- Every function that modifies state requires auth
- Owner functions check cycle ownership
- Admin functions check admin status

---

#### Pattern: Procedural Macros for Authorization
**Source:** Access Control & Ownable modules

```rust
#[only_owner]
pub fn owner_function(e: &Env) {
    // require_auth() automatically called
    // Ownership check automatically done
}

#[only_role(caller, "minter")]
pub fn role_function(e: &Env, caller: Address) {
    // require_auth() automatically called
    // Role check automatically done
}
```

**Apply to LockedIn:**
```rust
#[only_admin]
pub fn set_fee_percentage(e: &Env, new_fee: u32) {
    // Admin auth & check automatic
}

// For owner checks, we'll need custom macro or manual check
pub fn cancel_bill(e: &Env, cycle_id: u64, bill_id: u64) {
    let cycle = get_cycle(e, cycle_id);
    cycle.owner.require_auth();
    require_cycle_owner(e, cycle_id, &cycle.owner);
    // ...
}
```

---

### 3. Storage Management

#### Pattern: TTL Management
**Source:** All token contracts

**Key Principles:**
- Library manages `temporary` and `persistent` storage TTL
- Implementer manages `instance` storage TTL
- Provide default threshold and extend values

```rust
pub const INSTANCE_TTL_THRESHOLD: u32 = 518400; // 30 days
pub const INSTANCE_EXTEND_AMOUNT: u32 = 2592000; // 150 days

fn extend_instance_ttl(e: &Env) {
    e.storage().instance().extend_ttl(
        INSTANCE_TTL_THRESHOLD,
        INSTANCE_EXTEND_AMOUNT
    );
}
```

**Apply to LockedIn:**
- Extend instance TTL in frequently called functions
- Use persistent storage for cycle/bill data
- Use instance storage for global config (admin, fee %)

---

#### Pattern: Efficient Storage Keys
**Source:** Fungible Token module

```rust
pub enum DataKey {
    // Use enums for type-safe keys
    Balance(Address),
    TotalSupply,
    Admin,
}

// Storage access
let balance: i128 = e.storage()
    .persistent()
    .get(&DataKey::Balance(account))
    .unwrap_or(0);
```

**Apply to LockedIn:**
```rust
pub enum DataKey {
    Admin,
    FeeRecipient,
    FeePercentage,
    NextCycleId,
    Cycle(u64),
    CycleBills(u64),  // Vec of bill IDs
    Bill(u64),
}
```

---

### 4. Event Emission

#### Pattern: Emit Events for State Changes
**Source:** All OpenZeppelin contracts

**Key Principle:**
```rust
// Define events
#[contracterror]
pub enum ExampleContractError {
    // ...
}

// Emit on state change
pub fn transfer(e: &Env, from: Address, to: Address, amount: i128) {
    // ... transfer logic ...

    // Emit event
    e.events().publish((symbol_short!("transfer"), from, to), amount);
}
```

**Apply to LockedIn:**
```rust
// Events to emit
e.events().publish((symbol_short!("cycle_created"), owner), cycle_id);
e.events().publish((symbol_short!("bill_added"), cycle_id), bill_id);
e.events().publish((symbol_short!("bill_paid"), bill_id), amount);
e.events().publish((symbol_short!("cycle_closed"), cycle_id), surplus);
e.events().publish((symbol_short!("admin_changed"), old_admin), new_admin);
```

---

### 5. Input Validation

#### Pattern: Validate All Inputs
**Source:** Fungible Token module

```rust
pub fn transfer(e: &Env, from: Address, to: Address, amount: i128) {
    // Validate non-negative
    if amount < 0 {
        panic_with_error!(e, Error::NegativeAmount);
    }

    // Validate addresses
    from.require_auth();

    // Validate sufficient balance
    let balance = get_balance(e, &from);
    if balance < amount {
        panic_with_error!(e, Error::InsufficientBalance);
    }

    // Execute
    // ...
}
```

**Apply to LockedIn:**
- Validate all amounts > 0
- Validate all dates (start < end, within bounds)
- Validate fee percentage (1-5%)
- Validate 30-day minimum lead time
- Validate emergency bill limits

---

### 6. Error Handling

#### Pattern: Custom Error Codes
**Source:** All modules

```rust
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    Unauthorized = 1,
    InsufficientBalance = 2,
    NegativeAmount = 3,
    // ...
}

// Usage
if !is_authorized {
    panic_with_error!(e, Error::Unauthorized);
}
```

**Error Code Ranges (OpenZeppelin Convention):**
- Tokens: 1XX-4XX
- Utilities: 1XXX
- Access: 2XXX
- Accounts: 3XXX

**Apply to LockedIn:**
```rust
#[contracterror]
#[repr(u32)]
pub enum LockedInError {
    // Access (2XXX range)
    Unauthorized = 2000,
    NotCycleOwner = 2001,
    NotAdmin = 2002,

    // Cycle errors (5XXX range - custom for our app)
    CycleNotFound = 5000,
    CycleAlreadyClosed = 5001,
    CycleNotEnded = 5002,
    InvalidPeriod = 5003,

    // Bill errors (5XXX range)
    BillNotFound = 5100,
    BillAlreadyCancelled = 5101,
    BillLeadTimeTooShort = 5102,
    EmergencyBillLimitExceeded = 5103,
    InsufficientFunds = 5104,

    // Adjustment errors
    AdjustmentLimitExceeded = 5200,

    // Fee errors
    InvalidFeePercentage = 5300,
}
```

---

### 7. Upgrade Patterns

#### Pattern: Upgradeable Contracts
**Source:** Upgradeable module

**Key Principles:**
- Implement `UpgradeableInternal` trait
- Require admin authorization
- Support migrations if needed

```rust
use stellar_macros::Upgradeable;

#[derive(Upgradeable)]
#[contract]
pub struct MyContract;

impl UpgradeableInternal for MyContract {
    fn _require_auth(e: &Env, operator: &Address) {
        operator.require_auth();
        let admin = get_admin(e);
        if *operator != admin {
            panic_with_error!(e, Error::Unauthorized);
        }
    }
}
```

**Apply to LockedIn:**
- Make contract upgradeable initially
- Admin can upgrade
- Later admin can renounce to make immutable

---

### 8. Pausable Pattern

#### Pattern: Emergency Stop
**Source:** Pausable utility

```rust
#[when_paused]
pub fn emergency_function(e: &Env) {
    // Only callable when paused
}

#[when_not_paused]
pub fn normal_function(e: &Env) {
    // Only callable when not paused
}
```

**NOT NEEDED for LockedIn initially** (add later if needed)

---

### 9. Time-Lock Patterns

#### Pattern: Time-Based Access Control
**Source:** Various contracts (implied in design)

```rust
pub fn create_time_lock(e: &Env, unlock_time: u64) {
    let current_time = e.ledger().timestamp();

    // Validate future time
    if unlock_time <= current_time {
        panic!("Unlock time must be in future");
    }

    // Store
    e.storage().persistent().set(&UNLOCK_TIME, &unlock_time);
}

pub fn withdraw(e: &Env) {
    let unlock_time: u64 = e.storage().persistent().get(&UNLOCK_TIME).unwrap();
    let current_time = e.ledger().timestamp();

    if current_time < unlock_time {
        panic!("Still locked");
    }

    // Allow withdrawal
}
```

**Apply to LockedIn:**
```rust
// Bills can only be paid on or after due date
pub fn execute_bill_payment(e: &Env, bill_id: u64) {
    let bill = get_bill(e, bill_id);
    let current_time = e.ledger().timestamp();

    // Find next unpaid due date
    let due_date = bill.due_dates
        .iter()
        .find(|&date| !bill.paid_dates.contains(date) && date <= current_time)
        .unwrap();

    // Execute payment
    // ...
}

// Surplus can only be withdrawn after cycle end
pub fn close_cycle(e: &Env, cycle_id: u64) {
    let cycle = get_cycle(e, cycle_id);
    let current_time = e.ledger().timestamp();

    if current_time < cycle.end_date {
        panic_with_error!(e, LockedInError::CycleNotEnded);
    }

    // Return surplus
    // ...
}
```

---

### 10. Token Transfer Patterns

#### Pattern: Safe Token Transfers
**Source:** Fungible Token module

```rust
use soroban_sdk::token::TokenClient;

pub fn transfer_tokens(e: &Env, token: Address, to: Address, amount: i128) {
    let token_client = TokenClient::new(e, &token);

    // Transfer from contract to recipient
    token_client.transfer(
        &e.current_contract_address(),
        &to,
        &amount
    );
}
```

**Apply to LockedIn:**
```rust
use soroban_sdk::token::TokenClient;

// USDC token address (will be in config)
const USDC_TOKEN: Address = /* ... */;

pub fn deposit_funds(e: &Env, cycle_id: u64, from: Address, amount: i128) {
    from.require_auth();

    let token = TokenClient::new(e, &USDC_TOKEN);

    // Transfer from user to contract
    token.transfer(&from, &e.current_contract_address(), &amount);
}

pub fn pay_bill(e: &Env, to: Address, amount: i128) {
    let token = TokenClient::new(e, &USDC_TOKEN);

    // Transfer from contract to user
    token.transfer(&e.current_contract_address(), &to, &amount);
}
```

---

## 🔍 Security Checklist for LockedIn

Based on OpenZeppelin patterns, our contract must:

### Access Control
- [ ] Admin is set in constructor
- [ ] Admin functions check admin status
- [ ] Owner functions check cycle ownership
- [ ] Two-step admin transfer implemented
- [ ] Admin renunciation supported

### Authorization
- [ ] All state-changing functions call `require_auth()`
- [ ] Auth called BEFORE logic execution
- [ ] No function bypasses authorization

### Input Validation
- [ ] All amounts validated (> 0)
- [ ] All dates validated (start < end, within bounds)
- [ ] Fee percentage validated (1-5%)
- [ ] 30-day lead time enforced
- [ ] Emergency bill limits enforced (10%)

### Storage
- [ ] Instance TTL managed
- [ ] Persistent storage for cycles/bills
- [ ] Storage keys are type-safe (enums)
- [ ] No data races or conflicts

### Events
- [ ] Event emitted on cycle creation
- [ ] Event emitted on bill addition
- [ ] Event emitted on payment
- [ ] Event emitted on cycle closure
- [ ] Event emitted on admin changes

### Error Handling
- [ ] Custom error codes defined
- [ ] Errors use panic_with_error!
- [ ] Error messages are clear
- [ ] All error cases covered

### Time-Locks
- [ ] Cannot withdraw before due date
- [ ] Cannot close cycle before end date
- [ ] 30-day minimum lead time enforced
- [ ] Time comparisons use ledger timestamp

### Token Handling
- [ ] Uses TokenClient for USDC
- [ ] Transfer from user to contract on deposit
- [ ] Transfer from contract to user on payment
- [ ] No direct balance manipulation

### Testing
- [ ] Unit tests for all functions
- [ ] Test unauthorized access attempts
- [ ] Test time-lock enforcement
- [ ] Test error conditions
- [ ] Test edge cases

---

## 📝 Implementation Order

Based on security-first approach:

1. **Foundation (Day 1 Morning)**
   - Error codes
   - Data structures
   - Storage keys
   - Admin setup

2. **Access Control (Day 1 Morning)**
   - Admin management
   - Two-step transfer
   - Ownership checks

3. **Core Logic (Day 1 Afternoon)**
   - Cycle creation
   - Bill management
   - Time-lock validation

4. **Token Integration (Day 1 Evening)**
   - USDC token client
   - Deposit function
   - Payment function

5. **Testing (Throughout)**
   - Unit tests after each feature
   - Security tests
   - Edge case tests

---

## 🚨 Critical Security Notes

### From OpenZeppelin Documentation:

1. **"Instance TTL management is left to the implementor"**
   - We must manually manage instance storage TTL
   - Extend TTL in frequently called functions

2. **"No constructor will be invoked on upgrade"**
   - Constructor only runs on initial deploy
   - Use migration for upgrade logic

3. **"Renunciation is permanent and one-way"**
   - Once admin renounces, all admin functions are lost
   - Use with extreme caution

4. **"Always require_auth before logic"**
   - Never execute logic then check auth
   - Auth must be first line of function

5. **"Validate all inputs"**
   - Never trust user input
   - Check bounds, types, ranges

---

## 📚 References

- [OpenZeppelin Stellar Contracts](https://github.com/OpenZeppelin/stellar-contracts)
- [Access Control Module](https://github.com/OpenZeppelin/stellar-contracts/tree/main/packages/access/src/access-control)
- [Ownable Module](https://github.com/OpenZeppelin/stellar-contracts/tree/main/packages/access/src/ownable)
- [Fungible Token Module](https://github.com/OpenZeppelin/stellar-contracts/tree/main/packages/tokens/src/fungible)
- [Upgradeable Module](https://github.com/OpenZeppelin/stellar-contracts/tree/main/packages/contract-utils/src/upgradeable)
- [Pausable Module](https://github.com/OpenZeppelin/stellar-contracts/tree/main/packages/contract-utils/src/pausable)

---

**Last Updated:** [Date]
**Status:** Ready for implementation
**Next Step:** Review scaffold examples, then begin coding
