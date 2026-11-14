//! Swarm-for-Hire ledger. It keeps USDC and nothing else, and moves it only by these rules.
//!
//! Sponsors and their agents
//! - A sponsor registers agents, each a public card `<sponsor>/<name>`, with a deposit. The audit fee
//!   goes to the operator; the rest is the sponsor's balance, shared by its agents.
//! - For a job the runner holds each chosen agent's cost cap and fixes its rate from the card.
//! - When the job is finished the runner reports each agent's inference cost and whether it delivered.
//!   The cost goes to the operator, the rest of the hold back to the sponsor.
//!
//! Customers' money, by either door
//! - Agent Market: the operator forwards the revenue of a finished job.
//! - An order placed here: USDC with the hash of the task's description. The text goes to the runner
//!   and is never kept here. When the swarm delivers, the order pays for its job and the rest is sent
//!   back. Declined, or not answered in time, it is sent back whole.
//! - Either way the money pays the owner's fee, then each agent that delivered exactly its rate, then
//!   the operator the rest. Nobody gains from another agent failing.
//!
//! A stuck job can be closed by anyone after a timeout. Every balance can be withdrawn.
//! What the agents know is not here: it is sealed and kept by the runner in a TEE.
//!
//! Who is trusted with what
//! - The runner decides what a job cost and who delivered, within what was held and what the customer put in.
//! - The owner names the runner and the operator and sets the fees. A change of config is announced and takes
//!   effect `delay_secs` later, so that whoever does not like it has time to leave: none of the ways out
//!   (withdraw, refund, close) needs the owner or the runner.
//! - The owner can stop the runner at once. That moves no money: it only refuses what the runner does.
#[cfg(test)]
mod tests;

use near_sdk::json_types::U128;
use near_sdk::serde_json::{self, json, Value};
use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{env, ext_contract, is_promise_success, near, require};
use near_sdk::{AccountId, Gas, NearToken, PanicOnDefault};

const MAX_TEAM: usize = 32; // agents in one job: bounds the gas of finish and of paying out
const MAX_JOB_ID: usize = 64; // bytes
const MAX_SKILLS: usize = 500; // bytes of the public card text
const MAX_NAME: usize = 32; // an agent's name: lowercase letters, digits and dashes
const MAX_SIZE_MB: u32 = 10; // sealed materials a sponsor may upload
const MAX_FEE_BPS: u16 = 2_000;
const MAX_TIMEOUT_SECS: u64 = 90 * 86_400;
const COST_STEP: u128 = 10_000; // 0.01 USDC: coarse costs carry almost no hidden bits
const SCREEN_FEE: u128 = 50_000; // 0.05 USDC an order the swarm declines leaves to the operator: the check of the task cost models
const DAY_SECS: u64 = 86_400;
const TRANSFER_GAS: Gas = Gas::from_tgas(10); // for a token transfer, and as much for its callback

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Config {
    pub owner: AccountId,         // sets config, receives the fee
    pub runner: AccountId,        // the attested TEE: reviews agents, runs jobs, answers orders
    pub operator: AccountId,      // pays NEAR AI, forwards Agent Market revenue, keeps what agents are not owed
    pub fee_bps: u16,             // the owner's share of what customers pay
    pub audit_base: U128,         // audit fee per registration
    pub audit_per_mb: U128,       // plus this per declared megabyte of materials
    pub min_deposit: U128,        // the least a registration must bring beyond the audit fee
    pub overhead: U128,           // what an order pays the operator for the protocol's own work
    pub overhead_per_agent: U128, // plus this for each agent that delivered
    pub run_secs: u64, // after this an unfinished job may be closed (holds go back) and an unanswered order refunded
    pub pay_secs: u64, // a finished job waits this long to be paid for
    #[serde(default)]
    pub delay_secs: u64, // a new config takes effect this long after the owner announces it
}

/// A config the owner has announced and the time it takes effect.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Announced {
    pub cfg: Config,
    pub at: u64, // seconds
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Status {
    Pending,   // registered: waits for the runner's review
    Active,    // may work
    Suspended, // denied by the review, or broke the rules in a job: out until it registers again
}

/// An agent's public card. A sponsor may run several agents: they share its balance.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Agent {
    pub sponsor: AccountId,     // whose balance pays its holds and receives its pay
    pub skills: String,         // what it knows, in plain text: the router reads it
    pub rate: U128,             // what it asks for delivering its part of a job
    pub max_cost: U128,         // the most inference one job may take from the sponsor's balance
    pub materials_hash: String, // sha256 of the sealed materials the runner audits
    pub size_mb: u32,           // their declared size: paid for in the audit fee, checked by the runner
    pub status: Status,
    pub registration: u64, // which registration this card is: a review names it, so a card changed meanwhile is never activated
}

/// An agent's place in a job.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Slot {
    pub agent: String,      // `<sponsor>/<name>`
    pub sponsor: AccountId, // as on the card when the job was assigned
    pub hold: U128,         // the cost cap, taken from the sponsor's balance until the job is finished
    pub pay: U128,          // the rate, as on the card when the job was assigned; 0 once it did not deliver
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Job {
    pub at: u64,        // seconds: assigned, then finished
    pub finished: bool, // the holds are settled and somebody is owed pay: it waits for the customer's money
    pub slots: Vec<Slot>,
}

/// A customer's order: the most a task may cost, held until the swarm delivers or declines. The task is
/// named by the hash of its description; the runner gets the text and checks it against this hash.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Order {
    pub customer: AccountId,
    pub amount: U128,       // what the task does not cost is sent back
    pub brief_hash: String, // sha256 of the salted description: binds the customer and the swarm to one text
    pub at: u64,            // seconds: placed
}

/// What the runner reports about one agent when a job is finished.
#[near(serializers = [json])]
pub struct Outcome {
    pub cost: U128,      // inference spent, on the 0.01 USDC step
    pub delivered: bool, // did its part: keeps its pay
    pub violation: bool, // broke the rules: no pay, and the agent is suspended until it registers again
    // What its part was worth: the findings the swarm tried and kept, weighed by severity. When the runner gives
    // weights, the delivered agents' pay is shared by them; an agent whose findings did not hold is paid nothing.
    #[serde(default)]
    pub weight: Option<u32>,
}

/// What a payment is for: the `msg` of `ft_transfer_call`.
#[near(serializers = [json])]
pub enum Msg {
    /// From a sponsor: a new agent, or a new card for one it has. The new card waits for review.
    Register { name: String, skills: String, rate: U128, max_cost: U128, materials_hash: String, size_mb: u32 },
    /// From anyone: adds to the balance of the agent's sponsor.
    TopUp { agent: String },
    /// From the operator: what Agent Market paid for a finished job.
    Revenue { job: String },
    /// From a customer: an order. Its id is in the `order` event. To make the task public the customer adds
    /// `salt` and `brief` beside the hash: this contract ignores them, the chain keeps them.
    Order { brief_hash: String },
}

#[near(serializers = [json])]
pub struct AgentView {
    pub id: String,
    #[serde(flatten)]
    pub card: Agent,
    pub balance: U128, // the sponsor's, shared by all its agents
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
    token: AccountId, // the USDC contract
    cfg: Config,
    balances: LookupMap<AccountId, u128>, // free money: sponsors', the owner's, the operator's
    agents: IterableMap<String, Agent>,   // by `<sponsor>/<name>`
    jobs: LookupMap<String, Job>,
    orders: IterableMap<String, Order>, // open orders by `order-<n>`; the job of an order has the same id
    owed: u128,                         // = balances + holds + open orders; never above our token balance
    registrations: u64,                 // cards registered so far
    orders_placed: u64,                 // so an order id is never used twice
    announced: Option<Announced>,       // a change of config that waits for its time
    halted: bool,                       // the owner stopped the runner: nothing it does is accepted
}

#[near]
impl Contract {
    #[init]
    pub fn new(token: AccountId, cfg: Config) -> Self {
        check(&cfg);
        Self {
            token,
            cfg,
            balances: LookupMap::new(b"b"),
            agents: IterableMap::new(b"a"),
            jobs: LookupMap::new(b"j"),
            orders: IterableMap::new(b"o"),
            owed: 0,
            registrations: 0,
            orders_placed: 0,
            announced: None,
            halted: false,
        }
    }

    /// Reads the state of version 3.0.0, which had no announced config and no stop, into this one. Called once,
    /// by the contract's own account, in the transaction that deploys this code.
    #[private]
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        let old: ContractV3 = env::state_read().expect("no state");
        let c = old.cfg;
        let cfg = Config {
            owner: c.owner,
            runner: c.runner,
            operator: c.operator,
            fee_bps: c.fee_bps,
            audit_base: c.audit_base,
            audit_per_mb: c.audit_per_mb,
            min_deposit: c.min_deposit,
            overhead: c.overhead,
            overhead_per_agent: c.overhead_per_agent,
            run_secs: c.run_secs,
            pay_secs: c.pay_secs,
            delay_secs: 0,
        };
        Self {
            token: old.token,
            cfg,
            balances: old.balances,
            agents: old.agents,
            jobs: old.jobs,
            orders: old.orders,
            owed: old.owed,
            registrations: old.registrations,
            orders_placed: old.orders_placed,
            announced: None,
            halted: false,
        }
    }

    // ---- money in: `ft_transfer_call` on the token; a panic here returns it to the sender ----

    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> U128 {
        require!(env::predecessor_account_id() == self.token, "wrong token");
        match serde_json::from_str(&msg).expect("bad msg") {
            Msg::Register { name, skills, rate, max_cost, materials_hash, size_mb } => {
                self.registrations += 1;
                let registration = self.registrations;
                let card = Agent {
                    sponsor: sender_id,
                    skills,
                    rate,
                    max_cost,
                    materials_hash,
                    size_mb,
                    status: Status::Pending,
                    registration,
                };
                self.register(name, amount.0, card)
            }
            Msg::TopUp { agent } => {
                let sponsor = self.agents.get(&agent).expect("no agent").sponsor.clone();
                self.credit(&sponsor, amount.0);
                emit("top_up", json!({ "agent": agent, "amount": amount }));
            }
            Msg::Revenue { job } => self.revenue(sender_id, amount.0, job),
            Msg::Order { brief_hash } => self.place_order(sender_id, amount.0, brief_hash),
        }
        self.owed += amount.0;
        U128(0) // all of it is taken
    }

    // ---- runner ----

    /// Activates or suspends a pending agent. `registration` names the card that was audited: if the
    /// sponsor registered again meanwhile (other skills, other materials), the verdict is stale and refused.
    pub fn review(&mut self, agent: String, registration: u64, allow: bool) {
        self.runner();
        let a = self.agent_mut(&agent);
        require!(a.status == Status::Pending && a.registration == registration, "stale review");
        a.status = if allow { Status::Active } else { Status::Suspended };
        emit("review", json!({ "agent": agent, "registration": registration, "allow": allow }));
    }

    /// Starts a job: holds each agent's cost cap and fixes its rate.
    pub fn assign(&mut self, job: String, agents: Vec<String>) {
        self.runner();
        require!((1..=MAX_JOB_ID).contains(&job.len()) && !self.jobs.contains_key(&job), "bad job id");
        require!((1..=MAX_TEAM).contains(&agents.len()), "bad team size");
        let mut slots: Vec<Slot> = Vec::with_capacity(agents.len());
        for agent in agents {
            require!(slots.iter().all(|s| s.agent != agent), "duplicate agent");
            let a = self.agents.get(&agent).expect("no agent");
            let (sponsor, hold, pay) = (a.sponsor.clone(), a.max_cost, a.rate);
            let balance = self.balance_of(&sponsor);
            require!(a.status == Status::Active && balance >= hold.0, "agent not ready");
            spend_today(&sponsor, hold.0);
            self.set_balance(&sponsor, balance - hold.0);
            slots.push(Slot { agent, sponsor, hold, pay });
        }
        emit("assign", json!({ "job": job, "agents": slots.iter().map(|s| &s.agent).collect::<Vec<_>>() }));
        self.jobs.insert(job, Job { at: now(), finished: false, slots });
    }

    /// Settles the holds: each agent's cost to the operator, the rest back to its sponsor. An agent that did
    /// not deliver loses its pay; one that broke the rules is also suspended until it registers again.
    /// Nobody gains from a violation, so nobody has a reason to provoke one. A job nobody is owed for is removed.
    pub fn finish(&mut self, job: String, outcomes: Vec<Outcome>) {
        self.runner();
        let mut j = self.jobs.remove(&job).expect("no job");
        require!(!j.finished && outcomes.len() == j.slots.len(), "bad outcomes");
        let operator = self.cfg.operator.clone();
        let weights: Vec<Option<u32>> = outcomes.iter().map(|o| if o.violation || !o.delivered { Some(0) } else { o.weight }).collect();
        for (s, o) in j.slots.iter_mut().zip(outcomes) {
            require!(o.cost.0 <= s.hold.0, "cost above hold");
            require!(o.cost.0 % COST_STEP == 0 || o.cost.0 == s.hold.0, "cost off the step");
            self.credit(&operator, o.cost.0);
            self.credit(&s.sponsor, s.hold.0 - o.cost.0);
            if o.violation {
                self.agent_mut(&s.agent).status = Status::Suspended;
            }
            if o.violation || !o.delivered {
                s.pay = U128(0);
            }
            s.hold = U128(0);
        }
        // Weighed: what the delivered agents' rates add up to is shared by what their parts were worth.
        if weights.iter().any(|w| w.is_some_and(|w| w > 0)) {
            let pool: u128 = j.slots.iter().map(|s| s.pay.0).sum();
            let w: Vec<u128> = weights.iter().map(|w| w.unwrap_or(0) as u128).collect();
            for (s, part) in j.slots.iter_mut().zip(split(pool, &w)) {
                s.pay = U128(part);
            }
        }
        let delivered: Vec<&String> = j.slots.iter().filter(|s| s.pay.0 > 0).map(|s| &s.agent).collect();
        emit("finish", json!({ "job": job, "delivered": delivered }));
        if !delivered.is_empty() {
            (j.at, j.finished) = (now(), true);
            self.jobs.insert(job, j);
        }
    }

    /// The answer to an order is with the customer; `answer_hash` is its sha256. The order's job says who
    /// delivered. The order pays their rates, the protocol's overhead and the owner's fee on top, never more
    /// than the customer put in; the rest is sent back to the customer.
    pub fn deliver(&mut self, order: String, answer_hash: String) {
        self.runner();
        require!(is_sha256_hex(&answer_hash), "bad answer hash");
        let o = self.orders.remove(&order).expect("no order");
        let j = self.jobs.remove(&order).expect("no job");
        require!(j.finished, "job not finished");
        let delivered = j.slots.iter().filter(|s| s.pay.0 > 0).count() as u128;
        let cost = j.slots.iter().map(|s| s.pay.0).sum::<u128>()
            + self.cfg.overhead.0
            + self.cfg.overhead_per_agent.0 * delivered;
        let with_fee = (cost * 10_000).div_ceil(10_000 - self.cfg.fee_bps as u128); // after the fee it covers the cost
        let charge = with_fee.min(o.amount.0);
        self.pay_out(&order, &j, charge);
        self.send(&o.customer, o.amount.0 - charge);
        emit(
            "deliver",
            json!({ "order": order, "customer": o.customer, "answer_hash": answer_hash, "charge": U128(charge), "refund": U128(o.amount.0 - charge) }),
        );
    }

    /// The swarm does not take an order: the task is refused, nobody knows enough, the money covers no
    /// team, or the work failed. All of it is sent back to the customer.
    pub fn decline(&mut self, order: String) {
        self.runner();
        let o = self.orders.get(&order).expect("no order");
        let fee = SCREEN_FEE.min(o.amount.0);
        let operator = self.cfg.operator.clone();
        self.send_back_less(order, "declined", fee);
        self.set_balance(&operator, self.balance_of(&operator) + fee);
    }

    // ---- anyone ----

    /// Sends an order the swarm did not answer within `run_secs` back to its customer.
    pub fn refund(&mut self, order: String) {
        let o = self.orders.get(&order).expect("no order");
        require!(now() >= o.at + self.cfg.run_secs, "too early");
        self.send_back(order, "timeout");
    }

    /// Closes a stuck job: unfinished after `run_secs` (holds go back) or not paid for after `pay_secs`.
    pub fn close(&mut self, job: String) {
        let j = self.jobs.get(&job).expect("no job");
        require!(now() >= j.at + if j.finished { self.cfg.pay_secs } else { self.cfg.run_secs }, "too early");
        for s in self.jobs.remove(&job).unwrap().slots {
            self.credit(&s.sponsor, s.hold.0);
        }
        emit("close", json!({ "job": job }));
    }

    /// The most of the caller's balance the runner may hold for jobs in one UTC day, summed over all its agents;
    /// none: no limit. A stolen runner key can then take from a sponsor no more than this a day.
    pub fn set_daily_cap(&mut self, cap: Option<U128>) {
        let me = env::predecessor_account_id();
        let mut c = cap_of(&me).unwrap_or(Cap { per_day: 0, day: 0, used: 0 });
        match cap {
            None => {
                env::storage_remove(&cap_key(&me));
            }
            Some(v) => {
                c.per_day = v.0;
                env::storage_write(&cap_key(&me), &near_sdk::borsh::to_vec(&c).expect("cap"));
            }
        }
        emit("daily_cap", json!({ "account": me, "cap": cap }));
    }

    /// Sends `amount` (all if omitted) of the caller's balance to the caller. Held money is not in the balance.
    pub fn withdraw(&mut self, amount: Option<U128>) {
        let me = env::predecessor_account_id();
        let have = self.balance_of(&me);
        let amount = amount.map_or(have, |a| a.0);
        require!(amount > 0 && amount <= have, "bad amount");
        self.set_balance(&me, have - amount);
        self.send(&me, amount);
    }

    /// After `send`: tokens the token contract did not take (the receiver is not registered with it, say)
    /// stay here, in the receiver's balance.
    #[private]
    pub fn on_sent(&mut self, to: AccountId, amount: U128) {
        let ok = is_promise_success();
        if !ok {
            self.credit(&to, amount.0);
            self.owed += amount.0;
        }
        emit("sent", json!({ "to": to, "amount": amount, "ok": ok }));
    }

    // ---- owner ----

    /// Announces a new config. It takes effect `delay_secs` later (the delay of the config in force), when
    /// anyone calls `apply_config`; with no delay, at once. A new announcement replaces the one before it.
    pub fn set_config(&mut self, cfg: Config) {
        self.only(&self.cfg.owner);
        check(&cfg);
        let at = now() + self.cfg.delay_secs;
        emit("config", json!({ "at": at, "owner": cfg.owner, "runner": cfg.runner, "operator": cfg.operator }));
        self.announced = Some(Announced { cfg, at });
        if self.cfg.delay_secs == 0 {
            self.apply_config();
        }
    }

    /// Puts the announced config in force once its time has come. Anyone may call it.
    pub fn apply_config(&mut self) {
        let a = self.announced.take().expect("nothing announced");
        require!(now() >= a.at, "too early");
        self.cfg = a.cfg;
    }

    /// Takes an announced config back.
    pub fn cancel_config(&mut self) {
        self.only(&self.cfg.owner);
        self.announced = None;
    }

    /// Stops the runner, or lets it go on, at once: while stopped, nothing the runner does is accepted. A stolen
    /// runner key cannot wait out a delay. It moves no money: orders are refunded and jobs closed by anyone
    /// after their timeouts, as when the runner is simply gone.
    pub fn halt(&mut self, halted: bool) {
        self.only(&self.cfg.owner);
        self.halted = halted;
        emit("halt", json!({ "halted": halted }));
    }

    // ---- views ----

    pub fn config(&self) -> Config {
        self.cfg.clone()
    }
    /// A config that was announced and is not in force yet.
    pub fn announced(&self) -> Option<Announced> {
        self.announced.clone()
    }
    /// Whether the owner has stopped the runner.
    pub fn halted(&self) -> bool {
        self.halted
    }
    /// The USDC contract whose transfers this contract accepts.
    pub fn token(&self) -> AccountId {
        self.token.clone()
    }
    pub fn agent(&self, id: String) -> Option<AgentView> {
        self.agents.get(&id).map(|a| self.agent_view(&id, a))
    }
    pub fn agents(&self, from: u32, limit: u32) -> Vec<AgentView> {
        let page = self.agents.iter().skip(from as usize).take(limit.min(100) as usize);
        page.map(|(id, a)| self.agent_view(id, a)).collect()
    }
    pub fn job(&self, job: String) -> Option<Job> {
        self.jobs.get(&job).cloned()
    }
    /// An open order.
    pub fn order(&self, id: String) -> Option<Order> {
        self.orders.get(&id).cloned()
    }
    /// Open orders: the runner answers them.
    pub fn orders(&self, from: u32, limit: u32) -> Vec<OrderView> {
        let page = self.orders.iter().skip(from as usize).take(limit.min(100) as usize);
        page.map(|(id, o)| OrderView { id: id.clone(), order: o.clone() }).collect()
    }
    /// An account's free money here: what `withdraw` would send.
    /// A sponsor's daily cap and what of it today's jobs hold; none if it set no cap.
    pub fn daily_cap(&self, account: AccountId) -> Option<Value> {
        cap_of(&account).map(|c| json!({ "per_day": U128(c.per_day), "used_today": U128(if c.day == now() / DAY_SECS { c.used } else { 0 }) }))
    }

    pub fn balance(&self, account: AccountId) -> U128 {
        U128(self.balance_of(&account))
    }
    /// Everything the contract owes. Monitoring compares it with `ft_balance_of(contract)`.
    pub fn owed(&self) -> U128 {
        U128(self.owed)
    }
}

impl Contract {
    fn register(&mut self, name: String, amount: u128, card: Agent) {
        let plain =
            (1..=MAX_NAME).contains(&name.len()) && name.bytes().all(|b| matches!(b, b'a'..=b'z' | b'0'..=b'9' | b'-'));
        require!(plain, "name: 1-32 of a-z, 0-9 and -");
        require!(!card.skills.is_empty() && card.skills.len() <= MAX_SKILLS, "skills empty or too long");
        require!(is_sha256_hex(&card.materials_hash) && (1..=MAX_SIZE_MB).contains(&card.size_mb), "bad materials");
        require!(card.max_cost.0 > 0, "max_cost must be positive");
        let audit_fee = self.cfg.audit_base.0 + self.cfg.audit_per_mb.0 * card.size_mb as u128;
        require!(amount >= audit_fee + self.cfg.min_deposit.0, "deposit too small");
        self.credit(&self.cfg.operator.clone(), audit_fee);
        self.credit(&card.sponsor, amount - audit_fee);
        let id = format!("{}/{name}", card.sponsor);
        emit(
            "register",
            json!({ "agent": id, "materials_hash": card.materials_hash, "rate": card.rate, "max_cost": card.max_cost, "audit_fee": U128(audit_fee) }),
        );
        self.agents.insert(id, card);
    }

    /// What Agent Market paid for a finished job, forwarded by the operator. Taken once: the job is gone after it.
    fn revenue(&mut self, sender: AccountId, amount: u128, job: String) {
        require!(sender == self.cfg.operator, "revenue comes from the operator");
        let j = self.jobs.remove(&job).expect("no job");
        require!(j.finished, "job not finished");
        self.pay_out(&job, &j, amount);
    }

    /// Shares a customer's `amount` for a finished job: the owner's fee first; then each agent that delivered
    /// exactly its pay (pro rata if the amount falls short); the operator keeps the rest.
    fn pay_out(&mut self, job: &str, j: &Job, amount: u128) {
        let fee = amount * self.cfg.fee_bps as u128 / 10_000;
        let pays: Vec<u128> = j.slots.iter().map(|s| s.pay.0).collect();
        let due: u128 = pays.iter().sum();
        let parts = if amount - fee >= due { pays } else { split(amount - fee, &pays) };
        let rest = amount - fee - parts.iter().sum::<u128>();
        self.credit(&self.cfg.owner.clone(), fee);
        self.credit(&self.cfg.operator.clone(), rest);
        for (s, part) in j.slots.iter().zip(&parts) {
            self.credit(&s.sponsor, *part);
        }
        let paid: Vec<(&String, U128)> = j.slots.iter().zip(&parts).map(|(s, p)| (&s.agent, U128(*p))).collect();
        emit(
            "revenue",
            json!({ "job": job, "amount": U128(amount), "fee": U128(fee), "paid": paid, "operator": U128(rest) }),
        );
    }

    /// Holds a customer's money for the task `brief_hash` names.
    fn place_order(&mut self, customer: AccountId, amount: u128, brief_hash: String) {
        require!(is_sha256_hex(&brief_hash), "bad brief hash");
        require!(amount > self.cfg.overhead.0, "order too small"); // or it could pay no agent at all
        self.orders_placed += 1;
        let id = format!("order-{}", self.orders_placed);
        emit("order", json!({ "order": id, "customer": customer, "amount": U128(amount), "brief_hash": brief_hash }));
        self.orders.insert(id, Order { customer, amount: U128(amount), brief_hash, at: now() });
    }

    /// Ends an order with all its money sent back to the customer. Its job, if one finished, is dropped unpaid.
    fn send_back(&mut self, order: String, why: &str) {
        self.send_back_less(order, why, 0);
    }

    /// Sends an order back to its customer, less `kept` (which the caller credits to someone here).
    fn send_back_less(&mut self, order: String, why: &str, kept: u128) {
        let o = self.orders.remove(&order).expect("no order");
        if let Some(j) = self.jobs.get(&order) {
            require!(j.finished, "job running"); // its holds are still out: finish or close it first
            self.jobs.remove(&order);
        }
        self.send(&o.customer, o.amount.0 - kept);
        emit("refund", json!({ "order": order, "customer": o.customer, "amount": U128(o.amount.0 - kept), "kept": U128(kept), "why": why }));
    }

    /// Sends tokens out of the contract. What the token contract does not take, `on_sent` keeps in the
    /// receiver's balance here: nothing is lost on the way, and nobody has to come for what did arrive.
    fn send(&mut self, to: &AccountId, amount: u128) {
        if amount == 0 {
            return;
        }
        self.owed -= amount;
        ext_ft::ext(self.token.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(TRANSFER_GAS)
            .ft_transfer(to.clone(), U128(amount), None)
            .then(Self::ext(env::current_account_id()).with_static_gas(TRANSFER_GAS).on_sent(to.clone(), U128(amount)))
            .detach();
    }

    fn only(&self, who: &AccountId) {
        require!(&env::predecessor_account_id() == who, "not allowed");
    }
    fn runner(&self) {
        require!(!self.halted, "halted");
        self.only(&self.cfg.runner);
    }
    fn agent_mut(&mut self, id: &String) -> &mut Agent {
        self.agents.get_mut(id).expect("no agent")
    }
    fn agent_view(&self, id: &String, card: &Agent) -> AgentView {
        AgentView { id: id.clone(), card: card.clone(), balance: U128(self.balance_of(&card.sponsor)) }
    }
    fn balance_of(&self, account: &AccountId) -> u128 {
        self.balances.get(account).copied().unwrap_or(0)
    }
    fn set_balance(&mut self, account: &AccountId, amount: u128) {
        if amount == 0 {
            self.balances.remove(account); // frees storage
        } else {
            self.balances.insert(account.clone(), amount);
        }
    }
    fn credit(&mut self, account: &AccountId, amount: u128) {
        if amount > 0 {
            self.set_balance(account, self.balance_of(account) + amount);
        }
    }
}

fn check(cfg: &Config) {
    require!(cfg.fee_bps <= MAX_FEE_BPS, "fee too high");
    require!(cfg.run_secs <= MAX_TIMEOUT_SECS && cfg.pay_secs <= MAX_TIMEOUT_SECS, "timeout too long");
    require!(cfg.delay_secs <= MAX_TIMEOUT_SECS, "delay too long");
}

/// The state as version 3.0.0 kept it: read once, by `migrate`.
#[near(serializers = [borsh])]
struct ConfigV3 {
    owner: AccountId,
    runner: AccountId,
    operator: AccountId,
    fee_bps: u16,
    audit_base: U128,
    audit_per_mb: U128,
    min_deposit: U128,
    overhead: U128,
    overhead_per_agent: U128,
    run_secs: u64,
    pay_secs: u64,
}

#[near(serializers = [borsh])]
struct ContractV3 {
    token: AccountId,
    cfg: ConfigV3,
    balances: LookupMap<AccountId, u128>,
    agents: IterableMap<String, Agent>,
    jobs: LookupMap<String, Job>,
    orders: IterableMap<String, Order>,
    owed: u128,
    registrations: u64,
    orders_placed: u64,
}

/// Splits `amount` pro rata to `weights` (their sum is above `amount`, so above 0).
/// Rounding dust goes to the heaviest share, so the parts always add up to `amount`.
fn split(amount: u128, weights: &[u128]) -> Vec<u128> {
    let total: u128 = weights.iter().sum();
    let mut parts: Vec<u128> = weights.iter().map(|&w| amount * w / total).collect();
    let heaviest = (0..weights.len()).max_by_key(|&i| weights[i]).unwrap();
    parts[heaviest] += amount - parts.iter().sum::<u128>();
    parts
}

/// NEP-297 event, so explorers and indexers can follow the money without our runner.
fn emit(event: &str, data: Value) {
    let e = json!({ "standard": "swarm", "version": "3.1.0", "event": event, "data": data });
    env::log_str(&format!("EVENT_JSON:{e}"));
}

/// A sponsor's daily cap, kept apart from the contract's state (prefix "c"), so adding it needed no migration.
#[near(serializers = [borsh])]
struct Cap {
    per_day: u128,
    day: u64,
    used: u128,
}
fn cap_key(account: &AccountId) -> Vec<u8> {
    [b"c".as_slice(), account.as_bytes()].concat()
}
fn cap_of(account: &AccountId) -> Option<Cap> {
    env::storage_read(&cap_key(account)).map(|b| near_sdk::borsh::from_slice(&b).expect("cap"))
}
/// Counts `hold` against the sponsor's cap for today, if it set one: refuses what would go past it.
fn spend_today(sponsor: &AccountId, hold: u128) {
    let Some(mut c) = cap_of(sponsor) else { return };
    let today = now() / DAY_SECS;
    if c.day != today {
        (c.day, c.used) = (today, 0);
    }
    require!(c.used + hold <= c.per_day, "daily cap reached");
    c.used += hold;
    env::storage_write(&cap_key(sponsor), &near_sdk::borsh::to_vec(&c).expect("cap"));
}

fn now() -> u64 {
    env::block_timestamp() / 1_000_000_000
}

fn is_sha256_hex(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}
