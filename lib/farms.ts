// Farm plans v2: per-category playbooks with concrete costs and timelines, derived from the
// protocol's own record (category, chains, TVL, age). No name is special-cased.
//
// Each plan answers what a reader does this week, what it costs, how long it takes, and what
// disqualifies them. Costs scale with the protocol's own TVL band; timelines scale with its age.

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export function chainOf(chains: string[]): string {
  return chains.length > 0 ? chains[0]! : 'its main chain';
}

export function capitalFor(tvl: number): number {
  if (tvl >= 5_000_000_000) return 250;
  if (tvl >= 1_000_000_000) return 150;
  if (tvl >= 100_000_000) return 100;
  if (tvl >= 25_000_000) return 75;
  return 50;
}

export function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 90) return 90;
  if (age < 180) return 75;
  if (age < 365) return 60;
  return 45;
}

/** The category's first action, in words a farmer can follow with a wallet open. */
export function actionFor(category: string | null, name: string, capital: number, chain: string): string {
  const c = (category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC into ${name}'s lending market on ${chain} as collateral.`;
  if (c.includes('leveraged') || c.includes('yield')) return `Provide $${capital} into ${name}'s highest-TVL pool on ${chain} in a balanced 50/50 position.`;
  if (c.includes('dex')) return `Provide $${capital} of liquidity to ${name}'s main pair on ${chain} (the pool holding the most TVL).`;
  if (c.includes('bridge') || c.includes('cross chain')) return `Bridge $${capital} of USDC to ${chain} through ${name}, then make one swap on the far side.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's native asset through ${name} and keep the liquid receipt token.`;
  if (c.includes('perpetual') || c.includes('derivativ')) return `Deposit $${capital} of USDC as margin on ${name} and open one small long at 2x.`;
  if (c.includes('prediction')) return `Fund $${capital} and take one small position on ${name}'s most liquid market.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('vault')) return `Deposit $${capital} into ${name}'s flagship vault on ${chain} and keep the share tokens.`;
  if (c.includes('stable')) return `Mint $${capital} of the stable asset through ${name} on ${chain} and hold it in the app.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s tokenized yield asset on ${chain} and hold it across one full cycle.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover on ${name}'s largest market and keep the policy open ${90} days.`;
  if (c.includes('oracle')) return `Run ${name}'s free data feed reader for a week, then stake $${capital} if a node pool opens.`;
  if (c.includes('launchpad')) return `Join one sale on ${name} with $${capital} and hold the allocation through distribution.`;
  if (c.includes('gaming')) return `Play ${name}'s main game with $${capital} of in-app assets across one full season.`;
  if (c.includes('nft')) return `Trade $${capital} of volume on ${name}'s marketplace across its top collection.`;
  if (c.includes('wallet') || c.includes('infrastructure')) return `Use ${name}'s product weekly with a real workflow, and provide $${capital} of liquidity where it hosts a pool.`;
  if (c.includes('analytics') || c.includes('explorer')) return `Integrate ${name}'s free API into one project, and stake $${capital} if a token-gated tier exists.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

const stepText = (step: FarmStep): string => {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
};

export function farmSteps(
  category: string | null,
  name: string,
  chains: string[],
  tvl: number,
  age: number | null,
): string[] {
  const chain = chainOf(chains);
  const capital = capitalFor(tvl);
  const hold = holdDaysFor(age);
  const action = actionFor(category, name, capital, chain);
  const steps: FarmStep[] = [
    {
      text: `Set up a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: `under $3 of gas for the first transaction`,
      time: `5 minutes`,
    },
    { text: action, cost: `$${capital} of capital plus about $${capital >= 150 ? 8 : 4} of gas`, time: `15 minutes to set up` },
    {
      text: `Make one qualifying action each week: a deposit, a borrow, a swap, or a governance vote in the app.`,
      cost: `about $2 of gas a week`,
      time: `10 minutes a week`,
    },
    {
      text: `Hold the position at least ${hold} days so the activity lands in more than one monthly snapshot.`,
      cost: `the $${capital} stays in the position the whole time`,
      time: `${hold} days`,
    },
    {
      text: `Watch ${name}'s own announcements channel for a points program or a token proposal, and join within its first week.`,
      cost: `no fee to watch; any reward claim is free`,
      time: `5 minutes a week`,
    },
    {
      text: `Before you withdraw, claim rewards only from ${name}'s own site or verified docs page, never from a link in a DM.`,
      cost: `no fee to check, and never pay to claim`,
      time: `10 minutes`,
    },
    {
      text: `Write the wallet address, the dates and every transaction into a farm log so you can repeat or unwind it.`,
      cost: `nothing but the log`,
      time: `5 minutes`,
    },
  ];
  if (age !== null && age < 180) {
    steps.splice(4, 0, {
      text: `${name} is ${age} days old: its deposits are early, so keep the initial position small and add only after the app survives a full month of use.`,
      cost: `no extra capital yet; patience is the cost`,
      time: `one month of watching`,
    });
  }
  return steps.map(stepText);
}
