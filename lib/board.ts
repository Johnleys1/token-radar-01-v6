// Board assembly for token-radar-01 v6.
//
// The board ranks pre-token protocols by the fitted curve's implied value.
// Order is fixed BEFORE ranks are assigned: sort strictly descending by implied
// value (slug ascending breaks ties), then rank 1..N in that order, so a rank
// and a value can never point in opposite directions. The watchlist (40) is
// always in; the remaining rows are the highest-implied pre-token protocols
// outside it, up to BOARD_ROWS. The dashboard payload carries the same rows
// plus the validation evidence, so the page and the board can never disagree.

import {
  ageYears,
  bootstrapRankRanges,
  decideTerms,
  fitCurve,
  fittedValue,
  hasToken,
  isPreToken,
  leaveOneOut,
  peerCohorts,
  peerRateFor,
  walkForward,
  type ExtraTerm,
  type Proto,
  type Snapshot,
  type TermDecision,
} from './curve.ts';
import { DEPOSIT_USD, FARM_DAYS, farmSteps, money, priceFarm, type FarmCosts } from './farm.ts';

export const BOARD_ROWS = 230;
export const WALK_FORWARD_CUTOFF = '2024-02-18';

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  tvl_usd: number;
  category: string | null;
  chains: string[];
  change_7d: number | null;
  listed_at: string | null;
  watchlist: boolean;
  rank_lo: number;
  rank_hi: number;
  peer_launch_rate: number;
  farm: FarmCosts;
}

export interface ValidationReport {
  intercept: number;
  slope: number;
  liveFitN: number;
  preTokenN: number;
  walkForward: {
    curveHit: number;
    curveLogErr: number;
    curveMedAbsErr: number;
    flatHit: number;
    flatLogErr: number;
    flatMedAbsErr: number;
    hitRatio: number;
    trainN: number;
    testN: number;
  };
  leaveOneOut: {
    curveHit: number;
    curveLogErr: number;
    curveMedAbsErr: number;
    flatHit: number;
    flatLogErr: number;
    flatMedAbsErr: number;
    hitRatio: number;
    n: number;
  };
  terms: TermDecision[];
  keptTerms: string[];
  cohorts: Array<{ label: string; protocols: number; withToken: number; launchRate: number }>;
  overallLaunchRate: number;
  bootstrapRefits: number;
}

export interface RadarBuild {
  rows: BoardRow[];
  validation: ValidationReport;
  liveAnchors: Array<{
    slug: string;
    name: string;
    tvl_usd: number;
    mcap_usd: number;
    multiple: number;
    fitted_usd: number;
    category: string | null;
    chains: string[];
  }>;
  counts: {
    protocols: number;
    live: number;
    preToken: number;
    watchlist: number;
    watchlistCovered: number;
  };
  modelLine: string;
  title: string;
}

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
const mult = (x: number): string => `×${x.toFixed(2)}`;

/** Fit the curve, test every term, and assemble the ranked board. */
export function buildRadar(snapshot: Snapshot): RadarBuild {
  const live = snapshot.protocols.filter(hasToken);
  const pre = snapshot.protocols.filter(isPreToken);
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const watchSet = new Set(snapshot.watchlist);

  const { decisions, kept } = decideTerms(live, snapshot.as_of);
  const terms: ExtraTerm[] = kept;
  const wf = walkForward(live, terms, snapshot.as_of);
  const loo = leaveOneOut(live, terms, snapshot.as_of);

  // The final fit uses only the kept terms (here: the pure curve).
  const finalBeta = fitCurve(live, terms, snapshot.as_of);
  const intercept = finalBeta[0];
  const slope = finalBeta[1];

  const cohorts = peerCohorts(snapshot.protocols, snapshot.as_of);
  const overall = snapshot.protocols.filter(hasToken).length / snapshot.protocols.length;

  // Implied value for every pre-token protocol, then the board cut.
  const scored = pre.map((p) => ({
    p,
    implied: Math.max(1, Math.round(fittedValue(finalBeta, p, terms, snapshot.as_of))),
  }));
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : 1));
  const chosen: Array<{ p: Proto; implied: number }> = [];
  const chosenSlugs = new Set<string>();
  for (const row of scored) {
    if (watchSet.has(row.p.slug)) {
      chosen.push(row);
      chosenSlugs.add(row.p.slug);
    }
  }
  for (const row of scored) {
    if (chosen.length >= BOARD_ROWS) break;
    if (chosenSlugs.has(row.p.slug)) continue;
    chosen.push(row);
    chosenSlugs.add(row.p.slug);
  }
  // Re-sort the chosen set strictly by value: ranks follow this order exactly.
  chosen.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : 1));

  const ranges = bootstrapRankRanges(
    chosen.map((r) => r.p.slug),
    bySlug,
    live,
    terms,
    snapshot.as_of,
    200,
  );

  const rows: BoardRow[] = chosen.map((row, idx) => {
    const costs = priceFarm(row.p, row.implied);
    const peerRate = peerRateFor(row.p, cohorts, snapshot.as_of, overall);
    const range = ranges.get(row.p.slug) as { lo: number; hi: number };
    return {
      slug: row.p.slug,
      name: row.p.name,
      rank: idx + 1,
      implied_value_usd: row.implied,
      farm_steps: farmSteps(row.p, row.implied, costs, peerRate),
      tvl_usd: row.p.tvl_usd,
      category: row.p.category,
      chains: row.p.chains,
      change_7d: row.p.change_7d,
      listed_at: row.p.listed_at,
      watchlist: watchSet.has(row.p.slug),
      rank_lo: range.lo,
      rank_hi: range.hi,
      peer_launch_rate: peerRate,
      farm: costs,
    };
  });

  const liveAnchors = live
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd as number,
      multiple: (p.mcap_usd as number) / p.tvl_usd,
      fitted_usd: Math.max(1, Math.round(fittedValue(finalBeta, p, terms, snapshot.as_of))),
      category: p.category,
      chains: p.chains,
    }))
    .sort((a, b) => b.mcap_usd - a.mcap_usd);

  const validation: ValidationReport = {
    intercept,
    slope,
    liveFitN: live.length,
    preTokenN: pre.length,
    walkForward: {
      curveHit: wf.curve.hit,
      curveLogErr: wf.curve.medAbsLogErr,
      curveMedAbsErr: wf.curve.medAbsErr,
      flatHit: wf.flat.hit,
      flatLogErr: wf.flat.medAbsLogErr,
      flatMedAbsErr: wf.flat.medAbsErr,
      hitRatio: wf.hitRatio,
      trainN: wf.trainN,
      testN: wf.testN,
    },
    leaveOneOut: {
      curveHit: loo.curve.hit,
      curveLogErr: loo.curve.medAbsLogErr,
      curveMedAbsErr: loo.curve.medAbsErr,
      flatHit: loo.flat.hit,
      flatLogErr: loo.flat.medAbsLogErr,
      flatMedAbsErr: loo.flat.medAbsErr,
      hitRatio: loo.hitRatio,
      n: loo.testN,
    },
    terms: decisions,
    keptTerms: kept.map((t) => t.key),
    cohorts: cohorts.map((c) => ({ label: c.label, protocols: c.protocols, withToken: c.withToken, launchRate: c.launchRate })),
    overallLaunchRate: overall,
    bootstrapRefits: 200,
  };

  const title =
    `Size Curve Radar — fitted value curve, held-out edge ${mult(wf.hitRatio)} walk-forward, ` +
    `${mult(loo.hitRatio)} leave-one-out, costed farm verdicts in $/hour`;

  return {
    rows,
    validation,
    liveAnchors,
    counts: {
      protocols: snapshot.protocols.length,
      live: live.length,
      preToken: pre.length,
      watchlist: snapshot.watchlist.length,
      watchlistCovered: rows.filter((r) => r.watchlist).length,
    },
    modelLine: `log(mcap) = ${intercept.toFixed(3)} + ${slope.toFixed(3)} · log(TVL), fitted on ${live.length} token protocols`,
    title,
  };
}

/** The gate's own shape, checked before anything is written. */
export function boardIssue(build: RadarBuild, snapshot: Snapshot): string | null {
  const rows = build.rows;
  if (rows.length < 100 || rows.length > 4000) return `board holds ${rows.length} rows, outside 100–4000`;
  const slugs = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.rank !== i + 1) return `row ${r.slug} has rank ${r.rank} at position ${i + 1}`;
    if (i > 0 && rows[i - 1].implied_value_usd < r.implied_value_usd) {
      return `implied value rises from rank ${i} to ${i + 1}`;
    }
    if (slugs.has(r.slug)) return `slug ${r.slug} appears twice`;
    slugs.add(r.slug);
    if (r.implied_value_usd < 1) return `row ${r.slug} has a non-positive implied value`;
    if (!r.name) return `row ${r.slug} has no name`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `row ${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `row ${r.slug} has a farm step of ${t.length} characters`;
    }
  }
  for (const slug of snapshot.watchlist) {
    if (!slugs.has(slug)) return `watchlist slug ${slug} is missing from the board`;
  }
  return null;
}

/** The dashboard's data file: the same rows, validation and anchors the board holds. */
export function dataScript(build: RadarBuild, snapshot: Snapshot): string {
  const payload = {
    title: build.title,
    modelLine: build.modelLine,
    asOf: snapshot.as_of,
    floorUsd: snapshot.floor_usd,
    depositUsd: DEPOSIT_USD,
    farmDays: FARM_DAYS,
    counts: build.counts,
    validation: build.validation,
    rows: build.rows,
    live: build.liveAnchors,
  };
  return `window.RADAR = ${JSON.stringify(payload)};\n`;
}

export { money, pct };
export type { Proto };
export { ageYears };
