#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    token::{StellarAssetClient, TokenClient},
    Address, Env, String, Vec,
};

// Test token setup helper
fn create_token_contract<'a>(env: &Env, admin: &Address) -> (Address, TokenClient<'a>) {
    let stellar_asset = env.register_stellar_asset_contract_v2(admin.clone());
    let token_address = stellar_asset.address();
    let token = TokenClient::new(env, &token_address);
    (token_address, token)
}

// Contract setup helper
fn create_lockedin_contract<'a>(
    env: &Env,
    admin: &Address,
    usdc_token: &Address,
) -> LockedInClient<'a> {
    let contract_id = env.register(LockedIn, (admin, usdc_token));
    let client = LockedInClient::new(env, &contract_id);
    client
}

// Helper to mint tokens to a user
fn mint_tokens(env: &Env, token: &TokenClient, to: &Address, amount: i128) {
    let stellar_asset = StellarAssetClient::new(env, &token.address);
    stellar_asset.mint(to, &amount);
}

// Helper to set ledger time
fn set_ledger_time(env: &Env, timestamp: u64, sequence: u32) {
    env.ledger().set(LedgerInfo {
        timestamp,
        protocol_version: 23,
        sequence_number: sequence,
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 10,
        min_persistent_entry_ttl: 10,
        max_entry_ttl: 3110400,
    });
}

#[test]
fn test_initialization() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let (usdc_token, _) = create_token_contract(&env, &admin);
    let client = create_lockedin_contract(&env, &admin, &usdc_token);

    assert_eq!(client.admin(), admin);
    assert_eq!(client.get_usdc_token(), usdc_token);
    assert_eq!(client.fee_recipient(), admin);
    assert_eq!(client.get_fee_percentage(), 200); // 2% default
}

#[test]
fn test_set_fee_percentage() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let (usdc_token, _) = create_token_contract(&env, &admin);
    let client = create_lockedin_contract(&env, &admin, &usdc_token);

    client.set_fee_percentage(&500); // 5%

    assert_eq!(client.get_fee_percentage(), 500);
}

#[test]
#[should_panic(expected = "#50")]
fn test_set_fee_percentage_too_high() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let (usdc_token, _) = create_token_contract(&env, &admin);
    let client = create_lockedin_contract(&env, &admin, &usdc_token);

    client.set_fee_percentage(&501); // Over 5%
}

#[test]
fn test_create_cycle() {
    let env = Env::default();
    env.mock_all_auths();
    set_ledger_time(&env, 1000, 100);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let (usdc_token, token) = create_token_contract(&env, &admin);
    let client = create_lockedin_contract(&env, &admin, &usdc_token);

    let amount = 100_000_000_000_000_000_000i128; // 100 USDC
    mint_tokens(&env, &token, &user, amount);

    let cycle_id = client.create_cycle(&user, &3, &amount);

    assert_eq!(cycle_id, 0);

    let cycle = client.get_cycle(&cycle_id);
    assert_eq!(cycle.user, user);
    assert_eq!(cycle.total_deposited, amount);
    assert_eq!(cycle.fee_percentage, 200);
    assert_eq!(cycle.is_active, true);
}

#[test]
#[should_panic(expected = "#14")]
fn test_create_cycle_invalid_duration_zero() {
    let env = Env::default();
    env.mock_all_auths();
    set_ledger_time(&env, 1000, 100);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let (usdc_token, token) = create_token_contract(&env, &admin);
    let client = create_lockedin_contract(&env, &admin, &usdc_token);

    let amount = 100_000_000_000_000_000_000i128;
    mint_tokens(&env, &token, &user, amount);

    client.create_cycle(&user, &0, &amount); // 0 months
}

#[test]
#[should_panic(expected = "#14")]
fn test_create_cycle_invalid_duration_too_long() {
    let env = Env::default();
    env.mock_all_auths();
    set_ledger_time(&env, 1000, 100);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let (usdc_token, token) = create_token_contract(&env, &admin);
    let client = create_lockedin_contract(&env, &admin, &usdc_token);

    let amount = 100_000_000_000_000_000_000i128;
    mint_tokens(&env, &token, &user, amount);

    client.create_cycle(&user, &13, &amount); // 13 months
}

#[test]
fn test_get_user_cycles() {
    let env = Env::default();
    env.mock_all_auths();
    set_ledger_time(&env, 1000, 100);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let (usdc_token, token) = create_token_contract(&env, &admin);
    let client = create_lockedin_contract(&env, &admin, &usdc_token);

    let amount = 50_000_000_000_000_000_000i128;
    mint_tokens(&env, &token, &user, amount * 3);

    let id1 = client.create_cycle(&user, &3, &amount);
    let id2 = client.create_cycle(&user, &6, &amount);
    let id3 = client.create_cycle(&user, &12, &amount);

    let user_cycles = client.get_user_cycles(&user);

    assert_eq!(user_cycles.len(), 3);
    assert_eq!(user_cycles.get(0).unwrap(), id1);
    assert_eq!(user_cycles.get(1).unwrap(), id2);
    assert_eq!(user_cycles.get(2).unwrap(), id3);
}

#[test]
fn test_add_bill() {
    let env = Env::default();
    env.mock_all_auths();
    set_ledger_time(&env, 1000, 100);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let (usdc_token, token) = create_token_contract(&env, &admin);
    let client = create_lockedin_contract(&env, &admin, &usdc_token);

    let amount = 100_000_000_000_000_000_000i128;
    mint_tokens(&env, &token, &user, amount);

    let cycle_id = client.create_cycle(&user, &3, &amount);

    let bill_name = String::from_str(&env, "Electricity");
    let bill_amount = 20_000_000_000_000_000_000i128;
    let due_date = 1000 + (10 * 24 * 60 * 60); // 10 days
    let recurrence_calendar = Vec::new(&env);

    let bill_id = client.add_bill(
        &cycle_id,
        &bill_name,
        &bill_amount,
        &due_date,
        &false,
        &recurrence_calendar,
        &false,
    );

    assert_eq!(bill_id, 0);

    let bill = client.get_bill(&bill_id);
    assert_eq!(bill.name, bill_name);
    assert_eq!(bill.amount, bill_amount);
    assert_eq!(bill.is_paid, false);
    assert_eq!(bill.is_emergency, false);
}

#[test]
fn test_add_emergency_bill() {
    let env = Env::default();
    env.mock_all_auths();
    set_ledger_time(&env, 1000, 100);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let (usdc_token, token) = create_token_contract(&env, &admin);
    let client = create_lockedin_contract(&env, &admin, &usdc_token);

    let amount = 100_000_000_000_000_000_000i128;
    mint_tokens(&env, &token, &user, amount);

    let cycle_id = client.create_cycle(&user, &3, &amount);

    set_ledger_time(&env, 1000 + (31 * 24 * 60 * 60), 100 + (17280 * 31));

    let bill_name = String::from_str(&env, "Emergency");
    let bill_amount = 5_000_000_000_000_000_000i128; // 5% of deposited
    let due_date = 1000 + (33 * 24 * 60 * 60); // 33 days
    let recurrence_calendar = Vec::new(&env);

    let bill_id = client.add_bill(
        &cycle_id,
        &bill_name,
        &bill_amount,
        &due_date,
        &false,
        &recurrence_calendar,
        &true,
    );

    let bill = client.get_bill(&bill_id);
    assert_eq!(bill.is_emergency, true);
}

#[test]
fn test_pay_bill() {
    let env = Env::default();
    env.mock_all_auths();
    set_ledger_time(&env, 1000, 100);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let (usdc_token, token) = create_token_contract(&env, &admin);
    let client = create_lockedin_contract(&env, &admin, &usdc_token);

    let amount = 100_000_000_000_000_000_000i128;
    mint_tokens(&env, &token, &user, amount);

    let cycle_id = client.create_cycle(&user, &3, &amount);

    let bill_amount = 10_000_000_000_000_000_000i128;
    let due_date = 1000 + (10 * 24 * 60 * 60); // 10 days

    let bill_id = client.add_bill(
        &cycle_id,
        &String::from_str(&env, "Water"),
        &bill_amount,
        &due_date,
        &false,
        &Vec::new(&env),
        &false,
    );

    // Fast forward to due date
    set_ledger_time(&env, due_date + 1, 100 + (17280 * 11));

    client.pay_bill(&bill_id);

    let bill = client.get_bill(&bill_id);
    assert_eq!(bill.is_paid, true);
}

#[test]
#[should_panic(expected = "#32")]
fn test_pay_bill_not_due() {
    let env = Env::default();
    env.mock_all_auths();
    set_ledger_time(&env, 1000, 100);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let (usdc_token, token) = create_token_contract(&env, &admin);
    let client = create_lockedin_contract(&env, &admin, &usdc_token);

    let amount = 100_000_000_000_000_000_000i128;
    mint_tokens(&env, &token, &user, amount);

    let cycle_id = client.create_cycle(&user, &3, &amount);

    let due_date = 1000 + (10 * 24 * 60 * 60);
    let bill_id = client.add_bill(
        &cycle_id,
        &String::from_str(&env, "Water"),
        &10_000_000_000_000_000_000i128,
        &due_date,
        &false,
        &Vec::new(&env),
        &false,
    );

    client.pay_bill(&bill_id);
}

#[test]
fn test_end_cycle() {
    let env = Env::default();
    env.mock_all_auths();
    set_ledger_time(&env, 1000, 100);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let (usdc_token, token) = create_token_contract(&env, &admin);
    let client = create_lockedin_contract(&env, &admin, &usdc_token);

    let amount = 100_000_000_000_000_000_000i128;
    mint_tokens(&env, &token, &user, amount);

    let cycle_id = client.create_cycle(&user, &3, &amount);

    // Fast forward past 3 months
    set_ledger_time(&env, 1000 + (91 * 24 * 60 * 60), 100 + (17280 * 91));

    client.end_cycle(&cycle_id);

    let cycle = client.get_cycle(&cycle_id);
    assert_eq!(cycle.is_active, false);
}

#[test]
#[should_panic(expected = "#30")]
fn test_end_cycle_too_early() {
    let env = Env::default();
    env.mock_all_auths();
    set_ledger_time(&env, 1000, 100);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let (usdc_token, token) = create_token_contract(&env, &admin);
    let client = create_lockedin_contract(&env, &admin, &usdc_token);

    let amount = 100_000_000_000_000_000_000i128;
    mint_tokens(&env, &token, &user, amount);

    let cycle_id = client.create_cycle(&user, &3, &amount);

    client.end_cycle(&cycle_id);
}

#[test]
fn test_cancel_bill() {
    let env = Env::default();
    env.mock_all_auths();
    set_ledger_time(&env, 1000, 100);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let (usdc_token, token) = create_token_contract(&env, &admin);
    let client = create_lockedin_contract(&env, &admin, &usdc_token);

    let amount = 100_000_000_000_000_000_000i128;
    mint_tokens(&env, &token, &user, amount);

    let cycle_id = client.create_cycle(&user, &3, &amount);

    let due_date = 1000 + (10 * 24 * 60 * 60);
    let bill_id = client.add_bill(
        &cycle_id,
        &String::from_str(&env, "Internet"),
        &15_000_000_000_000_000_000i128,
        &due_date,
        &false,
        &Vec::new(&env),
        &false,
    );

    // Advance to another month to cancel
    set_ledger_time(&env, 1000 + (31 * 24 * 60 * 60), 100 + (17280 * 31));

    client.cancel_bill(&bill_id);

}

#[test]
fn test_get_cycle_bills() {
    let env = Env::default();
    env.mock_all_auths();
    set_ledger_time(&env, 1000, 100);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let (usdc_token, token) = create_token_contract(&env, &admin);
    let client = create_lockedin_contract(&env, &admin, &usdc_token);

    let amount = 100_000_000_000_000_000_000i128;
    mint_tokens(&env, &token, &user, amount);

    let cycle_id = client.create_cycle(&user, &3, &amount);

    // add multiple bills in the same month-
    let due_date_1 = 1000 + (10 * 24 * 60 * 60); // 10 days
    let due_date_2 = 1000 + (15 * 24 * 60 * 60); // 15 days

    client.add_bill(
        &cycle_id,
        &String::from_str(&env, "Bill 1"),
        &10_000_000_000_000_000_000i128,
        &due_date_1,
        &false,
        &Vec::new(&env),
        &false,
    );

    client.add_bill(
        &cycle_id,
        &String::from_str(&env, "Bill 2"),
        &15_000_000_000_000_000_000i128,
        &due_date_2,
        &false,
        &Vec::new(&env),
        &false,
    );

    let bills = client.get_cycle_bills(&cycle_id);

    assert_eq!(bills.len(), 2);
}
