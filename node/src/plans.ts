// The swarm's plans on Agent Market: budgets, not services. The swarm builds the best team that fits the plan;
// a task posted on the board instead gets a bid at the price of exactly the team it needs. One source for the
// listing (scripts/market.ts) and the site (GET /info).
export const PLANS = [
  { name: 'Quick', usd: '3.00', what: 'One or two experts: a focused question.' },
  { name: 'Standard', usd: '10.00', what: 'Up to about five experts: a question across a few fields.' },
  { name: 'Deep', usd: '30.00', what: 'Up to about twelve experts: a broad, many-sided question.' },
] as const;
