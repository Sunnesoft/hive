//! Swarm-for-Hire ledger. It keeps USDC and nothing else, and moves it only by these rules:
//!
//! - A sponsor registers agents, each a public card named `<account>/<name>`, and pays a deposit.
//!   The audit fee goes to the operator; the rest is the sponsor's balance, shared by its agents.
//! - For a job the runner holds each chosen agent's cost cap and fixes its rate from the card.
//! - At the end the runner reports each agent's inference cost and whether it delivered.
//!   The cost goes to the operator, the rest of the hold back to the agent.
//! - Customer revenue pays the owner's fee, then each agent that delivered exactly its rate,
//!   then the operator the rest. Nobody gains from another agent failing.
//! - A customer may also order here: USDC with a description of the work. When the swarm delivers,
//!   the order pays that job by the same rule plus the protocol's overhead; the rest is sent back.
//!   An order the swarm declines, or does not answer in time, is sent back in full.
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
const MAX_NAME: usize = 32; // an agent's name: lowercase letters, digits and dashes
const MAX_SIZE_MB: u32 = 10; // sealed materials a sponsor may upload
const MAX_BRIEF: usize = 4_000; // bytes of an order's description, kept here until the order is settled
const MAX_REASON: usize = 200; // bytes of why an order was declined
const MAX_FEE_BPS: u16 = 2_000;
const MAX_SECS: u64 = 90 * 86_400;
const COST_STEP: u128 = 10_000; // 0.01 USDC: coarse costs carry almost no hidden bits
const GAS: Gas = Gas::from_tgas(10);

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Config {
    pub owner: AccountId,    // sets config, receives the fee
    pub runner: AccountId,   // the attested TEE: reviews agents, opens and settles jobs
    pub operator: AccountId, // pays NEAR AI, forwards Agent Market payouts, keeps what agents are not owed
    pub fee_bps: u16,        // owner's share of revenue
    pub audit_base: U128,    // audit fee per registration
    pub audit_per_mb: U128,  // plus this per declared megabyte of materials
    pub min_deposit: U128,   // the least a registration must bring beyond the audit fee
    pub overhead: U128,      // what an order pays the operator for the protocol's own work
    pub overhead_per_agent: U128, // plus this for each agent that delivered
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

/// An agent's public card. A sponsor may run several; they share its balance and pay it.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Agent {
    pub owner: AccountId, // the sponsor: pays its holds, receives its pay
    pub skills: String,   // what it knows, in plain text: the router reads it
    pub rate: U128,     // what it asks for taking part in a job
    pub max_cost: U128, // the most inference one job may take from its balance
    pub hash: String,   // sha256 of the sealed materials the runner audited
    pub size_mb: u32,   // their declared size: paid for in the audit fee, checked by the runner
    pub status: Status,
    pub registration: u64, // which registration this card is: a review names it, so a card changed meanwhile is never activated
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Slot {
    pub agent: String,    // `<owner>/<name>`
    pub owner: AccountId, // whose balance holds and gets paid, fixed at assign
    pub hold: U128,       // cost cap reserved at assign, settled at finish
    pub pay: U128,  // its rate fixed at assign; 0 once it did not deliver
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Job {
    pub at: u64, // seconds: assigned, then finished
    pub done: bool,
    pub slots: Vec<Slot>,
}

/// A customer's order: the work in words and the most it may cost, held until the swarm delivers or declines.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Order {
    pub customer: AccountId,
    pub amount: U128,  // what is not spent is sent back to the customer
    pub brief: String, // the description of the work: public
    pub at: u64,       // seconds: placed
}

#[near(serializers = [json])]
pub struct Outcome {
    pub cost: U128,      // inference spent, on the 0.01 USDC step
    pub delivered: bool, // did its part: keeps its pay
    pub violation: bool, // broke the rules: no pay, and the agent is suspended until it registers again
}

/// `msg` of `ft_transfer_call`.
#[near(serializers = [json])]
pub enum Msg {
    Register { name: String, skills: String, rate: U128, max_cost: U128, hash: String, size_mb: u32 },
    TopUp { agent: String }, // adds to the balance of the agent's owner
    Revenue { job: String },
    Order { brief: String }, // the customer's order; its id is in the `order` event
}

#[near(serializers = [json])]
pub struct AgentView {
    pub id: String,
    #[serde(flatten)]
    pub card: Agent,
    pub balance: U128, // the owner's, shared by all its agents
}

#[near(serializers = [json])]
pub struct OrderView {
    pub id: String,
    #[serde(flatten)]
    pub order: Order,
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
    agents: IterableMap<String, Agent>, // by `<owner>/<name>`
    jobs: LookupMap<String, Job>,
    orders: IterableMap<String, Order>, // open orders by `order-<n>`; the job of an order has the same id
    total: u128,        // = balances + holds + open orders; never above our token balance
    registrations: u64, // cards registered so far
    placed: u64,        // orders placed so far: an order id is never used twice
}

#[near]
impl Contract {
    #[init]
    pub fn new(token: AccountId, cfg: Config) -> Self {
        check(&cfg);
        let (balances, agents, jobs) = (LookupMap::new(b"b"), IterableMap::new(b"a"), LookupMap::new(b"j"));
        Self { token, cfg, balances, agents, jobs, orders: IterableMap::new(b"o"), total: 0, registrations: 0, placed: 0 }
    }

    // ---- money in: `ft_transfer_call` on the token; a panic here refunds the sender ----

    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> U128 {
        require!(env::predecessor_account_id() == self.token, "wrong token");
        match serde_json::from_str(&msg).expect("bad msg") {
            Msg::Register { name, skills, rate, max_cost, hash, size_mb } => {
                self.registrations += 1;
                let registration = self.registrations;
                let card = Agent { owner: sender_id, skills, rate, max_cost, hash, size_mb, status: Status::Pending, registration };
                self.register(name, amount.0, card)
            }
            Msg::TopUp { agent } => {
                let owner = self.agents.get(&agent).expect("no agent").owner.clone();
                self.credit(&owner, amount.0);
                emit("top_up", json!({ "agent": agent, "amount": amount }));
            }
            Msg::Revenue { job } => self.revenue(sender_id, amount.0, job),
            Msg::Order { brief } => self.place(sender_id, amount.0, brief),
        }
        self.total += amount.0;
        U128(0)
    }

    // ---- runner ----

    /// Activates or suspends a pending agent. `registration` names the card that was audited: if the
    /// sponsor registered again meanwhile (other skills, other materials), the verdict is stale and refused.
    pub fn review(&mut self, agent: String, registration: u64, allow: bool) {
        self.only(&self.cfg.runner);
        let a = self.agent_mut(&agent);
        require!(a.status == Status::Pending && a.registration == registration, "stale review");
        a.status = if allow { Status::Active } else { Status::Suspended };
        emit("review", json!({ "agent": agent, "registration": registration, "allow": allow }));
    }

    /// Holds each agent's cost cap and fixes its rate for the job.
    pub fn assign(&mut self, job: String, agents: Vec<String>) {
        self.only(&self.cfg.runner);
        require!((1..=64).contains(&job.len()) && !self.jobs.contains_key(&job), "bad job id");
        require!((1..=MAX_TEAM).contains(&agents.len()), "bad team size");
        let mut slots: Vec<Slot> = Vec::with_capacity(agents.len());
        for agent in agents {
            require!(slots.iter().all(|s| s.agent != agent), "duplicate agent");
            let a = self.agents.get(&agent).expect("no agent");
            let (owner, hold, pay) = (a.owner.clone(), a.max_cost, a.rate);
            let balance = self.balance_of(&owner);
            require!(a.status == Status::Active && balance >= hold.0, "agent not ready");
            self.set_balance(&owner, balance - hold.0);
            slots.push(Slot { agent, owner, hold, pay });
        }
        emit("assign", json!({ "job": job, "agents": slots.iter().map(|s| &s.agent).collect::<Vec<_>>() }));
        self.jobs.insert(job, Job { at: now(), done: false, slots });
    }

    /// Settles the holds: cost to the operator, the rest back to the agent. An agent that did not
    /// deliver loses its pay; one that broke the rules is also suspended until it registers again.
    /// Nobody gains from a violation, so nobody has a reason to provoke one. A job nobody is owed for is removed.
    pub fn finish(&mut self, job: String, outcomes: Vec<Outcome>) {
        self.only(&self.cfg.runner);
        let mut j = self.jobs.remove(&job).expect("no job");
        require!(!j.done && outcomes.len() == j.slots.len(), "bad outcomes");
        let operator = self.cfg.operator.clone();
        for (s, o) in j.slots.iter_mut().zip(outcomes) {
            require!(o.cost.0 <= s.hold.0, "cost above hold");
            require!(o.cost.0 % COST_STEP == 0 || o.cost.0 == s.hold.0, "cost off the step");
            self.credit(&operator, o.cost.0);
            self.credit(&s.owner, s.hold.0 - o.cost.0);
            if o.violation {
                self.agent_mut(&s.agent).status = Status::Suspended;
            }
            if o.violation || !o.delivered {
                s.pay = U128(0);
            }
            s.hold = U128(0);
        }
        let paid: Vec<&String> = j.slots.iter().filter(|s| s.pay.0 > 0).map(|s| &s.agent).collect();
        emit("finish", json!({ "job": job, "paid": paid }));
        if !paid.is_empty() {
            (j.at, j.done) = (now(), true);
            self.jobs.insert(job, j);
        }
    }

    /// The answer to an order is ready; `answer` is its sha256. The order's job says who delivered. The order
    /// pays the owner's fee, each of them its rate and the protocol's overhead; the rest goes back to the customer.
    pub fn deliver(&mut self, order: String, answer: String) {
        self.only(&self.cfg.runner);
        require!(is_sha256_hex(&answer), "bad answer hash");
        let o = self.orders.remove(&order).expect("no order");
        let j = self.jobs.remove(&order).expect("no job");
        require!(j.done, "job not finished");
        let delivered = j.slots.iter().filter(|s| s.pay.0 > 0).count() as u128;
        let cost = j.slots.iter().map(|s| s.pay.0).sum::<u128>() + self.cfg.overhead.0 + self.cfg.overhead_per_agent.0 * delivered;
        let keep = 10_000 - self.cfg.fee_bps as u128;
        let charge = o.amount.0.min((cost * 10_000).div_ceil(keep)); // so that after the fee it covers the cost
        self.pay_out(&order, &j, charge);
        self.give_back(&o.customer, o.amount.0 - charge);
        emit(
            "deliver",
            json!({ "order": order, "customer": o.customer, "answer": answer, "charge": U128(charge), "refund": U128(o.amount.0 - charge) }),
        );
    }

    /// The swarm declines an order: the task is refused, nobody knows enough, the money covers no team,
    /// or the work failed. All of it goes back to the customer.
    pub fn refuse(&mut self, order: String, reason: String) {
        self.only(&self.cfg.runner);
        require!(reason.len() <= MAX_REASON, "reason too long");
        self.refund(order, &reason);
    }

    // ---- anyone ----

    /// Returns an order the swarm did not answer within `run_secs` to its customer.
    pub fn cancel(&mut self, order: String) {
        let o = self.orders.get(&order).expect("no order");
        require!(now() >= o.at + self.cfg.run_secs, "too early");
        self.refund(order, "timeout");
    }

    /// Closes a stuck job: unfinished after `run_secs` (holds go back) or unpaid after `pay_secs`.
    pub fn close(&mut self, job: String) {
        let j = self.jobs.get(&job).expect("no job");
        require!(now() >= j.at + if j.done { self.cfg.pay_secs } else { self.cfg.run_secs }, "too early");
        for s in self.jobs.remove(&job).unwrap().slots {
            self.credit(&s.owner, s.hold.0);
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
        self.send(me, amount)
    }

    #[private]
    pub fn on_withdraw(&mut self, account: AccountId, amount: U128) {
        let ok = is_promise_success();
        if !ok {
            self.credit(&account, amount.0); // e.g. not registered with the token: the money stays here, in its balance
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
    pub fn agent(&self, id: String) -> Option<AgentView> {
        self.agents.get(&id).map(|a| self.view(&id, a))
    }
    pub fn agents(&self, from: u32, limit: u32) -> Vec<AgentView> {
        let page = self.agents.iter().skip(from as usize).take(limit.min(100) as usize);
        page.map(|(id, a)| self.view(id, a)).collect()
    }
    pub fn job(&self, job: String) -> Option<Job> {
        self.jobs.get(&job).cloned()
    }
    pub fn order(&self, id: String) -> Option<Order> {
        self.orders.get(&id).cloned()
    }
    /// Open orders: the runner serves them.
    pub fn orders(&self, from: u32, limit: u32) -> Vec<OrderView> {
        let page = self.orders.iter().skip(from as usize).take(limit.min(100) as usize);
        page.map(|(id, o)| OrderView { id: id.clone(), order: o.clone() }).collect()
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
    fn register(&mut self, name: String, amount: u128, card: Agent) {
        let named = (1..=MAX_NAME).contains(&name.len()) && name.bytes().all(|b| matches!(b, b'a'..=b'z' | b'0'..=b'9' | b'-'));
        require!(named, "name: 1-32 of a-z, 0-9 and -");
        let (sponsor, id) = (card.owner.clone(), format!("{}/{name}", card.owner));
        require!(!card.skills.is_empty() && card.skills.len() <= MAX_SKILLS, "skills empty or too long");
        require!(is_sha256_hex(&card.hash) && (1..=MAX_SIZE_MB).contains(&card.size_mb), "bad materials");
        require!(card.max_cost.0 > 0, "max_cost must be positive");
        let fee = self.cfg.audit_base.0 + self.cfg.audit_per_mb.0 * card.size_mb as u128;
        require!(amount >= fee + self.cfg.min_deposit.0, "deposit too small");
        self.credit(&self.cfg.operator.clone(), fee);
        self.credit(&sponsor, amount - fee);
        emit(
            "register",
            json!({ "agent": id, "hash": card.hash, "rate": card.rate, "max_cost": card.max_cost, "fee": U128(fee) }),
        );
        self.agents.insert(id, card);
    }

    /// Revenue for a finished job, forwarded by the operator from Agent Market. Accepted once.
    fn revenue(&mut self, sender: AccountId, amount: u128, job: String) {
        require!(sender == self.cfg.operator, "revenue comes from the operator");
        let j = self.jobs.remove(&job).expect("no job");
        require!(j.done, "job not finished");
        self.pay_out(&job, &j, amount);
    }

    /// Shares `amount` for a finished job: the owner's fee first; then each agent that delivered exactly
    /// its pay (pro rata if the amount falls short); the operator keeps the rest.
    fn pay_out(&mut self, job: &str, j: &Job, amount: u128) {
        let fee = amount * self.cfg.fee_bps as u128 / 10_000;
        let pays: Vec<u128> = j.slots.iter().map(|s| s.pay.0).collect();
        let due: u128 = pays.iter().sum();
        let parts = if amount - fee >= due { pays } else { split(amount - fee, &pays) };
        let rest = amount - fee - parts.iter().sum::<u128>();
        self.credit(&self.cfg.owner.clone(), fee);
        self.credit(&self.cfg.operator.clone(), rest);
        for (s, part) in j.slots.iter().zip(&parts) {
            self.credit(&s.owner, *part);
        }
        let paid: Vec<(&String, U128)> = j.slots.iter().zip(&parts).map(|(s, p)| (&s.agent, U128(*p))).collect();
        emit(
            "revenue",
            json!({ "job": job, "amount": U128(amount), "fee": U128(fee), "paid": paid, "operator": U128(rest) }),
        );
    }

    /// Holds a customer's money with the description of the work. The id is new every time.
    fn place(&mut self, customer: AccountId, amount: u128, brief: String) {
        require!(!brief.trim().is_empty() && brief.len() <= MAX_BRIEF, "brief empty or too long");
        require!(amount > self.cfg.overhead.0, "order too small"); // or it could pay no agent at all
        self.placed += 1;
        let id = format!("order-{}", self.placed);
        emit("order", json!({ "order": id, "customer": customer, "amount": U128(amount) }));
        self.orders.insert(id, Order { customer, amount: U128(amount), brief, at: now() });
    }

    /// Ends an order with all its money back in the customer's balance. Its job, if one finished, is dropped unpaid.
    fn refund(&mut self, order: String, reason: &str) {
        let o = self.orders.remove(&order).expect("no order");
        if let Some(j) = self.jobs.get(&order) {
            require!(j.done, "job running"); // its holds are still out: finish or close it first
            self.jobs.remove(&order);
        }
        self.give_back(&o.customer, o.amount.0);
        emit("refund", json!({ "order": order, "customer": o.customer, "amount": o.amount, "reason": reason }));
    }

    /// Sends tokens out. If the transfer fails, `on_withdraw` puts them into the receiver's balance here.
    fn send(&mut self, to: AccountId, amount: u128) -> Promise {
        self.total -= amount;
        ext_ft::ext(self.token.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS)
            .ft_transfer(to.clone(), U128(amount), None)
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS).on_withdraw(to, U128(amount)))
    }

    /// A customer's money goes straight back to its wallet: it never has to come for it.
    fn give_back(&mut self, customer: &AccountId, amount: u128) {
        if amount > 0 {
            self.send(customer.clone(), amount).detach();
        }
    }

    fn only(&self, who: &AccountId) {
        require!(&env::predecessor_account_id() == who, "not allowed");
    }
    fn agent_mut(&mut self, id: &String) -> &mut Agent {
        self.agents.get_mut(id).expect("no agent")
    }
    fn view(&self, id: &String, card: &Agent) -> AgentView {
        AgentView { id: id.clone(), card: card.clone(), balance: U128(self.balance_of(&card.owner)) }
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
