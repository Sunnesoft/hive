//! Swarm-for-Hire ledger: holds one token (USDC) and enforces the money rules, nothing else.
//!
//! - Every account has one balance. A sponsor's balance is its agent's budget.
//! - A job holds each agent's `max_cost`. On finish the operator gets the actual inference cost
//!   and the rest goes back to the agent, or to the owner if the agent broke the rules.
//! - Customer revenue for a finished job is split by the judge's weights, minus the owner's fee.
//! - A stuck job can be closed by anyone after a timeout; every balance can be withdrawn.
//!
//! Judging, disputes and the customer escrow live off-chain: the attested runner and Agent Market.
#[cfg(test)]
mod tests;

use near_sdk::json_types::U128;
use near_sdk::serde_json::{self, json, Value};
use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{env, ext_contract, is_promise_success, near, require};
use near_sdk::{AccountId, Gas, NearToken, PanicOnDefault, Promise};

const MAX_SLOTS: usize = 8;
const MAX_FEE_BPS: u16 = 2_000;
const MAX_SECS: u64 = 90 * 86_400;
const GAS: Gas = Gas::from_tgas(10);

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Config {
    pub owner: AccountId,    // DAO / multisig: sets config, receives fees and forfeits
    pub runner: AccountId,   // attested TEE key: reviews agents, opens and settles jobs
    pub operator: AccountId, // pays NEAR AI and forwards Agent Market payouts; reimbursed for inference
    pub fee_bps: u16,        // owner's cut of revenue
    pub review_fee: U128,    // to the operator on every registration: a review costs inference
    pub min_deposit: U128,   // the least a registration brings
    pub run_secs: u64,       // an unfinished job may be closed by anyone after this; holds return
    pub pay_secs: u64,       // a finished job waits this long for revenue, then may be closed
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Status {
    Pending,
    Active,
    Suspended,
}

/// One agent per sponsor account. Its budget is the sponsor's balance.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Agent {
    pub manifest: String, // sha256 hex of the manifest file (= digest of its IPFS CIDv1 raw)
    pub max_cost: U128,   // the most one job may take
    pub status: Status,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Slot {
    pub agent: AccountId,
    pub hold: U128,  // reserved at assign, settled at finish
    pub weight: u32, // share of revenue, set at finish
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Job {
    pub at: u64, // seconds: assign time, then finish time
    pub done: bool,
    pub slots: Vec<Slot>,
}

#[near(serializers = [json])]
pub struct Outcome {
    pub cost: U128, // actual inference spend, reimbursed to the operator
    pub weight: u32,
    pub violation: bool, // the rest of the hold is forfeited and the agent suspended
}

/// `msg` of `ft_transfer_call`.
#[near(serializers = [json])]
pub enum Msg {
    Register { manifest: String, max_cost: U128 },
    TopUp { agent: AccountId },
    Revenue { job: String },
}

#[near(serializers = [json])]
pub struct AgentView {
    pub account: AccountId,
    pub manifest: String,
    pub max_cost: U128,
    pub status: Status,
    pub balance: U128,
}

#[allow(dead_code)] // only the generated `ext_ft` is used
#[ext_contract(ext_ft)]
trait Ft {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    token: AccountId,
    cfg: Config,
    balances: LookupMap<AccountId, u128>,
    agents: IterableMap<AccountId, Agent>,
    jobs: LookupMap<String, Job>,
    total: u128, // = balances + holds; must never exceed our token balance
}

#[near]
impl Contract {
    #[init]
    pub fn new(token: AccountId, cfg: Config) -> Self {
        check(&cfg);
        let (balances, agents, jobs) = (LookupMap::new(b"b"), IterableMap::new(b"a"), LookupMap::new(b"j"));
        Self { token, cfg, balances, agents, jobs, total: 0 }
    }

    // ---- money in: `ft_transfer_call` on the token; a panic here refunds the sender ----

    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> U128 {
        require!(env::predecessor_account_id() == self.token, "wrong token");
        match serde_json::from_str(&msg).expect("bad msg") {
            Msg::Register { manifest, max_cost } => self.register(sender_id, amount.0, manifest, max_cost),
            Msg::TopUp { agent } => {
                require!(self.agents.contains_key(&agent), "no agent");
                self.credit(&agent, amount.0);
                emit("top_up", json!({ "agent": agent, "amount": amount }));
            }
            Msg::Revenue { job } => self.revenue(sender_id, amount.0, job),
        }
        self.total += amount.0;
        U128(0)
    }

    // ---- runner ----

    /// Activates or suspends a pending agent. `manifest` pins what was reviewed: if the sponsor
    /// re-registered meanwhile, the verdict is stale and refused.
    pub fn review(&mut self, agent: AccountId, manifest: String, allow: bool) {
        self.only(&self.cfg.runner);
        let a = self.agent_mut(&agent);
        require!(a.status == Status::Pending && a.manifest == manifest, "stale review");
        a.status = if allow { Status::Active } else { Status::Suspended };
        emit("review", json!({ "agent": agent, "manifest": manifest, "allow": allow }));
    }

    /// Holds `max_cost` from each agent's balance for the job.
    pub fn assign(&mut self, job: String, agents: Vec<AccountId>) {
        self.only(&self.cfg.runner);
        require!((1..=64).contains(&job.len()) && !self.jobs.contains_key(&job), "bad job id");
        require!((1..=MAX_SLOTS).contains(&agents.len()), "bad slot count");
        let mut slots: Vec<Slot> = Vec::with_capacity(agents.len());
        for agent in agents {
            require!(slots.iter().all(|s| s.agent != agent), "duplicate agent");
            let a = self.agents.get(&agent).expect("no agent");
            let (hold, balance) = (a.max_cost, self.balance_of(&agent));
            require!(a.status == Status::Active && balance >= hold.0, "agent not ready");
            self.set_balance(&agent, balance - hold.0);
            slots.push(Slot { agent, hold, weight: 0 });
        }
        emit("assign", json!({ "job": job, "agents": slots.iter().map(|s| &s.agent).collect::<Vec<_>>() }));
        self.jobs.insert(job, Job { at: now(), done: false, slots });
    }

    /// Settles holds: cost to the operator, the rest back to the agent, or to the owner on a
    /// violation. A job nobody earned in is removed, so revenue for it is refused.
    pub fn finish(&mut self, job: String, outcomes: Vec<Outcome>) {
        self.only(&self.cfg.runner);
        let mut j = self.jobs.remove(&job).expect("no job");
        require!(!j.done && outcomes.len() == j.slots.len(), "bad outcomes");
        let (owner, operator) = (self.cfg.owner.clone(), self.cfg.operator.clone());
        for (s, o) in j.slots.iter_mut().zip(outcomes) {
            require!(o.cost.0 <= s.hold.0, "cost above hold");
            let rest = s.hold.0 - o.cost.0;
            self.credit(&operator, o.cost.0);
            if o.violation {
                self.credit(&owner, rest);
                self.agent_mut(&s.agent).status = Status::Suspended;
            } else {
                self.credit(&s.agent, rest);
                s.weight = o.weight;
            }
            s.hold = U128(0);
        }
        let earned = j.slots.iter().any(|s| s.weight > 0);
        emit("finish", json!({ "job": job, "earned": earned }));
        if earned {
            (j.at, j.done) = (now(), true);
            self.jobs.insert(job, j);
        }
    }

    // ---- anyone ----

    /// Closes a stuck job: unfinished after `run_secs` (holds go back) or unpaid after `pay_secs`.
    pub fn close(&mut self, job: String) {
        let j = self.jobs.get(&job).expect("no job");
        require!(now() >= j.at + if j.done { self.cfg.pay_secs } else { self.cfg.run_secs }, "too early");
        for s in self.jobs.remove(&job).unwrap().slots {
            self.credit(&s.agent, s.hold.0);
        }
        emit("close", json!({ "job": job }));
    }

    /// Sends `amount` (all if omitted) of the caller's balance. Held money is not in the balance.
    pub fn withdraw(&mut self, amount: Option<U128>) -> Promise {
        let me = env::predecessor_account_id();
        let have = self.balance_of(&me);
        let amount = amount.map_or(have, |a| a.0);
        require!(amount > 0 && amount <= have, "bad amount");
        self.set_balance(&me, have - amount);
        self.total -= amount;
        ext_ft::ext(self.token.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS)
            .ft_transfer(me.clone(), U128(amount), None)
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS).on_withdraw(me, U128(amount)))
    }

    #[private]
    pub fn on_withdraw(&mut self, account: AccountId, amount: U128) {
        let ok = is_promise_success();
        if !ok {
            self.credit(&account, amount.0); // e.g. not registered with the token: the money stays here
            self.total += amount.0;
        }
        emit("withdraw", json!({ "account": account, "amount": amount, "ok": ok }));
    }

    // ---- owner ----

    pub fn set_config(&mut self, cfg: Config) {
        self.only(&self.cfg.owner);
        check(&cfg);
        self.cfg = cfg;
    }

    // ---- views ----

    pub fn config(&self) -> Config {
        self.cfg.clone()
    }
    pub fn agent(&self, account: AccountId) -> Option<AgentView> {
        self.agents.get(&account).map(|a| self.view(&account, a))
    }
    pub fn agents(&self, from: u32, limit: u32) -> Vec<AgentView> {
        let page = self.agents.iter().skip(from as usize).take(limit.min(100) as usize);
        page.map(|(id, a)| self.view(id, a)).collect()
    }
    pub fn job(&self, job: String) -> Option<Job> {
        self.jobs.get(&job).cloned()
    }
    pub fn balance(&self, account: AccountId) -> U128 {
        U128(self.balance_of(&account))
    }
    /// Everything the contract owes. Monitoring compares it with `ft_balance_of(contract)`.
    pub fn total(&self) -> U128 {
        U128(self.total)
    }
}

impl Contract {
    fn register(&mut self, sponsor: AccountId, amount: u128, manifest: String, max_cost: U128) {
        require!(is_sha256_hex(&manifest), "manifest must be sha256 hex");
        require!(max_cost.0 > 0 && amount >= self.cfg.min_deposit.0, "deposit too small");
        let fee = self.cfg.review_fee.0;
        self.credit(&self.cfg.operator.clone(), fee);
        self.credit(&sponsor, amount - fee);
        self.agents.insert(sponsor.clone(), Agent { manifest: manifest.clone(), max_cost, status: Status::Pending });
        emit("register", json!({ "agent": sponsor, "manifest": manifest, "max_cost": max_cost, "fee": U128(fee) }));
    }

    fn revenue(&mut self, sender: AccountId, amount: u128, job: String) {
        require!(sender == self.cfg.operator, "revenue comes from the operator");
        let j = self.jobs.remove(&job).expect("no job");
        require!(j.done, "job not finished");
        let fee = amount * self.cfg.fee_bps as u128 / 10_000;
        self.credit(&self.cfg.owner.clone(), fee);
        let parts = split(amount - fee, &j.slots.iter().map(|s| s.weight).collect::<Vec<_>>());
        for (s, part) in j.slots.iter().zip(&parts) {
            self.credit(&s.agent, *part);
        }
        emit(
            "revenue",
            json!({ "job": job, "amount": U128(amount), "fee": U128(fee), "parts": parts.into_iter().map(U128).collect::<Vec<_>>() }),
        );
    }

    fn only(&self, who: &AccountId) {
        require!(&env::predecessor_account_id() == who, "not allowed");
    }
    fn agent_mut(&mut self, id: &AccountId) -> &mut Agent {
        self.agents.get_mut(id).expect("no agent")
    }
    fn view(&self, account: &AccountId, a: &Agent) -> AgentView {
        let (manifest, max_cost, status) = (a.manifest.clone(), a.max_cost, a.status);
        AgentView { account: account.clone(), manifest, max_cost, status, balance: U128(self.balance_of(account)) }
    }
    fn balance_of(&self, id: &AccountId) -> u128 {
        self.balances.get(id).copied().unwrap_or(0)
    }
    fn set_balance(&mut self, id: &AccountId, amount: u128) {
        if amount == 0 {
            self.balances.remove(id); // frees storage
        } else {
            self.balances.insert(id.clone(), amount);
        }
    }
    fn credit(&mut self, id: &AccountId, amount: u128) {
        self.set_balance(id, self.balance_of(id) + amount);
    }
}

fn check(cfg: &Config) {
    require!(cfg.fee_bps <= MAX_FEE_BPS, "fee too high");
    require!(cfg.review_fee.0 <= cfg.min_deposit.0, "review fee above min deposit");
    require!(cfg.run_secs <= MAX_SECS && cfg.pay_secs <= MAX_SECS, "timeout too long");
}

/// Splits `amount` pro rata to `weights` (at least one is above 0: `finish` keeps only such jobs).
/// Rounding dust goes to the heaviest share, so the parts always add up to `amount`.
fn split(amount: u128, weights: &[u32]) -> Vec<u128> {
    let total: u128 = weights.iter().map(|&w| w as u128).sum();
    let mut parts: Vec<u128> = weights.iter().map(|&w| amount * w as u128 / total).collect();
    let top = (0..weights.len()).max_by_key(|&i| weights[i]).unwrap();
    parts[top] += amount - parts.iter().sum::<u128>();
    parts
}

/// NEP-297 event, so explorers and indexers can follow the money without our runner.
fn emit(event: &str, data: Value) {
    let e = json!({ "standard": "swarm", "version": "1.0.0", "event": event, "data": data });
    env::log_str(&format!("EVENT_JSON:{e}"));
}

fn now() -> u64 {
    env::block_timestamp() / 1_000_000_000
}

fn is_sha256_hex(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}
