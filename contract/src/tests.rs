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
        overhead: U128(U / 2),
        overhead_per_agent: U128(U / 10),
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

/// Everything the contract owes is in exactly one place: a balance, a hold or an open order.
fn assert_books(c: &Contract, jobs: &[&str]) {
    let balances: u128 = [DAO, OP, A, B, X].iter().map(|a| bal(c, a)).sum();
    let holds: u128 = jobs.iter().filter_map(|j| c.job(j.to_string())).flat_map(|j| j.slots).map(|s| s.hold.0).sum();
    let orders: u128 = c.orders(0, 100).iter().map(|o| o.order.amount.0).sum();
    assert_eq!(balances + holds + orders, c.total().0);
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

// ---- orders: a customer's money and the hash of the work's description, in the contract itself ----

const BUYER: &str = "buyer.near";
const O1: &str = "order-1";

/// An order for the work whose salted description hashes to `c` repeated.
fn order(c: char) -> String {
    json!({ "Order": { "hash": hash(c) } }).to_string()
}

/// An order of `amount` that both agents worked on: `a` and `b` say whether each delivered.
fn worked_order(amount: u128, a: bool, b: bool) -> Contract {
    let mut c = setup();
    deposit(&mut c, BUYER, amount, order('d'));
    call(RUNNER, 1);
    c.assign(O1.into(), vec![ag(A), ag(B)]);
    c.finish(O1.into(), vec![out(CENT, a, false), out(CENT, b, false)]);
    c
}

#[test]
fn an_order_keeps_the_hash_of_the_work_and_the_money_until_it_is_settled() {
    let mut c = setup();
    deposit(&mut c, BUYER, 8 * U, order('d'));
    let o = c.order(O1.into()).unwrap();
    assert_eq!((o.customer, o.amount.0, o.hash), (acc(BUYER), 8 * U, hash('d')));
    assert_eq!(c.orders(0, 10).len(), 1);
    assert_eq!(c.total().0, 28 * U);
    assert_books(&c, &[]);
}

#[test]
fn an_order_pays_the_agents_that_delivered_and_sends_the_rest_back() {
    let mut c = worked_order(8 * U, true, true);
    c.deliver(O1.into(), hash('f'));
    // rates 3 + 2, overhead 0.5 + 0.1 a head: 5.7; with the owner's 5% on top the customer is charged 6
    assert!(c.order(O1.into()).is_none() && c.job(O1.into()).is_none());
    assert_eq!(bal(&c, DAO), 3 * U / 10);
    assert_eq!((bal(&c, A), bal(&c, B)), (13 * U - CENT, 12 * U - CENT));
    assert_eq!(bal(&c, OP), 2 * CENT + 7 * U / 10);
    assert_eq!((bal(&c, BUYER), c.total().0), (0, 26 * U)); // 2 USDC went straight back to the customer's wallet
    assert_books(&c, &[]);
}

#[test]
fn the_customer_does_not_pay_for_an_agent_that_did_not_deliver() {
    let mut c = worked_order(8 * U, true, false);
    c.deliver(O1.into(), hash('f'));
    // rate 3, overhead 0.5 + 0.1: 3.6; charged 3.6 / 0.95 rounded up = 3.789474; the fee is 0.189473
    assert_eq!((bal(&c, A), bal(&c, B)), (13 * U - CENT, 10 * U - CENT));
    assert_eq!((bal(&c, DAO), bal(&c, OP)), (189_473, 2 * CENT + 600_001));
    assert_eq!(c.total().0, 20 * U + 3_789_474);
    assert_books(&c, &[]);
}

#[test]
fn an_order_too_small_for_its_team_is_shared_pro_rata() {
    let mut c = worked_order(4 * U, true, true);
    c.deliver(O1.into(), hash('f'));
    assert_eq!(bal(&c, DAO), 2 * U / 10); // 5% of 4; the remaining 3.8 is split 3 : 2
    assert_eq!((bal(&c, A), bal(&c, B)), (10 * U - CENT + 2_280_000, 10 * U - CENT + 1_520_000));
    assert_eq!((bal(&c, OP), c.total().0), (2 * CENT, 24 * U));
    assert_books(&c, &[]);
}

#[test]
fn a_declined_order_is_sent_back_in_full() {
    let mut c = setup();
    deposit(&mut c, BUYER, 8 * U, order('d'));
    call(RUNNER, 1);
    c.refuse(O1.into(), "rejected".into());
    assert!(c.order(O1.into()).is_none());
    assert_eq!((bal(&c, BUYER), c.total().0), (0, 20 * U));
    assert_books(&c, &[]);
}

#[test]
fn a_declined_order_drops_its_finished_job_unpaid() {
    let mut c = worked_order(8 * U, true, true); // the agents delivered, but no answer could be composed
    c.refuse(O1.into(), "failed".into());
    assert!(c.job(O1.into()).is_none());
    assert_eq!((bal(&c, A), bal(&c, B), bal(&c, DAO)), (10 * U - CENT, 10 * U - CENT, 0));
    assert_eq!(c.total().0, 20 * U);
    assert_books(&c, &[]);
}

#[test]
#[should_panic(expected = "job running")]
fn an_order_is_not_refunded_while_its_agents_hold_money_for_it() {
    let mut c = setup();
    deposit(&mut c, BUYER, 8 * U, order('d'));
    call(RUNNER, 1);
    c.assign(O1.into(), vec![ag(A)]);
    c.refuse(O1.into(), "failed".into());
}

#[test]
fn an_unanswered_order_goes_back_after_run_secs() {
    let mut c = setup();
    deposit(&mut c, BUYER, 8 * U, order('d'));
    call(X, 600);
    c.cancel(O1.into());
    assert!(c.order(O1.into()).is_none());
    assert_eq!(c.total().0, 20 * U);
    assert_books(&c, &[]);
}

#[test]
#[should_panic(expected = "too early")]
fn an_order_cannot_be_cancelled_early() {
    let mut c = setup();
    deposit(&mut c, BUYER, 8 * U, order('d'));
    call(BUYER, 599);
    c.cancel(O1.into());
}

#[test]
fn a_refund_that_bounces_waits_in_the_customers_balance() {
    let mut c = setup();
    deposit(&mut c, BUYER, 8 * U, order('d'));
    call(RUNNER, 1);
    c.refuse(O1.into(), "rejected".into());
    callback_failed(); // the customer left the token meanwhile
    c.on_withdraw(acc(BUYER), U128(8 * U));
    assert_eq!((bal(&c, BUYER), c.total().0), (8 * U, 28 * U));
}

#[test]
fn an_order_id_is_never_used_twice() {
    let mut c = setup();
    deposit(&mut c, BUYER, 8 * U, order('d'));
    call(RUNNER, 1);
    c.refuse(O1.into(), "rejected".into());
    deposit(&mut c, BUYER, 8 * U, order('e'));
    assert!(c.order(O1.into()).is_none());
    assert_eq!(c.order("order-2".into()).unwrap().hash, hash('e'));
}

#[test]
#[should_panic(expected = "no job")]
fn an_order_nobody_delivered_for_cannot_be_charged() {
    let mut c = worked_order(8 * U, false, false); // the job is gone: the runner can only refuse
    c.deliver(O1.into(), hash('f'));
}

#[test]
#[should_panic(expected = "not allowed")]
fn only_the_runner_delivers() {
    let mut c = worked_order(8 * U, true, true);
    call(BUYER, 2);
    c.deliver(O1.into(), hash('f'));
}

#[test]
#[should_panic(expected = "not allowed")]
fn only_the_runner_declines() {
    let mut c = setup();
    deposit(&mut c, BUYER, 8 * U, order('d'));
    call(OP, 1);
    c.refuse(O1.into(), "rejected".into());
}

#[test]
#[should_panic(expected = "order too small")]
fn an_order_must_bring_more_than_the_overhead() {
    let mut c = setup();
    deposit(&mut c, BUYER, U / 2, order('d'));
}

#[test]
#[should_panic(expected = "bad brief hash")]
fn an_order_names_its_work_by_a_sha256() {
    let mut c = setup();
    deposit(&mut c, BUYER, 8 * U, json!({ "Order": { "hash": "Review my contract" } }).to_string());
}

#[test]
fn a_customer_may_publish_the_work_beside_the_hash_and_none_of_it_is_stored() {
    let mut c = setup();
    let msg = json!({ "Order": { "hash": hash('d'), "salt": "00ff", "brief": "Review my contract" } }).to_string();
    deposit(&mut c, BUYER, 8 * U, msg); // the text is in the transaction for anyone to read; the contract keeps the hash
    assert_eq!(c.order(O1.into()).unwrap().hash, hash('d'));
}
