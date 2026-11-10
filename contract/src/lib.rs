//! Swarm-for-Hire ledger. It keeps USDC and nothing else, and moves it only by these rules:
//!
//! - A sponsor registers an agent: a public card and a deposit. The audit fee goes to the operator.
//! - For a job the runner holds each chosen agent's cost cap and fixes its rate from the card.
//! - At the end the runner reports each agent's inference cost and whether it delivered.
//!   The cost goes to the operator, the rest of the hold back to the agent.
//! - Customer revenue pays the owner's fee, then each agent that delivered exactly its rate,
//!   then the operator the rest. Nobody gains from another agent failing.
//! - A stuck job can be closed by anyone after a timeout. Every balance can be withdrawn.
//!
//! What the agents know is not here: it is sealed and kept by the runner in a TEE.
#[cfg(test)]
mod tests;

use near_sdk::json_types::U128;
use near_sdk::serde_json::{self, json, Value};
use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{env, ext_contract, is_promise_success, near, require};
use near_sdk::{AccountId, Gas, NearToken, PanicOnDefault, Promise};

const MAX_TEAM: usize = 32; // agents in one job: bounds the gas of finish and revenue
const MAX_SKILLS: usize = 500; // bytes of the public card text
const MAX_SIZE_MB: u32 = 10; // sealed materials a sponsor may upload
const MAX_FEE_BPS: u16 = 2_000;
const MAX_SECS: u64 = 90 * 86_400;
const COST_STEP: u128 = 10_000; // 0.01 USDC: coarse costs carry almost no hidden bits
const GAS: Gas = Gas::from_tgas(10);

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Config {
    pub owner: AccountId,    // sets config, receives the fee and forfeits
    pub runner: AccountId,   // the attested TEE: reviews agents, opens and settles jobs
    pub operator: AccountId, // pays NEAR AI, forwards Agent Market payouts, keeps what agents are not owed
    pub fee_bps: u16,        // owner's share of revenue
    pub audit_base: U128,    // audit fee per registration
    pub audit_per_mb: U128,  // plus this per declared megabyte of materials
    pub min_deposit: U128,   // the least an agent keeps after the audit fee
    pub run_secs: u64,       // an unfinished job may be closed after this; holds go back
    pub pay_secs: u64,       // a finished job waits this long for revenue
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Status {
    Pending,
    Active,
    Suspended,
}

/// An agent's public card. One agent per sponsor account; its budget is the sponsor's balance.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Agent {
    pub skills: String, // what it knows, in plain text: the router reads it
    pub rate: U128,     // what it asks for taking part in a job
    pub max_cost: U128, // the most inference one job may take from its balance
    pub hash: String,   // sha256 of the sealed materials the runner audited
    pub size_mb: u32,   // their declared size: paid for in the audit fee, checked by the runner
    pub status: Status,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Slot {
    pub agent: AccountId,
    pub hold: U128, // cost cap reserved at assign, settled at finish
    pub pay: U128,  // its rate fixed at assign; 0 once it did not deliver
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Job {
    pub at: u64, // seconds: assigned, then finished
    pub done: bool,
    pub slots: Vec<Slot>,
}

#[near(serializers = [json])]
pub struct Outcome {
    pub cost: U128,      // inference spent, on the 0.01 USDC step
    pub delivered: bool, // did its part: keeps its pay
    pub violation: bool, // broke the rules: the rest of the hold is forfeited, the agent suspended
}

/// `msg` of `ft_transfer_call`.
#[near(serializers = [json])]
pub enum Msg {
    Register { skills: String, rate: U128, max_cost: U128, hash: String, size_mb: u32 },
    TopUp { agent: AccountId },
    Revenue { job: String },
}

#[near(serializers = [json])]
pub struct AgentView {
    pub account: AccountId,
    #[serde(flatten)]
    pub card: Agent,
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
    total: u128, // = balances + holds; never above our token balance
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
            Msg::Register { skills, rate, max_cost, hash, size_mb } => {
                let card = Agent { skills, rate, max_cost, hash, size_mb, status: Status::Pending };
                self.register(sender_id, amount.0, card)
            }
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

    /// Activates or suspends a pending agent. `hash` names what was audited: if the sponsor
    /// registered other materials meanwhile, the verdict is stale and refused.
    pub fn review(&mut self, agent: AccountId, hash: String, allow: bool) {
        self.only(&self.cfg.runner);
        let a = self.agent_mut(&agent);
        require!(a.status == Status::Pending && a.hash == hash, "stale review");
        a.status = if allow { Status::Active } else { Status::Suspended };
        emit("review", json!({ "agent": agent, "hash": hash, "allow": allow }));
    }

    /// Holds each agent's cost cap and fixes its rate for the job.
    pub fn assign(&mut self, job: String, agents: Vec<AccountId>) {
        self.only(&self.cfg.runner);
        require!((1..=64).contains(&job.len()) && !self.jobs.contains_key(&job), "bad job id");
        require!((1..=MAX_TEAM).contains(&agents.len()), "bad team size");
        let mut slots: Vec<Slot> = Vec::with_capacity(agents.len());
        for agent in agents {
            require!(slots.iter().all(|s| s.agent != agent), "duplicate agent");
            let a = self.agents.get(&agent).expect("no agent");
            let (hold, pay, balance) = (a.max_cost, a.rate, self.balance_of(&agent));
            require!(a.status == Status::Active && balance >= hold.0, "agent not ready");
            self.set_balance(&agent, balance - hold.0);
            slots.push(Slot { agent, hold, pay });
        }
        emit("assign", json!({ "job": job, "agents": slots.iter().map(|s| &s.agent).collect::<Vec<_>>() }));
        self.jobs.insert(job, Job { at: now(), done: false, slots });
    }

    /// Settles the holds: cost to the operator, the rest back to the agent (to the owner on a
    /// violation). An agent that did not deliver loses its pay. A job nobody is owed for is removed.
    pub fn finish(&mut self, job: String, outcomes: Vec<Outcome>) {
        self.only(&self.cfg.runner);
        let mut j = self.jobs.remove(&job).expect("no job");
        require!(!j.done && outcomes.len() == j.slots.len(), "bad outcomes");
        let (owner, operator) = (self.cfg.owner.clone(), self.cfg.operator.clone());
        for (s, o) in j.slots.iter_mut().zip(outcomes) {
            require!(o.cost.0 <= s.hold.0, "cost above hold");
            require!(o.cost.0 % COST_STEP == 0 || o.cost.0 == s.hold.0, "cost off the step");
            let rest = s.hold.0 - o.cost.0;
            self.credit(&operator, o.cost.0);
            if o.violation {
                self.credit(&owner, rest);
                self.agent_mut(&s.agent).status = Status::Suspended;
            } else {
                self.credit(&s.agent, rest);
            }
            if o.violation || !o.delivered {
                s.pay = U128(0);
            }
            s.hold = U128(0);
        }
        let paid: Vec<&AccountId> = j.slots.iter().filter(|s| s.pay.0 > 0).map(|s| &s.agent).collect();
        emit("finish", json!({ "job": job, "paid": paid }));
        if !paid.is_empty() {
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
    /// The USDC contract whose transfers this contract accepts.
    pub fn token(&self) -> AccountId {
        self.token.clone()
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
    fn register(&mut self, sponsor: AccountId, amount: u128, card: Agent) {
        require!(!card.skills.is_empty() && card.skills.len() <= MAX_SKILLS, "skills empty or too long");
        require!(is_sha256_hex(&card.hash) && (1..=MAX_SIZE_MB).contains(&card.size_mb), "bad materials");
        require!(card.max_cost.0 > 0, "max_cost must be positive");
        let fee = self.cfg.audit_base.0 + self.cfg.audit_per_mb.0 * card.size_mb as u128;
        require!(amount >= fee + self.cfg.min_deposit.0, "deposit too small");
        self.credit(&self.cfg.operator.clone(), fee);
        self.credit(&sponsor, amount - fee);
        emit(
            "register",
            json!({ "agent": sponsor, "hash": card.hash, "rate": card.rate, "max_cost": card.max_cost, "fee": U128(fee) }),
        );
        self.agents.insert(sponsor, card);
    }

    /// Owner's fee first; then each agent that delivered exactly its pay (pro rata if the revenue
    /// falls short); the operator keeps the rest. Revenue is accepted once, from the operator.
    fn revenue(&mut self, sender: AccountId, amount: u128, job: String) {
        require!(sender == self.cfg.operator, "revenue comes from the operator");
        let j = self.jobs.remove(&job).expect("no job");
        require!(j.done, "job not finished");
        let fee = amount * self.cfg.fee_bps as u128 / 10_000;
        let pays: Vec<u128> = j.slots.iter().map(|s| s.pay.0).collect();
        let due: u128 = pays.iter().sum();
        let parts = if amount - fee >= due { pays } else { split(amount - fee, &pays) };
        let rest = amount - fee - parts.iter().sum::<u128>();
        self.credit(&self.cfg.owner.clone(), fee);
        self.credit(&self.cfg.operator.clone(), rest);
        for (s, part) in j.slots.iter().zip(&parts) {
            self.credit(&s.agent, *part);
        }
        let paid: Vec<(&AccountId, U128)> = j.slots.iter().zip(&parts).map(|(s, p)| (&s.agent, U128(*p))).collect();
        emit(
            "revenue",
            json!({ "job": job, "amount": U128(amount), "fee": U128(fee), "paid": paid, "operator": U128(rest) }),
        );
    }

    fn only(&self, who: &AccountId) {
        require!(&env::predecessor_account_id() == who, "not allowed");
    }
    fn agent_mut(&mut self, id: &AccountId) -> &mut Agent {
        self.agents.get_mut(id).expect("no agent")
    }
    fn view(&self, account: &AccountId, card: &Agent) -> AgentView {
        AgentView { account: account.clone(), card: card.clone(), balance: U128(self.balance_of(account)) }
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
        if amount > 0 {
            self.set_balance(id, self.balance_of(id) + amount);
        }
    }
}

fn check(cfg: &Config) {
    require!(cfg.fee_bps <= MAX_FEE_BPS, "fee too high");
    require!(cfg.run_secs <= MAX_SECS && cfg.pay_secs <= MAX_SECS, "timeout too long");
}

/// Splits `amount` pro rata to `weights` (their sum is above `amount`, so above 0).
/// Rounding dust goes to the heaviest share, so the parts always add up to `amount`.
fn split(amount: u128, weights: &[u128]) -> Vec<u128> {
    let total: u128 = weights.iter().sum();
    let mut parts: Vec<u128> = weights.iter().map(|&w| amount * w / total).collect();
    let top = (0..weights.len()).max_by_key(|&i| weights[i]).unwrap();
    parts[top] += amount - parts.iter().sum::<u128>();
    parts
}

/// NEP-297 event, so explorers and indexers can follow the money without our runner.
fn emit(event: &str, data: Value) {
    let e = json!({ "standard": "swarm", "version": "2.0.0", "event": event, "data": data });
    env::log_str(&format!("EVENT_JSON:{e}"));
}

fn now() -> u64 {
    env::block_timestamp() / 1_000_000_000
}

fn is_sha256_hex(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}
