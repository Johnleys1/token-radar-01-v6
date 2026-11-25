// Costed farm plans for token-radar-01 v6.
//
// Every board row carries a plan priced in dollars for one fixed deposit size
// ($5,000), so rows are comparable: bridge + gas + DEX fee + slippage + exit,
// against an expected farmer reward modelled as a pro-rata share of the
// protocol's implied value. The reward model is stated on the dashboard, not
// hidden: 5% of a future token supply goes to farmers, shared pro-rata by TVL,
// over a 30-day farm. The verdict is net dollars per active hour. Costs differ
// per row because the chain, the TVL depth, and the category's action count
// differ per row; nothing is copy-pasted across rows.

import type { Proto } from './curve.ts';

export const DEPOSIT_USD = 5000;
export const FARM_DAYS = 30;
export const FARMER_SHARE = 0.05;

/** Typical cost of one simple transaction on a chain, in dollars. */
const GAS_PER_TX: Record<string, number> = {
  Ethereum: 18,
  Arbitrum: 0.5,
  Optimism: 0.4,
  Base: 0.35,
  Binance: 0.25,
  Polygon: 0.15,
  Solana: 0.05,
  Avalanche: 0.6,
  Tron: 1.2,
  Bitcoin: 4,
  'Hyperliquid L1': 0.1,
  Monad: 0.2,
  Gnosis: 0.3,
  Fantom: 0.2,
  Linea: 0.3,
  Scroll: 0.4,
  zkSync: 0.35,
  Blast: 0.3,
  Berachain: 0.25,
  Sui: 0.08,
  Aptos: 0.08,
  Sei: 0.1,
  Near: 0.1,
  Cosmos: 0.2,
  Osmosis: 0.15,
};

/** Cost of bridging the deposit in from Ethereum, in dollars. */
const BRIDGE_IN: Record<string, number> = {
  Ethereum: 0,
  Arbitrum: 8,
  Optimism: 8,
  Base: 7,
  Binance: 9,
  Polygon: 7,
  Solana: 12,
  Avalanche: 10,
  Tron: 11,
  Bitcoin: 25,
  'Hyperliquid L1': 14,
  Monad: 9,
  Gnosis: 8,
  Fantom: 8,
  Linea: 8,
  Scroll: 9,
  zkSync: 9,
  Blast: 8,
  Berachain: 10,
  Sui: 12,
  Aptos: 12,
  Sei: 11,
  Near: 11,
  Cosmos: 13,
  Osmosis: 13,
};

function gasPerTx(chain: string): number {
  return GAS_PER_TX[chain] ?? 2;
}

function bridgeCost(chain: string): number {
  return BRIDGE_IN[chain] ?? 15;
}

/** How many on-chain actions farming this category usually takes. */
export function actionCount(category: string | null): number {
  const c = (category ?? '').toLowerCase();
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged')) return 5;
  if (c.includes('lending') || c.includes('borrow') || c.includes('cdp')) return 4;
  if (c.includes('restaking') || c.includes('liquid staking')) return 3;
  if (c.includes('bridge') || c.includes('cross')) return 3;
  if (c.includes('derivatives') || c.includes('options') || c.includes('perpetual')) return 5;
  return 4;
}

/** The verb a farmer does on this protocol, from its category. */
export function farmVerb(category: string | null): string {
  const c = (category ?? '').toLowerCase();
  if (c.includes('dex')) return 'provide liquidity in its deepest pool';
  if (c.includes('lending') || c.includes('borrow')) return 'supply assets as a lender';
  if (c.includes('yield')) return 'deposit into its vaults';
  if (c.includes('liquid staking') || c.includes('restaking')) return 'stake through its staking flow';
  if (c.includes('derivatives') || c.includes('perpetual')) return 'open a small hedged position';
  if (c.includes('bridge')) return 'bridge volume through it in small tranches';
  if (c.includes('leveraged')) return 'open a modest leveraged position';
  if (c.includes('options')) return 'write covered options';
  if (c.includes('rwa')) return 'hold its tokenised asset position';
  return 'use its core product with real volume';
}

export interface FarmCosts {
  chain: string;
  actions: number;
  bridgeUsd: number;
  gasUsd: number;
  dexFeeUsd: number;
  slippageUsd: number;
  exitUsd: number;
  totalCostUsd: number;
  /** Expected farmer reward under the stated 5%-pro-rata model, in dollars. */
  expectedRewardUsd: number;
  netUsd: number;
  /** Active hours the 30-day farm takes. */
  hours: number;
  /** Net dollars per active hour: the verdict. */
  netPerHour: number;
  /** The airdrop value at which the farm breaks even, in dollars. */
  breakEvenUsd: number;
  /** The implied token value at which the farm breaks even, in dollars. */
  breakEvenImpliedUsd: number;
}

const money = (n: number): string => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Price one row's farm. Every figure derives from the row's own chain, TVL and implied value. */
export function priceFarm(p: Proto, impliedUsd: number): FarmCosts {
  const chain = p.chains[0] ?? 'Ethereum';
  const actions = actionCount(p.category);
  const bridgeUsd = bridgeCost(chain);
  const gasUsd = gasPerTx(chain) * actions;
  const dexFeeUsd = DEPOSIT_USD * 0.003;
  // Slippage falls with pool depth: a $5,000 trade against the protocol's TVL.
  const slipRate = Math.min(0.03, Math.max(0.0005, 200_000 / p.tvl_usd));
  const slippageUsd = DEPOSIT_USD * slipRate;
  const exitUsd = gasPerTx(chain) * 2 + DEPOSIT_USD * 0.001;
  const totalCostUsd = bridgeUsd + gasUsd + dexFeeUsd + slippageUsd + exitUsd;
  const expectedRewardUsd = FARMER_SHARE * impliedUsd * (DEPOSIT_USD / p.tvl_usd);
  const netUsd = expectedRewardUsd - totalCostUsd;
  const hours = 3 + actions;
  const netPerHour = netUsd / hours;
  const breakEvenUsd = totalCostUsd;
  const breakEvenImpliedUsd = (totalCostUsd * p.tvl_usd) / (FARMER_SHARE * DEPOSIT_USD);
  return {
    chain,
    actions,
    bridgeUsd,
    gasUsd,
    dexFeeUsd,
    slippageUsd,
    exitUsd,
    totalCostUsd,
    expectedRewardUsd,
    netUsd,
    hours,
    netPerHour,
    breakEvenUsd,
    breakEvenImpliedUsd,
  };
}

/** The concrete steps for one row: 6 strings, each priced from this row's costs. */
export function farmSteps(p: Proto, impliedUsd: number, costs: FarmCosts, peerRate: number): string[] {
  const verb = farmVerb(p.category);
  const category = p.category ?? 'uncategorised';
  const chainList = p.chains.length > 3 ? `${p.chains.slice(0, 3).join(', ')} and ${p.chains.length - 3} more` : p.chains.join(', ');
  const verdict =
    costs.netPerHour >= 0
      ? `Verdict: farming nets about ${money(costs.netUsd)} over ${costs.hours} active hours, ${money(costs.netPerHour)} per hour, on a ${money(DEPOSIT_USD)} deposit.`
      : `Verdict: farming loses about ${money(Math.abs(costs.netUsd))} over ${costs.hours} active hours, ${money(costs.netPerHour)} per hour, on a ${money(DEPOSIT_USD)} deposit — only farm it for the points, not the dollars.`;
  return [
    `Move ${money(DEPOSIT_USD)} onto ${costs.chain} for ${p.name}: bridging in costs about ${money(costs.bridgeUsd)}, and the protocol runs on ${chainList}. Keep the deposit in one wallet so points accrue to a single address.`,
    `${verb[0].toUpperCase()}${verb.slice(1)} on ${costs.chain} with the full ${money(DEPOSIT_USD)}: the swap costs a 0.30% DEX fee of ${money(costs.dexFeeUsd)} and about ${money(costs.slippageUsd)} of slippage against $${p.tvl_usd.toLocaleString('en-US')} of TVL.`,
    `Confirm the position is live in the ${category} flow and that points or shares are accruing; the ${costs.actions} on-chain actions behind this plan cost about ${money(costs.gasUsd)} of gas on ${costs.chain}.`,
    `Farm for ${FARM_DAYS} days and check weekly: peers tracked as long as ${p.name} record a token about ${(peerRate * 100).toFixed(1)}% of the time, so treat the token as a maybe, never a promise, and never add funds to chase points.`,
    `Exit in two transactions (unstake, then swap back) for about ${money(costs.exitUsd)} all-in; total farm cost is ${money(costs.totalCostUsd)} across bridge, gas, fees, slippage and exit.`,
    `Break-even: the farm needs an airdrop worth ${money(costs.breakEvenUsd)}, reached only if the token launches near ${money(costs.breakEvenImpliedUsd)} of implied value, against this row's ${money(impliedUsd)}. ${verdict}`,
  ];
}

export { money };
