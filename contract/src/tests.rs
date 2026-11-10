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
const CENT: u128 = U / 100;

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}

fn hash(c: char) -> String {
    c.to_string().repeat(64)
}

/// Each test sponsor runs an agent called "expert"; `ag(A)` is its id.
fn ag(a: &str) -> String {
    format!("{a}/expert")
}

fn register(hash: &str, rate: u128, max_cost: u128, size_mb: u32) -> String {
    named("expert", hash, rate, max_cost, size_mb)
}

fn named(name: &str, hash: &str, rate: u128, max_cost: u128, size_mb: u32) -> String {
    let card = json!({ "name": name, "skills": "solidity audits", "rate": U128(rate), "max_cost": U128(max_cost), "hash": hash, "size_mb": size_mb });
    json!({ "Register": card }).to_string()
}

fn revenue(job: &str) -> String {
    json!({ "Revenue": { "job": job } }).to_string()
}

fn deposit(c: &mut Contract, from: &str, amount: u128, msg: String) {
    call(USDC, 0);
    assert_eq!(c.ft_on_transfer(acc(from), U128(amount), msg).0, 0);
}

fn out(cost: u128, delivered: bool, violation: bool) -> Outcome {
    Outcome { cost: U128(cost), delivered, violation }
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
        audit_base: U128(0),
        audit_per_mb: U128(0),
        min_deposit: U128(U),
        run_secs: 600,
        pay_secs: 86_400,
    }
}

/// Two active agents with 10 USDC each and a 1 USDC cost cap: A asks 3 USDC a job, B 2 USDC.
fn setup() -> Contract {
    call(DAO, 0);
    let mut c = Contract::new(acc(USDC), cfg());
    for (a, rate) in [(A, 3 * U), (B, 2 * U)] {
        deposit(&mut c, a, 10 * U, register(&hash('a'), rate, U, 1));
        call(RUNNER, 0);
        c.review(ag(a), registration(&c, a), true);
    }
    c
}

fn registration(c: &Contract, a: &str) -> u64 {
    c.agent(ag(a)).unwrap().card.registration
}

/// Everything the contract owes is in exactly one place: a balance or a hold.
fn assert_books(c: &Contract, jobs: &[&str]) {
    let balances: u128 = [DAO, OP, A, B, X].iter().map(|a| bal(c, a)).sum();
    let holds: u128 = jobs.iter().filter_map(|j| c.job(j.to_string())).flat_map(|j| j.slots).map(|s| s.hold.0).sum();
    assert_eq!(balances + holds, c.total().0);
}

fn assign_both(c: &mut Contract) {
    call(RUNNER, 1);
    c.assign("j1".into(), vec![ag(A), ag(B)]);
}

#[test]
fn a_job_pays_inference_to_the_operator_and_rates_to_the_agents() {
    let mut c = setup();
    assign_both(&mut c);
    assert_eq!((bal(&c, A), bal(&c, B)), (9 * U, 9 * U));
    let slots = c.job("j1".into()).unwrap().slots;
    assert_eq!((slots[0].pay.0, slots[1].pay.0), (3 * U, 2 * U)); // rates fixed from the cards
    assert_books(&c, &["j1"]);

    c.finish("j1".into(), vec![out(2 * CENT, true, false), out(CENT, true, false)]);
    assert_eq!((bal(&c, A), bal(&c, B), bal(&c, OP)), (10 * U - 2 * CENT, 10 * U - CENT, 3 * CENT));
    assert_books(&c, &["j1"]);

    deposit(&mut c, OP, 6 * U, revenue("j1")); // 5% fee 0.3, agents 3 + 2, the operator keeps 0.7
    assert!(c.job("j1".into()).is_none());
    assert_eq!(bal(&c, DAO), 3 * U / 10);
    assert_eq!((bal(&c, A), bal(&c, B)), (13 * U - 2 * CENT, 12 * U - CENT));
    assert_eq!(bal(&c, OP), 3 * CENT + 7 * U / 10);
    assert_books(&c, &[]);
}

#[test]
fn an_agent_that_did_not_deliver_gets_nothing_and_its_share_goes_to_the_operator_not_to_the_others() {
    let mut c = setup();
    assign_both(&mut c);
    c.finish("j1".into(), vec![out(CENT, false, false), out(CENT, true, false)]);
    deposit(&mut c, OP, 6 * U, revenue("j1"));
    assert_eq!(bal(&c, A), 10 * U - CENT); // only its own cost
    assert_eq!(bal(&c, B), 12 * U - CENT); // exactly its rate, not more
    assert_eq!(bal(&c, OP), 2 * CENT + 6 * U - 3 * U / 10 - 2 * U);
    assert_books(&c, &[]);
}

#[test]
fn revenue_below_the_rates_is_shared_pro_rata() {
    let mut c = setup();
    assign_both(&mut c);
    c.finish("j1".into(), vec![out(0, true, false), out(0, true, false)]);
    deposit(&mut c, OP, 4 * U, revenue("j1")); // fee 0.2, 3.8 for rates of 3 and 2
    assert_eq!((bal(&c, A), bal(&c, B)), (10 * U + 2_280_000, 10 * U + 1_520_000));
    assert_eq!(bal(&c, OP), 0);
    assert_books(&c, &[]);
}

#[test]
fn a_violation_costs_the_pay_and_suspends_but_enriches_nobody() {
    let mut c = setup();
    assign_both(&mut c);
    c.finish("j1".into(), vec![out(CENT, true, true), out(CENT, true, false)]);
    assert_eq!(c.agent(ag(A)).unwrap().card.status, Status::Suspended);
    assert_eq!((bal(&c, A), bal(&c, DAO)), (10 * U - CENT, 0)); // the hold came back, minus the cost
    deposit(&mut c, OP, 6 * U, revenue("j1"));
    assert_eq!(bal(&c, A), 10 * U - CENT);
    assert_eq!(bal(&c, DAO), 6 * U / 20); // only the fee
    assert_books(&c, &[]);
}

#[test]
#[should_panic(expected = "no job")]
fn a_job_nobody_is_owed_for_refuses_revenue() {
    let mut c = setup();
    assign_both(&mut c);
    c.finish("j1".into(), vec![out(0, false, false), out(0, false, false)]);
    assert!(c.job("j1".into()).is_none());
    deposit(&mut c, OP, U, revenue("j1"));
}

#[test]
fn a_stuck_job_returns_holds_after_run_secs() {
    let mut c = setup();
    call(RUNNER, 100);
    c.assign("j1".into(), vec![ag(A), ag(B)]);
    call(X, 700);
    c.close("j1".into());
    assert_eq!((bal(&c, A), bal(&c, B)), (10 * U, 10 * U));
    assert_books(&c, &[]);
}

#[test]
#[should_panic(expected = "too early")]
fn a_stuck_job_cannot_be_closed_early() {
    let mut c = setup();
    call(RUNNER, 100);
    c.assign("j1".into(), vec![ag(A)]);
    call(X, 699);
    c.close("j1".into());
}

#[test]
fn an_unpaid_job_expires_after_pay_secs() {
    let mut c = setup();
    call(RUNNER, 100);
    c.assign("j1".into(), vec![ag(A)]);
    c.finish("j1".into(), vec![out(0, true, false)]);
    call(X, 100 + 86_400);
    c.close("j1".into());
    assert!(c.job("j1".into()).is_none());
    assert_books(&c, &[]);
}

#[test]
fn a_bounced_withdrawal_stays_in_the_balance() {
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
fn anyone_can_top_up_an_agent() {
    let mut c = setup();
    deposit(&mut c, X, U, json!({ "TopUp": { "agent": ag(A) } }).to_string());
    assert_eq!(bal(&c, A), 11 * U);
    assert_books(&c, &[]);
}

#[test]
fn registration_pays_the_audit_fee_by_size() {
    let mut c = setup();
    call(DAO, 1);
    c.set_config(Config { audit_base: U128(U / 10), audit_per_mb: U128(U / 20), ..cfg() });
    deposit(&mut c, X, 2 * U, register(&hash('c'), U, U, 4)); // 0.1 + 4 × 0.05 = 0.3
    assert_eq!((bal(&c, OP), bal(&c, X)), (3 * U / 10, 2 * U - 3 * U / 10));
    assert_books(&c, &[]);
}

#[test]
fn re_registering_needs_a_new_review() {
    let mut c = setup();
    deposit(&mut c, A, U, register(&hash('b'), U, U, 1));
    let a = c.agent(ag(A)).unwrap();
    assert_eq!((a.card.status, a.card.hash, a.balance.0), (Status::Pending, hash('b'), 11 * U));
}

#[test]
#[should_panic(expected = "stale review")]
fn a_review_of_a_replaced_card_is_refused() {
    let mut c = setup();
    deposit(&mut c, X, 2 * U, register(&hash('c'), U, U, 1));
    let audited = registration(&c, X);
    deposit(&mut c, X, 2 * U, register(&hash('c'), U, U, 1)); // same materials, a new card, while the audit runs
    call(RUNNER, 1);
    c.review(ag(X), audited, true);
}

#[test]
#[should_panic(expected = "deposit too small")]
fn the_deposit_must_cover_the_audit_fee_and_the_minimum() {
    let mut c = setup();
    call(DAO, 1);
    c.set_config(Config { audit_base: U128(U / 10), ..cfg() });
    deposit(&mut c, X, U, register(&hash('c'), U, U, 1));
}

#[test]
#[should_panic(expected = "skills empty or too long")]
fn the_card_is_short() {
    let mut c = setup();
    let msg = json!({ "Register": { "name": "x", "skills": "x".repeat(501), "rate": "1", "max_cost": "1", "hash": hash('c'), "size_mb": 1 } });
    deposit(&mut c, X, U, msg.to_string());
}

#[test]
#[should_panic(expected = "bad materials")]
fn materials_are_at_most_ten_megabytes() {
    let mut c = setup();
    deposit(&mut c, X, U, register(&hash('c'), U, U, 11));
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
    c.ft_on_transfer(acc(A), U128(U), register(&hash('a'), U, U, 1));
}

#[test]
#[should_panic(expected = "not allowed")]
fn only_the_runner_assigns() {
    let mut c = setup();
    call(OP, 1);
    c.assign("j1".into(), vec![ag(A)]);
}

#[test]
#[should_panic(expected = "agent not ready")]
fn a_pending_agent_cannot_work() {
    let mut c = setup();
    deposit(&mut c, X, U, register(&hash('c'), U, U, 1));
    call(RUNNER, 1);
    c.assign("j1".into(), vec![ag(X)]);
}

#[test]
#[should_panic(expected = "duplicate agent")]
fn an_agent_takes_one_place() {
    let mut c = setup();
    call(RUNNER, 1);
    c.assign("j1".into(), vec![ag(A), ag(A)]);
}

#[test]
#[should_panic(expected = "cost above hold")]
fn the_cost_is_capped_by_the_hold() {
    let mut c = setup();
    call(RUNNER, 1);
    c.assign("j1".into(), vec![ag(A)]);
    c.finish("j1".into(), vec![out(U + CENT, true, false)]);
}

#[test]
#[should_panic(expected = "cost off the step")]
fn the_cost_is_coarse() {
    let mut c = setup();
    call(RUNNER, 1);
    c.assign("j1".into(), vec![ag(A)]);
    c.finish("j1".into(), vec![out(1_234, true, false)]);
}

#[test]
#[should_panic(expected = "revenue comes from the operator")]
fn revenue_comes_only_from_the_operator() {
    let mut c = setup();
    call(RUNNER, 1);
    c.assign("j1".into(), vec![ag(A)]);
    c.finish("j1".into(), vec![out(0, true, false)]);
    deposit(&mut c, B, U, revenue("j1"));
}

#[test]
#[should_panic(expected = "bad amount")]
fn a_sponsor_cannot_take_held_money() {
    let mut c = setup();
    call(RUNNER, 1);
    c.assign("j1".into(), vec![ag(A)]);
    call(A, 2);
    let _ = c.withdraw(Some(U128(9 * U + 1)));
}

#[test]
fn split_is_pro_rata_and_adds_up() {
    assert_eq!(split(100, &[3, 1]), vec![75, 25]);
    assert_eq!(split(10, &[1, 2, 1]), vec![2, 6, 2]);
    let mut x: u64 = 0x2545F4914F6CDD1D;
    let mut rnd = |m: u64| {
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        x % m
    };
    for _ in 0..10_000 {
        let amount = rnd(1 << 60) as u128; // ~1e12 USDC: far above any real revenue, and amount × rate stays in u128
        let mut weights: Vec<u128> = (0..1 + rnd(32)).map(|_| rnd(3) as u128 * rnd(1 << 58) as u128).collect();
        weights[0] += 1;
        assert_eq!(split(amount, &weights).iter().sum::<u128>(), amount);
    }
}

#[test]
fn a_sponsor_runs_several_agents_on_one_balance_and_is_paid_for_each() {
    let mut c = setup();
    deposit(&mut c, A, 2 * U, named("second", &hash('b'), U, U, 1));
    call(RUNNER, 1);
    c.review("a.near/second".into(), c.agent("a.near/second".into()).unwrap().card.registration, true);
    c.assign("j1".into(), vec![ag(A), "a.near/second".into()]);
    assert_eq!(bal(&c, A), 12 * U - 2 * U); // both holds from the one balance
    c.finish("j1".into(), vec![out(CENT, true, false), out(CENT, true, false)]);
    deposit(&mut c, OP, 6 * U, revenue("j1"));
    assert_eq!(bal(&c, A), 12 * U - 2 * CENT + 3 * U + U); // rate 3 and rate 1, both to the owner
    assert_books(&c, &[]);
}

#[test]
#[should_panic(expected = "name: 1-32 of a-z, 0-9 and -")]
fn an_agent_name_is_plain() {
    let mut c = setup();
    deposit(&mut c, A, 2 * U, named("Bad/Name", &hash('b'), U, U, 1));
}
