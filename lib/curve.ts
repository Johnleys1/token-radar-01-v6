// Size-curve value model for token-radar-01 v6.
//
// The model is a pooled log-log OLS fit of log(market cap) on log(TVL) over the
// protocols that already record a token. A flat multiple would force a slope of
// 1; the fitted slope is far from 1, so a flat multiple misprices both ends of
// the size range. Every extra term (growth, maturity, breadth) is kept only when
// it improves the hit rate AND the median absolute log error on BOTH held-out
// tests (walk-forward and leave-one-out); otherwise it is dropped and the pure
// curve stands. Nothing here reads the network, the clock, or Math.random: the
// bootstrap below uses a fixed-seed generator, so two runs are byte-identical.

export interface Proto {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  floor_usd: number;
  protocols: Proto[];
  watchlist: string[];
}

export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as {
    as_of: string;
    floor_usd: number;
    protocols: Proto[];
    watchlist: string[];
  };
  if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error('snapshot: protocols and watchlist must be arrays');
  }
  return { as_of: raw.as_of, floor_usd: raw.floor_usd, protocols: raw.protocols, watchlist: raw.watchlist };
}

/** A protocol records a token with a positive market cap: it anchors the fit. */
export function hasToken(p: Proto): boolean {
  return p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0;
}

/** A protocol with no usable token record: the board's subject. */
export function isPreToken(p: Proto): boolean {
  return !hasToken(p);
}

const ln = Math.log;

/** Age in years from the snapshot date; null when the listing date is unknown. */
export function ageYears(p: Proto, asOf: string): number | null {
  if (p.listed_at === null) return null;
  const days = (Date.parse(asOf) - Date.parse(p.listed_at)) / 86_400_000;
  return days / 365.25;
}

/** One extra regressor: a name, a value per protocol, and a plain-English gloss. */
export interface ExtraTerm {
  key: string;
  label: string;
  value: (p: Proto, asOf: string) => number;
}

export const GROWTH_TERM: ExtraTerm = {
  key: 'growth',
  label: '7-day TVL change (change_7d, 0 when unreported)',
  value: (p) => p.change_7d ?? 0,
};

export const MATURITY_TERM: ExtraTerm = {
  key: 'maturity',
  label: 'protocol age in years from listed_at (0 when unknown)',
  value: (p, asOf) => ageYears(p, asOf) ?? 0,
};

export const BREADTH_TERM: ExtraTerm = {
  key: 'breadth',
  label: 'number of chains the protocol runs on',
  value: (p) => p.chains.length,
};

/**
 * Ordinary least squares for log(mcap) = b0 + b1*log(TVL) + sum bk*term_k.
 * Solved through the normal equations with Gaussian elimination and partial
 * pivoting; the design is tiny (at most 5 columns), so this is exact enough.
 */
export function fitCurve(rows: Proto[], terms: ExtraTerm[], asOf: string): number[] {
  const k = 2 + terms.length;
  const design = rows.map((p) => [1, ln(p.tvl_usd), ...terms.map((t) => t.value(p, asOf))]);
  const target = rows.map((p) => ln(p.mcap_usd as number));
  const a: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const b: number[] = new Array<number>(k).fill(0);
  for (let i = 0; i < rows.length; i++) {
    for (let r = 0; r < k; r++) {
      b[r] += design[i][r] * target[i];
      for (let c = 0; c < k; c++) a[r][c] += design[i][r] * design[i][c];
    }
  }
  for (let col = 0; col < k; col++) {
    let pivot = col;
    for (let r = col + 1; r < k; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    const tmpRow = a[col]; a[col] = a[pivot]; a[pivot] = tmpRow;
    const tmpB = b[col]; b[col] = b[pivot]; b[pivot] = tmpB;
    for (let r = col + 1; r < k; r++) {
      const f = a[r][col] / a[col][col];
      for (let c = col; c < k; c++) a[r][c] -= f * a[col][c];
      b[r] -= f * b[col];
    }
  }
  const beta = new Array<number>(k).fill(0);
  for (let r = k - 1; r >= 0; r--) {
    let v = b[r];
    for (let c = r + 1; c < k; c++) v -= a[r][c] * beta[c];
    beta[r] = v / a[r][r];
  }
  return beta;
}

/** Fitted market cap for one protocol under a coefficient vector. */
export function fittedValue(beta: number[], p: Proto, terms: ExtraTerm[], asOf: string): number {
  let x = beta[0] + beta[1] * ln(p.tvl_usd);
  for (let i = 0; i < terms.length; i++) x += beta[2 + i] * terms[i].value(p, asOf);
  return Math.exp(x);
}

export function median(values: number[]): number {
  const s = [...values].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

export function medianMultiple(rows: Proto[]): number {
  return median(rows.map((p) => (p.mcap_usd as number) / p.tvl_usd));
}

export interface EvalScores {
  /** Share of predictions within a factor of 2 of the true market cap. */
  hit: number;
  /** Median |predicted - actual| / actual. */
  medAbsErr: number;
  /** Median |log predicted - log actual|. */
  medAbsLogErr: number;
  n: number;
}

export function evalCurve(rows: Proto[], beta: number[], terms: ExtraTerm[], asOf: string): EvalScores {
  let hits = 0;
  const errs: number[] = [];
  const logErrs: number[] = [];
  for (const p of rows) {
    const pred = fittedValue(beta, p, terms, asOf);
    const actual = p.mcap_usd as number;
    if (pred >= actual / 2 && pred <= actual * 2) hits++;
    errs.push(Math.abs(pred - actual) / actual);
    logErrs.push(Math.abs(ln(pred) - ln(actual)));
  }
  return { hit: hits / rows.length, medAbsErr: median(errs), medAbsLogErr: median(logErrs), n: rows.length };
}

export function evalFlat(rows: Proto[], multiple: number): EvalScores {
  let hits = 0;
  const errs: number[] = [];
  const logErrs: number[] = [];
  for (const p of rows) {
    const pred = multiple * p.tvl_usd;
    const actual = p.mcap_usd as number;
    if (pred >= actual / 2 && pred <= actual * 2) hits++;
    errs.push(Math.abs(pred - actual) / actual);
    logErrs.push(Math.abs(ln(pred) - ln(actual)));
  }
  return { hit: hits / rows.length, medAbsErr: median(errs), medAbsLogErr: median(logErrs), n: rows.length };
}

export const WALK_FORWARD_CUTOFF = '2024-02-18';

export interface BlindTest {
  curve: EvalScores;
  flat: EvalScores;
  /** Hit-rate ratio of the curve over the flat multiple: the edge, as a multiplier. */
  hitRatio: number;
  trainN: number;
  testN: number;
}

/**
 * Walk-forward: fit on token protocols first tracked before the cutoff, test on
 * those first tracked on or after it. Protocols with no tracking date cannot be
 * placed on either side of the cutoff, so they sit out of this test.
 */
export function walkForward(live: Proto[], terms: ExtraTerm[], asOf: string): BlindTest {
  const train = live.filter((p) => p.listed_at !== null && p.listed_at < WALK_FORWARD_CUTOFF);
  const test = live.filter((p) => p.listed_at !== null && p.listed_at >= WALK_FORWARD_CUTOFF);
  const beta = fitCurve(train, terms, asOf);
  const curve = evalCurve(test, beta, terms, asOf);
  const flat = evalFlat(test, medianMultiple(train));
  return { curve, flat, hitRatio: curve.hit / flat.hit, trainN: train.length, testN: test.length };
}

/** Leave-one-out: refit on all but one token protocol, predict the held-out one. */
export function leaveOneOut(live: Proto[], terms: ExtraTerm[], asOf: string): BlindTest {
  let hits = 0;
  let flatHits = 0;
  const logErrs: number[] = [];
  const flatLogErrs: number[] = [];
  const errs: number[] = [];
  const flatErrs: number[] = [];
  for (let i = 0; i < live.length; i++) {
    const rest = live.filter((_, j) => j !== i);
    const held = live[i];
    const beta = fitCurve(rest, terms, asOf);
    const pred = fittedValue(beta, held, terms, asOf);
    const flatPred = medianMultiple(rest) * held.tvl_usd;
    const actual = held.mcap_usd as number;
    if (pred >= actual / 2 && pred <= actual * 2) hits++;
    if (flatPred >= actual / 2 && flatPred <= actual * 2) flatHits++;
    logErrs.push(Math.abs(ln(pred) - ln(actual)));
    flatLogErrs.push(Math.abs(ln(flatPred) - ln(actual)));
    errs.push(Math.abs(pred - actual) / actual);
    flatErrs.push(Math.abs(flatPred - actual) / actual);
  }
  const curve: EvalScores = { hit: hits / live.length, medAbsErr: median(errs), medAbsLogErr: median(logErrs), n: live.length };
  const flat: EvalScores = { hit: flatHits / live.length, medAbsErr: median(flatErrs), medAbsLogErr: median(flatLogErrs), n: live.length };
  return { curve, flat, hitRatio: curve.hit / flat.hit, trainN: live.length - 1, testN: live.length };
}

export interface TermDecision {
  key: string;
  label: string;
  kept: boolean;
  /** Why, in one line: which test the term failed or passed. */
  reason: string;
  wfHit: number;
  wfLogErr: number;
  looHit: number;
  looLogErr: number;
}

/**
 * Keep/drop per term, on two blind tests. A term is kept only when it beats the
 * pure curve on hit rate AND on median absolute log error in BOTH tests. One
 * failed comparison drops the term: a term that only helps in-sample is noise.
 */
export function decideTerms(live: Proto[], asOf: string): { decisions: TermDecision[]; kept: ExtraTerm[] } {
  const baseWf = walkForward(live, [], asOf);
  const baseLoo = leaveOneOut(live, [], asOf);
  const decisions: TermDecision[] = [];
  const kept: ExtraTerm[] = [];
  for (const term of [GROWTH_TERM, MATURITY_TERM, BREADTH_TERM]) {
    const wf = walkForward(live, [term], asOf);
    const loo = leaveOneOut(live, [term], asOf);
    const betterWf = wf.curve.hit > baseWf.curve.hit && wf.curve.medAbsLogErr < baseWf.curve.medAbsLogErr;
    const betterLoo = loo.curve.hit > baseLoo.curve.hit && loo.curve.medAbsLogErr < baseLoo.curve.medAbsLogErr;
    const keep = betterWf && betterLoo;
    if (keep) kept.push(term);
    const reason = keep
      ? 'kept: beats the pure curve on hit rate and log error in both blind tests'
      : !betterWf && !betterLoo
        ? 'dropped: helps on neither blind test'
        : !betterWf
          ? 'dropped: fails the walk-forward test (hit rate or log error worse than the pure curve)'
          : 'dropped: fails the leave-one-out test (hit rate or log error worse than the pure curve)';
    decisions.push({
      key: term.key,
      label: term.label,
      kept: keep,
      reason,
      wfHit: wf.curve.hit,
      wfLogErr: wf.curve.medAbsLogErr,
      looHit: loo.curve.hit,
      looLogErr: loo.curve.medAbsLogErr,
    });
  }
  return { decisions, kept };
}

/** A small deterministic generator (mulberry32): the bootstrap never touches Math.random. */
export function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Rank range per board row from refitting the curve on resampled token
 * protocols (200 refits, sampling with replacement). Each refit re-ranks the
 * whole board; the row's range is its lowest and highest rank across refits.
 * Wide ranges are honest: the curve is fitted, not certain.
 */
export function bootstrapRankRanges(
  boardSlugs: string[],
  bySlug: Map<string, Proto>,
  live: Proto[],
  terms: ExtraTerm[],
  asOf: string,
  refits = 200,
): Map<string, { lo: number; hi: number }> {
  const rand = seededRng(20261125);
  const lows = new Map<string, number>();
  const highs = new Map<string, number>();
  for (const slug of boardSlugs) {
    lows.set(slug, Number.POSITIVE_INFINITY);
    highs.set(slug, 0);
  }
  for (let r = 0; r < refits; r++) {
    const sample: Proto[] = [];
    for (let i = 0; i < live.length; i++) sample.push(live[Math.floor(rand() * live.length)]);
    const beta = fitCurve(sample, terms, asOf);
    const scored = boardSlugs.map((slug) => {
      const p = bySlug.get(slug) as Proto;
      return { slug, value: fittedValue(beta, p, terms, asOf) };
    });
    scored.sort((a, b) => b.value - a.value || (a.slug < b.slug ? -1 : 1));
    scored.forEach((row, idx) => {
      const rank = idx + 1;
      if (rank < (lows.get(row.slug) as number)) lows.set(row.slug, rank);
      if (rank > (highs.get(row.slug) as number)) highs.set(row.slug, rank);
    });
  }
  const out = new Map<string, { lo: number; hi: number }>();
  for (const slug of boardSlugs) out.set(slug, { lo: lows.get(slug) as number, hi: highs.get(slug) as number });
  return out;
}

export interface AgeCohort {
  label: string;
  minAge: number;
  maxAge: number | null;
  protocols: number;
  withToken: number;
  /** Share of the cohort's protocols that record a token: the peers' record. */
  launchRate: number;
}

/**
 * Token odds from the peers' record: among protocols first tracked in the same
 * age band, what share records a token today? The bands rise monotonically in
 * this snapshot (young protocols rarely record one, old ones often do), so the
 * rate is a usable, honestly-labelled peer calibration — not a prediction.
 */
export function peerCohorts(protocols: Proto[], asOf: string): AgeCohort[] {
  const bands: Array<{ label: string; minAge: number; maxAge: number | null }> = [
    { label: 'tracked under 1 year', minAge: 0, maxAge: 1 },
    { label: 'tracked 1–2 years', minAge: 1, maxAge: 2 },
    { label: 'tracked 2–4 years', minAge: 2, maxAge: 4 },
    { label: 'tracked 4+ years', minAge: 4, maxAge: null },
  ];
  return bands.map((band) => {
    const members = protocols.filter((p) => {
      const age = ageYears(p, asOf);
      if (age === null) return false;
      return age >= band.minAge && (band.maxAge === null || age < band.maxAge);
    });
    const withToken = members.filter((p) => hasToken(p)).length;
    return {
      label: band.label,
      minAge: band.minAge,
      maxAge: band.maxAge,
      protocols: members.length,
      withToken,
      launchRate: members.length === 0 ? 0 : withToken / members.length,
    };
  });
}

/** The peer launch rate for one protocol's age band (overall rate when undated). */
export function peerRateFor(p: Proto, cohorts: AgeCohort[], asOf: string, overall: number): number {
  const age = ageYears(p, asOf);
  if (age === null) return overall;
  for (const c of cohorts) {
    if (age >= c.minAge && (c.maxAge === null || age < c.maxAge)) return c.launchRate;
  }
  return overall;
}
