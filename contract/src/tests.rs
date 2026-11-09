use super::*;

// -- harness: the only near-sdk specific part of the tests --
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{testing_env, PromiseResult};

fn call(who: &str, secs: u64) {
    testing_env!(VMContextBuilder::new()
        .current_account_id(acc(ME))
        .predecessor_account_id(acc(who))
        .block_timestamp(secs * 1_000_000_000)
        .build());
}

#[allow(deprecated)]
fn callback_failed() {
    let ctx = VMContextBuilder::new().current_account_id(acc(ME)).predecessor_account_id(acc(ME)).build();
    near_sdk::test_utils::testing_env_with_promise_results(ctx, PromiseResult::Failed);
}
// -- end harness --

const ME: &str = "swarm.near";
const USDC: &str = "usdc.near";
const DAO: &str = "dao.near";
const RUNNER: &str = "runner.near";
const OP: &str = "op.near";
const A: &str = "a.near";
const B: &str = "b.near";
const X: &str = "x.near";
const U: u128 = 1_000_000; // 1 USDC

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}

fn hash(c: char) -> String {
    c.to_string().repeat(64)
}

fn register(manifest: &str, max_cost: u128) -> String {
    format!(r#"{{"Register":{{"manifest":"{manifest}","max_cost":"{max_cost}"}}}}"#)
}

fn revenue(job: &str) -> String {
    format!(r#"{{"Revenue":{{"job":"{job}"}}}}"#)
}

fn deposit(c: &mut Contract, from: &str, amount: u128, msg: String) {
    call(USDC, 0);
    assert_eq!(c.ft_on_transfer(acc(from), U128(amount), msg).0, 0);
}

fn out(cost: u128, weight: u32, violation: bool) -> Outcome {
    Outcome { cost: U128(cost), weight, violation }
}

fn bal(c: &Contract, a: &str) -> u128 {
    c.balance(acc(a)).0
}

fn cfg() -> Config {
    Config {
        owner: acc(DAO),
        runner: acc(RUNNER),
        operator: acc(OP),
        fee_bps: 500,
        review_fee: U128(0),
        min_deposit: U128(U),
        run_secs: 600,
        pay_secs: 86_400,
    }
}

/// Two active agents with 10 USDC each and a 2 USDC cap per job.
fn setup() -> Contract {
    call(DAO, 0);
    let mut c = Contract::new(acc(USDC), cfg());
    for a in [A, B] {
        deposit(&mut c, a, 10 * U, register(&hash('a'), 2 * U));
        call(RUNNER, 0);
        c.review(acc(a), hash('a'), true);
    }
    c
}

/// Everything the contract owes is in exactly one place: a balance or a hold.
fn assert_books(c: &Contract, jobs: &[&str]) {
    let balances: u128 = [DAO, OP, A, B, X].iter().map(|a| bal(c, a)).sum();
    let holds: u128 = jobs.iter().filter_map(|j| c.job(j.to_string())).flat_map(|j| j.slots).map(|s| s.hold.0).sum();
    assert_eq!(balances + holds, c.total().0);
}

#[test]
fn job_lifecycle_pays_costs_fee_and_weighted_revenue() {
    let mut c = setup();
    call(RUNNER, 1);
    c.assign("j1".into(), vec![acc(A), acc(B)]);
    assert_eq!((bal(&c, A), bal(&c, B)), (8 * U, 8 * U));
    assert_books(&c, &["j1"]);

    c.finish("j1".into(), vec![out(U, 3, false), out(U / 2, 1, false)]);
    assert_eq!((bal(&c, A), bal(&c, B)), (9 * U, 9 * U + U / 2));
    assert_eq!(bal(&c, OP), U + U / 2);
    assert_books(&c, &["j1"]);

    deposit(&mut c, OP, 10 * U, revenue("j1"));
    assert!(c.job("j1".into()).is_none());
    assert_eq!(bal(&c, DAO), U / 2); // 5% fee
    assert_eq!(bal(&c, A), 9 * U + 7_125_000); // 9.5 USDC split 3:1
    assert_eq!(bal(&c, B), 9 * U + U / 2 + 2_375_000);
    assert_books(&c, &[]);

    call(OP, 2);
    let _ = c.withdraw(None);
    assert_eq!(bal(&c, OP), 0); // took its 1.5 USDC reimbursement
    assert_books(&c, &[]);
}

#[test]
fn violation_forfeits_the_hold_and_suspends() {
    let mut c = setup();
    call(RUNNER, 1);
    c.assign("j1".into(), vec![acc(A), acc(B)]);
    c.finish("j1".into(), vec![out(U, 9, true), out(U, 1, false)]);
    assert_eq!(c.agent(acc(A)).unwrap().status, Status::Suspended);
    assert_eq!(bal(&c, A), 8 * U);
    assert_eq!(bal(&c, DAO), U);

    deposit(&mut c, OP, 10 * U, revenue("j1"));
    assert_eq!(bal(&c, A), 8 * U); // the violator's weight was dropped
    assert_eq!(bal(&c, B), 9 * U + 9_500_000);
    assert_books(&c, &[]);
}

#[test]
#[should_panic(expected = "no job")]
fn job_nobody_earned_in_refuses_revenue() {
    let mut c = setup();
    call(RUNNER, 1);
    c.assign("j1".into(), vec![acc(A)]);
    c.finish("j1".into(), vec![out(0, 0, false)]);
    assert!(c.job("j1".into()).is_none());
    deposit(&mut c, OP, U, revenue("j1"));
}

#[test]
fn stuck_job_returns_holds_after_timeout() {
    let mut c = setup();
    call(RUNNER, 100);
    c.assign("j1".into(), vec![acc(A), acc(B)]);
    call(B, 700);
    c.close("j1".into());
    assert_eq!((bal(&c, A), bal(&c, B)), (10 * U, 10 * U));
    assert_books(&c, &[]);
}

#[test]
#[should_panic(expected = "too early")]
fn stuck_job_cannot_be_closed_early() {
    let mut c = setup();
    call(RUNNER, 100);
    c.assign("j1".into(), vec![acc(A)]);
    call(B, 699);
    c.close("j1".into());
}

#[test]
fn unpaid_job_expires_after_pay_secs() {
    let mut c = setup();
    call(RUNNER, 100);
    c.assign("j1".into(), vec![acc(A)]);
    c.finish("j1".into(), vec![out(U, 5, false)]);
    call(B, 100 + 86_400);
    c.close("j1".into());
    assert!(c.job("j1".into()).is_none());
    assert_books(&c, &[]);
}

#[test]
fn bounced_withdrawal_stays_in_the_balance() {
    let mut c = setup();
    call(A, 1);
    let _ = c.withdraw(Some(U128(3 * U)));
    assert_eq!((bal(&c, A), c.total().0), (7 * U, 17 * U));
    callback_failed();
    c.on_withdraw(acc(A), U128(3 * U));
    assert_eq!((bal(&c, A), c.total().0), (10 * U, 20 * U));
    assert_books(&c, &[]);
}

#[test]
fn top_up_funds_an_existing_agent() {
    let mut c = setup();
    deposit(&mut c, X, U, format!(r#"{{"TopUp":{{"agent":"{A}"}}}}"#));
    assert_eq!(bal(&c, A), 11 * U);
    assert_books(&c, &[]);
}

#[test]
fn re_registering_needs_a_new_review() {
    let mut c = setup();
    deposit(&mut c, A, U, register(&hash('b'), U));
    let a = c.agent(acc(A)).unwrap();
    assert_eq!((a.status, a.max_cost.0, a.balance.0), (Status::Pending, U, 11 * U));
}

#[test]
#[should_panic(expected = "stale review")]
fn a_review_of_a_replaced_manifest_is_refused() {
    let mut c = setup();
    deposit(&mut c, A, U, register(&hash('b'), U)); // the sponsor swaps the manifest mid-review
    call(RUNNER, 1);
    c.review(acc(A), hash('a'), true);
}

#[test]
fn registration_pays_the_review_fee_to_the_operator() {
    let mut c = setup();
    call(DAO, 1);
    c.set_config(Config { review_fee: U128(U / 10), ..cfg() });
    deposit(&mut c, X, 2 * U, register(&hash('c'), U));
    assert_eq!((bal(&c, OP), bal(&c, X)), (U / 10, 2 * U - U / 10));
    assert_books(&c, &[]);
}

#[test]
#[should_panic(expected = "timeout too long")]
fn config_is_bounded() {
    let mut c = setup();
    call(DAO, 1);
    c.set_config(Config { run_secs: u64::MAX, ..cfg() });
}

#[test]
#[should_panic(expected = "wrong token")]
fn only_the_token_deposits() {
    let mut c = setup();
    call(A, 1);
    c.ft_on_transfer(acc(A), U128(U), register(&hash('a'), U));
}

#[test]
#[should_panic(expected = "deposit too small")]
fn registration_needs_min_deposit() {
    let mut c = setup();
    deposit(&mut c, X, U - 1, register(&hash('a'), U));
}

#[test]
#[should_panic(expected = "not allowed")]
fn only_the_runner_assigns() {
    let mut c = setup();
    call(OP, 1);
    c.assign("j1".into(), vec![acc(A)]);
}

#[test]
#[should_panic(expected = "agent not ready")]
fn pending_agent_cannot_work() {
    let mut c = setup();
    deposit(&mut c, X, U, register(&hash('a'), U));
    call(RUNNER, 1);
    c.assign("j1".into(), vec![acc(X)]);
}

#[test]
#[should_panic(expected = "duplicate agent")]
fn an_agent_takes_one_slot() {
    let mut c = setup();
    call(RUNNER, 1);
    c.assign("j1".into(), vec![acc(A), acc(A)]);
}

#[test]
#[should_panic(expected = "cost above hold")]
fn cost_is_capped_by_the_hold() {
    let mut c = setup();
    call(RUNNER, 1);
    c.assign("j1".into(), vec![acc(A)]);
    c.finish("j1".into(), vec![out(2 * U + 1, 1, false)]);
}

#[test]
#[should_panic(expected = "revenue comes from the operator")]
fn revenue_comes_only_from_the_operator() {
    let mut c = setup();
    call(RUNNER, 1);
    c.assign("j1".into(), vec![acc(A)]);
    c.finish("j1".into(), vec![out(0, 1, false)]);
    deposit(&mut c, B, 1, revenue("j1"));
}

#[test]
#[should_panic(expected = "bad amount")]
fn sponsor_cannot_take_held_money() {
    let mut c = setup();
    call(RUNNER, 1);
    c.assign("j1".into(), vec![acc(A)]);
    call(A, 2);
    let _ = c.withdraw(Some(U128(8 * U + 1)));
}

#[test]
fn split_is_pro_rata_and_adds_up() {
    assert_eq!(split(100, &[3, 1]), vec![75, 25]);
    assert_eq!(split(10, &[1, 2, 1]), vec![2, 6, 2]);
    assert_eq!(split(7, &[0, 5]), vec![0, 7]);
    let mut x: u64 = 0x2545F4914F6CDD1D;
    let mut rnd = |m: u64| {
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        x % m
    };
    for _ in 0..10_000 {
        let amount = rnd(u64::MAX) as u128 * rnd(1 << 40) as u128;
        let mut weights: Vec<u32> = (0..1 + rnd(8)).map(|_| rnd(3) as u32 * rnd(1_000) as u32).collect();
        weights[0] += 1; // finished jobs always have weight
        assert_eq!(split(amount, &weights).iter().sum::<u128>(), amount);
    }
}
